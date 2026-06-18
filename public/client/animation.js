function getInterpolatedVis() {
  if (!localAnim || localAnim.keyframes.length < 2) return null;
  const total = localAnim.totalFrames;
  if (total === 0) return null;
  const f = Math.min(localAnim.frame, total - 1);
  let accum = 0;
  for (let i = 0; i < localAnim.segments.length; i++) {
    const segLen = localAnim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = localAnim.keyframes[i];
      const b = localAnim.keyframes[i + 1];
      return {
        offsetX: +(a.offsetX + (b.offsetX - a.offsetX) * t).toFixed(1),
        offsetY: +(a.offsetY + (b.offsetY - a.offsetY) * t).toFixed(1),
        scale: +(a.scale + (b.scale - a.scale) * t).toFixed(3),
        rotation: +(a.rotation + (b.rotation - a.rotation) * t).toFixed(3)
      };
    }
    accum += segLen;
  }
  return localAnim.keyframes[localAnim.keyframes.length - 1];
}

function getRemoteVis(p) {
  if (!p.attacking) return null;
  const anim = window.ANIMATIONS && window.ANIMATIONS[p.currentItem] && window.ANIMATIONS[p.currentItem].attack;
  if (!anim || anim.keyframes.length < 2) return null;
  const total = anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const elapsed = Math.max(0, Date.now() - (p.attackStartTime || 0));
  const duration = 300;
  const f = Math.min(Math.floor((elapsed / duration) * total), total - 1);
  let accum = 0;
  for (let i = 0; i < anim.segments.length; i++) {
    const segLen = anim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = anim.keyframes[i], b = anim.keyframes[i + 1];
      return {
        offsetX: a.offsetX + (b.offsetX - a.offsetX) * t,
        offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t
      };
    }
    accum += segLen;
  }
  return anim.keyframes[anim.keyframes.length - 1];
}

function getVis(p) {
  if (p.id === myId && localAnim) return getInterpolatedVis();
  if (p.id !== myId && p.attacking) {
    const v = getRemoteVis(p);
    if (v) return v;
  }
  return window.ITEM_VISUALS && window.ITEM_VISUALS[p.currentItem];
}

function getDrawAngle(p) {
  if (p.id !== myId && p.attacking && p.attackLockedAngle != null) return p.attackLockedAngle;
  return p.facingAngle || 0;
}

function startAttackAnim(lockedAngle) {
  if (localAnim) return;
  const me = players[myId];
  if (!me) return;
  const anim = window.ANIMATIONS && window.ANIMATIONS[me.currentItem] && window.ANIMATIONS[me.currentItem].attack;
  if (anim) {
    const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
    localAnim = {
      keyframes: anim.keyframes,
      segments: anim.segments,
      frame: 0,
      totalFrames: anim.segments.reduce((a, b) => a + b, 0),
      lockedAngle: locked,
      startTime: performance.now()
    };
  }
}
