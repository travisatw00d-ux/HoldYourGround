import { state } from './state.js';
import { resetWavePopup } from './next-wave-popup.js';
import { stopRender } from './render.js';
import { ITEMS, ITEM_ICONS, BASE_STATS, ITEM_RARITIES, ITEM_ATTRIBUTES, formatCurrencyHtml } from './game-data.js';

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
  masterChestPanel: document.getElementById('masterChestPanel'),
  masterChestClose: document.getElementById('masterChestClose'),
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
  state.currencyBronze = data.account.currencyBronze || 0;

  $.usernameInput.value = '';
  $.passwordInput.value = '';
  $.displayNameInput.value = '';
  $.errorMsg.textContent = '';

  $.welcomeMsg.textContent = 'Welcome back, ' + data.account.displayName + '!';
  // innerHTML (not textContent) — formatCurrencyHtml() wraps each
  // denomination in a colored <span>, per Travis's color-coding request.
  $.accountStats.innerHTML = 'Level ' + data.account.level + ' | Exp ' + data.account.exp + '/' + data.account.expToNext + ' | ' + formatCurrencyHtml(data.account.currencyBronze || 0);

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

// --- Dynamic layout for the three "primary" panels --------------------------
// (inventory, master chest, char stats — 2026-07-14)
//
// Normally each of these three panels sits at its own fixed default
// position/scale straight from hud-layout.json (staticPanelGeom below).
// Special case per Travis: whenever Char Stats is open ALONGSIDE at least
// one of the other two, all currently-open panels among these three shrink
// and line up left-to-right — chest, Char Stats, inventory, skipping
// whichever of chest/inventory is closed — so they all fit side-by-side
// across the full screen width at once, Char Stats in the middle. Closing
// Char Stats instantly reverts inventory/chest to their normal static
// default sizes (the existing half-screen-each layout); Char Stats opened
// alone (neither of the other two open) also just uses its own static
// default, since nothing else is competing for room.
//
// Explicitly scoped to just these 3 panels for now, not a generic system for
// every popup — Travis flagged that as future work ("I think we should
// probably make all the windows that pop up do this... but for now, let's do
// this and the functionality of the primary tabs").
//
// The shrink-to-fit width is solved from each open panel's own art aspect
// ratio, not literal equal-width columns — Stats.png is a tall narrow
// portrait rectangle while inventory.png/mctab.png are short and wide, so
// equal columns would either squish Char Stats sideways or leave the other
// two wastefully narrow. Instead we solve for ONE shared height H such that
// the SUM of each open panel's natural width at that height exactly fills
// the 1024-logical-unit layout space — every panel keeps its own native
// proportions and just "shrinks down just enough" (Travis's words) for all
// of them to fit together.
const PRIMARY_PANEL_FRAMES = {
  chest: 'mctab.png',
  charStats: 'Stats.png',
  inventory: 'inventory.png',
};

// A panel's default (un-shrunk) geometry, straight from its hud-layout.json
// background entry, in screen-pixel space (already multiplied by
// wrapperScale) — exactly what showInventory()/showMasterChest()/
// showCharStats() used to compute inline before this feature existed. Also
// serves as the FRACTION BASELINE every slot position gets remapped against
// (see positionSlotEl below) so slots stay correctly aligned to the art at
// ANY panel size, shrunk or not — a slot's offset as a fraction of the
// panel's own width/height is scale-invariant as long as the panel's art is
// always scaled uniformly (never stretched), which is true here.
function staticPanelGeom(frameName) {
  const fd = state.hudFrames?.[frameName];
  const layout = (state.hudLayout || []).find(e => e.name === frameName);
  if (!fd || !layout) return null;
  const sss = fd.spriteSourceSize;
  const wrapperScale = state.viewW / 1024;
  const s = layout.scale * wrapperScale;
  return {
    dw: sss.w * s,
    dh: sss.h * s,
    panelLeft: (layout.x + sss.x * layout.scale) * wrapperScale,
    panelTop: (layout.y + sss.y * layout.scale) * wrapperScale,
  };
}

