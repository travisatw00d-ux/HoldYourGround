import { state } from './state.js';
import { resetWavePopup } from './next-wave-popup.js';
import { stopRender } from './render.js';
import { ITEMS, ITEM_ICONS, BASE_STATS, ITEM_RARITIES, ITEM_ATTRIBUTES } from './game-data.js';

// Bag/equipment slots hold either a plain base-item-id string (starter gear,
// never rolls attributes) or a full rolled instance object (anything from a
// drop — { instanceId, baseItemId, itemTier, rarityId, attributes }, see
// server/item-generator.js). Every place that needs "what ITEMS entry is
// this" goes through this instead of assuming one shape.
function resolveBaseItemId(itemOrInstance) {
  if (!itemOrInstance) return null;
  return typeof itemOrInstance === 'string' ? itemOrInstance : itemOrInstance.baseItemId;
}

function isRolledInstance(itemOrInstance) {
  return !!itemOrInstance && typeof itemOrInstance === 'object' && Array.isArray(itemOrInstance.attributes);
}

function getRarityDef(rarityId) {
  return ITEM_RARITIES.find(r => r.id === rarityId) || null;
}

// DOM references
export const $ = {
  canvas: document.getElementById('canvas'),
  menu: document.getElementById('menu'),
  eliminated: document.getElementById('eliminated'),
  hud: document.getElementById('hud'),
  authForm: document.getElementById('authForm'),
  welcomePanel: document.getElementById('welcomePanel'),
  usernameInput: document.getElementById('usernameInput'),
  passwordInput: document.getElementById('passwordInput'),
  loginMode: document.getElementById('loginMode'),
  registerMode: document.getElementById('registerMode'),
  loginBtn: document.getElementById('loginBtn'),
  registerBtn: document.getElementById('registerBtn'),
  showRegisterBtn: document.getElementById('showRegisterBtn'),
  showLoginBtn: document.getElementById('showLoginBtn'),
  displayNameInput: document.getElementById('displayNameInput'),
  guestBtn: document.getElementById('guestBtn'),
  lobbyCountDisplay: document.getElementById('lobbyCountDisplay'),
  roomListEl: document.getElementById('roomList'),
  welcomeMsg: document.getElementById('welcomeMsg'),
  accountStats: document.getElementById('accountStats'),
  lobbyBtn: document.getElementById('lobbyBtn'),
  adminBadge: document.getElementById('adminBadge'),
  joinBtn: document.getElementById('joinBtn'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  respawnBtn: document.getElementById('respawnBtn'),
  hotbarEl: document.getElementById('hotbarInventory'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  settingsClose: document.getElementById('settingsClose'),
  fullscreenToggle: document.getElementById('fullscreenToggle'),
  godModeToggle: document.getElementById('godModeToggle'),
  killMobsBtn: document.getElementById('killMobsBtn'),
  nextPhaseBtn: document.getElementById('nextPhaseBtn'),
  levelMinusBtn: document.getElementById('levelMinusBtn'),
  levelPlusBtn: document.getElementById('levelPlusBtn'),
  adminLevelDisplay: document.getElementById('adminLevelDisplay'),
  adminSettings: document.getElementById('adminSettings'),
  escapeMenu: document.getElementById('escapeMenu'),
  escapeStep1: document.getElementById('escapeStep1'),
  escapeStep2: document.getElementById('escapeStep2'),
  escapeReturnBtn: document.getElementById('escapeReturnBtn'),
  escapeConfirmBtn: document.getElementById('escapeConfirmBtn'),
  escapeCancelBtn: document.getElementById('escapeCancelBtn'),
  errorMsg: document.getElementById('errorMsg'),
  signInPrompt: document.getElementById('signInPrompt'),
  wrapper: document.getElementById('wrapper'),
  waitingRespawn: document.getElementById('waitingRespawn'),
  waitingLobbyBtn: document.getElementById('waitingLobbyBtn'),
  lobbyScreen: document.getElementById('lobbyScreen'),
  lobbyStartBtn: document.getElementById('lobbyStartBtn'),
  lobbyLeaveBtn: document.getElementById('lobbyLeaveBtn'),
  resultsPlayAgainBtn: document.getElementById('resultsPlayAgainBtn'),
  resultsLobbyBtn: document.getElementById('resultsLobbyBtn'),
  joinGameBtn: document.getElementById('joinGameBtn'),
  statsBtn: document.getElementById('statsBtn'),
  statsPanel: document.getElementById('statsPanel'),
  statsClose: document.getElementById('statsClose'),
  statsContent: document.getElementById('statsContent'),
  charStatsPanel: document.getElementById('charStatsPanel'),
  charStatsClose: document.getElementById('charStatsClose'),
  charStatsContent: document.getElementById('charStatsContent'),
  inventoryPanel: document.getElementById('inventoryPanel'),
  inventoryClose: document.getElementById('inventoryClose'),
  itemTooltip: document.getElementById('itemTooltip'),
  dropTooltip: document.getElementById('dropTooltip'),
};

let selectedRoomId = null;
let currentRooms = [];

export function getSelectedRoomId() { return selectedRoomId; }
export function setSelectedRoomId(v) { selectedRoomId = v; }
export function getCurrentRooms() { return currentRooms; }
export function setCurrentRooms(v) { currentRooms = v; }

export function showScreen(id) {
  $.menu.classList.add('hidden');
  $.eliminated.classList.add('hidden');
  $.waitingRespawn.classList.add('hidden');
  $.lobbyScreen.classList.add('hidden');
  $.hud.classList.add('hidden');
  $.hotbarEl.classList.add('hidden');
  $.settingsPanel.classList.add('hidden');
  document.getElementById('loadingOverlay').classList.add('hidden');
  resetWavePopup();
  state.screen = id;
  if (id === 'menu') $.menu.classList.remove('hidden');
  if (id === 'eliminated') $.eliminated.classList.remove('hidden');
  if (id === 'waitingRespawn') $.waitingRespawn.classList.remove('hidden');
  if (id === 'lobby') $.lobbyScreen.classList.remove('hidden');
  if (id === 'playing') { $.hud.classList.remove('hidden'); $.settingsBtn.classList.remove('hidden'); }
}

export function joinGame(roomId, socket) {
  if (!state.account && !state.guestName) { $.signInPrompt.classList.remove('hidden'); return; }
  $.signInPrompt.classList.add('hidden');
  const name = state.account?.displayName || state.guestName || 'Player';
  socket.emit('join', { roomId, name });
}

export function renderRoomList(rooms) {
  currentRooms = rooms || [];
  $.roomListEl.innerHTML = '';
  $.errorMsg.textContent = '';

  if (!rooms || rooms.length === 0) {
    $.roomListEl.innerHTML = '<div class="room-entry empty">No rooms available</div>';
    return;
  }

  for (const room of rooms) {
    const entry = document.createElement('div');
    entry.className = 'room-entry';
    if (selectedRoomId === room.id) entry.classList.add('selected');
    const nameColors = { guest: '#eee', basic: '#228B22', admin: '#FFD700' };
    const nameBold = { guest: true, basic: false, admin: true };
    const players = room.playerNames && room.playerNames.length > 0
      ? room.playerNames.map(p => '<span style="color:' + (nameColors[p.type] || '#eee') + ';' + (nameBold[p.type] ? 'font-weight:bold' : '') + '">' + p.name + '</span>').join(', ')
      : '';
    entry.innerHTML = `<div style="flex:1"><div class="room-first-line"><span class="room-level">LVL - ${room.serverLevel || 0}</span><span class="room-name">${room.id}</span><span class="room-players">${room.playerCount}/${room.maxPlayers}</span></div>${players ? '<div class="room-names">' + players + '</div>' : ''}</div>`;
    entry.addEventListener('click', () => {
      setSelectedRoomId(room.id);
      document.querySelectorAll('.room-entry').forEach(e => e.classList.remove('selected'));
      entry.classList.add('selected');
      $.errorMsg.textContent = '';
    });
    entry.addEventListener('dblclick', () => {
      setSelectedRoomId(room.id);
      joinGame(room.id, window.socket);
    });
    $.roomListEl.appendChild(entry);
  }

  const hasEmpty = currentRooms.some(r => r.playerCount === 0);
  $.createRoomBtn.textContent = hasEmpty ? 'Create New Room' : 'Servers Full';
  $.createRoomBtn.style.opacity = hasEmpty ? '1' : '0.4';
}

export function showLoginForm() {
  $.loginMode.classList.remove('hidden');
  $.registerMode.classList.add('hidden');
  $.errorMsg.textContent = '';
  $.errorMsg.classList.add('hidden');
  $.passwordInput.value = '';
  $.displayNameInput.value = '';
}

export function showRegisterForm() {
  $.loginMode.classList.add('hidden');
  $.registerMode.classList.remove('hidden');
  $.errorMsg.textContent = '';
  $.errorMsg.classList.add('hidden');
  $.passwordInput.value = '';
}

export function onAuth(data) {
  state.account = data.account;
  state.isGuest = false;
  state.guestName = null;
  state.level = data.account.level;
  state.exp = data.account.exp;
  state.expToNext = data.account.expToNext;
  state.gold = data.account.gold;

  $.usernameInput.value = '';
  $.passwordInput.value = '';
  $.displayNameInput.value = '';
  $.errorMsg.textContent = '';

  $.welcomeMsg.textContent = 'Welcome back, ' + data.account.displayName + '!';
  $.accountStats.textContent = 'Level ' + data.account.level + ' | Exp ' + data.account.exp + '/' + data.account.expToNext + ' | Gold ' + data.account.gold;

  const isAdmin = data.account.isAdmin || data.account.accountType === 'admin';
  if (isAdmin) {
    $.wrapper.classList.add('admin-mode');
    $.adminBadge.classList.remove('hidden');
    $.adminSettings.classList.remove('hidden');
    $.statsBtn.classList.remove('hidden');
    $.godModeToggle.checked = false;
  } else {
    $.wrapper.classList.remove('admin-mode');
    $.adminBadge.classList.add('hidden');
    $.adminSettings.classList.add('hidden');
    $.statsBtn.classList.add('hidden');
  }

  $.authForm.classList.add('hidden');
  $.welcomePanel.classList.remove('hidden');
  $.signInPrompt.classList.add('hidden');
}

function clearCanvas() {
  const ctx = $.canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, $.canvas.width, $.canvas.height);
}

function logScreenState(tag) {
  const ids = ['menu','lobbyScreen','resultsOverlay','eliminated','loadingOverlay','settingsBtn','settingsPanel','hud','hotbarInventory','waitingRespawn','joinGameBtn','escapeMenu','canvas'];
  let out = '[SCREEN-' + tag + '] scr=' + state.screen + ' ph=' + state.matchPhase + ' jE=' + state._joinedEnded;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) out += ' ' + id + '=' + (el.classList.contains('hidden') ? 'H' : 'V');
  }
  console.log(out);
}

