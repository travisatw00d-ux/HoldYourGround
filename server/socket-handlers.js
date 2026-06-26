const { WORLD_W, WORLD_H, MAX_PLAYERS } = require('./config');
const auth = require('./auth');
const playerMod = require('./player');
const roomManager = require('./game-loop');
const fs = require('fs');
const path = require('path');

const CLIENT_DIAG_DIR = path.join(__dirname, '..', 'Workflow');

module.exports = function registerSocket(socket, { io, broadcastRoomList, broadcastLobbyUpdate, joinLobby, leaveLobby }) {
  console.log(`[${socket.id}] connected`);
  joinLobby(socket);
  socket.emit('roomList', roomManager.getRoomList());

  socket.on('register', ({ username, password, displayName }) => {
    const result = auth.register(username, password, displayName);
    if (result.ok) {
      socket.account = result.account;
      socket.emit('authSuccess', { account: result.account, rooms: roomManager.getRoomList() });
      console.log(`[${socket.id}] registered as "${result.account.username}"`);
    } else {
      socket.emit('authError', result.error);
    }
  });

  socket.on('login', ({ username, password }) => {
    const result = auth.login(username, password);
    if (result.ok) {
      socket.account = result.account;
      socket.emit('authSuccess', { account: result.account, rooms: roomManager.getRoomList() });
      console.log(`[${socket.id}] logged in as "${result.account.username}"`);
    } else {
      socket.emit('authError', result.error);
    }
  });

  socket.on('playAsGuest', ({ name }) => {
    socket._guestName = name;
    socket.emit('guestJoined', { name, rooms: roomManager.getRoomList() });
    console.log(`[${socket.id}] playing as guest "${name}"`);
  });

  socket.on('createRoom', ({ name }) => {
    const roomId = roomManager.createRoom();
    if (!roomId) { socket.emit('error', 'Server full — no room slots available'); return; }
    joinRoom(socket, roomId, name || 'Player');
  });

  socket.on('join', ({ roomId, name }) => {
    if (!roomId) { socket.emit('error', 'No room specified'); return; }
    joinRoom(socket, roomId, name || 'Player');
  });

  function joinRoom(socket, roomId, name) {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('error', 'Room not found'); return; }
    const accountType = socket.account ? socket.account.accountType || 'basic' : 'guest';
    const accountId = socket.account ? socket.account.id : null;

    leaveLobby(socket);
    if (!roomManager.addPlayerToRoom(roomId, socket.id, name, accountType, accountId)) {
      socket.emit('error', 'Room is full');
      return;
    }
    socket.join('room:' + roomId);
    console.log(`[${socket.id}] joined room ${roomId} as "${name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H, roomId: room.id });
    for (const oid in room.players) {
      socket.emit('playerInfo', room.getPlayerInfoObj(oid));
    }
    socket.emit('joined');
    if (room.players[socket.id]?.isSpectator) {
      socket.emit('spectatorAssigned');
    }
    socket.emit('lobbyUpdate', { players: room.getFilteredLobbyPlayers() });
    socket.emit('matchPhase', { phase: room.matchPhase, timer: room.phaseTimer, wave: room.currentWave });
    if (room.matchPhase === 'ended') {
      socket.emit('matchEnd', {
        wave: room.currentWave,
        timer: room.phaseTimer,
        serverLevel: room._computeServerLevel(),
        playerStats: room._getSortedPlayerStats(),
        lobbyPlayers: room.getLobbyPlayers()
      });
    } else if (room.matchPhase !== 'waiting') {
      socket.emit('spectatorAssigned');
      const activeCount = room.getActivePlayerCount();
      const waitingCount = Math.max(0, MAX_PLAYERS - activeCount);
      let queuePos = 0;
      const queued = room._joinQueue.map((id, idx) => {
        const p = room.players[id];
        if (!p) return null;
        const pos = idx >= waitingCount ? ++queuePos : 0;
        return { id, name: p.name, pos };
      }).filter(Boolean);
      socket.emit('queueUpdate', { queued, playerCount: activeCount });
    }
    broadcastRoomList();
    broadcastLobbyUpdate(room);
  }

  socket.on('respawn', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room || room.matchPhase !== 'intermission') return;
    const p = room.players[socket.id];
    if (!p || p.isSpectator || room.getActivePlayerCount() >= MAX_PLAYERS) return;
    room.respawnPlayer(socket.id);
  });

  socket.on('input', ({ dx, dy, angle }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleInput(socket.id, { dx, dy, angle });
  });

  socket.on('attack', ({ facingAngle }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleAttack(socket.id, facingAngle);
  });

  socket.on('equip', ({ slot }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleEquip(socket.id, slot);
  });

  socket.on('fullscreen', ({ enabled }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.setFullscreen(socket.id, enabled);
  });

  socket.on('cameraZoom', (data) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.setCameraZoom(socket.id, data);
  });

  socket.on('toggleGodMode', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) {
      const enabled = room.toggleGodMode(socket.id);
      socket.emit('godModeToggled', { enabled });
    }
  });

  socket.on('killAllMobs', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.killAllMobs();
  });

  socket.on('leaveRoom', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room && room.matchPhase === 'ended') {
      room.handleEndGameLeave(socket.id);
    }
    const roomId = roomManager.removePlayerFromRoom(socket.id);
    if (roomId) {
      socket.leave('room:' + roomId);
      const found = roomManager.getRoom(roomId);
      io.to('room:' + roomId).emit('playerLeft', socket.id);
      broadcastRoomList();
      if (found) broadcastLobbyUpdate(found);
    }
    joinLobby(socket);
  });

  socket.on('diagPing', (t) => socket.emit('diagPong', { t }));

  socket.on('startMatch', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleStartMatch(socket.id);
  });

  socket.on('playAgain', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    if (room.matchPhase === 'ended') {
      room.handleEndGameReady(socket.id);
    } else if (room.matchPhase === 'waiting') {
      room._endGameReady.add(socket.id);
      if (!room.players[socket.id]?.alive) {
        playerMod.respawnPlayer(socket.id, room.players, room.zombies);
      }
      broadcastLobbyUpdate(room);
      io.to(socket.id).emit('matchReset', { readyPlayers: [socket.id] });
    } else {
      room._endGameReady.add(socket.id);
      room.handleDirectJoin(socket.id);
    }
  });

  socket.on('spectate', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    p.isSpectator = true;
    p.alive = false;
    const living = Object.values(room.players).find(p2 => p2.alive && p2.id !== socket.id);
    if (living) { p.x = living.x; p.y = living.y; }
    for (const oid in room.players) {
      room.io.to(oid).emit('playerInfo', room.getPlayerInfoObj(p));
    }
    socket.emit('spectatorAssigned');
  });

  socket.on('joinGame', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleDirectJoin(socket.id);
  });

  socket.on('joinQueue', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleQueueJoin(socket.id);
  });

  socket.on('__test', ({ action }) => {
    if (!process.env.TEST_MODE) return;
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    if (action === 'advancePhase') room._testAdvancePhase();
    if (action === 'killAllZombies') room.killAllMobs();
    if (action === 'endMatch') room._endMatch();
  });

  socket.on('clientDiag', (data) => {
    const name = socket._guestName || socket.handshake?.query?.guest || 'anon';
    const logPath = path.join(CLIENT_DIAG_DIR, `diag-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`);
    data.socketId = socket.id.slice(0, 8);
    data.t = Date.now();
    try { fs.appendFileSync(logPath, JSON.stringify(data) + '\n'); } catch {}
  });

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    leaveLobby(socket);
    const room = roomManager.getPlayerRoom(socket.id);
    if (room && room.matchPhase === 'ended') {
      room.handleEndGameLeave(socket.id);
    }
    const roomId = roomManager.removePlayerFromRoom(socket.id);
    if (roomId) {
      socket.leave('room:' + roomId);
      const found = roomManager.getRoom(roomId);
      io.to('room:' + roomId).emit('playerLeft', socket.id);
      broadcastRoomList();
      if (found) broadcastLobbyUpdate(found);
    }
  });
};
