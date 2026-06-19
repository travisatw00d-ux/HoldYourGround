import { state } from './modules/state.js';
import { connect } from './modules/net.js';
import { setupInput } from './modules/input.js';
import { startRender, stopRender } from './modules/render.js';

const canvas = document.getElementById('canvas');
const menu = document.getElementById('menu');
const eliminated = document.getElementById('eliminated');
const hud = document.getElementById('hud');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const respawnBtn = document.getElementById('respawnBtn');
const hotbarEl = document.getElementById('hotbarInventory');

function showScreen(id) {
  menu.classList.add('hidden');
  eliminated.classList.add('hidden');
  hud.classList.add('hidden');
  hotbarEl.classList.add('hidden');
  state.screen = id;
  if (id === 'menu') menu.classList.remove('hidden');
  if (id === 'eliminated') eliminated.classList.remove('hidden');
  if (id === 'playing') { hud.classList.remove('hidden'); hotbarEl.classList.remove('hidden'); }
}

showScreen('menu');

function joinGame() {
  const name = nameInput.value.trim() || 'Player';
  socket.emit('join', { name });
}

// Connect socket
const socket = connect();

// Setup input handlers
setupInput(socket, canvas);

// UI event handlers
joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});

respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
});

// Diagnostics ping loop
setInterval(() => {
  if (socket.connected) socket.emit('diagPing', Date.now());
}, 250);

export { socket, showScreen };
