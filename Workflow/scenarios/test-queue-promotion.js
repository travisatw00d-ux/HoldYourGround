const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER = 'http://localhost:3000';
const TOTAL = 12;
const ACTIVE = 10;
const DIAG_IDX = 10;
const EXIT_IDX = 0;

const outDir = __dirname;
const diagLogPath = path.join(outDir, '..', 'diag-log.json');
const rootDir = path.join(__dirname, '..', '..');

function createPlayer(name) {
  const socket = io(SERVER, { transports: ['polling'] });
  const events = [];
  const pending = {};

  function capture(event, data) {
    const entry = { t: Date.now(), event, data };
    events.push(entry);
    const list = pending[event];
    if (list) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].pred ? list[i].pred(entry) : true) {
          list[i].resolve(entry);
          list.splice(i, 1);
        }
      }
    }
  }

  socket.on('connect', () => capture('connect', {}));
  socket.on('disconnect', () => capture('disconnect', {}));
  socket.onAny((event, ...args) => capture(event, args[0]));

  function waitFor(event, pred, timeout) {
    if (typeof pred === 'number') { timeout = pred; pred = null; }
    if (!timeout) timeout = 30000;
    return new Promise((resolve, reject) => {
      const match = events.find(e => e.event === event && (!pred || pred(e)));
      if (match) return resolve(match);
      const timer = setTimeout(() => {
        const idx = (pending[event] || []).findIndex(p => p.resolve === resolve);
        if (idx >= 0) pending[event].splice(idx, 1);
        reject(new Error(`[${name}] timeout waiting for ${event}`));
      }, timeout);
      if (!pending[event]) pending[event] = [];
      pending[event].push({ resolve, pred, timer });
    });
  }

  return { socket, name, events, capture, waitFor };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function clearDiagLog() {
  try { fs.writeFileSync(diagLogPath, ''); } catch { }
}

function readDiagLog() {
  try {
    const raw = fs.readFileSync(diagLogPath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

async function createFreshRoom(leader) {
  const initPromise = leader.waitFor('init', 5000);
  leader.socket.emit('createRoom', { name: leader.name });
  const ev = await initPromise;
  const roomId = ev.data && ev.data.roomId;
  if (!roomId) throw new Error('init event missing roomId');
  await leader.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting');
  return roomId;
}

async function ensureServer() {
  console.log('Starting test server...');
  const proc = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: { ...process.env, TEST_MODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', d => {
    const line = d.toString().trim();
    if (line) console.log(`  [server] ${line}`);
  });
  proc.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line) console.log(`  [server:err] ${line}`);
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 20000);
    proc.stdout.on('data', function onData(d) {
      if (d.toString().includes('http://localhost')) {
        clearTimeout(timeout);
        proc.stdout.removeListener('data', onData);
        setTimeout(resolve, 500);
      }
    });
    proc.on('error', (e) => { clearTimeout(timeout); reject(e); });
  });
  console.log('  server ready');
  return proc;
}

async function connectAll(names) {
  const players = [];
  for (const name of names) {
    const p = createPlayer(name);
    players.push(p);
    await p.waitFor('connect');
  }
  console.log(`  all ${players.length} connected`);
  return players;
}

async function guestAll(players) {
  for (const p of players) {
    p.socket.emit('playAsGuest', { name: p.name });
    await p.waitFor('guestJoined');
  }
  console.log('  all players authenticated as guests');
}

function testCmd(p, action) {
  p.socket.emit('__test', { action });
}

