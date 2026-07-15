import { state } from './state.js';
import { getCamera } from './camera.js';
import { getInput, resetKeys } from './input.js';
import { drawPlayer, drawZombie, drawDebugSwordHitbox, getSpriteFromSheet } from './render-entity.js';
import { getBladeSegment, handleAnimNaturalEnd } from './anims.js';
import { drawStatHUD, drawServerLevel, drawSpectatingUI, drawDeadSpectatingUI, drawDmgNumbers, drawBuildWatermark, drawHitFlash } from './render-ui.js';
import { drawHUD } from './hud.js';
import { drawDiag } from './diag.js';
import { ZOMBIE_ANIMATIONS, KNIGHT_VISUALS, BLADE_W, ITEM_DROP_ICON_H, GOLD_COIN_ICON_H, MASTER_CHEST_ICON_H, MASTER_CHEST_RANGE } from './game-data.js';
import { hideMasterChest, $ } from './ui.js';

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

const EDGE_FOG_DEPTH = 420;
const EDGE_FOG_SPACING = 190;

function drawFogPuff(ctx, x, y, radiusX, radiusY, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(x, y);
  ctx.scale(radiusX, radiusY);
  const fog = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  fog.addColorStop(0, 'rgba(52, 53, 63, 0.96)');
  fog.addColorStop(0.42, 'rgba(47, 48, 58, 0.82)');
  fog.addColorStop(0.72, 'rgba(42, 43, 53, 0.45)');
  fog.addColorStop(1, 'rgba(38, 39, 48, 0)');
  ctx.fillStyle = fog;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNightWorldEdgeFog(ctx, cam, viewW, viewH) {
  if (state.matchPhase !== 'nighttime' || !state.worldW || !state.worldH) return;

  const fogTime = performance.now() / 1000;
  const depth = Math.min(EDGE_FOG_DEPTH, state.worldW / 4, state.worldH / 4);
  const left = -cam.x;
  const right = state.worldW - cam.x;
  const top = -cam.y;
  const bottom = state.worldH - cam.y;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, viewW, viewH);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(left, top, depth, state.worldH);
  ctx.rect(right - depth, top, depth, state.worldH);
  ctx.rect(left, top, state.worldW, depth);
  ctx.rect(left, bottom - depth, state.worldW, depth);
  ctx.clip();

  const edgeGradients = [
    [left, top, depth, state.worldH, left, left + depth, true],
    [right - depth, top, depth, state.worldH, right, right - depth, true],
    [left, top, state.worldW, depth, top, top + depth, false],
    [left, bottom - depth, state.worldW, depth, bottom, bottom - depth, false]
  ];

  for (const [x, y, w, h, start, end, horizontal] of edgeGradients) {
    if (x >= viewW || y >= viewH || x + w <= 0 || y + h <= 0) continue;
    const gradient = horizontal
      ? ctx.createLinearGradient(start, 0, end, 0)
      : ctx.createLinearGradient(0, start, 0, end);
    gradient.addColorStop(0, 'rgba(37, 38, 47, 0.98)');
    gradient.addColorStop(0.24, 'rgba(40, 41, 50, 0.9)');
    gradient.addColorStop(0.62, 'rgba(42, 43, 53, 0.42)');
    gradient.addColorStop(1, 'rgba(42, 42, 53, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
  }

  for (let y = 0, i = 0; y <= state.worldH; y += EDGE_FOG_SPACING, i++) {
    const phase = fogTime * 0.52 + i * 1.73;
    const breathe = 1 + Math.sin(fogTime * 0.68 + i * 0.91) * 0.09;
    const radiusY = (270 + (i % 4) * 22) * (2 - breathe);
    const radiusX = (165 + (i % 3) * 16) * breathe;
    const opacity = 0.88 + Math.sin(fogTime * 0.61 + i * 1.19) * 0.12;
    const screenY = y - cam.y + Math.sin(phase) * 68;
    if (screenY + radiusY < 0 || screenY - radiusY > viewH) continue;
    if (left + radiusX >= 0 && left - radiusX <= viewW) {
      drawFogPuff(ctx, left, screenY, radiusX, radiusY, opacity);
    }
    if (right + radiusX >= 0 && right - radiusX <= viewW) {
      drawFogPuff(ctx, right, screenY, radiusX, radiusY, opacity);
    }
  }

  for (let x = 0, i = 0; x <= state.worldW; x += EDGE_FOG_SPACING, i++) {
    const phase = fogTime * 0.47 + i * 1.57;
    const breathe = 1 + Math.sin(fogTime * 0.64 + i * 1.03) * 0.09;
    const radiusX = (270 + (i % 4) * 22) * (2 - breathe);
    const radiusY = (165 + (i % 3) * 16) * breathe;
    const opacity = 0.88 + Math.sin(fogTime * 0.58 + i * 1.31) * 0.12;
    const screenX = x - cam.x + Math.sin(phase) * 68;
    if (screenX + radiusX < 0 || screenX - radiusX > viewW) continue;
    if (top + radiusY >= 0 && top - radiusY <= viewH) {
      drawFogPuff(ctx, screenX, top, radiusX, radiusY, opacity);
    }
    if (bottom + radiusY >= 0 && bottom - radiusY <= viewH) {
      drawFogPuff(ctx, screenX, bottom, radiusX, radiusY, opacity);
    }
  }

  ctx.restore();
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
    me.realAngle = target;
    if (me.pfacingAngle != null) {
      me._smoothAngle = me.pfacingAngle + shortAngleDist(me.pfacingAngle, me.facingAngle) * alpha;
    }
  }

  // Auto-close the master chest panel the instant the player walks out of
  // interaction range while it's open (2026-07-14, per Travis: "if you walk
  // away from the master chest, it needs to pull the inventory away... you
  // can't interact with it if you're too far away, just like you can't
  // click it if you're too far away") — checked every render frame rather
  // than only on the E-key press or the next server tick, so it closes the
  // moment you step outside MASTER_CHEST_RANGE, same distance gate the
  // E-key open/close in input.js already uses. hideMasterChest() now closes
  // the inventory panel right along with the chest (see their pairing in
  // ui.js, added same day the chest got drag-in) — that literally is "pull
  // the inventory away" now, not just a layout reflow; Char Stats, if open
  // alongside either, still just reflows back to its normal static size via
  // the same refreshPrimaryPanelLayout() call.
  if (me && state.worldW && $.masterChestPanel && !$.masterChestPanel.classList.contains('hidden')) {
    const ccx = state.worldW / 2, ccy = state.worldH / 2;
    if (Math.hypot(me.x - ccx, me.y - ccy) > MASTER_CHEST_RANGE) {
      hideMasterChest();
    }
  }

  if (state.localAnim) {
    const elapsed = performance.now() - state.localAnim.startTime;
    const duration = (state.localAnim.totalFrames / 60) * 1000 / 2;
    state.localAnim.frame = Math.floor((elapsed / duration) * state.localAnim.totalFrames);
    if (state.localAnim._holding && state.localAnim._holdFrame > 0) {
      if (state.localAnim.frame >= state.localAnim._holdFrame) {
        state.localAnim.frame = state.localAnim._holdFrame - 1;
      }
    } else if (state.localAnim.frame >= state.localAnim.totalFrames) {
      state.localAnim.frame = state.localAnim.totalFrames - 1;
      handleAnimNaturalEnd();
    }
  }

  const zombieAnim = ZOMBIE_ANIMATIONS?.attack;
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

  // Master chest (2026-07-14) — fixed world landmark at the exact map
  // center, holding each player's personal permanent-storage grid (see
  // server/player.js's p.masterChest). Position is derived independently
  // here from state.worldW/worldH rather than synced over a socket event —
  // it's a constant (WORLD_W/2, WORLD_H/2 server-side too), not a moving/
  // spawned entity, so there's nothing to keep in sync. Drawn right after
  // the background, before item drops/zombies/players, so anyone standing
  // at/near it renders on top, same z-order idea as the loot-icon comment
  // right below.
  const chestFrame = state.spriteFrames?.['MastreChest_resized.png']?.frame;
  if (chestFrame && state.worldW) {
    const chdh = MASTER_CHEST_ICON_H;
    const chdw = chdh * (chestFrame.w / chestFrame.h);
    const ccx = state.worldW / 2 - cam.x;
    const ccy = state.worldH / 2 - cam.y;
    if (ccx > -chdw && ccx < eW + chdw && ccy > -chdh && ccy < eH + chdh) {
      ctx.drawImage(getSpriteFromSheet(state.spriteSheet, chdw, chdh, chestFrame), ccx - chdw / 2, ccy - chdh / 2, chdw, chdh);
    }
  }

  // World item-drop icons (loot from zombie kills) — just the generic
  // "loot.png" marker (added to spritesheet.png/.json) for every drop,
  // regardless of what's actually inside; no background/glow behind it by
  // design (Travis: "I want just the bag to be visible") — hovering reveals
  // the real item (icon/name/stats via ui.js's showDropTooltip, triggered
  // from input.js's mousemove). Drawn size always comes from the plain
  // ITEM_DROP_ICON_H (game-data.js), never inflated by zoom — see the
  // comment right below. input.js's hitTestItemDrop() anchors its hit
  // rectangle on this same world-space point (d.x, d.y) with no offset, so
  // don't add a y-offset here without updating that too, but its RECTANGLE
  // SIZE is intentionally no longer identical to this drawn size at low
  // zoom (see that function's comment) — don't assume they match.
  // Drawn right after the background (2026-07-11) so zombies/players always
  // render on top of drops lying on the ground, not the other way around.
  const lootFrame = state.spriteFrames?.['loot.png']?.frame;
  // Gold coins (2026-07-13) render as their OWN small, instantly-recognizable
  // icon instead of the generic mystery bag above — Travis wants coins
  // visible for what they are on the ground, unlike equipment drops which
  // are deliberately anonymous until hovered. Also gets a slowly wavering
  // glow: the world is drawn entirely on <canvas> (not DOM), so a literal
  // CSS animation can't reach these pixels — this simulates the same
  // "wavering glow" effect via canvas shadowBlur oscillating over time
  // instead, same visual idea, different mechanism.
  const goldFrame = state.itemFrames?.['goldcoin.png']?.frame;
  if (lootFrame || goldFrame) {
    // Always the plain world-space size (ITEM_DROP_ICON_H) — no zoom-based
    // inflation. A 2026-07-13 attempt at fixing low-zoom hover precision
    // briefly floored THIS (the drawn size) to a minimum screen-pixel size,
    // which fixed hovering but made the bag visibly grow larger than its
    // real size the further out you zoomed — Travis didn't want that ("I
    // want the bags to stay the same size all the time as they initially
    // were"). Reverted same day: the visual size is back to pure
    // ITEM_DROP_ICON_H * zoom, shrinking naturally like everything else in
    // the world. The hover-precision fix now lives ONLY in input.js's
    // hitTestItemDrop() — the clickable/hoverable AREA around the icon
    // stays generous at low zoom even though the icon you see does not; see
    // that function's comment.
    const dh = ITEM_DROP_ICON_H, dw = lootFrame ? dh * (lootFrame.w / lootFrame.h) : dh;
    const gdh = GOLD_COIN_ICON_H, gdw = goldFrame ? gdh * (goldFrame.w / goldFrame.h) : gdh;
    // Slow sine wave, ~3s period, oscillating the glow's blur radius between
    // a dim base and a brighter peak — "wavers off and on slowly" per Travis.
    const glowPhase = (performance.now() / 3000) % (Math.PI * 2);
    const glowBlur = 6 + 5 * (0.5 + 0.5 * Math.sin(glowPhase));
    for (const id in state.itemDrops) {
      const d = state.itemDrops[id];
      const sx = d.x - cam.x, sy = d.y - cam.y;
      if (sx < -40 || sx > eW + 40 || sy < -40 || sy > eH + 40) continue;
      if (d.item && d.item.kind === 'gold') {
        if (!goldFrame) continue;
        ctx.save();
        ctx.shadowColor = 'rgba(255, 210, 80, 0.9)';
        ctx.shadowBlur = glowBlur;
        ctx.drawImage(getSpriteFromSheet(state.itemSheet, gdw, gdh, goldFrame), sx - gdw / 2, sy - gdh / 2, gdw, gdh);
        ctx.restore();
      } else if (lootFrame) {
        ctx.drawImage(getSpriteFromSheet(state.spriteSheet, dw, dh, lootFrame), sx - dw / 2, sy - dh / 2, dw, dh);
      }
    }
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

  // Keep world entities beneath the nighttime boundary clouds while all HUD
  // elements remain crisp above them.
  drawNightWorldEdgeFog(ctx, cam, eW, eH);

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
        input.angle = me.realAngle || Math.atan2((state.mouseY / zoom + cam.y) - me.y, (state.mouseX / zoom + cam.x) - me.x);
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
