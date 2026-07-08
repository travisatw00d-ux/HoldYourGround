import { state } from './lib/state.js';
import { connect } from './lib/net.js';
import { onRoomList, onAuthSuccess, onGuestJoined, onLobbyCount } from './lib/callback-registry.js';
import { setupInput } from './lib/input.js';
import { startRender, stopRender, resizeViewport } from './lib/render.js';
import { resetWavePopup, toggleNWPopup } from './lib/next-wave-popup.js';
import { audioInit, setMasterVolume, getMasterVolume } from './lib/audio.js';
import {
  $, showScreen, joinGame, renderRoomList,
  showLoginForm, showRegisterForm, onAuth,
  leaveToMenu, hideEscapeMenu, showEscapeMenu,
  getSelectedRoomId, getCurrentRooms
} from './lib/ui.js';

const socket = connect();

showScreen('menu');

onAuthSuccess((data) => {
  onAuth(data);
  renderRoomList(data.rooms);
});

onGuestJoined((data) => {
  state.isGuest = true;
  state.guestName = data.name;
  state.account = null;

  $.usernameInput.value = '';
  $.passwordInput.value = '';
  $.displayNameInput.value = '';
  $.errorMsg.textContent = '';

  $.welcomeMsg.textContent = 'Playing as ' + data.name;
  $.accountStats.textContent = '';
  $.adminBadge.classList.add('hidden');
  $.adminSettings.classList.add('hidden');
  $.wrapper.classList.remove('admin-mode');

  $.authForm.classList.add('hidden');
  $.welcomePanel.classList.remove('hidden');
  $.signInPrompt.classList.add('hidden');
  renderRoomList(data.rooms);
});

onLobbyCount((count) => {
  $.lobbyCountDisplay.textContent = 'Lobby - ' + count;
});

onRoomList(renderRoomList);

setupInput(socket, $.canvas);

const params = new URLSearchParams(window.location.search);
const guestName = params.get('guest');
if (guestName) {
  setTimeout(() => socket.emit('playAsGuest', { name: guestName }), 100);
}

$.guestBtn.addEventListener('click', () => {
  const num = Math.floor(10000 + Math.random() * 90000);
  const name = 'Guest' + num;
  socket.emit('playAsGuest', { name });
});

$.showRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
$.showLoginBtn.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });

$.loginBtn.addEventListener('click', () => {
  const username = $.usernameInput.value.trim();
  const password = $.passwordInput.value;
  if (!username || !password) { $.errorMsg.textContent = 'Enter username and password'; return; }
  $.errorMsg.textContent = '';
  socket.emit('login', { username, password });
});

$.registerBtn.addEventListener('click', () => {
  const username = $.usernameInput.value.trim();
  const password = $.passwordInput.value;
  const displayName = $.displayNameInput.value.trim() || username;
  if (!username || !password) { $.errorMsg.textContent = 'Enter username and password'; return; }
  $.errorMsg.textContent = '';
  socket.emit('register', { username, password, displayName });
});

$.usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $.passwordInput.focus();
});

$.passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $.loginBtn.click();
});

$.joinBtn.addEventListener('click', () => {
  const selectedRoomId = getSelectedRoomId();
  if (!selectedRoomId) { $.errorMsg.textContent = 'Select a room or start a new one'; return; }
  joinGame(selectedRoomId, socket);
});

$.createRoomBtn.addEventListener('click', () => {
  if (!state.account && !state.guestName) { $.signInPrompt.classList.remove('hidden'); return; }
  $.signInPrompt.classList.add('hidden');
  const currentRooms = getCurrentRooms();
  const emptyRoom = currentRooms.find(r => r.playerCount === 0);
  if (!emptyRoom) { $.errorMsg.textContent = 'No empty servers available'; return; }
  joinGame(emptyRoom.id, socket);
});

$.respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
});

socket.on('godModeToggled', ({ enabled }) => {
  state.godMode = enabled;
  $.godModeToggle.checked = enabled;
});

$.godModeToggle.addEventListener('change', () => {
  socket.emit('toggleGodMode');
});

$.killMobsBtn.addEventListener('click', () => {
  socket.emit('killAllMobs');
});

$.nextPhaseBtn.addEventListener('click', () => {
  socket.emit('adminAdvancePhase');
});

$.levelMinusBtn.addEventListener('click', () => {
  socket.emit('adminSetLevel', { delta: -1 });
});
$.levelPlusBtn.addEventListener('click', () => {
  socket.emit('adminSetLevel', { delta: 1 });
});

socket.on('accountUpdate', ({ level }) => {
  if ($.adminLevelDisplay) $.adminLevelDisplay.textContent = level;
});

$.escapeReturnBtn.addEventListener('click', () => leaveToMenu(socket));
$.escapeConfirmBtn.addEventListener('click', () => leaveToMenu(socket));
$.escapeCancelBtn.addEventListener('click', hideEscapeMenu);
$.lobbyBtn.addEventListener('click', () => leaveToMenu(socket));