export function leaveToMenu(socket) {
  stopRender();
  clearCanvas();
  socket.emit('leaveRoom');
  hideEscapeMenu();
  $.eliminated.classList.add('hidden');
  $.waitingRespawn.classList.add('hidden');
  $.lobbyScreen.classList.add('hidden');
  document.getElementById('resultsOverlay').classList.add('hidden');
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('joinGameBtn').classList.add('hidden');
  $.hotbarEl.classList.add('hidden');
  $.settingsPanel.classList.add('hidden');
  $.escapeMenu.classList.add('hidden');
  state.players = {};
  state.zombies = [];
  $.menu.classList.remove('hidden');
  $.welcomeMsg.textContent = 'Ready For Battle?';
  state.screen = 'menu';
  setSelectedRoomId(null);
  resetWavePopup();
  logScreenState('afterLeave');
  setTimeout(() => logScreenState('200ms'), 200);
}

export function hideEscapeMenu() {
  $.escapeMenu.classList.add('hidden');
  $.escapeStep2.classList.add('hidden');
  $.escapeStep1.classList.remove('hidden');
}

export function showEscapeMenu() {
  $.escapeStep2.classList.add('hidden');
  $.escapeStep1.classList.remove('hidden');
  $.escapeMenu.classList.remove('hidden');
}

