import { state } from './state.js';

const keys = {};

export function getInput() {
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['W'] || keys['ArrowUp']) dy = -1;
  if (keys['s'] || keys['S'] || keys['ArrowDown']) dy = 1;
  if (keys['a'] || keys['A'] || keys['ArrowLeft']) dx = -1;
  if (keys['d'] || keys['D'] || keys['ArrowRight']) dx = 1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) { dx /= len; dy /= len; }
  return { dx, dy };
}

export function setupInput(socket, canvas) {
  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key >= '1' && e.key <= '9') {
      const slot = parseInt(e.key) - 1;
      socket.emit('equip', { slot });
    }
    if (e.key === 'h' || e.key === 'H') {
      state.debugHitbox = !state.debugHitbox;
    }
    if (e.key === 'f' || e.key === 'F') {
      state.showDiag = !state.showDiag;
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && state.screen === 'playing') {
      socket.emit('attack', { facingAngle: state.players[state.myId]?.facingAngle || 0 });
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    state.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
}
