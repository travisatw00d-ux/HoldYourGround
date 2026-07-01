import { state } from './state.js';
import { getCamera } from './camera.js';
import { getInput, resetKeys } from './input.js';
import { drawPlayer, drawZombie, drawDebugSwordHitbox, getBladeSegment } from './render-entity.js';
import { drawStatHUD, drawServerLevel, drawSpectatingUI, drawDeadSpectatingUI, drawDmgNumbers, drawBuildWatermark, drawHitFlash, drawHUD } from './render-ui.js';
import { drawDiag } from './diag.js';

function shortAngleDist(a, b) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = state.viewW;
canvas.height = state.viewH;

export function resizeViewport(w, h) {
  state.viewW = w; state.viewH = h;
  canvas.width = w; canvas.height = h;
}

export function generateBackground(w, h, color) {
  const bc = document.createElement('canvas');
  bc.width = w; bc.height = h;
  const bx = bc.getContext('2d');
  bx.fillStyle = color || '#2a2a35';
  bx.fillRect(0, 0, w, h);
  const gridAlpha = color ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  bx.strokeStyle = gridAlpha;
  bx.lineWidth = 1;
  bx.beginPath();
  for (let x = 80; x < w; x += 80) { bx.moveTo(x, 0); bx.lineTo(x, h); }
  for (let y = 80; y < h; y += 80) { bx.moveTo(0, y); bx.lineTo(w, y); }
  bx.stroke();
  bx.strokeStyle = color ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
  bx.lineWidth = 3;
  bx.strokeRect(1.5, 1.5, w - 3, h - 3);
  return bc;
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, state.viewW, state.viewH);
  const rT0 = performance.now();

  if (state.matchPhase === 'nighttime' && state.waveStartTime > 0) {
    const elapsed = Math.floor((performance.now() - state.waveStartTime) / 1000);
    const prev = state._lastWaveSec || -1;
    if (elapsed !== prev) { state._lastWaveSec = elapsed; }
  } else if (state.matchPhase === 'daytime' && state.phaseTimer > 0 && state.phaseTimer <= 10000 && !state._wavePopupTriggered && state.waveComposition && state._showNWPopup) {
    state._wavePopupTriggered = true;
    state._showNWPopup();
  } else if (state.matchPhase && state.matchPhase !== 'waiting' && state.phaseTimerStart > 0) {
    const elapsed = performance.now() - state.phaseStartedAt;
    const remaining = Math.max(0, state.phaseTimerStart - elapsed);
    state.phaseTimer = remaining;
  }

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

  const me = state.players[state.myId];

  const spectatingTarget = (() => {
    if (!state.isDeadSpectating) return null;
    const ids = Object.keys(state.players).filter(id => state.players[id].alive);
    ids.sort((a, b) => state.players[b].lvl - state.players[a].lvl);
    if (ids.length === 0) return null;
    return state.players[ids[Math.min(state.spectatingTargetIndex, ids.length - 1)]];
  })();

  if (me && me.alive) {
    const mex = me.px + (me.x - me.px) * alpha;
    const mey = me.py + (me.y - me.py) * alpha;
    const target = Math.atan2((state.mouseY / zoom + cam.y) - mey, (state.mouseX / zoom + cam.x) - mex);
    if (state.localAnim) {
      const diff = target - state.localAnim.lockedAngle;
      const norm = Math.atan2(Math.sin(diff), Math.cos(diff));
      me.facingAngle = state.localAnim.lockedAngle + Math.max(-5 * Math.PI / 180, Math.min(5 * Math.PI / 180, norm));
    } else {
      me.facingAngle = target;
    }
  }

  if (state.localAnim) {
    const elapsed = performance.now() - state.localAnim.startTime;
    const duration = (state.localAnim.totalFrames / 60) * 1000 / 4;
    state.localAnim.frame = Math.floor((elapsed / duration) * state.localAnim.totalFrames);
    if (state.localAnim.frame >= state.localAnim.totalFrames) state.localAnim = null;
  }

  const zombieAnim = window.ZOMBIE_ANIMATIONS?.attack;
  if (zombieAnim) {
    const zDuration = (zombieAnim.segments.reduce((a, b) => a + b, 0) / 60) * 1000 / 4;
    for (const zid in state.zombieAnims) {
      if (performance.now() - state.zombieAnims[zid].startTime > zDuration) delete state.zombieAnims[zid];
    }
  }

  ctx.save();
  ctx.scale(zoom, zoom);

  if (state.backgroundCanvas) {
    const lightBg = state.matchPhase === 'daytime' || state.matchPhase === 'intermission';
    const bg = (lightBg && state.backgroundCanvasLight) ? state.backgroundCanvasLight : state.backgroundCanvas;
    ctx.drawImage(bg, cam.x, cam.y, eW, eH, 0, 0, eW, eH);
  }

  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const z of state.zombies) {
    if (!z.alive) continue;
    const zx = z.px + (z.x - z.px) * alpha;
    const zy = z.py + (z.y - z.py) * alpha;
    const szx = zx - cam.x, szy = zy - cam.y;
    if (szx < -40 || szx > eW + 40 || szy < -40 || szy > eH + 40) continue;
    drawZombie(ctx, z, szx, szy, z.headingAngle || 0);
  }

  let topKills = 0;
  for (const id in state.players) { const k = state.players[id].kills; if (k > topKills) topKills = k; }

  for (const id in state.players) {
    const p = state.players[id];
    if (!p.alive) continue;
    const sx = (p.px + (p.x - p.px) * alpha) - cam.x;
    const sy = (p.py + (p.y - p.py) * alpha) - cam.y;
    if (sx < -40 || sx > eW + 40 || sy < -40 || sy > eH + 40) continue;
    if (p.id !== state.myId && p.pfacingAngle != null) {
      p._smoothAngle = p.pfacingAngle + shortAngleDist(p.pfacingAngle, p.facingAngle) * alpha;
    }
    drawPlayer(ctx, p, sx, sy, alpha, topKills);
    if (state.debugHitbox) {
      const knightFrame = state.knightFrames?.['T1KnightHead.png']?.frame;
      drawDebugSwordHitbox(ctx, p, sx, sy, !!knightFrame);
    }
  }

  drawDmgNumbers(ctx, cam.x, cam.y);

  if (me && me.alive && state.localAnim) {
    const mex = me.px + (me.x - me.px) * alpha;
    const mey = me.py + (me.y - me.py) * alpha;
    const seg = getBladeSegment(me, mex - cam.x, mey - cam.y);
    if (seg) state.bladeHistory = seg;
  } else if (!state.localAnim) {
    state.bladeHistory = null;
  }

  ctx.restore();

  drawHUD(ctx);
  drawSpectatingUI(ctx);
  drawDeadSpectatingUI(ctx, spectatingTarget);

  if (state.isSpectator) {
    const btn = document.getElementById('joinGameBtn');
    if (btn && !btn.classList.contains('hidden')) {
      const inQueue = state.queuedPlayers && state.queuedPlayers.some(q => q.id === state.myId);
      if (inQueue) {
        const entry = state.queuedPlayers.find(q => q.id === state.myId);
        if (!entry || !entry.pos || entry.pos === 0) { btn.textContent = 'Waiting for next daytime...'; }
        else {
          const pos = entry.pos;
          const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
          btn.textContent = 'You are ' + pos + suffix + ' in queue';
        }
      } else {
        const count = state.activePlayerCount || Object.keys(state.players || {}).length;
        btn.textContent = count < 10 ? 'Join Game' : 'Join Queue';
      }
    }
  }

  drawServerLevel(ctx);
  drawHitFlash(ctx);

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

  drawBuildWatermark(ctx);
  drawDiag(ctx);
}

let animFrame = null;
let inputInterval = null;

export function startRender(socket) {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
  resetKeys();
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
      state._frameCount = (state._frameCount || 0) + 1;
      if (state._frameCount % 600 === 0) {
        const age = state._lastStateTime ? Math.round((performance.now() - state._lastStateTime)) : -1;
        socket.emit('clientDiag', { event: 'frame', frames: state._frameCount, stateAge: age, phase: state.matchPhase });
      }
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
