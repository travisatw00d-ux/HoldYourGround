import { state } from './state.js';
import { resetKeys } from './input.js';
import { startRender, stopRender } from './render.js';
import { updateLeaderboard, renderResults, renderLobbyCards, updateJoinButton, textDecoder, MOB_NAMES } from './render-ui.js';
import { startAttackAnim, playReturnAnim, startIdleTransition } from './anims.js';
import { callbacks } from './callback-registry.js';
import { playSound, playMobSound, loadSounds } from './audio.js';
import { ensureAssets, enterGame } from './assets.js';
import { showNWPopup, toggleNWPopup, resetWavePopup, hideNWPopup, populateNWRows, updateNWCounts } from './next-wave-popup.js';
import { hideCharStats, hideInventory, showCharStats, showInventory, showMasterChest, hideDropTooltip, $ } from './ui.js';
import { ZOMBIE_ANIMATIONS, MOB_TYPES } from './game-data.js';

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

  // World item drops (loot from zombie kills — server/item-drops.js).
  // itemDropsInit seeds the current list on join (room.getItemDropsList());
  // itemDropAdded/itemDropRemoved keep it live afterward, broadcast
  // room-wide since any player can see and click-pick-up any drop.
  socket.on('itemDropsInit', ({ drops }) => {
    state.itemDrops = {};
    for (const d of drops) state.itemDrops[d.id] = d;
  });
  socket.on('itemDropAdded', (d) => { state.itemDrops[d.id] = d; });
  socket.on('itemDropRemoved', ({ id }) => {
    delete state.itemDrops[id];
    // Covers the case where the drop under the cursor got picked up (by us
    // or someone else) without the mouse moving afterward — input.js's own
    // hover-tracking only re-checks on mousemove, so the tooltip would
    // otherwise keep showing a now-gone item until the next mouse jiggle.
    hideDropTooltip();
  });
  // Full wipe at the start of the next wave (see room.js's clearItemDrops(),
  // called from phase-manager.js's daytime->nighttime transition) — one
  // broadcast instead of replaying individual itemDropRemoved events.
  socket.on('itemDropsCleared', () => {
    state.itemDrops = {};
    hideDropTooltip();
  });

  socket.on('joined', async () => {
    resetKeys();
    state.players = {}; state.zombies = []; state.itemDrops = {}; state.activePlayerCount = 0; state.lobbyPlayers = [];
    state.lbSig = ''; state.matchPhase = null; state.phaseTimer = 0; state.isSpectator = false;
    state.isDeadSpectating = false; state.queuedPlayers = []; state.spectatingTargetIndex = 0;
    state.localAnim = null; state._mirrorSword = false; state.currentWave = 0; state.serverLevel = 0;
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
        const comboStep = dv.getUint8(o); o += 1;
        const energy = dv.getInt16(o, true); o += 2;
        const maxEnergy = dv.getInt16(o, true); o += 2;
        const comboChainWindow = dv.getUint8(o) === 1; o += 1;
        const nameLen = dv.getUint8(o); o += 1;
        const name = textDecoder.decode(u8.subarray(o, o + nameLen)); o += nameLen;
        const isSpectator = dv.getUint8(o) === 1; o += 1;

        const old = oldP[id];
        const meta = state.playerMeta[id] || {};
        const p = {
          id, x, y, health, alive, attacking, facingAngle, attackLockedAngle, attackStartTime, kills, lvl, comboStep, comboChainWindow, name, isSpectator,
          energy, maxEnergy,
          color: meta.color || '#888888',
          // currentItem can be legitimately null (weapon slot dragged empty) —
          // only fall back to the starter sword when meta has never been set at
          // all (brand new player, no playerInfo received yet). `!== undefined`
          // instead of `||` so an intentional null survives every rebuild below.
          currentItem: meta.currentItem !== undefined ? meta.currentItem : 'wooden_sword',
          inventory: meta.inventory || ['wooden_sword'], maxHealth: meta.maxHealth || 100,
          speed: meta.speed != null ? meta.speed : 13, attackDmg: meta.attackDmg != null ? meta.attackDmg : 5,
          attackSpeed: meta.attackSpeed != null ? meta.attackSpeed : 800,
          // Equipment/bag/derived-stat fields aren't part of the binary protocol
          // at all — they only ever come from playerMeta (the last playerInfo
          // payload). This whole `p` object replaces state.players[id] on every
          // snapshot (~18x/sec), so these must be re-applied here every time or
          // they vanish the moment the next snapshot arrives after a drag/equip.
          // masterChest (2026-07-14) was missed here when drag-in was added —
          // it was harmless while the chest was always empty, but the moment it
          // could hold real items this became the exact same bug the gotcha
          // below describes: a move landed correctly via playerInfo, then got
          // wiped ~55ms later by the next binary snapshot rebuilding this
          // object without it, so the item "vanished" the next time the panel
          // re-rendered (e.g. closing and reopening the chest).
          equipment: meta.equipment, inventorySlots: meta.inventorySlots, masterChest: meta.masterChest,
          defense: meta.defense != null ? meta.defense : 0,
          fortune: meta.fortune != null ? meta.fortune : 0,
          luck: meta.luck != null ? meta.luck : 0,
          healthRegen: meta.healthRegen != null ? meta.healthRegen : 0,
          turnSpeed: meta.turnSpeed != null ? meta.turnSpeed : 18,
          playerClass: meta.playerClass || 'knight'
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
        const mobTypeName = MOB_TYPES[zmobType] ? MOB_TYPES[zmobType].name : 'Unknown';
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
    if (info.id === state.myId && info.statPoints != null) {
      state.statPoints = info.statPoints;
    }
    if (info.playerBuild && state.screen === 'lobby') {
      const entry = state.lobbyPlayers.find(p => p.id === info.id);
      if (entry) entry.playerBuild = info.playerBuild;
      renderLobbyCards();
    }
    if (state.players[info.id]) {
      const p = state.players[info.id];
      p.name = info.name; p.color = info.color || '#888888';
      p.currentItem = info.currentItem !== undefined ? info.currentItem : 'wooden_sword'; p.maxHealth = info.maxHealth || 100;
      p.equipment = info.equipment || p.equipment;
      p.inventorySlots = info.inventorySlots || p.inventorySlots;
      p.masterChest = info.masterChest || p.masterChest;
      p.defense = info.defense != null ? info.defense : 0;
      p.fortune = info.fortune != null ? info.fortune : 0;
      p.luck = info.luck != null ? info.luck : 0;
      p.healthRegen = info.healthRegen != null ? info.healthRegen : 0;
      p.speed = info.speed != null ? info.speed : 13;
      p.attackDmg = info.attackDmg != null ? info.attackDmg : 5;
      p.attackSpeed = info.attackSpeed != null ? info.attackSpeed : 800;
      p.turnSpeed = info.turnSpeed != null ? info.turnSpeed : 18;
      state.lbSig = '';
      updateLeaderboard();
      // Re-render the inventory panel's slots so a drag-and-drop move (or an
      // item pickup) shows up immediately while the panel is open, instead of
      // only refreshing the next time it's opened. showInventory() is cheap
      // (a few DOM writes) and only runs when the panel is actually visible.
      if (info.id === state.myId && $.inventoryPanel && !$.inventoryPanel.classList.contains('hidden')) {
        showInventory();
      }
      // Same idea for Char Stats — equipping/unequipping anything changes
      // attackDmg/attackSpeed/defense/etc, and the panel should reflect that
      // the instant it happens (e.g. dragging the sword off the weapon slot),
      // not just the next time it's reopened.
      if (info.id === state.myId && $.charStatsPanel && !$.charStatsPanel.classList.contains('hidden')) {
        showCharStats();
      }
      // Master chest (2026-07-14, drag-in wired 2026-07-14) — same
      // live-refresh idea as inventory above: a moveItem/dropItem into or out
      // of the chest shows up immediately while the panel's open instead of
      // waiting for the next open.
      if (info.id === state.myId && $.masterChestPanel && !$.masterChestPanel.classList.contains('hidden')) {
        showMasterChest();
      }
    }
  });
  socket.on('playerLeft', (id) => { delete state.playerMeta[id]; });

  socket.on('eliminated', ({ kills }) => {
    if (state.screen === 'menu') return;
    playSound('player_death');
    const active = state.matchPhase === 'daytime' || state.matchPhase === 'nighttime' || state.matchPhase === 'intermission' || state.matchPhase === 'waveOver';
    if (active) {
      state.isDeadSpectating = true;
      // currencyBronze deliberately NOT reset here (2026-07-13, fixing a
      // real bug) — unlike level/exp, the server never actually zeroes
      // p.currencyBronze at these points (see room.js/join-manager.js/
      // phase-manager.js — currency carries across matches within a
      // session), so locally zeroing the CLIENT's copy was always wrong.
      // Worse, in some server paths the corrective `accountUpdate` carrying
      // the real value gets emitted BEFORE this event, so the local zero
      // below used to clobber it right back to 0 a moment later. Leaving it
      // untouched here just keeps showing the last known-correct value,
      // which is already right since the server never changed it.
      state.screen = 'playing'; state.level = 1; state.exp = 0; state.expToNext = 100;
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
    state.localAnim = null; state._mirrorSword = false; state.isDeadSpectating = false; state.screen = 'playing';
    document.getElementById('menu').classList.add('hidden');
    ['eliminated', 'waitingRespawn'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['hud', 'settingsBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    startRender(socket);
  });

  socket.on('gotHit', () => { state.hitFlash = 8; playSound('player_hurt'); });
  socket.on('hitConfirm', ({ dmg, x, y }) => {
    state.dmgNumbers.push({ x, y, dmg, timer: 1.2, duration: 1.2 });
    let nearest = null, nearDist = Infinity;
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const dz = Math.hypot(z.x - x, z.y - y);
      if (dz < nearDist) { nearDist = dz; nearest = z; }
    }
    if (nearest && nearDist < 60) playMobSound(nearest.mobType, 'hit', { x: x, y: y });
  });

  socket.on('accountUpdate', ({ exp, level, expToNext, currencyBronze, statPoints }) => {
    state.exp = exp; state.level = level; state.expToNext = expToNext; state.currencyBronze = currencyBronze;
    if (statPoints != null) state.statPoints = statPoints;
  });

  socket.on('attackStyleChanged', ({ attackStyle }) => {
    if (attackStyle && attackStyle !== state.attackStyle) {
      startIdleTransition(attackStyle);
    }
    state.attackStyle = attackStyle;
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
    // currencyBronze deliberately NOT reset here — see the matching comment
    // on the 'eliminated' handler above; this was the actual cause of
    // currency appearing to reset to 0 on "Play Again" (2026-07-13 fix).
    state.screen = 'playing'; state.level = 1; state.exp = 0; state.expToNext = 100;
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

  socket.on('attackStart', ({ lockedAngle, comboStep }) => {
    state._comboStep = comboStep;
    startAttackAnim(lockedAngle, comboStep);
    if (state.attackStyle === 'swing') {
      const idx = Math.floor(Math.random() * 3) + 1;
      playSound('SwordSwing' + idx);
    } else {
      playSound('player_jab');
    }
  });

  socket.on('comboWindowEnd', () => {
    playReturnAnim();
  });

  socket.on('comboReady', () => {
    state._comboStep = 0;
    state._mirrorSword = false;
  });

  socket.on('zombieAttackStart', ({ zombieId, mobType }) => {
    const anim = ZOMBIE_ANIMATIONS?.attack;
    if (anim) state.zombieAnims[zombieId] = { startTime: performance.now() };
    const z = state.zombies.find(zz => zz.id === zombieId);
    if (z && z.alive) playMobSound(mobType, 'attack', { x: z.x, y: z.y });
  });

  socket.on('mobKilled', ({ mobType, x, y }) => {
    playMobSound(mobType, 'kill', { x, y });
  });

  socket.on('matchPhase', async ({ phase, timer, wave, readyPlayers, activePlayers }) => {
    state.matchPhase = phase;
    if (phase === 'daytime' || phase === 'nighttime') playSound('wave_' + phase);
    state.phaseTimer = timer;
    state.phaseTimerStart = timer;
    state.phaseStartedAt = performance.now();
    if (phase === 'nighttime') state.waveStartTime = performance.now();
    state.currentWave = wave;
    if (activePlayers) state.isSpectator = !activePlayers.includes(state.myId);
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
      hideCharStats();
      hideInventory();
      document.getElementById('lobbyScreen').classList.remove('hidden');
    hideCharStats();
    hideInventory();
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
      ['eliminated', 'waitingRespawn', 'settingsPanel', 'hud', 'hotbarInventory'].forEach(id => document.getElementById(id).classList.add('hidden'));
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
    if (state._nwpHideTimer) clearTimeout(state._nwpHideTimer);
    state._nwpHideTimer = setTimeout(() => {
      hideNWPopup();
      state._nwpHideTimer = null;
    }, 10000);
  });

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
    ['waitingRespawn'].forEach(id => document.getElementById(id).classList.add('hidden'));
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
    const serverReady = new Set(ready || []);
    if (state.screen === 'results' && serverReady.has(state.myId)) {
      document.getElementById('resultsOverlay').classList.add('hidden');
      document.getElementById('lobbyScreen').classList.remove('hidden');
      document.getElementById('lobbyStartBtn').classList.add('hidden');
      state.screen = 'lobby';
    }
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
