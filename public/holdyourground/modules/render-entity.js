import { state } from './state.js';

const _spriteCache = new Map();

const _leanRotMap = new Map();

const _remoteAnimState = new Map();

function updateLean(p) {
  if (!p) return 0;
  const vx = p.x - p.px;
  const vy = p.y - p.py;
  const aim = p._smoothAngle ?? p.facingAngle ?? 0;
  const localRight = -vx * Math.sin(aim) + vy * Math.cos(aim);
  const targetLean = localRight * 0.04;
  let lean = _leanRotMap.get(p.id) || 0;
  lean += (targetLean - lean) * 0.12;
  if (Math.abs(lean) < 0.0001) lean = 0;
  _leanRotMap.set(p.id, lean);
  return lean;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function getBreathScale(amp) {
  const t = performance.now() / 3500 * Math.PI * 2;
  return 1.0 + Math.sin(t) * (amp || 0.015);
}

function toPolar(x, y) {
  return { r: Math.sqrt(x * x + y * y), theta: Math.atan2(y, x) };
}

function fromPolar(r, theta) {
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

// Shortest signed distance from angle a to angle b, wrapped to [-PI, PI].
// Used everywhere we blend between two rotation values so the sweep always
// takes the visually shorter path instead of spinning the long way around.
function shortAngleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Single canonical pose blend used for every idle-transition/return-to-idle
// tween in the game (local style switches, local return-from-attack, and
// remote return-from-attack). Offsets are blended in polar space so the
// weapon arcs naturally instead of cutting a straight line through the body,
// and rotation is blended via the shortest angular path so it never spins
// the long way around when the from/to poses are far apart (which happens
// often on swing attacks, whose keyframes range well past +/-PI).
function lerpPosePolar(from, to, t) {
  const s = smoothstep(t);
  const pFrom = toPolar(from.offsetX, from.offsetY);
  const pTo = toPolar(to.offsetX, to.offsetY);
  const dTheta = shortAngleDelta(pFrom.theta, pTo.theta);
  const r = pFrom.r + (pTo.r - pFrom.r) * s;
  const theta = pFrom.theta + dTheta * s;
  const xy = fromPolar(r, theta);
  const dRot = shortAngleDelta(from.rotation, to.rotation);
  return {
    offsetX: Math.round(xy.x),
    offsetY: Math.round(xy.y),
    scale: +(from.scale + (to.scale - from.scale) * s).toFixed(3),
    rotation: +(from.rotation + dRot * s).toFixed(2)
  };
}

// Single canonical keyframe sampler used by every animated pose in the game
// (local prediction AND remote playback both call this). Given a segment
// list and a continuous frame position, walks to the right segment and
// eases between its two keyframes. Because both local and remote now funnel
// through this one function, they can never visually diverge — the only
// thing that differs between them is which frame number they feed in.
function interpKeyframes(data, segments, f) {
  const total = segments.reduce((a, b) => a + b, 0);
  if (total === 0) return data.keyframes[0] || null;
  const clamped = Math.max(0, Math.min(f, total - 0.001));
  let accum = 0;
  for (let i = 0; i < segments.length; i++) {
    const segLen = segments[i];
    if (clamped < accum + segLen) {
      let t = (clamped - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = data.keyframes[i], b = data.keyframes[i + 1];
      return {
        offsetX: +(a.offsetX + (b.offsetX - a.offsetX) * t).toFixed(1),
        offsetY: +(a.offsetY + (b.offsetY - a.offsetY) * t).toFixed(1),
        scale: +(a.scale + (b.scale - a.scale) * t).toFixed(3),
        rotation: +(a.rotation + (b.rotation - a.rotation) * t).toFixed(3)
      };
    }
    accum += segLen;
  }
  return data.keyframes[data.keyframes.length - 1];
}

const _smoothBobSpeed = new Map();

function getMovementBob(p) {
  if (!p) return { x: 0, y: 0 };
  const dx = p.x - p.px;
  const dy = p.y - p.py;
  const rawSpeed = Math.sqrt(dx * dx + dy * dy);
  let speed;
  if (p.id !== state.myId) {
    const prev = _smoothBobSpeed.get(p.id) ?? rawSpeed;
    speed = prev + (rawSpeed - prev) * 0.12;
    _smoothBobSpeed.set(p.id, speed);
  } else {
    speed = rawSpeed;
  }
  const t = performance.now() / 1000;
  const freq = 1.2 + speed * 0.08;
  const amp = Math.min(1.5, speed * 0.08);
  return {
    x: Math.cos(t * freq * Math.PI * 2) * amp * 0.4,
    y: Math.sin(t * freq * Math.PI * 2) * amp * 0.6
  };
}

function getIdleSway(handKey) {
  const t = performance.now() / 1000;
  const isSword = handKey === 'knight_sword';
  const freq1 = isSword ? 0.35 : 0.4;
  const freq2 = isSword ? 0.5 : 0.55;
  return {
    rotOffset: Math.sin(t * freq1 * Math.PI * 2) * (isSword ? 0.025 : 0.015),
    xOffset: Math.sin(t * freq2 * Math.PI * 2) * (isSword ? 1.2 : 0.6),
    yOffset: Math.sin(t * freq1 * Math.PI * 2 + 1.2) * (isSword ? 0.8 : 0.4)
  };
}

function getKnightIdleVis(handKey, styleOverride) {
  if (state.idleTransition && !styleOverride) {
    const elapsed = performance.now() - state.idleTransition.startTime;
    const dur = state.idleTransition.durationMs;
    const t = Math.min(1, elapsed / dur);
    const from = handKey === 'knight_sword' ? state.idleTransition.fromSword : state.idleTransition.fromHand;
    const to = handKey === 'knight_sword' ? state.idleTransition.toSword : state.idleTransition.toHand;
    const vis = lerpPosePolar(from, to, t);
    if (t >= 1) state.idleTransition = null;
    const sway = getIdleSway(handKey);
    return {
      offsetX: vis.offsetX + sway.xOffset,
      offsetY: vis.offsetY + sway.yOffset,
      scale: vis.scale,
      rotation: +(vis.rotation + sway.rotOffset).toFixed(2)
    };
  }
  const style = styleOverride || state.attackStyle || 'jab';
  const base = window.KNIGHT_VISUALS?.[style]?.[handKey];
  if (!base) return null;
  const sway = getIdleSway(handKey);
  return {
    offsetX: base.offsetX + sway.xOffset,
    offsetY: base.offsetY + sway.yOffset,
    scale: base.scale,
    rotation: +(base.rotation + sway.rotOffset).toFixed(2)
  };
}

function startIdleTransition(newStyle) {
  const me = state.players[state.myId];
  if (!me) return;
  const oldStyle = state.attackStyle || 'jab';
  if (oldStyle === newStyle) return;
  const visuals = window.KNIGHT_VISUALS;
  if (!visuals?.[oldStyle] || !visuals?.[newStyle]) return;
  state.idleTransition = {
    fromSword: { ...visuals[oldStyle].knight_sword },
    fromHand: { ...visuals[oldStyle].knight_hand },
    toSword: { ...visuals[newStyle].knight_sword },
    toHand: { ...visuals[newStyle].knight_hand },
    startTime: performance.now(),
    durationMs: 350
  };
}

export function getSpriteFromSheet(sheet, drawW, drawH, frame) {
  drawW = Math.max(1, Math.round(drawW * 2) / 2);
  drawH = Math.max(1, Math.round(drawH * 2) / 2);
  const key = `${frame.x}_${frame.y}_${frame.w}x${frame.h}_${drawW}x${drawH}`;
  let cached = _spriteCache.get(key);
  if (!cached) {
    const m = 2;
    cached = document.createElement('canvas');
    cached.width = Math.round(drawW * m);
    cached.height = Math.round(drawH * m);
    const cx = cached.getContext('2d');
    const srcAspect = frame.w / frame.h;
    const dstAspect = cached.width / cached.height;
    let sx = 0, sy = 0, sw = cached.width, sh = cached.height;
    if (srcAspect > dstAspect) {
      sh = cached.width / srcAspect;
      sy = (cached.height - sh) / 2;
    } else {
      sw = cached.height * srcAspect;
      sx = (cached.width - sw) / 2;
    }
    cx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, sx, sy, sw, sh);
    _spriteCache.set(key, cached);
  }
  return cached;
}

export function drawHealthBar(ctx, x, y, w, h, hp, maxHp) {
  const pct = Math.max(0, hp / maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - w / 2, y, w, h);
  const col = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * pct, h - 2);
}

function getInterpolatedVis() {
  if (!state.localAnim || state.localAnim.type === 'knight') return null;
  if (state.localAnim.keyframes.length < 2) return null;
  if (state.localAnim.totalFrames === 0) return null;
  return interpKeyframes(state.localAnim, state.localAnim.segments, state.localAnim.frame);
}

function getKnightInterpolatedVis(handKey) {
  if (!state.localAnim || state.localAnim.type !== 'knight') return null;
  const data = state.localAnim[handKey];
  if (!data || data.keyframes.length < 2) return null;
  if (state.localAnim.totalFrames === 0) return null;
  return interpKeyframes(data, state.localAnim.segments, state.localAnim.frame);
}

function getKnightRemoteVis(handKey, p) {
  const style = state.playerMeta[p.id]?.attackStyle || 'jab';
  const st = _remoteAnimState.get(p.id);
  // Still mid-swing, OR done swinging but the server is still holding the
  // combo-chain window open waiting to see if another click comes in. Both
  // map to "keep holding the pose" — this is the same real-world condition
  // that keeps the attacker's own weapon frozen in place.
  const stillRelevant = p.attacking || (p.comboChainWindow && (p.comboStep || 0) > 0);

  if (st && st.key === p.attackStartTime && stillRelevant) {
    // Same attack — keep playing/holding using cached anim data.
  } else if (p.attacking) {
    // New attack started — cache the animation data so later comboStep resets
    // don't affect the animation already in flight
    const step = p.comboStep || 1;
    const comboKey = style + '_combo' + step;
    const anim = window.KNIGHT_ANIMATIONS?.[comboKey] || window.KNIGHT_ANIMATIONS?.[style + '_combo1'];
    if (!anim || !anim.knight_sword || anim.knight_sword.keyframes.length < 2) return null;
    const isSpin = step >= 4 && style === 'swing';
    const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
    const segs = anim.segments;
    // Mirror startAttackAnim's hold-point logic exactly, so remote viewers see
    // the same held pose the attacker sees (full extension on the 3rd combo
    // step, half-way through for the others) instead of a fixed midpoint.
    const doHold = style === 'swing' && step < 5;
    const midKf = Math.floor(anim.knight_sword.keyframes.length / 2);
    let halfFrames = 0;
    for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
    const holdFrame = doHold ? (step === 3 ? totalFrames : halfFrames) : 0;
    _remoteAnimState.set(p.id, {
      startTime: performance.now(), key: p.attackStartTime, comboStep: step,
      spinning: isSpin, spinStartAngle: isSpin ? p.facingAngle : 0,
      phase: 'active', returnFrom: {}, cachedAnim: anim,
      doHold, holdFrame, totalFrames
    });
  } else {
    // Not attacking and the combo-chain window is closed — the server has
    // decided this swing is done and isn't waiting on a follow-up click.
    // This is the exact same condition that fires comboWindowEnd for the
    // attacker's own client. Rather than jumping straight to a generic
    // blend (which, from a held mid-swing pose, is nearly a 180-degree
    // rotation and looks like the sword spinning), release the hold and
    // let the clip keep playing its own choreographed back-half — same
    // idea as local's playReturnAnim.
    const entry = _remoteAnimState.get(p.id);
    if (entry && entry.phase === 'active') {
      entry.spinning = false;
      if (entry.doHold && entry.holdFrame > 0 && entry.holdFrame < entry.totalFrames) {
        const relDuration = (entry.totalFrames / 60) * 1000 / 2;
        entry.startTime = performance.now() - entry.holdFrame * (relDuration / entry.totalFrames);
        entry.phase = 'releasing';
      } else {
        entry.phase = 'returning';
        entry.returnStart = performance.now();
      }
    } else if (!entry) {
      return null;
    }
  }

  let entry = _remoteAnimState.get(p.id);
  if (!entry) return null;

  // While releasing, watch for the clip reaching its own natural end. Most
  // combo steps already land on idle there (the clips are authored as
  // symmetric loops); combo step 2 for swing is the one exception — its
  // back-half retraces to combo step 1's hold pose, not true idle — so we
  // hand off to combo1's own back-half for one more leg, mirroring
  // handleAnimNaturalEnd() on the local side exactly.
  if (entry.phase === 'releasing') {
    const relTotal = entry.totalFrames;
    const relDuration = (relTotal / 60) * 1000 / 2;
    if (performance.now() - entry.startTime >= relDuration) {
      if (entry.comboStep === 2 && style === 'swing') {
        const base = window.KNIGHT_ANIMATIONS?.swing_combo1;
        const baseKf = base?.knight_sword?.keyframes;
        if (base && baseKf && baseKf.length >= 2) {
          const bTotal = base.segments.reduce((a, b) => a + b, 0);
          const midKf = Math.floor(baseKf.length / 2);
          let halfFrames = 0;
          for (let i = 0; i < midKf && i < base.segments.length; i++) halfFrames += base.segments[i];
          const bDuration = (bTotal / 60) * 1000 / 2;
          entry.cachedAnim = base;
          entry.totalFrames = bTotal;
          entry.comboStep = 1;
          entry.startTime = performance.now() - halfFrames * (bDuration / bTotal);
        } else {
          entry.phase = 'returning';
          entry.returnStart = performance.now();
        }
      } else {
        // Nowhere further to go — the clip's own end already is idle (by
        // animation design), so drop the entry and let the base idle pose render.
        _remoteAnimState.delete(p.id);
        return null;
      }
    }
  }

  entry = _remoteAnimState.get(p.id);
  if (!entry) return null;
  const anim = entry.cachedAnim;
  if (!anim) return null;
  const data = anim[handKey];
  if (!data || data.keyframes.length < 2) return null;
  const total = entry.totalFrames || anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const duration = (total / 60) * 1000 / 2;
  // Return-to-idle phase: same polar/wrap-safe blend local uses for its own
  // return-from-attack and style-switch tweens (getKnightIdleVis's
  // idleTransition path), so the sword arcs back to rest identically instead
  // of cutting a straight line or spinning the long way around.
  if (entry.phase === 'returning') {
    const from = entry.returnFrom[handKey];
    const baseIdle = window.KNIGHT_VISUALS?.[style]?.[handKey];
    if (!from || !baseIdle) { _remoteAnimState.delete(p.id); return null; }
    const rElapsed = performance.now() - entry.returnStart;
    if (rElapsed >= 350) { _remoteAnimState.delete(p.id); return null; }
    const sway = getIdleSway(handKey);
    const to = { offsetX: baseIdle.offsetX + sway.xOffset, offsetY: baseIdle.offsetY + sway.yOffset, scale: baseIdle.scale, rotation: baseIdle.rotation + sway.rotOffset };
    return lerpPosePolar(from, to, rElapsed / 350);
  }
  // 'active' (holding) or 'releasing' (playing out the back-half) — both
  // just sample the current clip at the current frame; only 'active' clamps
  // at the hold point.
  const elapsed = performance.now() - entry.startTime;
  let fCont = Math.min((elapsed / duration) * total, total - 0.001);
  if (entry.phase === 'active' && entry.doHold && entry.holdFrame > 0 && fCont >= entry.holdFrame) {
    fCont = entry.holdFrame - 0.001;
  }
  const vis = interpKeyframes(data, anim.segments, fCont);
  if (vis) entry.returnFrom[handKey] = vis;
  return vis;
}

function getRemoteVis(p) {
  const style = state.playerMeta[p.id]?.attackStyle || 'jab';
  const st = _remoteAnimState.get(p.id);
  const stillRelevant = p.attacking || (p.comboChainWindow && (p.comboStep || 0) > 0);

  if (st && st.key === p.attackStartTime && stillRelevant) {
    // Same attack — keep playing/holding using cached anim data.
  } else if (p.attacking) {
    // New attack started — cache anim data so later comboStep resets don't affect it
    const step = p.comboStep || 1;
    const comboKey = style + '_combo' + step;
    const anim = window.ANIMATIONS && window.ANIMATIONS[p.currentItem] && (window.ANIMATIONS[p.currentItem][comboKey] || window.ANIMATIONS[p.currentItem][style + '_combo1']);
    if (!anim || anim.keyframes.length < 2) return null;
    const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
    const segs = anim.segments;
    // Mirror startAttackAnim's hold-point logic so remote viewers freeze at
    // the same pose the attacker holds while waiting on the combo window.
    const doHold = style === 'swing' && step < 5;
    const midKf = Math.floor(anim.keyframes.length / 2);
    let halfFrames = 0;
    for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
    const holdFrame = doHold ? (step === 3 ? totalFrames : halfFrames) : 0;
    _remoteAnimState.set(p.id, {
      startTime: performance.now(), key: p.attackStartTime, comboStep: step,
      phase: 'active', returnFrom: {}, cachedAnim: anim,
      doHold, holdFrame, totalFrames
    });
  } else {
    // Not attacking and the combo-chain window is closed — matches the same
    // real-world moment local's comboWindowEnd/playReturnAnim fires.
    const entry = _remoteAnimState.get(p.id);
    if (entry && entry.phase !== 'returning') {
      entry.phase = 'returning';
      entry.returnStart = performance.now();
    } else if (!entry) {
      return null;
    }
  }
  const entry = _remoteAnimState.get(p.id);
  if (!entry) return null;
  const anim = entry.cachedAnim;
  if (!anim || anim.keyframes.length < 2) return null;
  const total = entry.totalFrames || anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const duration = (total / 60) * 1000 / 2;
  // Return-to-idle phase — same polar/wrap-safe blend as everywhere else
  if (entry.phase === 'returning') {
    const from = entry.returnFrom._vis;
    const idleVis = window.ITEM_VISUALS && window.ITEM_VISUALS[p.currentItem];
    if (!from || !idleVis) { _remoteAnimState.delete(p.id); return null; }
    const rElapsed = performance.now() - entry.returnStart;
    if (rElapsed >= 350) { _remoteAnimState.delete(p.id); return null; }
    return lerpPosePolar(from, idleVis, rElapsed / 350);
  }
  // Active phase — play toward the hold point (if any) and freeze there
  const elapsed = performance.now() - entry.startTime;
  let fCont = Math.min((elapsed / duration) * total, total - 0.001);
  if (entry.doHold && entry.holdFrame > 0 && fCont >= entry.holdFrame) {
    fCont = entry.holdFrame - 0.001;
  }
  const vis = interpKeyframes(anim, anim.segments, fCont);
  if (vis) entry.returnFrom._vis = vis;
  return vis;
}

function getZombieAnimVis(handKey, animState) {
  const anim = window.ZOMBIE_ANIMATIONS?.attack;
  if (!anim) return null;
  const handData = handKey === 'left_hand' ? anim.left_hand : anim.right_hand;
  if (!handData || handData.keyframes.length < 2) return null;
  const total = anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const elapsed = performance.now() - animState.startTime;
  const f = Math.min(Math.floor((elapsed / ((total / 60) * 1000 / 4)) * total), total - 1);
  let accum = 0;
  for (let i = 0; i < anim.segments.length; i++) {
    const segLen = anim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = handData.keyframes[i], b = handData.keyframes[i + 1];
      return { offsetX: a.offsetX + (b.offsetX - a.offsetX) * t, offsetY: a.offsetY + (b.offsetY - a.offsetY) * t, scale: a.scale + (b.scale - a.scale) * t, rotation: a.rotation + (b.rotation - a.rotation) * t };
    }
    accum += segLen;
  }
  return handData.keyframes[handData.keyframes.length - 1];
}

