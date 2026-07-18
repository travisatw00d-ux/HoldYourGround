import { state } from './state.js';
import { MOB_TYPES, BLADE_W, ZOMBIE_VISUALS, ZOMBIE_ANIMATIONS, GOBLIN_VISUALS, GOBLIN_ANIMATIONS, KNIGHT_VISUALS } from './game-data.js';
import {
  updateLean, getMovementBob, getBreathScale,
  getKnightIdleVis, getKnightInterpolatedVis, getKnightRemoteVis,
  getVis, getDrawAngle, getBladeSegment, getZombieAnimVis,
  startAttackAnim, startIdleTransition
} from './anims.js';

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
  const remoteMir = p.id !== state.myId && (state.playerMeta[p.id]?.attackStyle || 'jab') === 'swing' && (p.comboStep || 1) >= 2;
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

// Unarmed look: drawn instead of drawKnightSword() when p.currentItem is
// empty (weapon slot dragged off — see drawPlayer() below). Idle pose comes
// from KNIGHT_VISUALS[style].knight_right_hand (tunable via "Knight Items" >
// "Right Hand" in public/position-tool.html). Attack animation reuses the
// 'knight_sword' data slot rather than a separate key — see the unarmed_combo
// comment block in game-data.js for why (short version: the server's hit
// detection and this whole interpolation pipeline are hardcoded to read
// 'knight_sword' as "whatever's in the right hand," armed or not — only the
// sprite drawn here differs). drawKnightSword() and drawKnightRightHand() are
// mutually exclusive per frame (drawPlayer() branches on p.currentItem), so
// there's no conflict reading the same slot.
function drawKnightRightHand(ctx, p, sx, sy) {
  // knight_right_hand is unarmed-exclusive (only ever drawn when !p.currentItem)
  // and getKnightIdleVis always resolves it to the basic jab pose regardless of
  // the jab/swing toggle, for local and remote alike — no per-player style
  // override needed here.
  let vis = getKnightIdleVis('knight_right_hand');
  if (p.id === state.myId && state.localAnim?.type === 'knight') { const animVis = getKnightInterpolatedVis('knight_sword'); if (animVis) vis = animVis; }
  if (p.id !== state.myId) { const animVis = getKnightRemoteVis('knight_sword', p); if (animVis) vis = animVis; }
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const entry = state.knightFrames?.['T1KnightRightHand.png'];
  const frame = entry?.frame;
  if (!frame) return;
  const sw = frame.w * vis.scale, sh = frame.h * vis.scale;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.knightSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawKnightHand(ctx, p, sx, sy) {
  let vis = getKnightIdleVis('knight_hand');
  if (p.id !== state.myId) {
    // Remote unarmed always shows the basic jab-pose left fist too, regardless
    // of their jab/swing toggle — same rule as the local player (forced inside
    // getKnightIdleVis via its own "me" check, which only covers the local
    // player, hence the explicit override here for remotes).
    const s = p.currentItem ? (state.playerMeta[p.id]?.attackStyle || 'jab') : 'jab';
    vis = getKnightIdleVis('knight_hand', s);
  }
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
  const mt = MOB_TYPES[z.mobType];
  if (mt && mt.id === 'troll') return 'troll';
  if (mt && mt.id === 'goblin') return 'goblin';
  return 'zombie';
}

function drawZombieHand(ctx, z, szx, szy, angle, handKey) {
  const prefix = getMobSpritePrefix(z);
  if (prefix === 'goblin') {
    // Goblin only has a left hand sprite — no right_hand art exists.
    if (handKey !== 'left_hand') return;
    const frame = state.spriteFrames?.['GoblinLeftHand.png']?.frame;
    if (!frame) return;
    let vis = GOBLIN_VISUALS?.left_hand;
    const animState = state.zombieAnims?.[z.id];
    if (animState) { const animVis = getZombieAnimVis('left_hand', animState, GOBLIN_ANIMATIONS); if (animVis) vis = animVis; }
    if (!vis) return;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rx = vis.offsetX * cos - vis.offsetY * sin;
    const ry = vis.offsetX * sin + vis.offsetY * cos;
    const sw = frame.w * vis.scale, sh = frame.h * vis.scale;
    ctx.save();
    ctx.translate(szx + rx, szy + ry);
    ctx.rotate(angle + (vis.rotation || 0));
    ctx.drawImage(getSpriteFromSheet(state.spriteSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    return;
  }
  const isTroll = prefix === 'troll';
  const fname = handKey === 'left_hand' ? (isTroll ? 'trolllefthand.png' : 'zombielefthand.png') : (isTroll ? 'trollrighthand.png' : 'zombierighthand.png');
  const frame = state.spriteFrames?.[fname]?.frame;
  if (!frame) return;
  let vis = ZOMBIE_VISUALS?.[handKey];
  const animState = state.zombieAnims?.[z.id];
  if (animState) { const animVis = getZombieAnimVis(handKey, animState, ZOMBIE_ANIMATIONS); if (animVis) vis = animVis; }
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

function drawGoblinSword(ctx, z, szx, szy, angle) {
  const frame = state.spriteFrames?.['GoblinSword.png']?.frame;
  if (!frame) return;
  let vis = GOBLIN_VISUALS?.sword;
  const animState = state.zombieAnims?.[z.id];
  if (animState) { const animVis = getZombieAnimVis('sword', animState, GOBLIN_ANIMATIONS); if (animVis) vis = animVis; }
  if (!vis) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const sw = frame.w * vis.scale, sh = frame.h * vis.scale;
  ctx.save();
  ctx.translate(szx + rx, szy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSpriteFromSheet(state.spriteSheet, sw, sh, frame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

export function drawDebugSwordHitbox(ctx, p, sx, sy, isKnight) {
  const seg = getBladeSegment(p, sx, sy, isKnight);
  if (!seg) return;
  const { hiltX, hiltY, tipX, tipY } = seg;
  const bw = BLADE_W;
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
  const swordVis = KNIGHT_VISUALS?.jab?.knight_sword;
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
  const handVis = KNIGHT_VISUALS?.jab?.knight_hand;
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
    // Empty weapon slot -> bare fist instead of the sword (see
    // drawKnightRightHand() above). p.currentItem is the weapon-slot source
    // of truth (mirrors info.equipment.weapon) and is reliably null/filled
    // for every player, not just state.myId, per the playerInfo/state sync.
    if (p.currentItem) {
      drawKnightSword(ctx, p, sx + bob.x, sy + bob.y);
    } else {
      drawKnightRightHand(ctx, p, sx + bob.x, sy + bob.y);
    }
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
  const headKey = prefix === 'troll' ? 'trollhead.png' : prefix === 'goblin' ? 'GoblinHead.png' : 'zombiehead.png';
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
  if (prefix === 'goblin') {
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand');
    drawGoblinSword(ctx, z, szx, szy, zombieAngle);
  } else {
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand');
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand');
  }
  ctx.fillStyle = '#ff6666';
  ctx.fillText(z.label || 'zombie', szx, szy - 30);
  drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
}

export { startIdleTransition, startAttackAnim };
