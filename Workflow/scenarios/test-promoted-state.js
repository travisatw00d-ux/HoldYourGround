const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER = 'http://localhost:3000';
const outDir = __dirname;
const diagLogPath = path.join(outDir, '..', 'diag-log.json');
const rootDir = path.join(__dirname, '..', '..');

function createPlayer(name) {
  const socket = io(SERVER, { transports: ['polling'] });
  const events = []; const pending = {};
  function capture(event, data) { const entry = { t: Date.now(), event, data }; events.push(entry); const list = pending[event]; if (list) { for (let i = list.length - 1; i >= 0; i--) { if (list[i].pred ? list[i].pred(entry) : true) { list[i].resolve(entry); list.splice(i, 1); } } } }
  socket.on('connect', () => capture('connect', {}));
  socket.on('disconnect', () => capture('disconnect', {}));
  socket.onAny((event, ...args) => capture(event, args[0]));
  function waitFor(event, pred, timeout) { if (typeof pred === 'number') { timeout = pred; pred = null; } if (!timeout) timeout = 30000; return new Promise((resolve, reject) => { const match = events.find(e => e.event === event && (!pred || pred(e))); if (match) return resolve(match); const timer = setTimeout(() => { const idx = (pending[event] || []).findIndex(p => p.resolve === resolve); if (idx >= 0) pending[event].splice(idx, 1); reject(new Error(`[${name}] timeout waiting for ${event}`)); }, timeout); if (!pending[event]) pending[event] = []; pending[event].push({ resolve, pred, timer }); }); }
  function getLast(event) { const matched = events.filter(e => e.event === event); return matched.length > 0 ? matched[matched.length - 1] : null; }
  return { socket, name, events, capture, waitFor, getLast };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function testCmd(p, action) { p.socket.emit('__test', { action }); }

async function ensureServer() {
  console.log('Starting test server...');
  const proc = spawn('node', ['server.js'], { cwd: rootDir, env: { ...process.env, TEST_MODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => { const line = d.toString().trim(); if (line) console.log(`  [server] ${line}`); });
  proc.stderr.on('data', d => { const line = d.toString().trim(); if (line) console.log(`  [server:err] ${line}`); });
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 20000); proc.stdout.on('data', function onData(d) { if (d.toString().includes('http://localhost')) { clearTimeout(timeout); proc.stdout.removeListener('data', onData); setTimeout(resolve, 500); } }); proc.on('error', (e) => { clearTimeout(timeout); reject(e); }); });
  console.log('  server ready'); return proc;
}

async function connectAll(names) { const players = []; for (const name of names) { const p = createPlayer(name); players.push(p); await p.waitFor('connect'); } return players; }
async function guestAll(players) { for (const p of players) { p.socket.emit('playAsGuest', { name: p.name }); await p.waitFor('guestJoined'); } }
async function createFreshRoom(leader) { for (let attempt = 0; attempt < 3; attempt++) { const ip = leader.waitFor('init', 10000); leader.socket.emit('createRoom', { name: leader.name }); try { const ev = await ip; const roomId = ev.data && ev.data.roomId; if (roomId) { await leader.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting'); return roomId; } } catch {} await sleep(2000); } throw new Error('Could not create fresh room'); }

async function main() {
  const serverProc = await ensureServer();

  console.log(`\n=== Scenario: Promoted spectator state after timer ===`);

  const actives = await connectAll(Array.from({ length: 10 }, (_, i) => `Bot${i + 1}`));
  const spec = (await connectAll(['Spec1']))[0];
  await guestAll([...actives, spec]);

  const roomId = await createFreshRoom(actives[0]);
  for (const p of actives.slice(1)) { p.socket.emit('join', { roomId, name: p.name }); await p.waitFor('joined'); }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));

  console.log('Starting match...');
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));

  console.log('Spectator joining mid-match...');
  spec.socket.emit('join', { roomId, name: 'Spec1' });
  await spec.waitFor('joined');
  await spec.waitFor('spectatorAssigned', 5000).catch(() => null);
  console.log('  spectAssigned:', spec.getLast('spectatorAssigned')?.event);

  // Check state before queuing
  console.log(`  pre-queue: screen=${spec.getLast('matchPhase')?.data?.phase} isSpec=${spec.events.some(e => e.event === 'spectatorAssigned')}`);

  console.log('Spectator queuing...');
  spec.socket.emit('joinGame');
  await spec.waitFor('queueUpdate', 5000);

  const qu1 = spec.getLast('queueUpdate');
  console.log(`  queueUpdate: ${JSON.stringify({ playerCount: qu1?.data?.playerCount, queued: qu1?.data?.queued?.length })}`);

  console.log('Ending match...');
  testCmd(actives[0], 'endMatch');
  await sleep(500);

  const mpEnded = spec.getLast('matchPhase');
  const meEnded = spec.getLast('matchEnd');
  console.log(`  after end: matchPhase=${mpEnded?.data?.phase} matchEnd=${!!meEnded} screen from last event=?`);

  console.log('Advancing phase (timer expires)...');
  testCmd(actives[0], 'advancePhase');
  await sleep(500);

  const matchRst = spec.getLast('matchReset');
  const piPromoted = spec.getLast('playerInfo');
  const qu2 = spec.getLast('queueUpdate');
  const luPromoted = spec.getLast('lobbyUpdate');
  console.log(`  after timer: matchReset=${!!matchRst}`);
  console.log(`  playerInfo (isSpec): ${piPromoted ? piPromoted.data?.isSpectator : 'none'}`);
  console.log(`  queueUpdate cnt: ${qu2 ? qu2.data?.playerCount : 'none'}`);
  console.log(`  lobbyUpdate cnt: ${luPromoted ? luPromoted.data?.players?.length : 'none'}`);
  console.log(`  myId in lobby: ${luPromoted && luPromoted.data?.players?.some(p => p.id === spec.socket.id)}`);

  console.log('Starting match (someone clicks Start Match)...');
  actives[0].socket.emit('startMatch');
  await sleep(500);

  const mpDaytime = spec.getLast('matchPhase');
  const piAfter = spec.getLast('playerInfo');
  const stateEv = spec.events.filter(e => e.event === 'state');
  console.log(`  matchPhase(daytime): phase=${mpDaytime?.data?.phase} readyPlayers=${mpDaytime?.data?.readyPlayers?.length}`);
  console.log(`  myId in readyPlayers: ${mpDaytime?.data?.readyPlayers?.includes(spec.socket.id)}`);
  console.log(`  playerInfo after: isSpec=${piAfter?.data?.isSpectator}`);
  console.log(`  state events after startMatch: ${stateEv.length}`);
  console.log(`  isSpectator flag after all: ${spec.getLast('playerInfo')?.data?.isSpectator}`);

  // Print events around the match start
  console.log('\nSpec1 events (last 15):');
  const specEvents = spec.events;
  for (let i = Math.max(0, specEvents.length - 15); i < specEvents.length; i++) {
    const e = specEvents[i];
    let data = e.data;
    if (typeof data === 'object' && data !== null) {
      if (data.phase) { data = { phase: data.phase, readyPlayers: data.readyPlayers?.length }; }
      else if (data.isSpectator !== undefined) { data = { isSpec: data.isSpectator }; }
      else if (data.playerCount !== undefined) { data = { pc: data.playerCount, q: data.queued?.length }; }
      else if (data.players !== undefined) { data = { cnt: data.players?.length }; }
    }
    console.log(`  ${e.event}: ${JSON.stringify(data)}`);
  }

  await sleep(500);
  serverProc.kill(); await sleep(500); process.exit(0);
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