function writeTraceFile(players, scenarioName, diagEntries, extra) {
  fs.readdirSync(outDir).filter(f => f.startsWith('trace-')).forEach(f => fs.unlinkSync(path.join(outDir, f)));
  const allEvents = [];
  for (const p of players) {
    for (const e of p.events) {
      allEvents.push({ player: p.name, ...e });
    }
  }
  allEvents.sort((a, b) => a.t - b.t);

  const diagPlayer = players[DIAG_IDX];
  const diagEvents = diagPlayer.events;
  const joinedGameEv = diagEvents.find(e => e.event === 'joinedGame');
  const queueEv = diagEvents.find(e => e.event === 'queueUpdate');

  const summary = {
    diagPlayer: diagPlayer.name,
    diagQueued: queueEv ? queueEv.data : null,
    diagJoinedGame: joinedGameEv ? joinedGameEv.data : null,
    diagIsDeadSpectating: joinedGameEv ? (joinedGameEv.data && joinedGameEv.data.isDead === true) : null,
    diagMatchPhaseEvents: diagEvents.filter(e => e.event === 'matchPhase').map(e => ({
      t: e.t, phase: e.data ? e.data.phase : null
    })),
    diagSpectatorAssigned: !!diagEvents.find(e => e.event === 'spectatorAssigned'),
    diagRespawned: !!diagEvents.find(e => e.event === 'respawned'),
    exitPlayerDisconnected: !!players[EXIT_IDX].events.find(e => e.event === 'disconnect'),
    totalEvents: allEvents.length,
    ...extra
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `trace-${ts}.json`);
  const output = {
    scenario: scenarioName,
    runAt: new Date().toISOString(),
    serverDiagLog: diagEntries,
    summary,
    events: allEvents
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nTrace written to ${outPath}`);
  return outPath;
}

async function scenario_nighttime_auto_top_off() {
  console.log(`\n=== Scenario: Nighttime auto-top-off ===`);

  const names = [];
  for (let i = 1; i <= TOTAL; i++) {
    names.push(i === DIAG_IDX + 1 ? 'DiagPlayer' : `Bot${i}`);
  }

  const players = await connectAll(names);
  await guestAll(players);

  const actives = players.slice(0, ACTIVE);
  const spares = players.slice(ACTIVE);

  console.log('Creating fresh room...');
  const roomId = await createFreshRoom(actives[0]);
  console.log(`  room ID: ${roomId}`);

  for (const p of actives.slice(1)) {
    p.socket.emit('join', { roomId, name: p.name });
    await p.waitFor('joined');
  }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  console.log('  lobby ready');

  console.log('Starting match...');
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));
  console.log('  daytime');

  console.log('Spares joining as spectators...');
  for (const p of spares) {
    p.socket.emit('join', { roomId, name: p.name });
    await p.waitFor('joined');
  }
  await Promise.all(spares.map(p => p.waitFor('spectatorAssigned', 10000).catch(() => null)));

  console.log('Spares queuing...');
  for (const p of spares) {
    p.socket.emit('joinGame');
  }
  await Promise.all(spares.map(p => p.waitFor('queueUpdate', 10000).catch(() => {})));
  console.log('  2 in queue');

  await sleep(300);

  console.log('Advancing to nighttime...');
  testCmd(actives[1], 'advancePhase');
  const diagPlayer = players[DIAG_IDX];
  await diagPlayer.waitFor('matchPhase', e => e.data && e.data.phase === 'nighttime', 5000);
  console.log(`  DiagPlayer confirms nighttime`);

  console.log(`Disconnecting Bot1 during nighttime (should auto-promote)...`);
  players[EXIT_IDX].socket.disconnect();
  await sleep(500);

  try {
    const ev = await diagPlayer.waitFor('joinedGame', 5000);
    const isDead = !!(ev.data && ev.data.isDead === true);
    console.log(`  DiagPlayer auto-promoted via joinedGame { isDead: ${isDead} }`);
  } catch {
    console.log('  BUG: DiagPlayer was NOT auto-promoted (queue never serviced)');
  }

  await sleep(300);

  console.log('Advancing to daytime...');
  testCmd(actives[1], 'advancePhase');
  await sleep(200);
  testCmd(actives[1], 'advancePhase');
  await sleep(500);

  try {
    await diagPlayer.waitFor('respawned', 5000);
    console.log('  DiagPlayer respawned at daytime');
  } catch {
    console.log('  BUG: DiagPlayer not respawned at daytime');
  }

  await sleep(500);
  const diagEntries = readDiagLog();
  const tracePath = writeTraceFile(players, 'nighttime-auto-top-off', diagEntries, {
    test: 'Queue auto-promotes when player leaves during nighttime'
  });
  console.log(`Done. ${tracePath}\n`);
  for (const p of players) p.socket.disconnect();
}

async function scenario_queue_jump_prevention() {
  console.log(`\n=== Scenario: Queue-jump prevention ===`);
  // Total needed: 10 active + 2 queue + 1 new spectator = 13
  const TOTAL13 = 13;

  const names = [];
  for (let i = 1; i <= TOTAL13; i++) {
    names.push(i === DIAG_IDX + 1 ? 'DiagPlayer' : (i === TOTAL13 ? 'Latecomer' : `Bot${i}`));
  }

  const players = await connectAll(names);
  await guestAll(players);

  const actives = players.slice(0, ACTIVE);
  const spares = players.slice(ACTIVE, TOTAL13 - 1); // 2 spares (index 10, 11)
  const latecomer = players[TOTAL13 - 1];             // index 12

  console.log('Creating fresh room...');
  const roomId = await createFreshRoom(actives[0]);
  console.log(`  room ID: ${roomId}`);

  for (const p of actives.slice(1)) {
    p.socket.emit('join', { roomId, name: p.name });
    await p.waitFor('joined');
  }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));

  console.log('Starting match...');
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));
  console.log('  daytime');

  console.log('Spares joining as spectators...');
  for (const p of spares) {
    p.socket.emit('join', { roomId, name: p.name });
    await p.waitFor('joined');
  }
  await Promise.all(spares.map(p => p.waitFor('spectatorAssigned', 10000).catch(() => null)));

  console.log('Spares queuing...');
  for (const p of spares) {
    p.socket.emit('joinGame');
  }
  await Promise.all(spares.map(p => p.waitFor('queueUpdate', 10000).catch(() => {})));
  console.log('  2 in queue');

  await sleep(200);

  console.log('Latecomer spectator joining mid-match...');
  latecomer.socket.emit('join', { roomId, name: latecomer.name });
  await latecomer.waitFor('joined');
  await latecomer.waitFor('spectatorAssigned', 5000).catch(() => null);
  console.log('  Latecomer spectator assigned');

  console.log('Latecomer clicking Join Game (slots open but queue has people)...');
  latecomer.socket.emit('joinGame');
  await sleep(500);

  const diagPlayer = players[DIAG_IDX];
  const latecomerQUpdates = latecomer.events.filter(e => e.event === 'queueUpdate');
  const latecomerJG = latecomer.events.find(e => e.event === 'joinedGame');

  if (latecomerJG) {
    console.log('  BUG: Latecomer jumped queue (got joinedGame)');
  } else if (latecomerQUpdates.length > 0) {
    const lastQU = latecomerQUpdates[latecomerQUpdates.length - 1];
    const queued = lastQU.data && lastQU.data.queued;
    const inQueue = queued && queued.some(q => q.id === latecomer.socket.id);
    if (inQueue) {
      console.log('  EXPECTED: Latecomer went to back of queue');
    } else {
      console.log('  Latecomer received queueUpdate but not in queued list');
    }
  } else {
    console.log('  Latecomer got no queueUpdate (went straight in? unexpected)');
  }

  const diagEntries = readDiagLog();
  const tracePath = writeTraceFile(players, 'queue-jump-prevention', diagEntries, {
    test: 'New spectator does not jump queue'
  });
  console.log(`Done. ${tracePath}\n`);
  for (const p of players) p.socket.disconnect();
}

async function scenario_rejoin_after_end() {
  console.log(`\n=== Scenario: Rejoin after match end (no results screen) ===`);

  const names = [];
  for (let i = 1; i <= TOTAL; i++) {
    names.push(i === DIAG_IDX + 1 ? 'DiagPlayer' : `Bot${i}`);
  }

  const players = await connectAll(names);
  await guestAll(players);

  const actives = players.slice(0, ACTIVE);
  console.log('Creating fresh room...');
  const roomId = await createFreshRoom(actives[0]);
  console.log(`  room ID: ${roomId}`);

  for (const p of actives.slice(1)) {
    p.socket.emit('join', { roomId, name: p.name });
    await p.waitFor('joined');
  }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  console.log('  lobby ready');

  console.log('Starting match...');
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));
  console.log('  daytime');

  console.log('Force-ending the match...');
  testCmd(actives[1], 'endMatch');
  await sleep(500);

  // All active players should see matchEnd
  const endedEv = actives[1].events.find(e => e.event === 'matchEnd');
  console.log(`  Bot2 received matchEnd: ${!!endedEv}`);
  const endedPhase = actives[1].events.find(e => e.event === 'matchPhase' && e.data && e.data.phase === 'ended');
  console.log(`  Bot2 received matchPhase(ended): ${!!endedPhase}`);

  // Player leaves (Back to Lobby), then rejoins
  const leaver = actives[0];
  console.log(`Player (${leaver.name}) leaving...`);
  leaver.socket.emit('leaveRoom');
  await sleep(300);

  console.log('Player rejoining the same room...');
  // Track events between now and leave to detect stale matchEnd
  const preJoinEventCount = leaver.events.length;
  leaver.socket.emit('join', { roomId, name: leaver.name });
  await leaver.waitFor('joined', 5000);
  await sleep(500);

  const postJoinEvents = leaver.events.slice(preJoinEventCount);
  const hasMatchEnd = postJoinEvents.some(e => e.event === 'matchEnd');
  const hasMatchPhaseEnded = postJoinEvents.some(e => e.event === 'matchPhase' && e.data && e.data.phase === 'ended');
  const hasMatchPhaseWaiting = postJoinEvents.some(e => e.event === 'matchPhase' && e.data && e.data.phase === 'waiting');

  if (hasMatchEnd) {
    console.log('  Server sends matchEnd on rejoin (client _joinedEnded flag suppresses it)');
  } else {
    console.log('  No matchEnd on rejoin');
  }
  if (hasMatchPhaseEnded) {
    console.log('  Room still in ended phase (other players present)');
  } else if (hasMatchPhaseWaiting) {
    console.log('  OK: Room reset to waiting phase');
  }

  // Now verify: when ALL players leave an ended room, it resets to waiting
  console.log('All players leaving ended room...');
  for (const p of actives.slice(1)) {
    if (p.socket.connected) p.socket.emit('leaveRoom');
  }
  // Send leaveRoom on the leaver too (they're back in the room now)
  leaver.socket.emit('leaveRoom');
  await sleep(300);

  // Create a fresh player to check the room state
  const checker = createPlayer('RoomChecker');
  await checker.waitFor('connect');
  checker.socket.emit('playAsGuest', { name: 'RoomChecker' });
  await checker.waitFor('guestJoined');
  checker.socket.emit('join', { roomId, name: 'RoomChecker' });
  await checker.waitFor('joined', 5000);
  await sleep(300);
  const checkerPhase = checker.events.find(e => e.event === 'matchPhase');
  if (checkerPhase && checkerPhase.data && checkerPhase.data.phase === 'waiting') {
    console.log('  OK: Empty ended room reset to waiting (server-side fix)');
  } else {
    console.log(`  Room phase after empty: ${checkerPhase ? checkerPhase.data.phase : 'unknown'}`);
  }
  checker.socket.disconnect();

  const diagEntries = readDiagLog();
  const tracePath = writeTraceFile(players, 'rejoin-after-end', diagEntries, {
    test: 'Player does not see results after rejoining ended room'
  });
  console.log(`Done. ${tracePath}\n`);
  for (const p of players) p.socket.disconnect();
}

async function scenario_play_again_in_progress() {
  console.log(`\n=== Scenario: Play Again during active match ===`);
  // Simulates: late spectator (not readied up for the new match) clicks Play Again
  // during an active match. Must route through handleDirectJoin for slot/phase/queue checks.

  const names = [];
  for (let i = 1; i <= TOTAL; i++) {
    names.push(i === DIAG_IDX + 1 ? 'DiagPlayer' : `Bot${i}`);
  }

  const players = await connectAll(names);
  await guestAll(players);

  const actives = players.slice(0, ACTIVE);
  const spares = players.slice(ACTIVE);
  const latePlayer = spares[0]; // Use a spare as the "late" player

  console.log('Creating fresh room...');
  const roomId = await createFreshRoom(actives[0]);
  console.log(`  room ID: ${roomId}`);

  for (const p of actives.slice(1)) {
    p.socket.emit('join', { roomId, name: p.name });
    await p.waitFor('joined');
  }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));

  console.log('Starting match...');
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));
  console.log('  daytime');

  // Spare joins as spectator, is NOT in queue
  latePlayer.socket.emit('join', { roomId, name: latePlayer.name });
  await latePlayer.waitFor('joined');
  await latePlayer.waitFor('spectatorAssigned', 5000).catch(() => null);
  console.log('  Late player joined as spectator');

  // Late player clicks Play Again (simulates clicking the button while spectating)
  const latePreCount = latePlayer.events.length;
  console.log('Late player clicking Play Again during active match...');
  latePlayer.socket.emit('playAgain');
  await sleep(500);

  const latePostEvents = latePlayer.events.slice(latePreCount);
  const hasJoinedGame = latePostEvents.some(e => e.event === 'joinedGame');
  const hasQueueUpdate = latePostEvents.some(e => e.event === 'queueUpdate');
  const joinedGameEv = latePostEvents.find(e => e.event === 'joinedGame');

  if (joinedGameEv) {
    const isDead = !!(joinedGameEv.data && joinedGameEv.data.isDead === true);
    console.log(`  Received joinedGame { isDead: ${isDead} } — routed through handleDirectJoin`);
    if (isDead) console.log('  Phase-aware: joined as dead/waiting (non-daytime)');
    else console.log('  Phase-aware: joined alive (daytime slot)');
  } else if (hasQueueUpdate) {
    console.log('  Slots full or queue present → went to queue (handleQueueJoin)');
  } else {
    console.log('  BUG: No joinedGame or queueUpdate received');
  }
  console.log('  (Old behavior would have insta-dropped via respawnPlayer)');

  const diagEntries = readDiagLog();
  const tracePath = writeTraceFile(players, 'play-again-in-progress', diagEntries, {
    test: 'Play Again during active match routes through handleDirectJoin'
  });
  console.log(`Done. ${tracePath}\n`);
  for (const p of players) p.socket.disconnect();
}

async function main() {
  clearDiagLog();
  const serverProc = await ensureServer();

  try {
    await scenario_nighttime_auto_top_off();
    await scenario_queue_jump_prevention();
    await scenario_rejoin_after_end();
    await scenario_play_again_in_progress();
    console.log('\n=== All scenarios complete ===');
  } catch (err) {
    console.error('Scenario failed:', err);
  }

  console.log('Shutting down test server...');
  serverProc.kill();
  await sleep(500);
  process.exit(0);
}

main();
