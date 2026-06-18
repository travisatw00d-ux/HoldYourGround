socket.on('lobbyFull', () => {
  errorMsg.textContent = 'Server is full (max 10 players)';
});

socket.on('init', ({ id, arenaWidth, arenaHeight }) => {
  myId = id;
  worldW = arenaWidth;
  worldH = arenaHeight;
  backgroundCanvas = generateBackground(worldW, worldH);
});

socket.on('joined', () => {
  showScreen('playing');
  errorMsg.textContent = '';
  startRender();
});

socket.on('state', (data) => {
  const map = {};
  for (const p of data.players) {
    map[p.id] = p;
  }
  players = map;
  zombies = data.zombies || [];
  worldW = data.arenaWidth;
  worldH = data.arenaHeight;
  serverLevel = data.serverLevel || 0;
  updateLeaderboard();
  updateHotbar();
});

socket.on('eliminated', ({ kills }) => {
  stopRender();
  elimKills.textContent = `Kills: ${kills}`;
  showScreen('eliminated');
});

socket.on('respawned', () => {
  localAnim = null;
  showScreen('playing');
  startRender();
});

socket.on('gotHit', ({ dmg, health }) => {
  hitFlash = 8;
});

socket.on('hitConfirm', ({ dmg, x, y }) => {
  dmgNumbers.push({ x, y, dmg, timer: 1.2, duration: 1.2 });
});

socket.on('zombieMerge', ({ x, y }) => {
  mergeSmokes.push({ x, y, timer: 1.0 });
});

socket.on('attackStart', ({ lockedAngle }) => {
  startAttackAnim(lockedAngle);
});
