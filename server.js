const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { ITEMS, ANIMATIONS, SWORD_IMG_SIZE, BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y } = require('./public/shared/data.js');

const PORT = process.env.PORT || 3000;
const WORLD_W = 3200;
const WORLD_H = 2400;
const VIEW_W = 800;
const VIEW_H = 600;
const VIEW_MARGIN = 300;
const PLAYER_RADIUS = 20;
const MAX_PLAYERS = 10;
const TICK_MS = 1000 / 30;
const BROADCAST_MS = 55; // network broadcast rate (~18 Hz), decoupled from the 30 Hz sim

// ──── BALANCE CONFIG (edit & restart server) ────
const BASE_SPEED = 13;
const BASE_ATTACK_DMG = 5;
const BASE_ATTACK_SPEED_MS = 800;
const BASE_HEALTH = 100;
const ATTACK_RANGE = 35;
const ATTACK_KNOCKBACK = 6;
const ZOMBIE_COUNT = 100;
const ZOMBIE_RADIUS = 20;
const ZOMBIE_SPEED = 1.5;
const ZOMBIE_HEALTH = 5;
const ZOMBIE_DAMAGE = 1;
const ZOMBIE_MARGIN = 80;
const ATTACK_SPEED_MULT = 4;
const SPAWN_MIN_DIST = 400;

function getZombieStats(lvl) {
  if (lvl <= 5) {
    return { health: 4 + lvl, speed: 1.5 };
  }
  return { health: 12 + lvl, speed: 1.3 };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,           // frontend is served from Cloudflare; allow its origin
    credentials: false
  },
  // Small frequent realtime packets: skip per-packet compression (lower CPU + latency)
  httpCompression: false,
  pingInterval: 10000,
  pingTimeout: 5000
});

// ──── Content-hashed assets ────
// Asset URLs include a hash of the file contents, computed at startup. Every code
// change → new URL, so no browser/CDN/proxy cache can ever serve a stale copy.
// A client-side /version poll auto-reloads players when a new build lands.
const publicDir = path.join(__dirname, 'public');
function hashOf(rel) {
  return crypto.createHash('md5').update(fs.readFileSync(path.join(publicDir, rel))).digest('hex').slice(0, 8);
}
const GAME_HASH = hashOf('game.js');
const DATA_HASH = hashOf('shared/data.js');
const BUILD_TAG = GAME_HASH;

// Templated index.html: inject window.BUILD + hashed asset URLs + an always-visible
// build tag (DOM, not canvas) so the version is provable on the menu AND in-game.
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  .replace('<body>', `<body><div id="btag" style="position:fixed;left:4px;bottom:2px;font:10px monospace;color:rgba(255,255,255,0.55);z-index:9999;pointer-events:none;">b${BUILD_TAG}</div>`)
  .replace(/<script src="\/shared\/data\.js\?v=\d+"><\/script>/, `<script>window.BUILD='${BUILD_TAG}';</script><script src="/data-${DATA_HASH}.js"></script>`)
  .replace(/<script src="game\.js\?v=\d+"><\/script>/, `<script src="/game-${GAME_HASH}.js"></script>`);

app.get('/', (req, res) => { res.set('Cache-Control', 'no-store'); res.type('html').send(indexHtml); });
app.get(`/game-${GAME_HASH}.js`, (req, res) => { res.set('Cache-Control', 'public, max-age=31536000, immutable'); res.sendFile(path.join(publicDir, 'game.js')); });
app.get(`/data-${DATA_HASH}.js`, (req, res) => { res.set('Cache-Control', 'public, max-age=31536000, immutable'); res.sendFile(path.join(publicDir, 'shared/data.js')); });
app.get('/version', (req, res) => { res.set('Cache-Control', 'no-store'); res.send(BUILD_TAG); });