export function showStatsPanel() {
  $.statsPanel.classList.remove('hidden');
}

export function hideStatsPanel() {
  $.statsPanel.classList.add('hidden');
  if (state._playersRefreshTimer) { clearTimeout(state._playersRefreshTimer); state._playersRefreshTimer = null; }
  if (state._serverStatsTimer) { clearTimeout(state._serverStatsTimer); state._serverStatsTimer = null; }
}

export function showCharStats() {
  $.charStatsPanel.classList.remove('hidden');
  const me = state.players[state.myId];
  const el = $.charStatsContent;
  const frame = state.hudFrames?.['Stats.png'];
  const sheet = state.hudSheet;
  const layout = (state.hudLayout || []).find(e => e.name === 'Stats.png');
  const canvas = document.getElementById('charStatsCanvas');
  if (!el || !canvas) return;
  if (!me) { el.innerHTML = '<div style="text-align:center;opacity:0.5">Not in game</div>'; return; }
  if (frame && sheet && layout) {
    const f = frame.frame;
    const sss = frame.spriteSourceSize;
    // No HUD legibility viewport-scale (vs) factor here on purpose: hud-position-tool.html
    // draws everything raw (x/y/scale on a fixed 1024x576 canvas), so matching that means
    // scale=1 at the default 1024x576 wrapper size. But #wrapper itself is resized to the
    // real screen resolution on fullscreen (see game.js fullscreenchange), so without any
    // correction this panel would stay pinned at its small windowed-mode pixel position —
    // stuck in a tiny top-left corner of a much bigger box. wrapperScale grows/repositions
    // it proportionally so it stays in the same relative spot at any wrapper size.
    const wrapperScale = state.viewW / 1024;
    const s = layout.scale * wrapperScale;
    const dw = sss.w * s;
    const dh = sss.h * s;
    canvas.width = dw;
    canvas.height = dh;
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, dw, dh);
    // Canvas is already sized to the trimmed sprite (dw x dh) and the panel div is
    // already positioned to account for the trim offset (sss.x/sss.y below) — drawing
    // at that same offset again here pushes the art past the canvas edge and clips it.
    ctx.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, dw, dh);
    $.charStatsPanel.style.width = dw + 'px';
    $.charStatsPanel.style.height = dh + 'px';
    $.charStatsPanel.style.left = ((layout.x + sss.x * layout.scale) * wrapperScale) + 'px';
    $.charStatsPanel.style.top = ((layout.y + sss.y * layout.scale) * wrapperScale) + 'px';
  }
  const ws = state.viewW / 1024;
  el.style.fontSize = Math.max(9, 13 * ws) + 'px';
  el.style.lineHeight = (20 * ws) + 'px';
  el.style.padding = `${8 * ws}px ${16 * ws}px`;
  const pts = state.statPoints || 0;
  const build = (state.playerMeta[state.myId] && state.playerMeta[state.myId].playerBuild) || 'standard';
  const buildDisplay = { standard: 'Standard', glassCannon: 'Glass Cannon', tank: 'Tank' };
  let html = '';
  html += '<div class="char-stat-row" style="color:var(--accent);font-weight:700"><span>Points to Spend</span><span>' + pts + '</span></div>';
  html += '<div class="char-stat-row" style="opacity:0.5"><span>Build</span><span>' + (buildDisplay[build] || build) + '</span></div>';
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Player</span><span class="char-stat-value">' + (me.name || '\u2014') + '</span></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Level</span><span class="char-stat-value">' + (state.level || 1) + '</span></div>';
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">EXP</span><span class="char-stat-value">' + state.exp + ' / ' + state.expToNext + '</span></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Gold</span><span class="char-stat-value">' + state.gold + '</span></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Kills</span><span class="char-stat-value">' + (me.kills || 0) + '</span></div>';
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  const spendable = ['maxHealth', 'maxEnergy', 'speed', 'attackDmg'];
  const labels = { maxHealth: 'Max HP', maxEnergy: 'Max Energy', speed: 'Speed', attackDmg: 'Attack Dmg' };
  const fmt = { maxHealth: v => v, maxEnergy: v => v, speed: v => v, attackDmg: v => v };
  for (const s of spendable) {
    const val = me[s] || ((s === 'maxHealth' || s === 'maxEnergy') ? 100 : 0);
    html += '<div class="char-stat-row" style="cursor:pointer" data-stat="' + s + '">';
    html += '<span class="char-stat-label">' + labels[s] + '</span>';
    html += '<span class="char-stat-value">' + (fmt[s] ? fmt[s](val) : val) + (pts > 0 ? ' <span class="stat-plus" style="opacity:0.6">[+]</span>' : '') + '</span>';
    html += '</div>';
  }
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  // defense/fortune added 2026-07-11 so equipping rolled-attribute drops
  // (armor/fortune attributes — see item-generation-system.md) has a visible
  // effect somewhere; both default to 0 (no bonus) rather than a base-stat
  // fallback since neither has a nonzero baseline like attackSpeed/turnSpeed.
  const infoLabels = { attackSpeed: 'Attack Rate', turnSpeed: 'Turn Rate', defense: 'Armor', fortune: 'Fortune' };
  const infoFmt = { attackSpeed: v => (600 / v).toFixed(2) + 'x', turnSpeed: v => (v / 12).toFixed(2) + 'x' };
  for (const s of ['attackSpeed', 'turnSpeed', 'defense', 'fortune']) {
    const val = me[s] || (s === 'turnSpeed' ? 12 : (s === 'attackSpeed' ? 600 : 0));
    html += '<div class="char-stat-row"><span class="char-stat-label">' + infoLabels[s] + '</span><span class="char-stat-value">' + (infoFmt[s] ? infoFmt[s](val) : val) + '</span></div>';
  }
  el.innerHTML = html;
  if (pts > 0) {
    el.querySelectorAll('[data-stat]').forEach(row => {
      row.addEventListener('click', () => {
        if (window.socket) {
          window.socket.emit('spendStatPoint', { stat: row.dataset.stat });
          const p = state.players[state.myId];
          if (p) {
            const scl = ({ standard: { mh:10,me:10,sp:0.03,ad:1,sc:16 }, glassCannon: { mh:5,me:10,sp:0.03,ad:2,sc:16 }, tank: { mh:15,me:10,sp:0.05,ad:0.5,sc:16 } })[build] || { mh:10,me:10,sp:0.03,ad:1,sc:16 };
            switch (row.dataset.stat) {
              case 'maxHealth': p.health = (+p.health || 100) + scl.mh; p.maxHealth = (+p.maxHealth || 100) + scl.mh; break;
              case 'maxEnergy': p.energy = (+p.energy || 100) + scl.me; p.maxEnergy = (+p.maxEnergy || 100) + scl.me; break;
              case 'speed': p.speed = Math.min(scl.sc, (+p.speed || 13) + scl.sp); break;
              case 'attackDmg': p.attackDmg = (+p.attackDmg || 5) + scl.ad; break;
            }
          }
          state.statPoints--;
          showCharStats();
        }
      });
    });
  }
}