// Computes the geometry each of the 3 primary panels should render at RIGHT
// NOW, given which of them are currently open — either each one's normal
// static default (staticPanelGeom above), or the shared shrink-to-fit layout
// described above. Returns { chest, charStats, inventory }, each either null
// (panel closed) or {dw, dh, panelLeft, panelTop} in screen-pixel space.
function computePanelLayouts() {
  const chestOpen = !!($.masterChestPanel && !$.masterChestPanel.classList.contains('hidden'));
  const invOpen = !!($.inventoryPanel && !$.inventoryPanel.classList.contains('hidden'));
  const csOpen = !!($.charStatsPanel && !$.charStatsPanel.classList.contains('hidden'));

  const result = { chest: null, charStats: null, inventory: null };
  if (!csOpen) {
    if (chestOpen) result.chest = staticPanelGeom(PRIMARY_PANEL_FRAMES.chest);
    if (invOpen) result.inventory = staticPanelGeom(PRIMARY_PANEL_FRAMES.inventory);
    return result;
  }
  if (!chestOpen && !invOpen) {
    result.charStats = staticPanelGeom(PRIMARY_PANEL_FRAMES.charStats);
    return result;
  }

  // Shrink-to-fit mode: chest, Char Stats, inventory left to right, skipping
  // whichever of chest/inventory is closed.
  const order = [];
  if (chestOpen) order.push('chest');
  order.push('charStats');
  if (invOpen) order.push('inventory');

  const wrapperScale = state.viewW / 1024;
  let aspectSum = 0;
  const sssByKey = {};
  for (const key of order) {
    const fd = state.hudFrames?.[PRIMARY_PANEL_FRAMES[key]];
    if (!fd) return result; // art not loaded yet — bail, static defaults apply next call
    sssByKey[key] = fd.spriteSourceSize;
    aspectSum += sssByKey[key].w / sssByKey[key].h;
  }
  const H = 1024 / aspectSum; // logical units (pre-wrapperScale)
  const panelTop = ((576 - H) / 2) * wrapperScale;

  let cursorXLogical = 0;
  for (const key of order) {
    const sss = sssByKey[key];
    const dwLogical = H * (sss.w / sss.h);
    result[key] = {
      dw: dwLogical * wrapperScale,
      dh: H * wrapperScale,
      panelLeft: cursorXLogical * wrapperScale,
      panelTop,
    };
    cursorXLogical += dwLogical;
  }
  return result;
}

// Draws a panel's background art + positions its wrapper div at the given
// geometry (either a staticPanelGeom() default or a shrink-to-fit entry from
// computePanelLayouts() above) — shared by showInventory()/showMasterChest()/
// renderCharStatsContent() so all three go through identical draw logic
// regardless of which mode picked their geometry. Returns false (does
// nothing) if the art isn't loaded yet or geom is null (panel not open).
function drawPanelArt(frameName, panelEl, canvas, geom) {
  const fd = state.hudFrames?.[frameName];
  const sheet = state.hudSheet;
  if (!fd || !sheet || !canvas || !panelEl || !geom) return false;
  const { dw, dh, panelLeft, panelTop } = geom;
  canvas.width = dw;
  canvas.height = dh;
  canvas.style.width = dw + 'px';
  canvas.style.height = dh + 'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dw, dh);
  const f = fd.frame;
  ctx.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, dw, dh);
  panelEl.style.width = dw + 'px';
  panelEl.style.height = dh + 'px';
  panelEl.style.left = panelLeft + 'px';
  panelEl.style.top = panelTop + 'px';
  return true;
}

// Positions a single type:'slot' hud-layout entry within its panel at the
// panel's CURRENT geometry (which may be its static default, or a
// shrink-to-fit size from computePanelLayouts()) by converting the slot's
// authored position/size into a FRACTION of the panel's STATIC default
// bounds, then re-applying that same fraction to whatever geometry is
// passed in — see the comment on staticPanelGeom above for why this stays
// correct at any panel size. Returns the computed {left, top, width, height}
// numbers (in px) so callers that need raw pixel sizes (e.g. to size an icon
// canvas) don't have to re-parse them back out of el.style.
function positionSlotEl(el, def, staticGeom, geom) {
  const wrapperScale = state.viewW / 1024;
  const w = def.w * (def.scale || 1);
  const h = def.h * (def.scale || 1);
  const fracX = (def.x * wrapperScale - staticGeom.panelLeft) / staticGeom.dw;
  const fracY = (def.y * wrapperScale - staticGeom.panelTop) / staticGeom.dh;
  const fracW = (w * wrapperScale) / staticGeom.dw;
  const fracH = (h * wrapperScale) / staticGeom.dh;
  const left = fracX * geom.dw;
  const top = fracY * geom.dh;
  const width = fracW * geom.dw;
  const height = fracH * geom.dh;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = width + 'px';
  el.style.height = height + 'px';
  return { left, top, width, height };
}

