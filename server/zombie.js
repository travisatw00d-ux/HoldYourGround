const {
  WORLD_W, WORLD_H, ZOMBIE_RADIUS, ZOMBIE_COUNT,
  ZOMBIE_MARGIN, SPAWN_MIN_DIST, getZombieStats
} = require('./config');

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

function createZombie(lvl, players, x, y, overrides) {
  const sp = (x != null && y != null) ? { x, y } : randomZombieSpawn(players);
  const st = getZombieStats(lvl);
  const z = {
    id: nextZombieId(),
    x: sp.x, y: sp.y,
    alive: true,
    health: st.health, maxHealth: st.health,
    radius: ZOMBIE_RADIUS,
    speed: st.speed,
    headingtoward: '',
    headingAngle: undefined,
    targetPlayerId: null,
    recalcTimer: Math.floor(Math.random() * 90),
    isStray: Math.random() < 0.2,
    strayCalled: false,
    lvl,
    attacking: false,
    attackTimer: 0,
    attackCooldown: 0
  };
  if (overrides) Object.assign(z, overrides);
  return z;
}

function initZombies(players) {
  const zombies = [];
  for (let i = 0; i < ZOMBIE_COUNT; i++) {
    zombies.push(createZombie(1, players));
  }
  return zombies;
}

module.exports = { randomZombieSpawn, createZombie, initZombies };
