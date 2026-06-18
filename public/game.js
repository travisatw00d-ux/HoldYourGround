const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const VW = 800;
const VH = 600;
canvas.width = VW;
canvas.height = VH;

let socket = io();

let myId = null;
let worldW = 0;
let worldH = 0;
let players = {};
let zombies = [];
let screen = 'menu';
let backgroundCanvas = null;

let animFrame = null;
let inputInterval = null;

let hitFlash = 0;
let mouseX = 0;
let mouseY = 0;
let localAnim = null;
let debugHitbox = false;
let dmgNumbers = [];
let mergeSmokes = [];

const swordImg = new Image();
swordImg.src = '/images/woodensword.png';

const zombieHeadImg = new Image();
zombieHeadImg.src = '/images/zombiehead.png';

const zombieLeftHandImg = new Image();
zombieLeftHandImg.src = '/images/zombielefthand.png';

const zombieRightHandImg = new Image();
zombieRightHandImg.src = '/images/zombierighthand.png';

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
  if (!me) { hotbarEl.innerHTML = ''; return; }
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

function getCamera() {
  const me = players[myId];
  if (!me) return { x: 0, y: 0 };
  return {
    x: clamp(me.x - VW / 2, 0, Math.max(0, worldW - VW)),
    y: clamp(me.y - VH / 2, 0, Math.max(0, worldH - VH))
  };
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

  function loop() {
    if (screen === 'playing') {
      render();
      animFrame = requestAnimationFrame(loop);
    }
  }
  loop();
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

function drawZombieHand(ctx, z, szx, szy, angle, handKey) {
  const vis = window.ZOMBIE_VISUALS && window.ZOMBIE_VISUALS[handKey];
  if (!vis) return;
  const img = handKey === 'left_hand' ? zombieLeftHandImg : zombieRightHandImg;
  if (!img.complete || img.naturalWidth === 0) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const sw = img.naturalWidth * vis.scale;
  const sh = img.naturalHeight * vis.scale;
  ctx.save();
  ctx.translate(szx + rx, szy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
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
  ctx.drawImage(swordImg, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, VW, VH);

  const cam = getCamera();

  // compute local facing at full frame rate from mouse (locked during attack)
  const me = players[myId];
  if (me && me.alive) {
    const target = Math.atan2((mouseY + cam.y) - me.y, (mouseX + cam.x) - me.x);
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
  for (const z of zombies) {
    if (!z.alive) continue;
    const szx = z.x - cam.x, szy = z.y - cam.y;
    if (szx < -40 || szx > VW + 40 || szy < -40 || szy > VH + 40) continue;

    // facing angle from server (computed from target direction)
    const zombieAngle = z.headingAngle || 0;

    if (zombieHeadImg.complete && zombieHeadImg.naturalWidth > 0) {
      ctx.save();
      const sz = 40 / Math.max(zombieHeadImg.naturalWidth, zombieHeadImg.naturalHeight);
      const w = zombieHeadImg.naturalWidth * sz;
      const h = zombieHeadImg.naturalHeight * sz;
      ctx.translate(szx, szy);
      ctx.rotate(zombieAngle - Math.PI / 2);
      ctx.drawImage(zombieHeadImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand');
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand');

    ctx.fillStyle = '#ff6666';
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const zombieLabel = 'zombie' + (z.lvl && z.lvl > 1 ? ' lvl ' + z.lvl : '');
    ctx.fillText(zombieLabel, szx, szy - 30);
    drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
  }

  const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
  const topKills = sorted.length > 0 ? sorted[0].kills : 0;

  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    const sx = p.x - cam.x;
    const sy = p.y - cam.y;

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
    const seg = getBladeSegment(me, me.x - cam.x, me.y - cam.y);
    if (seg) bladeHistory = seg;
  } else if (!localAnim) {
    bladeHistory = null;
  }
}
