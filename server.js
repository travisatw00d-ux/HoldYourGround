const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { setIo } = require('./server/io.js');
const { addPlayer, respawnPlayer, recalcStats, getPlayers, initZombies } = require('./server/game-state.js');
const { gameTick } = require('./server/tick.js');
const { MAX_PLAYERS, WORLD_W, WORLD_H, TICK_MS } = require('./server/config.js');
const { ANIMATIONS } = require('./public/shared/data.js');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://iolegends.com", "https://www.iolegends.com"],
    credentials: true
  }
});

setIo(io);

app.use(express.static('public'));
app.use('/images', express.static('images'));
app.get('/health', (req, res) => res.send('OK'));

initZombies();
setInterval(gameTick, TICK_MS);

io.on('connection', (socket) => {
  console.log(`[${socket.id}] connected`);

  socket.on('join', ({ name }) => {
    if (Object.keys(getPlayers()).length >= MAX_PLAYERS) {
      socket.emit('lobbyFull');
      return;
    }
    addPlayer(socket.id, name);
    console.log(`[${socket.id}] joined as "${getPlayers()[socket.id].name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H });
    socket.emit('joined');
  });

  socket.on('respawn', () => {
    respawnPlayer(socket.id);
  });

  socket.on('input', ({ dx, dy, angle }) => {
    const players = getPlayers();
    if (players[socket.id]) {
      players[socket.id].input = { dx, dy };
      if (typeof angle === 'number') players[socket.id].facingAngle = angle;
    }
  });

  socket.on('attack', ({ facingAngle }) => {
    const players = getPlayers();
    const p = players[socket.id];
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
    io.to(socket.id).emit('attackStart', { lockedAngle: p.attackLockedAngle });
  });

  socket.on('equip', ({ slot }) => {
    const players = getPlayers();
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (slot >= 0 && slot < p.inventory.length) {
      p.currentItem = p.inventory[slot];
      recalcStats(p);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    const players = getPlayers();
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Hold Your Ground — http://localhost:${PORT}`);
});
