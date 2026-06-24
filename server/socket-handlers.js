const { WORLD_W, WORLD_H, MAX_PLAYERS } = require('./config');
const auth = require('./auth');
const playerMod = require('./player');
const roomManager = require('./game-loop');

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
    roomManager.addPlayerToRoom(roomId, socket.id, name, accountType, accountId);
    socket.join('room:' + roomId);
    console.log(`[${socket.id}] joined room ${roomId} as "${name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H });
    for (const oid in room.players) {
      socket.emit('playerInfo', room.getPlayerInfoObj(oid));
    }
    socket.emit('joined');
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
    if (room && room.matchPhase === 'intermission') room.respawnPlayer(socket.id);
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
      const p = room.players[socket.id];
      if (!p || !p.isSpectator) return;
      p.isSpectator = false;
      p.lvl = 1;
      p.exp = 0;
      p.gold = 0;
      playerMod.respawnPlayer(socket.id, room.players, room.zombies);
      playerMod.recalcStats(p);
      room._endGameReady.add(socket.id);
      io.to(socket.id).emit('joinedGame');
    }
  });

  socket.on('joinGame', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleJoinGame(socket.id);
  });

  socket.on('joinQueue', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleJoinGame(socket.id);
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
