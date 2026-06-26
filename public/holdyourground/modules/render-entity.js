import { state } from './state.js';

const _spriteCache = new Map();

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
    cached.getContext('2d').drawImage(sheet, frame.x, frame.y, frame.w, frame.h, 0, 0, cached.width, cached.height);
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
  const total = state.localAnim.totalFrames;
  if (total === 0) return null;
  const f = Math.min(state.localAnim.frame, total - 1);
  let accum = 0;
  for (let i = 0; i < state.localAnim.segments.length; i++) {
    const segLen = state.localAnim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = state.localAnim.keyframes[i];
      const b = state.localAnim.keyframes[i + 1];
      return { offsetX: +(a.offsetX + (b.offsetX - a.offsetX) * t).toFixed(1), offsetY: +(a.offsetY + (b.offsetY - a.offsetY) * t).toFixed(1), scale: +(a.scale + (b.scale - a.scale) * t).toFixed(3), rotation: +(a.rotation + (b.rotation - a.rotation) * t).toFixed(3) };
    }
    accum += segLen;
  }
  return state.localAnim.keyframes[state.localAnim.keyframes.length - 1];
}

function getKnightInterpolatedVis(handKey) {
  if (!state.localAnim || state.localAnim.type !== 'knight') return null;
  const data = state.localAnim[handKey];
  if (!data || data.keyframes.length < 2) return null;
  const total = state.localAnim.totalFrames;
  if (total === 0) return null;
  const f = Math.min(state.localAnim.frame, total - 1);
  let accum = 0;
  for (let i = 0; i < state.localAnim.segments.length; i++) {
    const segLen = state.localAnim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = data.keyframes[i], b = data.keyframes[i + 1];
      return { offsetX: +(a.offsetX + (b.offsetX - a.offsetX) * t).toFixed(1), offsetY: +(a.offsetY + (b.offsetY - a.offsetY) * t).toFixed(1), scale: +(a.scale + (b.scale - a.scale) * t).toFixed(3), rotation: +(a.rotation + (b.rotation - a.rotation) * t).toFixed(3) };
    }
    accum += segLen;
  }
  return data.keyframes[data.keyframes.length - 1];
}

function getKnightRemoteVis(handKey, p) {
  if (!p.attacking) return null;
  const anim = window.KNIGHT_ANIMATIONS?.attack;
  if (!anim) return null;
  const data = anim[handKey];
  if (!data || data.keyframes.length < 2) return null;
  const total = anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const elapsed = Math.max(0, Date.now() - (p.attackStartTime || 0));
  const f = Math.min(Math.floor((elapsed / 300) * total), total - 1);
  let accum = 0;
  for (let i = 0; i < anim.segments.length; i++) {
    const segLen = anim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = data.keyframes[i], b = data.keyframes[i + 1];
      return { offsetX: a.offsetX + (b.offsetX - a.offsetX) * t, offsetY: a.offsetY + (b.offsetY - a.offsetY) * t, scale: a.scale + (b.scale - a.scale) * t, rotation: a.rotation + (b.rotation - a.rotation) * t };
    }
    accum += segLen;
  }
  return data.keyframes[data.keyframes.length - 1];
}

function getRemoteVis(p) {
  if (!p.attacking) return null;
  const anim = window.ANIMATIONS && window.ANIMATIONS[p.currentItem] && window.ANIMATIONS[p.currentItem].attack;
  if (!anim || anim.keyframes.length < 2) return null;
  const total = anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const elapsed = Math.max(0, Date.now() - (p.attackStartTime || 0));
  const f = Math.min(Math.floor((elapsed / 300) * total), total - 1);
  let accum = 0;
  for (let i = 0; i < anim.segments.length; i++) {
    const segLen = anim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = anim.keyframes[i], b = anim.keyframes[i + 1];
      return { offsetX: a.offsetX + (b.offsetX - a.offsetX) * t, offsetY: a.offsetY + (b.offsetY - a.offsetY) * t, scale: a.scale + (b.scale - a.scale) * t, rotation: a.rotation + (b.rotation - a.rotation) * t };
    }
    accum += segLen;
  }
  return anim.keyframes[anim.keyframes.length - 1];
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
  if (p.id !== state.myId && p.attacking) { const v = getRemoteVis(p); if (v) return v; }
  return window.ITEM_VISUALS && window.ITEM_VISUALS[p.currentItem];
}

