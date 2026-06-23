const {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, VIEW_MARGIN,
  MAX_PLAYERS, MAX_ROOMS, ROOM_EMPTY_TIMEOUT_MS,
  TICK_MS, BROADCAST_MS,   ATTACK_SPEED_MULT, ANIMATIONS, KNIGHT_ANIMATIONS,
  DAYTIME_MS, NIGHTTIME_MS, INTERMISSION_MS
} = require('./config');
const SpatialGrid = require('./spatial-grid');
const playerMod = require('./player');
const zombieMod = require('./zombie');
const physics = require('./physics');
const sword = require('./sword');
const expMod = require('./exp');
const bp = require('./binary-protocol');
const db = require('./db');

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

  addPlayer(id, name, accountType, accountId) {
    if (this.getPlayerCount() >= MAX_PLAYERS) return false;
    playerMod.addPlayer(id, name, this.players, this.zombies, accountType, accountId);
    zombieMod.recalcAllZombieTargets(this.zombies, this.players);
    if (!this._lobbyOrder.includes(id)) this._lobbyOrder.push(id);
    if (this._emptyTimeout) { clearTimeout(this._emptyTimeout); this._emptyTimeout = null; }
    return true;
  }

  removePlayer(id) {
    const p = this.players[id];
    if (!p) return;
    delete this.players[id];
    this._lobbyOrder = this._lobbyOrder.filter(oid => oid !== id);
    if (this.isEmpty() && !this._emptyTimeout) {
      this._emptyTimeout = setTimeout(() => {
        if (this.isEmpty()) {
          this.zombies.length = 0;
          this.grid.clear();
        }
      }, ROOM_EMPTY_TIMEOUT_MS);
    }
  }

  handleInput(id, data) {
    const p = this.players[id];
    if (!p) return;
    p.input = { dx: data.dx, dy: data.dy };
    if (typeof data.angle === 'number') p.facingAngle = data.angle;
  }

  handleAttack(id, facingAngle) {
    const p = this.players[id];
    if (!p || !p.alive || p.attackCooldown > 0 || p.attacking) return;
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

  startMatch() {
    this.matchStarted = true;
    this.currentWave = 1;
    this.matchPhase = 'daytime';
    this.phaseTimer = DAYTIME_MS;
    this.zombies.length = 0;
    this.grid.clear();
    zombieMod.recalcAllZombieTargets(this.zombies, this.players);
    this.io.to('room:' + this.id).emit('matchPhase', { phase: 'daytime', timer: DAYTIME_MS, wave: 1 });
  }

  handleStartMatch(socketId) {
    if (this.matchPhase !== 'waiting') return;
    this.startMatch();
  }

  _advancePhase() {
    switch (this.matchPhase) {
      case 'daytime':
        this.matchPhase = 'nighttime';
        this.phaseTimer = NIGHTTIME_MS;
        this.io.to('room:' + this.id).emit('matchPhase', { phase: 'nighttime', timer: NIGHTTIME_MS, wave: this.currentWave });
        break;
      case 'nighttime': {
        const anyAlive = Object.values(this.players).some(p => p.alive);
        if (!anyAlive) {
          this._endMatch();
          return;
        }
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
          const p = this.players[id];
          if (!p.alive) {
            playerMod.respawnPlayer(id, this.players, this.zombies);
            this.io.to(id).emit('respawned');
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
    this.phaseTimer = 0;
    this._roundSaved = false;
    this._saveRound();
    this._roundSaved = true;
    this.io.to('room:' + this.id).emit('matchEnd', { wave: this.currentWave });
  }

  resetMatch() {
    this.matchPhase = 'waiting';
    this.phaseTimer = 0;
    this.currentWave = 0;
    this.matchStarted = false;
    this._roundSaved = false;
    this._lobbyOrder = Object.keys(this.players);
    this.zombies = zombieMod.initZombies(this.players);
    this.grid.clear();
    for (const id in this.players) {
      if (!this.players[id].alive) {
        playerMod.respawnPlayer(id, this.players, this.zombies);
      }
    }
    this.io.to('room:' + this.id).emit('matchReset');
  }

  getPlayerInfoObj(id) {
    const p = this.players[id];
    return p ? playerMod.playerInfoObj(p) : null;
  }

  setFullscreen(id, enabled) {
    const p = this.players[id];
    if (p) p.fullscreen = !!enabled;
  }

  setCameraZoom(id, opts) {
    playerMod.setCameraZoom(id, this.players, opts);
  }

  toggleGodMode(id) {
    const p = this.players[id];
    if (p) p.godMode = !p.godMode;
    return p ? p.godMode : false;
  }

  emitEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hitConfirm':
          this.io.to(e.to).emit('hitConfirm', { targetId: e.targetId, dmg: e.dmg, x: e.x, y: e.y });
          break;
        case 'gotHit':
          this.io.to(e.to).emit('gotHit', { attackerId: e.attackerId, dmg: e.dmg, health: e.health });
          break;
        case 'eliminated':
          this.io.to(e.to).emit('eliminated', { kills: e.kills });
          break;
        case 'zombieMerge':
          this.io.to('room:' + this.id).emit('zombieMerge', { x: e.x, y: e.y });
          break;
        case 'zombieKilled':
          this._awardExp(e.playerId, e.zombieLvl);
          break;
        case 'zombieAttackStart':
          this.io.to(e.to).emit('zombieAttackStart', { zombieId: e.zombieId });
          break;
      }
    }
  }

  _awardExp(playerId, zombieLvl) {
    const p = this.players[playerId];
    if (!p || !p.alive) return;

    const expGain = expMod.getExpForKill(zombieLvl);
    p.exp += expGain;

    const goldGain = expMod.getGoldForKill(zombieLvl);
    p.gold += goldGain;

    let leveled = false;
    let expToNext = expMod.getExpToNext(p.lvl);
    while (p.exp >= expToNext) {
      p.exp -= expToNext;
      p.lvl++;
      expToNext = expMod.getExpToNext(p.lvl);
      leveled = true;
    }

    this.io.to(playerId).emit('accountUpdate', {
      exp: p.exp,
      level: p.lvl,
      expToNext,
      gold: p.gold
    });
  }

  _saveRound() {
    const getStmt = db.prepare('SELECT level, exp FROM accounts WHERE id = ?');
    const updateStmt = db.prepare('UPDATE accounts SET level = ?, exp = ? WHERE id = ?');
    for (const id in this.players) {
      const p = this.players[id];
      if (!p.accountId || p.exp <= 0) continue;

      const alreadyPersisted = this._persistedExp.get(p.id) || 0;
      const sessionGain = p.exp - alreadyPersisted;
      if (sessionGain <= 0) continue;

      const row = getStmt.get(p.accountId);
      if (!row) continue;

      const existingCumulative = expMod.cumulativeExp(row.level || 1, row.exp || 0);
      const newCumulative = existingCumulative + sessionGain;
      const result = expMod.fromCumulativeExp(newCumulative);
      updateStmt.run(result.level, result.exp, p.accountId);
      this._persistedExp.set(p.id, p.exp);
    }
  }

  gameTick() {
    const tickStart = Date.now();

    if (this.matchPhase !== 'waiting' && this.matchPhase !== 'ended' && this.phaseTimer > 0) {
      this.phaseTimer -= TICK_MS;
      if (this.phaseTimer <= 0) {
        this.phaseTimer = 0;
        this._advancePhase();
        if (this.matchPhase === 'ended') return;
      }
    }

    if (this.matchPhase === 'ended') return;

    const ids = Object.keys(this.players);
    if (ids.length === 0) return;

    for (const id of ids) {
      const p = this.players[id];
      if (!p.alive) continue;
      physics.processPlayerMovement(p);
    }

    this.grid.clear();
    for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }
    for (const id in this.players) { const p = this.players[id]; if (p.alive) this.grid.insertPlayer(p); }

    if (this.matchPhase === 'nighttime' || this.matchPhase === 'waveOver') {
      zombieMod.tickTargeting(this.zombies, this.players);
      zombieMod.moveAll(this.zombies);

      this.grid.clearZombies();
      for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }

      const attackEvents = zombieMod.processZombieAttacks(this.zombies, this.players, this.grid, this.id);
      this.emitEvents(attackEvents);

      physics.processPlayerCollision(this.players);

      if (this.matchPhase === 'nighttime') {
        zombieMod.ensureCount(this.zombies, this.players);
        zombieMod.reviveDead(this.zombies, this.players);
      }

      const anyAlive = Object.values(this.players).some(p => p.alive);
      if (!anyAlive) {
        this._endMatch();
        return;
      }
    }

    for (const id of ids) {
      const p = this.players[id];
      if (!p.alive || !p.attacking) continue;
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
      const mergeEvents = zombieMod.processMerge(this.zombies, this.grid);
      this.emitEvents(mergeEvents);
    }

    if (this.matchPhase === 'waveOver' && this.zombies.every(z => !z.alive)) {
      this._advancePhase();
    }

    if (tickStart - this.lastBroadcast < BROADCAST_MS) return;
    this.lastBroadcast = tickStart;

    this._playerList.length = 0;
    let serverLevelSum = 0;
    for (const id in this.players) {
      const p = this.players[id];
      serverLevelSum += p.lvl || 1;
      this._playerList.push(p);
    }
    const playerBlock = bp.buildPlayerBlock(this._playerList);
    this.currentServerLevel = serverLevelSum;

    const emitTime = Date.now();
    if (this.lastEmitTime && emitTime - this.lastEmitTime > 100) {
      console.log(`[room ${this.id}] STALL broadcast gap=${emitTime - this.lastEmitTime}ms`);
    }
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
        if (!p.fullscreen) {
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

const MAX_TICKS_PER_WAKE = 5;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRoom = new Map();
    this.nextRoomId = 1;
    this.nextTickAt = 0;
    this.io = null;
  }

  setIo(io) { this.io = io; }

  createRoom() {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const id = 'room-' + this.nextRoomId++;
    const room = new Room(id);
    room.setIo(this.io);
    this.rooms.set(id, room);
    return id;
  }

  getRoom(roomId) { return this.rooms.get(roomId) || null; }

  getRoomList() {
    const list = Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      playerCount: r.getPlayerCount(),
      maxPlayers: MAX_PLAYERS,
      serverLevel: r.currentServerLevel,
      playerNames: Object.values(r.players).map(p => ({
        name: p.name,
        type: p.accountType || 'basic'
      }))
    }));
    list.sort((a, b) => {
      const aEmpty = a.playerCount === 0 ? 1 : 0;
      const bEmpty = b.playerCount === 0 ? 1 : 0;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return (b.serverLevel || 0) - (a.serverLevel || 0);
    });
    return list;
  }

  ensureSpareRoom() {
    const hasEmpty = Array.from(this.rooms.values()).some(r => r.isEmpty());
    if (!hasEmpty && this.rooms.size < MAX_ROOMS) {
      this.createRoom();
    }
  }

  getPlayerRoom(id) {
    const roomId = this.playerRoom.get(id);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  addPlayerToRoom(roomId, playerId, name, accountType, accountId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.getPlayerCount() >= MAX_PLAYERS) return false;
    room.addPlayer(playerId, name, accountType, accountId);
    this.playerRoom.set(playerId, roomId);
    this.ensureSpareRoom();
    return true;
  }

  removePlayerFromRoom(playerId) {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return null;
    this.playerRoom.delete(playerId);
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.removePlayer(playerId);
    this.ensureSpareRoom();
    return roomId;
  }

  tickLoop() {
    const now = Date.now();
    let steps = 0;
    while (now >= this.nextTickAt && steps < MAX_TICKS_PER_WAKE) {
      this.ensureSpareRoom();
      for (const room of this.rooms.values()) {
        if (!room.isEmpty()) room.gameTick();
      }
      this.nextTickAt += TICK_MS;
      steps++;
    }
    if (now - this.nextTickAt > TICK_MS * MAX_TICKS_PER_WAKE) {
      this.nextTickAt = now;
    }
    setTimeout(() => this.tickLoop(), Math.max(0, this.nextTickAt - Date.now()));
  }

  initGameLoop(io) {
    this.setIo(io);
    this.ensureSpareRoom();
    this.nextTickAt = Date.now();
    setTimeout(() => this.tickLoop(), TICK_MS);
  }
}

module.exports = new RoomManager();
