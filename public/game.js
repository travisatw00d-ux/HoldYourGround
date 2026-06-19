console.log('[HYG client v8 loaded]');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const VW = 800;
const VH = 600;
canvas.width = VW;
canvas.height = VH;

let socket = io('wss://server.iolegends.com', { transports: ['websocket'] });

// Self-healing: poll the server's build tag; if it changed (new deploy), auto-reload
// so this client can never get stuck on stale code.
const MY_BUILD = window.BUILD || '';
setInterval(() => {
  fetch('/version', { cache: 'no-store' }).then(r => r.text()).then(t => {
    const v = t.trim();
    if (MY_BUILD && v !== MY_BUILD) {
      console.log('[HYG] new build ' + v + ' (was ' + MY_BUILD + '), reloading');
      location.reload();
    }
  }).catch(() => {});
}, 8000);

const textDecoder = new TextDecoder();
function zombieMaxHealth(lvl) { return lvl <= 5 ? 4 + lvl : 12 + lvl; }

let myId = null;
let worldW = 0;
let worldH = 0;
let players = {};
let playerMeta = {};
let zombies = [];
let screen = 'menu';
let backgroundCanvas = null;

let animFrame = null;
let inputInterval = null;
let diagPingInterval = null;

let hitFlash = 0;
let mouseX = 0;
let mouseY = 0;
let localAnim = null;
let debugHitbox = false;
let dmgNumbers = [];
let mergeSmokes = [];
let serverLevel = 0;
let lbSig = '';
let hotSig = '';
let snapshotTime = 0;
let prevSnapshotTime = 0;

// Diagnostics overlay (toggle with F)
let showDiag = true;
let fpsFrames = 0, fpsLast = 0, fpsValue = 0, frameTimeMs = 0;
let ping = 0;
let maxPing = 0, maxPingAt = 0, maxFrameMs = 0, maxFrameAt = 0;
let lastStateAt = 0, lastArrival = 0, maxArrival = 0, maxArrivalAt = 0;
let lastEmitTime = 0, lastSrvInterval = 0, maxSrvInterval = 0, maxSrvAt = 0;
let lastRAF = 0, maxFrameGap = 0, maxFrameGapAt = 0;
let lastPacketBytes = 0;
let pktCounter = 0;
let bladeHistory = null;
let levelGrad = null;

const swordImg = new Image();
swordImg.src = '/images/woodensword.png';

const zombieHeadImg = new Image();
zombieHeadImg.src = '/images/zombiehead.png';

const zombieT2HeadImg = new Image();
zombieT2HeadImg.src = '/images/T2zombiehead.png';

const serverLevelImg = new Image();
serverLevelImg.src = '/images/ServerLevel.png';

const zombieLeftHandImg = new Image();
zombieLeftHandImg.src = '/images/zombielefthand.png';

const zombieRightHandImg = new Image();
zombieRightHandImg.src = '/images/zombierighthand.png';

const zombieT2LeftHandImg = new Image();
zombieT2LeftHandImg.src = '/images/T2zombielefthand.png';

const zombieT2RightHandImg = new Image();
zombieT2RightHandImg.src = '/images/T2zombierighthand.png';

// Pre-render each sprite to a small offscreen canvas (2x supersampled) so the
// hot loop blits a tiny canvas instead of resampling a full-res image every draw.
const spriteCache = new WeakMap();
function getSprite(img, w, h) {
  w = Math.max(1, Math.round(w * 2) / 2);
  h = Math.max(1, Math.round(h * 2) / 2);
  let inner = spriteCache.get(img);
  if (!inner) { inner = new Map(); spriteCache.set(img, inner); }
  const key = w + 'x' + h;
  let sc = inner.get(key);
  if (!sc) {
    const m = 2;
    sc = document.createElement('canvas');
    sc.width = Math.round(w * m);
    sc.height = Math.round(h * m);
    sc.getContext('2d').drawImage(img, 0, 0, sc.width, sc.height);
    inner.set(key, sc);
  }
  return sc;
}

const menu = document.getElementById('menu');
const eliminated = document.getElementById('eliminated');
const hud = document.getElementById('hud');
const lbEntries = document.getElementById('lbEntries');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const respawnBtn = document.getElementById('respawnBtn');
const elimKills = document.getElementById('elimKills');
const errorMsg = document.getElementById('errorMsg');
const hotbarEl = document.getElementById('hotbarInventory');