$.resultsPlayAgainBtn.addEventListener('click', () => {
  document.getElementById('resultsOverlay').classList.add('hidden');
  document.getElementById('joinGameBtn').classList.add('hidden');
  if ($.resultsPlayAgainBtn.textContent === 'Spectate') {
    socket.emit('spectate');
  } else {
    socket.emit('playAgain');
  }
});

$.resultsLobbyBtn.addEventListener('click', () => leaveToMenu(socket));
$.joinGameBtn.addEventListener('click', () => { socket.emit('joinGame'); });
$.waitingLobbyBtn.addEventListener('click', () => leaveToMenu(socket));
$.lobbyStartBtn.addEventListener('click', () => { socket.emit('startMatch'); });
$.lobbyLeaveBtn.addEventListener('click', () => leaveToMenu(socket));

$.fullscreenToggle.addEventListener('change', () => {
  if ($.fullscreenToggle.checked) {
    $.wrapper.requestFullscreen().catch(() => { $.fullscreenToggle.checked = false; });
  } else {
    if (document.fullscreenElement) document.exitFullscreen();
  }
});

const volumeSlider = document.getElementById('volumeSlider');
volumeSlider.addEventListener('input', () => {
  setMasterVolume(parseInt(volumeSlider.value) / 100);
});

(function resumeAudio() {
  const handler = () => {
    audioInit();
    volumeSlider.value = Math.round(getMasterVolume() * 100);
    document.removeEventListener('mousedown', handler);
    document.removeEventListener('keydown', handler);
  };
  document.addEventListener('mousedown', handler);
  document.addEventListener('keydown', handler);
})();

$.settingsBtn.addEventListener('click', () => {
  $.settingsPanel.classList.remove('hidden');
});

$.settingsClose.addEventListener('click', () => {
  $.settingsPanel.classList.add('hidden');
});

document.addEventListener('click', (e) => {
  if (!$.settingsPanel.classList.contains('hidden') &&
      !$.settingsPanel.contains(e.target) &&
      !$.settingsBtn.contains(e.target)) {
    $.settingsPanel.classList.add('hidden');
  }
});

let preFSW, preFSH;

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    preFSW = state.viewW;
    preFSH = state.viewH;
    const ww = screen.width;
    const wh = screen.height;
    let w = ww;
    let h = Math.round(w / 16 * 9);
    if (h > wh) { h = wh; w = Math.round(h * 16 / 9); }
    $.wrapper.style.width = w + 'px';
    $.wrapper.style.height = h + 'px';
    resizeViewport(w, h);
    $.fullscreenToggle.checked = true;
    socket.emit('fullscreen', { enabled: true });
    socket.emit('cameraZoom', { zoom: state.cameraZoom, viewW: state.viewW, viewH: state.viewH });
  } else {
    if (state.hudScale > 1.0) state.hudScale = 1.0;
    $.wrapper.style.width = preFSW + 'px';
    $.wrapper.style.height = preFSH + 'px';
    resizeViewport(preFSW, preFSH);
    $.fullscreenToggle.checked = false;
    socket.emit('fullscreen', { enabled: false });
    socket.emit('cameraZoom', { zoom: state.cameraZoom, viewW: state.viewW, viewH: state.viewH });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.screen === 'playing') {
    e.preventDefault();
    if ($.escapeMenu.classList.contains('hidden')) {
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
      $.wrapper.requestFullscreen().catch(() => {});
    }
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    toggleNWPopup();
  }
});

setInterval(() => {
  if (socket.connected) socket.emit('diagPing', Date.now());
}, 250);

setInterval(() => {
  if (state.screen !== 'playing') return;
  const age = state._lastStateTime ? performance.now() - state._lastStateTime : -1;
  if (age > 8000 && state.matchPhase !== 'waiting' && state.matchPhase !== 'ended') {
    socket.emit('clientDiag', { event: 'stalled', stateAge: Math.round(age), phase: state.matchPhase, frames: state._frameCount || 0 });
  } else if (age === -1 && state.matchPhase !== 'waiting' && state.matchPhase !== 'ended') {
    socket.emit('clientDiag', { event: 'stalled', stateAge: -1, phase: state.matchPhase, frames: state._frameCount || 0 });
  }
}, 8000);

setInterval(() => {
  socket.emit('clientDiag', { event: 'heartbeat', screen: state.screen, isSpectator: state.isSpectator, matchPhase: state.matchPhase, _lastStateTime: !!state._lastStateTime, frameCount: state._frameCount || 0 });
}, 10000);

document.addEventListener('visibilitychange', () => {
  socket.emit('clientDiag', { event: 'tabVisibility', hidden: document.hidden, screen: state.screen, phase: state.matchPhase });
});

export { socket };
