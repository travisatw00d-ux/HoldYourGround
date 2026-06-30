const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER = 'http://localhost:3000';
const ROOT_DIR = path.join(__dirname, '..', '..');
const TICK_MS = 1000 / 30;
const INPUT_INTERVAL = 50;
const SPRINT_DURATION_MS = 2000;
const CAPTURE_DURATION_MS = 5000;
const DATA_LOG_PATH = path.join(__dirname, 'drift-data.json');

let serverProc = null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureServer() {
  return new Promise((resolve, reject) => {
    console.log('[DIAG] Starting test server...');
    serverProc = spawn('node', ['server.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env, TEST_MODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProc.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) console.log(`  [server] ${line}`);
    });
    serverProc.stderr.on('data', d => {
      if (d.toString().trim()) console.log(`  [server:err] ${d.toString().trim()}`);
    });
    serverProc.on('exit', (code) => {
      console.log(`[DIAG] Server exited with code ${code}`);
      serverProc = null;
    });

    let attempts = 0;
    const tryConnect = () => {
      attempts++;
      const sock = io(SERVER, { transports: ['polling'], timeout: 2000 });
      sock.on('connect', () => {
        sock.close();
        console.log('[DIAG] Server is ready.');
        resolve();
      });
      sock.on('connect_error', () => {
        sock.close();
        if (attempts > 30) return reject(new Error('Server failed to start'));
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
}

function decodePlayerPos(buf, myId) {
  try {
    const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    dv.getUint8(o); o += 1;
    dv.getFloat64(o, true); o += 8;
    dv.getUint16(o, true); o += 2;
    dv.getUint16(o, true); o += 2;
    dv.getUint16(o, true); o += 2;
    const playerCount = dv.getUint8(o); o += 1;
    dv.getUint16(o, true); o += 2;
    dv.getUint16(o, true); o += 2;
    dv.getUint16(o, true); o += 2;
    dv.getUint8(o); o += 1;
    dv.getFloat32(o, true); o += 4;
    dv.getUint16(o, true); o += 2;
    dv.getUint16(o, true); o += 2;

    for (let i = 0; i < playerCount; i++) {
      const idLen = dv.getUint8(o); o += 1;
      const id = new TextDecoder().decode(u8.slice(o, o + idLen)); o += idLen;
      const x = dv.getFloat32(o, true); o += 4;
      const y = dv.getFloat32(o, true); o += 4;
      dv.getInt16(o, true); o += 2;
      dv.getUint8(o); o += 1;
      dv.getUint8(o); o += 1;
      dv.getFloat32(o, true); o += 4;
      dv.getFloat32(o, true); o += 4;
      dv.getFloat64(o, true); o += 8;
      dv.getInt16(o, true); o += 2;
      dv.getUint8(o); o += 1;
      dv.getInt16(o, true); o += 2;
      dv.getInt16(o, true); o += 2;
      const nameLen = dv.getUint8(o); o += 1;
      o += nameLen;
      dv.getUint8(o); o += 1;

      if (id === myId) return { x, y };
    }
  } catch (e) {
    console.error('[DIAG] Decode error:', e.message);
  }
  return null;
}

async function run() {
  console.log('');
  console.log('=== SPRINT DRIFT DIAGNOSTIC ===');
  console.log('');

  await ensureServer();

  // ---- Player setup ----
  const socket = io(SERVER, { transports: ['polling'] });
  const pending = {};

  function waitFor(event, pred, timeout) {
    if (typeof pred === 'number') { timeout = pred; pred = null; }
    if (!timeout) timeout = 15000;
    return new Promise((resolve, reject) => {
      const entry = { resolve, pred, timer: setTimeout(() => reject(new Error(`timeout ${event}`)), timeout) };
      if (!pending[event]) pending[event] = [];
      pending[event].push(entry);
    });
  }

  socket.on('connect', () => {
    const list = pending['connect'];
    if (list) { for (const e of list) { clearTimeout(e.timer); e.resolve({}); } delete pending['connect']; }
  });

  socket.onAny((event, ...args) => {
    const data = args[0];
    const list = pending[event];
    if (list) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].pred ? list[i].pred({ data }) : true) {
          clearTimeout(list[i].timer);
          list[i].resolve({ data });
          list.splice(i, 1);
        }
      }
    }
  });

  console.log('[DIAG] Connecting...');
  await waitFor('connect');
  console.log('[DIAG] Connected');

  socket.emit('playAsGuest', { name: 'Diag' });
  await waitFor('guestJoined');
  console.log('[DIAG] Authenticated');

  // Register ALL waitFors before emitting, so we don't miss events
  const initPromise = waitFor('init');
  const waitingPromise = waitFor('matchPhase', e => e.data && e.data.phase === 'waiting');

  socket.emit('createRoom', { name: 'Diag' });

  const initEv = await initPromise;
  const myId = initEv.data.id;
  console.log('[DIAG] Room created, id:', myId);

  await waitingPromise;
  console.log('[DIAG] In waiting lobby');

  const daytimePromise = waitFor('matchPhase', e => e.data && e.data.phase === 'daytime');

  socket.emit('startMatch');

  await daytimePromise;
  console.log('[DIAG] Match started, daytime');

  // Wait for first state event
  await new Promise(resolve => {
    const handler = () => { socket.off('state', handler); resolve(); };
    socket.once('state', handler);
    setTimeout(resolve, 2000);
  });
  console.log('[DIAG] Player position data flowing');

  await sleep(800);

  // ---- Position tracking ----
  let initialPos = null;
  let releasePos = null;
  let releaseTime = 0;
  const driftFrames = [];
  let lastPos = null;
  let driftListen = false;

  const posHandler = (msg) => {
    const pos = decodePlayerPos(
      msg instanceof ArrayBuffer ? msg : msg.buffer,
      myId
    );
    if (!pos) return;

    if (!initialPos) {
      initialPos = pos;
      console.log(`[DIAG] Initial position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    }

    // When drift capture is active, record frame
    if (driftListen && releasePos) {
      if (driftFrames.length < 200) {
        driftFrames.push({ t: Date.now() - releaseTime, x: pos.x, y: pos.y });
      }
    }

    lastPos = pos;
  };
  socket.on('state', posHandler);

  // ---- Sprint Phase ----
  console.log('');
  console.log('[DIAG] === Sprinting for 2s (W + Shift) ===');

  const sprintEnd = Date.now() + SPRINT_DURATION_MS;
  while (Date.now() < sprintEnd) {
    socket.emit('input', { dx: 0, dy: -1, sprint: true, angle: Math.PI });
    await sleep(INPUT_INTERVAL);
  }

  // ---- Release Phase ----
  console.log('[DIAG] === Release (zero input) ===');
  console.log('[DIAG] Sending zero input packets...');

  // Start sending zero-input packets repeatedly (like the real client)
  const zeroInterval = setInterval(() => {
    socket.emit('input', { dx: 0, dy: 0, sprint: false, angle: 0 });
  }, INPUT_INTERVAL);
  socket.emit('input', { dx: 0, dy: 0, sprint: false, angle: 0 });

  // Wait for position to stabilize (no significant change for ~300ms)
  await sleep(500);

  // Watch for the position to stop moving
  let stableCount = 0;
  releasePos = await new Promise(resolve => {
    const stabHandler = setInterval(() => {
      if (!lastPos) return;
      // Compare to the current lastPos from the state handler
      stableCount++;
      if (stableCount >= 6) {
        clearInterval(stabHandler);
        releasePos = { x: lastPos.x, y: lastPos.y };
        console.log(`[DIAG] Position stabilized at: (${lastPos.x.toFixed(1)}, ${lastPos.y.toFixed(1)})`);
        resolve(releasePos);
      }
    }, 100);
    // Fallback: resolve after 3s
    setTimeout(() => {
      clearInterval(stabHandler);
      if (!releasePos) {
        releasePos = { x: lastPos?.x || 0, y: lastPos?.y || 0 };
        console.log(`[DIAG] Fallback release position: (${releasePos.x.toFixed(1)}, ${releasePos.y.toFixed(1)})`);
        resolve(releasePos);
      }
    }, 3000);
  });

  releaseTime = Date.now();

  // Start drift capture (only record positions after stabilization)
  driftFrames.length = 0;
  driftListen = true;

  // Wait for capture period
  await sleep(CAPTURE_DURATION_MS);
  clearInterval(zeroInterval);
  driftListen = false;

  // ---- Report ----
  console.log('');
  console.log('=== DRIFT REPORT ===');
  console.log(`Release: (${(releasePos?.x || 0).toFixed(1)}, ${(releasePos?.y || 0).toFixed(1)})`);
  console.log(`Frames captured: ${driftFrames.length}`);
  console.log('');

  if (driftFrames.length === 0) {
    console.log('[DIAG] NO DRIFT DATA CAPTURED');
    console.log('[DIAG] This may indicate the state events are not reaching the listener.');
    console.log('[DIAG] Trying alternative: check if state events arrived with different socket.');
    cleanup(0);
    return;
  }

  let maxDist = 0;
  let lastMoveT = 0;
  let prevPos = null;

  for (const f of driftFrames) {
    const dx = f.x - (releasePos ? releasePos.x : f.x);
    const dy = f.y - (releasePos ? releasePos.y : f.y);
    const dist = Math.sqrt(dx * dx + dy * dy);
    let vel = 0;
    if (prevPos) {
      const dvx = f.x - prevPos.x;
      const dvy = f.y - prevPos.y;
      vel = Math.sqrt(dvx * dvx + dvy * dvy) / (TICK_MS / 1000);
    }

    if (dist > maxDist) maxDist = dist;
    if (dist > 0.5) lastMoveT = f.t;

    if (f.t <= CAPTURE_DURATION_MS) {
      console.log(
        `  +${String(Math.round(f.t)).padStart(5)}ms  ` +
        `pos=(${f.x.toFixed(2)}, ${f.y.toFixed(2)})  ` +
        `dist=${dist.toFixed(2)}px  vel=${vel.toFixed(2)}`
      );
    }
    prevPos = { x: f.x, y: f.y };
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`  Total drift distance: ${maxDist.toFixed(2)} pixels`);
  console.log(`  Drift duration: ${lastMoveT}ms`);
  console.log(`  Frames in drift: ${driftFrames.length}`);

  // Save raw data
  const raw = {
    releasePos: releasePos ? { x: releasePos.x.toFixed(2), y: releasePos.y.toFixed(2) } : null,
    maxDrift: maxDist.toFixed(2),
    driftMs: lastMoveT,
    frames: driftFrames.map(f => ({ t: f.t, x: f.x.toFixed(2), y: f.y.toFixed(2) }))
  };
  fs.writeFileSync(DATA_LOG_PATH, JSON.stringify(raw, null, 2));
  console.log(`[DIAG] Raw data saved to ${DATA_LOG_PATH}`);

  cleanup(0);
}

function cleanup(code) {
  if (serverProc) {
    try { serverProc.kill(); } catch (e) {}
    serverProc = null;
  }
  console.log('[DIAG] Done.');
  process.exit(code || 0);
}

process.on('uncaughtException', (e) => {
  console.error('[DIAG] CRASH:', e.message);
  console.error(e.stack);
  cleanup(1);
});

process.on('SIGINT', () => cleanup(0));

run().catch(e => {
  console.error('[DIAG] FAILED:', e.message);
  console.error(e.stack);
  cleanup(1);
});
