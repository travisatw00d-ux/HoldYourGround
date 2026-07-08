import { state } from './state.js';
import { ITEMS, BASE_STATS } from './game-data.js';
import { getSpriteFromSheet } from './render-entity.js';
import { MOB_TYPES } from './game-data.js';
import { ensureAssets } from './assets.js';
import { startRender, stopRender } from './render.js';
import { hideNWPopup } from './next-wave-popup.js';

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
    const item = ITEMS[me.inventory[i]];
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
  ctx.fillText(`Spd: ${hudTarget.speed || BASE_STATS.speed}  Atk: ${hudTarget.attackDmg || BASE_STATS.attackDmg}  SpdAtk: ${hudTarget.attackSpeed || BASE_STATS.attackSpeed}ms`, 10, 18);
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
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3 * viewportScale;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, tx + 1 * viewportScale, ty + 2 * viewportScale);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6 * viewportScale;
  ctx.strokeText(text, tx, ty);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, tx, ty);
  ctx.restore();
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

export function renderResults({ serverLevel, playerStats, wave }) {
  document.getElementById('resultsServerLevel').textContent = 'Server Level: ' + (serverLevel || 0);
  document.getElementById('resultsWave').textContent = wave || 0;
  const listEl = document.getElementById('resultsPlayerList');
  listEl.innerHTML = '';
  (playerStats || []).forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (i === 0 ? ' top-player' : '');
    row.innerHTML = '<span class="result-rank">#' + (i + 1) + '</span><span class="result-name">' + r.name + '</span><span class="result-stat">Lvl ' + r.level + '</span><span class="result-stat">' + r.kills + ' kills</span>';
    listEl.appendChild(row);
  });
}

export function renderLobbyCards() {
  const players = state.lobbyPlayers;
  const frameData = state.cardFrames?.['KnightCard.png'];
  const hasAssets = state.cardSheet && frameData;
  const nameColors = { guest: '#eee', basic: '#228B22', admin: '#FFD700' };
  for (let i = 0; i < 10; i++) {
    const card = document.querySelector(`.lobby-card[data-slot="${i}"]`);
    if (!card) continue;
    const nameEl = card.querySelector('.lobby-card-name');
    const expEl = card.querySelector('.lobby-card-exp');
    const canvas = card.querySelector('.lobby-card-preview');
    const ctx = canvas.getContext('2d');
    if (i < players.length) {
      const p = players[i];
      card.classList.remove('empty');
      nameEl.textContent = p.name;
      nameEl.style.color = nameColors[p.accountType] || '#eee';
      expEl.textContent = 'Exp: ' + (p.exp || 0);
      if (hasAssets) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const f = frameData.frame;
        const scale = Math.min(canvas.width / f.w, canvas.height / f.h);
        const dw = f.w * scale;
        const dh = f.h * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(state.cardSheet, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
      }
    } else {
      card.classList.add('empty');
      nameEl.textContent = 'Waiting...';
      nameEl.style.color = '';
      expEl.textContent = '';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

const textDecoder = new TextDecoder();
const MOB_NAMES = MOB_TYPES.map(m => m.name);

export { textDecoder, MOB_NAMES };

export function updateJoinButton() {
  const btn = document.getElementById('joinGameBtn');
  if (state.screen === 'menu' || state.screen === 'eliminated' || state.screen === 'results') {
    btn.classList.add('hidden');
    return;
  }
  if (state.screen === 'playing' && !state.isSpectator && !state.isDeadSpectating) {
    btn.classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');
  const myEntry = (state.queuedPlayers || []).find(q => q.id === state.myId);
  if (myEntry && myEntry.pos > 0) {
    btn.textContent = myEntry.pos === 1 ? 'In queue: next in line' : 'In queue: ' + (myEntry.pos - 1) + ' ahead';
  } else if (myEntry) {
    btn.textContent = 'In queue: waiting for slot...';
  } else if (state.isDeadSpectating) {
    btn.textContent = 'Waiting for daytime...';
  } else if (state.isSpectator) {
    btn.textContent = state.matchPhase === 'ended' ? 'Join Queue' : 'Join Game';
  } else if (state.matchPhase === 'waiting') {
    btn.classList.add('hidden');
  } else {
    btn.classList.add('hidden');
  }
}
