const { BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y, BLADE_W, ATTACK_SPEED_MULT, ATTACK_KNOCKBACK, KNIGHT_BLADE_TIP_X, KNIGHT_BLADE_TIP_Y, KNIGHT_BLADE_HILT_X, KNIGHT_BLADE_HILT_Y } = require('./config');

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
  const bladeW = BLADE_W;
  const angle = (p.attacking && p.attackLockedAngle != null) ? p.attackLockedAngle : (p.facingAngle || 0);

  // Swing only deals damage on the forward swing (first half)
  const halfFrames = p.attackStyle === 'swing' ? Math.floor(totalFrames / 2) : totalFrames;

  const cfs = [];
  if (p.prevCf >= 0 && p.prevCf !== currentCf) {
    const span = currentCf - p.prevCf;
    const steps = Math.min(8, Math.ceil(span));
    for (let s = 1; s <= steps; s++) {
      const cf = p.prevCf + span * (s / steps);
      if (cf < halfFrames) cfs.push(cf);
    }
  } else if (currentCf < halfFrames) {
    cfs.push(currentCf);
  }
  p.prevCf = currentCf;
  if (cfs.length === 0) return events;

  const nearbyZombies = grid.getNearbyZombies(p.x, p.y);

  for (let si = 0; si < cfs.length; si++) {
    const cf = cfs[si];
    const vis = interpHitbox(p.attackAnim, cf);
    if (!vis) continue;
    const isKnight = p.playerClass === 'knight';
    const btX = isKnight ? KNIGHT_BLADE_TIP_X : BLADE_TIP_X;
    const btY = isKnight ? KNIGHT_BLADE_TIP_Y : BLADE_TIP_Y;
    const bhX = isKnight ? KNIGHT_BLADE_HILT_X : BLADE_HILT_X;
    const bhY = isKnight ? KNIGHT_BLADE_HILT_Y : BLADE_HILT_Y;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rx = vis.offsetX * cos - vis.offsetY * sin;
    const ry = vis.offsetX * sin + vis.offsetY * cos;
    const sx = p.x + rx, sy = p.y + ry;
    const scale = vis.scale;
    const rot = angle + (vis.rotation || 0);
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const tipX = sx + (btX * cosR - btY * sinR) * scale;
    const tipY = sy + (btX * sinR + btY * cosR) * scale;
    const hiltX = sx + (bhX * cosR - bhY * sinR) * scale;
    const hiltY = sy + (bhX * sinR + bhY * cosR) * scale;

    for (const z of nearbyZombies) {
      if (!z.alive) continue;
      if (p.attackHitIds.includes(z.id)) continue;
      const d2 = distToSegSq(z.x, z.y, hiltX, hiltY, tipX, tipY);
      if (d2 < (bladeW + z.radius) * (bladeW + z.radius)) {
        const dmgMult = p.attackStyle === 'swing' ? 0.7 : 1.0;
        z.health -= Math.round(p.attackDmg * dmgMult);
        const kzx = z.x - p.x, kzy = z.y - p.y;
        const kzd = Math.sqrt(kzx * kzx + kzy * kzy) || 1;
        z.x += (kzx / kzd) * ATTACK_KNOCKBACK * 3;
        z.y += (kzy / kzd) * ATTACK_KNOCKBACK * 3;
        p.attackHitIds.push(z.id);
        if (z.health <= 0) {
          z.alive = false;
          p.kills++;
          events.push({ type: 'zombieKilled', playerId: p.id, zombieLvl: z.lvl });
        }
        events.push({ type: 'hitConfirm', to: p.id, targetId: z.id, dmg: Math.round(p.attackDmg * dmgMult), x: z.x, y: z.y });
      }
    }
  }
  return events;
}

module.exports = { animTotal, interpHitbox, distToSegSq, checkSwordHit };
