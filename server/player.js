const {
  WORLD_W, WORLD_H, PLAYER_RADIUS, BASE_SPEED, BASE_ATTACK_DMG,
  BASE_ATTACK_SPEED_MS, BASE_HEALTH, COLORS, SPAWN_MIN_DIST, ITEMS
} = require('./config');

function randomSpawn(zombies, minDist) {
  const margin = PLAYER_RADIUS * 4;
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = margin + Math.random() * (WORLD_W - margin * 2);
    const y = margin + Math.random() * (WORLD_H - margin * 2);
    if (minDist && zombies.length > 0) {
      let tooClose = false;
      for (const z of zombies) {
        if (!z.alive) continue;
        const dx = x - z.x, dy = y - z.y;
        if (dx * dx + dy * dy < minDist * minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
    }
    return { x, y };
  }
  return { x: WORLD_W / 2 + (Math.random() - 0.5) * 200, y: WORLD_H / 2 + (Math.random() - 0.5) * 200 };
}

function recalcStats(p) {
  const item = p.currentItem ? ITEMS[p.currentItem] : null;
  p.speed = BASE_SPEED + (item ? (item.stats.speed || 0) : 0);
  p.attackDmg = BASE_ATTACK_DMG + (item ? (item.stats.attackDmg || 0) : 0);
  p.attackSpeed = BASE_ATTACK_SPEED_MS + (item ? (item.stats.attackSpeed || 0) : 0);
}

let colorIndex = 0;

function addPlayer(id, name, players, zombies, accountType) {
  const spawn = randomSpawn(zombies, SPAWN_MIN_DIST);
  const ci = colorIndex++ % COLORS.length;
  players[id] = {
    id,
    _idBytes: Buffer.from(id, 'utf8'),
    name: name || 'Player',
    accountType: accountType || 'guest',
    x: spawn.x, y: spawn.y,
    velX: 0, velY: 0,
    radius: PLAYER_RADIUS,
    color: COLORS[ci],
    alive: true,
    input: { dx: 0, dy: 0 },
    health: BASE_HEALTH,
    maxHealth: BASE_HEALTH,
    attackCooldown: 0,
    facingAngle: 0,
    currentItem: 'wooden_sword',
    inventory: ['wooden_sword'],
    kills: 0,
    lastHitById: null,
    attacking: false,
    attackFrame: 0,
    attackAnim: null,
    attackHitIds: [],
    attackLockedAngle: 0,
    attackStartTime: 0,
    prevCf: -1,
    lvl: 1,
    cameraZoom: 1.0,
    viewW: 800,
    viewH: 600,
    fullscreen: false,
    godMode: false
  };
  recalcStats(players[id]);
}

function setFullscreen(id, players, enabled) {
  const p = players[id];
  if (p) p.fullscreen = !!enabled;
}

function setCameraZoom(id, players, opts) {
  const p = players[id];
  if (!p) return;
  p.cameraZoom = Math.max(0.1, Math.min(4.0, (opts && opts.zoom) || 1));
  if (opts && opts.viewW) p.viewW = opts.viewW;
  if (opts && opts.viewH) p.viewH = opts.viewH;
}

function respawnPlayer(id, players, zombies) {
  const p = players[id];
  if (!p) return;
  const spawn = randomSpawn(zombies, SPAWN_MIN_DIST);
  p.x = spawn.x; p.y = spawn.y;
  p.velX = 0; p.velY = 0;
  p.alive = true;
  p.input = { dx: 0, dy: 0 };
  p.lastHitById = null;
  p.health = BASE_HEALTH;
  p.attackCooldown = 0;
  p.attacking = false;
  p.attackAnim = null;
  p.attackHitIds = [];
  p.prevCf = -1;
  p.lvl = 1;
  p.godMode = false;
}

function playerInfoObj(p) {
  return {
    id: p.id, name: p.name, color: p.color,
    currentItem: p.currentItem, inventory: p.inventory,
    maxHealth: p.maxHealth, speed: p.speed, attackDmg: p.attackDmg, attackSpeed: p.attackSpeed,
    lvl: p.lvl || 1
  };
}

function resetColorIndex() { colorIndex = 0; }

module.exports = { randomSpawn, recalcStats, addPlayer, respawnPlayer, playerInfoObj, resetColorIndex, setFullscreen, setCameraZoom };
