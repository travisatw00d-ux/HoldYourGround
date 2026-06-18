const { ITEMS } = require('../public/shared/data.js');
const {
  WORLD_W, WORLD_H, PLAYER_RADIUS, BASE_HEALTH,
  BASE_SPEED, BASE_ATTACK_DMG, BASE_ATTACK_SPEED_MS,
  SPAWN_MIN_DIST, ZOMBIE_MARGIN, ZOMBIE_COUNT,
  ZOMBIE_RADIUS, COLORS, getZombieStats
} = require('./config.js');
const io = require('./io.js').getIo();

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

function getPlayers() { return players; }

module.exports = {
  players, zombies, colorIndex,
  getPlayers,
  addPlayer, respawnPlayer, recalcStats,
  initZombies, randomSpawn, randomZombieSpawn
};
