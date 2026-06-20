const {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, VIEW_MARGIN,
  MAX_PLAYERS, TICK_MS, BROADCAST_MS, ATTACK_SPEED_MULT, ANIMATIONS
} = require('./config');
const SpatialGrid = require('./spatial-grid');
const playerMod = require('./player');
const zombieMod = require('./zombie');
const physics = require('./physics');
const sword = require('./sword');
const bp = require('./binary-protocol');

const players = {};
const zombies = zombieMod.initZombies(players);
const grid = new SpatialGrid(120, WORLD_W, WORLD_H);

let io = null;
let lastBroadcast = 0;
let lastEmitTime = 0;
let lastTickMs = 0;

// Reusable scratch arrays for broadcast (avoid per-broadcast allocations)
const _playerList = [];
const _viewZ = [];

function setIo(newIo) { io = newIo; }

function getPlayerCount() { return Object.keys(players).length; }

function getPlayers() { return players; }

function getZombies() { return zombies; }

function addPlayer(id, name) {
  if (getPlayerCount() >= MAX_PLAYERS) return false;
  playerMod.addPlayer(id, name, players, zombies);
  zombieMod.recalcAllZombieTargets(zombies, players);
  return true;
}

function handleInput(id, data) {
  const p = players[id];
  if (!p) return;
  p.input = { dx: data.dx, dy: data.dy };
  if (typeof data.angle === 'number') p.facingAngle = data.angle;
}

function handleAttack(id, facingAngle) {
  const p = players[id];
  if (!p || !p.alive || p.attackCooldown > 0 || p.attacking) return;
  const anim = ANIMATIONS[p.currentItem]?.attack;
  if (!anim || anim.keyframes.length < 2) return;
  if (typeof facingAngle === 'number') p.facingAngle = facingAngle;
  p.attacking = true;
  p.attackFrame = 0;
  p.attackAnim = anim;
  p.attackHitIds = [];
  p.attackLockedAngle = p.facingAngle;
  p.attackStartTime = Date.now();
  p.prevCf = -1;
  io.to(id).emit('attackStart', { lockedAngle: p.attackLockedAngle });
}

function handleEquip(id, slot) {
  const p = players[id];
  if (!p || !p.alive) return;
  if (slot >= 0 && slot < p.inventory.length) {
    p.currentItem = p.inventory[slot];
    playerMod.recalcStats(p);
    io.emit('playerInfo', playerMod.playerInfoObj(p));
  }
}

function respawnPlayer(id) {
  playerMod.respawnPlayer(id, players, zombies);
  io.to(id).emit('respawned');
}

function getPlayerInfoObj(id) {
  const p = players[id];
  return p ? playerMod.playerInfoObj(p) : null;
}

function emitEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'hitConfirm':
        io.to(e.to).emit('hitConfirm', { targetId: e.targetId, dmg: e.dmg, x: e.x, y: e.y });
        break;
      case 'gotHit':
        io.to(e.to).emit('gotHit', { attackerId: e.attackerId, dmg: e.dmg, health: e.health });
        break;
      case 'eliminated':
        io.to(e.to).emit('eliminated', { kills: e.kills });
        break;
      case 'zombieMerge':
        io.emit('zombieMerge', { x: e.x, y: e.y });
        break;
    }
  }
}