function getVis(p) {
  if (p.id === state.myId && state.localAnim) return getInterpolatedVis();
  if (p.id !== state.myId) { const v = getRemoteVis(p); if (v) return v; }
  return window.ITEM_VISUALS && window.ITEM_VISUALS[p.currentItem];
}

function getDrawAngle(p) {
  if (p.id === state.myId && state.localAnim?._spinning) {
    const elapsed = performance.now() - state.localAnim.spinStartTime;
    const progress = Math.min(1, elapsed / 500);
    return state.localAnim.spinStartAngle + Math.PI * 2 * progress;
  }
  // Remote spin: smooth client-side rotation matching local player's spin
  if (p.id !== state.myId) {
    const st = _remoteAnimState.get(p.id);
    if (st && st.spinning && st.phase === 'active') {
      const elapsed = performance.now() - st.startTime;
      const progress = Math.min(1, elapsed / 500);
      return st.spinStartAngle + Math.PI * 2 * progress;
    }
  }
  if (p.attacking && p.attackLockedAngle != null) return p.attackLockedAngle;
  return p._smoothAngle ?? (p.facingAngle || 0);
}

export function getBladeSegment(p, sx, sy, isKnight) {
  let vis;
  let btX, btY, bhX, bhY;
  if (isKnight) {
    vis = getKnightIdleVis('knight_sword');
    if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_sword'); if (animVis) vis = animVis; }
  if (p.id !== state.myId) { const animVis = getKnightRemoteVis('knight_sword', p); if (animVis) vis = animVis; }
    const mS = p.id === state.myId && state._mirrorSword ? -1 : 1;
    btX = window.KNIGHT_BLADE_TIP_X * mS; btY = window.KNIGHT_BLADE_TIP_Y;
    bhX = window.KNIGHT_BLADE_HILT_X * mS; bhY = window.KNIGHT_BLADE_HILT_Y;
  } else {
    vis = getVis(p);
    btX = window.BLADE_TIP_X; btY = window.BLADE_TIP_Y;
    bhX = window.BLADE_HILT_X; bhY = window.BLADE_HILT_Y;
  }
  if (!vis) return null;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const ox = sx + rx, oy = sy + ry;
  const scale = vis.scale;
  const rot = (angle + (vis.rotation || 0));
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  return { hiltX: ox + (bhX * cosR - bhY * sinR) * scale, hiltY: oy + (bhX * sinR + bhY * cosR) * scale, tipX: ox + (btX * cosR - btY * sinR) * scale, tipY: oy + (btX * sinR + btY * cosR) * scale };
}

