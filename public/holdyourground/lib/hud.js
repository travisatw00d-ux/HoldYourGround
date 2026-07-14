import { state } from './state.js';
import { getSpriteFromSheet } from './render-entity.js';

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
      if (el.name === 'JabHighlight' || el.name === 'SwingHighlight') {
        const active = state.attackStyle === 'jab' ? 'JabHighlight' : 'SwingHighlight';
        if (el.name !== active) continue;
        const actFrame = state.hudFrames?.['Activated.png']?.frame;
        const actSss = state.hudFrames?.['Activated.png']?.spriteSourceSize;
        if (!actFrame || !actSss || !state.hudSheet) continue;
        const scl = viewportScale;
        const dw = actSss.w * el.scale * scl;
        const dh = actSss.h * el.scale * scl;
        const right = 1024 - (el.x + actSss.x * el.scale) - actSss.w * el.scale;
        const bottom = 576 - (el.y + actSss.y * el.scale) - actSss.h * el.scale;
        const dx = state.viewW - right * scl - dw;
        const dy = state.viewH - bottom * scl - dh;
        const me = state.players[state.myId];
        if (me && !state.localAnim && !state.idleTransition && !me.attacking && state._comboStep === 0) {
          const cx = dx + dw / 2, cy = dy + dh / 2;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50 * scl);
          grad.addColorStop(0, 'rgba(0, 255, 100, 0.55)');
          grad.addColorStop(0.5, 'rgba(0, 255, 100, 0.2)');
          grad.addColorStop(1, 'rgba(0, 255, 100, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, 50 * scl, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.drawImage(state.hudSheet, actFrame.x, actFrame.y, actFrame.w, actFrame.h, dx, dy, dw, dh);
        continue;
      }

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
      // mctab.png (2026-07-14) skipped for the exact same reason inventory.png
      // is: its background art is drawn separately, on-demand, by ui.js's
      // showMasterChest() into the dedicated masterChestCanvas only while the
      // panel is actually open. Without this skip, this generic per-frame
      // loop draws EVERY hudLayout entry that has a matching hudFrames
      // image regardless of any panel's open/closed state — which is what
      // was making the master chest tab appear permanently in the top-left
      // corner even before pressing E (found 2026-07-14, reported by Travis).
      if (el.name === 'ServerLevel.png' || el.name === 'settingsgear.png' || el.name === 'inventory.png' || el.name === 'Stats.png' || el.name === 'mctab.png') continue;
      const fr = fd.frame;
      const scl = isGroup ? 1 : viewportScale;
      const dw = sss.w * el.scale * scl;
      const dh = sss.h * el.scale * scl;
      let dx, dy;
      if (el.name === 'JabAttack.png' || el.name === 'SwingAttack.png' || el.name === 'Space.png') {
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
        ctx.save();
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, dw, dh);
        ctx.fillStyle = '#0f0';
        ctx.font = '9px monospace';
        ctx.fillText(el.name, dx, dy - 3);
        ctx.restore();
      }
      endHUDTransform(ctx, tf);
    }

    const vs = 0.471 + 0.529 * (state.viewH / 1080);

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
