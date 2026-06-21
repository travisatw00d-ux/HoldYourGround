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
      if (state.debugHitbox) {
        state.debugHitbox = false;
        state.showDiag = true;
      } else if (state.showDiag) {
        state.showDiag = false;
      } else {
        state.debugHitbox = true;
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  window.addEventListener('blur', () => {
    for (const key in keys) keys[key] = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    state.cameraZoom *= dir > 0 ? 1.1 : 1 / 1.1;
    const minZoom = state.worldW ? Math.max(state.viewW / state.worldW, state.viewH / state.worldH) : 0.25;
    state.cameraZoom = Math.max(minZoom, Math.min(4.0, state.cameraZoom));
    socket.emit('cameraZoom', { zoom: state.cameraZoom, viewW: state.viewW, viewH: state.viewH });
  }, { passive: false });

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
