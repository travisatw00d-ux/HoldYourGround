import { state } from './state.js';
import { resetKeys } from './input.js';
import { startRender, stopRender, generateBackground } from './render.js';
import { updateLeaderboard } from './render-ui.js';
import { startAttackAnim } from './render-entity.js';
import { callbacks } from './callback-registry.js';

const textDecoder = new TextDecoder();
const MOB_NAMES = (window.MOB_TYPES || []).map(m => m.name);

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
  const frameData = state.cardFrames?.['KnightCard.png'];
  const hasAssets = state.cardSheet && frameData;
  const nameColors = { guest: '#eee', basic: '#228B22', admin: '#FFD700' };
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
      nameEl.style.color = nameColors[p.accountType] || '#eee';
      expEl.textContent = 'Exp: ' + (p.exp || 0);
      if (hasAssets) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const f = frameData.frame;
        const scale = Math.min(canvas.width / f.w, canvas.height / f.h);
        const dw = f.w * scale;
        const dh = f.h * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(state.cardSheet, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
      }
    } else {
      card.classList.add('empty');
      nameEl.textContent = 'Waiting...';
      nameEl.style.color = '';
      expEl.textContent = '';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

function updateJoinButton() {
  const btn = document.getElementById('joinGameBtn');
  if (state.screen === 'menu' || state.screen === 'eliminated' || state.screen === 'results') {
    btn.classList.add('hidden');
    return;
  }
  if (state.screen === 'playing' && !state.isSpectator && !state.isDeadSpectating) {
    btn.classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');
  const myEntry = (state.queuedPlayers || []).find(q => q.id === state.myId);
  if (myEntry && myEntry.pos > 0) {
    btn.textContent = myEntry.pos === 1 ? 'In queue: next in line' : 'In queue: ' + (myEntry.pos - 1) + ' ahead';
  } else if (myEntry) {
    btn.textContent = 'In queue: waiting for slot...';
  } else if (state.isDeadSpectating) {
    btn.textContent = 'Waiting for daytime...';
  } else if (state.isSpectator) {
    btn.textContent = state.matchPhase === 'ended' ? 'Join Queue' : 'Join Game';
  } else if (state.matchPhase === 'waiting') {
    btn.classList.add('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

let nwpTimer = null;

function showNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  clearTimeout(nwpTimer);
  popup.classList.remove('out', 'expanded');
  tab.classList.add('hidden');
  document.getElementById('nwpOverlay').classList.remove('visible');
  void popup.offsetWidth;
  popup.classList.remove('hidden');
  popup.classList.add('in');
  document.getElementById('nwpTitle').textContent = state.matchPhase === 'nighttime' ? 'THIS WAVE' : 'NEXT WAVE';
}

state._showNWPopup = showNWPopup;
export { showNWPopup };

export function toggleNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup) return;
  if (popup.classList.contains('in') || popup.classList.contains('expanded')) {
    collapseNWTab();
  } else if (tab && !tab.classList.contains('hidden')) {
    reopenNWFromTab();
  } else if (state.waveComposition && state.waveComposition.enemies) {
    populateNWRows(state.waveComposition.enemies);
    const sl = state.waveComposition.serverLevel || '—';
    document.getElementById('nwpSL').textContent = sl;
    document.getElementById('dSL').textContent = sl;
    document.getElementById('nwpWave').textContent = state.waveComposition.wave;
    document.getElementById('dWave').textContent = state.waveComposition.wave;
    showNWPopup();
    if (state.matchPhase === 'nighttime') updateNWCounts();
  }
}

function collapseNWTab() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  popup.classList.remove('in', 'expanded');
  popup.classList.add('out');
  document.getElementById('nwpOverlay').classList.remove('visible');
  setTimeout(() => {
    if (!popup.classList.contains('in') && !popup.classList.contains('expanded')) {
      popup.classList.add('hidden');
      tab.classList.remove('hidden');
    }
  }, 300);
}

function expandNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  if (!popup) return;
  clearTimeout(nwpTimer);
  popup.classList.add('expanded');
  document.getElementById('nwpOverlay').classList.add('visible');
}

