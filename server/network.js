const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PerformanceObserver } = require('perf_hooks');

const { PORT, COLORS, WORLD_W, WORLD_H, MAX_PLAYERS } = require('./config');
const gameLoop = require('./game-loop');
const playerMod = require('./player');

// GC observer for diagnostics
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 15) console.log(`[GC] kind=${entry.kind} dur=${entry.duration.toFixed(1)}ms`);
  }
});
try { gcObserver.observe({ entryTypes: ['gc'], buffered: true }); } catch (e) {}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: false
  },
  httpCompression: false,
  pingInterval: 10000,
  pingTimeout: 5000
});

const publicDir = path.join(__dirname, '..', 'public');

app.get('/', (req, res) => { res.sendFile(path.join(publicDir, 'holdyourground', 'index.html')); });
app.get('/version', (req, res) => { res.set('Cache-Control', 'no-store'); res.send('1'); });
app.use(express.static('public', { setHeaders: (res) => { res.set('Cache-Control', 'no-store'); } }));
app.use('/images', express.static('images'));
app.get('/health', (req, res) => res.send('OK'));
console.log(`[server] holdyourground on http://localhost:${PORT}`);

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`[${socket.id}] connected`);

  socket.on('join', ({ name }) => {
    if (gameLoop.getPlayerCount() >= MAX_PLAYERS) {
      socket.emit('lobbyFull');
      return;
    }
    gameLoop.addPlayer(socket.id, name);
    const players = gameLoop.getPlayers();
    console.log(`[${socket.id}] joined as "${players[socket.id].name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H });
    for (const oid in players) {
      socket.emit('playerInfo', gameLoop.getPlayerInfoObj(oid));
    }
    socket.emit('joined');
  });

  socket.on('respawn', () => {
    gameLoop.respawnPlayer(socket.id);
  });

  socket.on('input', ({ dx, dy, angle }) => {
    gameLoop.handleInput(socket.id, { dx, dy, angle });
  });

  socket.on('attack', ({ facingAngle }) => {
    gameLoop.handleAttack(socket.id, facingAngle);
  });

  socket.on('equip', ({ slot }) => {
    gameLoop.handleEquip(socket.id, slot);
  });

  socket.on('diagPing', (t) => socket.emit('diagPong', { t }));

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    const players = gameLoop.getPlayers();
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Hold Your Ground — http://localhost:${PORT}`);
});

// Start the game loop
gameLoop.initGameLoop(io);