// Other static assets (css, sprites, tool pages) — never cached, always revalidate.
app.use(express.static('public', { setHeaders: (res) => { res.set('Cache-Control', 'no-store'); } }));
app.use('/images', express.static('images'));
app.get('/health', (req, res) => res.send('OK'));
console.log(`[build] game=${GAME_HASH} data=${DATA_HASH} build=${BUILD_TAG}`);

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

let players = {};
let zombies = [];
let colorIndex = 0;
let lastBroadcast = 0;
let lastTickMs = 0;

function randomSpawn(minDist) {
  const margin = PLAYER_RADIUS * 4;
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = margin + Math.random() * (WORLD_W - margin * 2);
    const y = margin + Math.random() * (WORLD_H - margin * 2);
    if (minDist && zombies.length > 0) {
      let tooClose = false;
      for (const z of zombies) {
        if (!z.alive) continue;
        const dx = x - z.x, dy = y - z.y;
        if (dx * dx + dy * dy < minDist * minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
    }
    return { x, y };
  }
  return { x: WORLD_W / 2 + (Math.random() - 0.5) * 200, y: WORLD_H / 2 + (Math.random() - 0.5) * 200 };
}

function randomZombieSpawn() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = ZOMBIE_MARGIN + Math.random() * (WORLD_W - ZOMBIE_MARGIN * 2);
    const y = ZOMBIE_MARGIN + Math.random() * (WORLD_H - ZOMBIE_MARGIN * 2);
    let tooClose = false;
    for (const id in players) {
      const p = players[id];
      if (!p.alive) continue;
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy < SPAWN_MIN_DIST * SPAWN_MIN_DIST) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return { x, y };
  }
  return { x: ZOMBIE_MARGIN + Math.random() * (WORLD_W - ZOMBIE_MARGIN * 2), y: ZOMBIE_MARGIN + Math.random() * (WORLD_H - ZOMBIE_MARGIN * 2) };
}

function recalcStats(p) {
  const item = p.currentItem ? ITEMS[p.currentItem] : null;
  p.speed = BASE_SPEED + (item ? (item.stats.speed || 0) : 0);
  p.attackDmg = BASE_ATTACK_DMG + (item ? (item.stats.attackDmg || 0) : 0);
  p.attackSpeed = BASE_ATTACK_SPEED_MS + (item ? (item.stats.attackSpeed || 0) : 0);
}

function addPlayer(id, name) {
  const spawn = randomSpawn(SPAWN_MIN_DIST);
  const ci = colorIndex++ % COLORS.length;
  players[id] = {
    id,
    name: name || 'Player',
    x: spawn.x, y: spawn.y,
    velX: 0, velY: 0,
    radius: PLAYER_RADIUS,
    color: COLORS[ci],
    alive: true,
    input: { dx: 0, dy: 0 },
    health: BASE_HEALTH,
    maxHealth: BASE_HEALTH,
    attackCooldown: 0,
    facingAngle: 0,
    currentItem: 'wooden_sword',
    inventory: ['wooden_sword'],
    kills: 0,
    lastHitById: null,
    attacking: false,
    attackFrame: 0,
    attackAnim: null,
    attackHitIds: [],
    attackLockedAngle: 0,
    attackStartTime: 0,
    prevCf: -1,
    lvl: 1
  };
  recalcStats(players[id]);
}

function respawnPlayer(id) {
  const p = players[id];
  if (!p) return;
  const spawn = randomSpawn(SPAWN_MIN_DIST);
  p.x = spawn.x; p.y = spawn.y;
  p.velX = 0; p.velY = 0;
  p.alive = true;
  p.input = { dx: 0, dy: 0 };
  p.lastHitById = null;
  p.health = BASE_HEALTH;
  p.attackCooldown = 0;
  p.attacking = false;
  p.attackAnim = null;
  p.attackHitIds = [];
  p.prevCf = -1;
  p.lvl = 1;
  io.to(id).emit('respawned');
}