export function startAttackAnim(lockedAngle, comboStep) {
  const me = state.players[state.myId];
  if (!me) return;
  state._mirrorSword = (state.attackStyle === 'swing') && (comboStep || 1) >= 2;
  const style = state.attackStyle || 'jab';
  const comboKey = style + '_combo' + (comboStep || 1);
  const knightFrame = state.knightFrames?.['T1KnightHead.png']?.frame;
  const isSwing = state.attackStyle === 'swing';
  if (knightFrame) {
    const anim = window.KNIGHT_ANIMATIONS?.[comboKey] || window.KNIGHT_ANIMATIONS?.[style + '_combo1'];
    if (!anim || !anim.knight_sword || anim.knight_sword.keyframes.length < 2) return;
    const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
    const segs = anim.segments;
    const midKf = Math.floor(anim.knight_sword.keyframes.length / 2);
    let halfFrames = 0;
    for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
    const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
    const doHold = isSwing && comboStep < 5;
    const holdFrame = doHold ? (comboStep === 3 ? totalFrames : halfFrames) : 0;
    state.localAnim = { type: 'knight', knight_sword: { keyframes: anim.knight_sword.keyframes }, knight_hand: { keyframes: anim.knight_hand.keyframes }, segments: anim.segments, frame: 0, totalFrames, lockedAngle: locked, startTime: performance.now(), _holdFrame: holdFrame, _holding: doHold, _spinning: comboStep === 4 && isSwing, spinStartAngle: locked, spinStartTime: performance.now(), _comboStep: comboStep, _style: style };
  } else {
    const anim = window.ANIMATIONS && window.ANIMATIONS[me.currentItem] && (window.ANIMATIONS[me.currentItem][comboKey] || window.ANIMATIONS[me.currentItem][style + '_combo1']);
    if (anim) {
      const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
      const segs = anim.segments;
      const midKf = Math.floor(anim.keyframes.length / 2);
      let halfFrames = 0;
      for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
      const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
      const doHold = isSwing && comboStep < 5;
      const holdFrame = doHold ? (comboStep === 3 ? totalFrames : halfFrames) : 0;
      state.localAnim = { type: 'sword', keyframes: anim.keyframes, segments: anim.segments, frame: 0, totalFrames, lockedAngle: locked, startTime: performance.now(), _holdFrame: holdFrame, _holding: doHold, _spinning: comboStep === 4 && isSwing, spinStartAngle: locked, spinStartTime: performance.now() };
    }
  }
}