export function hideCharStats() {
  $.charStatsPanel.classList.add('hidden');
}

export function showInventory() {
  $.inventoryPanel.classList.remove('hidden');
  const frame = state.hudFrames?.['inventory.png'];
  const sheet = state.hudSheet;
  const layout = (state.hudLayout || []).find(e => e.name === 'inventory.png');
  let canvas = document.getElementById('inventoryCanvas');
  if (!canvas || !frame || !sheet || !layout) return;
  const f = frame.frame;
  const sss = frame.spriteSourceSize;
  // No vs factor, but scaled proportionally to the wrapper — see matching comment in
  // showCharStats(). At the default 1024x576 wrapper this matches the hud-position-tool
  // exactly (wrapperScale = 1); in fullscreen it grows/repositions with the wrapper
  // instead of staying pinned at its small windowed-mode pixel position.
  const wrapperScale = state.viewW / 1024;
  const s = layout.scale * wrapperScale;
  const dw = sss.w * s;
  const dh = sss.h * s;
  canvas.width = dw;
  canvas.height = dh;
  canvas.style.width = dw + 'px';
  canvas.style.height = dh + 'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dw, dh);
  // Same fix as showCharStats(): don't re-apply the trim offset inside the canvas —
  // the panel div's left/top below already accounts for it, so draw at (0,0) to fill
  // the canvas exactly instead of pushing the art past its edge and clipping it.
  ctx.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, dw, dh);
  const panelLeft = (layout.x + sss.x * layout.scale) * wrapperScale;
  const panelTop = (layout.y + sss.y * layout.scale) * wrapperScale;
  $.inventoryPanel.style.width = dw + 'px';
  $.inventoryPanel.style.height = dh + 'px';
  $.inventoryPanel.style.left = panelLeft + 'px';
  $.inventoryPanel.style.top = panelTop + 'px';
  renderInventorySlots(panelLeft, panelTop, wrapperScale);
}

