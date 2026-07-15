const { KNIGHT_ANIMATIONS, ANIMATIONS, ATTACK_SPEED_MULT, TICK_MS, BLADE_W, ZOMBIE_RADIUS } = require('./config');
const sword = require('./sword');

// DEBUG_COMBAT diagnostics (2026-07-13) — set env var DEBUG_COMBAT=1 before
// starting the server (`$env:DEBUG_COMBAT=1; node server.js` in PowerShell)
// to get one console line per swing/jab, printed the instant that attack
// ends, showing exactly what the hit-check saw: how many zombies were ever
// in grid range during the swing, the closest any zombie's actual center
// ever got (straight-line, not blade math), the closest the blade's own
// capsule ever got to a zombie, and how many hits actually landed. Compare
// minRaw vs minCapsule vs the threshold to tell apart three different
// failure modes: (1) minRaw large / nearbyMax=0 → zombie was never even
// close enough for the grid query to find it (not a hit-math bug at all,
// player just wasn't actually near anyone); (2) minRaw small but
// minCapsule stays large → zombie WAS right next to the player but the
// rotating blade capsule never swept anywhere near them (an angle/mirror/
// keyframe problem); (3) minCapsule gets close but never dips under
// threshold → the capsule is aiming at the right place but bladeW is too
// thin or the sub-frame sampling is skipping over the moment it lines up
// (a sampling-resolution problem). Zero cost when the env var isn't set.
function logCombatDiag(room, id, p) {
  if (!process.env.DEBUG_COMBAT) return;
  const threshold = BLADE_W + ZOMBIE_RADIUS;
  console.log('[COMBAT-DIAG] player=' + id.slice(0, 8) +
    ' style=' + p.attackStyle + ' step=' + p.comboStep +
    ' unarmed=' + (p.playerClass === 'knight' && !p.currentItem) +
    ' nearbyMax=' + (p._diagNearbyMax || 0) +
    ' minRawDist=' + (p._diagMinRaw !== undefined ? p._diagMinRaw.toFixed(1) : 'none') +
    ' minCapsuleDist=' + (p._diagMinCapsule !== undefined ? p._diagMinCapsule.toFixed(1) : 'none') +
    ' threshold=' + threshold +
    ' hits=' + (p._diagHits || 0));
  p._diagNearbyMax = 0;
  p._diagMinRaw = undefined;
  p._diagMinCapsule = undefined;
  p._diagHits = 0;
}

// True from the moment a combo's first hit fires until the ENTIRE combo
// (every chained hit, including the swing's spin) plus its post-combo
// recovery cooldown has fully finished — see the reset points that clear
// `_started` back to false: processCombatTick's "combo fully finished"
// branch, the spin-end branch, and the cooldown-expiry branch. Anything that
// can change combat-relevant player state mid-fight (attack style toggle,
// weapon swap via hotbar/drag/discard) must check this first and refuse to
// act while it's true — otherwise a mid-swing style/weapon change corrupts
// the in-progress combo (isUnarmed/comboKey/maxCombo are all recomputed live
// off p.attackStyle/p.currentItem every tick, so changing either mid-combo
// can flip the spin-continuation check and abort the combo early, which is
// exactly the "spin gets interrupted back to a basic attack" bug this
// guards against, 2026-07-12). The only thing allowed to interrupt a combo
// once started is the player dying — the per-tick loops in
// processCombatTick already skip dead players entirely, which naturally
// halts everything without needing this flag.
function isMidCombo(p) {
  return !!(p && p._started);
}

