import { state } from './state.js';
import { KNIGHT_VISUALS, KNIGHT_ANIMATIONS, ANIMATIONS, ITEM_VISUALS, ZOMBIE_ANIMATIONS, ZOMBIE_VISUALS, BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y, KNIGHT_BLADE_TIP_X, KNIGHT_BLADE_TIP_Y, KNIGHT_BLADE_HILT_X, KNIGHT_BLADE_HILT_Y, MOB_TYPES } from './game-data.js';

function shortAngleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function toPolar(x, y) {
  return { r: Math.sqrt(x * x + y * y), theta: Math.atan2(y, x) };
}

function fromPolar(r, theta) {
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

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

function getBreathScale(amp) {
  const t = performance.now() / 3500 * Math.PI * 2;
  return 1.0 + Math.sin(t) * (amp || 0.015);
}

const _remoteAnimState = new Map();
const _leanRotMap = new Map();
const _smoothBobSpeed = new Map();

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
  const base = KNIGHT_VISUALS?.[style]?.[handKey];
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
  const visuals = KNIGHT_VISUALS;
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
  const stillRelevant = p.attacking || (p.comboChainWindow && (p.comboStep || 0) > 0);

  if (st && st.key === p.attackStartTime && stillRelevant) {
  } else if (p.attacking) {
    const step = p.comboStep || 1;
    const comboKey = style + '_combo' + step;
    const anim = KNIGHT_ANIMATIONS?.[comboKey] || KNIGHT_ANIMATIONS?.[style + '_combo1'];
    if (!anim || !anim.knight_sword || anim.knight_sword.keyframes.length < 2) return null;
    const isSpin = step >= 4 && style === 'swing';
    const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
    const segs = anim.segments;
    const doHold = style === 'swing' && step < 5;
    const midKf = Math.floor(anim.knight_sword.keyframes.length / 2);
    let halfFrames = 0;
    for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
    const holdFrame = doHold ? (step === 1 || step === 4 ? halfFrames : totalFrames) : 0;
    _remoteAnimState.set(p.id, {
      startTime: performance.now(), key: p.attackStartTime, comboStep: step,
      spinning: isSpin, spinStartAngle: isSpin ? p.facingAngle : 0,
      phase: 'active', returnFrom: {}, cachedAnim: anim,
      doHold, holdFrame, totalFrames
    });
  } else {
    const entry = _remoteAnimState.get(p.id);
    if (entry && entry.phase === 'active') {
      entry.spinning = false;
      if (entry.doHold && entry.holdFrame > 0 && entry.holdFrame < entry.totalFrames) {
        const relDuration = (entry.totalFrames / 60) * 1000 / 2;
        entry.startTime = performance.now() - entry.holdFrame * (relDuration / entry.totalFrames);
        entry.phase = 'releasing';
      } else {
        const animDuration = (entry.totalFrames / 60) * 1000 / 2;
        const elapsed = performance.now() - entry.startTime;
        if (elapsed >= animDuration) {
          entry.phase = 'returning';
          entry.returnStart = performance.now();
        }
      }
    } else if (!entry) {
      return null;
    }
  }

  let entry = _remoteAnimState.get(p.id);
  if (!entry) return null;

  if (entry.phase === 'releasing') {
    const relTotal = entry.totalFrames;
    const relDuration = (relTotal / 60) * 1000 / 2;
    if (performance.now() - entry.startTime >= relDuration) {
      if (entry.comboStep === 2 && style === 'swing') {
        entry.phase = 'returning';
        entry.returnStart = performance.now();
      } else {
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
  if (entry.phase === 'returning') {
    const from = entry.returnFrom[handKey];
    const baseIdle = KNIGHT_VISUALS?.[style]?.[handKey];
    if (!from || !baseIdle) { _remoteAnimState.delete(p.id); return null; }
    const rElapsed = performance.now() - entry.returnStart;
    if (rElapsed >= 350) { _remoteAnimState.delete(p.id); return null; }
    const sway = getIdleSway(handKey);
    const to = { offsetX: baseIdle.offsetX + sway.xOffset, offsetY: baseIdle.offsetY + sway.yOffset, scale: baseIdle.scale, rotation: baseIdle.rotation + sway.rotOffset };
    return lerpPosePolar(from, to, rElapsed / 350);
  }
  const elapsed = performance.now() - entry.startTime;
  let fCont = (elapsed / duration) * total;
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
  } else if (p.attacking) {
    const step = p.comboStep || 1;
    const comboKey = style + '_combo' + step;
    const anim = ANIMATIONS && ANIMATIONS[p.currentItem] && (ANIMATIONS[p.currentItem][comboKey] || ANIMATIONS[p.currentItem][style + '_combo1']);
    if (!anim || anim.keyframes.length < 2) return null;
    const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
    const segs = anim.segments;
    const doHold = style === 'swing' && step < 5;
    const midKf = Math.floor(anim.keyframes.length / 2);
    let halfFrames = 0;
    for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
    const holdFrame = doHold ? (step === 1 || step === 4 ? halfFrames : totalFrames) : 0;
    _remoteAnimState.set(p.id, {
      startTime: performance.now(), key: p.attackStartTime, comboStep: step,
      phase: 'active', returnFrom: {}, cachedAnim: anim,
      doHold, holdFrame, totalFrames
    });
  } else {
    const entry = _remoteAnimState.get(p.id);
    if (entry && entry.phase !== 'returning') {
      const animDuration = (entry.totalFrames / 60) * 1000 / 2;
      const elapsed = performance.now() - entry.startTime;
      if (elapsed >= animDuration) {
        entry.phase = 'returning';
        entry.returnStart = performance.now();
      }
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
  if (entry.phase === 'returning') {
    const from = entry.returnFrom._vis;
    const idleVis = ITEM_VISUALS && ITEM_VISUALS[p.currentItem];
    if (!from || !idleVis) { _remoteAnimState.delete(p.id); return null; }
    const rElapsed = performance.now() - entry.returnStart;
    if (rElapsed >= 350) { _remoteAnimState.delete(p.id); return null; }
    return lerpPosePolar(from, idleVis, rElapsed / 350);
  }
  const elapsed = performance.now() - entry.startTime;
  let fCont = (elapsed / duration) * total;
  if (entry.doHold && entry.holdFrame > 0 && fCont >= entry.holdFrame) {
    fCont = entry.holdFrame - 0.001;
  }
  const vis = interpKeyframes(anim, anim.segments, fCont);
  if (vis) entry.returnFrom._vis = vis;
  return vis;
}

function getZombieAnimVis(handKey, animState) {
  const anim = ZOMBIE_ANIMATIONS?.attack;
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
  return ITEM_VISUALS && ITEM_VISUALS[p.currentItem];
}

function getDrawAngle(p) {
  if (p.id === state.myId && state.localAnim?._spinning) {
    const elapsed = performance.now() - state.localAnim.spinStartTime;
    const progress = Math.min(1, elapsed / 500);
    return state.localAnim.spinStartAngle + Math.PI * 2 * progress;
  }
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

function getBladeSegment(p, sx, sy, isKnight) {
  let vis;
  let btX, btY, bhX, bhY;
  if (isKnight) {
    vis = getKnightIdleVis('knight_sword');
    if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_sword'); if (animVis) vis = animVis; }
    if (p.id !== state.myId) { const animVis = getKnightRemoteVis('knight_sword', p); if (animVis) vis = animVis; }
    const mS = p.id === state.myId && state._mirrorSword ? -1 : 1;
    btX = KNIGHT_BLADE_TIP_X * mS; btY = KNIGHT_BLADE_TIP_Y;
    bhX = KNIGHT_BLADE_HILT_X * mS; bhY = KNIGHT_BLADE_HILT_Y;
  } else {
    vis = getVis(p);
    btX = BLADE_TIP_X; btY = BLADE_TIP_Y;
    bhX = BLADE_HILT_X; bhY = BLADE_HILT_Y;
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

function startAttackAnim(lockedAngle, comboStep) {
  const me = state.players[state.myId];
  if (!me) return;
  state.idleTransition = null;
  state._mirrorSword = (state.attackStyle === 'swing') && (comboStep || 1) >= 2;
  const style = state.attackStyle || 'jab';
  const comboKey = style + '_combo' + (comboStep || 1);
  const knightFrame = state.knightFrames?.['T1KnightHead.png']?.frame;
  const isSwing = state.attackStyle === 'swing';
  if (knightFrame) {
    const anim = KNIGHT_ANIMATIONS?.[comboKey] || KNIGHT_ANIMATIONS?.[style + '_combo1'];
    if (!anim || !anim.knight_sword || anim.knight_sword.keyframes.length < 2) return;
    const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
    const segs = anim.segments;
    const midKf = Math.floor(anim.knight_sword.keyframes.length / 2);
    let halfFrames = 0;
    for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
    const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
    const doHold = isSwing && comboStep < 5;
    const holdFrame = doHold ? (comboStep === 1 || comboStep === 4 ? halfFrames : totalFrames) : 0;
    state.localAnim = { type: 'knight', knight_sword: { keyframes: anim.knight_sword.keyframes }, knight_hand: { keyframes: anim.knight_hand.keyframes }, segments: anim.segments, frame: 0, totalFrames, lockedAngle: locked, startTime: performance.now(), _holdFrame: holdFrame, _holding: doHold, _spinning: comboStep === 4 && isSwing, spinStartAngle: locked, spinStartTime: performance.now(), _comboStep: comboStep, _style: style };
  } else {
    const anim = ANIMATIONS && ANIMATIONS[me.currentItem] && (ANIMATIONS[me.currentItem][comboKey] || ANIMATIONS[me.currentItem][style + '_combo1']);
    if (anim) {
      const totalFrames = anim.segments.reduce((a, b) => a + b, 0);
      const segs = anim.segments;
      const midKf = Math.floor(anim.keyframes.length / 2);
      let halfFrames = 0;
      for (let i = 0; i < midKf && i < segs.length; i++) halfFrames += segs[i];
      const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
      const doHold = isSwing && comboStep < 5;
      const holdFrame = doHold ? (comboStep === 1 || comboStep === 4 ? halfFrames : totalFrames) : 0;
      state.localAnim = { type: 'sword', keyframes: anim.keyframes, segments: anim.segments, frame: 0, totalFrames, lockedAngle: locked, startTime: performance.now(), _holdFrame: holdFrame, _holding: doHold, _spinning: comboStep === 4 && isSwing, spinStartAngle: locked, spinStartTime: performance.now() };
    }
  }
}

function playReturnAnim() {
  if (!state.localAnim) return;
  const anim = state.localAnim;
  // Release the back-half hold for combos with keyframes remaining
  if (anim.type === 'knight' && anim._holding && anim._holdFrame > 0 && anim._holdFrame < anim.totalFrames) {
    const duration = (anim.totalFrames / 60) * 1000 / 2;
    anim.startTime = performance.now() - anim._holdFrame * (duration / anim.totalFrames);
    anim.frame = anim._holdFrame;
    anim._holding = false;
    anim._spinning = false;
    state._mirrorSword = false;
    return;
  }
  // Smooth idle transition for combos that played all the way through
  state._mirrorSword = false;
  const curSword = getKnightInterpolatedVis('knight_sword');
  const curHand = getKnightInterpolatedVis('knight_hand');
  const style = state.attackStyle || 'jab';
  const visuals = KNIGHT_VISUALS?.[style];
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

function handleAnimNaturalEnd() {
  const anim = state.localAnim;
  if (!anim || anim.type !== 'knight' || anim._holding) return;
  if (anim._comboStep === 2 && anim._style === 'swing') {
    return;
  }
  state.localAnim = null;
}

export {
  updateLean, getMovementBob, getBreathScale,
  getKnightIdleVis, getKnightInterpolatedVis,
  getKnightRemoteVis, getRemoteVis, getZombieAnimVis,
  getVis, getDrawAngle, getBladeSegment,
  startAttackAnim, playReturnAnim, handleAnimNaturalEnd,
  startIdleTransition,
  interpKeyframes, lerpPosePolar, shortAngleDelta,
  getInterpolatedVis
};
