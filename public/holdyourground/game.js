import { state } from './modules/state.js';
import { connect, onRoomList, onAuthSuccess } from './modules/net.js';
import { setupInput } from './modules/input.js';
import { startRender, stopRender, resizeViewport } from './modules/render.js';

const canvas = document.getElementById('canvas');
const menu = document.getElementById('menu');
const eliminated = document.getElementById('eliminated');
const hud = document.getElementById('hud');
const authForm = document.getElementById('authForm');
const roomListContainer = document.getElementById('roomListContainer');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginMode = document.getElementById('loginMode');
const registerMode = document.getElementById('registerMode');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const displayNameInput = document.getElementById('displayNameInput');
const joinBtn = document.getElementById('joinBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const respawnBtn = document.getElementById('respawnBtn');
const lobbyBtn = document.getElementById('lobbyBtn');
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
const wrapper = document.getElementById('wrapper');
const roomListEl = document.getElementById('roomList');
const welcomeMsg = document.getElementById('welcomeMsg');
const accountStats = document.getElementById('accountStats');
const adminBadge = document.getElementById('adminBadge');
const errorMsg = document.getElementById('errorMsg');

let selectedRoomId = null;

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
  const name = state.account?.displayName || 'Player';
  socket.emit('join', { roomId, name });
}

function renderRoomList(rooms) {
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
    entry.innerHTML = `<span class="room-name">${room.id}</span><span class="room-players">${room.playerCount}/${room.maxPlayers}</span>`;
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

onAuthSuccess((data) => {
  state.account = data.account;
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
  roomListContainer.classList.remove('hidden');
  renderRoomList(data.rooms);
});

onRoomList(renderRoomList);

setupInput(socket, canvas);

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
  const name = state.account?.displayName || 'Player';
  socket.emit('createRoom', { name });
});

respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
});

lobbyBtn.addEventListener('click', () => {
  stopRender();
  socket.emit('leaveRoom');
  eliminated.classList.add('hidden');
  menu.classList.remove('hidden');
  roomListContainer.classList.remove('hidden');
  welcomeMsg.textContent = 'Ready For Battle?';
  state.screen = 'menu';
  selectedRoomId = null;
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
});

settingsClose.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.classList.contains('hidden') &&
      !settingsPanel.contains(e.target) &&
      !settingsBtn.contains(e.target)) {
    settingsPanel.classList.add('hidden');
  }
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
  roomListContainer.classList.remove('hidden');
  welcomeMsg.textContent = 'Ready For Battle?';
  state.screen = 'menu';
  selectedRoomId = null;
});

escapeCancelBtn.addEventListener('click', hideEscapeMenu);

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
