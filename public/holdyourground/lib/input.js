import { state } from './state.js';
import { startIdleTransition } from './anims.js';
import { getCamera } from './camera.js';
import { showDropTooltip, positionDropTooltip, hideDropTooltip } from './ui.js';
import { ITEM_DROP_ICON_H, ITEM_PICKUP_RANGE } from './game-data.js';

// Tight rectangle hit test matching the drawn loot icon exactly (same
// ITEM_DROP_ICON_H + sprite aspect ratio render.js uses, no padding) — drops
// can land close together, so this needs to be precise rather than a
// generous click radius that could grab the wrong one. Also requires the
// local player to actually be within ITEM_PICKUP_RANGE of the drop — without
// this, a zoomed-out camera could hover/reveal (tooltip) or click-pickup
// loot from across the map. Same range the server enforces for the actual
// pickup, so nothing shown/clickable here would get silently rejected.
function hitTestItemDrop() {
  const lootFrame = state.spriteFrames?.['loot.png']?.frame;
  if (!lootFrame) return null;
  const me = state.players[state.myId];
  if (!me) return null;
  const dh = ITEM_DROP_ICON_H, dw = dh * (lootFrame.w / lootFrame.h);
  const halfW = dw / 2, halfH = dh / 2;
  const zoom = state.cameraZoom || 1;
  const cam = getCamera();
  const wx = state.mouseX / zoom + cam.x;
  const wy = state.mouseY / zoom + cam.y;
  let closestId = null;
  let closestD2 = Infinity;
  for (const id in state.itemDrops) {
    const d = state.itemDrops[id];
    const pdx = me.x - d.x, pdy = me.y - d.y;
    if (pdx * pdx + pdy * pdy > ITEM_PICKUP_RANGE * ITEM_PICKUP_RANGE) continue;
    const dx = wx - d.x, dy = wy - d.y;
    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestD2) { closestD2 = d2; closestId = id; }
  }
  return closestId;
}

const keys = {};
const keyTimers = {};

function clearKeyTimer(key) {
  if (keyTimers[key]) { clearTimeout(keyTimers[key]); delete keyTimers[key]; }
  if (key >= 'a' && key <= 'z' && keyTimers[key.toUpperCase()]) { clearTimeout(keyTimers[key.toUpperCase()]); delete keyTimers[key.toUpperCase()]; }
  if (key >= 'A' && key <= 'Z' && keyTimers[key.toLowerCase()]) { clearTimeout(keyTimers[key.toLowerCase()]); delete keyTimers[key.toLowerCase()]; }
}

function setKeyTimer(key) {
  clearKeyTimer(key);
  keyTimers[key] = setTimeout(() => { keys[key] = false; syncKeyCase(key, false); delete keyTimers[key]; }, 5000);
}

function syncKeyCase(key, value) {
  if (key >= 'a' && key <= 'z') keys[key.toUpperCase()] = value;
  if (key >= 'A' && key <= 'Z') keys[key.toLowerCase()] = value;
}

export function getInput() {
  const me = state.players[state.myId];
  if (!me || me.isSpectator || state.isDeadSpectating) return { dx: 0, dy: 0, sprint: false };
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['W'] || keys['ArrowUp']) dy = -1;
  if (keys['s'] || keys['S'] || keys['ArrowDown']) dy = 1;
  if (keys['a'] || keys['A'] || keys['ArrowLeft']) dx = -1;
  if (keys['d'] || keys['D'] || keys['ArrowRight']) dx = 1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) { dx /= len; dy /= len; }
  return { dx, dy, sprint: !!keys['Shift'] };
}

export function resetKeys() {
  for (const key in keys) keys[key] = false;
  for (const k in keyTimers) { clearTimeout(keyTimers[k]); delete keyTimers[k]; }
}

