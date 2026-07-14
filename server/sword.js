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

  // Only deal damage on forward motion: sum segments up to the midpoint keyframe
  const segs = p.attackAnim.segments;
  const midKf = Math.floor(p.attackAnim.keyframes.length / 2);
  let halfFrames = 0;
  for (let i = 0; i < midKf; i++) halfFrames += segs[i];

  // Unarmed punches always behave like a basic single-hit swing (no swing
  // damage penalty/wider hit margin, no jab/swing-specific combo-3 logic —
  // unarmed's maxCombo is 2, so isJabFinal/isSwingThird below never trigger
  // for it regardless). p.attackStyle keeps whatever jab/swing preference the
  // player has toggled (it still governs idle stance + re-equip behavior),
  // it just shouldn't affect punch damage/hitbox math.
  const isUnarmed = p.playerClass === 'knight' && !p.currentItem;
  const isSwing = !isUnarmed && p.attackStyle === 'swing';
  const isJabFinal = p.comboStep === 3 && p.attackStyle === 'jab';
  const isSwingThird = p.comboStep === 3 && isSwing;
  if (isJabFinal) halfFrames = totalFrames; // process all frames for triple jab
  // Swing deals damage across the ENTIRE motion of every hit (steps 1-3, not
  // just the final double-swing) — fixed 2026-07-12, was previously cut off
  // at `halfFrames + 4` for steps 1/2 (only the forward half of that single
  // swing could land a hit, the return half was pure recovery with no
  // damage), which is why zombies caught late in a swing's arc weren't
  // taking damage. Jab keeps the forward-half-only cutoff (its whole design
  // is a quick poke, not a sweeping swing) — `isJabFinal`'s `halfFrames =
  // totalFrames` reassignment above already gives jab's own triple-hit
  // finisher full coverage the same way, so this ternary only needs the two
  // real cases: swing (any step) = whole motion, everything else = forward
  // half + a small buffer.
  const dmgLimit = isSwing ? totalFrames : halfFrames + 1;
  // Jab/swing open the chain window partway through the forward swing (this
  // line) so clicking early cancels the recovery half into the next hit's
  // startup — that's the intentional fluid-combo feel. Unarmed should NOT do
  // that: the full punch (forward AND return-to-idle) has to finish before
  // the next one can start. So leave p.comboChainWindow alone here when
  // unarmed — it stays false (set at attack start in _executeAttack) until
  // processCombatTick's attackFrame>=totalTicks check opens it once the
  // whole animation has actually played out.
  if (!isUnarmed) {
    p.comboChainWindow = currentCf < halfFrames + (isSwing ? 4 : 1);
    if (isJabFinal && currentCf % 20 >= 10) p.comboChainWindow = false;
  }
  const cfs = [];
  if (p.prevCf >= 0 && p.prevCf !== currentCf) {
    const span = currentCf - p.prevCf;
    const steps = Math.min(isSwing ? 16 : 8, Math.ceil(span));
    const margin = isSwing ? 4 : 1;
    for (let s = 1; s <= steps; s++) {
      const cf = p.prevCf + span * (s / steps);
      if (cf <= dmgLimit) cfs.push(cf);
    }
  } else if (currentCf <= dmgLimit) {
    cfs.push(currentCf);
  }
  // Triple jab: only forward segments deal damage
  if (isJabFinal && cfs.length > 0) {
    for (let i = cfs.length - 1; i >= 0; i--) {
      const cf = cfs[i];
      let accum = 0;
      let inForward = false;
      for (let s = 0; s < segs.length; s++) {
        if (cf < accum + segs[s]) {
          inForward = s % 2 === 0;
          break;
        }
        accum += segs[s];
      }
      if (!inForward) cfs.splice(i, 1);
    }
  }
  p.prevCf = currentCf;
  // Swing combo3 double-hit: clear hit IDs exactly at the swing's own
  // midpoint (`halfFrames`, the same threshold everything else here uses to
  // mean "forward motion ends / return motion begins") so a target caught in
  // both the forward AND backward half of the double-swing takes damage
  // both times, cleanly split at the actual midpoint rather than an
  // arbitrary totalFrames/3 mark (fixed 2026-07-12, alongside the dmgLimit
  // fix above). Scoped to `isSwing` — jab's own triple-hit finisher clears
  // attackHitIds through its own separate mechanism just below
  // (`_jabHitCleared`/`cf >= 20,40`), so this doesn't need to (and
  // previously shouldn't have, though it was harmlessly redundant there
  // since jab already handles its own clearing).
  if (p.comboStep === 3 && isSwing && !p._combo3MidHit && currentCf >= halfFrames) {
    p.attackHitIds = [];
    p._combo3MidHit = true;
  }
  if (cfs.length === 0) return events;

  // Unarmed punches only ever land on one target per swing, and never landed
  // on anyone yet if attackHitIds already has an entry — skip all hit
  // processing outright rather than relying on the mid-loop break below to
  // catch every case across ticks.
  if (isUnarmed && p.attackHitIds.length > 0) return events;

  const nearbyZombies = grid.getNearbyZombies(p.x, p.y);
  // DEBUG_COMBAT diagnostics (2026-07-13) — set env var DEBUG_COMBAT=1 before
  // starting the server to get a one-line-per-swing summary printed when
  // each attack ends (see combat-system.js's logCombatDiag). Tracks the
  // widest nearbyZombies count seen and the closest approach (both raw
  // straight-line distance to the zombie's center, and the actual capsule
  // distance the hit-test uses) across every tick of the swing — lets us
  // tell apart "zombie was never even in grid range" from "zombie was close
  // but the capsule never lined up with it" from "capsule got close but
  // never quite inside the hit threshold" without guessing from a static
  // simulation. Zero perf cost when the env var isn't set (the `if` short-
  // circuits before any of the Math calls run).
  if (process.env.DEBUG_COMBAT) {
    p._diagNearbyMax = Math.max(p._diagNearbyMax || 0, nearbyZombies.length);
    for (const z of nearbyZombies) {
      if (!z.alive) continue;
      const rawDist = Math.hypot(z.x - p.x, z.y - p.y);
      if (p._diagMinRaw === undefined || rawDist < p._diagMinRaw) p._diagMinRaw = rawDist;
    }
  }

  hitLoop:
  for (let si = 0; si < cfs.length; si++) {
    const cf = cfs[si];
    const vis = interpHitbox(p.attackAnim, cf);
    if (!vis) continue;
    const isKnight = p.playerClass === 'knight';
    const mirS = (isKnight && isSwing && (p.comboStep || 0) >= 2) ? -1 : 1;
    const btX = (isKnight ? KNIGHT_BLADE_TIP_X : BLADE_TIP_X) * mirS;
    const btY = isKnight ? KNIGHT_BLADE_TIP_Y : BLADE_TIP_Y;
    const bhX = (isKnight ? KNIGHT_BLADE_HILT_X : BLADE_HILT_X) * mirS;
    const bhY = isKnight ? KNIGHT_BLADE_HILT_Y : BLADE_HILT_Y;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rx = vis.offsetX * cos - vis.offsetY * sin;
    const ry = vis.offsetX * sin + vis.offsetY * cos;
    const sx = p.x + rx, sy = p.y + ry;
    const scale = vis.scale;
    const rot = (angle + (vis.rotation || 0));
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const tipX = sx + (btX * cosR - btY * sinR) * scale;
    const tipY = sy + (btX * sinR + btY * cosR) * scale;
    const hiltX = sx + (bhX * cosR - bhY * sinR) * scale;
    const hiltY = sy + (bhX * sinR + bhY * cosR) * scale;

    // Clear hit IDs at forward segment boundaries for jab triple combo — this
    // is meant to fire exactly twice for the whole jab_combo3 flourish (once
    // reopening targets for thrust 2 at cf>=20, once more for thrust 3 at
    // cf>=40), tracked via `p._jabHitCleared` counting 0->1->2 across the
    // ENTIRE attack. Fixed 2026-07-13: there used to be a second reset —
    // `if (isJabFinal) p._jabHitCleared = 0;` — sitting earlier in this
    // function (right after the `cfs.length === 0` early return), which ran
    // on EVERY TICK, not just once at attack start. Since that line always
    // ran before this loop, `_jabHitCleared` was back to 0 at the start of
    // every single tick from the moment cf first crossed 20 onward, so this
    // check kept re-triggering (always against the `cf>=20` branch, since
    // `_jabHitCleared` never got to actually stay at 1 or 2 across a tick
    // boundary) — attackHitIds got wiped on almost every tick for the rest
    // of the attack, letting a target that lingered in range for several
    // consecutive ticks during a single forward thrust take damage far more
    // than once per thrust (confirmed via simulation: a stationary target
    // took 4 hits during thrust 3 alone, should be capped at 1). Removing
    // that per-tick reset (attack-start reset in combat-system.js's
    // `_executeAttack` is the only one needed) fixes it to exactly 1 hit per
    // forward thrust, matching what Travis asked for.
    if (isJabFinal && p._jabHitCleared < 2) {
      if (cf >= (p._jabHitCleared === 0 ? 20 : 40)) {
        p.attackHitIds = [];
        p._jabHitCleared++;
      }
    }

    for (const z of nearbyZombies) {
      if (!z.alive) continue;
      // Used to bypass the attackHitIds check entirely for the whole back
      // half of swing combo3 (`cf >= halfFrames`), intended to let the
      // return swing hit an already-hit target a second time — but a bypass
      // with no re-block after that first extra hit means a target sitting
      // in the blade's path for several consecutive ticks during the back
      // half took damage EVERY one of those ticks, not just once more.
      // Fixed 2026-07-12: removed. The `_combo3MidHit` reset right above
      // (which clears `attackHitIds` exactly once, at the true midpoint) is
      // the correct mechanism for "hittable again on the way back" — it
      // already reopens every target for exactly one more hit, and normal
      // attackHitIds tracking re-blocks them after that, giving a clean
      // forward-hit / reset / backward-hit (max 2 total), not unlimited
      // damage for anything that lingers in range during the return swing.
      if (p.attackHitIds.includes(z.id)) continue;
      const d2 = distToSegSq(z.x, z.y, hiltX, hiltY, tipX, tipY);
      if (process.env.DEBUG_COMBAT) {
        const capsuleDist = Math.sqrt(d2);
        if (p._diagMinCapsule === undefined || capsuleDist < p._diagMinCapsule) p._diagMinCapsule = capsuleDist;
      }
      if (d2 < (bladeW + z.radius) * (bladeW + z.radius)) {
        // Bare-knuckle punches deal a flat, weak 2 damage regardless of
        // attackDmg/build/gear (rings etc. only matter once a weapon's
        // equipped again) and never get the swing damage multiplier.
        const dmg = isUnarmed ? 2 : Math.round(p.attackDmg * (p.attackStyle === 'swing' ? 0.7 : 1.0));
        z.health -= dmg;
        const kzx = z.x - p.x, kzy = z.y - p.y;
        const kzd = Math.sqrt(kzx * kzx + kzy * kzy) || 1;
        z.x += (kzx / kzd) * ATTACK_KNOCKBACK * 3;
        z.y += (kzy / kzd) * ATTACK_KNOCKBACK * 3;
        p.attackHitIds.push(z.id);
        if (process.env.DEBUG_COMBAT) p._diagHits = (p._diagHits || 0) + 1;
        if (z.health <= 0) {
          z.alive = false;
          p.kills++;
          events.push({ type: 'zombieKilled', playerId: p.id, zombieLvl: z.lvl, mobType: z.mobType, x: z.x, y: z.y });
        }
        events.push({ type: 'hitConfirm', to: p.id, targetId: z.id, dmg, x: z.x, y: z.y });
        // Unarmed: exactly one target per punch, full stop — see the
        // attackHitIds.length guard above the loop for the cross-tick half
        // of this same rule.
        if (isUnarmed) break hitLoop;
      }
    }
  }
  return events;
}

module.exports = { animTotal, interpHitbox, distToSegSq, checkSwordHit };