function reopenNWFromTab() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  clearTimeout(nwpTimer);
  tab.classList.add('hidden');
  popup.classList.remove('hidden', 'out');
  void popup.offsetWidth;
  popup.classList.add('in');
  document.getElementById('nwpTitle').textContent = state.matchPhase === 'nighttime' ? 'THIS WAVE' : 'NEXT WAVE';
  if (state.matchPhase === 'nighttime') updateNWCounts();
}

export function resetWavePopup() {
  clearTimeout(nwpTimer);
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  const overlay = document.getElementById('nwpOverlay');
  if (popup) { popup.classList.remove('in', 'expanded', 'out'); popup.classList.add('hidden'); }
  if (tab) tab.classList.add('hidden');
  if (overlay) overlay.classList.remove('visible');
  state.waveComposition = null;
}

function hideNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  clearTimeout(nwpTimer);
  popup.classList.remove('in', 'expanded');
  popup.classList.add('hidden');
  tab.classList.add('hidden');
  document.getElementById('nwpOverlay').classList.remove('visible');
}

function populateNWRows(enemies) {
  const mobTypes = window.MOB_TYPES || [];
  const list = document.getElementById('nwpList');
  const grid = document.getElementById('nwpGrid');
  if (!list || !grid) return;

  const expanded = enemies.map(e => {
    const mt = mobTypes[e.mobType];
    const name = mt ? mt.name : 'UNKNOWN';
    let iconHtml = mt && mt.emoji ? mt.emoji : '●';
    if (mt && mt.id && state.miniIcons && state.miniIcons[mt.id]) {
      iconHtml = '<img src="' + state.miniIcons[mt.id] + '" alt="' + mt.name + '">';
    }
    return { iconHtml, name, count: e.count };
  });
  expanded.sort((a, b) => b.count - a.count);

  const top3 = expanded.slice(0, 3);
  const rest = expanded.slice(3);

  let total = expanded.reduce((s, e) => s + e.count, 0);
  document.getElementById('nwpTotal').textContent = total;
  document.getElementById('dTotal').textContent = total;
  document.getElementById('dTypes').textContent = enemies.length;

  list.innerHTML = top3.map(e =>
    '<div class="nwp-row"><div class="icon">' + e.iconHtml + '</div><span class="name">' + e.name + '</span><span class="count">&times;' + e.count + '</span></div>'
  ).join('');
  document.getElementById('nwpMore').textContent = rest.length > 0 ? '+ ' + rest.length + ' other types' : '';

  grid.innerHTML = expanded.map(e =>
    '<div class="grid-cell"><div class="icon">' + e.iconHtml + '</div><span class="name">' + e.name + '</span><span class="count">&times;' + e.count + '</span></div>'
  ).join('');
}