export function playReturnAnim() {
  if (!state.localAnim) return;
  const anim = state.localAnim;
  if (anim.type === 'knight' && anim._holding && anim._holdFrame > 0 && anim._holdFrame < anim.totalFrames) {
    // The swing was frozen mid-clip waiting on a possible combo
    // continuation that never came. Instead of jumping straight from that
    // held pose to idle (a generic blend across two nearly-opposite
    // rotation values looks like the sword doing a 180), let the clip keep
    // playing its own choreographed back-half — these animations are
    // authored as symmetric loops, so continuing retraces the exact path
    // the sword swung out on and lands back on a meaningful pose with no
    // big rotation. handleAnimNaturalEnd() takes over once it reaches the
    // end of the clip.
    const duration = (anim.totalFrames / 60) * 1000 / 2;
    anim.startTime = performance.now() - anim._holdFrame * (duration / anim.totalFrames);
    anim.frame = anim._holdFrame;
    anim._holding = false;
    anim._spinning = false;
    return;
  }
  // Already at the end of its clip (e.g. combo3's full-length hold, which
  // lands close to idle already) or a non-swing attack — no more
  // choreographed motion left to retrace, so do a short residual blend.
  state._mirrorSword = false;
  const curSword = getKnightInterpolatedVis('knight_sword');
  const curHand = getKnightInterpolatedVis('knight_hand');
  const style = state.attackStyle || 'jab';
  const visuals = window.KNIGHT_VISUALS?.[style];
  if (curSword && curHand && visuals) {
    state.idleTransition = {
      fromSword: { offsetX: curSword.offsetX, offsetY: curSword.offsetY, scale: curSword.scale, rotation: curSword.rotation },
      fromHand: { offsetX: curHand.offsetX, offsetY: curHand.offsetY, scale: curHand.scale, rotation: curHand.rotation },
      toSword: { ...visuals.knight_sword },
      toHand: { ...visuals.knight_hand },
      startTime: performance.now(),
      durationMs: 350
    };
  }
  state.localAnim = null;
}

