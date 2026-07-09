import { state } from './state.js';
import { resetWavePopup } from './next-wave-popup.js';
import { stopRender } from './render.js';

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