export function hideInventory() {
  $.inventoryPanel.classList.add('hidden');
  hideItemTooltip();
}

// Friendly labels for item stat keys shown in the hover tooltip. Anything not
// listed here still shows (falls back to the raw key) so new stats on future
// items don't silently disappear from the tooltip.
const STAT_LABELS = {
  attackDmg: 'Attack Dmg', attackSpeed: 'Attack Speed', speed: 'Speed',
  maxHealth: 'Max HP', maxEnergy: 'Max Energy', turnSpeed: 'Turn Speed', defense: 'Defense',
  fortune: 'Fortune'
};

function formatStatValue(key, v) {
  if (key === 'attackSpeed') {
    // Items store attackSpeed as a raw delta to the attack-cooldown in ms
    // (lower ms = faster, so a good bonus like wooden_sword's is negative).
    // Char Stats doesn't show raw ms though — its "Attack Rate" row shows
    // 600/cooldownMs as an "x" multiplier (see infoFmt in showCharStats()).
    // Convert to that same unit here so the tooltip number matches what the
    // player actually sees move on that panel when they equip/unequip the
    // item: base 800ms -> 0.75x, wooden_sword's -200ms -> 600ms -> 1.00x,
    // a +0.25 change.
    const base = BASE_STATS.attackSpeed || 800;
    const delta = Math.round(((600 / (base + v)) - (600 / base)) * 100) / 100;
    return (delta > 0 ? '+' : '') + delta.toFixed(2);
  }
  return v > 0 ? '+' + v : String(v);
}