// Called every frame (from render.js) once a released, no-longer-holding
// localAnim reaches the natural end of its clip. Most combo steps already
// land on idle by that point (the animations are authored as symmetric
// loops). The one exception is combo step 2 for swing: its back-half
// retraces to combo step 1's hold pose, not true idle, so we hand off to
// combo1's own back-half for one more leg before finally settling on idle.
export function handleAnimNaturalEnd() {
  const anim = state.localAnim;
  if (!anim || anim.type !== 'knight' || anim._holding) return;
  if (anim._comboStep === 2 && anim._style === 'swing') {
    const base = window.KNIGHT_ANIMATIONS?.swing_combo1;
    const baseKf = base?.knight_sword?.keyframes;
    if (base && baseKf && baseKf.length >= 2) {
      const bTotal = base.segments.reduce((a, b) => a + b, 0);
      const midKf = Math.floor(baseKf.length / 2);
      let halfFrames = 0;
      for (let i = 0; i < midKf && i < base.segments.length; i++) halfFrames += base.segments[i];
      const bDuration = (bTotal / 60) * 1000 / 2;
      state.localAnim = {
        type: 'knight', knight_sword: { keyframes: base.knight_sword.keyframes }, knight_hand: { keyframes: base.knight_hand.keyframes },
        segments: base.segments, frame: halfFrames, totalFrames: bTotal,
        startTime: performance.now() - halfFrames * (bDuration / bTotal),
        _holdFrame: 0, _holding: false, _spinning: false,
        _comboStep: 1, _style: 'swing'
      };
      return;
    }
  }
  // Nowhere further to go — the clip's own end already is idle (by
  // animation design), so let the base idle pose (with sway) take over.
  state.localAnim = null;
}

