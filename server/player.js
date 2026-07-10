const {
  WORLD_W, WORLD_H, PLAYER_RADIUS, BASE_SPEED, BASE_ATTACK_DMG,
  BASE_ATTACK_SPEED_MS, BASE_HEALTH, COLORS, SPAWN_MIN_DIST, ITEMS,
  BASE_TURN_SPEED
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
  const build = p.playerBuild || 'standard';
  const base = BUILD_BASE[build] || {};
  const scale = BUILD_SCALING[build] || BUILD_SCALING.standard;
  p.speed = (base.speed ?? BASE_SPEED) + (item ? (item.stats.speed || 0) : 0);
  p.attackDmg = (base.attackDmg ?? BASE_ATTACK_DMG) + (item ? (item.stats.attackDmg || 0) : 0);
  p.attackSpeed = BASE_ATTACK_SPEED_MS + (item ? (item.stats.attackSpeed || 0) : 0);
  p.turnSpeed = BASE_TURN_SPEED + (item ? (item.stats.turnSpeed || 0) : 0);
  p.maxHealth = base.maxHealth ?? BASE_HEALTH;
  p.maxEnergy = 100;
  if (p.investedPoints) {
    p.maxHealth += (p.investedPoints.maxHealth || 0) * scale.maxHealth;
    p.maxEnergy += (p.investedPoints.maxEnergy || 0) * scale.maxEnergy;
    p.speed = Math.min(scale.speedCap || 16, p.speed + (p.investedPoints.speed || 0) * scale.speed);
    p.attackDmg += (p.investedPoints.attackDmg || 0) * scale.attackDmg;
    p.attackSpeed += (p.investedPoints.attackSpeed || 0) * (-20);
    p.turnSpeed += (p.investedPoints.turnSpeed || 0) * 1;
  }
  if (p.health > p.maxHealth) p.health = p.maxHealth;
}

const BUILD_SCALING = {
  standard: { maxHealth: 10, maxEnergy: 10, speed: 0.03, attackDmg: 1, speedCap: 16 },
  glassCannon: { maxHealth: 5, maxEnergy: 10, speed: 0.03, attackDmg: 2, speedCap: 16 },
  tank: { maxHealth: 15, maxEnergy: 10, speed: 0.05, attackDmg: 0.5, speedCap: 16 }
};

const BUILD_BASE = {
  glassCannon: { maxHealth: 80, attackDmg: 8 },
  tank: { maxHealth: 150, speed: 11, attackDmg: 3 }
};

let colorIndex = 0;

function addPlayer(id, name, players, zombies, accountType, accountId) {
  const spawn = randomSpawn(zombies, SPAWN_MIN_DIST);
  const ci = colorIndex++ % COLORS.length;
  players[id] = {
    id,
    _idBytes: Buffer.from(id, 'utf8'),
    name: name || 'Player',
    accountType: accountType || 'guest',
    accountId: accountId || null,
    x: spawn.x, y: spawn.y,
    velX: 0, velY: 0,
    radius: PLAYER_RADIUS,
    color: COLORS[ci],
    alive: true,
    input: { dx: 0, dy: 0 },
    health: BASE_HEALTH,
    maxHealth: BASE_HEALTH,
    energy: 100,
    maxEnergy: 100,
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
    exp: 0,
    gold: 0,
    playerClass: 'knight',
    cameraZoom: 1.0,
    viewW: 800,
    viewH: 600,
    fullscreen: false,
    godMode: false,
    attackStyle: 'jab',
    comboStep: 0,
    _lastAttackTime: 0,
    _chainTickTarget: 0,
    _chainPendingAngle: null,
    _chainDelayTicks: 5,
    _started: false,
    _queuedChain: null,
    comboChainWindow: false,
    sprint: false,
    sprintEndCooldown: 0,
    _spinRemaining: 0,
    _lungeRemaining: 0,
    _combo3MidHit: false,
    _lastMouseAngle: 0,
    _spinLungeAngle: 0,
    _jabHitCleared: 0,
    isSpectator: false,
    statPoints: 0,
    investedPoints: {},
    playerBuild: 'standard'
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
  p.health = p.maxHealth || BASE_HEALTH;
  p.attackCooldown = 0;
  p.attacking = false;
  p.attackAnim = null;
  p.attackHitIds = [];
  p.prevCf = -1;
  p.comboStep = 0;
  p._lastAttackTime = 0;
  p._chainTickTarget = 0;
  p._chainPendingAngle = null;
  p._chainDelayTicks = 5;
  p._started = false;
  p._queuedChain = null;
  p.comboChainWindow = false;
  p.godMode = false;
  p.isSpectator = false;
  p.sprint = false;
  p.energy = p.maxEnergy || 100;
  p.sprintEndCooldown = 0;
  p._lungeRemaining = 0;
  p._combo3MidHit = false;
  p._lastMouseAngle = 0;
  p._spinLungeAngle = 0;
  p._jabHitCleared = 0;
  p._spinRemaining = 0;
}

function playerInfoObj(p) {
  return {
    id: p.id, name: p.name, color: p.color,
    currentItem: p.currentItem, inventory: p.inventory,
    maxHealth: p.maxHealth, speed: p.speed, attackDmg: p.attackDmg, attackSpeed: p.attackSpeed,
    turnSpeed: p.turnSpeed,
    lvl: p.lvl || 1,
    playerClass: p.playerClass || 'knight',
    attackStyle: p.attackStyle || 'jab',
    isSpectator: p.isSpectator,
    statPoints: p.statPoints || 0,
    playerBuild: p.playerBuild || 'standard'
  };
}

function resetColorIndex() { colorIndex = 0; }

module.exports = { randomSpawn, recalcStats, addPlayer, respawnPlayer, playerInfoObj, resetColorIndex, setFullscreen, setCameraZoom, BUILD_SCALING, BUILD_BASE };
