const fs = require('fs');
const path = require('path');
const {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, VIEW_MARGIN,
  MAX_PLAYERS, ROOM_EMPTY_TIMEOUT_MS,
  TICK_MS, BROADCAST_MS, ATTACK_SPEED_MULT, ANIMATIONS, KNIGHT_ANIMATIONS,
  DAYTIME_MS, NIGHTTIME_MS, INTERMISSION_MS, END_GAME_MS
} = require('./config');
const SpatialGrid = require('./spatial-grid');
const playerMod = require('./player');
const zombieMod = require('./zombie');
const zombieAi = require('./zombie-ai');
const physics = require('./physics');
const sword = require('./sword');
const expMod = require('./exp');
const bp = require('./binary-protocol');
const db = require('./db');

const DIAG_LOG = path.join(__dirname, '..', 'Workflow', 'diag-log.json');

class Room {
  constructor(id) {
    this.id = id;
    this.io = null;
    this.players = {};
    this.zombies = zombieMod.initZombies(this.players);
    this.grid = new SpatialGrid(120, WORLD_W, WORLD_H);
    this.lastBroadcast = 0;
    this.lastEmitTime = 0;
    this.currentServerLevel = 0;
    this._playerList = [];
    this._viewZ = [];
    this._emptyTimeout = null;
    this._roundSaved = false;
    this._persistedExp = new Map();
    this.matchPhase = 'waiting';
    this.phaseTimer = 0;
    this.currentWave = 0;
    this.matchStarted = false;
    this._lobbyOrder = [];
    this._endGameReady = new Set();
    this._lastEndGameBroadcast = 0;
    this._joinQueue = [];
    this._postGameWaiting = false;
  }

  setIo(io) { this.io = io; }
  getPlayerCount() { return Object.keys(this.players).length; }
  isEmpty() { return this.getPlayerCount() === 0; }

  getLobbyPlayers() {
    return this._lobbyOrder.map(id => {
      const p = this.players[id];
      if (!p) return null;
      return { id, name: p.name, accountType: p.accountType || 'guest', level: p.lvl || 1, exp: p.exp || 0 };
    }).filter(Boolean);
  }

  getFilteredLobbyPlayers() {
    const all = this.getLobbyPlayers();
    if (this._endGameReady.size > 0 && this.matchPhase !== 'waiting') {
      return all.filter(p => this._endGameReady.has(p.id) || !this.players[p.id]?.isSpectator);
    }
    return all;
  }

  _diag(id, action, extra = {}) {
    const p = this.players[id];
    if (!p || !p.name || !p.name.toLowerCase().includes('diag')) return;
    try {
      const entry = JSON.stringify({
        t: Date.now(), name: p.name, id,
        action, matchPhase: this.matchPhase, phaseTimer: this.phaseTimer,
        alive: p.alive, isSpectator: p.isSpectator,
        inQueue: this._joinQueue.includes(id),
        queuePos: this._joinQueue.indexOf(id),
        activeCount: this.getActivePlayerCount(),
        ...extra
      }) + '\n';
      fs.appendFileSync(DIAG_LOG, entry);
    } catch (e) { /* ignore file errors */ }
  }

  addPlayer(id, name, accountType, accountId) {
    playerMod.addPlayer(id, name, this.players, this.zombies, accountType, accountId);
    const isActive = this.matchPhase !== 'waiting' && this.matchPhase !== 'ended';
    if (isActive || this.matchPhase === 'ended') {
      const p = this.players[id];
      p.isSpectator = true;
      p.alive = false;
    }
    if (this.matchPhase === 'waiting') {
      let activeCount = 0;
      for (const pid in this.players) {
        if (!this.players[pid].isSpectator) activeCount++;
      }
      if (activeCount > MAX_PLAYERS) {
        const p = this.players[id];
        p.isSpectator = true;
        p.alive = false;
      }
    }
    this._diag(id, 'addPlayer', { isActive, accountType });
    this._broadcastQueueUpdate();
    zombieAi.recalcAllZombieTargets(this.zombies, this.players);
    if (!this._lobbyOrder.includes(id)) this._lobbyOrder.push(id);
    if (this._emptyTimeout) { clearTimeout(this._emptyTimeout); this._emptyTimeout = null; }
    return true;
  }

