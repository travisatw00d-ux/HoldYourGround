import { state } from './state.js';
import { getInput, setupInput } from './input.js';
import { startRender, stopRender, generateBackground, updateLeaderboard, updateHotbar, startAttackAnim } from './render.js';

let socket = null;
let roomListCallback = null;
let authSuccessCallback = null;
let guestJoinedCallback = null;
let lobbyCountCallback = null;

export function getSocket() { return socket; }
export function onRoomList(cb) { roomListCallback = cb; }
export function onAuthSuccess(cb) { authSuccessCallback = cb; }
export function onGuestJoined(cb) { guestJoinedCallback = cb; }
export function onLobbyCount(cb) { lobbyCountCallback = cb; }

export function connect() {
  const serverUrl = window.location.hostname === 'iolegends.com' || window.location.hostname === 'www.iolegends.com'
    ? 'wss://server.iolegends.com'
    : undefined;
  socket = io(serverUrl, { transports: ['websocket'] });

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
  const zombieMaxHealth = (lvl) => lvl <= 5 ? 4 + lvl : 12 + lvl;
  const emptyState = () => ({ players: {}, zombies: [] });

  socket.on('guestJoined', (data) => {
    if (guestJoinedCallback) guestJoinedCallback(data);
  });

  socket.on('authSuccess', (data) => {
    if (authSuccessCallback) authSuccessCallback(data);
  });

  socket.on('authError', (msg) => {
    document.getElementById('errorMsg').textContent = msg;
    document.getElementById('errorMsg').classList.remove('hidden');
  });

  socket.on('lobbyCount', (data) => {
    if (lobbyCountCallback) lobbyCountCallback(data.count);
  });

  socket.on('roomList', (rooms) => {
    if (roomListCallback) roomListCallback(rooms);
  });

  socket.on('roomFull', () => {
    document.getElementById('errorMsg').textContent = 'Room is full';
  });

  socket.on('error', (msg) => {
    document.getElementById('errorMsg').textContent = msg;
  });

  socket.on('init', ({ id, arenaWidth, arenaHeight }) => {
    state.myId = id;
    state.worldW = arenaWidth;
    state.worldH = arenaHeight;
    state.backgroundCanvas = generateBackground(state.worldW, state.worldH);
  });

  socket.on('joined', () => {
    state.screen = 'playing';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('eliminated').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hotbarInventory').classList.remove('hidden');
    document.getElementById('settingsBtn').classList.remove('hidden');
    document.getElementById('errorMsg').textContent = '';
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    startRender(socket);
  });

  socket.on('state', (msg) => {
    const u8 = msg instanceof ArrayBuffer ? new Uint8Array(msg)
      : new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
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

        const old = oldP[id];
        const meta = state.playerMeta[id] || {};
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
      state.players = map;

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
      state.players = {};
      state.zombies = [];
    }
  });

  socket.on('playerInfo', (info) => { state.playerMeta[info.id] = info; });
  socket.on('playerLeft', (id) => { delete state.playerMeta[id]; });

  socket.on('eliminated', ({ kills }) => {
    stopRender();
    document.getElementById('elimKills').textContent = `Kills: ${kills}`;
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('eliminated').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('hotbarInventory').classList.add('hidden');
    document.getElementById('settingsBtn').classList.add('hidden');
    document.getElementById('settingsPanel').classList.add('hidden');
    state.screen = 'eliminated';
  });

  socket.on('respawned', () => {
    state.localAnim = null;
    state.screen = 'playing';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('eliminated').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hotbarInventory').classList.remove('hidden');
    document.getElementById('settingsBtn').classList.remove('hidden');
    state.cameraZoom = 1.0;
    socket.emit('cameraZoom', { zoom: 1.0, viewW: state.viewW, viewH: state.viewH });
    startRender(socket);
  });

  socket.on('gotHit', () => { state.hitFlash = 8; });
  socket.on('hitConfirm', ({ dmg, x, y }) => { state.dmgNumbers.push({ x, y, dmg, timer: 1.2, duration: 1.2 }); });
  socket.on('zombieMerge', ({ x, y }) => { state.mergeSmokes.push({ x, y, timer: 1.0 }); });

  socket.on('attackStart', ({ lockedAngle }) => { startAttackAnim(lockedAngle); });

  socket.on('diagPong', (t) => {
    state.ping = Date.now() - t;
    const now = performance.now();
    if (now - state.maxPingAt > 2000) { state.maxPing = state.ping; state.maxPingAt = now; }
    else if (state.ping > state.maxPing) state.maxPing = state.ping;
  });

  return socket;
}