function handleAttack(room, id, facingAngle) {
  const p = room.players[id];
  if (!p || !p.alive || p.isSpectator) return;
  if (p._started && !p.comboChainWindow) {
    if (p.attacking) {
      if (!p._queuedChain) p._queuedChain = { angle: typeof facingAngle === 'number' ? facingAngle : null };
      return;
    }
  }
  const isUnarmed = p.playerClass === 'knight' && !p.currentItem;
  // Unarmed never "finishes" a combo and pauses to recover — it just keeps
  // alternating right/left forever as long as the player keeps attacking
  // (comboStep wraps 1<->2 in processCombatTick below), so there's no combo
  // cap to hit here.
  const maxCombo = isUnarmed ? Infinity : (p.attackStyle === 'jab' ? 3 : 4);
  if (p.comboChainWindow && (p.comboStep || 0) < maxCombo) {
    p._chainPendingAngle = typeof facingAngle === 'number' ? facingAngle : null;
    if (p._chainTickTarget <= 0) {
      p._chainTickTarget = room.tickNum + p._chainDelayTicks + (p.comboStep === 3 ? 2 : 0);
    }
    return;
  } else if (p.comboChainWindow) {
    return;
  } else {
    if (p.attackCooldown > 0) return;
    p._started = false;
    p.comboChainWindow = false;
    p.comboStep = 1;
    p._chainTickTarget = 0;
    p._chainPendingAngle = null;
    p._queuedChain = null;
    p._spinRemaining = 0;
    p._lungeRemaining = 0;
    p._combo3MidHit = false;
    p._jabHitCleared = 0;
    p._spinLungeAngle = 0;
  }
  p._lastAttackTime = Date.now();
  _executeAttack(room, id, p.comboStep, typeof facingAngle === 'number' ? facingAngle : null);
}

function _executeAttack(room, id, step, pendingAngle) {
  const p = room.players[id];
  if (!p) return;
  const isUnarmed = p.playerClass === 'knight' && !p.currentItem;
  const style = p.attackStyle || 'jab';
  const animStyle = isUnarmed ? 'unarmed' : style;
  const comboKey = animStyle + '_combo' + (step || 1);
  const anim = p.playerClass === 'knight'
    ? (KNIGHT_ANIMATIONS?.[comboKey] || KNIGHT_ANIMATIONS?.[animStyle + '_combo1'])
    : (ANIMATIONS[p.currentItem]?.[comboKey] || ANIMATIONS[p.currentItem]?.[style + '_combo1']);
  if (!anim) {
    p._started = false;
    p.attackCooldown = 0;
    p.comboStep = 0;
    p._chainTickTarget = 0;
    p._queuedChain = null;
    p._chainPendingAngle = null;
    return;
  }
  // Unarmed alternates which fist actually deals damage: right hand (the
  // knight_sword slot, same one a real weapon would use) on hit 1, left hand
  // (knight_hand slot) on hit 2 — matching unarmed_combo1/2's keyframe data
  // in game-data.js/shared/data.js, where the "active" punching fist's motion
  // lives under whichever slot is throwing that hit.
  const activeHandKey = isUnarmed && step === 2 ? 'knight_hand' : 'knight_sword';
  const kfData = p.playerClass === 'knight' ? anim[activeHandKey] : anim;
  if (!kfData || kfData.keyframes.length < 2) {
    p._started = false;
    p.attackCooldown = 0;
    p.comboStep = 0;
    p._chainTickTarget = 0;
    p._queuedChain = null;
    p._chainPendingAngle = null;
    return;
  }
  const kfAnim = p.playerClass === 'knight'
    ? { keyframes: kfData.keyframes, segments: anim.segments }
    : anim;
  if (typeof pendingAngle === 'number' && step < 4) p.facingAngle = pendingAngle;
  p.comboChainWindow = false;
  p.attackCooldown = 6;
  p.attacking = true;
  p.attackFrame = 0;
  p.attackAnim = kfAnim;
  p.attackHitIds = [];
  p.attackLockedAngle = p.facingAngle;
  p.attackStartTime = Date.now();
  p.prevCf = -1;
  p._started = true;
  p._spinRemaining = step >= 4 && p.attackStyle === 'swing' ? 15 : 0;
  // Unarmed punches stay planted — no forward lunge like armed jab/swing hits get.
  // Steps 1-3 lunge distances cut from 30/30/50 to 8/8/12 (2026-07-13) — root
  // cause of "swing goes through multiple enemies and never deals damage."
  // sword.js's checkSwordHit() builds the blade capsule from p.x/p.y at the
  // START of each tick, but the lunge below moves p.x/p.y at the END of that
  // same tick — so on the first tick or two of a swing/jab, the player's own
  // forward rush was physically outrunning the blade's own swing arc: a
  // zombie standing directly in front at normal melee range got carried past
  // before the blade ever reached it. Verified by simulating a full swing
  // against a zombie at every angle/range around the player: with the old
  // 30-unit lunge, a zombie standing dead-ahead at realistic melee range was
  // only hit 16/37 to 20/37 of the time across the swing's angular sweep;
  // capped at 8 units it's 34-36/37 (misses only right at the ~90-degree
  // edge of the swing's reach, which is expected — the blade doesn't sweep
  // that far to the side). This is the same lunge formula for both jab and
  // swing, which matches Travis suspecting jab had it too. Off-center/side
  // hits were largely unaffected either way. Step 4's spin lunge (120) is
  // untouched — different mechanic (a full 360 spin), not reported as broken.
  p._lungeRemaining = isUnarmed ? 0 : (step === 4 ? (p.attackStyle === 'swing' ? 120 : 0) : (step === 3 ? 12 : (step >= 1 ? 8 : 0)));
  p._spinLungeAngle = step === 4 && p.attackStyle === 'swing' ? (typeof pendingAngle === 'number' ? pendingAngle : p._lastMouseAngle) : 0;
  p._combo3MidHit = false;
  p._jabHitCleared = 0;
  p._diagNearbyMax = 0;
  p._diagMinRaw = undefined;
  p._diagMinCapsule = undefined;
  p._diagHits = 0;
  room.io.to(id).emit('attackStart', { lockedAngle: p.attackLockedAngle, comboStep: step });
}

