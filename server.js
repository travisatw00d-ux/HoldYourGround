const express = require('express');
const http = require('http');
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

// ──── BALANCE CONFIG (edit & restart server) ────
const BASE_SPEED = 13;
const BASE_ATTACK_DMG = 5;
const BASE_ATTACK_SPEED_MS = 800;
const BASE_HEALTH = 100;
const ATTACK_RANGE = 35;
const ATTACK_KNOCKBACK = 6;
const ZOMBIE_COUNT = 60;
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
    origin: ["https://iolegends.com", "https://www.iolegends.com"],
    credentials: true
  }
});

app.use(express.static('public'));
app.use('/images', express.static('images'));
app.get('/health', (req, res) => res.send('OK'));

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

let players = {};
let zombies = [];
let colorIndex = 0;

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
      id: `zombie_${i}`,
      x: sp.x, y: sp.y,
      alive: true,
      health: st.health, maxHealth: st.health,
      radius: ZOMBIE_RADIUS,
      speed: st.speed,
      headingtoward: '',
      headingAngle: 0,
      isStray: Math.random() < 0.2,
      strayCalled: false,
      lvl: 1
    });
  }
}

function interpHitbox(anim, cf) {
  const { keyframes, segments } = anim;
  const total = segments.reduce((a, b) => a + b, 0);
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
  const totalFrames = p.attackAnim.segments.reduce((a, b) => a + b, 0);
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

// Simple spatial hash grid for O(n) neighbor lookups
class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.zombieCells = new Map();
    this.playerCells = new Map();
  }

  _key(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  clear() {
    this.zombieCells.clear();
    this.playerCells.clear();
  }

  insertZombie(z) {
    const k = this._key(z.x, z.y);
    let arr = this.zombieCells.get(k);
    if (!arr) { arr = []; this.zombieCells.set(k, arr); }
    arr.push(z);
  }

  insertPlayer(p) {
    const k = this._key(p.x, p.y);
    let arr = this.playerCells.get(k);
    if (!arr) { arr = []; this.playerCells.set(k, arr); }
    arr.push(p);
  }

  _getNearby(cells, x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${cx + dx},${cy + dy}`;
        const cell = cells.get(k);
        if (cell) { for (let i = 0; i < cell.length; i++) result.push(cell[i]); }
      }
    }
    return result;
  }

  getNearbyZombies(x, y) { return this._getNearby(this.zombieCells, x, y); }
  getNearbyPlayers(x, y) { return this._getNearby(this.playerCells, x, y); }
}

let zombieAIStep = 0;
const grid = new SpatialGrid(120);
const playerSnapPool = [];
const zombieSnapPool = [];
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

  // staggered zombie target search using spatial grid (groups of 20, each group searches every 5th tick)
  const AI_GROUP_SIZE = 20;
  const searchStart = (zombieAIStep % 5) * AI_GROUP_SIZE;
  const searchEnd = Math.min(searchStart + AI_GROUP_SIZE, zombies.length);
  for (let i = searchStart; i < searchEnd; i++) {
    const z = zombies[i];
    if (!z.alive) continue;
    let target = null;

    if (z.isStray) {
      const nearby = grid.getNearbyZombies(z.x, z.y);
      let closestD2 = Infinity;
      for (const other of nearby) {
        if (other.id === z.id || !other.alive) continue;
        const dx = other.x - z.x, dy = other.y - z.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) { closestD2 = d2; target = other; }
      }
    } else if (z.strayCalled) {
      const nearby = grid.getNearbyZombies(z.x, z.y);
      let closestD2 = Infinity;
      for (const other of nearby) {
        if (other.id === z.id || !other.alive || !other.isStray) continue;
        const dx = other.x - z.x, dy = other.y - z.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) { closestD2 = d2; target = other; }
      }
    }

    if (!target) {
      const nearby = grid.getNearbyPlayers(z.x, z.y);
      let closestD2 = Infinity;
      for (const p of nearby) {
        if (!p.alive) continue;
        const dx = p.x - z.x, dy = p.y - z.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) { closestD2 = d2; target = p; }
      }
    }

    if (target) {
      z.headingtoward = target.name || target.id || '';
      z.headingAngle = Math.atan2(target.y - z.y, target.x - z.x);
      if (z.isStray && target.isStray !== undefined) target.strayCalled = true;
    }
  }
  zombieAIStep++;

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
  grid.zombieCells.clear();
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
    const totalFrames = p.attackAnim.segments.reduce((a, b) => a + b, 0);
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
  const mergeToRemove = new Set();
  for (const z of zombies) {
    if (!z.alive || mergeToRemove.has(z.id)) continue;
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
          id: `zombie_${Date.now()}_${Math.random()}`,
          x: mx, y: my, alive: true,
          health: Math.max(1, Math.round(st.health * hpPct)),
          maxHealth: st.health,
          radius: ZOMBIE_RADIUS, speed: st.speed,
          headingtoward: '', headingAngle: 0,
          isStray: (z.isStray || other.isStray) ? Math.random() < 0.5 : false, strayCalled: false, lvl: newLvl
        });
        io.emit('zombieMerge', { x: mx, y: my });
        break;
      }
    }
  }
  zombies = zombies.filter(z => !mergeToRemove.has(z.id));

  // ensure exactly 100 zombies
  while (zombies.length < ZOMBIE_COUNT) {
    const sp = randomZombieSpawn();
    const st = getZombieStats(1);
    zombies.push({
      id: `zombie_${Date.now()}_${Math.random()}`,
      x: sp.x, y: sp.y, alive: true,
      health: st.health, maxHealth: st.health,
      radius: ZOMBIE_RADIUS, speed: st.speed,
      headingtoward: '', headingAngle: 0,
      isStray: Math.random() < 0.2, strayCalled: false, lvl: 1
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
      z.isStray = Math.random() < 0.2;
      z.strayCalled = false;
      z.alive = true;
    }
  }

  // Reusable snapshot pools — avoids allocating new objects every tick
  let snapIdx = 0;

  for (const id in players) {
    const p = players[id];
    let s;
    if (snapIdx < playerSnapPool.length) {
      s = playerSnapPool[snapIdx];
    } else {
      s = {};
      playerSnapPool.push(s);
    }
    s.id = p.id; s.x = p.x; s.y = p.y;
    s.name = p.name; s.color = p.color;
    s.alive = p.alive; s.kills = p.kills;
    s.health = p.health; s.maxHealth = p.maxHealth;
    s.speed = p.speed; s.attackDmg = p.attackDmg; s.attackSpeed = p.attackSpeed;
    s.facingAngle = p.facingAngle;
    s.attacking = p.attacking;
    s.attackStartTime = p.attackStartTime;
    s.attackLockedAngle = p.attackLockedAngle;
    s.currentItem = p.currentItem;
    s.inventory = p.inventory;
    s.lvl = p.lvl || 1;
    snapIdx++;
  }
  playerSnapPool.length = snapIdx;

  const currentServerLevel = Object.values(players).reduce((sum, p) => sum + (p.lvl || 1), 0);

  // Per-player view-culled state: each client only receives zombies near their viewport
  let zSnapIdx = 0;
  for (const id in players) {
    const p = players[id];
    if (!p) continue;

    const halfVW = VIEW_W / 2 + VIEW_MARGIN;
    const halfVH = VIEW_H / 2 + VIEW_MARGIN;

    zSnapIdx = 0;
    for (const z of zombies) {
      if (!z.alive) continue;
      const dzx = Math.abs(z.x - p.x);
      const dzy = Math.abs(z.y - p.y);
      if (dzx > halfVW || dzy > halfVH) continue;
      let s;
      if (zSnapIdx < zombieSnapPool.length) {
        s = zombieSnapPool[zSnapIdx];
      } else {
        s = {};
        zombieSnapPool.push(s);
      }
      s.id = z.id; s.x = z.x; s.y = z.y;
      s.alive = z.alive;
      s.health = z.health; s.maxHealth = z.maxHealth;
      s.headingtoward = z.headingtoward;
      s.headingAngle = z.headingAngle || 0;
      s.isStray = !!z.isStray;
      s.strayCalled = !!z.strayCalled;
      s.lvl = z.lvl || 1;
      zSnapIdx++;
    }
    zombieSnapPool.length = zSnapIdx;

    io.to(id).emit('state', {
      arenaWidth: WORLD_W,
      arenaHeight: WORLD_H,
      serverLevel: currentServerLevel,
      players: playerSnapPool.slice(0, snapIdx),
      zombies: zombieSnapPool.slice(0, zSnapIdx)
    });
  }
  const tickMs = Date.now() - tickStart;
  if (tickMs > 30) console.log(`tick=${tickMs}ms players=${ids.length} zombies=${zombies.length}`);
}

initZombies();
setInterval(gameTick, TICK_MS);

io.on('connection', (socket) => {
  console.log(`[${socket.id}] connected`);

  socket.on('join', ({ name }) => {
    if (Object.keys(players).length >= MAX_PLAYERS) {
      socket.emit('lobbyFull');
      return;
    }
    addPlayer(socket.id, name);
    console.log(`[${socket.id}] joined as "${players[socket.id].name}"`);
    socket.emit('init', { id: socket.id, arenaWidth: WORLD_W, arenaHeight: WORLD_H });
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
    }
  });

  socket.on('disconnect', () => {
    console.log(`[${socket.id}] disconnected`);
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Hold Your Ground — http://localhost:${PORT}`);
});