function initZombies() {
  for (let i = 0; i < ZOMBIE_COUNT; i++) {
    const sp = randomZombieSpawn();
    const st = getZombieStats(1);
    zombies.push({
      id: i,
      x: sp.x, y: sp.y,
      alive: true,
      health: st.health, maxHealth: st.health,
      radius: ZOMBIE_RADIUS,
      speed: st.speed,
      headingtoward: '',
      headingAngle: 0,
      targetPlayerId: null,
      recalcTimer: Math.floor(Math.random() * 90),
      lvl: 1
    });
  }
}

function animTotal(anim) {
  return anim._total || (anim._total = anim.segments.reduce((a, b) => a + b, 0));
}

function interpHitbox(anim, cf) {
  const { keyframes, segments } = anim;
  const total = animTotal(anim);
  const clamped = Math.max(0, Math.min(cf, total - 1));
  let accum = 0;
  for (let i = 0; i < segments.length; i++) {
    const segLen = segments[i];
    if (clamped < accum + segLen) {
      let t = (clamped - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = keyframes[i], b = keyframes[i + 1];
      return {
        offsetX: a.offsetX + (b.offsetX - a.offsetX) * t,
        offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t
      };
    }
    accum += segLen;
  }
  return keyframes[keyframes.length - 1];
}

function distToSegSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  const cx = ax + abx * t, cy = ay + aby * t;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy;
}

function checkSwordHit(p) {
  const totalFrames = animTotal(p.attackAnim);
  const totalTicks = Math.ceil(totalFrames / (2 * ATTACK_SPEED_MULT));
  const currentCf = Math.min(Math.floor((p.attackFrame / totalTicks) * totalFrames), totalFrames - 1);
  const bladeW = 12;
  const angle = (p.attacking && p.attackLockedAngle != null) ? p.attackLockedAngle : (p.facingAngle || 0);

  const cfs = [];
  if (p.prevCf >= 0 && p.prevCf !== currentCf) {
    const span = currentCf - p.prevCf;
    const steps = Math.min(8, Math.ceil(span));
    for (let s = 1; s <= steps; s++) {
      cfs.push(p.prevCf + span * (s / steps));
    }
  } else {
    cfs.push(currentCf);
  }
  p.prevCf = currentCf;

  // Use spatial grid to only check nearby entities
  const nearbyPlayers = grid.getNearbyPlayers(p.x, p.y);
  const nearbyZombies = grid.getNearbyZombies(p.x, p.y);

  for (let si = 0; si < cfs.length; si++) {
    const cf = cfs[si];
    const vis = interpHitbox(p.attackAnim, cf);
    if (!vis) continue;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rx = vis.offsetX * cos - vis.offsetY * sin;
    const ry = vis.offsetX * sin + vis.offsetY * cos;
    const sx = p.x + rx, sy = p.y + ry;
    const scale = vis.scale;
    const rot = angle + (vis.rotation || 0);
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const tipX = sx + (BLADE_TIP_X * cosR - BLADE_TIP_Y * sinR) * scale;
    const tipY = sy + (BLADE_TIP_X * sinR + BLADE_TIP_Y * cosR) * scale;
    const hiltX = sx + (BLADE_HILT_X * cosR - BLADE_HILT_Y * sinR) * scale;
    const hiltY = sy + (BLADE_HILT_X * sinR + BLADE_HILT_Y * cosR) * scale;

    for (const t of nearbyPlayers) {
      if (t.id === p.id || !t.alive) continue;
      if (p.attackHitIds.includes(t.id)) continue;
      const d2 = distToSegSq(t.x, t.y, hiltX, hiltY, tipX, tipY);
      if (d2 < (bladeW + t.radius) * (bladeW + t.radius)) {
        t.health -= p.attackDmg;
        const kx = t.x - p.x, ky = t.y - p.y;
        const kd = Math.sqrt(kx * kx + ky * ky) || 1;
        t.velX += (kx / kd) * ATTACK_KNOCKBACK;
        t.velY += (ky / kd) * ATTACK_KNOCKBACK;
        p.attackHitIds.push(t.id);
        if (t.health <= 0) {
          t.alive = false;
          p.kills++;
          io.to(t.id).emit('eliminated', { kills: t.kills });
        }
        io.to(p.id).emit('hitConfirm', { targetId: t.id, dmg: p.attackDmg, x: t.x, y: t.y });
        io.to(t.id).emit('gotHit', { attackerId: p.id, dmg: p.attackDmg, health: Math.max(0, t.health) });
      }
    }

    for (const z of nearbyZombies) {
      if (!z.alive) continue;
      if (p.attackHitIds.includes(z.id)) continue;
      const d2 = distToSegSq(z.x, z.y, hiltX, hiltY, tipX, tipY);
      if (d2 < (bladeW + z.radius) * (bladeW + z.radius)) {
        z.health -= p.attackDmg;
        const kzx = z.x - p.x, kzy = z.y - p.y;
        const kzd = Math.sqrt(kzx * kzx + kzy * kzy) || 1;
        z.x += (kzx / kzd) * ATTACK_KNOCKBACK * 3;
        z.y += (kzy / kzd) * ATTACK_KNOCKBACK * 3;
        p.attackHitIds.push(z.id);
        if (z.health <= 0) {
          z.alive = false;
          p.kills++;
        }
        io.to(p.id).emit('hitConfirm', { targetId: z.id, dmg: p.attackDmg, x: z.x, y: z.y });
      }
    }
  }
}

