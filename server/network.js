const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PerformanceObserver } = require('perf_hooks');

const { PORT, COLORS, WORLD_W, WORLD_H, MAX_PLAYERS } = require('./config');
const roomManager = require('./game-loop');
const playerMod = require('./player');

const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 15) console.log(`[GC] kind=${entry.kind} dur=${entry.duration.toFixed(1)}ms`);
  }
});
try { gcObserver.observe({ entryTypes: ['gc'], buffered: true }); } catch (e) {}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: false },
  httpCompression: false,
  pingInterval: 10000,
  pingTimeout: 5000
});

const publicDir = path.join(__dirname, '..', 'public');

app.get('/', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(publicDir, 'holdyourground', 'index.html')); });
app.get('/version', (req, res) => { res.set('Cache-Control', 'no-store'); res.send('1'); });
app.use(express.static('public', { setHeaders: (res) => { res.set('Cache-Control', 'no-store'); } }));
app.use('/images', express.static('images', { setHeaders: (res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); } }));
app.get('/health', (req, res) => res.send('OK'));
console.log(`[server] holdyourground on http://localhost:${PORT}`);

function broadcastRoomList() {
  io.emit('roomList', roomManager.getRoomList());
}

io.on('connection', (socket) => {
  console.log(`[${socket.id}] connected`);
  socket.emit('roomList', roomManager.getRoomList());

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
    if (room.getPlayerCount() >= MAX_PLAYERS) { socket.emit('roomFull'); return; }

    roomManager.addPlayerToRoom(roomId, socket.id, name);
    socket.join('room:' + roomId);
    console.log(`[${socket.id}] joined room ${roomId} as "${name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H });
    for (const oid in room.players) {
      socket.emit('playerInfo', room.getPlayerInfoObj(oid));
    }
    socket.emit('joined');
    broadcastRoomList();
  }

  socket.on('respawn', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (room) room.respawnPlayer(socket.id);
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

  socket.on('diagPing', (t) => socket.emit('diagPong', { t }));

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    const roomId = roomManager.removePlayerFromRoom(socket.id);
    if (roomId) {
      io.to('room:' + roomId).emit('playerLeft', socket.id);
      broadcastRoomList();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Hold Your Ground — http://localhost:${PORT}`);
});

roomManager.initGameLoop(io);
