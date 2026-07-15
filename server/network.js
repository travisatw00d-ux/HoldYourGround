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
// /images must be registered BEFORE the general 'public' static mount below.
// There's a stale, out-of-date duplicate at public/images/ (leftover from an
// older layout) that also matches /images/* requests — Express static
// middleware falls through to the next matching mount only when a file isn't
// found, so whichever mount is registered first "wins" for any file that
// exists in both. With 'public' registered first, requests for files that
// exist in both copies (e.g. spritesheet.png) were silently served from the
// stale public/images/ copy instead of the actively-maintained top-level
// images/ folder — this is why the loot.png sprite (added 2026-07-11 to
// images/spritesheet.png/.json) never showed up in-game even though the file
// on disk was correct. Registering /images first makes the real, always-fresh
// (no-cache) folder authoritative.
app.use('/images', express.static('images', { setHeaders: (res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); } }));
app.use(express.static('public', { setHeaders: (res) => { res.set('Cache-Control', 'no-store'); } }));
app.use('/workflow', express.static('Workflow', { setHeaders: (res) => { res.set('Cache-Control', 'no-store'); } }));
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
  const name = socket.account?.displayName || socket._guestName || 'anon';
  try { require('./stats-tracker').recordVisit(name); } catch (e) {}
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

// Graceful shutdown (2026-07-12) — a routine deploy/restart on Fly.io sends
// SIGTERM (with a grace period) before hard-killing the process. Without
// this, every currently-connected player's equipment/exp changes since
// their last save would be silently lost: equipment only saves when a
// player LEAVES a room (room.js's removePlayer -> _saveEquipment) and exp/
// gold only saves at match end (_endMatch -> _saveRound), so anything still
// in-progress at the exact moment the process died would otherwise never
// reach the database. Best-effort save of every connected account across
// every room, then exit. Does NOT protect against a true hard crash/OOM-
// kill/power-loss — there's no signal to catch in that case — but that
// failure mode is non-destructive either way: the account's last
// successfully saved state is untouched, never corrupted, just not as
// fresh as it could be (same class of gap exp/gold already had before this
// feature existed; not something a signal handler can fully close, only
// shrink — a deliberate scope decision, see Workflow/editing-server.md).
// Master chest (2026-07-14) is the one exception to "just shrinks the gap" —
// room.js's _saveMasterChest() fires immediately after every chest mutation
// (not just at leave/match-end), per Travis's requirement that chest
// contents must never be lost, so this shutdown path is redundant defense
// for it rather than its only safety net the way it is for equipment/exp.
let shuttingDown = false;

function saveAllConnectedPlayers() {
  let savedCount = 0;
  for (const room of roomManager.rooms.values()) {
    for (const id in room.players) {
      const p = room.players[id];
      if (p && p.accountId) { room._saveEquipment(p); room._saveMasterChest(p); savedCount++; }
    }
    try { room._saveRound(); } catch (e) { console.error(`[shutdown] _saveRound failed for room ${room.id}:`, e); }
  }
  return savedCount;
}

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — saving connected players before exit...`);
  let savedCount = 0;
  try { savedCount = saveAllConnectedPlayers(); } catch (e) { console.error('[shutdown] save pass failed:', e); }
  console.log(`[shutdown] saved ${savedCount} player(s), exiting`);
  server.close(() => process.exit(0));
  // Safety net in case server.close() hangs on lingering keep-alive sockets
  // — the saves above already completed synchronously (better-sqlite3 is
  // sync), so it's safe to force-exit shortly after regardless.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