function handleEquip(room, id, slot) {
  const p = room.players[id];
  if (!p || !p.alive) return;
  // Swapping weapons mid-combo would change isUnarmed/comboKey out from under
  // an in-progress attack (see isMidCombo's comment above) — ignored, not
  // queued, same "silent no-op" convention as every other rejected input in
  // this file. The hotbar key is still consumed for nothing; player can
  // re-press once the combo (and its recovery cooldown) finishes.
  if (isMidCombo(p)) return;
  if (slot >= 0 && slot < p.inventory.length) {
    p.currentItem = p.inventory[slot];
    const { recalcStats, playerInfoObj } = require('./player');
    recalcStats(p);
    room.io.to('room:' + room.id).emit('playerInfo', playerInfoObj(p));
  }
}

function processCombatTick(room) {
  const ids = Object.keys(room.players);

  for (const id of ids) {
    const p = room.players[id];
    if (!p.alive || p.isSpectator || !p.attacking) continue;
    const events = sword.checkSwordHit(p, room.zombies, room.players, room.grid);
    room.emitEvents(events);
    if (p._queuedChain && p.comboChainWindow) {
      p._chainTickTarget = room.tickNum + p._chainDelayTicks + (p.comboStep === 3 ? 2 : 0);
      p._chainPendingAngle = p._queuedChain.angle;
      p._queuedChain = null;
    }
    if (p._lungeRemaining > 0) {
      let dirAngle = p.comboStep === 4 && p.attackStyle === 'swing' ? p._spinLungeAngle : p.attackLockedAngle;
      if (p.comboStep === 4 && p.attackStyle === 'swing') {
        const diff = p._lastMouseAngle - p._spinLungeAngle;
        const clamped = Math.max(-0.25, Math.min(0.25, diff));
        dirAngle = p._spinLungeAngle + clamped;
      }
      const perTick = p.comboStep === 4 && p.attackStyle === 'swing' ? 8 : 15;
      const amount = Math.min(p._lungeRemaining, perTick);
      p.x += Math.cos(dirAngle) * amount;
      p.y += Math.sin(dirAngle) * amount;
      p._lungeRemaining -= amount;
    }
    p.attackFrame++;
    const totalFrames = sword.animTotal(p.attackAnim);
    const totalTicks = Math.ceil(totalFrames / (2 * ATTACK_SPEED_MULT));
    if (p.attackFrame >= totalTicks) {
      const isUnarmed = p.playerClass === 'knight' && !p.currentItem;
      // Unarmed never hits the "combo finished" branch below — every punch
      // (step 1 or 2) opens a fresh chain window with the short between-hit
      // cooldown instead of the longer end-of-combo recovery, so right/left
      // punches can chain forever with no pause. comboStep itself wraps
      // 1<->2 further down (in the chain-continuation loop) rather than
      // climbing past 2.
      const maxCombo = isUnarmed ? Infinity : (p.attackStyle === 'jab' ? 3 : 4);
      if (!(p._spinRemaining > 0 && p.attackStyle === 'swing' && p.comboStep === 4)) {
        logCombatDiag(room, id, p);
        p.attackLockedAngle = p.facingAngle;
        p.attacking = false;
        p.attackAnim = null;
        p.attackHitIds = [];
        p.prevCf = -1;
        if (p.comboStep >= maxCombo) {
          p.comboChainWindow = false;
          p.attackCooldown = (!isUnarmed && p.attackStyle === 'swing' ? 16 : 20) + (p.comboStep - 1) * 8;
          p.comboStep = 0;
          p._started = false;
          p._chainTickTarget = 0;
          p._queuedChain = null;
          p._spinRemaining = 0;
          p._lungeRemaining = 0;
          p._combo3MidHit = false;
          p._jabHitCleared = 0;
          p._spinLungeAngle = 0;
        } else {
          p.comboChainWindow = true;
          p.attackCooldown = Math.max(1, Math.round(p.attackSpeed / TICK_MS / 2));
          if (p.comboStep === 3) p.attackCooldown += 8;
          if (p._queuedChain) {
            p._chainTickTarget = room.tickNum + p._chainDelayTicks + (p.comboStep === 3 ? 2 : 0);
            p._chainPendingAngle = p._queuedChain.angle;
            p._queuedChain = null;
          }
        }
      }
    }
    if (p._spinRemaining > 0 && p.comboStep === 4 && p.attackStyle === 'swing') {
      p.attackLockedAngle += (Math.PI * 2) / 15;
      p._spinRemaining--;
      p.attackFrame = 4;
      if (p._spinRemaining === 0) {
        logCombatDiag(room, id, p);
        p.attackLockedAngle = p.facingAngle;
        p.attacking = false;
        p.attackAnim = null;
        p.attackHitIds = [];
        p.prevCf = -1;
        p.comboChainWindow = false;
        p.attackCooldown = (p.attackStyle === 'swing' ? 16 : 20) + (p.comboStep - 1) * 8;
        p.comboStep = 0;
        p._started = false;
        p._chainTickTarget = 0;
        p._queuedChain = null;
        room.io.to(id).emit('comboWindowEnd');
      }
    }
  }

  for (const id of ids) {
    const p = room.players[id];
    if (!p || p.attacking || p.attackCooldown <= 0) continue;
    p.attackCooldown--;
    if (p.attackCooldown > 0) continue;
    if (p.comboChainWindow) {
      p.comboChainWindow = false;
      // 2026-07-14 fix — this branch used to unconditionally impose
      // `Math.round(1000 / TICK_MS)` (exactly 1 full second) of attackCooldown
      // here, completely unexplained/undocumented and applied REGARDLESS of
      // whether the player had actually clicked to continue the combo.
      // Confirmed via simulation: a player who swings once (or twice, three
      // times...) and simply doesn't click again in time to continue got
      // hard-locked for a FULL EXTRA SECOND after their own window naturally
      // closed — during that second EVERY click, including a brand new
      // unrelated attack, was silently swallowed (handleAttack's final
      // `else` branch returns early on `attackCooldown > 0`). That's almost
      // certainly what Travis kept describing as "stuck, can't do the final
      // combo, forced back to idle" — missing the (narrow) window to
      // continue into swing's step 4 didn't just end the combo, it froze ALL
      // input for a full extra second afterward. It also explains "swing
      // step 1 doesn't deal damage" as a separate-looking symptom of the
      // exact same bug: rapid re-clicks during that frozen second do
      // nothing at all server-side (no attack ever starts, no hit-test ever
      // runs), which looks identical to "I swung and it whiffed" from the
      // player's side, when really no swing happened at all.
      //
      // Fixed by branching on whether a continuation was actually scheduled
      // (`_chainTickTarget > 0`, set by a click that landed inside the
      // window): if nothing was scheduled, reset immediately (below) instead
      // of waiting out a mystery penalty first. If a continuation WAS
      // scheduled, bridge attackCooldown forward to land 1 tick past
      // `_chainTickTarget` (not exactly on it) so this same loop — which
      // runs BEFORE the chain-trigger loop further down in the same tick —
      // doesn't zero out `_chainTickTarget` itself before that loop gets a
      // chance to fire the continuation; the `+1` also keeps attackCooldown
      // positive across that whole gap, which is what blocks a fresh click
      // from hijacking/resetting the already-scheduled continuation via
      // handleAttack's `if (p.attackCooldown > 0) return;` guard (verified
      // both directions — tight-timing continuation still fires correctly,
      // and a mid-gap click attempt is still correctly rejected — via
      // simulation before this was applied).
      if (p._chainTickTarget > 0) {
        p.attackCooldown = Math.max(1, p._chainTickTarget - room.tickNum + 1);
      } else {
        p.comboStep = 0;
        p._started = false;
        p.attackCooldown = 0;
        p._queuedChain = null;
        p._chainPendingAngle = null;
        p._chainTickTarget = 0;
        p._spinRemaining = 0;
        p._lungeRemaining = 0;
        room.io.to(id).emit('comboWindowEnd');
        room.io.to(id).emit('comboReady');
      }
    } else {
      p.comboStep = 0;
      p._started = false;
      p.attackCooldown = 0;
      p._queuedChain = null;
      p._chainPendingAngle = null;
      p._chainTickTarget = 0;
      p._spinRemaining = 0;
      p._lungeRemaining = 0;
      room.io.to(id).emit('comboWindowEnd');
      room.io.to(id).emit('comboReady');
    }
  }

  for (const id of ids) {
    const p = room.players[id];
    if (!p || p._chainTickTarget <= 0) continue;
    if (room.tickNum < p._chainTickTarget) continue;
    const isUnarmedChain = p.playerClass === 'knight' && !p.currentItem;
    const rawStep = (p.comboStep || 0) + 1;
    // Unarmed has no combo3/combo4 animation data and no cap (maxCombo is
    // Infinity above) — wrap back to 1 (right hand) instead of climbing past
    // 2, so it just alternates right/left forever and every other step-3/4
    // special-case check elsewhere (spin, lunge, mirror) stays naturally
    // false for it.
    const step = isUnarmedChain && rawStep > 2 ? 1 : rawStep;
    // Hard cap, independent of whatever scheduled this continuation
    // (2026-07-14 fix) — jab maxes at 3, swing at 4. Without this, a chain
    // continuation scheduled while comboStep was already AT the cap (see
    // sword.js's matching fix for why that scheduling could happen at all —
    // comboChainWindow spuriously reopening at the start of every new step,
    // including the swing's spin) would execute a step past the style's real
    // maximum, with nothing to stop it from climbing indefinitely on
    // sustained clicking (5, 6, 7...66+, confirmed via simulation). This is
    // the authoritative choke point: every path that can set
    // _chainTickTarget (handleAttack's early-window schedule, loop1's
    // queued-chain consumption, the combo-finished branch's queued-chain
    // consumption) funnels through here to actually execute, so guarding
    // here alone closes the loophole regardless of which path mis-scheduled
    // it. Silently drops the stale continuation, same "rejected = no-op"
    // convention as every other blocked combat input in this file.
    if (!isUnarmedChain) {
      const maxComboChain = p.attackStyle === 'jab' ? 3 : 4;
      if (step > maxComboChain) {
        p._chainTickTarget = 0;
        p._chainPendingAngle = null;
        continue;
      }
    }
    p.comboStep = step;
    p._chainTickTarget = 0;
    p.attackCooldown = 0;
    const chainAngle = p._chainPendingAngle;
    p._chainPendingAngle = null;
    p._lastAttackTime = Date.now();
    _executeAttack(room, id, step, chainAngle);
  }
}

module.exports = { handleAttack, _executeAttack, handleEquip, processCombatTick, isMidCombo };
