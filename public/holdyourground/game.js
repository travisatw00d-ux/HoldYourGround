import { state } from './modules/state.js';
import { connect, onRoomList, onAuthSuccess, onGuestJoined, onLobbyCount } from './modules/net.js';
import { setupInput } from './modules/input.js';
import { startRender, stopRender, resizeViewport } from './modules/render.js';

const canvas = document.getElementById('canvas');
const menu = document.getElementById('menu');
const eliminated = document.getElementById('eliminated');
const hud = document.getElementById('hud');
const authForm = document.getElementById('authForm');
const welcomePanel = document.getElementById('welcomePanel');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginMode = document.getElementById('loginMode');
const registerMode = document.getElementById('registerMode');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const displayNameInput = document.getElementById('displayNameInput');
const guestBtn = document.getElementById('guestBtn');
const lobbyCountDisplay = document.getElementById('lobbyCountDisplay');
const roomListEl = document.getElementById('roomList');
const welcomeMsg = document.getElementById('welcomeMsg');
const accountStats = document.getElementById('accountStats');
const lobbyBtn = document.getElementById('lobbyBtn');
const adminBadge = document.getElementById('adminBadge');
const joinBtn = document.getElementById('joinBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const respawnBtn = document.getElementById('respawnBtn');
const hotbarEl = document.getElementById('hotbarInventory');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsClose = document.getElementById('settingsClose');
const fullscreenToggle = document.getElementById('fullscreenToggle');
const godModeToggle = document.getElementById('godModeToggle');
const adminSettings = document.getElementById('adminSettings');
const escapeMenu = document.getElementById('escapeMenu');
const escapeStep1 = document.getElementById('escapeStep1');
const escapeStep2 = document.getElementById('escapeStep2');
const escapeReturnBtn = document.getElementById('escapeReturnBtn');
const escapeConfirmBtn = document.getElementById('escapeConfirmBtn');
const escapeCancelBtn = document.getElementById('escapeCancelBtn');
const errorMsg = document.getElementById('errorMsg');
const signInPrompt = document.getElementById('signInPrompt');
const wrapper = document.getElementById('wrapper');

let selectedRoomId = null;
let currentRooms = [];

function showScreen(id) {
  menu.classList.add('hidden');
  eliminated.classList.add('hidden');
  hud.classList.add('hidden');
  hotbarEl.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  state.screen = id;
  if (id === 'menu') menu.classList.remove('hidden');
  if (id === 'eliminated') eliminated.classList.remove('hidden');
  if (id === 'playing') { hud.classList.remove('hidden'); hotbarEl.classList.remove('hidden'); settingsBtn.classList.remove('hidden'); }
}

showScreen('menu');

function joinGame(roomId) {
  if (!state.account && !state.guestName) { signInPrompt.classList.remove('hidden'); return; }
  signInPrompt.classList.add('hidden');
  const name = state.account?.displayName || state.guestName || 'Player';
  socket.emit('join', { roomId, name });
}

function renderRoomList(rooms) {
  currentRooms = rooms || [];
  roomListEl.innerHTML = '';
  errorMsg.textContent = '';

  if (!rooms || rooms.length === 0) {
    roomListEl.innerHTML = '<div class="room-entry empty">No rooms available</div>';
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
      selectedRoomId = room.id;
      document.querySelectorAll('.room-entry').forEach(e => e.classList.remove('selected'));
      entry.classList.add('selected');
      errorMsg.textContent = '';
    });
    entry.addEventListener('dblclick', () => {
      selectedRoomId = room.id;
      joinGame(room.id);
    });
    roomListEl.appendChild(entry);
  }

  const hasEmpty = currentRooms.some(r => r.playerCount === 0);
  createRoomBtn.textContent = hasEmpty ? 'Create New Room' : 'Servers Full';
  createRoomBtn.style.opacity = hasEmpty ? '1' : '0.4';
}

const socket = connect();

function showLoginForm() {
  loginMode.classList.remove('hidden');
  registerMode.classList.add('hidden');
  errorMsg.textContent = '';
  errorMsg.classList.add('hidden');
  passwordInput.value = '';
  displayNameInput.value = '';
}

function showRegisterForm() {
  loginMode.classList.add('hidden');
  registerMode.classList.remove('hidden');
  errorMsg.textContent = '';
  errorMsg.classList.add('hidden');
  passwordInput.value = '';
}

function onAuth(data) {
  state.account = data.account;
  state.isGuest = false;
  state.guestName = null;
  state.level = data.account.level;
  state.exp = data.account.exp;
  state.expToNext = data.account.expToNext;
  state.gold = data.account.gold;

  usernameInput.value = '';
  passwordInput.value = '';
  displayNameInput.value = '';
  errorMsg.textContent = '';

  welcomeMsg.textContent = 'Welcome back, ' + data.account.displayName + '!';
  accountStats.textContent = 'Level ' + data.account.level + ' | Exp ' + data.account.exp + '/' + data.account.expToNext + ' | Gold ' + data.account.gold;

  const isAdmin = data.account.isAdmin || data.account.accountType === 'admin';
  if (isAdmin) {
    wrapper.classList.add('admin-mode');
    adminBadge.classList.remove('hidden');
    adminSettings.classList.remove('hidden');
    godModeToggle.checked = false;
  } else {
    wrapper.classList.remove('admin-mode');
    adminBadge.classList.add('hidden');
    adminSettings.classList.add('hidden');
  }

  authForm.classList.add('hidden');
  welcomePanel.classList.remove('hidden');
  signInPrompt.classList.add('hidden');
}