function updateNWCounts() {
  const popup = document.getElementById('nextWavePopup');
  if (!popup || !popup.classList.contains('in') || state.matchPhase !== 'nighttime' || !state.waveComposition) return;
  const mobTypes = window.MOB_TYPES || [];
  const totalEverSpawned = state._totalZombieCount || 0;

  // Count alive per type (what the client can see)
  const aliveCounts = {};
  for (const z of state.zombies) { if (z.alive) aliveCounts[z.mobType] = (aliveCounts[z.mobType] || 0) + 1; }

  const list = document.getElementById('nwpList');
  const incomingList = document.getElementById('nwpIncomingList');
  const incomingSection = document.getElementById('nwpIncoming');
  if (!list || !incomingList || !incomingSection) return;

  // totalPlanned = what the wave is supposed to contain
  // totalDead = totalEverSpawned - serverRealAlive (from server, not view-culled)
  // remaining = totalPlanned - totalDead (total wave minus dead = still to be killed)
  const poolTotal = state.waveComposition.enemies.reduce((s, e) => s + e.count, 0);
  const serverRealAlive = state._serverAlive || 0;
  const totalDead = Math.max(0, totalEverSpawned - serverRealAlive);
  const grandRemaining = Math.max(0, poolTotal - totalDead);
  if (totalEverSpawned !== state._lastNWLog) {
    state._lastNWLog = totalEverSpawned;
    console.log('[NW] poolTotal=' + poolTotal + ' totalSpawned=' + totalEverSpawned + ' serverAlive=' + serverRealAlive + ' totalDead=' + totalDead + ' rem=' + grandRemaining);
  }
  document.getElementById('nwpTotal').textContent = grandRemaining;
  document.getElementById('dTotal').textContent = grandRemaining;

  // Per type: remaining = target - proportionalDead
  const rows = state.waveComposition.enemies.map(e => {
    const mt = mobTypes[e.mobType];
    const dead = poolTotal > 0 ? Math.min(e.count, Math.round(totalDead * (e.count / poolTotal))) : 0;
    const remaining = Math.max(0, e.count - dead);
    let iconHtml = mt && mt.emoji ? mt.emoji : '●';
    if (mt && mt.id && state.miniIcons && state.miniIcons[mt.id]) {
      iconHtml = '<img src="' + state.miniIcons[mt.id] + '" alt="' + mt.name + '">';
    }
    return { iconHtml, name: mt ? mt.name : 'UNKNOWN', remaining, target: e.count, mobType: e.mobType };
  });
  rows.sort((a, b) => b.remaining - a.remaining);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  list.innerHTML = top3.map(r =>
    '<div class="nwp-row"><div class="icon">' + r.iconHtml + '</div><span class="name">' + r.name + '</span><span class="count">&times;' + r.remaining + '</span></div>'
  ).join('');
  document.getElementById('nwpMore').textContent = rest.length > 0 ? '+ ' + rest.length + ' other types' : '';

  // Incoming section — how many haven't been spawned yet (based on server's totalEverSpawned)
  const incomingTotal = Math.max(0, poolTotal - totalEverSpawned);
  if (incomingTotal > 0 && poolTotal > 0) {
    incomingSection.style.display = '';
    incomingList.innerHTML = rows.map(r => {
      const inc = Math.max(0, Math.round(incomingTotal * (r.target / poolTotal)));
      return inc > 0 ? '<div class="nwp-inc-row"><div class="icon">' + r.iconHtml + '</div><span class="name">' + r.name + '</span><span class="count">&times;' + inc + '</span></div>' : '';
    }).join('');
  } else {
    incomingSection.style.display = 'none';
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
    state.dmgNumbers = []; state.zombieAnims = {}; state.waveComposition = null;
    hideNWPopup();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('resultsOverlay').classList.add('hidden');
    document.getElementById('loadingOverlay').classList.remove('hidden');
    document.getElementById('errorMsg').textContent = '';
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    state.screen = 'joining';
    state._joinedEnded = true;
  });

  socket.on('state', (msg) => {
    state._lastStateTime = performance.now();
    if (state.isSpectator && state.screen === 'playing') {
      if (!state._diagStateLast || performance.now() - state._diagStateLast > 5000) {
        state._diagStateLast = performance.now();
        socket.emit('clientDiag', { event: 'stateArrival', isSpectator: state.isSpectator, screen: state.screen, bytes: msg.byteLength || msg.length });
      }
    }
    const u8 = msg instanceof ArrayBuffer ? new Uint8Array(msg) : new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    let playerCount = 0, zombieCount = 0;
    try {
      dv.getUint8(o); o += 1;
      const emitTime = dv.getFloat64(o, true); o += 8;
      const arenaW = dv.getUint16(o, true); o += 2;
      const arenaH = dv.getUint16(o, true); o += 2;
      const sLevel = dv.getUint16(o, true); o += 2;
      playerCount = dv.getUint8(o); o += 1;
      zombieCount = dv.getUint16(o, true); o += 2;
      const totalZombies = dv.getUint16(o, true); o += 2;
      state._totalZombieCount = totalZombies;
      const serverAlive = dv.getUint16(o, true); o += 2;
      state._serverAlive = serverAlive;
      state.isSpectator = dv.getUint8(o) === 1; o += 1;

      const camZoom = dv.getFloat32(o, true); o += 4;
      const zpViewW = dv.getUint16(o, true); o += 2;
      const zpViewH = dv.getUint16(o, true); o += 2;
      if (state.isSpectator && camZoom > 0) {
        const playerGameW = zpViewW / camZoom;
        const playerGameH = zpViewH / camZoom;
        state.cameraZoom = Math.min(state.viewW / playerGameW, state.viewH / playerGameH);
      }

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
        const energy = dv.getInt16(o, true); o += 2;
        const maxEnergy = dv.getInt16(o, true); o += 2;
        const nameLen = dv.getUint8(o); o += 1;
        const name = textDecoder.decode(u8.subarray(o, o + nameLen)); o += nameLen;
        const isSpectator = dv.getUint8(o) === 1; o += 1;

        const old = oldP[id];
        const meta = state.playerMeta[id] || {};
        const p = {
          id, x, y, health, alive, attacking, facingAngle, attackLockedAngle, attackStartTime, kills, lvl, name, isSpectator,
          energy, maxEnergy,
          color: meta.color || '#888888', currentItem: meta.currentItem || 'wooden_sword',
          inventory: meta.inventory || ['wooden_sword'], maxHealth: meta.maxHealth || 100,
          speed: meta.speed != null ? meta.speed : 13, attackDmg: meta.attackDmg != null ? meta.attackDmg : 5,
          attackSpeed: meta.attackSpeed != null ? meta.attackSpeed : 800
        };
        if (old && Math.abs(x - old.x) < 200 && Math.abs(y - old.y) < 200) { p.px = old.x; p.py = old.y; p.pfacingAngle = old.facingAngle; }
        else { p.px = x; p.py = y; p.pfacingAngle = facingAngle; }
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
        const zmaxHealth = dv.getInt16(o, true); o += 2;
        const zheading = dv.getFloat32(o, true); o += 4;
        const zlvl = dv.getUint8(o); o += 1;
        const zmobType = dv.getUint8(o); o += 1;
        const zalive = dv.getUint8(o) === 1; o += 1;
        const old = oldZ[zid];
        const mobTypeName = (window.MOB_TYPES && window.MOB_TYPES[zmobType]) ? window.MOB_TYPES[zmobType].name : 'Unknown';
        const z = { id: zid, x: zx, y: zy, health: zhealth, maxHealth: zmaxHealth, headingAngle: zheading, lvl: zlvl, mobType: zmobType, alive: zalive };
        if (old && Math.abs(zx - old.x) < 200 && Math.abs(zy - old.y) < 200) { z.px = old.x; z.py = old.y; }
        else { z.px = zx; z.py = zy; }
        z.label = zlvl > 1 ? mobTypeName + ' lvl ' + zlvl : mobTypeName;
        newZombies.push(z);
      }
      state.zombies = newZombies;
      updateNWCounts();
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
    } catch (e) {
      console.error(`[HYG] state buffer error at offset=${o} playerCount=${playerCount} zombieCount=${zombieCount} bytes=${u8.byteLength}:`, e);
      state.players = {}; state.zombies = [];
    }
  });

  socket.on('playerInfo', (info) => {
    state.playerMeta[info.id] = info;
    if (info.id === state.myId && info.isSpectator != null) {
      state.isSpectator = info.isSpectator;
      updateJoinButton();
    }
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
    if (state.screen === 'menu') return;
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
      state.screen = 'eliminated';
    }
  });

  socket.on('respawned', () => {
    state.localAnim = null; state.isDeadSpectating = false; state.screen = 'playing';
    document.getElementById('menu').classList.add('hidden');
    ['eliminated', 'waitingRespawn'].forEach(id => document.getElementById(id).classList.add('hidden'));
  ['hud', 'settingsBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    startRender(socket);
  });

  socket.on('gotHit', () => { state.hitFlash = 8; });
  socket.on('hitConfirm', ({ dmg, x, y }) => { state.dmgNumbers.push({ x, y, dmg, timer: 1.2, duration: 1.2 }); });

  socket.on('accountUpdate', ({ exp, level, expToNext, gold }) => {
    state.exp = exp; state.level = level; state.expToNext = expToNext; state.gold = gold;
  });

  socket.on('spectatorAssigned', () => {
    state.isSpectator = true;
    state.isDeadSpectating = false;
    state._joinedEnded = false;
    if (state.screen === 'results') {
      enterGame(socket);
    }
    updateJoinButton();
  });

  socket.on('joinedGame', ({ isDead } = {}) => {
    state._joinedEnded = false;
    state.isSpectator = false;
    state.isDeadSpectating = !!isDead;
    state.queuedPlayers = (state.queuedPlayers || []).filter(q => q.id !== state.myId);
    state.screen = 'playing'; state.level = 1; state.exp = 0; state.expToNext = 100; state.gold = 0;
    updateJoinButton();
    stopRender();
    startRender(socket);
  });

  socket.on('queueUpdate', ({ queued, playerCount }) => {
    state.queuedPlayers = queued || [];
    if (playerCount != null) state.activePlayerCount = playerCount;
    document.getElementById('lobbyActiveCount').textContent = playerCount || 0;
    document.getElementById('lobbyQueueCount').textContent = (queued || []).length;
    document.getElementById('lobbyQueueInfo').classList.remove('hidden');
    const myQ = (queued || []).find(q => q.id === state.myId);
    const posEl = document.getElementById('lobbyQueuePos');
    if (posEl) {
      if (myQ && myQ.pos > 0) {
        posEl.textContent = 'You are ' + myQ.pos + '. in queue';
        posEl.classList.remove('hidden');
      } else if (myQ) {
        posEl.textContent = 'In queue: waiting for slot...';
        posEl.classList.remove('hidden');
      } else {
        posEl.classList.add('hidden');
      }
    }
    state.lbSig = '';
    updateLeaderboard();
    updateJoinButton();
    socket.emit('clientDiag', { event: 'queueUpdate', isSpectator: state.isSpectator, screen: state.screen, matchPhase: state.matchPhase, queued: (queued || []).length, myPos: myQ?.pos });
  });

  socket.on('attackStart', ({ lockedAngle }) => { startAttackAnim(lockedAngle); });

  socket.on('zombieAttackStart', ({ zombieId }) => {
    const anim = window.ZOMBIE_ANIMATIONS?.attack;
    if (anim) state.zombieAnims[zombieId] = { startTime: performance.now() };
  });

  socket.on('matchPhase', async ({ phase, timer, wave, readyPlayers, activePlayers }) => {
    state.matchPhase = phase;
    state.phaseTimer = timer;
    state.phaseTimerStart = timer;
    state.phaseStartedAt = performance.now();
    if (phase === 'nighttime') state.waveStartTime = performance.now();
    state.currentWave = wave;
    if (activePlayers) state.isSpectator = !activePlayers.includes(state.myId);
    document.getElementById('phaseDisplay').classList.add('hidden');
    document.getElementById('nwpTitle').textContent = phase === 'nighttime' ? 'THIS WAVE' : 'NEXT WAVE';

    if (phase === 'ended' && (state.screen === 'lobby' || state.screen === 'joining' || state.screen === 'results' || state.screen === 'playing')) {
      document.getElementById('loadingOverlay').classList.add('hidden');
      if (state._joinedEnded || state.isSpectator) {
        document.getElementById('loadingOverlay').classList.remove('hidden');
        await ensureAssets();
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        document.getElementById('resultsOverlay').classList.add('hidden');
        document.getElementById('lobbyTimer').classList.remove('hidden');
        document.getElementById('lobbyTimerValue').textContent = Math.ceil(timer / 1000);
        document.getElementById('lobbyStartBtn').classList.add('hidden');
        state.screen = 'lobby';
        state.isSpectator = true;
        state.isDeadSpectating = false;
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('hotbarInventory').classList.add('hidden');
        renderLobbyCards();
        updateJoinButton();
        return;
      }
      document.getElementById('lobbyScreen').classList.remove('hidden');
      document.getElementById('resultsOverlay').classList.remove('hidden');
      document.getElementById('resultsTimerValue').textContent = Math.ceil(timer / 1000);
      state.screen = 'results';
    } else if (phase !== 'waiting' && (state.screen === 'lobby' || state.screen === 'joining' || state.screen === 'results')) {
      document.getElementById('lobbyScreen').classList.add('hidden');
      if (state.screen !== 'results') {
        document.getElementById('resultsOverlay').classList.add('hidden');
        console.log('[HYG] enterGame trigger', { phase, screen: state.screen, isSpec: state.isSpectator, myId: state.myId, rp: readyPlayers?.length });
        enterGame(socket);
      } else {
        document.getElementById('resultsPlayAgainBtn').textContent = 'Spectate';
      }
    } else if (phase === 'waiting' && (state.screen === 'lobby' || state.screen === 'joining' || state.screen === 'results')) {
      await ensureAssets();
      document.getElementById('loadingOverlay').classList.add('hidden');
      ['eliminated', 'waitingRespawn', 'settingsPanel', 'phaseDisplay', 'hud', 'hotbarInventory'].forEach(id => document.getElementById(id).classList.add('hidden'));
      document.getElementById('lobbyScreen').classList.remove('hidden');
      document.getElementById('lobbyStartBtn').classList.toggle('hidden', !!state.isSpectator);
      document.getElementById('resultsOverlay').classList.add('hidden');
      state.screen = 'lobby';
      renderLobbyCards();
    }
    updateJoinButton();
    if (!document.getElementById('resultsOverlay').classList.contains('hidden')) {
      document.getElementById('joinGameBtn').classList.add('hidden');
    }
    socket.emit('clientDiag', { event: 'matchPhase', phase, isSpectator: state.isSpectator, screen: state.screen, _joinedEnded: state._joinedEnded });
  });

  socket.on('waveComposition', (data) => {
    state.waveComposition = data;
    state._wavePopupTriggered = false;
    if (state.screen !== 'playing') return;
    const sl = data.serverLevel || '—';
    document.getElementById('nwpSL').textContent = sl;
    document.getElementById('dSL').textContent = sl;
    document.getElementById('nwpWave').textContent = data.wave;
    document.getElementById('dWave').textContent = data.wave;
    populateNWRows(data.enemies);
    document.getElementById('nextWaveTab')?.classList.remove('hidden');
  });

  // Popup click bindings (wired once)
  if (!window._nwpBound) {
    window._nwpBound = true;
    document.addEventListener('click', function(e) {
      const popup = document.getElementById('nextWavePopup');
      const overlay = document.getElementById('nwpOverlay');
      const tab = document.getElementById('nextWaveTab');

      // Tab click → reopen
      if (tab && !tab.classList.contains('hidden') && tab.contains(e.target)) {
        reopenNWFromTab();
        return;
      }
      // Close button → collapse to tab
      if (popup && e.target.closest('#nwpClose')) {
        collapseNWTab();
        return;
      }
      // Popup click (not grid, not close) → toggle expand
      if (popup && popup.classList.contains('in') && popup.contains(e.target) && !e.target.closest('.nwp-grid')) {
        expandNWPopup();
        return;
      }
      // Overlay click → collapse to tab
      if (overlay && overlay.classList.contains('visible') && overlay.contains(e.target)) {
        collapseNWTab();
        return;
      }
    });
  }

  socket.on('matchEnd', ({ wave, timer, serverLevel, playerStats, lobbyPlayers }) => {
    if (state._joinedEnded || state.isSpectator) {
      state._joinedEnded = false;
      state.isDeadSpectating = false;
      return;
    }
    if (state.screen === 'menu') return;
    state.waveComposition = null; hideNWPopup();
    stopRender();
    state.matchPhase = 'ended'; state.isDeadSpectating = false;
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('resultsOverlay').classList.remove('hidden');
    ['phaseDisplay', 'waitingRespawn'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['menu', 'eliminated'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('joinGameBtn').classList.add('hidden');
    ['hud', 'hotbarInventory', 'settingsBtn', 'settingsPanel'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('resultsTimerValue').textContent = Math.ceil((timer || 30000) / 1000);
    document.getElementById('lobbyStartBtn').classList.add('hidden');
    renderResults({ serverLevel, playerStats, wave });
    document.getElementById('resultsPlayAgainBtn').textContent = state.screen === 'results' ? 'Spectate' : 'Play Again';
    state.screen = 'results';
  });

  socket.on('matchReset', ({ readyPlayers, activePlayers }) => {
    if (state.screen === 'menu') return;
    state.waveComposition = null; hideNWPopup();
    const isReady = readyPlayers && readyPlayers.includes(state.myId);
    if (state.screen === 'results' && !isReady) return;
    if (activePlayers) state.isSpectator = !activePlayers.includes(state.myId);
    document.getElementById('loadingOverlay').classList.add('hidden');
    state.matchPhase = 'waiting'; state.phaseTimer = 0; state.phaseTimerStart = 0; state.phaseStartedAt = 0;
    state.currentWave = 0; state.screen = 'lobby';
    document.getElementById('phaseDisplay').classList.add('hidden');
    ['resultsOverlay', 'waitingRespawn', 'eliminated'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('lobbyTimer').classList.add('hidden');
    document.getElementById('lobbyQueueInfo').classList.add('hidden');
    document.getElementById('lobbyQueuePos').classList.add('hidden');
    ['hud', 'hotbarInventory', 'settingsBtn'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('lobbyScreen').classList.remove('hidden');
    document.getElementById('lobbyStartBtn').classList.toggle('hidden', !!state.isSpectator);
    updateJoinButton();
    socket.emit('clientDiag', { event: 'matchReset', isSpectator: state.isSpectator, screen: state.screen, matchPhase: 'waiting', _joinedEnded: state._joinedEnded });
  });

  socket.on('lobbyUpdate', ({ players }) => {
    state.lobbyPlayers = players;
    renderLobbyCards();
  });

  socket.on('endGameLobby', ({ players, ready, timer, allReady }) => {
    // Player clicked Play Again — show lobby, hide results
    const serverReady = new Set(ready || []);
    if (state.screen === 'results' && serverReady.has(state.myId)) {
      document.getElementById('resultsOverlay').classList.add('hidden');
      document.getElementById('lobbyScreen').classList.remove('hidden');
      document.getElementById('lobbyStartBtn').classList.add('hidden');
      state.screen = 'lobby';
    }
    // Refresh lobby state (always runs)
    document.getElementById('resultsTimerValue').textContent = Math.max(0, Math.ceil(timer / 1000));
    document.getElementById('lobbyTimerValue').textContent = Math.max(0, Math.ceil(timer / 1000));
    document.getElementById('lobbyTimer').classList.remove('hidden');
    const startBtn = document.getElementById('lobbyStartBtn');
    if (startBtn) startBtn.classList.toggle('hidden', !allReady || state.isSpectator);
  });

  socket.on('diagPong', (t) => {
    state.ping = Date.now() - t;
    const now = performance.now();
    if (now - state.maxPingAt > 2000) { state.maxPing = state.ping; state.maxPingAt = now; }
    else if (state.ping > state.maxPing) state.maxPing = state.ping;
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function preRenderMiniIcons() {
  const sheet = state.miniSheet;
  const frames = state.miniFrames;
  if (!sheet || !frames) return;
  state.miniIcons = {};
  const mobTypes = window.MOB_TYPES || [];
  for (const mt of mobTypes) {
    if (!mt.miniFrame) continue;
    const frame = frames[mt.miniFrame];
    if (!frame) continue;
    const f = frame.frame;
    const size = 48;
    const m = 2;
    const c = document.createElement('canvas');
    c.width = size * m;
    c.height = size * m;
    const cx = c.getContext('2d');
    const srcAspect = f.w / f.h;
    const dstAspect = c.width / c.height;
    let sx = 0, sy = 0, sw = c.width, sh = c.height;
    if (srcAspect > dstAspect) {
      sh = c.width / srcAspect;
      sy = (c.height - sh) / 2;
    } else {
      sw = c.height * srcAspect;
      sx = (c.width - sw) / 2;
    }
    cx.drawImage(sheet, f.x, f.y, f.w, f.h, sx, sy, sw, sh);
    state.miniIcons[mt.id] = c.toDataURL();
  }
}

async function loadGameAssets() {
  const [sheet, meta, kSheet, kMeta, hSheet, hMeta, layout, mSheet, mMeta, cSheet, cMeta] = await Promise.all([
    loadImage('/images/spritesheet.png'),
    fetch('/images/spritesheet.json').then(r => r.json()),
    loadImage('/images/KnightSheet.png'),
    fetch('/images/KnightSheet.json').then(r => r.json()),
    loadImage('/images/HUD.png'),
    fetch('/images/HUD.json').then(r => r.json()),
    fetch('/holdyourground/hud-layout.json').then(r => r.json()).catch(() => null),
    loadImage('/images/Minis.png'),
    fetch('/images/Minis.json').then(r => r.json()),
    loadImage('/images/CardSheet.png'),
    fetch('/images/CardSheet.json').then(r => r.json())
  ]);
  state.spriteSheet = sheet;
  state.spriteFrames = meta.frames;
  state.knightSheet = kSheet;
  state.knightFrames = kMeta.frames;
  state.hudSheet = hSheet;
  state.hudFrames = hMeta.frames;
  state.hudLayout = layout;
  state.miniSheet = mSheet;
  state.miniFrames = mMeta.frames;
  state.cardSheet = cSheet;
  state.cardFrames = cMeta.frames;

  const gearFrame = state.hudFrames?.['settingsgear.png']?.frame;
  if (gearFrame) {
    const c = document.createElement('canvas');
    c.width = gearFrame.w; c.height = gearFrame.h;
    const cx = c.getContext('2d');
    cx.drawImage(state.hudSheet, gearFrame.x, gearFrame.y, gearFrame.w, gearFrame.h, 0, 0, gearFrame.w, gearFrame.h);
    const img = document.getElementById('settingsGearImg');
    if (img) img.src = c.toDataURL();
  }
  preRenderMiniIcons();
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
  state._joinedEnded = false;
  state.screen = 'playing';
  state.level = 1; state.exp = 0; state.expToNext = 100; state.gold = 0;
  state.zombies = []; state.activePlayerCount = 0;
  state.dmgNumbers = []; state.zombieAnims = {}; state.waveComposition = null;
  state.localAnim = null; state.lbSig = ''; state.hotSig = '';
  hideNWPopup();
  document.getElementById('eliminated').classList.add('hidden');
  document.getElementById('loadingOverlay').classList.add('hidden');
  updateJoinButton();
  if (!document.getElementById('resultsOverlay').classList.contains('hidden')) {
    document.getElementById('joinGameBtn').classList.add('hidden');
  }
  ['hud', 'settingsBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  if (!state.isSpectator) {
  }
  startRender(socket);
}
