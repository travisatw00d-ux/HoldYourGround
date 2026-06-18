const keys = {};

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (e.key >= '1' && e.key <= '9') {
    const slot = parseInt(e.key) - 1;
    socket.emit('equip', { slot });
  }
  if (e.key === 'h' || e.key === 'H') {
    debugHitbox = !debugHitbox;
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && screen === 'playing') {
    socket.emit('attack', { facingAngle: players[myId]?.facingAngle || 0 });
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
});

function getInput() {
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
