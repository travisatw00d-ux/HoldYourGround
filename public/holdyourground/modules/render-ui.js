import { state } from './state.js';
import { getSpriteFromSheet } from './render-entity.js';

export function updateLeaderboard() {
  const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills);
  const queued = state.queuedPlayers || [];
  let sig = '';
  for (let i = 0; i < sorted.length; i++) sig += sorted[i].name + ':' + sorted[i].kills + '|';
  for (const q of queued) sig += 'q:' + q.id + '|';
  if (sig === state.lbSig) return;
  state.lbSig = sig;

  const maxVisible = 10;
  let html = '';
  let remaining = maxVisible;

  for (let i = 0; i < sorted.length && remaining > 0; i++, remaining--) {
    html += `<div class="${i === 0 ? 'lb-entry top' : 'lb-entry'}"><span>${sorted[i].name}</span><span class="lb-kills">${sorted[i].kills}</span></div>`;
  }

  for (let i = 0; i < queued.length && remaining > 0; i++, remaining--) {
    const qp = queued[i];
    const posText = !qp.pos || qp.pos === 0 ? 'waiting...' : (qp.pos === 1 ? '1st in queue' : 'in queue (' + (qp.pos - 1) + ' ahead)');
    html += `<div class="lb-entry"><span>${qp.name}</span><span class="lb-kills">${posText}</span></div>`;
  }

  const hidden = sorted.length + queued.length - maxVisible;
  if (hidden > 0) html += `<div class="lb-entry" style="opacity:0.5"><span></span><span class="lb-kills">${hidden} in queue</span></div>`;

  document.getElementById('lbEntries').innerHTML = html;
}

export function updateHotbar() {
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
    const item = window.ITEMS[me.inventory[i]];
    const active = me.inventory[i] === me.currentItem ? ' active' : '';
    html += `<div class="hot-slot${active}" data-slot="${i}"><span class="hot-key">${i + 1}</span><span class="hot-name">${item ? item.name : me.inventory[i]}</span></div>`;
  }
  document.getElementById('hotbarInventory').innerHTML = html;
}