function showScreen(id) {
  menu.classList.add('hidden');
  eliminated.classList.add('hidden');
  hud.classList.add('hidden');
  hotbarEl.classList.add('hidden');
  screen = id;
  if (id === 'menu') menu.classList.remove('hidden');
  if (id === 'eliminated') eliminated.classList.remove('hidden');
  if (id === 'playing') { hud.classList.remove('hidden'); hotbarEl.classList.remove('hidden'); }
}

showScreen('menu');

joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});
respawnBtn.addEventListener('click', () => {
  socket.emit('respawn');
});

function joinGame() {
  const name = nameInput.value.trim() || 'Player';
  socket.emit('join', { name });
}

// --- Background generation ---

function generateBackground(w, h) {
  const bc = document.createElement('canvas');
  bc.width = w;
  bc.height = h;
  const bx = bc.getContext('2d');

  bx.fillStyle = '#ffffff';
  bx.fillRect(0, 0, w, h);

  bx.strokeStyle = 'rgba(0,0,0,0.06)';
  bx.lineWidth = 1;
  bx.beginPath();
  const gs = 80;
  for (let x = gs; x < w; x += gs) { bx.moveTo(x, 0); bx.lineTo(x, h); }
  for (let y = gs; y < h; y += gs) { bx.moveTo(0, y); bx.lineTo(w, y); }
  bx.stroke();

  bx.strokeStyle = 'rgba(0,0,0,0.25)';
  bx.lineWidth = 3;
  bx.strokeRect(1.5, 1.5, w - 3, h - 3);
  return bc;
}

// --- Socket events ---

function emptyState() { return { players: {}, zombies: [] }; }

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

socket.on('state', (msg) => {
  // Binary state protocol (see server.js buildStateBuffer). Little-endian.
  // Normalize whether Socket.io delivers an ArrayBuffer or a typed-array view.
  const u8 = msg instanceof ArrayBuffer ? new Uint8Array(msg)
    : new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  try {
  /* const version = */ dv.getUint8(o); o += 1;
  const emitTime = dv.getFloat64(o, true); o += 8;
  const arenaW = dv.getUint16(o, true); o += 2;
  const arenaH = dv.getUint16(o, true); o += 2;
  const sLevel = dv.getUint16(o, true); o += 2;
  const playerCount = dv.getUint8(o); o += 1;
  const zombieCount = dv.getUint16(o, true); o += 2;

  // decode players, merge cached identity/stats, carry prev position for interp
  const oldP = players;
  const map = {};
  for (let i = 0; i < playerCount; i++) {
    const idLen = dv.getUint8(o); o += 1;
    const id = textDecoder.decode(u8.subarray(o, o + idLen)); o += idLen;
    const x = dv.getFloat32(o, true); o += 4;
    const y = dv.getFloat32(o, true); o += 4;
    const health = dv.getInt16(o, true); o += 2;
    const alive = dv.getUint8(o) === 1; o += 1;
    const attacking = dv.getUint8(o) === 1; o += 1;
    const facingAngle = dv.getFloat32(o, true); o += 4;
    const attackLockedAngle = dv.getFloat32(o, true); o += 4;
    const attackStartTime = dv.getFloat64(o, true); o += 8;
    const kills = dv.getInt16(o, true); o += 2;
    const lvl = dv.getUint8(o); o += 1;

    const old = oldP[id];
    const meta = playerMeta[id] || {};
    const p = {
      id, x, y, health, alive, attacking, facingAngle, attackLockedAngle, attackStartTime, kills, lvl,
      name: meta.name || 'Player',
      color: meta.color || '#888888',
      currentItem: meta.currentItem || 'wooden_sword',
      inventory: meta.inventory || ['wooden_sword'],
      maxHealth: meta.maxHealth || 100,
      speed: meta.speed != null ? meta.speed : 13,
      attackDmg: meta.attackDmg != null ? meta.attackDmg : 5,
      attackSpeed: meta.attackSpeed != null ? meta.attackSpeed : 800
    };
    if (old && Math.abs(x - old.x) < 200 && Math.abs(y - old.y) < 200) {
      p.px = old.x; p.py = old.y;
    } else {
      p.px = x; p.py = y;
    }
    map[id] = p;
  }
  players = map;

  // decode zombies
  const oldZ = {};
  for (let i = 0; i < zombies.length; i++) oldZ[zombies[i].id] = zombies[i];
  const newZombies = [];
  for (let i = 0; i < zombieCount; i++) {
    const zid = dv.getInt32(o, true); o += 4;
    const zx = dv.getFloat32(o, true); o += 4;
    const zy = dv.getFloat32(o, true); o += 4;
    const zhealth = dv.getInt16(o, true); o += 2;
    const zheading = dv.getFloat32(o, true); o += 4;
    const zlvl = dv.getUint8(o); o += 1;
    const zalive = dv.getUint8(o) === 1; o += 1;
    const old = oldZ[zid];
    const maxHealth = old ? old.maxHealth : zombieMaxHealth(zlvl);
    const z = {
      id: zid, x: zx, y: zy, health: zhealth, maxHealth,
      headingAngle: zheading, lvl: zlvl, alive: zalive
    };
    if (old && Math.abs(zx - old.x) < 200 && Math.abs(zy - old.y) < 200) {
      z.px = old.x; z.py = old.y;
    } else {
      z.px = zx; z.py = zy;
    }
    z.label = zlvl > 1 ? 'zombie lvl ' + zlvl : 'zombie';
    newZombies.push(z);
  }
  zombies = newZombies;
  } catch (e) {
    console.error('[HYG] state buffer error:', e);
    const es = emptyState();
    players = es.players;
    zombies = es.zombies;
    return;
  }

  worldW = arenaW;
  worldH = arenaH;
  serverLevel = sLevel;
  prevSnapshotTime = snapshotTime || performance.now();
  snapshotTime = performance.now();
  const sNow = performance.now();
  if (lastStateAt) {
    const delta = sNow - lastStateAt;
    lastArrival = delta;
    if (sNow - maxArrivalAt > 2000) { maxArrival = delta; maxArrivalAt = sNow; }
    else if (delta > maxArrival) maxArrival = delta;
  }
  lastStateAt = sNow;
  if (lastEmitTime) {
    const ival = emitTime - lastEmitTime;
    lastSrvInterval = ival;
    if (sNow - maxSrvAt > 2000) { maxSrvInterval = ival; maxSrvAt = sNow; }
    else if (ival > maxSrvInterval) maxSrvInterval = ival;
  }
  lastEmitTime = emitTime;
  lastPacketBytes = u8.byteLength;
  updateLeaderboard();
  updateHotbar();
});

