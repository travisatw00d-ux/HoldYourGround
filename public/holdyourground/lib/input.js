import { state } from './state.js';
import { getCamera } from './camera.js';
import { showDropTooltip, positionDropTooltip, hideDropTooltip, dropHoveredItem, $, showMasterChest, hideMasterChest, showChestTooltip } from './ui.js';
import { ITEM_DROP_ICON_H, ITEM_DROP_ICON_MIN_SCREEN_PX, ITEM_PICKUP_RANGE, GOLD_COIN_ICON_H, MASTER_CHEST_RANGE, MASTER_CHEST_ICON_H } from './game-data.js';

// Hit test against a rectangle centered on the drop. The rectangle's size
// is intentionally NOT always identical to the drawn icon (see render.js —
// it draws at a plain, constant ITEM_DROP_ICON_H, deliberately not floored,
// per Travis: "I want the bags to stay the same size all the time"). This
// hit-test area, on the other hand, DOES apply a minimum-screen-pixels floor
// (ITEM_DROP_ICON_MIN_SCREEN_PX / zoom) so the invisible hoverable/clickable
// region around a tiny, zoomed-out icon stays comfortably sized even though
// the icon you actually see does not grow — fixes "can't hover items when
// zoomed out" (2026-07-13) without the visual side-effect Travis didn't
// want. At high zoom this floor is a no-op (natural size already exceeds
// it), so close up this behaves exactly like a tight, icon-matching
// rectangle same as before. Gold-coin drops (also 2026-07-13) use their own,
// much smaller GOLD_COIN_ICON_H base size instead of the loot.png bag's —
// same floor logic applies per-drop so tiny coins stay comfortably hoverable
// at low zoom too.
function hitTestItemDrop() {
  const lootFrame = state.spriteFrames?.['loot.png']?.frame;
  const goldFrame = state.itemFrames?.['goldcoin.png']?.frame;
  if (!lootFrame && !goldFrame) return null;
  const me = state.players[state.myId];
  if (!me) return null;
  const zoom = state.cameraZoom || 1;
  const lootDh = lootFrame ? Math.max(ITEM_DROP_ICON_H, ITEM_DROP_ICON_MIN_SCREEN_PX / zoom) : 0;
  const lootDw = lootFrame ? lootDh * (lootFrame.w / lootFrame.h) : 0;
  const goldDh = goldFrame ? Math.max(GOLD_COIN_ICON_H, ITEM_DROP_ICON_MIN_SCREEN_PX / zoom) : 0;
  const goldDw = goldFrame ? goldDh * (goldFrame.w / goldFrame.h) : 0;
  const cam = getCamera();
  const wx = state.mouseX / zoom + cam.x;
  const wy = state.mouseY / zoom + cam.y;
  let closestId = null;
  let closestD2 = Infinity;
  for (const id in state.itemDrops) {
    const d = state.itemDrops[id];
    const isGold = d.item && d.item.kind === 'gold';
    if (isGold ? !goldFrame : !lootFrame) continue;
    const halfW = (isGold ? goldDw : lootDw) / 2, halfH = (isGold ? goldDh : lootDh) / 2;
    const pdx = me.x - d.x, pdy = me.y - d.y;
    if (pdx * pdx + pdy * pdy > ITEM_PICKUP_RANGE * ITEM_PICKUP_RANGE) continue;
    const dx = wx - d.x, dy = wy - d.y;
    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestD2) { closestD2 = d2; closestId = id; }
  }
  return closestId;
}

