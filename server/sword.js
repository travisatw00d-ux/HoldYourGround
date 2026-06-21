const { BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y, ATTACK_SPEED_MULT, ATTACK_KNOCKBACK } = require('./config');

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

function checkSwordHit(p, zombies, players, grid) {
  const events = [];
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
      if (t.godMode) continue;
      const d2 = distToSegSq(t.x, t.y, hiltX, hiltY, tipX, tipY);
      if (d2 < (bladeW + t.radius) * (bladeW + t.radius)) {
        t.health -= p.attackDmg;
        const kx = t.x - p.x, ky = t.y - p.y;
        const kd = Math.sqrt(kx * kx + ky * ky) || 1;
        t.velX += (kx / kd) * ATTACK_KNOCKBACK;
        t.velY += (ky / kd) * ATTACK_KNOCKBACK;
        p.attackHitIds.push(t.id);
        events.push({ type: 'hitConfirm', to: p.id, targetId: t.id, dmg: p.attackDmg, x: t.x, y: t.y });
        if (t.health <= 0) {
          t.alive = false;
          p.kills++;
          events.push({ type: 'eliminated', to: t.id, kills: t.kills });
        }
        events.push({ type: 'gotHit', to: t.id, attackerId: p.id, dmg: p.attackDmg, health: Math.max(0, t.health) });
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
        events.push({ type: 'hitConfirm', to: p.id, targetId: z.id, dmg: p.attackDmg, x: z.x, y: z.y });
      }
    }
  }
  return events;
}

module.exports = { animTotal, interpHitbox, distToSegSq, checkSwordHit };