function drawSword(ctx, p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const frame = state.spriteFrames?.['woodensword.png']?.frame;
  if (!frame) return;
  const sw = 1254 * vis.scale, sh = 1254 * vis.scale;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.spriteSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawKnightSword(ctx, p, sx, sy) {
  let vis = getKnightIdleVis('knight_sword');
  if (p.id !== state.myId) { const s = state.playerMeta[p.id]?.attackStyle; if (s) vis = getKnightIdleVis('knight_sword', s); }
  if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_sword'); if (animVis) vis = animVis; }
  if (p.id !== state.myId) { const animVis = getKnightRemoteVis('knight_sword', p); if (animVis) vis = animVis; }
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const entry = state.knightFrames?.['T1KnightSword.png'];
  const frame = entry?.frame;
  if (!frame) return;
  const sw = frame.w * vis.scale, sh = frame.h * vis.scale;
  const remoteEntry = p.id !== state.myId ? _remoteAnimState.get(p.id) : null;
  const remoteMir = p.id !== state.myId && (state.playerMeta[p.id]?.attackStyle || 'jab') === 'swing' && (remoteEntry?.comboStep || p.comboStep || 1) >= 2;
  const mirS = (p.id === state.myId && state._mirrorSword) || remoteMir;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  if (mirS) {
    ctx.scale(-1, 1);
    ctx.rotate(-(angle + (vis.rotation || 0)));
  } else {
    ctx.rotate(angle + (vis.rotation || 0));
  }
  ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawKnightHand(ctx, p, sx, sy) {
  let vis = getKnightIdleVis('knight_hand');
  if (p.id !== state.myId) { const s = state.playerMeta[p.id]?.attackStyle; if (s) vis = getKnightIdleVis('knight_hand', s); }
  if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_hand'); if (animVis) vis = animVis; }
  if (p.id !== state.myId) { const animVis = getKnightRemoteVis('knight_hand', p); if (animVis) vis = animVis; }
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const entry = state.knightFrames?.['T1KnightLeftHand.png'];
  const frame = entry?.frame;
  if (!frame) return;
  const sw = frame.w * vis.scale, sh = frame.h * vis.scale;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function getMobSpritePrefix(z) {
  const mobTypes = window.MOB_TYPES || [];
  const mt = mobTypes[z.mobType];
  if (mt && mt.id === 'troll') return 'troll';
  return 'zombie';
}

function drawZombieHand(ctx, z, szx, szy, angle, handKey) {
  const prefix = getMobSpritePrefix(z);
  const isTroll = prefix === 'troll';
  const fname = handKey === 'left_hand' ? (isTroll ? 'trolllefthand.png' : 'zombielefthand.png') : (isTroll ? 'trollrighthand.png' : 'zombierighthand.png');
  const frame = state.spriteFrames?.[fname]?.frame;
  if (!frame) return;
  let vis = window.ZOMBIE_VISUALS?.[handKey];
  const animState = state.zombieAnims?.[z.id];
  if (animState) { const animVis = getZombieAnimVis(handKey, animState); if (animVis) vis = animVis; }
  if (!vis) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const handScale = isTroll ? 1.1 : 1.0;
  const sw = frame.w * vis.scale * handScale, sh = frame.h * vis.scale * handScale;
  ctx.save();
  ctx.translate(szx + rx, szy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.spriteSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawDebugSwordHitbox(ctx, p, sx, sy, isKnight) {
  const seg = getBladeSegment(p, sx, sy, isKnight);
  if (!seg) return;
  const { hiltX, hiltY, tipX, tipY } = seg;
  const bw = window.BLADE_W ?? 6;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
  ctx.lineWidth = bw * 2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hiltX, hiltY); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(hiltX, hiltY); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
  ctx.beginPath(); ctx.arc(tipX, tipY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hiltX, hiltY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,0,0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('hitbox (bladeW=' + bw + ')', tipX + 6, tipY - 6);
  ctx.restore();
}

export function drawKnightPreview(ctx, cw, ch) {
  const cx = cw / 2, cy = ch / 2;
  const headFrame = state.knightFrames?.['T1KnightHead.png']?.frame;
  if (headFrame) {
    const sz = 48 / Math.max(headFrame.w, headFrame.h);
    ctx.drawImage(state.knightSheet, headFrame.x, headFrame.y, headFrame.w, headFrame.h, cx - (headFrame.w * sz) / 2, cy - (headFrame.h * sz) / 2, headFrame.w * sz, headFrame.h * sz);
  }
  const swordEntry = state.knightFrames?.['T1KnightSword.png'];
  const swordFrame = swordEntry?.frame;
  const swordVis = window.KNIGHT_VISUALS?.jab?.knight_sword;
  if (swordFrame && swordVis) {
    const sw = swordFrame.w * swordVis.scale, sh = swordFrame.h * swordVis.scale;
    ctx.save();
    ctx.translate(cx + swordVis.offsetX, cy + swordVis.offsetY);
    ctx.rotate(swordVis.rotation || 0);
    ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, swordFrame), -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
  const handEntry = state.knightFrames?.['T1KnightLeftHand.png'];
  const handFrame = handEntry?.frame;
  const handVis = window.KNIGHT_VISUALS?.jab?.knight_hand;
  if (handFrame && handVis) {
    const sw = handFrame.w * handVis.scale, sh = handFrame.h * handVis.scale;
    ctx.save();
    ctx.translate(cx + handVis.offsetX, cy + handVis.offsetY);
    ctx.rotate(handVis.rotation || 0);
    ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, handFrame), -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}

export function drawPlayer(ctx, p, sx, sy, alpha, topKills) {
  const knightFrame = state.knightFrames?.['T1KnightHead.png']?.frame;
  const isKnight = !!knightFrame;
  const bob = getMovementBob(p);
  const lean = updateLean(p);

  if (knightFrame) {
    drawKnightSword(ctx, p, sx + bob.x, sy + bob.y);
    drawKnightHand(ctx, p, sx + bob.x, sy + bob.y);
  } else {
    drawSword(ctx, p, sx, sy);
  }

  const isTop = topKills > 0 && p.kills === topKills;
  drawHealthBar(ctx, sx, sy - 36, 36, 4, p.health, p.maxHealth);

  if (knightFrame) {
    const breath = getBreathScale(0.015);
    const sz = (56 / Math.max(knightFrame.w, knightFrame.h)) * breath;
    ctx.save();
    ctx.translate(sx + bob.x, sy + bob.y);
    ctx.rotate(getDrawAngle(p) - Math.PI / 2 + lean);
    ctx.drawImage(getSpriteFromSheet(state.knightSheet, knightFrame.w * sz, knightFrame.h * sz, knightFrame), -(knightFrame.w * sz) / 2, -(knightFrame.h * sz) / 2, knightFrame.w * sz, knightFrame.h * sz);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (isTop && p.kills > 0) { ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; }
    else if (p.id === state.myId) { ctx.strokeStyle = '#222'; ctx.lineWidth = 3; }
    else { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; }
    ctx.stroke();
  }
  ctx.fillStyle = '#000';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, sx, sy - 42);
}

export function drawZombie(ctx, z, szx, szy, zombieAngle) {
  const prefix = getMobSpritePrefix(z);
  const headKey = prefix === 'troll' ? 'trollhead.png' : 'zombiehead.png';
  const headFrame = state.spriteFrames?.[headKey]?.frame;
  if (headFrame) {
    const headScale = prefix === 'troll' ? 1.1 : 1.0;
    const sz = (40 * headScale) / Math.max(headFrame.w, headFrame.h);
    ctx.save();
    ctx.translate(szx, szy);
    ctx.rotate(zombieAngle - Math.PI / 2);
    ctx.drawImage(getSpriteFromSheet(state.spriteSheet, headFrame.w * sz, headFrame.h * sz, headFrame), -(headFrame.w * sz) / 2, -(headFrame.h * sz) / 2, headFrame.w * sz, headFrame.h * sz);
    ctx.restore();
  }
  drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand');
  drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand');
  ctx.fillStyle = '#ff6666';
  ctx.fillText(z.label || 'zombie', szx, szy - 30);
  drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
}

export { drawDebugSwordHitbox, startIdleTransition };