onAuthSuccess((data) => {
  onAuth(data);
  renderRoomList(data.rooms);
});

onGuestJoined((data) => {
  state.isGuest = true;
  state.guestName = data.name;
  state.account = null;

  usernameInput.value = '';
  passwordInput.value = '';
  displayNameInput.value = '';
  errorMsg.textContent = '';

  welcomeMsg.textContent = 'Playing as ' + data.name;
  accountStats.textContent = '';
  adminBadge.classList.add('hidden');
  adminSettings.classList.add('hidden');
  wrapper.classList.remove('admin-mode');

  authForm.classList.add('hidden');
  welcomePanel.classList.remove('hidden');
  signInPrompt.classList.add('hidden');
  renderRoomList(data.rooms);
});

onLobbyCount((count) => {
  lobbyCountDisplay.textContent = 'Lobby - ' + count;
});

onRoomList(renderRoomList);

setupInput(socket, canvas);

guestBtn.addEventListener('click', () => {
  const num = Math.floor(10000 + Math.random() * 90000);
  const name = 'Guest' + num;
  socket.emit('playAsGuest', { name });
});

showRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
showLoginBtn.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });

loginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) { errorMsg.textContent = 'Enter username and password'; return; }
  errorMsg.textContent = '';
  socket.emit('login', { username, password });
});

registerBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim() || username;
  if (!username || !password) { errorMsg.textContent = 'Enter username and password'; return; }
  errorMsg.textContent = '';
  socket.emit('register', { username, password, displayName });
});

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') passwordInput.focus();
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

joinBtn.addEventListener('click', () => {
  if (!selectedRoomId) { errorMsg.textContent = 'Select a room or start a new one'; return; }
  joinGame(selectedRoomId);
});

createRoomBtn.addEventListener('click', () => {
  if (!state.account && !state.guestName) { signInPrompt.classList.remove('hidden'); return; }
  signInPrompt.classList.add('hidden');
  const emptyRoom = currentRooms.find(r => r.playerCount === 0);
  if (!emptyRoom) { errorMsg.textContent = 'No empty servers available'; return; }
  selectedRoomId = emptyRoom.id;
  joinGame(emptyRoom.id);
});

respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
});

socket.on('godModeToggled', ({ enabled }) => {
  state.godMode = enabled;
  godModeToggle.checked = enabled;
});

godModeToggle.addEventListener('change', () => {
  socket.emit('toggleGodMode');
});

function hideEscapeMenu() {
  escapeMenu.classList.add('hidden');
  escapeStep2.classList.add('hidden');
  escapeStep1.classList.remove('hidden');
}

function showEscapeMenu() {
  escapeStep2.classList.add('hidden');
  escapeStep1.classList.remove('hidden');
  escapeMenu.classList.remove('hidden');
}

escapeReturnBtn.addEventListener('click', () => {
  escapeStep1.classList.add('hidden');
  escapeStep2.classList.remove('hidden');
});

escapeConfirmBtn.addEventListener('click', () => {
  stopRender();
  socket.emit('leaveRoom');
  hideEscapeMenu();
  eliminated.classList.add('hidden');
  menu.classList.remove('hidden');
  welcomeMsg.textContent = 'Ready For Battle?';
  state.screen = 'menu';
  selectedRoomId = null;
});

escapeCancelBtn.addEventListener('click', hideEscapeMenu);

lobbyBtn.addEventListener('click', () => {
  stopRender();
  socket.emit('leaveRoom');
  eliminated.classList.add('hidden');
  menu.classList.remove('hidden');
  welcomeMsg.textContent = 'Ready For Battle?';
  state.screen = 'menu';
  selectedRoomId = null;
});

fullscreenToggle.addEventListener('change', () => {
  if (fullscreenToggle.checked) {
    wrapper.requestFullscreen().catch(() => { fullscreenToggle.checked = false; });
  } else {
    if (document.fullscreenElement) document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    wrapper.style.width = w + 'px';
    wrapper.style.height = h + 'px';
    resizeViewport(w, h);
    fullscreenToggle.checked = true;
    socket.emit('fullscreen', { enabled: true });
    socket.emit('cameraZoom', { zoom: state.cameraZoom, viewW: state.viewW, viewH: state.viewH });
  } else {
    wrapper.style.width = '800px';
    wrapper.style.height = '600px';
    resizeViewport(800, 600);
    fullscreenToggle.checked = false;
    socket.emit('fullscreen', { enabled: false });
    socket.emit('cameraZoom', { zoom: state.cameraZoom, viewW: state.viewW, viewH: state.viewH });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.screen === 'playing') {
    e.preventDefault();
    if (escapeMenu.classList.contains('hidden')) {
      showEscapeMenu();
    } else {
      hideEscapeMenu();
    }
    return;
  }
  if (e.key === 'F11') {
    e.preventDefault();
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen().catch(() => {});
    }
  }
});

setInterval(() => {
  if (socket.connected) socket.emit('diagPing', Date.now());
}, 250);

export { socket, showScreen };