socket.on('playerInfo', (info) => { playerMeta[info.id] = info; });
socket.on('playerLeft', (id) => { delete playerMeta[id]; });

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

socket.on('diagPong', (t) => {
  ping = Date.now() - t;
  const now = performance.now();
  if (now - maxPingAt > 2000) { maxPing = ping; maxPingAt = now; }
  else if (ping > maxPing) maxPing = ping;
});
diagPingInterval = setInterval(() => { if (socket.connected) socket.emit('diagPing', Date.now()); }, 250);

function startAttackAnim(lockedAngle) {
  if (localAnim) return;
  const me = players[myId];
  if (!me) return;
  const anim = window.ANIMATIONS && window.ANIMATIONS[me.currentItem] && window.ANIMATIONS[me.currentItem].attack;
  if (anim) {
    const locked = (typeof lockedAngle === 'number') ? lockedAngle : (me.facingAngle || 0);
    localAnim = {
      keyframes: anim.keyframes,
      segments: anim.segments,
      frame: 0,
      totalFrames: anim.segments.reduce((a, b) => a + b, 0),
      lockedAngle: locked,
      startTime: performance.now()
    };
  }
}

// --- Input ---

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
  if (e.key === 'f' || e.key === 'F') {
    showDiag = !showDiag;
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

// --- Leaderboard ---

function updateLeaderboard() {
  const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
  let sig = '';
  for (let i = 0; i < sorted.length; i++) sig += sorted[i].name + ':' + sorted[i].kills + '|';
  if (sig === lbSig) return;
  lbSig = sig;
  let html = '';
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const cls = i === 0 ? 'lb-entry top' : 'lb-entry';
    html += `<div class="${cls}"><span>${p.name}</span><span class="lb-kills">${p.kills}</span></div>`;
  }
  lbEntries.innerHTML = html;
}

// --- Hotbar ---