// Hit test against the master chest's world sprite, same rectangle math
// hitTestItemDrop() above uses for drops — mouse position converted to world
// coords via the camera/zoom, tested against half-width/half-height around
// the chest's fixed center point. Applies the same ITEM_DROP_ICON_MIN_SCREEN_PX
// hover-floor as item drops (2026-07-14) so the hover area stays comfortably
// sized when zoomed out, even though the drawn sprite itself (MASTER_CHEST_ICON_H,
// see render.js) does not grow — same decoupled render/hit-test convention
// documented on hitTestItemDrop above. Not gated by MASTER_CHEST_RANGE — unlike
// an item drop's contents, there's nothing here that needs to stay hidden
// until the player is close, it's just a landmark label.
function hitTestMasterChest() {
  if (!state.worldW) return false;
  const chestFrame = state.spriteFrames?.['MastreChest_resized.png']?.frame;
  if (!chestFrame) return false;
  const zoom = state.cameraZoom || 1;
  const dh = Math.max(MASTER_CHEST_ICON_H, ITEM_DROP_ICON_MIN_SCREEN_PX / zoom);
  const dw = dh * (chestFrame.w / chestFrame.h);
  const cam = getCamera();
  const wx = state.mouseX / zoom + cam.x;
  const wy = state.mouseY / zoom + cam.y;
  const cx = state.worldW / 2, cy = state.worldH / 2;
  return Math.abs(wx - cx) <= dw / 2 && Math.abs(wy - cy) <= dh / 2;
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
  // Suppress the browser's native right-click context menu everywhere on
  // the page (2026-07-12) — without this, right-clicking during play (e.g.
  // while aiming) pops up Chrome/Firefox/Edge/Safari's own "Save Image /
  // Copy Image / Inspect" menu on top of the game, which is standard
  // `contextmenu` event behavior on any page with an <img>/<canvas>, not a
  // Chrome-specific quirk — preventDefault() on 'contextmenu' is the
  // universal, cross-browser fix (no per-browser handling needed).
  // Document-level (not just the canvas) so it also covers right-clicking
  // any other part of the game UI (HUD buttons, panels, etc.).
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Tracks which item drop's tooltip is currently showing (set/cleared by
  // the mousemove handler below via hitTestItemDrop()). Declared up here,
  // ahead of the keydown handler, so 'E' (below) can read it — closures
  // over this `let` work regardless of textual order since setupInput()
  // runs fully, synchronously, before any event can fire, but keeping the
  // declaration above its first use reads more sensibly than relying on
  // that.
  let hoveredDropId = null;
  // Tracks whether the cursor is currently over the master chest's world
  // sprite (set/cleared by mousemove via hitTestMasterChest() below) — drives
  // the chest's hover tooltip the same way hoveredDropId drives the item-drop
  // tooltip. Deliberately boolean, not an id, since there's only ever one
  // chest.
  let hoveredChest = false;

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
      // Server-authoritative: active attacks/chain windows are rejected and
      // echoed back unchanged, while post-attack recovery accepts the toggle
      // so players can swap stance before comboReady lights up.
      socket.emit('toggleAttackStyle');
    }
    if (e.key === 'x' || e.key === 'X') {
      // No-ops if nothing's currently hovered (dropHoveredItem tracks that
      // itself via ui.js's renderInventorySlots() mouseenter/mouseleave
      // listeners) — safe to fire unconditionally on every 'x' press rather
      // than gating on state.screen here too, same convention as the 1-9
      // equip-slot handler above.
      dropHoveredItem(socket);
    }
    if (e.key === 'e' || e.key === 'E') {
      // Picks up EXCLUSIVELY the drop whose tooltip is currently showing
      // (2026-07-12, per Travis — was previously "nearest drop to the
      // player" regardless of what was on screen, which could pick up a
      // completely different item than the one whose stats the player was
      // just looking at). `hoveredDropId` is set by the mousemove handler
      // below via hitTestItemDrop() — the same tight cursor-over-icon +
      // in-range test that drives the tooltip itself, so "the item the
      // banner is showing" and "the item E picks up" are now guaranteed to
      // be the same one, by construction. No fallback to anything else —
      // if nothing's hovered (no tooltip visible), E is a no-op.
      if (state.screen === 'playing' && hoveredDropId) {
        socket.emit('pickupItem', { id: hoveredDropId });
      } else if (state.screen === 'playing') {
        // Master chest (2026-07-14) — proximity-gated, unlike the hover-gated
        // pickup branch above. Only checked when no item drop is hovered, so
        // standing right next to the chest while also hovering a nearby drop
        // still picks up the drop first (same "closest intent wins" idea as
        // everywhere else E is used). MASTER_CHEST_RANGE mirrors
        // ITEM_PICKUP_RANGE's role but is purely a client-side gate here —
        // toggling the panel open/closed has no server-side effect itself,
        // same as 'i' for the inventory panel (the real gate, now that
        // drag-in/persistence are both live, is room.js's server-side
        // _nearMasterChest() check on every actual moveItem/dropItem).
        // showMasterChest()/hideMasterChest() also open/close the inventory
        // panel alongside the chest (see their pairing in ui.js) — there's
        // no purpose to the chest being open without the bag to drag into.
        const me = state.players[state.myId];
        if (me) {
          const cx = state.worldW / 2, cy = state.worldH / 2;
          if (Math.hypot(me.x - cx, me.y - cy) <= MASTER_CHEST_RANGE) {
            if ($.masterChestPanel.classList.contains('hidden')) showMasterChest();
            else hideMasterChest();
          }
        }
      }
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
      // Left click no longer picks up items (2026-07-12, per Travis — 'E' is
      // now the ONLY pickup method) — always attacks, even when hovering a
      // drop. hitTestItemDrop() is still used below in mousemove purely for
      // the hover tooltip; it's just no longer consulted here.
      socket.emit('attack', { facingAngle: state.players[state.myId]?.realAngle || state.players[state.myId]?.facingAngle || 0 });
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    state.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (state.screen === 'playing') {
      const dropId = hitTestItemDrop();
      if (dropId !== hoveredDropId) {
        hoveredDropId = dropId;
        if (dropId) showDropTooltip(state.itemDrops[dropId]?.item, e);
        else if (!hoveredChest) hideDropTooltip();
      } else if (dropId) {
        positionDropTooltip(e);
      }
      // Master chest hover tooltip (2026-07-14) — only checked when no item
      // drop is hovered, same "closest intent wins" priority as the E-key
      // handler above, so a drop sitting right next to the chest still gets
      // its own tooltip rather than being shadowed by the chest's.
      if (!dropId) {
        const overChest = hitTestMasterChest();
        if (overChest !== hoveredChest) {
          hoveredChest = overChest;
          if (overChest) showChestTooltip(e);
          else hideDropTooltip();
        } else if (overChest) {
          positionDropTooltip(e);
        }
      } else if (hoveredChest) {
        hoveredChest = false;
      }
    } else {
      if (hoveredDropId || hoveredChest) hideDropTooltip();
      hoveredDropId = null;
      hoveredChest = false;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredDropId = null;
    hoveredChest = false;
    hideDropTooltip();
  });
}
