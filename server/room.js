const path = require('path');
const fs = require('fs');
const {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, VIEW_MARGIN,
  MAX_PLAYERS, ROOM_EMPTY_TIMEOUT_MS,
  TICK_MS, BROADCAST_MS
} = require('./config');
const SpatialGrid = require('./spatial-grid');
const playerMod = require('./player');
const { initEnemies, buildSpawnPool } = require('./zombie');
const zombieAi = require('./zombie-ai');
const physics = require('./physics');
const bp = require('./binary-protocol');
const expMod = require('./exp');
const db = require('./db');
const phaseManager = require('./phase-manager');
const joinManager = require('./join-manager');
const combatSystem = require('./combat-system');
const specManager = require('./spectator-manager');

const DIAG_LOG = path.join(__dirname, '..', 'Workflow', 'diag-log.json');

class Room {
  constructor(id) {
    this.id = id;
    this.io = null;
    this.players = {};
    this.mobSpawnPool = buildSpawnPool(1);
    this.zombies = initEnemies(this.mobSpawnPool, 1, this.players);
    this.grid = new SpatialGrid(120, WORLD_W, WORLD_H);
    this.lastBroadcast = 0;
    this.lastEmitTime = 0;
    this.currentServerLevel = 0;
    this.waveServerLevel = 1;
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
    this.spectatorFollows = new Map();
    this.tickNum = 0;
    this._nightMaxPop = 0;
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

  getActivePlayerIds() { return joinManager.getActivePlayerIds(this); }
  getActivePlayerCount() { return joinManager.getActivePlayerCount(this); }

  _broadcastLobbyUpdate() {
    this.io.to('room:' + this.id).emit('lobbyUpdate', { players: this.getFilteredLobbyPlayers() });
  }

  getFilteredLobbyPlayers() {
    const all = this.getLobbyPlayers();
    if (this.matchPhase === 'ended') {
      return all.filter(p => this._endGameReady.has(p.id));
    }
    if (this.matchPhase === 'waiting' && this._postGameWaiting) {
      return all.filter(p => !this.players[p.id]?.isSpectator);
    }
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
    } catch (e) {}
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
    this._broadcastLobbyUpdate();
    zombieAi.recalcAllZombieTargets(this.zombies, this.players);
    if (!this._lobbyOrder.includes(id)) this._lobbyOrder.push(id);
    if (this._emptyTimeout) { clearTimeout(this._emptyTimeout); this._emptyTimeout = null; }
    if (this.players[id].isSpectator) this._assignFollowTarget(id);
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
    this.spectatorFollows.delete(id);
    this._broadcastQueueUpdate();
    if (wasActive && this.matchPhase !== 'ended') this._promoteFromQueue();
    this._broadcastLobbyUpdate();
    if (this.isEmpty()) {
      this._postGameWaiting = false;
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
    if (typeof data.angle === 'number') {
      p._lastMouseAngle = data.angle;
      if (!p.attacking) {
        if (p._lastTurnTime != null) {
          const dt = (Date.now() - p._lastTurnTime) / 1000;
          const maxDelta = (p.turnSpeed || 18) * Math.min(dt, 0.1);
          let diff = data.angle - p._lastSendAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) > maxDelta) {
            p.facingAngle = p._lastSendAngle + (diff > 0 ? maxDelta : -maxDelta);
          } else {
            p.facingAngle = data.angle;
          }
        } else {
          p.facingAngle = data.angle;
        }
        p._lastSendAngle = p.facingAngle;
        p._lastTurnTime = Date.now();
      }
    }
    if (typeof data.sprint === 'boolean') {
      if (data.sprint && !p.sprint) p._sprintDepleted = false;
      if (p.sprint && !data.sprint && !p._sprintDepleted) p.sprintEndCooldown = Date.now();
      p.sprint = data.sprint;
    }
  }

  handleAttack(id, facingAngle) { combatSystem.handleAttack(this, id, facingAngle); }
  _executeAttack(id, step, pendingAngle) { combatSystem._executeAttack(this, id, step, pendingAngle); }
  handleEquip(id, slot) { combatSystem.handleEquip(this, id, slot); }

  respawnPlayer(id) {
    playerMod.respawnPlayer(id, this.players, this.zombies);
    this._roundSaved = false;
    this.io.to(id).emit('respawned');
  }

  startMatch(fromEnded) { phaseManager.startMatch(this, fromEnded); }
  handleStartMatch(id) { phaseManager.handleStartMatch(this, id); }
  _advancePhase() { phaseManager._advancePhase(this); }
  _endMatch() { phaseManager._endMatch(this); }
  resetMatch() { phaseManager.resetMatch(this); }
  _timerEndReset() { phaseManager._timerEndReset(this); }
  _testAdvancePhase() { phaseManager._testAdvancePhase(this); }
  _computeServerLevel() { return phaseManager._computeServerLevel(this); }

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

  _assignFollowTarget(spectatorId) { specManager._assignFollowTarget(this, spectatorId); }

  emitEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hitConfirm': this.io.to(e.to).emit('hitConfirm', { targetId: e.targetId, dmg: e.dmg, x: e.x, y: e.y }); break;
        case 'gotHit': this.io.to(e.to).emit('gotHit', { attackerId: e.attackerId, dmg: e.dmg, health: e.health }); break;
        case 'eliminated': this.io.to(e.to).emit('eliminated', { kills: e.kills }); break;
        case 'zombieKilled': this._awardExp(e.playerId, e.zombieLvl); this.io.to(e.playerId).emit('mobKilled', { mobType: e.mobType, x: e.x, y: e.y }); break;
        case 'zombieAttackStart': this.io.to(e.to).emit('zombieAttackStart', { zombieId: e.zombieId, mobType: e.mobType }); break;
      }
    }
  }

  _awardExp(playerId, zombieLvl) {
    const p = this.players[playerId];
    if (!p || !p.alive || p.isSpectator) return;
    const prevLvl = p.lvl;
    p.exp += expMod.getExpForKill(zombieLvl);
    p.gold += expMod.getGoldForKill(zombieLvl);
    const result = expMod.fromCumulativeExp(p.exp);
    p.lvl = result.level;
    const levelGain = Math.max(0, p.lvl - prevLvl);
    p.statPoints = (p.statPoints || 0) + levelGain;
    this.io.to(playerId).emit('accountUpdate', { exp: result.exp, level: p.lvl, expToNext: expMod.getExpToNext(p.lvl), gold: p.gold, statPoints: p.statPoints });
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
      this._persistedExp.set('sp_' + p.id, p.statPoints || 0);
    }
  }

  _allPlayersReady() {
    return this._endGameReady.size === Object.keys(this.players).length && Object.keys(this.players).length > 0;
  }

  _getSortedPlayerStats() {
    return Object.values(this.players).filter(p => !p.isSpectator).map(p => ({ name: p.name, level: p.lvl || 1, kills: p.kills || 0 })).sort((a, b) => b.level - a.level);
  }

  handleEndGameReady(id) { joinManager.handleEndGameReady(this, id); }
  handleEndGameLeave(id) { joinManager.handleEndGameLeave(this, id); }

  _broadcastEndGameUpdate() {
    const players = this.getLobbyPlayers();
    const ready = Array.from(this._endGameReady);
    const allReady = this._allPlayersReady();
    this.io.to('room:' + this.id).emit('endGameLobby', { players, ready, timer: Math.ceil(this.phaseTimer), allReady });
  }

  handleDirectJoin(id) { joinManager.handleDirectJoin(this, id); }
  handleQueueJoin(id) { joinManager.handleQueueJoin(this, id); }

  _broadcastQueueUpdate(directTargetId) {
    joinManager._broadcastQueueUpdate(this, directTargetId);
  }

  _promoteFromQueue() { joinManager._promoteFromQueue(this); }

  gameTick() {
    this.tickNum++;
    const tickStart = Date.now();

    if (this.matchPhase !== 'waiting' && this.phaseTimer > 0) {
      this.phaseTimer -= TICK_MS;
      if (this.phaseTimer <= 0) {
        this.phaseTimer = 0;
        console.log('[PHASE] timer expired phase=' + this.matchPhase);
        if (this.matchPhase === 'ended') { this._timerEndReset(); return; }
        this._advancePhase();
      }
    }

    if (this.matchPhase === 'ended') {
      if (this._endGameReady.size === 0 && this._joinQueue.length > 0 && this._joinQueue.length === Object.keys(this.players).length) {
        this._timerEndReset();
        return;
      }
      if (tickStart - this._lastEndGameBroadcast < BROADCAST_MS) return;
      this._lastEndGameBroadcast = tickStart;
      this._broadcastEndGameUpdate();
      return;
    }

    if (this.matchPhase !== 'waiting' && tickStart % (BROADCAST_MS * 3) < TICK_MS) {
      for (const id in this.players) {
        const sock = this.io?.sockets?.sockets?.get(id);
        if (sock && sock._lastDiagPing && tickStart - sock._lastDiagPing > 30000) {
          console.log(`[room ${this.id}] diag STALL ${id.slice(0,12)} no ping ${tickStart - sock._lastDiagPing}ms`);
        }
      }
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

    if (this.matchPhase === 'nighttime') {
      zombieAi.tickTargeting(this.zombies, this.players);
      zombieAi.moveAll(this.zombies, this.players);
      zombieAi.processZombieSeparation(this.zombies, this.grid);
      zombieAi.processWallCohesion(this.zombies, this.grid);
      this.grid.clearZombies();
      for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }
      const attackEvents = zombieAi.processZombieAttacks(this.zombies, this.players, this.grid, this.id);
      this.emitEvents(attackEvents);
      physics.processPlayerCollision(this.players);
      if (!Object.values(this.players).some(p => p.alive)) { this._endMatch(); return; }
      if (this.matchPhase === 'nighttime') {
        const fullPop = this.mobSpawnPool.length;
        if (this.tickNum % 30 === 0 && this._nightMaxPop < fullPop) {
          this._nightMaxPop += 1 + Math.floor(Math.random() * 2);
        }
        zombieAi.ensureCount(this.zombies, this.mobSpawnPool, this.waveServerLevel, this.players, Math.min(this._nightMaxPop, fullPop), true);
        if (this.tickNum % 20 === 0) {
          zombieAi.spawnKiterResponse(this.zombies, this.mobSpawnPool, this.waveServerLevel, this.players, fullPop);
        }
      }
    }

    combatSystem.processCombatTick(this);

    if (this.matchPhase === 'nighttime' && this.zombies.length > 0 && this.zombies.every(z => !z.alive)) this._advancePhase();

    if (tickStart - this.lastBroadcast < BROADCAST_MS) {
      if (tickStart % (BROADCAST_MS * 20) < TICK_MS) {
        for (const id in this.players) {
          const p = this.players[id];
          if (p && p._lastStateSent && tickStart - p._lastStateSent > 5000) {
            console.log(`[room ${this.id}] SKIP bcast spec=${id.slice(0,8)} lastState=${tickStart - p._lastStateSent}ms alive=${p.alive} spec=${p.isSpectator}`);
            break;
          }
        }
      }
      return;
    }
    this.lastBroadcast = tickStart;

    for (const id in this.players) {
      const p = this.players[id];
      if (p && (p.isSpectator || !p.alive) && !this.spectatorFollows.has(id)) {
        this._assignFollowTarget(id);
      }
    }
    specManager.cleanStaleFollows(this);

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

    let serverAlive = 0;
    for (const z of this.zombies) { if (z.alive) serverAlive++; }

    const bufs = new Map();
    for (const id in this.players) {
      const p = this.players[id];
      if (!p || !p.alive || p.isSpectator) continue;
      const zoom = p.cameraZoom || 1;
      const vw = p.viewW || VIEW_W;
      const vh = p.viewH || VIEW_H;
      const pHalfVW = (vw / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
      const pHalfVH = (vh / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
      this._viewZ.length = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (!z.alive) continue;
        if (!p.fullscreen) {
          const dzx = z.x - p.x; if (dzx < -pHalfVW || dzx > pHalfVW) continue;
          const dzy = z.y - p.y; if (dzy < -pHalfVH || dzy > pHalfVH) continue;
        }
        this._viewZ.push(z);
      }
      const zlist = this._viewZ.slice();
      bufs.set(id, { buf: bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, zlist, emitTime, false, p.cameraZoom || 1, p.viewW || VIEW_W, p.viewH || VIEW_H, this.zombies.length, serverAlive), zombies: zlist, zoom: p.cameraZoom || 1, viewW: p.viewW || VIEW_W, viewH: p.viewH || VIEW_H });
    }

    let specCount = 0, activeCount = 0;
    for (const id in this.players) {
      const p = this.players[id];
      if (!p) continue;
      if (!p.isSpectator && p.alive) {
        const entry = bufs.get(id);
        if (entry) { this.io.to(id).emit('state', entry.buf); p._lastStateSent = tickStart; activeCount++; }
      } else {
        const targetId = this.spectatorFollows.get(id);
        const targetEntry = targetId ? bufs.get(targetId) : null;
        if (targetEntry && p.isSpectator) {
          const specBuf = bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, targetEntry.zombies, emitTime, true, targetEntry.zoom, targetEntry.viewW, targetEntry.viewH, this.zombies.length, serverAlive);
          this.io.to(id).emit('state', specBuf);
          p._lastStateSent = tickStart;
          specCount++;
        } else if (targetEntry) {
          this.io.to(id).emit('state', targetEntry.buf);
          p._lastStateSent = tickStart;
        } else {
          const emptyBuf = bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, [], emitTime, p.isSpectator, 1, VIEW_W, VIEW_H, this.zombies.length, serverAlive);
          this.io.to(id).emit('state', emptyBuf);
          p._lastStateSent = tickStart;
        }
      }
    }
    if (specCount > 0 && tickStart % (BROADCAST_MS * 10) < TICK_MS) {
      console.log(`[room ${this.id}] broadcast: ${activeCount} active, ${specCount} spec followers, ${this._playerList.length} in playerBlock`);
    }

    const tickMs = Date.now() - tickStart;
    if (tickMs > 30) console.log(`[room ${this.id}] tick=${tickMs}ms players=${ids.length} zombies=${this.zombies.length}`);
  }
}

module.exports = Room;