// Flat-array spatial grid (bounded world): integer indexing, no string keys,
// and per-grid reused scratch arrays so neighbor queries allocate nothing.
class SpatialGrid {
  constructor(cellSize, worldW, worldH) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldW / cellSize) + 1;
    this.rows = Math.ceil(worldH / cellSize) + 1;
    this.count = this.cols * this.rows;
    this.zombieCells = new Array(this.count);
    this.playerCells = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.zombieCells[i] = [];
      this.playerCells[i] = [];
    }
    this.playerScratch = [];
    this.zombieScratch = [];
  }

  clear() {
    const zc = this.zombieCells, pc = this.playerCells, n = this.count;
    for (let i = 0; i < n; i++) { zc[i].length = 0; pc[i].length = 0; }
  }

  clearZombies() {
    const zc = this.zombieCells, n = this.count;
    for (let i = 0; i < n; i++) zc[i].length = 0;
  }

  insertZombie(z) {
    const c = this.cols, cs = this.cellSize, rows = this.rows;
    let cx = (z.x / cs) | 0; if (cx < 0) cx = 0; else if (cx >= c) cx = c - 1;
    let cy = (z.y / cs) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    this.zombieCells[cy * c + cx].push(z);
  }

  insertPlayer(p) {
    const c = this.cols, cs = this.cellSize, rows = this.rows;
    let cx = (p.x / cs) | 0; if (cx < 0) cx = 0; else if (cx >= c) cx = c - 1;
    let cy = (p.y / cs) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    this.playerCells[cy * c + cx].push(p);
  }

  _query(cells, x, y, result) {
    result.length = 0;
    const c = this.cols, cs = this.cellSize, rows = this.rows;
    let cx = (x / cs) | 0; if (cx < 0) cx = 0; else if (cx >= c) cx = c - 1;
    let cy = (y / cs) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    const x0 = cx - 1 < 0 ? 0 : cx - 1;
    const x1 = cx + 1 >= c ? c - 1 : cx + 1;
    const y0 = cy - 1 < 0 ? 0 : cy - 1;
    const y1 = cy + 1 >= rows ? rows - 1 : cy + 1;
    for (let yy = y0; yy <= y1; yy++) {
      const base = yy * c;
      for (let xx = x0; xx <= x1; xx++) {
        const cell = cells[base + xx];
        for (let i = 0, n = cell.length; i < n; i++) result.push(cell[i]);
      }
    }
    return result;
  }

  getNearbyZombies(x, y) { return this._query(this.zombieCells, x, y, this.zombieScratch); }
  getNearbyPlayers(x, y) { return this._query(this.playerCells, x, y, this.playerScratch); }
}