// Rolled-attribute display, e.g. "Attack Damage" / "+5" for a flat roll, or
// "Scaling Armor" / "+0.30/lvl" for a scaling one — scaling attributes get a
// "Scaling " prefix on the label instead of "Attack Damage", and a "/lvl"
// suffix on the value instead of appending "per Player Level" after the
// number. Mirrors server/item-generator.js's formatItemAttribute() but
// reuses formatStatValue's attackSpeed conversion above so a rolled
// attackSpeed roll shows in the exact unit the player sees everywhere else
// (Char Stats' Attack Rate row, base-item tooltips) — kept in sync with the
// server's version by both reading the same ITEM_ATTRIBUTES data, not by
// sharing code across the client/server boundary.
function formatItemAttribute(attribute) {
  const attrDef = ITEM_ATTRIBUTES[attribute.attributeId];
  if (!attrDef) return { label: attribute.attributeId, value: String(attribute.value) };
  const scaling = attrDef.mode === 'scaling';
  const value = attrDef.stat === 'attackSpeed'
    ? formatStatValue('attackSpeed', attribute.value)
    : (attribute.value > 0 ? '+' + attribute.value : String(attribute.value));
  const label = (scaling ? 'Scaling ' : '') + attrDef.displayName;
  return { label, value: scaling ? value + '/lvl' : value };
}

// Builds the shared inner HTML for both the inventory-slot tooltip
// (showItemTooltip) and the world-drop tooltip (showDropTooltip) —
// itemOrInstance is either a plain base-item-id string (starter gear, shows
// its static ITEMS[id].stats) or a full rolled instance (shows its rarity
// name/color + rolled attributes instead). `includeIcon` adds the
// icon-wrapper header the drop tooltip needs but the slot tooltip doesn't
// (a slot already shows the icon itself).
function buildItemTooltipHtml(itemOrInstance, { includeIcon = false } = {}) {
  const baseId = resolveBaseItemId(itemOrInstance);
  const itemDef = ITEMS[baseId];
  if (!itemDef) return null;
  const rolled = isRolledInstance(itemOrInstance);
  const rarity = rolled ? getRarityDef(itemOrInstance.rarityId) : null;
  const nameStyle = rarity ? ' style="color:' + rarity.color + '"' : '';
  const nameText = (rarity ? rarity.name + ' ' : '') + itemDef.name;
  const header = includeIcon
    ? '<div class="tooltip-header"><div class="tooltip-icon-wrap"></div><div class="tooltip-name"' + nameStyle + '>' + nameText + '</div></div>'
    : '<div class="tooltip-name"' + nameStyle + '>' + nameText + '</div>';
  const rows = rolled
    ? itemOrInstance.attributes.map(formatItemAttribute)
    : Object.entries(itemDef.stats || {}).map(([key, val]) => ({ label: STAT_LABELS[key] || key, value: formatStatValue(key, val) }));
  const statsHtml = rows.length === 0
    ? '<div class="tooltip-stat"><span>No bonuses</span></div>'
    : rows.map(r => '<div class="tooltip-stat"><span>' + r.label + '</span><span>' + r.value + '</span></div>').join('');
  return header + statsHtml;
}

function showItemTooltip(itemOrInstance, evt) {
  if (!$.itemTooltip) return;
  const html = buildItemTooltipHtml(itemOrInstance);
  if (!html) return;
  $.itemTooltip.innerHTML = html;
  $.itemTooltip.classList.remove('hidden');
  positionItemTooltip(evt);
}

// Positioned relative to #wrapper (not #inventoryPanel) — see the comment on
// #itemTooltip in index.html for why. Allowed to extend past the panel's
// bottom edge on purpose (no clamping vertically); the only clamp is
// horizontal: if the tooltip would run off the right edge of the wrapper, it
// flips to the left of the cursor instead of getting cut off/overflowing the
// window.
function positionItemTooltip(evt) {
  if (!$.itemTooltip || $.itemTooltip.classList.contains('hidden') || !$.wrapper) return;
  const wrapperRect = $.wrapper.getBoundingClientRect();
  const tw = $.itemTooltip.offsetWidth;
  let left = evt.clientX - wrapperRect.left + 14;
  if (evt.clientX + tw + 14 > wrapperRect.right) {
    left = evt.clientX - wrapperRect.left - tw - 14;
  }
  $.itemTooltip.style.left = left + 'px';
  $.itemTooltip.style.top = (evt.clientY - wrapperRect.top + 14) + 'px';
}

function hideItemTooltip() {
  if ($.itemTooltip) $.itemTooltip.classList.add('hidden');
}

