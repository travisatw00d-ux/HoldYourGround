const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PerformanceObserver } = require('perf_hooks');

const { PORT } = require('./config');
const roomManager = require('./game-loop');
const registerSocket = require('./socket-handlers');

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

const lobbySockets = new Set();

function broadcastRoomList() {
  io.emit('roomList', roomManager.getRoomList());
}

function broadcastLobbyUpdate(room) {
  const data = { players: room.getFilteredLobbyPlayers() };
  io.to('room:' + room.id).emit('lobbyUpdate', data);
}

function joinLobby(socket) {
  lobbySockets.add(socket.id);
  broadcastLobbyCount();
}

function leaveLobby(socket) {
  lobbySockets.delete(socket.id);
  broadcastLobbyCount();
}

function broadcastLobbyCount() {
  io.emit('lobbyCount', { count: lobbySockets.size });
}

const handlerContext = { io, broadcastRoomList, broadcastLobbyUpdate, joinLobby, leaveLobby };

io.on('connection', (socket) => registerSocket(socket, handlerContext));

server.listen(PORT, () => {
  console.log(`Hold Your Ground — http://localhost:${PORT}`);
});

roomManager.initGameLoop(io);