const grid = new SpatialGrid(120, WORLD_W, WORLD_H);
const mergeToRemove = new Set();
let zombieIdCounter = 100000;
function nextZombieId() { return zombieIdCounter++; }

// ──── Binary state protocol ────
// One compact Buffer per viewer per broadcast instead of a large JSON object.
// Little-endian. Layout:
//   header: u8 ver | u16 arenaW | u16 arenaH | u16 serverLevel | u8 playerCount | u16 zombieCount
//   per player: u8 idLen | id bytes | f32 x | f32 y | i16 health | u8 alive | u8 attacking |
//               f32 facingAngle | f32 attackLockedAngle | f64 attackStartTime | i16 kills | u8 lvl
//   per zombie: i32 id | f32 x | f32 y | i16 health | f32 headingAngle | u8 lvl | u8 alive
function buildPlayerBlock(list) {
  let size = 0;
  for (let i = 0; i < list.length; i++) size += 1 + Buffer.byteLength(list[i].id, 'utf8') + 31;
  const buf = Buffer.allocUnsafe(size);
  let o = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const idBytes = Buffer.from(p.id, 'utf8');
    buf[o++] = idBytes.length;
    idBytes.copy(buf, o); o += idBytes.length;
    buf.writeFloatLE(p.x, o); o += 4;
    buf.writeFloatLE(p.y, o); o += 4;
    buf.writeInt16LE(Math.round(p.health), o); o += 2;
    buf[o++] = p.alive ? 1 : 0;
    buf[o++] = p.attacking ? 1 : 0;
    buf.writeFloatLE(p.facingAngle || 0, o); o += 4;
    buf.writeFloatLE(p.attackLockedAngle || 0, o); o += 4;
    buf.writeDoubleLE(p.attackStartTime || 0, o); o += 8;
    buf.writeInt16LE(p.kills || 0, o); o += 2;
    buf[o++] = p.lvl || 1;
  }
  return buf;
}

function buildStateBuffer(playerBlock, playerCount, serverLevel, viewZombies, emitTime) {
  const zCount = viewZombies.length;
  const buf = Buffer.allocUnsafe(18 + playerBlock.length + zCount * 20);
  let o = 0;
  buf[o++] = 1;
  buf.writeDoubleLE(emitTime, o); o += 8;
  buf.writeUInt16LE(WORLD_W, o); o += 2;
  buf.writeUInt16LE(WORLD_H, o); o += 2;
  buf.writeUInt16LE(serverLevel, o); o += 2;
  buf[o++] = playerCount;
  buf.writeUInt16LE(zCount, o); o += 2;
  playerBlock.copy(buf, o); o += playerBlock.length;
  for (let i = 0; i < zCount; i++) {
    const z = viewZombies[i];
    buf.writeInt32LE(z.id, o); o += 4;
    buf.writeFloatLE(z.x, o); o += 4;
    buf.writeFloatLE(z.y, o); o += 4;
    buf.writeInt16LE(Math.round(z.health), o); o += 2;
    buf.writeFloatLE(z.headingAngle || 0, o); o += 4;
    buf[o++] = z.lvl || 1;
    buf[o++] = z.alive ? 1 : 0;
  }
  return buf;
}

function playerInfoObj(p) {
  return {
    id: p.id, name: p.name, color: p.color,
    currentItem: p.currentItem, inventory: p.inventory,
    maxHealth: p.maxHealth, speed: p.speed, attackDmg: p.attackDmg, attackSpeed: p.attackSpeed,
    lvl: p.lvl || 1
  };
}

function recalcZombieTarget(z) {
  let closestP = null, closestD2 = Infinity;
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const dx = p.x - z.x, dy = p.y - z.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestD2) { closestD2 = d2; closestP = p; }
  }
  if (closestP) {
    z.targetPlayerId = closestP.id;
    z.headingtoward = closestP.name || closestP.id;
    z.headingAngle = Math.atan2(closestP.y - z.y, closestP.x - z.x);
  }
}

