const {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, VIEW_MARGIN,
  MAX_PLAYERS, MAX_ROOMS, ROOM_EMPTY_TIMEOUT_MS,
  TICK_MS, BROADCAST_MS, ATTACK_SPEED_MULT, ANIMATIONS
} = require('./config');
const SpatialGrid = require('./spatial-grid');
const playerMod = require('./player');
const zombieMod = require('./zombie');
const physics = require('./physics');
const sword = require('./sword');
const bp = require('./binary-protocol');

class Room {
  constructor(id) {
    this.id = id;
    this.io = null;
    this.players = {};
    this.zombies = zombieMod.initZombies(this.players);
    this.grid = new SpatialGrid(120, WORLD_W, WORLD_H);
    this.lastBroadcast = 0;
    this.lastEmitTime = 0;
    this._playerList = [];
    this._viewZ = [];
    this._emptyTimeout = null;
  }

  setIo(io) { this.io = io; }

  getPlayerCount() { return Object.keys(this.players).length; }
  isEmpty() { return this.getPlayerCount() === 0; }

  addPlayer(id, name) {
    if (this.getPlayerCount() >= MAX_PLAYERS) return false;
    playerMod.addPlayer(id, name, this.players, this.zombies);
    zombieMod.recalcAllZombieTargets(this.zombies, this.players);
    if (this._emptyTimeout) { clearTimeout(this._emptyTimeout); this._emptyTimeout = null; }
    return true;
  }

  removePlayer(id) {
    const p = this.players[id];
    if (!p) return;
    delete this.players[id];
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
    const anim = ANIMATIONS[p.currentItem]?.attack;
    if (!anim || anim.keyframes.length < 2) return;
    if (typeof facingAngle === 'number') p.facingAngle = facingAngle;
    p.attacking = true;
    p.attackFrame = 0;
    p.attackAnim = anim;
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
    this.io.to(id).emit('respawned');
  }

  getPlayerInfoObj(id) {
    const p = this.players[id];
    return p ? playerMod.playerInfoObj(p) : null;
  }

  setFullscreen(id, enabled) {
    const p = this.players[id];
    if (p) p.fullscreen = !!enabled;
  }

  setCameraZoom(id, zoom) {
    playerMod.setCameraZoom(id, { [id]: this.players[id] }, zoom);
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
      }
    }
  }

  gameTick() {
    const tickStart = Date.now();
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

    zombieMod.tickTargeting(this.zombies, this.players);
    zombieMod.moveAll(this.zombies);

    this.grid.clearZombies();
    for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }

    const contactEvents = physics.processContactDamage(this.zombies, this.grid);
    this.emitEvents(contactEvents);

    physics.processPlayerCollision(this.players);

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

    const mergeEvents = zombieMod.processMerge(this.zombies, this.grid);
    this.emitEvents(mergeEvents);

    zombieMod.ensureCount(this.zombies, this.players);
    zombieMod.reviveDead(this.zombies, this.players);

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
    const currentServerLevel = serverLevelSum;

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
      this.io.to(id).emit('state', bp.buildStateBuffer(playerBlock, this._playerList.length, currentServerLevel, this._viewZ, emitTime));
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
    return Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      playerCount: r.getPlayerCount(),
      maxPlayers: MAX_PLAYERS
    }));
  }

  getPlayerRoom(id) { return this.playerRoom.get(id) || null; }

  addPlayerToRoom(roomId, playerId, name) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.getPlayerCount() >= MAX_PLAYERS) return false;
    room.addPlayer(playerId, name);
    this.playerRoom.set(playerId, roomId);
    return true;
  }

  removePlayerFromRoom(playerId) {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return null;
    this.playerRoom.delete(playerId);
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.removePlayer(playerId);
    return roomId;
  }

  tickLoop() {
    const now = Date.now();
    let steps = 0;
    while (now >= this.nextTickAt && steps < MAX_TICKS_PER_WAKE) {
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
    this.nextTickAt = Date.now();
    setTimeout(() => this.tickLoop(), TICK_MS);
  }
}

module.exports = new RoomManager();