// World item-drop hover tooltip (input.js's mousemove hit-tests drops via
// hitTestItemDrop() and calls these). Separate from showItemTooltip/etc.
// above because #dropTooltip lives directly in #wrapper rather than nested
// inside #inventoryPanel — it has to work while the inventory panel is
// closed, since that's the whole point (looking at loot lying in the world).
// Also shows an icon (the slot tooltip doesn't need one — the slot itself
// already shows the icon).
export function showDropTooltip(itemOrInstance, evt) {
  if (!$.dropTooltip) return;
  const html = buildItemTooltipHtml(itemOrInstance, { includeIcon: true });
  if (!html) return;
  $.dropTooltip.innerHTML = html;
  const iconWrap = $.dropTooltip.querySelector('.tooltip-icon-wrap');
  if (iconWrap) drawItemIcon(iconWrap, itemOrInstance, 32, 32);
  $.dropTooltip.classList.remove('hidden');
  positionDropTooltip(evt);
}

export function positionDropTooltip(evt) {
  if (!$.dropTooltip || $.dropTooltip.classList.contains('hidden') || !$.wrapper) return;
  const wrapperRect = $.wrapper.getBoundingClientRect();
  $.dropTooltip.style.left = (evt.clientX - wrapperRect.left + 14) + 'px';
  $.dropTooltip.style.top = (evt.clientY - wrapperRect.top + 14) + 'px';
}

export function hideDropTooltip() {
  if ($.dropTooltip) $.dropTooltip.classList.add('hidden');
}

// Draws an item's flat icon (ITEM_ICONS[baseItemId]) into a canvas sized to
// fill the slot. Returns true if it drew something, false if there's no icon
// art yet for this item (caller should fall back to a text label).
// itemOrInstance is either a plain base-item-id string or a rolled instance.
function drawItemIcon(container, itemOrInstance, w, h) {
  const icon = ITEM_ICONS[resolveBaseItemId(itemOrInstance)];
  if (!icon) return false;
  const sheet = state[icon.sheet + 'Sheet'];
  const frames = state[icon.sheet + 'Frames'];
  const frame = frames && frames[icon.frame];
  if (!sheet || !frame || !sheet.complete) return false;
  const canvas = document.createElement('canvas');
  canvas.className = 'slot-item-icon';
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const f = frame.frame;
  ctx.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, w, h);
  container.appendChild(canvas);
  return true;
}

// Converts a hud-layout.json slot def's name into the location shape the
// server understands (see moveItem in server/player.js) — 'weapon' is
// special-cased to currentItem there too, everything else in ITEM_SLOTS lives
// on p.equipment, and InvSlotN maps to bag index N-1.
function slotLocation(def) {
  if (def.name === 'EquipWeapon') return { kind: 'equip', slot: 'weapon' };
  if (def.name.startsWith('Equip')) return { kind: 'equip', slot: def.name.replace('Equip', '').toLowerCase() };
  return { kind: 'bag', index: parseInt(def.name.replace('InvSlot', ''), 10) - 1 };
}

function getItemAtLocationClient(me, loc) {
  if (!me || !loc) return null;
  if (loc.kind === 'equip') {
    if (loc.slot === 'weapon') return me.currentItem || null;
    return (me.equipment && me.equipment[loc.slot]) || null;
  }
  return (me.inventorySlots && me.inventorySlots[loc.index]) || null;
}

// --- Drag-and-drop between slots -------------------------------------------
// Deliberately no optimistic client-side move: mousedown/mouseup just tell
// the server what was attempted (moveItem event), and the next playerInfo
// broadcast (always sent whether the server accepted the move or not) drives
// the re-render — see the showInventory() call in net-events.js's playerInfo
// handler. An invalid drag (wrong item type/class, occupied destination)
// results in an unchanged playerInfo, so the item silently snaps back — no
// rollback logic needed.
let dragState = null; // { itemId, fromLoc, fromEl, ghost, w, h }
let dragActive = false; // suppresses hover tooltips while dragging

function createDragGhost(itemId, w, h) {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = w + 'px';
  ghost.style.height = h + 'px';
  if (!drawItemIcon(ghost, itemId, w, h)) {
    const label = document.createElement('div');
    label.className = 'slot-item-label';
    const itemDef = ITEMS[resolveBaseItemId(itemId)];
    label.textContent = itemDef ? itemDef.name : resolveBaseItemId(itemId);
    if (isRolledInstance(itemId)) {
      const rarity = getRarityDef(itemId.rarityId);
      if (rarity) label.style.color = rarity.color;
    }
    ghost.appendChild(label);
  }
  document.body.appendChild(ghost);
  return ghost;
}

function positionGhost(ghost, clientX, clientY, w, h) {
  ghost.style.left = (clientX - w / 2) + 'px';
  ghost.style.top = (clientY - h / 2) + 'px';
}