  removePlayer(id) {
    const p = this.players[id];
    if (!p) return;
    const wasActive = !p.isSpectator;
    this._diag(id, 'removePlayer', { wasActive, willPromote: wasActive });
    delete this.players[id];
    this._lobbyOrder = this._lobbyOrder.filter(oid => oid !== id);
    this._joinQueue = this._joinQueue.filter(qid => qid !== id);
    this._broadcastQueueUpdate();
    if (wasActive) this._promoteFromQueue();
    if (this.isEmpty()) {
      if (this.matchPhase === 'ended') {
        this._timerEndReset();
      } else if (!this._emptyTimeout) {
        this._emptyTimeout = setTimeout(() => {
          if (this.isEmpty()) {
            this.zombies.length = 0;
            this.grid.clear();
          }
        }, ROOM_EMPTY_TIMEOUT_MS);
      }
    }
  }

  handleInput(id, data) {
    const p = this.players[id];
    if (!p || p.isSpectator) return;
    p.input = { dx: data.dx, dy: data.dy };
    if (typeof data.angle === 'number') p.facingAngle = data.angle;
  }

  handleAttack(id, facingAngle) {
    const p = this.players[id];
    if (!p || !p.alive || p.isSpectator || p.attackCooldown > 0 || p.attacking) return;
    const anim = p.playerClass === 'knight'
      ? KNIGHT_ANIMATIONS?.attack
      : ANIMATIONS[p.currentItem]?.attack;
    if (!anim) return;
    const kfData = p.playerClass === 'knight' ? anim.knight_sword : anim;
    if (!kfData || kfData.keyframes.length < 2) return;
    const kfAnim = p.playerClass === 'knight'
      ? { keyframes: kfData.keyframes, segments: anim.segments }
      : anim;
    if (typeof facingAngle === 'number') p.facingAngle = facingAngle;
    p.attacking = true;
    p.attackFrame = 0;
    p.attackAnim = kfAnim;
    p.attackHitIds = [];
    p.attackLockedAngle = p.facingAngle;
    p.attackStartTime = Date.now();
    p.prevCf = -1;
    this.io.to(id).emit('attackStart', { lockedAngle: p.attackLockedAngle });
  }

  handleEquip(id, slot) {
    const p = this.players[id];
    if (!p || !p.alive) return;
    if (slot >= 0 && slot < p.inventory.length) {
      p.currentItem = p.inventory[slot];
      playerMod.recalcStats(p);
      this.io.to('room:' + this.id).emit('playerInfo', playerMod.playerInfoObj(p));
    }
  }

  respawnPlayer(id) {
    playerMod.respawnPlayer(id, this.players, this.zombies);
    this._roundSaved = false;
    this.io.to(id).emit('respawned');
  }

