import { state } from './state.js';
import { getCamera } from './camera.js';
import { getInput } from './input.js';
import { drawDiag } from './diag.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = state.viewW;
canvas.height = state.viewH;

// Image assets
const swordImg = new Image(); swordImg.src = '/images/woodensword.png';
const zombieHeadImg = new Image(); zombieHeadImg.src = '/images/zombiehead.png';
const zombieT2HeadImg = new Image(); zombieT2HeadImg.src = '/images/T2zombiehead.png';
const serverLevelImg = new Image(); serverLevelImg.src = '/images/ServerLevel.png';
const zombieLeftHandImg = new Image(); zombieLeftHandImg.src = '/images/zombielefthand-v2.png';
const zombieRightHandImg = new Image(); zombieRightHandImg.src = '/images/zombierighthand-v2.png';
const zombieT2LeftHandImg = new Image(); zombieT2LeftHandImg.src = '/images/T2zombielefthand-v2.png';
const zombieT2RightHandImg = new Image(); zombieT2RightHandImg.src = '/images/T2zombierighthand-v2.png';

export function resizeViewport(w, h) {
  state.viewW = w;
  state.viewH = h;
  canvas.width = w;
  canvas.height = h;
}

let animFrame = null;
let inputInterval = null;

// Sprite cache
const spriteCache = new WeakMap();
function getSprite(img, w, h) {
  w = Math.max(1, Math.round(w * 2) / 2);
  h = Math.max(1, Math.round(h * 2) / 2);
  let inner = spriteCache.get(img);
  if (!inner) { inner = new Map(); spriteCache.set(img, inner); }
  const key = w + 'x' + h;
  let sc = inner.get(key);
  if (!sc) {
    const m = 2;
    sc = document.createElement('canvas');
    sc.width = Math.round(w * m);
    sc.height = Math.round(h * m);
    sc.getContext('2d').drawImage(img, 0, 0, sc.width, sc.height);
    inner.set(key, sc);
  }
  return sc;
}

export function generateBackground(w, h) {
  const bc = document.createElement('canvas');
  bc.width = w; bc.height = h;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#ffffff';
  bx.fillRect(0, 0, w, h);
  bx.strokeStyle = 'rgba(0,0,0,0.12)';
  bx.lineWidth = 1;
  bx.beginPath();
  const gs = 80;
  for (let x = gs; x < w; x += gs) { bx.moveTo(x, 0); bx.lineTo(x, h); }
  for (let y = gs; y < h; y += gs) { bx.moveTo(0, y); bx.lineTo(w, y); }
  bx.stroke();
  bx.strokeStyle = 'rgba(0,0,0,0.25)';
  bx.lineWidth = 3;
  bx.strokeRect(1.5, 1.5, w - 3, h - 3);
  return bc;
}

// Attack animation
export function startAttackAnim(lockedAngle) {
  if (state.localAnim) return;
  const me = state.players[state.myId];
  if (!me) return;
  const anim = window.ANIMATIONS && window.ANIMATIONS[me.currentItem] && window.ANIMATIONS[me.currentItem].attack;
  if (anim) {
    const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
    state.localAnim = {
      keyframes: anim.keyframes,
      segments: anim.segments,
      frame: 0,
      totalFrames: anim.segments.reduce((a, b) => a + b, 0),
      lockedAngle: locked,
      startTime: performance.now()
    };
  }
}

// Drawing helpers
function drawHealthBar(ctx, x, y, w, h, hp, maxHp) {
  const pct = Math.max(0, hp / maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - w / 2, y, w, h);
  const col = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * pct, h - 2);
}

function getInterpolatedVis() {
  if (!state.localAnim || state.localAnim.keyframes.length < 2) return null;
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
      return {
        offsetX: +(a.offsetX + (b.offsetX - a.offsetX) * t).toFixed(1),
        offsetY: +(a.offsetY + (b.offsetY - a.offsetY) * t).toFixed(1),
        scale: +(a.scale + (b.scale - a.scale) * t).toFixed(3),
        rotation: +(a.rotation + (b.rotation - a.rotation) * t).toFixed(3)
      };
    }
    accum += segLen;
  }
  return state.localAnim.keyframes[state.localAnim.keyframes.length - 1];
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
  if (p.id === state.myId && state.localAnim) return getInterpolatedVis();
  if (p.id !== state.myId && p.attacking) {
    const v = getRemoteVis(p);
    if (v) return v;
  }
  return window.ITEM_VISUALS && window.ITEM_VISUALS[p.currentItem];
}

function getDrawAngle(p) {
  if (p.id !== state.myId && p.attacking && p.attackLockedAngle != null) return p.attackLockedAngle;
  return p.facingAngle || 0;
}