function updateHotbar() {
  const me = players[myId];
  if (!me) { if (hotSig !== '') { hotSig = ''; hotbarEl.innerHTML = ''; } return; }
  const sig = me.currentItem + '|' + (me.inventory ? me.inventory.join(',') : '');
  if (sig === hotSig) return;
  hotSig = sig;
  let html = '';
  for (let i = 0; i < me.inventory.length; i++) {
    const itemKey = me.inventory[i];
    const item = window.ITEMS[itemKey];
    const active = itemKey === me.currentItem ? ' active' : '';
    html += `<div class="hot-slot${active}" data-slot="${i}"><span class="hot-key">${i + 1}</span><span class="hot-name">${item ? item.name : itemKey}</span></div>`;
  }
  hotbarEl.innerHTML = html;
}

// --- Camera ---

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const _cam = { x: 0, y: 0 };
function getCamera(alpha) {
  const me = players[myId];
  if (!me) { _cam.x = 0; _cam.y = 0; return _cam; }
  if (alpha === undefined) alpha = 1;
  const mx = (me.px === undefined ? me.x : me.px + (me.x - me.px) * alpha);
  const my = (me.py === undefined ? me.y : me.py + (me.y - me.py) * alpha);
  _cam.x = clamp(mx - VW / 2, 0, Math.max(0, worldW - VW));
  _cam.y = clamp(my - VH / 2, 0, Math.max(0, worldH - VH));
  return _cam;
}

// --- Render loop ---

function startRender() {
  if (animFrame) return;
  if (inputInterval) clearInterval(inputInterval);
  inputInterval = setInterval(() => {
    if (screen === 'playing') {
      const input = getInput();
      const cam = getCamera();
      const me = players[myId];
      if (me) {
        input.angle = me.facingAngle || Math.atan2((mouseY + cam.y) - me.y, (mouseX + cam.x) - me.x);
      }
      socket.emit('input', input);
    }
  }, 50);

  function loop(ts) {
    if (screen === 'playing') {
      if (lastRAF && ts - lastRAF < 500) {
        const gap = ts - lastRAF;
        if (ts - maxFrameGapAt > 2000) { maxFrameGap = gap; maxFrameGapAt = ts; }
        else if (gap > maxFrameGap) maxFrameGap = gap;
      }
      lastRAF = ts;
      render();
      animFrame = requestAnimationFrame(loop);
    }
  }
  loop(performance.now());
}

function stopRender() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
}

// --- Drawing helpers ---

function drawHealthBar(ctx, x, y, w, h, hp, maxHp) {
  const pct = Math.max(0, hp / maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - w / 2, y, w, h);
  const col = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * pct, h - 2);
}

function getInterpolatedVis() {
  if (!localAnim || localAnim.keyframes.length < 2) return null;
  const total = localAnim.totalFrames;
  if (total === 0) return null;
  const f = Math.min(localAnim.frame, total - 1);
  let accum = 0;
  for (let i = 0; i < localAnim.segments.length; i++) {
    const segLen = localAnim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t); // smoothstep for natural easing
      const a = localAnim.keyframes[i];
      const b = localAnim.keyframes[i + 1];
      return {
        offsetX: +(a.offsetX + (b.offsetX - a.offsetX) * t).toFixed(1),
        offsetY: +(a.offsetY + (b.offsetY - a.offsetY) * t).toFixed(1),
        scale: +(a.scale + (b.scale - a.scale) * t).toFixed(3),
        rotation: +(a.rotation + (b.rotation - a.rotation) * t).toFixed(3)
      };
    }
    accum += segLen;
  }
  return localAnim.keyframes[localAnim.keyframes.length - 1];
}

function getRemoteVis(p) {
  if (!p.attacking) return null;
  const anim = window.ANIMATIONS && window.ANIMATIONS[p.currentItem] && window.ANIMATIONS[p.currentItem].attack;
  if (!anim || anim.keyframes.length < 2) return null;
  const total = anim.segments.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const elapsed = Math.max(0, Date.now() - (p.attackStartTime || 0));
  const duration = 300;
  const f = Math.min(Math.floor((elapsed / duration) * total), total - 1);
  let accum = 0;
  for (let i = 0; i < anim.segments.length; i++) {
    const segLen = anim.segments[i];
    if (f < accum + segLen) {
      let t = (f - accum) / segLen;
      t = t * t * (3 - 2 * t);
      const a = anim.keyframes[i], b = anim.keyframes[i + 1];
      return {
        offsetX: a.offsetX + (b.offsetX - a.offsetX) * t,
        offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t
      };
    }
    accum += segLen;
  }
  return anim.keyframes[anim.keyframes.length - 1];
}

