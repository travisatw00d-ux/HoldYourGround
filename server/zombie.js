const {
  WORLD_W, WORLD_H, ZOMBIE_RADIUS,
  ZOMBIE_MARGIN, SPAWN_MIN_DIST
} = require('./config');
const { MOB_TYPES, getUnlockedMobs, getRandomSpawnLevel, getSpawnCountRange, getMobStats } = require('./mob-config');

function randomZombieSpawn(players) {
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

let zombieIdCounter = 100000;
function nextZombieId() { return zombieIdCounter++; }

function createEnemy(mobType, level, players, x, y, overrides) {
  const sp = (x != null && y != null) ? { x, y } : randomZombieSpawn(players);
  const stats = getMobStats(mobType, level);
  const z = {
    id: nextZombieId(),
    mobType: MOB_TYPES.indexOf(mobType),
    x: sp.x, y: sp.y,
    alive: true,
    health: stats.health, maxHealth: stats.health,
    radius: ZOMBIE_RADIUS,
    speed: stats.speed,
    headingtoward: '',
    headingAngle: undefined,
    targetPlayerId: null,
    recalcTimer: Math.floor(Math.random() * 90),
    wanderTimer: Math.random() < 0.2 ? 300 + Math.floor(Math.random() * 600) : 0,
    wanderDir: Math.random() * Math.PI * 2,
    lvl: level,
    attacking: false,
    attackTimer: 0,
    attackCooldown: 0
  };
  z.speed = +(z.speed * (0.8 + Math.random() * 0.4)).toFixed(2);
  if (overrides) Object.assign(z, overrides);
  return z;
}

// Build a shuffled spawn pool with guaranteed counts per mob type
function buildSpawnPool(serverLevel) {
  const unlocked = getUnlockedMobs(serverLevel);
  if (unlocked.length === 0) return [];

  const maxMobs = 100 + (serverLevel - 1);

  // Allocate min counts for each unlocked mob type, track max cap
  const pools = unlocked.map(mt => {
    const range = getSpawnCountRange(mt, serverLevel);
    return { mobType: mt, count: range.min, max: range.max };
  });

  // Fill remaining slots up to maxMobs by cycling through unlocked types (respecting max cap)
  let total = pools.reduce((s, p) => s + p.count, 0);
  while (total < maxMobs) {
    let anyFilled = false;
    for (const p of pools) {
      if (total >= maxMobs) break;
      if (p.count < p.max) {
        p.count++;
        total++;
        anyFilled = true;
      }
    }
    if (!anyFilled) break; // all at max cap
  }

  // Build flat array and shuffle (Fisher-Yates)
  const pool = [];
  for (const p of pools) {
    for (let i = 0; i < p.count; i++) {
      pool.push(p.mobType);
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool;
}

// Spawn enemies from a pre-built pool, calculating levels from the given serverLevel
function initEnemies(spawnPool, serverLevel, players) {
  const zombies = [];
  for (const mt of spawnPool) {
    const level = getRandomSpawnLevel(serverLevel, mt.unlockLevel) || 1;
    zombies.push(createEnemy(mt, level, players));
  }
  return zombies;
}

module.exports = { randomZombieSpawn, createEnemy, buildSpawnPool, initEnemies };