export function setupInput(socket, canvas) {
  document.addEventListener('keydown', (e) => {
    if ((state.isSpectator || state.isDeadSpectating) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const ids = Object.keys(state.players).filter(id => state.players[id].alive);
      ids.sort((a, b) => state.players[b].lvl - state.players[a].lvl);
      if (ids.length === 0) return;
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      state.spectatingTargetIndex = (state.spectatingTargetIndex + dir + ids.length) % ids.length;
      const targetId = ids[Math.min(state.spectatingTargetIndex, ids.length - 1)];
      if (targetId) socket.emit('spectateTarget', { targetId });
      return;
    }
    if (typeof e.getModifierState === 'function' && !e.getModifierState('Shift') && keys['Shift']) keys['Shift'] = false;
    keys[e.key] = true;
    syncKeyCase(e.key, true);
    if (!['w','W','a','A','s','S','d','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      setKeyTimer(e.key);
    }
    if (e.key >= '1' && e.key <= '9') {
      const slot = parseInt(e.key) - 1;
      socket.emit('equip', { slot });
    }
    if (e.key === 'h' || e.key === 'H') {
      if (state.debugHitbox) {
        state.debugHitbox = false;
        state.showDiag = true;
      } else if (state.showDiag) {
        state.showDiag = false;
      } else {
        state.debugHitbox = true;
      }
      state.showHudDebug = false;
    }
    if (e.key === 'j' || e.key === 'J') {
      state.showHudDebug = !state.showHudDebug;
      if (state.showHudDebug) { state.debugHitbox = false; state.showDiag = false; }
      console.log('[HYG] HUD debug:', state.showHudDebug);
    }
    if (e.key === ' ') {
      e.preventDefault();
      const newStyle = state.attackStyle === 'jab' ? 'swing' : 'jab';
      startIdleTransition(newStyle);
      socket.emit('toggleAttackStyle');
      state.attackStyle = newStyle;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (typeof e.getModifierState === 'function' && !e.getModifierState('Shift') && keys['Shift']) keys['Shift'] = false;
    clearKeyTimer(e.key);
    keys[e.key] = false;
    syncKeyCase(e.key, false);
  });

  window.addEventListener('blur', () => {
    for (const key in keys) keys[key] = false;
    for (const k in keyTimers) { clearTimeout(keyTimers[k]); delete keyTimers[k]; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const key in keys) keys[key] = false;
      for (const k in keyTimers) { clearTimeout(keyTimers[k]); delete keyTimers[k]; }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    if (state.isSpectator || state.isDeadSpectating) return;
    const mx = state.mouseX;
    const my = state.mouseY;
    const oy = Math.max(0, state.viewH - 576);
    const hudBounds = { x: -35, y: 375 + oy, w: 500, h: 170 };
    if (mx >= hudBounds.x && mx <= hudBounds.x + hudBounds.w &&
        my >= hudBounds.y && my <= hudBounds.y + hudBounds.h) {
      e.preventDefault();
      const maxHS = document.fullscreenElement ? 1.5 : 1.0;
      state.hudScale = Math.max(0.3, Math.min(maxHS, state.hudScale + (e.deltaY > 0 ? -0.05 : 0.05)));
      return;
    }
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    state.cameraZoom *= dir > 0 ? 1.1 : 1 / 1.1;
    const minZoom = state.worldW ? Math.max(state.viewW / state.worldW, state.viewH / state.worldH) : 0.25;
    state.cameraZoom = Math.max(minZoom, Math.min(4.0, state.cameraZoom));
    socket.emit('cameraZoom', { zoom: state.cameraZoom, viewW: state.viewW, viewH: state.viewH });
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && state.screen === 'playing') {
      const dropId = hitTestItemDrop();
      if (dropId) {
        socket.emit('pickupItem', { id: dropId });
        return;
      }
      socket.emit('attack', { facingAngle: state.players[state.myId]?.realAngle || state.players[state.myId]?.facingAngle || 0 });
    }
  });

  let hoveredDropId = null;
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    state.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (state.screen === 'playing') {
      const dropId = hitTestItemDrop();
      if (dropId !== hoveredDropId) {
        hoveredDropId = dropId;
        if (dropId) showDropTooltip(state.itemDrops[dropId]?.item, e);
        else hideDropTooltip();
      } else if (dropId) {
        positionDropTooltip(e);
      }
    } else if (hoveredDropId) {
      hoveredDropId = null;
      hideDropTooltip();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredDropId = null;
    hideDropTooltip();
  });
}