function recalcAllZombieTargets() {
  for (const z of zombies) { if (z.alive) recalcZombieTarget(z); }
}
function gameTick() {
  const tickStart = Date.now();
  const ids = Object.keys(players);
  if (ids.length === 0) return;

  for (const id of ids) {
    const p = players[id];
    if (!p.alive) continue;

    if (p.attackCooldown > 0) p.attackCooldown--;

    p.velX += p.input.dx * p.speed * 0.12;
    p.velY += p.input.dy * p.speed * 0.12;
    p.velX *= 0.88;
    p.velY *= 0.88;

    const speed = Math.sqrt(p.velX * p.velX + p.velY * p.velY);
    if (speed > p.speed) {
      p.velX = (p.velX / speed) * p.speed;
      p.velY = (p.velY / speed) * p.speed;
    }

    p.x += p.velX;
    p.y += p.velY;
    p.x = Math.max(PLAYER_RADIUS, Math.min(WORLD_W - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(WORLD_H - PLAYER_RADIUS, p.y));
  }

  // Build spatial grid for this tick's position snapshot
  grid.clear();
  for (const z of zombies) { if (z.alive) grid.insertZombie(z); }
  for (const id in players) { const p = players[id]; if (p.alive) grid.insertPlayer(p); }

  // Periodic zombie target recalculation: far zombies every 90 ticks (3s), close ones every 15 ticks (0.5s)
  for (const z of zombies) {
    if (!z.alive) continue;
    z.recalcTimer--;
    if (z.recalcTimer <= 0) {
      recalcZombieTarget(z);
      if (z.targetPlayerId && players[z.targetPlayerId] && players[z.targetPlayerId].alive) {
        const tp = players[z.targetPlayerId];
        const dx = z.x - tp.x, dy = z.y - tp.y;
        z.recalcTimer = (dx * dx + dy * dy) < 700 * 700 ? 15 : 90;
      } else {
        z.recalcTimer = 90;
      }
    }
  }

  // movement for ALL zombies every tick
  for (const z of zombies) {
    if (!z.alive || z.headingAngle === undefined) continue;
    const mx = Math.cos(z.headingAngle) * z.speed;
    const my = Math.sin(z.headingAngle) * z.speed;
    z.x += mx;
    z.y += my;
    z.x = Math.max(z.radius, Math.min(WORLD_W - z.radius, z.x));
    z.y = Math.max(z.radius, Math.min(WORLD_H - z.radius, z.y));
  }

  // Rebuild zombie grid after movement for accurate contact-damage / merge checks
  grid.clearZombies();
  for (const z of zombies) { if (z.alive) grid.insertZombie(z); }

  // contact damage: each zombie checks nearby players via grid
  for (const z of zombies) {
    if (!z.alive) continue;
    const nearby = grid.getNearbyPlayers(z.x, z.y);
    let closestP = null, closestPD2 = Infinity;
    for (const p of nearby) {
      if (!p.alive) continue;
      const dx = p.x - z.x, dy = p.y - z.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestPD2) { closestPD2 = d2; closestP = p; }
    }
    if (closestP) {
      const dist = Math.sqrt(closestPD2);
      if (dist < z.radius + closestP.radius && closestP.alive) {
        closestP.health -= ZOMBIE_DAMAGE;
        if (closestP.health <= 0 && closestP.alive) {
          closestP.alive = false;
          io.to(closestP.id).emit('eliminated', { kills: closestP.kills });
        }
      }
    }
  }

  for (let i = 0; i < ids.length; i++) {
    const a = players[ids[i]];
    if (!a.alive) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = players[ids[j]];
      if (!b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.radius + b.radius;

      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        a.lastHitById = b.id;
        b.lastHitById = a.id;

        const relVel = (b.velX - a.velX) * nx + (b.velY - a.velY) * ny;
        if (relVel < 0) {
          const impulse = relVel * 0.9;
          a.velX += impulse * nx;
          a.velY += impulse * ny;
          b.velX -= impulse * nx;
          b.velY -= impulse * ny;
        }
      }
    }
  }

  // process sword swings
  for (const id of ids) {
    const p = players[id];
    if (!p.alive || !p.attacking) continue;
    checkSwordHit(p);
    p.attackFrame++;
    const totalFrames = animTotal(p.attackAnim);
    const totalTicks = Math.ceil(totalFrames / (2 * ATTACK_SPEED_MULT));
    if (p.attackFrame >= totalTicks) {
      p.attacking = false;
      p.attackAnim = null;
      p.attackHitIds = [];
      p.prevCf = -1;
      p.attackCooldown = Math.round(p.attackSpeed / TICK_MS);
    }
  }

  // zombie-zombie collision → merge (spatial grid, avoids O(n²))
  mergeToRemove.clear();
  let mergeCount = 0;
  for (const z of zombies) {
    if (!z.alive || mergeToRemove.has(z.id) || mergeCount >= 8) continue;
    const nearby = grid.getNearbyZombies(z.x, z.y);
    for (const other of nearby) {
      if (other.id === z.id || !other.alive || mergeToRemove.has(other.id)) continue;
      const dx = other.x - z.x, dy = other.y - z.y;
      if (dx * dx + dy * dy < (z.radius + other.radius) * (z.radius + other.radius)) {
        mergeToRemove.add(z.id);
        mergeToRemove.add(other.id);
        const mx = (z.x + other.x) / 2, my = (z.y + other.y) / 2;
        const newLvl = z.lvl + other.lvl;
        const st = getZombieStats(newLvl);
        let hpPct;
        if (z.lvl === other.lvl) {
          hpPct = Math.min(1, z.health / z.maxHealth + other.health / other.maxHealth);
        } else {
          const higher = z.lvl > other.lvl ? z : other;
          hpPct = higher.health / higher.maxHealth;
        }
        zombies.push({
          id: nextZombieId(),
          x: mx, y: my, alive: true,
          health: Math.max(1, Math.round(st.health * hpPct)),
          maxHealth: st.health,
          radius: ZOMBIE_RADIUS, speed: st.speed,
          headingtoward: '', headingAngle: 0,
          targetPlayerId: null,
          recalcTimer: Math.floor(Math.random() * 90),
          lvl: newLvl
        });
        io.emit('zombieMerge', { x: mx, y: my });
        mergeCount++;
        break;
      }
    }
  }
  if (mergeToRemove.size > 0) {
    let w = 0;
    for (let r = 0; r < zombies.length; r++) {
      if (!mergeToRemove.has(zombies[r].id)) zombies[w++] = zombies[r];
    }
    zombies.length = w;
  }

  // ensure exactly 100 zombies
  while (zombies.length < ZOMBIE_COUNT) {
    const sp = randomZombieSpawn();
    const st = getZombieStats(1);
    zombies.push({
      id: nextZombieId(),
      x: sp.x, y: sp.y, alive: true,
      health: st.health, maxHealth: st.health,
      radius: ZOMBIE_RADIUS, speed: st.speed,
      headingtoward: '', headingAngle: 0,
      targetPlayerId: null,
      recalcTimer: Math.floor(Math.random() * 90),
      lvl: 1
    });
  }

  // respawn dead zombies
  for (const z of zombies) {
    if (!z.alive) {
      const sp = randomZombieSpawn();
      const st = getZombieStats(1);
      z.x = sp.x; z.y = sp.y;
      z.health = st.health;
      z.maxHealth = st.health;
      z.speed = st.speed;
      z.lvl = 1;
      z.headingAngle = 0;
      z.alive = true;
      recalcZombieTarget(z);
      z.recalcTimer = Math.floor(Math.random() * 90);
    }
  }

  // Network broadcast is decoupled from the 30 Hz sim: only serialize/emit at
  // ~BROADCAST_MS intervals. The simulation above still runs every tick.
  if (tickStart - lastBroadcast < BROADCAST_MS) return;
  lastBroadcast = tickStart;

  // Shared player list + server level (computed once, reused for every viewer).
  const playerList = [];
  let serverLevelSum = 0;
  for (const id in players) {
    const p = players[id];
    serverLevelSum += p.lvl || 1;
    playerList.push(p);
  }
  const playerBlock = buildPlayerBlock(playerList);
  const currentServerLevel = serverLevelSum;

  // Per-player view-culled binary state. Smaller packets => far less TCP
  // head-of-line blocking jitter on lossy links.
  const halfVW = VIEW_W / 2 + VIEW_MARGIN;
  const halfVH = VIEW_H / 2 + VIEW_MARGIN;
  const emitTime = Date.now();
  for (const id in players) {
    const p = players[id];
    if (!p) continue;
    const viewZ = [];
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z.alive) continue;
      const dzx = z.x - p.x; if (dzx < -halfVW || dzx > halfVW) continue;
      const dzy = z.y - p.y; if (dzy < -halfVH || dzy > halfVH) continue;
      viewZ.push(z);
    }
    // volatile: if this client can't keep up, drop stale state instead of buffering
    io.to(id).volatile.emit('state', buildStateBuffer(playerBlock, playerList.length, currentServerLevel, viewZ, emitTime));
  }
  const tickMs = Date.now() - tickStart;
  lastTickMs = tickMs;
  if (tickMs > 30) console.log(`tick=${tickMs}ms players=${ids.length} zombies=${zombies.length}`);
}