export function drawStatHUD(ctx, hudTarget) {
  if (!hudTarget) return;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Spd: ${hudTarget.speed || window.BASE_STATS.speed}  Atk: ${hudTarget.attackDmg || window.BASE_STATS.attackDmg}  SpdAtk: ${hudTarget.attackSpeed || window.BASE_STATS.attackSpeed}ms`, 10, 18);
  ctx.fillText(`HP: ${Math.max(0, hudTarget.health)}/${hudTarget.maxHealth}`, 10, 34);
  if (state.debugHitbox) {
    ctx.fillStyle = 'rgba(255,200,0,0.8)';
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('HITBOX DEBUG ON [H cycle]', 10, 70);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`X: ${Math.round(hudTarget.x)}  Y: ${Math.round(hudTarget.y)}`, state.viewW - 10, state.viewH - 10);
  ctx.textBaseline = 'alphabetic';
}

export function drawServerLevel(ctx) {
  const srvFrame = state.hudFrames?.['ServerLevel.png']?.frame;
  if (!srvFrame) return;
  const el = state.hudLayout?.find(e => e.name === 'ServerLevel.png');
  if (!el) return;
  const viewportScale = 0.471 + 0.529 * (state.viewH / 1080);
  const sss = state.hudFrames['ServerLevel.png'].spriteSourceSize;
  const dx = (el.x + sss.x * el.scale) * viewportScale;
  const dy = (el.y + sss.y * el.scale) * viewportScale;
  const dw = sss.w * el.scale * viewportScale;
  const dh = sss.h * el.scale * viewportScale;
  ctx.save();
  ctx.drawImage(state.hudSheet, srvFrame.x, srvFrame.y, sss.w, sss.h, dx, dy, dw, dh);
  ctx.restore();
  const text = String(state.serverLevel);
  const tx = (el.textX != null ? (el.x + el.textX) * viewportScale : dx + dw / 2);
  const ty = (el.textY != null ? (el.y + el.textY) * viewportScale : dy + dh * 0.6);
  const tSize = (el.textSize || 32) * viewportScale;
  ctx.save();
  ctx.font = '700 ' + tSize + 'px "Teko", "Rajdhani", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3 * viewportScale;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, tx + 1 * viewportScale, ty + 2 * viewportScale);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6 * viewportScale;
  ctx.strokeText(text, tx, ty);
  // White fill
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, tx, ty);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

const HUD_GROUP = [
  'HealthBarBG.png', 'HealthBar.png', 'EnergyBarBG.png', 'EnergyBar.png',
  'NameBar.png', 'PlayerName', 'CharacterWindow.png', 'Hotkey.png',
  'KnightCharacter.png', 'XPBarBG.png', 'ExperienceBar.png',
  'PlayerLevel', 'StatsHotkey'
];

function applyHUDTransform(ctx, ax, ay) {
  const viewportScale = 0.471 + 0.529 * (state.viewH / 1080);
  const s = (state.hudScale ?? 1.0) * viewportScale;
  const oy = Math.max(0, state.viewH - 576);
  if (s < 1.0 || oy > 0) {
    ctx.save();
    ctx.translate(0, oy);
    ctx.translate(ax, ay);
    ctx.scale(s, s);
    ctx.translate(-ax, -ay);
    return true;
  }
  return false;
}

function endHUDTransform(ctx, applied) {
  if (applied) ctx.restore();
}


let _hudRendering = false;

export function drawHUD(ctx) {
  if (_hudRendering) return;
  _hudRendering = true;
  try {
    if (!state.hudLayout || !state.hudSheet || !state.hudFrames) return;
  const viewportScale = 0.471 + 0.529 * (state.viewH / 1080);
  let ax = Infinity, ay = -Infinity;
  for (const el of state.hudLayout) {
    if (!HUD_GROUP.includes(el.name)) continue;
    const fd = state.hudFrames[el.name];
    if (fd) {
      const sss = fd.spriteSourceSize;
      const left = el.x + sss.x * el.scale;
      const bottom = el.y + (sss.y + sss.h) * el.scale;
      if (left < ax) ax = left;
      if (bottom > ay) ay = bottom;
    } else {
      const tx = el.x + (el.textX || 0);
      const ty = el.y + (el.textY || 0);
      const halfH = (el.textSize || 28) / 2;
      const halfW = (el.textSize || 28) * 0.3;
      if (tx - halfW < ax) ax = tx - halfW;
      if (ty + halfH > ay) ay = ty + halfH;
    }
  }
  if (ax === Infinity) { ax = 0; ay = 0; }
  const sorted = [...state.hudLayout].sort((a, b) => a.zIndex - b.zIndex);
  let hbEl = null;
  for (const el of sorted) {
    const fd = state.hudFrames[el.name];
    if (!fd) continue;
    const isGroup = HUD_GROUP.includes(el.name);
    const tf = isGroup && applyHUDTransform(ctx, ax, ay);
    const sss = fd.spriteSourceSize;
    if (el.name === 'HealthBar.png' && el.fillVisible !== false) {
      hbEl = el;
      const me = state.players[state.myId];
      const hp = me ? me.health : 100;
      const maxHp = me ? me.maxHealth : 100;
      const pct = Math.max(0, Math.min(1, hp / maxHp));
      const ls = el.scale;
      const fx = el.x + (el.fillX ?? sss.x) * ls;
      const fy = el.y + (el.fillY ?? sss.y) * ls;
      const fw = (el.fillW ?? sss.w) * ls;
      const fh = (el.fillH ?? sss.h) * ls;
      const fillW = fw * pct;
      const notch = fh * 0.41 * pct;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + fillW - notch, fy);
      ctx.lineTo(fx + fillW, fy + fh / 2);
      ctx.lineTo(fx + fillW - notch, fy + fh);
      ctx.lineTo(fx, fy + fh);
      ctx.closePath();
      ctx.clip();
      const grad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
      grad.addColorStop(0, '#7dff35');
      grad.addColorStop(0.35, '#31ef10');
      grad.addColorStop(0.6, '#11c900');
      grad.addColorStop(1, '#078500');
      ctx.fillStyle = grad;
      ctx.fillRect(fx, fy, fillW, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(fx, fy, fillW, 3 * ls);
      ctx.fillStyle = 'rgba(0,80,0,0.45)';
      ctx.fillRect(fx, fy + fh - 4 * ls, fillW, 4 * ls);
      ctx.shadowColor = 'rgba(40,255,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(fx, fy, fillW, fh);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    if (el.name === 'ExperienceBar.png' && el.fillVisible !== false) {
      const me = state.players[state.myId];
      const xp = me ? state.exp : 0;
      const xpToNext = me ? state.expToNext : 100;
      const pct = xpToNext > 0 ? Math.max(0, Math.min(1, xp / xpToNext)) : 0;
      const ls = el.scale;
      const fx = el.x + (el.fillX ?? sss.x) * ls;
      const fy = el.y + (el.fillY ?? sss.y) * ls;
      const fw = (el.fillW ?? sss.w) * ls;
      const fh = (el.fillH ?? sss.h) * ls;
      const fillW = fw * pct;
      const notch = fh * 0.41 * pct;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + fillW - notch, fy);
      ctx.lineTo(fx + fillW, fy + fh / 2);
      ctx.lineTo(fx + fillW - notch, fy + fh);
      ctx.lineTo(fx, fy + fh);
      ctx.closePath();
      ctx.clip();
      const grad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
      grad.addColorStop(0, '#fff06a');
      grad.addColorStop(0.3, '#ffc21e');
      grad.addColorStop(0.65, '#e38b00');
      grad.addColorStop(1, '#8a4200');
      ctx.fillStyle = grad;
      ctx.fillRect(fx, fy, fillW, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(fx, fy, fillW, 2 * ls);
      ctx.fillStyle = 'rgba(80,35,0,0.55)';
      ctx.fillRect(fx, fy + fh - 3 * ls, fillW, 3 * ls);
      ctx.shadowColor = 'rgba(255,170,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(fx, fy, fillW, fh);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    if (el.name === 'EnergyBar.png' && el.fillVisible !== false) {
      const me = state.players[state.myId];
      const eng = me ? me.energy : 100;
      const maxEng = me ? me.maxEnergy : 100;
      const pct = Math.max(0, Math.min(1, eng / maxEng));
      const ls = el.scale;
      const fx = el.x + (el.fillX ?? sss.x) * ls;
      const fy = el.y + (el.fillY ?? sss.y) * ls;
      const fw = (el.fillW ?? sss.w) * ls;
      const fh = (el.fillH ?? sss.h) * ls;
      const fillW = fw * pct;
      const notch = fh * 0.41 * pct;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + fillW - notch, fy);
      ctx.lineTo(fx + fillW, fy + fh / 2);
      ctx.lineTo(fx + fillW - notch, fy + fh);
      ctx.lineTo(fx, fy + fh);
      ctx.closePath();
      ctx.clip();
      const grad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
      grad.addColorStop(0, '#53D8FF');
      grad.addColorStop(0.25, '#2AB9FF');
      grad.addColorStop(0.5, '#139BFF');
      grad.addColorStop(0.75, '#0A82F0');
      grad.addColorStop(1, '#0463D7');
      ctx.fillStyle = grad;
      ctx.fillRect(fx, fy, fillW, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(fx, fy, fillW, 3 * ls);
      ctx.fillStyle = 'rgba(0,40,80,0.45)';
      ctx.fillRect(fx, fy + fh - 4 * ls, fillW, 4 * ls);
      ctx.shadowColor = 'rgba(0,150,255,0.35)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(fx, fy, fillW, fh);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    if (el.name === 'ServerLevel.png' || el.name === 'settingsgear.png') continue;
    const fr = fd.frame;
    const scl = isGroup ? 1 : viewportScale;
    const dw = sss.w * el.scale * scl;
    const dh = sss.h * el.scale * scl;
    let dx, dy;
    if (el.name === 'JabAttack.png' || el.name === 'SwingAttack.png') {
      const right = 1024 - (el.x + sss.x * el.scale) - sss.w * el.scale;
      const bottom = 576 - (el.y + sss.y * el.scale) - sss.h * el.scale;
      dx = state.viewW - right * scl - dw;
      dy = state.viewH - bottom * scl - dh;
    } else {
      dx = (el.x + sss.x * el.scale) * scl;
      dy = (el.y + sss.y * el.scale) * scl;
    }
    ctx.drawImage(state.hudSheet, fr.x, fr.y, sss.w, sss.h, dx, dy, dw, dh);
    if (state.showHudDebug) {
      const dx2 = dx, dy2 = dy, dw2 = dw, dh2 = dh;
      const name = el.name;
      ctx.save();
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx2, dy2, dw2, dh2);
      ctx.fillStyle = '#0f0';
      ctx.font = '9px monospace';
      ctx.fillText(name, dx2, dy2 - 3);
      ctx.restore();
    }
    endHUDTransform(ctx, tf);
  }
  const vs = 0.471 + 0.529 * (state.viewH / 1080);

  // Phase name text overlay
  const phaseNameEl = state.hudLayout?.find(e => e.name === 'PhaseName');
  if (phaseNameEl) {
    const names = { daytime: 'Daytime', nighttime: 'Nighttime', intermission: 'Intermission' };
    const text = names[state.matchPhase] || state.matchPhase || '';
    const tx = (phaseNameEl.x + (phaseNameEl.textX || 0)) * vs;
    const ty = (phaseNameEl.y + (phaseNameEl.textY || 0)) * vs;
    const tSize = (phaseNameEl.textSize || 28) * vs;
    ctx.save();
    ctx.font = '700 ' + tSize + 'px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 3 * vs;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx + 1 * vs, ty + 2 * vs);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6 * vs;
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  // Phase timer text overlay
  const phaseTimerEl = state.hudLayout?.find(e => e.name === 'PhaseTimer');
  if (phaseTimerEl) {
    let text = '';
    if (state.matchPhase === 'nighttime' && state.waveStartTime > 0) {
      const elapsed = Math.floor((performance.now() - state.waveStartTime) / 1000);
      text = elapsed + 's';
    } else if (state.matchPhase && state.matchPhase !== 'waiting' && state.phaseTimerStart > 0) {
      const elapsed = performance.now() - state.phaseStartedAt;
      const remaining = Math.max(0, state.phaseTimerStart - elapsed);
      text = Math.ceil(remaining / 1000) + 's';
    }
    const tx = (phaseTimerEl.x + (phaseTimerEl.textX || 0)) * vs;
    const ty = (phaseTimerEl.y + (phaseTimerEl.textY || 0)) * vs;
    const tSize = (phaseTimerEl.textSize || 28) * vs;
    ctx.save();
    ctx.font = '700 ' + tSize + 'px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 3 * vs;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx + 1 * vs, ty + 2 * vs);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6 * vs;
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  const hudTF = applyHUDTransform(ctx, ax, ay);

  // Health bar text overlay
  if (hbEl) {
    const sss = state.hudFrames['HealthBar.png'].spriteSourceSize;
    const ls = hbEl.scale;
    const fx = hbEl.x + (hbEl.fillX ?? sss.x) * ls;
    const fy = hbEl.y + (hbEl.fillY ?? sss.y) * ls;
    const fw = (hbEl.fillW ?? sss.w) * ls;
    const fh = (hbEl.fillH ?? sss.h) * ls;
    const me = state.players[state.myId];
    const hp = me ? me.health : 100;
    const maxHp = me ? me.maxHealth : 100;
    const text = hp + ' / ' + maxHp;
    const cx = fx + fw / 2, cy = fy + fh / 2;
    ctx.save();
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  // Energy bar text overlay
  const engEl = state.hudLayout?.find(e => e.name === 'EnergyBar.png' && e.visible !== false);
  if (engEl) {
    const sss = state.hudFrames['EnergyBar.png'].spriteSourceSize;
    const ls = engEl.scale;
    const fx = engEl.x + (engEl.fillX ?? sss.x) * ls;
    const fy = engEl.y + (engEl.fillY ?? sss.y) * ls;
    const fw = (engEl.fillW ?? sss.w) * ls;
    const fh = (engEl.fillH ?? sss.h) * ls;
    const me = state.players[state.myId];
    const eng = me ? me.energy : 100;
    const maxEng = me ? me.maxEnergy : 100;
    const text = eng + ' / ' + maxEng;
    const cx = fx + fw / 2, cy = fy + fh / 2;
    ctx.save();
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  // Player level text overlay
  const plEl = state.hudLayout?.find(e => e.name === 'PlayerLevel');
  if (plEl) {
    const text = String(state.level);
    const tx = plEl.x + (plEl.textX || 0);
    const ty = plEl.y + (plEl.textY || 0);
    const tSize = plEl.textSize || 28;
    ctx.save();
    ctx.font = '700 ' + tSize + 'px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx + 1, ty + 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6;
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  // Stats hotkey text overlay
  const skEl = state.hudLayout?.find(e => e.name === 'StatsHotkey');
  if (skEl) {
    const text = 'C';
    const tx = skEl.x + (skEl.textX || 0);
    const ty = skEl.y + (skEl.textY || 0);
    const tSize = skEl.textSize || 28;
    ctx.save();
    ctx.font = '700 ' + tSize + 'px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx + 1, ty + 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6;
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  // Player name text overlay
  const pnEl = state.hudLayout?.find(e => e.name === 'PlayerName');
  if (pnEl) {
    const me = state.players[state.myId];
    const name = me ? me.name : '';
    if (!name) return;
    const tx = pnEl.x, ty = pnEl.y;
    const tSize = pnEl.textSize || 28;
    ctx.save();
    ctx.font = '700 ' + tSize + 'px "Teko", "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6;
    ctx.strokeText(name, tx, ty);
    ctx.fillStyle = '#fff';
    ctx.fillText(name, tx, ty);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
  }
  endHUDTransform(ctx, hudTF);
  } finally { _hudRendering = false; }
}

export function drawSpectatingUI(ctx) {
  if (state.isSpectator) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPECTATING', state.viewW / 2, state.viewH - 20);
    ctx.textAlign = 'left';
  }
}

export function drawDeadSpectatingUI(ctx, spectatingTarget) {
  if (!state.isDeadSpectating || !spectatingTarget) return;
  ctx.fillStyle = 'rgba(255,200,100,0.8)';
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPECTATING: ' + spectatingTarget.name, state.viewW / 2, state.viewH - 50);
  ctx.textAlign = 'left';
}

export function drawDmgNumbers(ctx, camX, camY) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
  for (let i = state.dmgNumbers.length - 1; i >= 0; i--) {
    const dn = state.dmgNumbers[i];
    dn.timer -= 1 / 60;
    const sx = dn.x - camX, sy = dn.y - camY - 30 * (1 - dn.timer / dn.duration);
    if (dn.timer <= 0) { state.dmgNumbers.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(255, 60, 60, ${dn.timer > 0.3 ? 1 : dn.timer / 0.3})`;
    ctx.fillText(`-${dn.dmg}`, sx, sy);
  }
  ctx.textBaseline = 'alphabetic';
}

export function drawBuildWatermark(ctx) {
  if (window.BUILD) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('b' + window.BUILD, 10, state.viewH - 4);
    ctx.textBaseline = 'alphabetic';
  }
}

export function drawHitFlash(ctx) {
  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${state.hitFlash / 20})`;
    ctx.fillRect(0, 0, state.viewW, state.viewH);
    state.hitFlash--;
  }
}
