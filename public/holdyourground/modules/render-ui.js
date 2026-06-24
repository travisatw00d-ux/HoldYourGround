import { state } from './state.js';
import { getSpriteFromSheet } from './render-entity.js';
import { drawDiag } from './diag.js';

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
  const srvFrame = state.spriteFrames?.['ServerLevel.png']?.frame;
  if (!srvFrame) return;
  const ui = window.SCREEN_UI && window.SCREEN_UI.serverLevel;
  if (!ui) return;
  const sw = srvFrame.w * ui.scale, sh = srvFrame.h * ui.scale;
  ctx.save();
  ctx.translate(ui.x, ui.y);
  ctx.drawImage(getSpriteFromSheet(state.spriteSheet, sw, sh, srvFrame), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  const text = String(state.serverLevel);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '32px "Lilita One", "Segoe UI", sans-serif';
  if (!state.levelGrad) {
    state.levelGrad = ctx.createLinearGradient(ui.x, ui.y + (ui.ty || 0) - 14, ui.x, ui.y + (ui.ty || 0) + 14);
    state.levelGrad.addColorStop(0, '#ffffff');
    state.levelGrad.addColorStop(1, '#b0b0b0');
  }
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.save();
  ctx.translate(2, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText(text, ui.x, ui.y + (ui.ty || 0));
  ctx.restore();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 10;
  ctx.strokeText(text, ui.x, ui.y + (ui.ty || 0));
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeText(text, ui.x - 1, ui.y + (ui.ty || 0) - 1);
  ctx.fillStyle = state.levelGrad;
  ctx.fillText(text, ui.x, ui.y + (ui.ty || 0));
  ctx.textBaseline = 'alphabetic';
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
  document.getElementById('levelBadge').textContent = spectatingTarget.lvl || 1;
  document.getElementById('xpFill').style.width = '0%';
  document.getElementById('xpText').textContent = 'Spectating';
  document.getElementById('xpPercent').textContent = '';
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

export function drawMergeSmoke(ctx, camX, camY) {
  for (let i = state.mergeSmokes.length - 1; i >= 0; i--) {
    const s = state.mergeSmokes[i];
    s.timer -= 1 / 60;
    if (s.timer <= 0) { state.mergeSmokes.splice(i, 1); continue; }
    const pct = 1 - s.timer;
    const sx = s.x - camX, sy = s.y - camY;
    for (let r = 0; r < 3; r++) {
      const radius = 10 + (pct + r * 0.15) * 40;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, radius), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 160, 160, ${Math.max(0, 1 - pct - r * 0.25)})`;
      ctx.fill();
    }
  }
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