function getVis(p) {
  if (p.id === myId && localAnim) return getInterpolatedVis();
  if (p.id !== myId && p.attacking) {
    const v = getRemoteVis(p);
    if (v) return v;
  }
  return window.ITEM_VISUALS && window.ITEM_VISUALS[p.currentItem];
}

function getDrawAngle(p) {
  if (p.id !== myId && p.attacking && p.attackLockedAngle != null) return p.attackLockedAngle;
  return p.facingAngle || 0;
}

function getBladeSegment(p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return null;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const ox = sx + rx, oy = sy + ry;
  const scale = vis.scale;
  const rot = angle + (vis.rotation || 0);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const tipX = ox + (window.BLADE_TIP_X * cosR - window.BLADE_TIP_Y * sinR) * scale;
  const tipY = oy + (window.BLADE_TIP_X * sinR + window.BLADE_TIP_Y * cosR) * scale;
  const hiltX = ox + (window.BLADE_HILT_X * cosR - window.BLADE_HILT_Y * sinR) * scale;
  const hiltY = oy + (window.BLADE_HILT_X * sinR + window.BLADE_HILT_Y * cosR) * scale;
  return { hiltX, hiltY, tipX, tipY };
}

function drawZombieHand(ctx, z, szx, szy, angle, handKey, lvl) {
  const vis = window.ZOMBIE_VISUALS && window.ZOMBIE_VISUALS[handKey];
  if (!vis) return;
  const isT2 = lvl >= 6;
  const img = handKey === 'left_hand'
    ? (isT2 ? zombieT2LeftHandImg : zombieLeftHandImg)
    : (isT2 ? zombieT2RightHandImg : zombieRightHandImg);
  if (!img.complete || img.naturalWidth === 0) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const handScale = isT2 ? 1.1 : 1.0;
  const sw = img.naturalWidth * vis.scale * handScale;
  const sh = img.naturalHeight * vis.scale * handScale;
  ctx.save();
  ctx.translate(szx + rx, szy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSprite(img, sw, sh), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawDebugSwordHitbox(ctx, p, sx, sy) {
  const seg = getBladeSegment(p, sx, sy);
  if (!seg) return;
  const { hiltX, hiltY, tipX, tipY } = seg;
  const bladeW = 12;

  ctx.save();
  // bladeW-width detection band
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
  ctx.lineWidth = bladeW * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // blade centerline
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // tip and hilt markers
  ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hiltX, hiltY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,200,0,0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`hitbox (bladeW=${bladeW})`, tipX + 6, tipY - 6);

  ctx.restore();
}

function drawSword(ctx, p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return;

  const angle = getDrawAngle(p);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;

  const sw = 1254 * vis.scale;
  const sh = 1254 * vis.scale;

  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(getSprite(swordImg, sw, sh), -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, VW, VH);
  const rT0 = performance.now();

  // Interpolation: render ~one snapshot interval behind for smooth motion.
  // If a snapshot is overdue (network/server jitter), extrapolate remote
  // entities up to ~100ms past the last target instead of freezing in place.
  let interval = snapshotTime - prevSnapshotTime;
  if (interval <= 0) interval = 16;
  let alpha = (performance.now() - snapshotTime) / interval;
  const alphaCap = 1 + 150 / interval; // glide through ~150ms of network jitter
  if (alpha > alphaCap) alpha = alphaCap; else if (alpha < 0) alpha = 0;

  const cam = getCamera(alpha);

  // compute local facing at full frame rate from mouse (locked during attack)
  const me = players[myId];
  if (me && me.alive) {
    const mex = me.px + (me.x - me.px) * alpha;
    const mey = me.py + (me.y - me.py) * alpha;
    const target = Math.atan2((mouseY + cam.y) - mey, (mouseX + cam.x) - mex);
    if (localAnim) {
      const diff = target - localAnim.lockedAngle;
      const norm = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxRot = 5 * Math.PI / 180;
      me.facingAngle = localAnim.lockedAngle + Math.max(-maxRot, Math.min(maxRot, norm));
    } else {
      me.facingAngle = target;
    }
  }

  if (localAnim) {
    const elapsed = performance.now() - localAnim.startTime;
    const duration = (localAnim.totalFrames / 60) * 1000 / 4;
    localAnim.frame = Math.floor((elapsed / duration) * localAnim.totalFrames);
    if (localAnim.frame >= localAnim.totalFrames) localAnim = null;
  }

  if (backgroundCanvas) {
    ctx.drawImage(backgroundCanvas, cam.x, cam.y, VW, VH, 0, 0, VW, VH);
  }

  // draw zombies
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const z of zombies) {
    if (!z.alive) continue;
    const zx = z.px + (z.x - z.px) * alpha;
    const zy = z.py + (z.y - z.py) * alpha;
    const szx = zx - cam.x, szy = zy - cam.y;
    if (szx < -40 || szx > VW + 40 || szy < -40 || szy > VH + 40) continue;

    // facing angle from server (computed from target direction)
    const zombieAngle = z.headingAngle || 0;

    const headImg = (z.lvl >= 6 && zombieT2HeadImg.complete && zombieT2HeadImg.naturalWidth > 0) ? zombieT2HeadImg : zombieHeadImg;
    if (headImg.complete && headImg.naturalWidth > 0) {
      ctx.save();
      const headScale = (z.lvl >= 6 ? 1.1 : 1.0);
      const sz = (40 * headScale) / Math.max(headImg.naturalWidth, headImg.naturalHeight);
      const w = headImg.naturalWidth * sz;
      const h = headImg.naturalHeight * sz;
      ctx.translate(szx, szy);
      ctx.rotate(zombieAngle - Math.PI / 2);
      ctx.drawImage(getSprite(headImg, w, h), -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand', z.lvl);
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand', z.lvl);

    ctx.fillStyle = '#ff6666';
    ctx.fillText(z.label || 'zombie', szx, szy - 30);
    drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
  }

  let topKills = 0;
  for (const id in players) {
    const k = players[id].kills;
    if (k > topKills) topKills = k;
  }

  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    const sx = (p.px + (p.x - p.px) * alpha) - cam.x;
    const sy = (p.py + (p.y - p.py) * alpha) - cam.y;

    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;

    drawSword(ctx, p, sx, sy);
    if (debugHitbox) drawDebugSwordHitbox(ctx, p, sx, sy);

    const hbw = 36;
    const hbh = 4;
    drawHealthBar(ctx, sx, sy - 36, hbw, hbh, p.health, p.maxHealth);

    const isTop = topKills > 0 && p.kills === topKills;

    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    if (isTop && p.kills > 0) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
    } else if (id === myId) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, sx, sy - 42);
  }

  if (me) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Spd: ${me.speed || BASE_STATS.speed}  Atk: ${me.attackDmg || BASE_STATS.attackDmg}  SpdAtk: ${me.attackSpeed || BASE_STATS.attackSpeed}ms`, 10, 18);
    ctx.fillText(`HP: ${Math.max(0, me.health)}/${me.maxHealth}`, 10, 34);

    if (debugHitbox) {
      ctx.fillStyle = 'rgba(255,200,0,0.8)';
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('HITBOX DEBUG ON [H to toggle]', 10, 52);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`X: ${Math.round(me.x)}  Y: ${Math.round(me.y)}`, VW - 10, VH - 10);
    ctx.textBaseline = 'alphabetic';
  }

  // server level
  if (serverLevelImg.complete && serverLevelImg.naturalWidth > 0) {
    const ui = window.SCREEN_UI && window.SCREEN_UI.serverLevel;
    if (ui) {
      const sw = serverLevelImg.naturalWidth * ui.scale;
      const sh = serverLevelImg.naturalHeight * ui.scale;
      ctx.save();
      ctx.translate(ui.x, ui.y);
      ctx.drawImage(serverLevelImg, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      // draw level number with game-style text
      const textX = ui.x;
      const textY = ui.y + (ui.ty || 0);
      const text = String(serverLevel);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '32px "Lilita One", "Segoe UI", sans-serif';
      if (!levelGrad) {
        levelGrad = ctx.createLinearGradient(textX, textY - 14, textX, textY + 14);
        levelGrad.addColorStop(0, '#ffffff');
        levelGrad.addColorStop(1, '#b0b0b0');
      }
      const grad = levelGrad;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      // shadow
      ctx.save();
      ctx.translate(2, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(text, textX, textY);
      ctx.restore();
      // thick black outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 10;
      ctx.strokeText(text, textX, textY);
      // inner white highlight (thinner, offset up-left)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(text, textX - 1, textY - 1);
      // gradient fill on top
      ctx.fillStyle = grad;
      ctx.fillText(text, textX, textY);
      ctx.textBaseline = 'alphabetic';
    }
  }

  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${hitFlash / 20})`;
    ctx.fillRect(0, 0, VW, VH);
    hitFlash--;
  }

  // damage numbers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const dn = dmgNumbers[i];
    dn.timer -= 1 / 60;
    const sx = dn.x - cam.x;
    const sy = dn.y - cam.y - 30 * (1 - dn.timer / dn.duration);
    if (dn.timer <= 0) { dmgNumbers.splice(i, 1); continue; }
    const alpha = dn.timer > 0.3 ? 1 : dn.timer / 0.3;
    ctx.fillStyle = `rgba(255, 60, 60, ${alpha})`;
    ctx.fillText(`-${dn.dmg}`, sx, sy);
  }
  ctx.textBaseline = 'alphabetic';

  // merge smoke
  for (let i = mergeSmokes.length - 1; i >= 0; i--) {
    const s = mergeSmokes[i];
    s.timer -= 1 / 60;
    if (s.timer <= 0) { mergeSmokes.splice(i, 1); continue; }
    const pct = 1 - s.timer;
    const sx = s.x - cam.x, sy = s.y - cam.y;
    for (let r = 0; r < 3; r++) {
      const radius = 10 + (pct + r * 0.15) * 40;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, radius), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 160, 160, ${Math.max(0, 1 - pct - r * 0.25)})`;
      ctx.fill();
    }
  }

  // track blade history for swept-area debug visualization
  if (me && me.alive && localAnim) {
    const mex = me.px + (me.x - me.px) * alpha;
    const mey = me.py + (me.y - me.py) * alpha;
    const seg = getBladeSegment(me, mex - cam.x, mey - cam.y);
    if (seg) bladeHistory = seg;
  } else if (!localAnim) {
    bladeHistory = null;
  }

  // frame timing + diagnostics overlay
  frameTimeMs = performance.now() - rT0;
  fpsFrames++;
  const __n = performance.now();
  if (__n - fpsLast >= 500) {
    fpsValue = Math.round(fpsFrames * 1000 / (__n - fpsLast));
    fpsFrames = 0;
    fpsLast = __n;
  }
  if (__n - maxFrameAt > 2000) { maxFrameMs = frameTimeMs; maxFrameAt = __n; }
  else if (frameTimeMs > maxFrameMs) maxFrameMs = frameTimeMs;

  // Always-visible build watermark (ground truth for "are you on the latest version?").
  if (window.BUILD) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('b' + window.BUILD, 10, VH - 4);
    ctx.textBaseline = 'alphabetic';
  }
  drawDiag();
}

function drawDiag() {
  if (!showDiag) return;
  ctx.save();
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(6, 86, 200, 106);
  const ftCol = frameTimeMs > 20 ? '#ff9' : '#9fe';
  ctx.fillStyle = ftCol;
  ctx.fillText(`fps ${fpsValue}  frame ${frameTimeMs.toFixed(1)} (max ${maxFrameMs.toFixed(0)})`, 10, 90);
  ctx.fillStyle = ping < 80 ? '#9f9' : ping < 150 ? '#fe9' : '#f99';
  ctx.fillText(`ping ${ping}ms (max ${maxPing}ms)`, 10, 106);
  ctx.fillStyle = maxArrival < 100 ? '#9f9' : maxArrival < 160 ? '#fe9' : '#f99';
  ctx.fillText(`arrival ${Math.round(lastArrival)} (max ${Math.round(maxArrival)})`, 10, 122);
  ctx.fillStyle = maxSrvInterval < 80 ? '#9f9' : maxSrvInterval < 120 ? '#fe9' : '#f99';
  ctx.fillText(`srv ${Math.round(lastSrvInterval)} (max ${Math.round(maxSrvInterval)})`, 10, 138);
  ctx.fillStyle = maxFrameGap < 25 ? '#9f9' : maxFrameGap < 45 ? '#fe9' : '#f99';
  ctx.fillText(`rafgap 17 (max ${Math.round(maxFrameGap)})`, 10, 154);
  ctx.fillStyle = '#9fe';
  ctx.fillText(`pkt ${(lastPacketBytes / 1024).toFixed(1)}KB`, 10, 170);
  ctx.fillStyle = 'rgba(159,238,238,0.6)';
  ctx.fillText('[F] toggle diag', 10, 186);
  ctx.restore();
}
