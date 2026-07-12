const { WORLD_W, WORLD_H, MAX_PLAYERS } = require('./config');
const auth = require('./auth');
const playerMod = require('./player');
const roomManager = require('./game-loop');
const expMod = require('./exp');
const { getStats24h, recordVisit } = require('./stats-tracker');
const os = require('os');
const fs = require('fs');
const path = require('path');

const CLIENT_DIAG_DIR = path.join(__dirname, '..', 'diagnostics');
const activeSessions = new Map();

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
      const accountId = result.account.id;
      if (activeSessions.has(accountId) && activeSessions.get(accountId) !== socket.id) {
        socket.emit('authError', 'Already logged in — close other tab first');
        return;
      }
      activeSessions.set(accountId, socket.id);
      socket.account = result.account;
      recordVisit(result.account.displayName);
      socket.emit('authSuccess', { account: result.account, rooms: roomManager.getRoomList() });
      console.log(`[${socket.id}] logged in as "${result.account.username}"`);
    } else {
      socket.emit('authError', result.error);
    }
  });

  socket.on('playAsGuest', ({ name }) => {
    socket._guestName = name;
    recordVisit(name);
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
    let accountType = 'guest';
    if (socket.account) {
      accountType = socket.account.isAdmin ? 'admin' : (socket.account.accountType || 'basic');
    }
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
    socket.emit('itemDropsInit', { drops: room.getItemDropsList() });
    socket.emit('lobbyUpdate', { players: room.getFilteredLobbyPlayers() });
    socket.emit('matchPhase', { phase: room.matchPhase, timer: room.phaseTimer, wave: room.currentWave, activePlayers: room.getActivePlayerIds() });
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

  socket.on('input', ({ dx, dy, angle, sprint }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleInput(socket.id, { dx, dy, angle, sprint });
  });

  socket.on('attack', ({ facingAngle }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleAttack(socket.id, facingAngle);
  });

  socket.on('equip', ({ slot }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleEquip(socket.id, slot);
  });

  socket.on('moveItem', ({ from, to }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handleMoveItem(socket.id, from, to);
  });

  socket.on('pickupItem', ({ id }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.handlePickupItem(socket.id, id);
  });

  socket.on('fullscreen', ({ enabled }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.setFullscreen(socket.id, enabled);
  });

  socket.on('cameraZoom', (data) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.setCameraZoom(socket.id, data);
  });

  socket.on('toggleAttackStyle', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    p.attackStyle = p.attackStyle === 'jab' ? 'swing' : 'jab';
    socket.emit('attackStyleChanged', { attackStyle: p.attackStyle });
    const info = playerMod.playerInfoObj(p);
    for (const oid in room.players) {
      room.io.to(oid).emit('playerInfo', info);
    }
  });

  socket.on('toggleGodMode', () => {
    if (!socket.account?.isAdmin) return;
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) {
      const enabled = room.toggleGodMode(socket.id);
      socket.emit('godModeToggled', { enabled });
    }
  });

  socket.on('killAllMobs', () => {
    if (!socket.account?.isAdmin) return;
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.killAllMobs();
  });

  socket.on('adminAdvancePhase', () => {
    if (!socket.account?.isAdmin) return;
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room._advancePhase();
  });

  socket.on('adminSetLevel', ({ delta }) => {
    if (!socket.account?.isAdmin) return;
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    const prevLvl = p.lvl || 1;
    p.lvl = Math.max(1, prevLvl + delta);
    const levelGain = Math.max(0, p.lvl - prevLvl);
    p.statPoints = (p.statPoints || 0) + levelGain;
    const totalExp = expMod.cumulativeExp(p.lvl, 0);
    p.exp = totalExp;
    room._persistedExp.set(socket.id, totalExp);
    playerMod.recalcStats(p);
    const expResult = expMod.fromCumulativeExp(p.exp);
    socket.emit('accountUpdate', { exp: expResult.exp, level: expResult.level, expToNext: expMod.getExpToNext(expResult.level), gold: p.gold, statPoints: p.statPoints });
    for (const oid in room.players) {
      room.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(p));
    }
  });

  socket.on('spendStatPoint', ({ stat }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p || !p.alive || p.isSpectator || !p.statPoints) return;
    const validStats = ['maxHealth', 'maxEnergy', 'speed', 'attackDmg'];
    if (!validStats.includes(stat)) return;
    p.statPoints--;
    if (!p.investedPoints) p.investedPoints = {};
    p.investedPoints[stat] = (p.investedPoints[stat] || 0) + 1;
    playerMod.recalcStats(p);
    const expResult = require('./exp').fromCumulativeExp(p.exp);
    socket.emit('accountUpdate', { exp: expResult.exp, level: expResult.level, expToNext: require('./exp').getExpToNext(expResult.level), gold: p.gold, statPoints: p.statPoints });
    for (const oid in room.players) {
      room.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(p));
    }
  });

  const BUILD_CYCLE = ['standard', 'glassCannon', 'tank'];

  socket.on('setBuild', ({ build }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    if (BUILD_CYCLE.includes(build) && build !== p.playerBuild) {
      const totalEarned = Object.values(p.investedPoints || {}).reduce((a, b) => a + b, 0) + (p.statPoints || 0);
      p.investedPoints = {};
      p.statPoints = totalEarned;
      p.playerBuild = build;
      playerMod.recalcStats(p);
      if (p.health > p.maxHealth) p.health = p.maxHealth;
      for (const oid in room.players) {
        room.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(p));
      }
    }
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

  socket.on('diagPing', (t) => {
    socket._lastDiagPing = Date.now();
    socket.emit('diagPong', { t });
  });

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
      io.to(socket.id).emit('matchReset', { readyPlayers: [socket.id], activePlayers: room.getActivePlayerIds() });
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
    p.sprint = false;
    p.sprintEndCooldown = 0;
    const living = Object.values(room.players).find(p2 => p2.alive && p2.id !== socket.id);
    if (living) { p.x = living.x; p.y = living.y; }
    for (const oid in room.players) {
      room.io.to(oid).emit('playerInfo', room.getPlayerInfoObj(p));
    }
    socket.emit('spectatorAssigned');
    room._assignFollowTarget(socket.id);
  });

  socket.on('spectateTarget', ({ targetId }) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) {
      const p = room.players[socket.id];
      if (p && (p.isSpectator || !p.alive)) {
        room.spectatorFollows.set(socket.id, targetId);
      }
    }
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

  socket.on('admin:getStats', () => {
    if (!socket.account?.isAdmin) return;
    let totalPlayers = 0;
    const rooms = [];
    for (const [id, r] of roomManager.rooms) {
      const pc = r.getPlayerCount();
      totalPlayers += pc;
      rooms.push({
        id, phase: r.matchPhase, wave: r.currentWave,
        level: r.currentServerLevel, players: pc,
        zombies: r.zombies ? r.zombies.filter(z => z.alive).length : 0,
        tickNum: r.tickNum
      });
    }
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const cpuSec = (cpu.user + cpu.system) / 1000000;
    const cpuCores = os.cpus().length;
    socket.emit('admin:stats', {
      uptime: Math.floor(process.uptime()),
      activeRooms: roomManager.rooms.size,
      totalPlayers,
      lobbyCount: io.engine?.clientsCount || 0,
      build: process.env.BUILD || '',
      rooms,
      ...getStats24h()
    });
  });

  let _prevCpu = null;
  let _prevCpuTime = 0;

  socket.on('admin:getServerStats', () => {
    if (!socket.account?.isAdmin) return;
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const now = Date.now();
    const uptime = process.uptime();
    const cores = os.cpus().length;
    const lifetimeCpu = ((cpu.user + cpu.system) / 1000000 / Math.max(1, uptime) / cores * 100).toFixed(1);
    let realtimeCpu = null;
    if (_prevCpu && _prevCpuTime) {
      const dt = (now - _prevCpuTime) / 1000;
      if (dt > 0) {
        const du = (cpu.user - _prevCpu.user + cpu.system - _prevCpu.system) / 1000000;
        realtimeCpu = (du / dt / cores * 100).toFixed(1);
      }
    }
    _prevCpu = cpu;
    _prevCpuTime = now;
    socket.emit('admin:serverStats', {
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      heapMB: Math.round(mem.heapUsed / 1024 / 1024),
      cpuCores: cores,
      cpuLoad: lifetimeCpu + '%',
      cpuRealtime: realtimeCpu !== null ? realtimeCpu + '%' : '\u2014'
    });
  });

  socket.on('admin:getPlayers', () => {
    if (!socket.account?.isAdmin) return;
    const players = [];
    for (const [id, s] of io.sockets.sockets) {
      const name = s.account?.displayName || s._guestName || 'Unknown';
      const accountType = s.account?.accountType || (s._guestName ? 'guest' : 'anonymous');
      const room = roomManager.getPlayerRoom(id);
      players.push({ name, accountType, room: room ? room.id : 'lobby' });
    }
    players.sort((a, b) => a.name.localeCompare(b.name));
    socket.emit('admin:playerList', { players, count: players.length });
  });

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    if (socket.account) activeSessions.delete(socket.account.id);
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
