const Room = require('./room');
const { MAX_ROOMS, MAX_PLAYERS, TICK_MS } = require('./config');

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
      playerNames: Object.values(r.players).map(p => ({ name: p.name, type: p.accountType || 'basic' }))
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
    if (!hasEmpty && this.rooms.size < MAX_ROOMS) this.createRoom();
  }

  getPlayerRoom(id) {
    const roomId = this.playerRoom.get(id);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  addPlayerToRoom(roomId, playerId, name, accountType, accountId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (!room.addPlayer(playerId, name, accountType, accountId)) return false;
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
    if (now - this.nextTickAt > TICK_MS * MAX_TICKS_PER_WAKE) this.nextTickAt = now;
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
