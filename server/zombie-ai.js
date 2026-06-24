const {
  WORLD_W, WORLD_H, ZOMBIE_RADIUS, ZOMBIE_COUNT,
  ZOMBIE_MARGIN, SPAWN_MIN_DIST, getZombieStats,
  ZOMBIE_DAMAGE, ZOMBIE_ATTACK_RANGE, ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_STRIKE, ZOMBIE_ATTACK_COOLDOWN
} = require('./config');
const { createZombie, randomZombieSpawn } = require('./zombie');

function recalcZombieTarget(z, players, zombies) {
  let target = null;

  if (z.isStray) {
    let closestD2 = Infinity;
    for (const other of zombies) {
      if (other.id === z.id || !other.alive) continue;
      const dx = other.x - z.x, dy = other.y - z.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestD2) { closestD2 = d2; target = other; }
    }
    if (target) target.strayCalled = true;
  } else if (z.strayCalled) {
    let closestD2 = Infinity;
    for (const other of zombies) {
      if (other.id === z.id || !other.alive || !other.isStray) continue;
      const dx = other.x - z.x, dy = other.y - z.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestD2) { closestD2 = d2; target = other; }
    }
  }

  if (!target) {
    let closestD2 = Infinity;
    for (const id in players) {
      const p = players[id];
      if (!p.alive || p.isSpectator) continue;
      const dx = p.x - z.x, dy = p.y - z.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestD2) { closestD2 = d2; target = p; }
    }
  }

  if (target) {
    if (target.name !== undefined) {
      z.targetPlayerId = target.id;
      z.headingtoward = target.name || target.id;
    } else {
      z.targetPlayerId = null;
      z.headingtoward = String(target.id);
    }
    z.headingAngle = Math.atan2(target.y - z.y, target.x - z.x);
  }
}

function recalcAllZombieTargets(zombies, players) {
  for (const z of zombies) { if (z.alive) recalcZombieTarget(z, players, zombies); }
}

function tickTargeting(zombies, players) {
  for (const z of zombies) {
    if (!z.alive) continue;
    z.recalcTimer--;
    if (z.recalcTimer <= 0) {
      recalcZombieTarget(z, players, zombies);
      if (z.targetPlayerId && players[z.targetPlayerId] && players[z.targetPlayerId].alive && !players[z.targetPlayerId].isSpectator) {
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
    if (!z.alive || z.attacking || z.headingAngle === undefined) continue;
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
  const initialCount = zombies.length;
  for (let i = 0; i < initialCount; i++) {
    const z = zombies[i];
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
        const higher = z.lvl >= other.lvl ? z : other;
        let hpPct;
        if (z.lvl === other.lvl) {
          hpPct = Math.min(1, z.health / z.maxHealth + other.health / other.maxHealth);
        } else {
          hpPct = higher.health / higher.maxHealth;
        }
        zombies.push(createZombie(newLvl, null, mx, my, {
          health: Math.max(1, Math.round(st.health * hpPct)),
          headingtoward: higher.headingtoward,
          headingAngle: higher.headingAngle,
          isStray: (z.isStray || other.isStray) ? Math.random() < 0.5 : false
        }));
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
      z.isStray = Math.random() < 0.2;
      z.strayCalled = false;
      z.alive = true;
      z.attacking = false;
      z.attackTimer = 0;
      z.attackCooldown = 0;
      recalcZombieTarget(z, players, zombies);
      z.recalcTimer = Math.floor(Math.random() * 90);
    }
  }
}

function processZombieAttacks(zombies, players, grid, roomId) {
  const events = [];
  for (const z of zombies) {
    if (!z.alive) continue;

    if (z.attacking) {
      if (z.targetPlayerId && players[z.targetPlayerId] && players[z.targetPlayerId].alive) {
        const p = players[z.targetPlayerId];
        z.headingAngle = Math.atan2(p.y - z.y, p.x - z.x);
      }
      z.attackTimer++;
      if (z.attackTimer === ZOMBIE_ATTACK_STRIKE) {
        const nearby = grid.getNearbyPlayers(z.x, z.y);
        let closestP = null, closestPD2 = Infinity;
        for (const p of nearby) {
          if (!p.alive || p.godMode || p.isSpectator) continue;
          const dx = p.x - z.x, dy = p.y - z.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < closestPD2) { closestPD2 = d2; closestP = p; }
        }
        if (closestP) {
          const dist = Math.sqrt(closestPD2);
          if (dist < z.radius + closestP.radius + ZOMBIE_ATTACK_RANGE) {
            closestP.health -= ZOMBIE_DAMAGE;
            events.push({ type: 'gotHit', to: closestP.id, attackerId: z.id, dmg: ZOMBIE_DAMAGE, health: closestP.health });
            if (closestP.health <= 0 && closestP.alive) {
              closestP.alive = false;
              events.push({ type: 'eliminated', to: closestP.id, kills: closestP.kills });
            }
          }
        }
      }
      if (z.attackTimer >= ZOMBIE_ATTACK_DURATION) {
        z.attacking = false;
        z.attackTimer = 0;
        z.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
      }
      continue;
    }

    if (z.attackCooldown > 0) {
      z.attackCooldown--;
      continue;
    }

    if (z.targetPlayerId && players[z.targetPlayerId]) {
      const p = players[z.targetPlayerId];
      if (p.alive) {
        const dx = p.x - z.x, dy = p.y - z.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < z.radius + p.radius + ZOMBIE_ATTACK_RANGE) {
          z.attacking = true;
          z.attackTimer = 0;
          events.push({ type: 'zombieAttackStart', to: 'room:' + roomId, zombieId: z.id });
        }
      }
    }
  }
  return events;
}

module.exports = {
  recalcZombieTarget, recalcAllZombieTargets,
  tickTargeting, moveAll, processMerge, processZombieAttacks,
  ensureCount, reviveDead
};
