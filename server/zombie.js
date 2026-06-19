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

function createZombie(lvl, players, x, y) {
  const sp = x != null ? { x, y } : randomZombieSpawn(players);
  const st = getZombieStats(lvl);
  return {
    id: nextZombieId(),
    x: sp.x, y: sp.y,
    alive: true,
    health: st.health, maxHealth: st.health,
    radius: ZOMBIE_RADIUS,
    speed: st.speed,
    headingtoward: '',
    headingAngle: 0,
    targetPlayerId: null,
    recalcTimer: Math.floor(Math.random() * 90),
    lvl
  };
}

function initZombies(players) {
  const zombies = [];
  for (let i = 0; i < ZOMBIE_COUNT; i++) {
    zombies.push(createZombie(1, players));
  }
  return zombies;
}

function recalcZombieTarget(z, players) {
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

function recalcAllZombieTargets(zombies, players) {
  for (const z of zombies) { if (z.alive) recalcZombieTarget(z, players); }
}

function tickTargeting(zombies, players) {
  for (const z of zombies) {
    if (!z.alive) continue;
    z.recalcTimer--;
    if (z.recalcTimer <= 0) {
      recalcZombieTarget(z, players);
      if (z.targetPlayerId && players[z.targetPlayerId] && players[z.targetPlayerId].alive) {
        const tp = players[z.targetPlayerId];
        const dx = z.x - tp.x, dy = z.y - tp.y;
        z.recalcTimer = (dx * dx + dy * dy) < 700 * 700 ? 15 : 90;
      } else {
        z.recalcTimer = 90;
      }
    }
  }
}

function moveAll(zombies) {
  for (const z of zombies) {
    if (!z.alive || z.headingAngle === undefined) continue;
    const mx = Math.cos(z.headingAngle) * z.speed;
    const my = Math.sin(z.headingAngle) * z.speed;
    z.x += mx;
    z.y += my;
    z.x = Math.max(z.radius, Math.min(WORLD_W - z.radius, z.x));
    z.y = Math.max(z.radius, Math.min(WORLD_H - z.radius, z.y));
  }
}

function processMerge(zombies, grid) {
  const events = [];
  const mergeToRemove = new Set();
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
        events.push({ type: 'zombieMerge', x: mx, y: my });
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
  return events;
}

function ensureCount(zombies, players) {
  while (zombies.length < ZOMBIE_COUNT) {
    zombies.push(createZombie(1, players));
  }
}

function reviveDead(zombies, players) {
  for (const z of zombies) {
    if (!z.alive) {
      const sp = randomZombieSpawn(players);
      const st = getZombieStats(1);
      z.x = sp.x; z.y = sp.y;
      z.health = st.health;
      z.maxHealth = st.health;
      z.speed = st.speed;
      z.lvl = 1;
      z.headingAngle = 0;
      z.alive = true;
      recalcZombieTarget(z, players);
      z.recalcTimer = Math.floor(Math.random() * 90);
    }
  }
}

module.exports = {
  initZombies, recalcZombieTarget, recalcAllZombieTargets,
  tickTargeting, moveAll, processMerge, ensureCount, reviveDead
};