initZombies();
// Drift-compensating fixed-timestep loop: holds a true 30 Hz sim even under
// event-loop jitter, catching up (bounded) if a tick runs late instead of
// silently slowing down like setInterval does.
let nextTickAt = Date.now();
const MAX_TICKS_PER_WAKE = 5;
function tickLoop() {
  const now = Date.now();
  let steps = 0;
  while (now >= nextTickAt && steps < MAX_TICKS_PER_WAKE) {
    gameTick();
    nextTickAt += TICK_MS;
    steps++;
  }
  if (Date.now() - nextTickAt > TICK_MS * MAX_TICKS_PER_WAKE) {
    nextTickAt = Date.now(); // fell too far behind — resync, don't spiral
  }
  setTimeout(tickLoop, Math.max(0, nextTickAt - Date.now()));
}
setTimeout(tickLoop, TICK_MS);

io.on('connection', (socket) => {
  console.log(`[${socket.id}] connected`);

  socket.on('join', ({ name }) => {
    if (Object.keys(players).length >= MAX_PLAYERS) {
      socket.emit('lobbyFull');
      return;
    }
    addPlayer(socket.id, name);
    recalcAllZombieTargets();
    console.log(`[${socket.id}] joined as "${players[socket.id].name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H });
    // Send identity/stats for everyone (rare meta channel) so the client can
    // merge them with the binary state stream.
    for (const oid in players) {
      socket.emit('playerInfo', playerInfoObj(players[oid]));
    }
    io.to(socket.id).emit('playerInfo', playerInfoObj(players[socket.id]));
    socket.emit('joined');
  });

  socket.on('respawn', () => {
    respawnPlayer(socket.id);
  });

  socket.on('input', ({ dx, dy, angle }) => {
    if (players[socket.id]) {
      players[socket.id].input = { dx, dy };
      if (typeof angle === 'number') players[socket.id].facingAngle = angle;
    }
  });

  socket.on('attack', ({ facingAngle }) => {
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
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (slot >= 0 && slot < p.inventory.length) {
      p.currentItem = p.inventory[slot];
      recalcStats(p);
      io.emit('playerInfo', playerInfoObj(p));
    }
  });

  // Diagnostics echo (round-trip latency for the client overlay)
  socket.on('diagPing', (t) => socket.emit('diagPong', { t, tickMs: lastTickMs }));

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Hold Your Ground — http://localhost:${PORT}`);
});
