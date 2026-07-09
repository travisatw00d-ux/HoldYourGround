const {
  WORLD_W, WORLD_H, ZOMBIE_RADIUS,
  ZOMBIE_DAMAGE, ZOMBIE_ATTACK_RANGE, ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_STRIKE, ZOMBIE_ATTACK_COOLDOWN
} = require('./config');
const { createEnemy, randomZombieSpawn } = require('./zombie');
const { MOB_TYPES, getRandomSpawnLevel, getMobStats } = require('./mob-config');

function recalcZombieTarget(z, players) {
  if (z.wanderTimer > 0) return;

  let target = null;
  let closestD2 = Infinity;
  for (const id in players) {
    const p = players[id];
    if (!p.alive || p.isSpectator) continue;
    const dx = p.x - z.x, dy = p.y - z.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestD2) { closestD2 = d2; target = p; }
  }

  if (target) {
    z.targetPlayerId = target.id;
    z.headingtoward = target.name || target.id;
    const slotIdx = z.id % 8;
    const slotAngle = slotIdx * Math.PI * 0.25;
    const slotDist = 100 + (z.id % 5) * 20;
    const dz = Math.sqrt((target.x - z.x) * (target.x - z.x) + (target.y - z.y) * (target.y - z.y));
    const lead = dz < 200 ? 1.0 : dz < 500 ? 2.0 : 3.0;
    const tx = target.x + (target.velX || 0) * lead + Math.cos(slotAngle) * slotDist;
    const ty = target.y + (target.velY || 0) * lead + Math.sin(slotAngle) * slotDist;
    z.headingAngle = dz < 200 ? Math.atan2(target.y - z.y, target.x - z.x) : Math.atan2(ty - z.y, tx - z.x);
  }
}

function recalcAllZombieTargets(zombies, players) {
  for (const z of zombies) { if (z.alive) recalcZombieTarget(z, players); }
}

function tickTargeting(zombies, players) {
  for (const z of zombies) {
    if (!z.alive) continue;
    if (z.wanderTimer > 0) {
      z.wanderTimer--;
      if (z.wanderTimer % 90 === 0) {
        z.wanderDir = Math.random() * Math.PI * 2;
      }
      z.headingAngle = z.wanderDir;
      continue;
    }
    z.recalcTimer--;
    if (z.recalcTimer <= 0) {
      recalcZombieTarget(z, players);
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

function moveAll(zombies, players) {
  for (const z of zombies) {
    if (!z.alive || z.attacking || z.headingAngle === undefined) continue;
    // Stop at attack range — don't walk into the player
    if (z.targetPlayerId && players[z.targetPlayerId]) {
      const tp = players[z.targetPlayerId];
      if (tp && tp.alive) {
        const dx = tp.x - z.x, dy = tp.y - z.y;
        if (dx * dx + dy * dy < (z.radius + tp.radius + ZOMBIE_ATTACK_RANGE) ** 2) continue;
      }
    }
    let spd = z.speed;
    // Edge-spawned zombies have boosted speed for first 10 seconds
    if (z._edgeSpawnTimer > 0) {
      spd *= 3.0;
      z._edgeSpawnTimer--;
    } else if (z.targetPlayerId && players) {
      const tp = players[z.targetPlayerId];
      if (tp && tp.alive) {
        const dx = tp.x - z.x, dy = tp.y - z.y;
        if (dx * dx + dy * dy < 250 * 250) spd *= 1.8;
      }
    }
    const mx = Math.cos(z.headingAngle) * spd;
    const my = Math.sin(z.headingAngle) * spd;
    z.x += mx;
    z.y += my;
    z.x = Math.max(z.radius, Math.min(WORLD_W - z.radius, z.x));
    z.y = Math.max(z.radius, Math.min(WORLD_H - z.radius, z.y));
  }
}

function ensureCount(zombies, spawnPool, serverLevel, players, maxAlive, edgeSpawn) {
  if (zombies.length >= spawnPool.length) return;
  let alive = 0;
  for (const z of zombies) { if (z.alive) alive++; }
  const room = Math.min(maxAlive - alive, spawnPool.length - zombies.length);
  if (room <= 0) return;
  for (let i = 0; i < room; i++) {
    if (zombies.length >= spawnPool.length) break;
    const mt = spawnPool[zombies.length];
    if (!mt) break;
    const level = getRandomSpawnLevel(serverLevel, mt.unlockLevel) || 1;
    zombies.push(createEnemy(mt, level, players, null, null, edgeSpawn));
  }
}

function reviveDead(zombies, players, serverLevel) {
  for (const z of zombies) {
    if (!z.alive) {
      const mobType = MOB_TYPES[z.mobType];
      const level = getRandomSpawnLevel(serverLevel, mobType.unlockLevel) || 1;
      const stats = getMobStats(mobType, level);
      const sp = randomZombieSpawn(players);
      z.x = sp.x; z.y = sp.y;
      z.health = stats.health;
      z.maxHealth = stats.health;
      z.speed = +(stats.speed * (0.8 + Math.random() * 0.4)).toFixed(2);
      z.lvl = level;
      z.headingAngle = 0;
      z.wanderTimer = Math.random() < 0.2 ? 300 + Math.floor(Math.random() * 600) : 0;
      z.wanderDir = Math.random() * Math.PI * 2;
      z.alive = true;
      z.attacking = false;
      z.attackTimer = 0;
      z.attackCooldown = 0;
      recalcZombieTarget(z, players);
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
          events.push({ type: 'zombieAttackStart', to: 'room:' + roomId, zombieId: z.id, mobType: z.mobType });
        }
      }
    }
  }
  return events;
}

function processZombieSeparation(zombies, grid) {
  for (const z of zombies) {
    if (!z.alive) continue;
    const nearby = grid.getNearbyZombies(z.x, z.y);
    for (const other of nearby) {
      if (other.id === z.id || !other.alive) continue;
      const dx = other.x - z.x, dy = other.y - z.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = ZOMBIE_RADIUS * 2;
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        const nx = dx / dist, ny = dy / dist;
        z.x -= nx * overlap * 0.5;
        z.y -= ny * overlap * 0.5;
        other.x += nx * overlap * 0.5;
        other.y += ny * overlap * 0.5;
      }
    }
  }
}