// Central re-layout for the three primary panels — called by every show*/
// hide* below, since opening or closing ANY of the three can change how the
// OTHERS need to be sized (see computePanelLayouts() for the rules). Draws/
// positions whichever panels are currently open at their freshly-computed
// geometry; panels that are closed are left alone (already hidden via CSS).
function refreshPrimaryPanelLayout() {
  const layouts = computePanelLayouts();

  if (layouts.chest) {
    const canvas = document.getElementById('masterChestCanvas');
    if (drawPanelArt(PRIMARY_PANEL_FRAMES.chest, $.masterChestPanel, canvas, layouts.chest)) {
      renderMasterChestSlots(layouts.chest);
    }
  }

  if (layouts.inventory) {
    const canvas = document.getElementById('inventoryCanvas');
    if (drawPanelArt(PRIMARY_PANEL_FRAMES.inventory, $.inventoryPanel, canvas, layouts.inventory)) {
      renderInventorySlots(layouts.inventory);
    }
  }

  if (layouts.charStats) {
    renderCharStatsContent(layouts.charStats);
  }
}

export function showCharStats() {
  $.charStatsPanel.classList.remove('hidden');
  refreshPrimaryPanelLayout();
}

// Builds the Char Stats panel's art + text content at the given geometry —
// called from refreshPrimaryPanelLayout() above (normal open/close/reflow)
// and also indirectly whenever the underlying stat data changes while the
// panel's already open (net-events.js's playerInfo handler, the stat-point
// spend click handler below both just call showCharStats() again, same
// convention as before this refactor).
function renderCharStatsContent(geom) {
  const me = state.players[state.myId];
  const el = $.charStatsContent;
  const canvas = document.getElementById('charStatsCanvas');
  if (!el || !canvas) return;
  if (!me) { el.innerHTML = '<div style="text-align:center;opacity:0.5">Not in game</div>'; return; }

  const staticGeom = staticPanelGeom(PRIMARY_PANEL_FRAMES.charStats);
  if (drawPanelArt(PRIMARY_PANEL_FRAMES.charStats, $.charStatsPanel, canvas, geom)) {
    // #charStatsCanvas and #charStatsContent are siblings (not nested inside
    // a shared content wrapper like inventory's #inventoryContent), so the
    // canvas needs explicit absolute positioning to sit behind the text
    // layer instead of pushing it down in normal document flow.
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
  }

  // Text scales with BOTH the usual viewport-legibility factor (ws) and how
  // much smaller than its own static default this render is (shrinkFactor,
  // 1.0 outside shrink-to-fit mode) — otherwise shrinking the panel's ART
  // without also shrinking its TEXT would overflow the now-smaller box.
  const ws = state.viewW / 1024;
  const shrinkFactor = staticGeom ? geom.dw / staticGeom.dw : 1;
  el.style.fontSize = Math.max(7, 13 * ws * shrinkFactor) + 'px';
  el.style.lineHeight = (20 * ws * shrinkFactor) + 'px';
  el.style.padding = `${8 * ws * shrinkFactor}px ${16 * ws * shrinkFactor}px`;
  const pts = state.statPoints || 0;
  const build = (state.playerMeta[state.myId] && state.playerMeta[state.myId].playerBuild) || 'standard';
  const buildDisplay = { standard: 'Standard', glassCannon: 'Glass Cannon', tank: 'Tank' };
  let html = '';
  html += '<div class="char-stat-row" style="color:var(--accent);font-weight:700"><span>Points to Spend</span><span>' + pts + '</span></div>';
  html += '<div class="char-stat-row" style="opacity:0.5"><span>Build</span><span>' + (buildDisplay[build] || build) + '</span></div>';
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Player</span><span class="char-stat-value">' + (me.name || '—') + '</span></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Level</span><span class="char-stat-value">' + (state.level || 1) + '</span></div>';
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">EXP</span><span class="char-stat-value">' + state.exp + ' / ' + state.expToNext + '</span></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Currency</span><span class="char-stat-value">' + formatCurrencyHtml(state.currencyBronze || 0) + '</span></div>';
  html += '<div class="char-stat-row"><span class="char-stat-label">Kills</span><span class="char-stat-value">' + (me.kills || 0) + '</span></div>';
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  const spendable = ['maxHealth', 'maxEnergy', 'speed', 'attackDmg'];
  const labels = { maxHealth: 'Max HP', maxEnergy: 'Max Energy', speed: 'Speed', attackDmg: 'Attack Dmg' };
  const fmt = { maxHealth: v => roundStat(v), maxEnergy: v => roundStat(v), speed: v => roundStat(v), attackDmg: v => roundStat(v) };
  for (const s of spendable) {
    const val = me[s] || ((s === 'maxHealth' || s === 'maxEnergy') ? 100 : 0);
    html += '<div class="char-stat-row" style="cursor:pointer" data-stat="' + s + '">';
    html += '<span class="char-stat-label">' + labels[s] + '</span>';
    html += '<span class="char-stat-value">' + (fmt[s] ? fmt[s](val) : val) + (pts > 0 ? ' <span class="stat-plus" style="opacity:0.6">[+]</span>' : '') + '</span>';
    html += '</div>';
  }
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin:6px 0"></div>';
  // defense/fortune added 2026-07-11, luck added 2026-07-12, healthRegen
  // added 2026-07-12, so equipping rolled-attribute drops (armor/fortune/
  // luck/healthRegen attributes — see item-generation-system.md) has a
  // visible effect somewhere; all four default to 0 (no bonus) rather than
  // a base-stat fallback since none has a nonzero baseline like
  // attackSpeed/turnSpeed. (Speed itself isn't listed here — it's already
  // shown above in the spendable-stats block, which reads me.speed
  // directly and already reflects equipped speedFlat/speedScaling bonuses.)
  const infoLabels = { attackSpeed: 'Attack Rate', turnSpeed: 'Turn Rate', defense: 'Armor', fortune: 'Fortune', luck: 'Luck', healthRegen: 'Health Regen' };
  const infoFmt = { attackSpeed: v => (600 / v).toFixed(2) + 'x', turnSpeed: v => (v / 12).toFixed(2) + 'x', healthRegen: v => v.toFixed(1) + '/s', defense: v => roundStat(v), fortune: v => roundStat(v), luck: v => roundStat(v) };
  for (const s of ['attackSpeed', 'turnSpeed', 'defense', 'fortune', 'luck', 'healthRegen']) {
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
  refreshPrimaryPanelLayout();
}

export function showInventory() {
  $.inventoryPanel.classList.remove('hidden');
  refreshPrimaryPanelLayout();
}

export function hideInventory() {
  $.inventoryPanel.classList.add('hidden');
  hideItemTooltip();
  hoveredSlotLoc = null;
  refreshPrimaryPanelLayout();
}

// Master chest panel (2026-07-14) — same draw pattern as showInventory()
// above (canvas positioned via the frame's spriteSourceSize trim offset,
// scaled by wrapperScale), just using the mctab.png frame/layout entry and a
// separate slot layer. Its default hud-layout.json position/scale is
// deliberately smaller and to the left of inventory.png's, not on top of it,
// since (2026-07-14, drag-in day) the two are meant to always be open
// together — see the show/hide pairing below.
//
// Paired with the inventory panel (2026-07-14, per Travis: "there's
// essentially no purpose to the master chest unless you're moving things in
// and out of it into your inventory") — opening the chest always opens the
// bag alongside it, and closing the chest (by ANY route: the E-key toggle in
// input.js, the walk-away auto-close in render.js, Escape in game.js, or
// clicking the chest's own close button) always closes the bag too. This is
// deliberately one-directional: closing/opening the inventory on its own
// (the 'i' key, or its own close button) does NOT touch the chest — only
// the chest side drives the pairing, since the inventory is still useful on
// its own (equipping gear, viewing the bag) without the chest ever being
// relevant.
export function showMasterChest() {
  $.masterChestPanel.classList.remove('hidden');
  $.inventoryPanel.classList.remove('hidden');
  refreshPrimaryPanelLayout();
}

export function hideMasterChest() {
  $.masterChestPanel.classList.add('hidden');
  $.inventoryPanel.classList.add('hidden');
  // Same reset hideInventory() does — the chest's own slots can now hold
  // items and drive the shared hoveredSlotLoc/tooltip (2026-07-14), so
  // closing it (including the auto-close-on-walk-away in render.js) needs to
  // clear both, not just leave them pointing at slot elements about to be
  // torn down. Covers the inventory panel too since it's now always closed
  // in lockstep with the chest.
  hideItemTooltip();
  hoveredSlotLoc = null;
  refreshPrimaryPanelLayout();
}

// Friendly labels for item stat keys shown in the hover tooltip. Anything not
// listed here still shows (falls back to the raw key) so new stats on future
// items don't silently disappear from the tooltip.
const STAT_LABELS = {
  attackDmg: 'Attack Dmg', attackSpeed: 'Attack Speed', speed: 'Speed',
  maxHealth: 'Max HP', maxEnergy: 'Max Energy', turnSpeed: 'Turn Speed', defense: 'Defense',
  fortune: 'Fortune', luck: 'Luck', healthRegen: 'Health Regen'
};

// Caps any displayed stat number at 2 decimal places (2026-07-13, per
// Travis — repeatedly summing small float increments, e.g. speed's
// per-stat-point +0.03/+0.05, can drift into results like
// 100.23570000000001 due to normal binary floating-point imprecision; that
// exact/raw value is fine to keep internally, it's just never okay to SHOW
// it). `Number(v.toFixed(2))` rounds to at most 2 decimals AND drops
// trailing zeros by converting back to a number (100 stays "100", not
// "100.00"; 13.09 stays "13.09", not "13.090000000000002"). Every place
// that renders a raw player/item stat number — Char Stats' spendable rows,
// its info rows (defense/fortune/luck), and this tooltip formatter — should
// route through this rather than interpolating the number directly.
function roundStat(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  return Number(v.toFixed(2));
}

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
  const rounded = roundStat(v);
  return rounded > 0 ? '+' + rounded : String(rounded);
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
    : (attribute.value > 0 ? '+' + roundStat(attribute.value) : String(roundStat(attribute.value)));
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
  // Rolled instances at Rare+ carry a server-computed generatedName (e.g.
  // "Basic Ring of Greater Attack Damage" — see item-generation-system.md's
  // stacking section); Common/Uncommon instances and plain starter-gear
  // strings fall back to the plain base item name.
  const displayName = (rolled && itemOrInstance.generatedName) ? itemOrInstance.generatedName : itemDef.name;
  const nameText = (rarity ? rarity.name + ' ' : '') + displayName;
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
  // Gold coins (2026-07-13) aren't an ITEMS entry — buildItemTooltipHtml()
  // would return null for them (no itemDef to look up) — so they get their
  // own small, bespoke tooltip body instead: just an icon + amount, no name/
  // rarity/stat rows since there's nothing like that to show.
  if (itemOrInstance && itemOrInstance.kind === 'gold') {
    const amount = itemOrInstance.amount || 0;
    $.dropTooltip.innerHTML =
      '<div class="tooltip-header"><div class="tooltip-icon-wrap"></div><div class="tooltip-name">' + formatCurrencyHtml(amount) + '</div></div>';
    const iconWrap = $.dropTooltip.querySelector('.tooltip-icon-wrap');
    if (iconWrap) drawGoldIcon(iconWrap, 32, 32);
    $.dropTooltip.classList.remove('hidden');
    positionDropTooltip(evt);
    return;
  }
  const html = buildItemTooltipHtml(itemOrInstance, { includeIcon: true });
  if (!html) return;
  $.dropTooltip.innerHTML = html;
  const iconWrap = $.dropTooltip.querySelector('.tooltip-icon-wrap');
  if (iconWrap) drawItemIcon(iconWrap, itemOrInstance, 32, 32);
  $.dropTooltip.classList.remove('hidden');
  positionDropTooltip(evt);
}

