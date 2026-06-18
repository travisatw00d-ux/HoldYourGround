const { TICK_MS, ATTACK_SPEED_MULT, WORLD_W, WORLD_H } = require('./config.js');
const { ANIMATIONS } = require('../public/shared/data.js');
const { players, zombies } = require('./game-state.js');
const { checkSwordHit } = require('./combat.js');
const { moveZombies, mergeZombies, maintainZombieCount } = require('./zombie-ai.js');
const io = require('./io.js').getIo();

function resolvePlayerCollisions() {
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

function processAttacks() {
  for (const id in players) {
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
}

function buildState() {
  return {
    players: Object.values(players).map(p => ({
      id: p.id,
      x: p.x, y: p.y,
      name: p.name, color: p.color,
      alive: p.alive, kills: p.kills,
      health: p.health, maxHealth: p.maxHealth,
      speed: p.speed, attackDmg: p.attackDmg, attackSpeed: p.attackSpeed,
      facingAngle: p.facingAngle,
      attacking: p.attacking,
      attackStartTime: p.attackStartTime,
      attackLockedAngle: p.attackLockedAngle,
      currentItem: p.currentItem,
      inventory: p.inventory,
      lvl: p.lvl || 1
    })),
    zombies: zombies.map(z => ({
      id: z.id,
      x: z.x, y: z.y,
      alive: z.alive,
      health: z.health,
      maxHealth: z.maxHealth,
      headingtoward: z.headingtoward,
      headingAngle: z.headingAngle || 0,
      isStray: !!z.isStray,
      strayCalled: !!z.strayCalled,
      lvl: z.lvl || 1
    })),
    serverLevel: Object.values(players).reduce((sum, p) => sum + (p.lvl || 1), 0),
    arenaWidth: WORLD_W,
    arenaHeight: WORLD_H
  };
}

function gameTick() {
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
    p.x = Math.max(20, Math.min(WORLD_W - 20, p.x));
    p.y = Math.max(20, Math.min(WORLD_H - 20, p.y));
  }

  moveZombies();
  resolvePlayerCollisions();
  processAttacks();
  mergeZombies();
  maintainZombieCount();

  io.emit('state', buildState());
}

module.exports = { gameTick };