let wallTick = 0;
function processWallCohesion(zombies, grid) {
  wallTick++;
  if (wallTick % 30 !== 0) return;
  for (const z of zombies) {
    if (!z.alive) continue;
    const nearby = grid.getNearbyZombies(z.x, z.y);
    let closest = null, closestD2 = Infinity;
    for (const other of nearby) {
      if (other.id === z.id || !other.alive) continue;
      const dx = other.x - z.x, dy = other.y - z.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestD2 && d2 < 6400) { closestD2 = d2; closest = other; }
    }
    if (!closest) continue;
    const dist = Math.sqrt(closestD2);
    if (dist < 30) {
      const nx = (closest.x - z.x) / dist, ny = (closest.y - z.y) / dist;
      const push = (30 - dist) * 0.5;
      z.x -= nx * push; z.y -= ny * push;
      closest.x += nx * push; closest.y += ny * push;
    } else if (dist > 70) {
      const nx = (closest.x - z.x) / dist, ny = (closest.y - z.y) / dist;
      const pull = (dist - 70) * 0.3;
      z.x += nx * pull; z.y += ny * pull;
    }
  }
}
function spawnKiterResponse(zombies, spawnPool, serverLevel, players, maxAlive) {
  let remaining = Math.min(maxAlive, spawnPool.length) - zombies.length;
  if (remaining <= 0 || zombies.length >= spawnPool.length) return;

  for (const id in players) {
    if (remaining <= 0) break;
    const p = players[id];
    if (!p.alive || p.isSpectator) continue;
    if (p.input.dx === 0 && p.input.dy === 0) continue;

    const moveAngle = Math.atan2(p.input.dy, p.input.dx);
    // Only respond if some zombies are behind the player
    let zombiesBehind = false;
    for (const z of zombies) {
      if (!z.alive) continue;
      const dzx = z.x - p.x, dzy = z.y - p.y;
      if (dzx * dzx + dzy * dzy > 500 * 500) continue;
      const a = Math.atan2(dzy, dzx) - moveAngle;
      if (Math.abs(a) > Math.PI / 2) { zombiesBehind = true; break; }
    }
    if (!zombiesBehind) continue;

    // Spawn from a world edge in the movement direction
    const side = moveAngle > -Math.PI / 4 && moveAngle <= Math.PI / 4 ? 1 :
      moveAngle > Math.PI / 4 && moveAngle <= 3 * Math.PI / 4 ? 2 :
      moveAngle > 3 * Math.PI / 4 || moveAngle < -3 * Math.PI / 4 ? 3 : 0;
    let sx, sy;
    switch (side) {
      case 0: sx = p.x + (Math.random() - 0.5) * WORLD_W * 0.5; sy = -80; break;
      case 1: sx = WORLD_W + 80; sy = p.y + (Math.random() - 0.5) * WORLD_H * 0.5; break;
      case 2: sx = p.x + (Math.random() - 0.5) * WORLD_W * 0.5; sy = WORLD_H + 80; break;
      case 3: sx = -80; sy = p.y + (Math.random() - 0.5) * WORLD_H * 0.5; break;
    }

    if (zombies.length >= spawnPool.length) break;
    const mt = spawnPool[zombies.length];
    const level = getRandomSpawnLevel(serverLevel, mt.unlockLevel) || 1;
    zombies.push(createEnemy(mt, level, players, sx, sy, true));
    remaining--;
  }
}

module.exports = {
  recalcZombieTarget, recalcAllZombieTargets,
  tickTargeting, moveAll, processZombieSeparation, processZombieAttacks,
  ensureCount, reviveDead, processWallCohesion, spawnKiterResponse
};