// Master chest world-hover tooltip (2026-07-14) — same #dropTooltip element/
// positioning as showDropTooltip above (works while the inventory/chest
// panels are closed, follows the cursor via positionDropTooltip), just a
// bespoke body instead of an item lookup: a title + flavor description,
// same "bespoke body, no buildItemTooltipHtml()" pattern the gold-coin
// branch above uses, since the chest isn't an ITEMS entry either. Called
// from input.js's mousemove via hitTestMasterChest() — hover-only, not
// range-gated by MASTER_CHEST_RANGE, since there's nothing here that needs
// to stay hidden from a distance (unlike item drops, which don't reveal
// their contents until you're close).
export function showChestTooltip(evt) {
  if (!$.dropTooltip) return;
  $.dropTooltip.innerHTML =
    '<div class="tooltip-header"><div class="tooltip-icon-wrap"></div><div class="tooltip-name" style="color:#FFD700">Master Chest</div></div>' +
    '<div class="tooltip-desc">Deposit items here to keep them permanently on your account, across every future match.</div>';
  const iconWrap = $.dropTooltip.querySelector('.tooltip-icon-wrap');
  if (iconWrap) drawChestIcon(iconWrap, 32, 32);
  $.dropTooltip.classList.remove('hidden');
  positionDropTooltip(evt);
}