function getBladeSegment(p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return null;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const ox = sx + rx, oy = sy + ry;
  const scale = vis.scale;
  const rot = angle + (vis.rotation || 0);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const tipX = ox + (window.BLADE_TIP_X * cosR - window.BLADE_TIP_Y * sinR) * scale;
  const tipY = ox + (window.BLADE_TIP_X * sinR + window.BLADE_TIP_Y * cosR) * scale;
  const hiltX = ox + (window.BLADE_HILT_X * cosR - window.BLADE_HILT_Y * sinR) * scale;
  const hiltY = ox + (window.BLADE_HILT_X * sinR + window.BLADE_HILT_Y * cosR) * scale;
  return { hiltX, hiltY, tipX, tipY };
}

function drawZombieHand(ctx, z, szx, szy, angle, handKey, lvl) {
  const vis = window.ZOMBIE_VISUALS && window.ZOMBIE_VISUALS[handKey];
  if (!vis) return;
  const isT2 = lvl >= 6;
  const img = handKey === 'left_hand'
    ? (isT2 ? zombieT2LeftHandImg : zombieLeftHandImg)
    : (isT2 ? zombieT2RightHandImg : zombieRightHandImg);
  if (!img.complete || img.naturalWidth === 0) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const handScale = isT2 ? 1.1 : 1.0;
  const sw = img.naturalWidth * vis.scale * handScale;
  const sh = img.naturalHeight * vis.scale * handScale;
  ctx.save();
  ctx.translate(szx + rx, szy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSprite(img, sw, sh), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawDebugSwordHitbox(ctx, p, sx, sy) {
  const seg = getBladeSegment(p, sx, sy);
  if (!seg) return;
  const { hiltX, hiltY, tipX, tipY } = seg;
  const bladeW = 12;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
  ctx.lineWidth = bladeW * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
  ctx.beginPath(); ctx.arc(tipX, tipY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hiltX, hiltY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,0,0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`hitbox (bladeW=${bladeW})`, tipX + 6, tipY - 6);
  ctx.restore();
}

function drawSword(ctx, p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const sw = 1254 * vis.scale;
  const sh = 1254 * vis.scale;
  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSprite(swordImg, sw, sh), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function updateLeaderboard() {
  const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills);
  let sig = '';
  for (let i = 0; i < sorted.length; i++) sig += sorted[i].name + ':' + sorted[i].kills + '|';
  if (sig === state.lbSig) return;
  state.lbSig = sig;
  let html = '';
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const cls = i === 0 ? 'lb-entry top' : 'lb-entry';
    html += `<div class="${cls}"><span>${p.name}</span><span class="lb-kills">${p.kills}</span></div>`;
  }
  document.getElementById('lbEntries').innerHTML = html;
}

function updateHotbar() {
  const me = state.players[state.myId];
  if (!me) {
    if (state.hotSig !== '') { state.hotSig = ''; document.getElementById('hotbarInventory').innerHTML = ''; }
    return;
  }
  const sig = me.currentItem + '|' + (me.inventory ? me.inventory.join(',') : '');
  if (sig === state.hotSig) return;
  state.hotSig = sig;
  let html = '';
  for (let i = 0; i < me.inventory.length; i++) {
    const itemKey = me.inventory[i];
    const item = window.ITEMS[itemKey];
    const active = itemKey === me.currentItem ? ' active' : '';
    html += `<div class="hot-slot${active}" data-slot="${i}"><span class="hot-key">${i + 1}</span><span class="hot-name">${item ? item.name : itemKey}</span></div>`;
  }
  document.getElementById('hotbarInventory').innerHTML = html;
}

export { updateLeaderboard, updateHotbar };

// Main render function
function render() {
  ctx.clearRect(0, 0, state.viewW, state.viewH);
  const rT0 = performance.now();

  let interval = (state.lastSrvInterval >= 30 && state.lastSrvInterval <= 200) ? state.lastSrvInterval : 66;
  let alpha = (performance.now() - state.snapshotTime) / interval;
  const alphaCap = 1 + 150 / interval;
  if (alpha > alphaCap) alpha = alphaCap; else if (alpha < 0) alpha = 0;

  if (state.worldW) {
    const minZ = Math.max(state.viewW / state.worldW, state.viewH / state.worldH);
    state.cameraZoom = Math.max(minZ, Math.min(4.0, state.cameraZoom));
  }
  const zoom = state.cameraZoom;
  const eW = state.viewW / zoom;
  const eH = state.viewH / zoom;
  const cam = getCamera(alpha);

  // Local player facing angle
  const me = state.players[state.myId];
  if (me && me.alive) {
    const mex = me.px + (me.x - me.px) * alpha;
    const mey = me.py + (me.y - me.py) * alpha;
    const target = Math.atan2((state.mouseY / zoom + cam.y) - mey, (state.mouseX / zoom + cam.x) - mex);
    if (state.localAnim) {
      const diff = target - state.localAnim.lockedAngle;
      const norm = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxRot = 5 * Math.PI / 180;
      me.facingAngle = state.localAnim.lockedAngle + Math.max(-maxRot, Math.min(maxRot, norm));
    } else {
      me.facingAngle = target;
    }
  }

  // Advance local animation
  if (state.localAnim) {
    const elapsed = performance.now() - state.localAnim.startTime;
    const duration = (state.localAnim.totalFrames / 60) * 1000 / 4;
    state.localAnim.frame = Math.floor((elapsed / duration) * state.localAnim.totalFrames);
    if (state.localAnim.frame >= state.localAnim.totalFrames) state.localAnim = null;
  }

  // --- Game world (affected by zoom) ---
  ctx.save();
  ctx.scale(zoom, zoom);

  // Background
  if (state.backgroundCanvas) {
    ctx.drawImage(state.backgroundCanvas, cam.x, cam.y, eW, eH, 0, 0, eW, eH);
  }

  // Zombies
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const z of state.zombies) {
    if (!z.alive) continue;
    const zx = z.px + (z.x - z.px) * alpha;
    const zy = z.py + (z.y - z.py) * alpha;
    const szx = zx - cam.x, szy = zy - cam.y;
    if (szx < -40 || szx > eW + 40 || szy < -40 || szy > eH + 40) continue;

    const zombieAngle = z.headingAngle || 0;
    const headImg = (z.lvl >= 6 && zombieT2HeadImg.complete && zombieT2HeadImg.naturalWidth > 0) ? zombieT2HeadImg : zombieHeadImg;
    if (headImg.complete && headImg.naturalWidth > 0) {
      ctx.save();
      const headScale = (z.lvl >= 6 ? 1.1 : 1.0);
      const sz = (40 * headScale) / Math.max(headImg.naturalWidth, headImg.naturalHeight);
      const w = headImg.naturalWidth * sz;
      const h = headImg.naturalHeight * sz;
      ctx.translate(szx, szy);
      ctx.rotate(zombieAngle - Math.PI / 2);
      ctx.drawImage(getSprite(headImg, w, h), -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand', z.lvl);
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand', z.lvl);
    ctx.fillStyle = '#ff6666';
    ctx.fillText(z.label || 'zombie', szx, szy - 30);
    drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
  }

  // Players
  let topKills = 0;
  for (const id in state.players) {
    const k = state.players[id].kills;
    if (k > topKills) topKills = k;
  }
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.alive) continue;
    const sx = (p.px + (p.x - p.px) * alpha) - cam.x;
    const sy = (p.py + (p.y - p.py) * alpha) - cam.y;
    if (sx < -40 || sx > eW + 40 || sy < -40 || sy > eH + 40) continue;

    drawSword(ctx, p, sx, sy);
    if (state.debugHitbox) drawDebugSwordHitbox(ctx, p, sx, sy);

    drawHealthBar(ctx, sx, sy - 36, 36, 4, p.health, p.maxHealth);

    const isTop = topKills > 0 && p.kills === topKills;
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    if (isTop && p.kills > 0) {
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3;
    } else if (id === state.myId) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    }
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, sx, sy - 42);
  }

  // Damage numbers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
  for (let i = state.dmgNumbers.length - 1; i >= 0; i--) {
    const dn = state.dmgNumbers[i];
    dn.timer -= 1 / 60;
    const sx = dn.x - cam.x;
    const sy = dn.y - cam.y - 30 * (1 - dn.timer / dn.duration);
    if (dn.timer <= 0) { state.dmgNumbers.splice(i, 1); continue; }
    const a = dn.timer > 0.3 ? 1 : dn.timer / 0.3;
    ctx.fillStyle = `rgba(255, 60, 60, ${a})`;
    ctx.fillText(`-${dn.dmg}`, sx, sy);
  }
  ctx.textBaseline = 'alphabetic';

  // Merge smoke
  for (let i = state.mergeSmokes.length - 1; i >= 0; i--) {
    const s = state.mergeSmokes[i];
    s.timer -= 1 / 60;
    if (s.timer <= 0) { state.mergeSmokes.splice(i, 1); continue; }
    const pct = 1 - s.timer;
    const sx = s.x - cam.x, sy = s.y - cam.y;
    for (let r = 0; r < 3; r++) {
      const radius = 10 + (pct + r * 0.15) * 40;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, radius), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 160, 160, ${Math.max(0, 1 - pct - r * 0.25)})`;
      ctx.fill();
    }
  }

  // Blade history
  if (me && me.alive && state.localAnim) {
    const mex = me.px + (me.x - me.px) * alpha;
    const mey = me.py + (me.y - me.py) * alpha;
    const seg = getBladeSegment(me, mex - cam.x, mey - cam.y);
    if (seg) state.bladeHistory = seg;
  } else if (!state.localAnim) {
    state.bladeHistory = null;
  }

  ctx.restore();
  // --- End game world ---

  // Stat HUD
  if (me) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Spd: ${me.speed || window.BASE_STATS.speed}  Atk: ${me.attackDmg || window.BASE_STATS.attackDmg}  SpdAtk: ${me.attackSpeed || window.BASE_STATS.attackSpeed}ms`, 10, 18);
    ctx.fillText(`HP: ${Math.max(0, me.health)}/${me.maxHealth}`, 10, 34);
    if (state.debugHitbox) {
      ctx.fillStyle = 'rgba(255,200,0,0.8)';
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('HITBOX DEBUG ON [H to toggle]', 10, 52);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`X: ${Math.round(me.x)}  Y: ${Math.round(me.y)}`, state.viewW - 10, state.viewH - 10);
    ctx.textBaseline = 'alphabetic';
  }

  // Server level
  if (serverLevelImg.complete && serverLevelImg.naturalWidth > 0) {
    const ui = window.SCREEN_UI && window.SCREEN_UI.serverLevel;
    if (ui) {
      const sw = serverLevelImg.naturalWidth * ui.scale;
      const sh = serverLevelImg.naturalHeight * ui.scale;
      ctx.save();
      ctx.translate(ui.x, ui.y);
      ctx.drawImage(serverLevelImg, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      const textX = ui.x;
      const textY = ui.y + (ui.ty || 0);
      const text = String(state.serverLevel);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '32px "Lilita One", "Segoe UI", sans-serif';
      if (!state.levelGrad) {
        state.levelGrad = ctx.createLinearGradient(textX, textY - 14, textX, textY + 14);
        state.levelGrad.addColorStop(0, '#ffffff');
        state.levelGrad.addColorStop(1, '#b0b0b0');
      }
      const grad = state.levelGrad;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.save();
      ctx.translate(2, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(text, textX, textY);
      ctx.restore();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 10;
      ctx.strokeText(text, textX, textY);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(text, textX - 1, textY - 1);
      ctx.fillStyle = grad;
      ctx.fillText(text, textX, textY);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Hit flash
  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${state.hitFlash / 20})`;
    ctx.fillRect(0, 0, state.viewW, state.viewH);
    state.hitFlash--;
  }

  // Frame timing
  state.frameTimeMs = performance.now() - rT0;
  state.fpsFrames++;
  const __n = performance.now();
  if (__n - state.fpsLast >= 500) {
    state.fpsValue = Math.round(state.fpsFrames * 1000 / (__n - state.fpsLast));
    state.fpsFrames = 0;
    state.fpsLast = __n;
  }
  if (__n - state.maxFrameAt > 2000) { state.maxFrameMs = state.frameTimeMs; state.maxFrameAt = __n; }
  else if (state.frameTimeMs > state.maxFrameMs) state.maxFrameMs = state.frameTimeMs;

  // Build watermark
  if (window.BUILD) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('b' + window.BUILD, 10, state.viewH - 4);
    ctx.textBaseline = 'alphabetic';
  }
  drawDiag(ctx);
}

// Render loop
export function startRender(socket) {
  if (animFrame) return;
  if (inputInterval) clearInterval(inputInterval);
  inputInterval = setInterval(() => {
    if (state.screen === 'playing') {
      const input = getInput();
      const cam = getCamera();
      const me = state.players[state.myId];
      if (me) {
        const zoom = state.cameraZoom;
        input.angle = me.facingAngle || Math.atan2((state.mouseY / zoom + cam.y) - me.y, (state.mouseX / zoom + cam.x) - me.x);
      }
      socket.emit('input', input);
    }
  }, 50);

  let lastRAF = 0;
  function loop(ts) {
    if (state.screen === 'playing') {
      if (lastRAF && ts - lastRAF < 500) {
        const gap = ts - lastRAF;
        state.lastFrameGap = gap;
        if (ts - state.maxFrameGapAt > 2000) { state.maxFrameGap = gap; state.maxFrameGapAt = ts; }
        else if (gap > state.maxFrameGap) state.maxFrameGap = gap;
      }
      lastRAF = ts;
      render();
      animFrame = requestAnimationFrame(loop);
    }
  }
  loop(performance.now());
}

export function stopRender() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
}
