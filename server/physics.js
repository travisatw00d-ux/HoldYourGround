const {
  PLAYER_RADIUS, WORLD_W, WORLD_H, BASE_SPEED, ZOMBIE_DAMAGE
} = require('./config');

function processPlayerMovement(p) {
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

function processPlayerCollision(players) {
  const ids = Object.keys(players);
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
}

function processContactDamage(zombies, grid) {
  const events = [];
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
          events.push({ type: 'eliminated', to: closestP.id, kills: closestP.kills });
        }
      }
    }
  }
  return events;
}

module.exports = { processPlayerMovement, processPlayerCollision, processContactDamage };