function getDrawAngle(p) {
  if (p.id !== state.myId && p.attacking && p.attackLockedAngle != null) return p.attackLockedAngle;
  return p._smoothAngle ?? (p.facingAngle || 0);
}

export function getBladeSegment(p, sx, sy, isKnight) {
  let vis;
  let btX, btY, bhX, bhY;
  if (isKnight) {
    vis = window.KNIGHT_VISUALS?.knight_sword;
    if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_sword'); if (animVis) vis = animVis; }
    if (p.id !== state.myId && p.attacking) { const animVis = getKnightRemoteVis('knight_sword', p); if (animVis) vis = animVis; }
    btX = window.KNIGHT_BLADE_TIP_X; btY = window.KNIGHT_BLADE_TIP_Y;
    bhX = window.KNIGHT_BLADE_HILT_X; bhY = window.KNIGHT_BLADE_HILT_Y;
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
  const rot = angle + (vis.rotation || 0);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  return { hiltX: ox + (bhX * cosR - bhY * sinR) * scale, hiltY: oy + (bhX * sinR + bhY * cosR) * scale, tipX: ox + (btX * cosR - btY * sinR) * scale, tipY: oy + (btX * sinR + btY * cosR) * scale };
}

export function startAttackAnim(lockedAngle) {
  if (state.localAnim) return;
  const me = state.players[state.myId];
  if (!me) return;
  const knightKey = me.lvl >= 20 ? 'T3KnightHead.png' : me.lvl >= 10 ? 'T2KnightHead.png' : 'T1KnightHead.png';
  const knightFrame = state.knightFrames?.[knightKey]?.frame;
  if (knightFrame) {
    const anim = window.KNIGHT_ANIMATIONS?.attack;
    if (!anim || !anim.knight_sword || anim.knight_sword.keyframes.length < 2) return;
    const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
    state.localAnim = { type: 'knight', knight_sword: { keyframes: anim.knight_sword.keyframes }, knight_hand: { keyframes: anim.knight_hand.keyframes }, segments: anim.segments, frame: 0, totalFrames: anim.segments.reduce((a, b) => a + b, 0), lockedAngle: locked, startTime: performance.now() };
  } else {
    const anim = window.ANIMATIONS && window.ANIMATIONS[me.currentItem] && window.ANIMATIONS[me.currentItem].attack;
    if (anim) {
      const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
      state.localAnim = { type: 'sword', keyframes: anim.keyframes, segments: anim.segments, frame: 0, totalFrames: anim.segments.reduce((a, b) => a + b, 0), lockedAngle: locked, startTime: performance.now() };
    }
  }
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
  let vis = window.KNIGHT_VISUALS?.knight_sword;
  if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_sword'); if (animVis) vis = animVis; }
  if (p.id !== state.myId && p.attacking) { const animVis = getKnightRemoteVis('knight_sword', p); if (animVis) vis = animVis; }
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const entry = state.knightFrames?.['T1KnightSword.png'];
  const frame = entry?.frame;
  if (!frame) return;
  const sw = (entry.sourceSize?.w || 128) * vis.scale, sh = (entry.sourceSize?.h || 128) * vis.scale;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawKnightHand(ctx, p, sx, sy) {
  let vis = window.KNIGHT_VISUALS?.knight_hand;
  if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_hand'); if (animVis) vis = animVis; }
  if (p.id !== state.myId && p.attacking) { const animVis = getKnightRemoteVis('knight_hand', p); if (animVis) vis = animVis; }
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const entry = state.knightFrames?.['T1KnightLeftHand.png'];
  const frame = entry?.frame;
  if (!frame) return;
  const sw = (entry.sourceSize?.w || 96) * vis.scale, sh = (entry.sourceSize?.h || 96) * vis.scale;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawZombieHand(ctx, z, szx, szy, angle, handKey, lvl) {
  const isT2 = lvl >= 6;
  const fname = handKey === 'left_hand' ? (isT2 ? 'T2zombielefthand.png' : 'zombielefthand.png') : (isT2 ? 'T2zombierighthand.png' : 'zombierighthand.png');
  const frame = state.spriteFrames?.[fname]?.frame;
  if (!frame) return;
  let vis = window.ZOMBIE_VISUALS?.[handKey];
  const animState = state.zombieAnims?.[z.id];
  if (animState) { const animVis = getZombieAnimVis(handKey, animState); if (animVis) vis = animVis; }
  if (!vis) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const handScale = isT2 ? 1.1 : 1.0;
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
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
  ctx.lineWidth = 24;
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
  ctx.fillText('hitbox (bladeW=12)', tipX + 6, tipY - 6);
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
  const swordVis = window.KNIGHT_VISUALS?.knight_sword;
  if (swordFrame && swordVis) {
    ctx.save();
    ctx.translate(cx + swordVis.offsetX, cy + swordVis.offsetY);
    ctx.rotate(swordVis.rotation || 0);
    ctx.drawImage(state.knightSheet, swordFrame.x, swordFrame.y, swordFrame.w, swordFrame.h, -((swordEntry.sourceSize?.w || 128) * swordVis.scale) / 2, -((swordEntry.sourceSize?.h || 128) * swordVis.scale) / 2, (swordEntry.sourceSize?.w || 128) * swordVis.scale, (swordEntry.sourceSize?.h || 128) * swordVis.scale);
    ctx.restore();
  }
  const handEntry = state.knightFrames?.['T1KnightLeftHand.png'];
  const handFrame = handEntry?.frame;
  const handVis = window.KNIGHT_VISUALS?.knight_hand;
  if (handFrame && handVis) {
    ctx.save();
    ctx.translate(cx + handVis.offsetX, cy + handVis.offsetY);
    ctx.rotate(handVis.rotation || 0);
    ctx.drawImage(state.knightSheet, handFrame.x, handFrame.y, handFrame.w, handFrame.h, -((handEntry.sourceSize?.w || 96) * handVis.scale) / 2, -((handEntry.sourceSize?.h || 96) * handVis.scale) / 2, (handEntry.sourceSize?.w || 96) * handVis.scale, (handEntry.sourceSize?.h || 96) * handVis.scale);
    ctx.restore();
  }
}

export function drawPlayer(ctx, p, sx, sy, alpha, topKills) {
  const knightKey = p.lvl >= 20 ? 'T3KnightHead.png' : p.lvl >= 10 ? 'T2KnightHead.png' : 'T1KnightHead.png';
  const knightFrame = state.knightFrames?.[knightKey]?.frame;
  const isKnight = !!knightFrame;

  if (knightFrame) {
    drawKnightSword(ctx, p, sx, sy);
    drawKnightHand(ctx, p, sx, sy);
  } else {
    drawSword(ctx, p, sx, sy);
  }

  const isTop = topKills > 0 && p.kills === topKills;
  drawHealthBar(ctx, sx, sy - 36, 36, 4, p.health, p.maxHealth);

  if (knightFrame) {
    const sz = 56 / Math.max(knightFrame.w, knightFrame.h);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((p._smoothAngle ?? p.facingAngle) - Math.PI / 2);
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
  const headKey = z.lvl >= 6 ? 'T2zombiehead.png' : 'zombiehead.png';
  const headFrame = state.spriteFrames?.[headKey]?.frame;
  if (headFrame) {
    const headScale = (z.lvl >= 6 ? 1.1 : 1.0);
    const sz = (40 * headScale) / Math.max(headFrame.w, headFrame.h);
    ctx.save();
    ctx.translate(szx, szy);
    ctx.rotate(zombieAngle - Math.PI / 2);
    ctx.drawImage(getSpriteFromSheet(state.spriteSheet, headFrame.w * sz, headFrame.h * sz, headFrame), -(headFrame.w * sz) / 2, -(headFrame.h * sz) / 2, headFrame.w * sz, headFrame.h * sz);
    ctx.restore();
  }
  drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand', z.lvl);
  drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand', z.lvl);
  ctx.fillStyle = '#ff6666';
  ctx.fillText(z.label || 'zombie', szx, szy - 30);
  drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
}

export { drawDebugSwordHitbox };