  startMatch(fromEnded) {
    this.matchStarted = true;
    const isRestart = this._postGameWaiting;
    this._postGameWaiting = false;
    this.currentWave = 1;
    this.matchPhase = 'daytime';
    this.phaseTimer = DAYTIME_MS;
    this.zombies.length = 0;
    this.grid.clear();
    const readySet = this._endGameReady || new Set();
    let firstReady = null;
    for (const id in this.players) {
      if (readySet.has(id)) { firstReady = this.players[id]; break; }
    }
    for (const id in this.players) {
      const p = this.players[id];
      if (readySet.size > 0 && !readySet.has(id) && p.isSpectator) {
        p.isSpectator = true;
        p.alive = false;
        if (firstReady) { p.x = firstReady.x; p.y = firstReady.y; }
      } else if (readySet.size > 0 || !isRestart) {
        p.isSpectator = false;
        p.lvl = 1; p.exp = 0; p.gold = 0;
        this._persistedExp.delete(p.id);
        playerMod.recalcStats(p);
        if (!p.alive) playerMod.respawnPlayer(id, this.players, this.zombies);
      }
    }
    // Enforce MAX_PLAYERS active limit
    let activeCount = 0;
    for (const id in this.players) {
      const p = this.players[id];
      if (!p.isSpectator) {
        activeCount++;
        if (activeCount > MAX_PLAYERS) {
          p.isSpectator = true;
          p.alive = false;
          console.log(`[room ${this.id}] enforce demoted ${id.slice(0,12)}`);
        }
      }
    }
    console.log(`[room ${this.id}] sm final active=${activeCount}`);
    this._promoteFromQueue();
    zombieAi.recalcAllZombieTargets(this.zombies, this.players);
    const matchData = { phase: 'daytime', timer: DAYTIME_MS, wave: 1 };
    if (readySet.size > 0) {
      const active = Object.keys(this.players).filter(id => !this.players[id].isSpectator);
      matchData.readyPlayers = active;
    }
    for (const id in this.players) {
      if (!this.players[id].isSpectator) {
        this.io.to('room:' + this.id).emit('playerInfo', playerMod.playerInfoObj(this.players[id]));
      }
    }
    for (const id in this.players) {
      if (this.players[id].isSpectator) {
        this.io.to('room:' + this.id).emit('playerInfo', playerMod.playerInfoObj(this.players[id]));
      }
    }
    this.io.to('room:' + this.id).emit('matchPhase', matchData);
    this._joinQueue = this._joinQueue.filter(id => this.players[id]?.isSpectator);
  }

  handleStartMatch(socketId) {
    const p = this.players[socketId];
    if (!p || p.isSpectator) return;
    if (this._endGameReady.size > 0 && !this._endGameReady.has(socketId)) {
    }
    if (this.matchPhase !== 'waiting' && !(this.matchPhase === 'ended' && this._allPlayersReady())) return;
    this.startMatch(this.matchPhase === 'ended');
  }

  _advancePhase() {
    switch (this.matchPhase) {
      case 'daytime':
        try { fs.appendFileSync(DIAG_LOG, JSON.stringify({ t: Date.now(), action: 'daytime→nighttime', playerCount: Object.keys(this.players).length }) + '\n'); } catch (e) {}
        this.matchPhase = 'nighttime';
        this.phaseTimer = NIGHTTIME_MS;
        this.io.to('room:' + this.id).emit('matchPhase', { phase: 'nighttime', timer: NIGHTTIME_MS, wave: this.currentWave });
        break;
      case 'nighttime': {
        const anyAlive = Object.values(this.players).some(p => p.alive);
        if (!anyAlive) { this._endMatch(); return; }
        this.matchPhase = 'waveOver';
        this.phaseTimer = 0;
        this.io.to('room:' + this.id).emit('matchPhase', { phase: 'waveOver', timer: 0, wave: this.currentWave });
        break;
      }
      case 'waveOver': {
        this.matchPhase = 'intermission';
        this.phaseTimer = INTERMISSION_MS;
        this.io.to('room:' + this.id).emit('matchPhase', { phase: 'intermission', timer: INTERMISSION_MS, wave: this.currentWave });
        break;
      }
      case 'intermission': {
        for (const id in this.players) {
          if (!this.players[id].alive && !this.players[id].isSpectator) {
            this._diag(id, 'intermission→daytime_respawn', {});
            playerMod.respawnPlayer(id, this.players, this.zombies);
            this.io.to(id).emit('respawned');
          } else {
            const p = this.players[id];
            this._diag(id, 'intermission→daytime_skip', { reason: p.alive ? 'already alive' : 'is spectator', alive: p.alive, isSpectator: p.isSpectator });
          }
        }
        this.currentWave++;
        this.matchPhase = 'daytime';
        this.phaseTimer = DAYTIME_MS;
        this.io.to('room:' + this.id).emit('matchPhase', { phase: 'daytime', timer: DAYTIME_MS, wave: this.currentWave });
        break;
      }
    }
  }