// Draws the master chest's own world sprite (MastreChest_resized.png, on
// spritesheet.png/state.spriteSheet) into a tooltip icon slot — same
// draw-into-a-sized-canvas approach as drawItemIcon/drawGoldIcon above, just
// reading from the world spritesheet instead of an item sheet.
function drawChestIcon(container, w, h) {
  const sheet = state.spriteSheet;
  const frame = state.spriteFrames?.['MastreChest_resized.png'];
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

// Draws the gold-coin icon (goldcoin.png, on ItemSheet.png/state.itemSheet —
// see assets.js) into a container. Separate from drawItemIcon() above
// because gold isn't a bag item — it has no ITEMS/ITEM_ICONS entry to look
// up (resolveBaseItemId()/ITEMS[baseId] would just return undefined for a
// {kind:'gold', amount} drop). Returns true/false the same way, in case a
// future caller wants the same text-label-fallback convention, though
// nothing currently falls back for gold (a coin drop is unusable without
// its art, so if this ever returns false the tooltip degrades to an icon-
// less block — see showDropTooltip's gold branch below).
function drawGoldIcon(container, w, h) {
  const sheet = state.itemSheet;
  const frames = state.itemFrames;
  const frame = frames && frames['goldcoin.png'];
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
// on p.equipment, InvSlotN maps to bag index N-1, and ChestSlotN (2026-07-14)
// maps to master chest index N-1.
function slotLocation(def) {
  if (def.name === 'EquipWeapon') return { kind: 'equip', slot: 'weapon' };
  if (def.name.startsWith('Equip')) return { kind: 'equip', slot: def.name.replace('Equip', '').toLowerCase() };
  if (def.name.startsWith('ChestSlot')) return { kind: 'chest', index: parseInt(def.name.replace('ChestSlot', ''), 10) - 1 };
  return { kind: 'bag', index: parseInt(def.name.replace('InvSlot', ''), 10) - 1 };
}

function getItemAtLocationClient(me, loc) {
  if (!me || !loc) return null;
  if (loc.kind === 'equip') {
    if (loc.slot === 'weapon') return me.currentItem || null;
    return (me.equipment && me.equipment[loc.slot]) || null;
  }
  if (loc.kind === 'chest') return (me.masterChest && me.masterChest[loc.index]) || null;
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

// Tracks whichever occupied bag/equip slot the mouse is currently over, so
// input.js's 'x' keydown handler (dropHoveredItem below) knows what to drop
// without needing its own copy of the hover-tracking logic. Set/cleared by
// renderInventorySlots()'s mouseenter/mouseleave listeners below (empty
// slots never set this — there's nothing to drop). Reset defensively on
// every re-render and on hideInventory(): renderInventorySlots() rebuilds
// the slot elements from scratch on every playerInfo update while the panel
// is open, and a rebuild that happens without the mouse actually moving
// wouldn't fire a fresh mouseenter/mouseleave pair on the new elements,
// which could otherwise leave this pointing at a slot the mouse isn't
// really over anymore.
let hoveredSlotLoc = null;

// Drops whatever's in the currently-hovered slot (bag or equip) onto the
// ground at the player's position — same server-side path as dragging an
// item off the inventory window (see onDragEnd below and room.js's
// handleDropItem). No-ops if nothing is hovered/occupied.
export function dropHoveredItem(socket) {
  if (!hoveredSlotLoc || !socket) return false;
  const loc = hoveredSlotLoc;
  hoveredSlotLoc = null;
  hideItemTooltip();
  socket.emit('dropItem', { from: loc });
  return true;
}

function createDragGhost(itemId, w, h) {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = w + 'px';
  ghost.style.height = h + 'px';
  if (!drawItemIcon(ghost, itemId, w, h)) {
    const label = document.createElement('div');
    label.className = 'slot-item-label';
    const itemDef = ITEMS[resolveBaseItemId(itemId)];
    const rolled = isRolledInstance(itemId);
    label.textContent = (rolled && itemId.generatedName) ? itemId.generatedName : (itemDef ? itemDef.name : resolveBaseItemId(itemId));
    if (rolled) {
      const rarity = getRarityDef(itemId.rarityId);
      if (rarity) label.style.color = rarity.color;
    }
    ghost.appendChild(label);
  }
  document.body.appendChild(ghost);
  return ghost;
}

// Offset from the raw cursor position, not centered on it — fixed
// 2026-07-13, alongside .drag-ghost's new solid background in style.css.
// Centering the ghost exactly under the OS mouse pointer let the pointer's
// own icon (arrow/hand) sit right on top of it, which contributed to the
// ghost feeling "invisible" while dragging. A small down-right offset keeps
// it trailing clearly beside the cursor instead, same convention most
// OS/desktop drag-and-drop UIs use.
const DRAG_GHOST_OFFSET_X = 14;
const DRAG_GHOST_OFFSET_Y = 14;

function positionGhost(ghost, clientX, clientY, w, h) {
  ghost.style.left = (clientX - w / 2 + DRAG_GHOST_OFFSET_X) + 'px';
  ghost.style.top = (clientY - h / 2 + DRAG_GHOST_OFFSET_Y) + 'px';
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
  const dropTarget = document.elementFromPoint(evt.clientX, evt.clientY);
  const targetEl = dropTarget?.closest('.inv-slot, .equip-slot');
  if (targetEl && targetEl !== fromEl && targetEl._loc && window.socket) {
    window.socket.emit('moveItem', { from: fromLoc, to: targetEl._loc });
    return;
  }
  // Missed every slot. If the release point is also outside BOTH the
  // inventory panel and the master chest panel entirely (not just landing in
  // a gap between slots), treat it as "dragged the item off the window" —
  // drop it on the ground at the player's position, same server-side path as
  // the 'x' hotkey (see dropHoveredItem above, room.js's handleDropItem — if
  // fromLoc is a chest slot, that call is proximity-gated same as any other
  // chest move). A miss that's still somewhere inside #inventoryPanel or
  // #masterChestPanel (including their slots layers/close buttons) is just a
  // fumbled drag and snaps back as a no-op, same as before this feature
  // existed — there's no optimistic client update, so nothing needs rolling
  // back either way.
  const insidePanel = dropTarget && (dropTarget.closest('#inventoryPanel') || dropTarget.closest('#masterChestPanel'));
  if (!insidePanel && window.socket) {
    window.socket.emit('dropItem', { from: fromLoc });
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
function renderInventorySlots(geom) {
  const layer = document.getElementById('inventorySlotsLayer');
  if (!layer) return;
  layer.innerHTML = '';
  // Every slot element gets torn down and rebuilt below, which drops their
  // event listeners without necessarily firing a mouseleave (the mouse
  // hasn't moved, just the DOM under it changed) — reset so a stale loc
  // can't survive a rebuild; the next real mouseenter sets it fresh.
  hoveredSlotLoc = null;
  const me = state.players[state.myId];
  const staticGeom = staticPanelGeom(PRIMARY_PANEL_FRAMES.inventory);
  if (!staticGeom) return;
  // CurrencyDisplay (2026-07-13) is a type:"slot" entry so it's draggable/
  // resizable in hud-position-tool.html with zero changes to that tool (same
  // generic mechanism as every InvSlot/Equip* rectangle) — but it isn't a
  // real bag/equip location, it's a plain text readout of the player's
  // wallet. Excluded from the interactive-slot loop below (slotLocation()
  // would produce garbage for a name that isn't InvSlotN/EquipX) and handled
  // separately right after it, using the exact same panel-relative position
  // math. ChestSlot* entries are also excluded — they're type:"slot" too
  // (same hud-layout.json array), but belong to the master chest panel, not
  // this one (found 2026-07-14 while adding the dynamic-layout fraction
  // math below: this filter previously let them slip through, so this panel
  // was quietly also building 16 harmless-but-pointless empty slot elements
  // for locations that belong to a different panel entirely).
  const slotDefs = (state.hudLayout || []).filter(e => e.type === 'slot' && e.name !== 'CurrencyDisplay' && !e.name.startsWith('ChestSlot'));
  for (const def of slotDefs) {
    const el = document.createElement('div');
    const isEquip = def.name.startsWith('Equip');
    el.className = (isEquip ? 'equip-slot' : 'inv-slot') + (state.showHudDebug ? ' slot-debug' : '');
    const { width: w, height: h } = positionSlotEl(el, def, staticGeom, geom);

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
        const rolledSlot = isRolledInstance(itemId);
        label.textContent = (rolledSlot && itemId.generatedName) ? itemId.generatedName : (itemDef ? itemDef.name : resolveBaseItemId(itemId));
        if (rolledSlot) {
          const rarity = getRarityDef(itemId.rarityId);
          if (rarity) label.style.color = rarity.color;
        }
        el.appendChild(label);
      }
      el.addEventListener('mouseenter', (evt) => { hoveredSlotLoc = loc; if (!dragActive) showItemTooltip(itemId, evt); });
      el.addEventListener('mousemove', (evt) => { if (!dragActive) positionItemTooltip(evt); });
      el.addEventListener('mouseleave', () => { if (hoveredSlotLoc === loc) hoveredSlotLoc = null; hideItemTooltip(); });
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

  // Currency readout — lives inside the inventory panel per Travis ("I
  // already put a gold slot in the inventory area on the visuals"), same
  // panel-relative positioning as the bag slots above, positioned/resized
  // via hud-position-tool.html like everything else on this panel. Plain
  // text, not interactive (no drag/drop, no tooltip) — just shows the
  // current wallet total, refreshed on every inventory re-render (which
  // already fires on every playerInfo/accountUpdate while the panel's open).
  const currencyDef = (state.hudLayout || []).find(e => e.name === 'CurrencyDisplay');
  if (currencyDef) {
    const el = document.createElement('div');
    el.className = 'currency-display';
    positionSlotEl(el, currencyDef, staticGeom, geom);
    el.innerHTML = formatCurrencyHtml(state.currencyBronze || 0);
    layer.appendChild(el);
  }
}

// Draws the 16 master chest slots on top of mctab.png. Mirrors
// renderInventorySlots above almost exactly (icon lookup, hover tooltip,
// drag-start) now that drag-in is wired up (2026-07-14) — the only real
// difference is the location kind (chest vs bag) and reading from
// me.masterChest instead of me.inventorySlots. There's no "Unarmed" special
// case here since the chest has no equip slots. Every slot (empty or not) is
// a valid drop *target* (see startDrag/onDragEnd below), same as the bag;
// only occupied slots can start a drag. Server-side, moving into/out of a
// chest slot is proximity-gated (see room.js's _nearMasterChest) — the
// client doesn't duplicate that check here, an out-of-range move just comes
// back as an unchanged playerInfo and the dragged item silently snaps back,
// same "no optimistic update" convention as every other drag.
function renderMasterChestSlots(geom) {
  const layer = document.getElementById('masterChestSlotsLayer');
  if (!layer) return;
  layer.innerHTML = '';
  // Same defensive reset renderInventorySlots does — slot elements are torn
  // down/rebuilt on every re-render, which can leave hoveredSlotLoc stale if
  // the mouse didn't actually move across the rebuild.
  hoveredSlotLoc = null;
  const me = state.players[state.myId];
  const staticGeom = staticPanelGeom(PRIMARY_PANEL_FRAMES.chest);
  if (!staticGeom) return;
  const slotDefs = (state.hudLayout || []).filter(e => e.type === 'slot' && e.name.startsWith('ChestSlot'));
  for (const def of slotDefs) {
    const el = document.createElement('div');
    el.className = 'inv-slot' + (state.showHudDebug ? ' slot-debug' : '');
    const { width: w, height: h } = positionSlotEl(el, def, staticGeom, geom);

    const loc = slotLocation(def);
    el._loc = loc;
    const itemId = getItemAtLocationClient(me, loc);
    if (itemId) {
      el.classList.add('slot-occupied');
      const drewIcon = drawItemIcon(el, itemId, w, h);
      if (!drewIcon) {
        const label = document.createElement('div');
        label.className = 'slot-item-label';
        const itemDef = ITEMS[resolveBaseItemId(itemId)];
        const rolledSlot = isRolledInstance(itemId);
        label.textContent = (rolledSlot && itemId.generatedName) ? itemId.generatedName : (itemDef ? itemDef.name : resolveBaseItemId(itemId));
        if (rolledSlot) {
          const rarity = getRarityDef(itemId.rarityId);
          if (rarity) label.style.color = rarity.color;
        }
        el.appendChild(label);
      }
      el.addEventListener('mouseenter', (evt) => { hoveredSlotLoc = loc; if (!dragActive) showItemTooltip(itemId, evt); });
      el.addEventListener('mousemove', (evt) => { if (!dragActive) positionItemTooltip(evt); });
      el.addEventListener('mouseleave', () => { if (hoveredSlotLoc === loc) hoveredSlotLoc = null; hideItemTooltip(); });
      el.addEventListener('mousedown', (evt) => startDrag(el, loc, itemId, evt));
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