function onDragMove(evt) {
  if (!dragState) return;
  positionGhost(dragState.ghost, evt.clientX, evt.clientY, dragState.w, dragState.h);
}

function onDragEnd(evt) {
  if (!dragState) return;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
  const { fromLoc, fromEl, ghost } = dragState;
  ghost.remove();
  fromEl.classList.remove('slot-dragging');
  dragActive = false;
  dragState = null;
  const targetEl = document.elementFromPoint(evt.clientX, evt.clientY)?.closest('.inv-slot, .equip-slot');
  if (targetEl && targetEl !== fromEl && targetEl._loc && window.socket) {
    window.socket.emit('moveItem', { from: fromLoc, to: targetEl._loc });
  }
}

function startDrag(el, loc, itemId, evt) {
  if (evt.button !== 0) return;
  evt.preventDefault();
  hideItemTooltip();
  dragActive = true;
  const rect = el.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const ghost = createDragGhost(itemId, w, h);
  positionGhost(ghost, evt.clientX, evt.clientY, w, h);
  el.classList.add('slot-dragging');
  dragState = { itemId, fromLoc: loc, fromEl: el, ghost, w, h };
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
}

// Draws the 16 bag slots + 5 equipment slots on top of inventory.png. Positions
// come from the type:'slot' entries in hud-layout.json (edited via
// Workflow/hud-position-tool.html — same global 1024x576 coordinate space as
// every other HUD element, so they're placed with wrapperScale exactly like the
// panel itself and stay locked to the art at any window size).
//
// Occupied slots draw the item's icon (ITEM_ICONS in game-data.js) if one
// exists, otherwise fall back to the item's name as text — most items won't
// have art yet. Borders are debug-only (J key / state.showHudDebug) since the
// slot art is already baked into inventory.png. Every slot (empty or not) is
// a valid drop *target* — see startDrag/onDragEnd above — but only occupied
// slots can start a drag.
function renderInventorySlots(panelLeft, panelTop, wrapperScale) {
  const layer = document.getElementById('inventorySlotsLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const me = state.players[state.myId];
  const slotDefs = (state.hudLayout || []).filter(e => e.type === 'slot');
  for (const def of slotDefs) {
    const el = document.createElement('div');
    const isEquip = def.name.startsWith('Equip');
    el.className = (isEquip ? 'equip-slot' : 'inv-slot') + (state.showHudDebug ? ' slot-debug' : '');
    const w = def.w * (def.scale || 1) * wrapperScale;
    const h = def.h * (def.scale || 1) * wrapperScale;
    el.style.left = (def.x * wrapperScale - panelLeft) + 'px';
    el.style.top = (def.y * wrapperScale - panelTop) + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    const loc = slotLocation(def);
    el._loc = loc;
    const itemId = getItemAtLocationClient(me, loc);
    if (itemId) {
      el.classList.add('slot-occupied');
      const drewIcon = drawItemIcon(el, itemId, w, h);
      if (!drewIcon) {
        // No art shipped for this item yet — show its name as text instead,
        // colored by rarity if this is a rolled instance (see
        // buildItemTooltipHtml for the same convention in the tooltip).
        const label = document.createElement('div');
        label.className = 'slot-item-label';
        const itemDef = ITEMS[resolveBaseItemId(itemId)];
        label.textContent = itemDef ? itemDef.name : resolveBaseItemId(itemId);
        if (isRolledInstance(itemId)) {
          const rarity = getRarityDef(itemId.rarityId);
          if (rarity) label.style.color = rarity.color;
        }
        el.appendChild(label);
      }
      el.addEventListener('mouseenter', (evt) => { if (!dragActive) showItemTooltip(itemId, evt); });
      el.addEventListener('mousemove', (evt) => { if (!dragActive) positionItemTooltip(evt); });
      el.addEventListener('mouseleave', hideItemTooltip);
      el.addEventListener('mousedown', (evt) => startDrag(el, loc, itemId, evt));
    } else if (loc.kind === 'equip' && loc.slot === 'weapon') {
      // Empty weapon slot on a knight means the unarmed fist state — label it
      // so it's clear that's an intentional state, not a missing item.
      const label = document.createElement('div');
      label.className = 'slot-item-label';
      label.textContent = 'Unarmed';
      el.appendChild(label);
    }
    layer.appendChild(el);
  }
}

function compute16x9(containerW, containerH) {
  let w = containerW;
  let h = Math.round(w / 16 * 9);
  if (h > containerH) {
    h = containerH;
    w = Math.round(h * 16 / 9);
  }
  return { w, h };
}