  _endMatch() {
    this.matchPhase = 'ended';
    this.phaseTimer = END_GAME_MS;
    this._endGameReady = new Set();
    this._postGameWaiting = true;
    this._roundSaved = false;
    this._saveRound();
    this._roundSaved = true;
    this.io.to('room:' + this.id).emit('matchEnd', {
      wave: this.currentWave,
      timer: END_GAME_MS,
      serverLevel: this._computeServerLevel(),
      playerStats: this._getSortedPlayerStats(),
      lobbyPlayers: this.getLobbyPlayers()
    });
    this.io.to('room:' + this.id).emit('matchPhase', { phase: 'ended', timer: END_GAME_MS, wave: this.currentWave });
    this._broadcastQueueUpdate();
  }

  resetMatch() {
    this.matchPhase = 'waiting';
    this.phaseTimer = 0;
    this.currentWave = 0;
    this.matchStarted = false;
    this._roundSaved = false;
    this._endGameReady = new Set();
    this._lastEndGameBroadcast = 0;
    this._lobbyOrder = Object.keys(this.players);
    this.zombies = zombieMod.initZombies(this.players);
    this.grid.clear();
    for (const id in this.players) {
      if (!this.players[id].alive) playerMod.respawnPlayer(id, this.players, this.zombies);
    }
    this.io.to('room:' + this.id).emit('matchReset');
  }

  getPlayerInfoObj(id) {
    const p = this.players[id];
    return p ? playerMod.playerInfoObj(p) : null;
  }

  setFullscreen(id, enabled) { const p = this.players[id]; if (p) p.fullscreen = !!enabled; }

  setCameraZoom(id, opts) { playerMod.setCameraZoom(id, this.players, opts); }

  toggleGodMode(id) {
    const p = this.players[id];
    if (p) p.godMode = !p.godMode;
    return p ? p.godMode : false;
  }

  killAllMobs() {
    for (const z of this.zombies) z.alive = false;
  }

  _testAdvancePhase() {
    if (this.matchPhase === 'ended') { this._timerEndReset(); return; }
    this.killAllMobs();
    this._advancePhase();
    if (this.matchPhase === 'waveOver') {
      this._advancePhase();
    }
  }

  emitEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hitConfirm': this.io.to(e.to).emit('hitConfirm', { targetId: e.targetId, dmg: e.dmg, x: e.x, y: e.y }); break;
        case 'gotHit': this.io.to(e.to).emit('gotHit', { attackerId: e.attackerId, dmg: e.dmg, health: e.health }); break;
        case 'eliminated': this.io.to(e.to).emit('eliminated', { kills: e.kills }); break;
        case 'zombieMerge': this.io.to('room:' + this.id).emit('zombieMerge', { x: e.x, y: e.y }); break;
        case 'zombieKilled': this._awardExp(e.playerId, e.zombieLvl); break;
        case 'zombieAttackStart': this.io.to(e.to).emit('zombieAttackStart', { zombieId: e.zombieId }); break;
      }
    }
  }

  _awardExp(playerId, zombieLvl) {
    const p = this.players[playerId];
    if (!p || !p.alive || p.isSpectator) return;
    p.exp += expMod.getExpForKill(zombieLvl);
    p.gold += expMod.getGoldForKill(zombieLvl);
    const result = expMod.fromCumulativeExp(p.exp);
    p.lvl = result.level;
    this.io.to(playerId).emit('accountUpdate', { exp: result.exp, level: p.lvl, expToNext: expMod.getExpToNext(p.lvl), gold: p.gold });
  }

  _saveRound() {
    const updateStmt = db.prepare('UPDATE accounts SET cumulative_exp = cumulative_exp + ? WHERE id = ?');
    for (const id in this.players) {
      const p = this.players[id];
      if (p.isSpectator || !p.accountId || p.exp <= 0) continue;
      const alreadyPersisted = this._persistedExp.get(p.id) || 0;
      const sessionGain = p.exp - alreadyPersisted;
      if (sessionGain <= 0) continue;
      updateStmt.run(sessionGain, p.accountId);
      this._persistedExp.set(p.id, p.exp);
    }
  }

  _allPlayersReady() {
    return this._endGameReady.size === Object.keys(this.players).length && Object.keys(this.players).length > 0;
  }

  _computeServerLevel() {
    let total = 0;
    for (const id in this.players) total += this.players[id].lvl || 1;
    return total;
  }

  _getSortedPlayerStats() {
    return Object.values(this.players).filter(p => !p.isSpectator).map(p => ({ name: p.name, level: p.lvl || 1, kills: p.kills || 0 })).sort((a, b) => b.level - a.level);
  }

  handleEndGameReady(id) { this._endGameReady.add(id); this._broadcastEndGameUpdate(); }
  handleEndGameLeave(id) { this._endGameReady.delete(id); this._broadcastEndGameUpdate(); }

  _broadcastEndGameUpdate() {
    const players = this.getLobbyPlayers();
    const ready = Array.from(this._endGameReady);
    const allReady = this._allPlayersReady();
    this.io.to('room:' + this.id).emit('endGameLobby', { players, ready, timer: Math.ceil(this.phaseTimer), allReady });
  }

  _timerEndReset() {
    const readySnapshot = Array.from(this._endGameReady);
    this.matchPhase = 'waiting';
    this.phaseTimer = 0;
    this.currentWave = 0;
    this.matchStarted = false;
    this._roundSaved = false;
    this._lastEndGameBroadcast = 0;
    // Trim excess spectators — preserve ready players first
    const pIds = Object.keys(this.players);
    if (pIds.length > MAX_PLAYERS) {
      const readySet = new Set(readySnapshot);
      for (const id of pIds) {
        if (Object.keys(this.players).length <= MAX_PLAYERS) break;
        const p = this.players[id];
        if (p.isSpectator && !readySet.has(id) && !this._joinQueue.includes(id)) {
          delete this.players[id];
        }
      }
    }
    this._lobbyOrder = Object.keys(this.players);
    this.zombies = zombieMod.initZombies(this.players);
    this.grid.clear();
    this._endGameReady = new Set(readySnapshot);
    for (const id in this.players) {
      if (readySnapshot.includes(id) && !this.players[id].alive) playerMod.respawnPlayer(id, this.players, this.zombies);
    }
    // Free slots from non-ready originals so queue can fill
    for (const id in this.players) {
      const p = this.players[id];
      if (!p.isSpectator && !readySnapshot.includes(id)) {
        p.isSpectator = true;
        p.alive = false;
      }
    }
    this.io.to('room:' + this.id).emit('matchReset', { readyPlayers: readySnapshot });
    const prePromoteActive = this.getActivePlayerCount();
    const prePromoteQueue = this._joinQueue.length;
    this._promoteFromQueue();
    const postPromoteActive = this.getActivePlayerCount();
    const postPromoteQueue = this._joinQueue.length;
    console.log(`[room ${this.id}] _timerEndReset: ready=${readySnapshot.length} queue=${prePromoteQueue}->${postPromoteQueue} active=${prePromoteActive}->${postPromoteActive}`);
    this._broadcastQueueUpdate();
    this.io.to('room:' + this.id).emit('lobbyUpdate', {
      players: this.getLobbyPlayers().filter(p => readySnapshot.includes(p.id) || !this.players[p.id]?.isSpectator)
    });
  }

  getActivePlayerCount() {
    let count = 0;
    for (const id in this.players) { if (!this.players[id].isSpectator) count++; }
    return count;
  }

  handleDirectJoin(id) {
    const p = this.players[id];
    if (!p || !p.isSpectator) return;
    const activeCount = this.getActivePlayerCount();
    this._diag(id, 'handleDirectJoin_entry', { activeCount });
    if (this.matchPhase === 'ended' || activeCount >= MAX_PLAYERS || this._joinQueue.length > 0) {
      this._diag(id, 'handleDirectJoin→queue', { activeCount });
      this.handleQueueJoin(id);
      return;
    }
    p.isSpectator = false;
    p.lvl = 1; p.exp = 0; p.gold = 0;
    this._persistedExp.delete(p.id);
    const qIdx = this._joinQueue.indexOf(id);
    if (qIdx >= 0) this._joinQueue.splice(qIdx, 1);

    if (this.matchPhase === 'daytime') {
      this._diag(id, 'handleDirectJoin→alive', {});
      playerMod.respawnPlayer(id, this.players, this.zombies);
      playerMod.recalcStats(p);
      this.io.to(id).emit('playerInfo', playerMod.playerInfoObj(p));
      this.io.to(id).emit('joinedGame');
    } else {
      this._diag(id, 'handleDirectJoin→isDead:true', { matchPhase: this.matchPhase });
      p.alive = false;
      playerMod.recalcStats(p);
      const living = Object.values(this.players).find(p2 => p2.alive && p2.id !== id);
      if (living) { p.x = living.x; p.y = living.y; }
      this.io.to(id).emit('joinedGame', { isDead: true });
    }

    for (const oid in this.players) {
      this.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(p));
    }
    this._broadcastQueueUpdate();
    this.lastBroadcast = 0;
  }

  handleQueueJoin(id) {
    const p = this.players[id];
    if (!p || !p.isSpectator) return;
    this._diag(id, 'handleQueueJoin', { alreadyInQueue: this._joinQueue.includes(id) });
    if (!this._joinQueue.includes(id)) {
      this._joinQueue.push(id);
      this._broadcastQueueUpdate(id);
      this.lastBroadcast = 0;
    }
  }

  _broadcastQueueUpdate(directTargetId) {
    const activeCount = this.getActivePlayerCount();
    const waitingCount = Math.max(0, MAX_PLAYERS - activeCount);
    let queuePos = 0;
    const queued = this._joinQueue.map((id, idx) => {
      const p = this.players[id];
      if (!p) return null;
      const pos = idx >= waitingCount ? ++queuePos : 0;
      return { id, name: p.name, pos };
    }).filter(Boolean);
    const data = { queued, playerCount: activeCount };
    if (directTargetId) this.io.to(directTargetId).emit('queueUpdate', data);
    this.io.to('room:' + this.id).emit('queueUpdate', data);
  }

  _promoteFromQueue() {
    const activeCount = this.getActivePlayerCount();
    let slots = Math.max(0, MAX_PLAYERS - activeCount);
    while (slots > 0 && this._joinQueue.length > 0) {
      const qid = this._joinQueue.shift();
      const qp = this.players[qid];
      if (!qp || !qp.isSpectator) { this._diag(qid, '_promoteFromQueue_skipped', { reason: !qp ? 'no player' : 'not spectator' }); continue; }
      this._diag(qid, '_promoteFromQueue_popped', { slots });
      qp.isSpectator = false;
      qp.lvl = 1; qp.exp = 0; qp.gold = 0;
      this._persistedExp.delete(qp.id);
      playerMod.recalcStats(qp);

      if (this.matchPhase === 'daytime') {
        this._diag(qid, '_promoteFromQueue→daytime', {});
        playerMod.respawnPlayer(qid, this.players, this.zombies);
        this.io.to(qid).emit('playerInfo', playerMod.playerInfoObj(qp));
        this.io.to(qid).emit('joinedGame');
      } else if (this.matchPhase === 'waiting' || this.matchPhase === 'ended') {
        this._diag(qid, '_promoteFromQueue→waiting', {});
        qp.alive = false;
        this.io.to(qid).emit('playerInfo', playerMod.playerInfoObj(qp));
      } else {
        this._diag(qid, '_promoteFromQueue→isDead:true', { matchPhase: this.matchPhase });
        qp.alive = false;
        const living = Object.values(this.players).find(p2 => p2.alive && p2.id !== qid);
        if (living) { qp.x = living.x; qp.y = living.y; }
        this.io.to(qid).emit('joinedGame', { isDead: true });
      }

      for (const oid in this.players) {
        this.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(qp));
      }
      slots--;
    }
    this._broadcastQueueUpdate();
    this.lastBroadcast = 0;
  }

  gameTick() {
    const tickStart = Date.now();

    if (this.matchPhase !== 'waiting' && this.phaseTimer > 0) {
      this.phaseTimer -= TICK_MS;
      if (this.phaseTimer <= 0) {
        this.phaseTimer = 0;
        if (this.matchPhase === 'ended') { this._timerEndReset(); return; }
        this._advancePhase();
      }
    }

    if (this.matchPhase === 'ended') {
      if (tickStart - this._lastEndGameBroadcast < BROADCAST_MS) return;
      this._lastEndGameBroadcast = tickStart;
      this._broadcastEndGameUpdate();
      return;
    }

    const ids = Object.keys(this.players);
    if (ids.length === 0) return;

    for (const id of ids) {
      const p = this.players[id];
      if (!p.alive || p.isSpectator) continue;
      physics.processPlayerMovement(p);
    }

    this.grid.clear();
    for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }
    for (const id in this.players) { const p = this.players[id]; if (p.alive) this.grid.insertPlayer(p); }

    if (this.matchPhase === 'nighttime' || this.matchPhase === 'waveOver') {
      zombieAi.tickTargeting(this.zombies, this.players);
      zombieAi.moveAll(this.zombies);
      this.grid.clearZombies();
      for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }
      const attackEvents = zombieAi.processZombieAttacks(this.zombies, this.players, this.grid, this.id);
      this.emitEvents(attackEvents);
      physics.processPlayerCollision(this.players);
      if (this.matchPhase === 'nighttime') {
        zombieAi.ensureCount(this.zombies, this.players);
        zombieAi.reviveDead(this.zombies, this.players);
      }
      if (!Object.values(this.players).some(p => p.alive)) { this._endMatch(); return; }
    }

    for (const id of ids) {
      const p = this.players[id];
      if (!p.alive || p.isSpectator || !p.attacking) continue;
      const events = sword.checkSwordHit(p, this.zombies, this.players, this.grid);
      this.emitEvents(events);
      p.attackFrame++;
      const totalFrames = sword.animTotal(p.attackAnim);
      const totalTicks = Math.ceil(totalFrames / (2 * ATTACK_SPEED_MULT));
      if (p.attackFrame >= totalTicks) {
        p.attacking = false;
        p.attackAnim = null;
        p.attackHitIds = [];
        p.prevCf = -1;
        p.attackCooldown = Math.round(p.attackSpeed / TICK_MS);
      }
    }

    if (this.matchPhase === 'nighttime' || this.matchPhase === 'waveOver') {
      const mergeEvents = zombieAi.processMerge(this.zombies, this.grid);
      this.emitEvents(mergeEvents);
    }

    if (this.matchPhase === 'waveOver' && this.zombies.every(z => !z.alive)) this._advancePhase();

    if (tickStart - this.lastBroadcast < BROADCAST_MS) return;
    this.lastBroadcast = tickStart;

    this._playerList.length = 0;
    let serverLevelSum = 0;
    for (const id in this.players) {
      const p = this.players[id];
      if (p.isSpectator) continue;
      serverLevelSum += p.lvl || 1;
      this._playerList.push(p);
    }
    const playerBlock = bp.buildPlayerBlock(this._playerList);
    this.currentServerLevel = serverLevelSum;

    const emitTime = Date.now();
    if (this.lastEmitTime && emitTime - this.lastEmitTime > 100) console.log(`[room ${this.id}] STALL broadcast gap=${emitTime - this.lastEmitTime}ms`);
    this.lastEmitTime = emitTime;

    for (const id in this.players) {
      const p = this.players[id];
      if (!p) continue;
      const zoom = p.cameraZoom || 1;
      const vw = p.viewW || VIEW_W;
      const vh = p.viewH || VIEW_H;
      const pHalfVW = (vw / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
      const pHalfVH = (vh / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
      this._viewZ.length = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (!z.alive) continue;
        if (!p.fullscreen && !p.isSpectator && p.alive) {
          const dzx = z.x - p.x; if (dzx < -pHalfVW || dzx > pHalfVW) continue;
          const dzy = z.y - p.y; if (dzy < -pHalfVH || dzy > pHalfVH) continue;
        }
        this._viewZ.push(z);
      }
      this.io.to(id).emit('state', bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, this._viewZ, emitTime));
    }
    const tickMs = Date.now() - tickStart;
    if (tickMs > 30) console.log(`[room ${this.id}] tick=${tickMs}ms players=${ids.length} zombies=${this.zombies.length}`);
  }
}

module.exports = Room;
