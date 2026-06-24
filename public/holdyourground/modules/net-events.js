import { state } from './state.js';
import { resetKeys } from './input.js';
import { startRender, stopRender, generateBackground } from './render.js';
import { updateLeaderboard, updateHotbar } from './render-ui.js';
import { startAttackAnim, drawKnightPreview } from './render-entity.js';
import { callbacks } from './callback-registry.js';

const textDecoder = new TextDecoder();
const zombieMaxHealth = (lvl) => lvl <= 5 ? 4 + lvl : 12 + lvl;

function renderResults({ serverLevel, playerStats, wave }) {
  document.getElementById('resultsServerLevel').textContent = 'Server Level: ' + (serverLevel || 0);
  document.getElementById('resultsWave').textContent = wave || 0;
  const listEl = document.getElementById('resultsPlayerList');
  listEl.innerHTML = '';
  (playerStats || []).forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (i === 0 ? ' top-player' : '');
    row.innerHTML = '<span class="result-rank">#' + (i + 1) + '</span><span class="result-name">' + r.name + '</span><span class="result-stat">Lvl ' + r.level + '</span><span class="result-stat">' + r.kills + ' kills</span>';
    listEl.appendChild(row);
  });
}

function renderLobbyCards() {
  const players = state.lobbyPlayers;
  const hasAssets = state.knightSheet && state.knightFrames;
  for (let i = 0; i < 10; i++) {
    const card = document.querySelector(`.lobby-card[data-slot="${i}"]`);
    if (!card) continue;
    const nameEl = card.querySelector('.lobby-card-name');
    const expEl = card.querySelector('.lobby-card-exp');
    const canvas = card.querySelector('.lobby-card-preview');
    const ctx = canvas.getContext('2d');
    if (i < players.length) {
      const p = players[i];
      card.classList.remove('empty');
      nameEl.textContent = p.name;
      expEl.textContent = 'Exp: ' + (p.exp || 0);
      if (hasAssets) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawKnightPreview(ctx, canvas.width, canvas.height);
      }
    } else {
      card.classList.add('empty');
      nameEl.textContent = 'Waiting...';
      expEl.textContent = '';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

export function registerEvents(socket) {
  socket.on('guestJoined', (data) => { resetKeys(); if (callbacks.guestJoined) callbacks.guestJoined(data); });
  socket.on('authSuccess', (data) => { resetKeys(); if (callbacks.authSuccess) callbacks.authSuccess(data); });
  socket.on('authError', (msg) => { document.getElementById('errorMsg').textContent = msg; document.getElementById('errorMsg').classList.remove('hidden'); });
  socket.on('lobbyCount', ({ count }) => { if (callbacks.lobbyCount) callbacks.lobbyCount(count); });
  socket.on('roomList', (rooms) => { if (callbacks.roomList) callbacks.roomList(rooms); });
  socket.on('roomFull', () => { document.getElementById('errorMsg').textContent = 'Room is full'; });
  socket.on('error', (msg) => { document.getElementById('errorMsg').textContent = msg; });

  socket.on('init', ({ id, arenaWidth, arenaHeight }) => {
    state.myId = id;
    state.worldW = arenaWidth;
    state.worldH = arenaHeight;
  });

  socket.on('joined', async () => {
    resetKeys();
    state.players = {}; state.zombies = []; state.activePlayerCount = 0; state.lobbyPlayers = [];
    state.lbSig = ''; state.matchPhase = null; state.phaseTimer = 0; state.isSpectator = false;
    state.isDeadSpectating = false; state.queuedPlayers = []; state.spectatingTargetIndex = 0;
    state.localAnim = null; state.currentWave = 0; state.serverLevel = 0;
    state.dmgNumbers = []; state.mergeSmokes = []; state.zombieAnims = {};
    document.getElementById('joinGameBtn').classList.add('hidden');
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('errorMsg').textContent = '';
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    state.screen = 'joining';
  });

  socket.on('state', (msg) => {
    const u8 = msg instanceof ArrayBuffer ? new Uint8Array(msg) : new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    try {
      dv.getUint8(o); o += 1;
      const emitTime = dv.getFloat64(o, true); o += 8;
      const arenaW = dv.getUint16(o, true); o += 2;
      const arenaH = dv.getUint16(o, true); o += 2;
      const sLevel = dv.getUint16(o, true); o += 2;
      const playerCount = dv.getUint8(o); o += 1;
      const zombieCount = dv.getUint16(o, true); o += 2;

      const oldP = state.players;
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
        const nameLen = dv.getUint8(o); o += 1;
        const name = textDecoder.decode(u8.subarray(o, o + nameLen)); o += nameLen;
        const isSpectator = dv.getUint8(o) === 1; o += 1;

        const old = oldP[id];
        const meta = state.playerMeta[id] || {};
        const p = {
          id, x, y, health, alive, attacking, facingAngle, attackLockedAngle, attackStartTime, kills, lvl, name, isSpectator,
          color: meta.color || '#888888', currentItem: meta.currentItem || 'wooden_sword',
          inventory: meta.inventory || ['wooden_sword'], maxHealth: meta.maxHealth || 100,
          speed: meta.speed != null ? meta.speed : 13, attackDmg: meta.attackDmg != null ? meta.attackDmg : 5,
          attackSpeed: meta.attackSpeed != null ? meta.attackSpeed : 800
        };
        if (old && Math.abs(x - old.x) < 200 && Math.abs(y - old.y) < 200) { p.px = old.x; p.py = old.y; }
        else { p.px = x; p.py = y; }
        map[id] = p;
      }
      state.players = map;
      state.activePlayerCount = Object.keys(map).length;

      const oldZ = {};
      for (let i = 0; i < state.zombies.length; i++) oldZ[state.zombies[i].id] = state.zombies[i];
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
        const maxHealth = zombieMaxHealth(zlvl);
        const z = { id: zid, x: zx, y: zy, health: zhealth, maxHealth, headingAngle: zheading, lvl: zlvl, alive: zalive };
        if (old && Math.abs(zx - old.x) < 200 && Math.abs(zy - old.y) < 200) { z.px = old.x; z.py = old.y; }
        else { z.px = zx; z.py = zy; }
        z.label = zlvl > 1 ? 'zombie lvl ' + zlvl : 'zombie';
        newZombies.push(z);
      }
      state.zombies = newZombies;
      state.worldW = arenaW;
      state.worldH = arenaH;
      state.serverLevel = sLevel;
      state.prevSnapshotTime = state.snapshotTime || performance.now();
      state.snapshotTime = performance.now();
      const sNow = performance.now();
      if (state.lastStateAt) {
        const delta = sNow - state.lastStateAt;
        state.lastArrival = delta;
        if (sNow - state.maxArrivalAt > 2000) { state.maxArrival = delta; state.maxArrivalAt = sNow; }
        else if (delta > state.maxArrival) state.maxArrival = delta;
      }
      state.lastStateAt = sNow;
      if (state.lastEmitTime) {
        const ival = emitTime - state.lastEmitTime;
        state.lastSrvInterval = ival;
        if (sNow - state.maxSrvAt > 2000) { state.maxSrvInterval = ival; state.maxSrvAt = sNow; }
        else if (ival > state.maxSrvInterval) state.maxSrvInterval = ival;
      }
      state.lastEmitTime = emitTime;
      state.lastPacketBytes = u8.byteLength;
      updateLeaderboard();
      updateHotbar();
    } catch (e) {
      console.error('[HYG] state buffer error:', e);
      state.players = {}; state.zombies = [];
    }
  });

  socket.on('playerInfo', (info) => {
    state.playerMeta[info.id] = info;
    if (state.players[info.id]) {
      const p = state.players[info.id];
      p.name = info.name; p.color = info.color || '#888888';
      p.currentItem = info.currentItem || 'wooden_sword'; p.maxHealth = info.maxHealth || 100;
      p.speed = info.speed != null ? info.speed : 13;
      p.attackDmg = info.attackDmg != null ? info.attackDmg : 5;
      p.attackSpeed = info.attackSpeed != null ? info.attackSpeed : 800;
      state.lbSig = '';
      updateLeaderboard();
    }
  });
  socket.on('playerLeft', (id) => { delete state.playerMeta[id]; });

  socket.on('eliminated', ({ kills }) => {
    const active = state.matchPhase === 'daytime' || state.matchPhase === 'nighttime' || state.matchPhase === 'intermission' || state.matchPhase === 'waveOver';
    if (active) {
      state.isDeadSpectating = true;
      state.screen = 'playing'; state.level = 1; state.exp = 0; state.expToNext = 100; state.gold = 0;
    } else {
      stopRender();
      document.getElementById('elimKills').textContent = `Kills: ${kills}`;
      document.getElementById('eliminated').classList.remove('hidden');
      document.getElementById('menu').classList.add('hidden');
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('hotbarInventory').classList.add('hidden');
      document.getElementById('settingsBtn').classList.add('hidden');
      document.getElementById('settingsPanel').classList.add('hidden');
      document.getElementById('xpBar').classList.add('hidden');
      state.screen = 'eliminated';
    }
  });

  socket.on('respawned', () => {
    state.localAnim = null; state.isDeadSpectating = false; state.screen = 'playing';
    document.getElementById('menu').classList.add('hidden');
    ['eliminated', 'waitingRespawn'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['hud', 'hotbarInventory', 'settingsBtn', 'xpBar'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    updateXPBar(state.level, state.exp, state.expToNext);
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    startRender(socket);
  });

  socket.on('gotHit', () => { state.hitFlash = 8; });
  socket.on('hitConfirm', ({ dmg, x, y }) => { state.dmgNumbers.push({ x, y, dmg, timer: 1.2, duration: 1.2 }); });
  socket.on('zombieMerge', ({ x, y }) => { state.mergeSmokes.push({ x, y, timer: 1.0 }); });

  socket.on('accountUpdate', ({ exp, level, expToNext, gold }) => {
    state.exp = exp; state.level = level; state.expToNext = expToNext; state.gold = gold;
    updateXPBar(level, exp, expToNext);
  });

  socket.on('spectatorAssigned', () => {
    state.isSpectator = true;
    document.getElementById('joinGameBtn').classList.remove('hidden');
    document.getElementById('xpBar').classList.add('hidden');
  });

  socket.on('joinedGame', () => {
    state.isSpectator = false; state.isDeadSpectating = false;
    state.queuedPlayers = (state.queuedPlayers || []).filter(q => q.id !== state.myId);
    state.screen = 'playing'; state.level = 1; state.exp = 0; state.expToNext = 100; state.gold = 0;
    document.getElementById('joinGameBtn').classList.add('hidden');
    document.getElementById('xpBar').classList.remove('hidden');
    updateXPBar(1, 0, 100);
    stopRender();
    startRender(socket);
  });

  socket.on('queueUpdate', ({ queued, playerCount }) => {
    state.queuedPlayers = queued || [];
    if (playerCount != null) state.activePlayerCount = playerCount;
    state.lbSig = '';
    updateLeaderboard();
  });

  socket.on('attackStart', ({ lockedAngle }) => { startAttackAnim(lockedAngle); });

  socket.on('zombieAttackStart', ({ zombieId }) => {
    const anim = window.ZOMBIE_ANIMATIONS?.attack;
    if (anim) state.zombieAnims[zombieId] = { startTime: performance.now() };
  });

  socket.on('matchPhase', ({ phase, timer, wave, readyPlayers }) => {
    state.matchPhase = phase;
    state.phaseTimer = timer;
    state.phaseTimerStart = timer;
    state.phaseStartedAt = performance.now();
    state.currentWave = wave;
    if (readyPlayers) state.isSpectator = !readyPlayers.includes(state.myId);
    document.getElementById('startNowBtn').classList.toggle('hidden', phase !== 'waiting');
    document.getElementById('phaseDisplay').classList.toggle('hidden', phase === 'waiting' || phase === 'ended');
    const names = { daytime: 'Daytime', nighttime: 'Nighttime', waveOver: 'Clean Up', intermission: 'Intermission' };
    document.getElementById('phaseName').textContent = names[phase] || phase;

    if (phase === 'ended' && (state.screen === 'lobby' || state.screen === 'joining' || state.screen === 'results')) {
      document.getElementById('lobbyScreen').classList.remove('hidden');
      document.getElementById('startNowBtn').classList.add('hidden');
      document.getElementById('resultsOverlay').classList.remove('hidden');
      document.getElementById('resultsTimerValue').textContent = Math.ceil(timer / 1000);
      state.screen = 'results';
    } else if (phase !== 'waiting' && (state.screen === 'lobby' || state.screen === 'joining' || state.screen === 'results')) {
      document.getElementById('lobbyScreen').classList.add('hidden');
      if (state.screen !== 'results') document.getElementById('resultsOverlay').classList.add('hidden');
      document.getElementById('startNowBtn').classList.add('hidden');
      enterGame(socket);
    } else if (phase === 'waiting' && (state.screen === 'lobby' || state.screen === 'joining' || state.screen === 'results')) {
      document.getElementById('lobbyScreen').classList.remove('hidden');
      document.getElementById('resultsOverlay').classList.add('hidden');
      state.screen = 'lobby';
    }
  });

  socket.on('matchEnd', ({ wave, timer, serverLevel, playerStats, lobbyPlayers }) => {
    stopRender();
    state.matchPhase = 'ended'; state.isDeadSpectating = false;
    document.getElementById('lobbyScreen').classList.remove('hidden');
    document.getElementById('resultsOverlay').classList.remove('hidden');
    ['phaseDisplay', 'startNowBtn', 'waitingRespawn'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['menu', 'eliminated'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['hud', 'hotbarInventory', 'settingsBtn', 'settingsPanel', 'xpBar'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('resultsTimerValue').textContent = Math.ceil((timer || 30000) / 1000);
    document.getElementById('lobbyStartBtn').classList.add('hidden');
    state.lobbyPlayers = [];
    renderLobbyCards();
    renderResults({ serverLevel, playerStats, wave });
    document.getElementById('resultsPlayAgainBtn').textContent = state.isSpectator ? 'Join Queue' : 'Play Again';
    state.screen = 'results';
  });

  socket.on('matchReset', ({ readyPlayers }) => {
    const isReady = readyPlayers && readyPlayers.includes(state.myId);
    if (state.screen === 'results' && !isReady) return;
    state.matchPhase = 'waiting'; state.phaseTimer = 0; state.phaseTimerStart = 0; state.phaseStartedAt = 0;
    state.currentWave = 0; state.screen = 'lobby';
    document.getElementById('phaseDisplay').classList.add('hidden');
    ['startNowBtn', 'resultsOverlay', 'waitingRespawn', 'eliminated'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['hud', 'hotbarInventory', 'settingsBtn', 'xpBar'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('lobbyScreen').classList.remove('hidden');
    document.getElementById('lobbyStartBtn').classList.remove('hidden');
  });

  socket.on('lobbyUpdate', ({ players }) => {
    state.lobbyPlayers = players;
    renderLobbyCards();
  });

  socket.on('endGameLobby', ({ players, ready, timer, allReady }) => {
    const readySet = new Set(ready || []);
    state.lobbyPlayers = (players || []).filter(p => readySet.has(p.id));
    renderLobbyCards();
    document.getElementById('resultsTimerValue').textContent = Math.max(0, Math.ceil(timer / 1000));
    const startBtn = document.getElementById('lobbyStartBtn');
    if (startBtn) startBtn.classList.toggle('hidden', !allReady);
  });

  socket.on('diagPong', (t) => {
    state.ping = Date.now() - t;
    const now = performance.now();
    if (now - state.maxPingAt > 2000) { state.maxPing = state.ping; state.maxPingAt = now; }
    else if (state.ping > state.maxPing) state.maxPing = state.ping;
  });
}

function updateXPBar(level, currentXP, xpToNextLevel) {
  const xpBar = document.getElementById('xpBar');
  if (!xpBar || xpBar.classList.contains('hidden')) return;
  const percent = Math.max(0, Math.min(100, (currentXP / xpToNextLevel) * 100));
  document.getElementById('levelBadge').textContent = level;
  document.getElementById('xpFill').style.width = `${percent}%`;
  document.getElementById('xpText').textContent = `${currentXP.toLocaleString()} / ${xpToNextLevel.toLocaleString()} XP`;
  document.getElementById('xpPercent').textContent = `${Math.round(percent)}%`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadGameAssets() {
  const [sheet, meta, kSheet, kMeta] = await Promise.all([
    loadImage('/images/spritesheet.png'),
    fetch('/images/spritesheet.json').then(r => r.json()),
    loadImage('/images/KnightSheet.png'),
    fetch('/images/KnightSheet.json').then(r => r.json())
  ]);
  state.spriteSheet = sheet;
  state.spriteFrames = meta.frames;
  state.knightSheet = kSheet;
  state.knightFrames = kMeta.frames;

  const gearFrame = state.spriteFrames?.['settingsgear.png']?.frame;
  if (gearFrame) {
    const c = document.createElement('canvas');
    c.width = gearFrame.w; c.height = gearFrame.h;
    const cx = c.getContext('2d');
    cx.drawImage(state.spriteSheet, gearFrame.x, gearFrame.y, gearFrame.w, gearFrame.h, 0, 0, gearFrame.w, gearFrame.h);
    const img = document.getElementById('settingsGearImg');
    if (img) img.src = c.toDataURL();
  }
}

let assetsLoaded = false;
let assetsPromise = null;

function ensureAssets() {
  if (assetsLoaded) return Promise.resolve();
  if (!assetsPromise) {
    assetsPromise = loadGameAssets().then(() => { assetsLoaded = true; }).catch(e => {
      assetsPromise = null;
      console.error('[HYG] asset load failed:', e);
      throw e;
    });
  }
  return assetsPromise;
}

async function enterGame(socket) {
  try { await ensureAssets(); } catch (e) {
    document.getElementById('loadingOverlay').classList.add('hidden');
    socket.emit('leaveRoom');
    return;
  }
  if (!state.backgroundCanvas) {
    state.backgroundCanvas = generateBackground(state.worldW, state.worldH);
    state.backgroundCanvasLight = generateBackground(state.worldW, state.worldH, '#e8e4d8');
  }
  state.screen = 'playing';
  state.level = 1; state.exp = 0; state.expToNext = 100; state.gold = 0;
  document.getElementById('eliminated').classList.add('hidden');
  ['hud', 'hotbarInventory', 'settingsBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  if (!state.isSpectator) {
    document.getElementById('xpBar').classList.remove('hidden');
    updateXPBar(state.level, state.exp, state.expToNext);
  }
  startRender(socket);
}