function gameTick() {
  const tickStart = Date.now();
  const ids = Object.keys(players);
  if (ids.length === 0) return;

  // 1. Player movement + input processing
  for (const id of ids) {
    const p = players[id];
    if (!p.alive) continue;
    physics.processPlayerMovement(p);
  }

  // 2. Build spatial grid
  grid.clear();
  for (const z of zombies) { if (z.alive) grid.insertZombie(z); }
  for (const id in players) { const p = players[id]; if (p.alive) grid.insertPlayer(p); }

  // 3. Zombie AI targeting + movement
  zombieMod.tickTargeting(zombies, players);
  zombieMod.moveAll(zombies);

  // 4. Rebuild zombie grid after movement
  grid.clearZombies();
  for (const z of zombies) { if (z.alive) grid.insertZombie(z); }

  // 5. Contact damage (zombie → player)
  const contactEvents = physics.processContactDamage(zombies, grid);
  emitEvents(contactEvents);

  // 6. Player vs player collision
  physics.processPlayerCollision(players);

  // 7. Sword attack processing
  for (const id of ids) {
    const p = players[id];
    if (!p.alive || !p.attacking) continue;
    const events = sword.checkSwordHit(p, zombies, players, grid);
    emitEvents(events);
    p.attackFrame++;
    const totalFrames = sword.animTotal(p.attackAnim);
    const totalTicks = Math.ceil(totalFrames / (2 * ATTACK_SPEED_MULT));
    if (p.attackFrame >= totalTicks) {
      p.attacking = false;
      p.attackAnim = null;
      p.attackHitIds = [];
      p.prevCf = -1;
      p.attackCooldown = Math.round(p.attackSpeed / TICK_MS);
    }
  }

  // 8. Zombie merges
  const mergeEvents = zombieMod.processMerge(zombies, grid);
  emitEvents(mergeEvents);

  // 9. Maintain zombie count / revive dead
  zombieMod.ensureCount(zombies, players);
  zombieMod.reviveDead(zombies, players);

  // 10. Network broadcast (decoupled from sim rate)
  if (tickStart - lastBroadcast < BROADCAST_MS) return;
  lastBroadcast = tickStart;

  _playerList.length = 0;
  let serverLevelSum = 0;
  for (const id in players) {
    const p = players[id];
    serverLevelSum += p.lvl || 1;
    _playerList.push(p);
  }
  const playerBlock = bp.buildPlayerBlock(_playerList);
  const currentServerLevel = serverLevelSum;

  const emitTime = Date.now();
  if (lastEmitTime && emitTime - lastEmitTime > 100) {
    console.log(`[STALL] broadcast gap=${emitTime - lastEmitTime}ms (real server-side gap)`);
  }
  lastEmitTime = emitTime;
  for (const id in players) {
    const p = players[id];
    if (!p) continue;
    const zoom = p.cameraZoom || 1;
    const vw = p.viewW || VIEW_W;
    const vh = p.viewH || VIEW_H;
    const pHalfVW = (vw / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
    const pHalfVH = (vh / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
    _viewZ.length = 0;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z.alive) continue;
      if (!p.fullscreen) {
        const dzx = z.x - p.x; if (dzx < -pHalfVW || dzx > pHalfVW) continue;
        const dzy = z.y - p.y; if (dzy < -pHalfVH || dzy > pHalfVH) continue;
      }
      _viewZ.push(z);
    }
    io.to(id).emit('state', bp.buildStateBuffer(playerBlock, _playerList.length, currentServerLevel, _viewZ, emitTime));
  }
  const tickMs = Date.now() - tickStart;
  lastTickMs = tickMs;
  if (tickMs > 30) console.log(`tick=${tickMs}ms players=${ids.length} zombies=${zombies.length}`);
}

// Drift-compensating fixed-timestep loop
let nextTickAt = Date.now();
const MAX_TICKS_PER_WAKE = 5;

function tickLoop() {
  const now = Date.now();
  let steps = 0;
  while (now >= nextTickAt && steps < MAX_TICKS_PER_WAKE) {
    gameTick();
    nextTickAt += TICK_MS;
    steps++;
  }
  if (Date.now() - nextTickAt > TICK_MS * MAX_TICKS_PER_WAKE) {
    nextTickAt = Date.now();
  }
  setTimeout(tickLoop, Math.max(0, nextTickAt - Date.now()));
}

function initGameLoop(newIo) {
  setIo(newIo);
  nextTickAt = Date.now();
  setTimeout(tickLoop, TICK_MS);
}

function setFullscreen(id, enabled) {
  playerMod.setFullscreen(id, getPlayers(), enabled);
}

function setCameraZoom(id, zoom) {
  playerMod.setCameraZoom(id, getPlayers(), zoom);
}

module.exports = {
  initGameLoop, getPlayers, getZombies, getPlayerCount,
  addPlayer, handleInput, handleAttack, handleEquip,
  respawnPlayer, getPlayerInfoObj, setFullscreen, setCameraZoom
};
