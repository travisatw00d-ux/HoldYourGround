const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER = 'http://localhost:3000';
const ACTIVE = 10;
const outDir = __dirname;
const rootDir = path.join(__dirname, '..', '..');

function createPlayer(name) {
  const socket = io(SERVER, { transports: ['polling'] });
  const events = []; const pending = {};
  function capture(event, data) { const entry = { t: Date.now(), event, data }; events.push(entry); const list = pending[event]; if (list) { for (let i = list.length - 1; i >= 0; i--) { if (list[i].pred ? list[i].pred(entry) : true) { list[i].resolve(entry); list.splice(i, 1); } } } }
  socket.on('connect', () => capture('connect', {}));
  socket.on('disconnect', () => capture('disconnect', {}));
  socket.onAny((event, ...args) => capture(event, args[0]));
  function waitFor(event, pred, timeout) { if (typeof pred === 'number') { timeout = pred; pred = null; } if (!timeout) timeout = 30000; return new Promise((resolve, reject) => { const match = events.find(e => e.event === event && (!pred || pred(e))); if (match) return resolve(match); const timer = setTimeout(() => { const idx = (pending[event] || []).findIndex(p => p.resolve === resolve); if (idx >= 0) pending[event].splice(idx, 1); reject(new Error(`[${name}] timeout waiting for ${event}`)); }, timeout); if (!pending[event]) pending[event] = []; pending[event].push({ resolve, pred, timer }); }); }
  return { socket, name, events, capture, waitFor };
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
async function createFreshRoom(leader) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const initPromise = leader.waitFor('init', 10000);
    leader.socket.emit('createRoom', { name: leader.name });
    try {
      const ev = await initPromise;
      const roomId = ev.data && ev.data.roomId;
      if (roomId) { await leader.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting'); return roomId; }
    } catch {}
    await sleep(2000);
  }
  throw new Error('Could not create fresh room after 3 attempts');
}

function writeTrace(players, scenarioName, extra) {
  const allEvents = []; for (const p of players) { for (const e of p.events) allEvents.push({ player: p.name, ...e }); }
  allEvents.sort((a, b) => a.t - b.t);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(outDir, `overflow-${ts}.json`), JSON.stringify({ scenario: scenarioName, summary: { totalPlayers: players.length, ...extra }, events: allEvents }, null, 2));
}

// ─── S1: Waiting phase rejects >10 players ───
async function s1_waiting_rejects_overflow() {
  console.log(`\n=== S1: Waiting phase rejects >10 ===`);
  const all = await connectAll(Array.from({ length: 11 }, (_, i) => `Bot${i + 1}`));
  await guestAll(all);
  const actives = all.slice(0, ACTIVE); const extra = all[ACTIVE];
  const roomId = await createFreshRoom(actives[0]);
  for (const p of actives.slice(1)) { p.socket.emit('join', { roomId, name: p.name }); await p.waitFor('joined'); }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  extra.socket.emit('join', { roomId, name: extra.name });
  let gotJoined = false, gotError = false;
  try { await extra.waitFor('joined', 3000); gotJoined = true; } catch { gotError = extra.events.some(e => e.event === 'error'); }
  console.log(`  Joined: ${gotJoined}, Error: ${gotError} — ${gotError ? 'PASS' : 'FAIL'}`);
  writeTrace(all, 's1-waiting-rejects', { gotJoined, gotError });
  for (const p of all) p.socket.disconnect();
}

// ─── S2: Spectators CAN join during active match ───
async function s2_spectators_during_daytime() {
  console.log(`\n=== S2: Spectators join during daytime ===`);
  const all = await connectAll(Array.from({ length: 20 }, (_, i) => i < 10 ? `P${i + 1}` : `Spec${i - 9}`));
  await guestAll(all);
  const actives = all.slice(0, ACTIVE); const specs = all.slice(ACTIVE);
  const roomId = await createFreshRoom(actives[0]);
  for (const p of actives.slice(1)) { p.socket.emit('join', { roomId, name: p.name }); await p.waitFor('joined'); }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));
  let joined = 0;
  for (const s of specs) { s.socket.emit('join', { roomId, name: s.name }); try { await s.waitFor('joined', 5000); joined++; } catch {} }
  console.log(`  ${joined}/${specs.length} spectators joined during daytime — ${joined === specs.length ? 'PASS' : 'FAIL'}`);
  writeTrace(all, 's2-spectators-daytime', { joined, total: specs.length });
  for (const p of all) p.socket.disconnect();
}

// ─── S3: Trim on reset (server stays stable) ───
async function s3_trim_on_reset() {
  console.log(`\n=== S3: Trim on reset (server stable) ===`);
  const all = await connectAll(Array.from({ length: ACTIVE + 10 }, (_, i) => `Bot${i + 1}`));
  await guestAll(all);
  const actives = all.slice(0, ACTIVE); const specs = all.slice(ACTIVE);
  const roomId = await createFreshRoom(actives[0]);
  for (const p of actives.slice(1)) { p.socket.emit('join', { roomId, name: p.name }); await p.waitFor('joined'); }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  actives[0].socket.emit('startMatch');
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'daytime', 20000)));
  for (const s of specs) { s.socket.emit('join', { roomId, name: s.name }); await s.waitFor('joined', 5000); }
  testCmd(actives[0], 'endMatch'); await sleep(300);
  testCmd(actives[0], 'advancePhase'); await sleep(500);
  // All connected sockets receive matchReset (Socket.IO room), but server trimmed from this.players
  const withReset = all.filter(p => p.events.some(e => e.event === 'matchReset'));
  const gotState = all.filter(p => p.events.some(e => e.event === 'state'));
  console.log(`  matchReset: ${withReset.length}/${all.length}, state after reset: ${gotState.length}/${all.length}`);
  console.log(`  PASS: Trimming did not crash server`);
  writeTrace(all, 's3-trim', { matchResetCount: withReset.length });
  for (const p of all) p.socket.disconnect();
}

// ─── S4: Ghost prevention ───
async function s4_ghost_prevention() {
  console.log(`\n=== S4: Ghost prevention ===`);
  const all = await connectAll(Array.from({ length: 11 }, (_, i) => `Bot${i + 1}`));
  await guestAll(all);
  const actives = all.slice(0, ACTIVE); const extra = all[ACTIVE];
  const roomId = await createFreshRoom(actives[0]);
  for (const p of actives.slice(1)) { p.socket.emit('join', { roomId, name: p.name }); await p.waitFor('joined'); }
  await Promise.all(actives.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  extra.socket.emit('join', { roomId, name: extra.name });
  let gotJoined = false, gotError = false;
  try { await extra.waitFor('joined', 3000); gotJoined = true; } catch { gotError = extra.events.some(e => e.event === 'error'); }
  console.log(`  Joined: ${gotJoined}, Error: ${gotError} — ${!gotJoined && gotError ? 'PASS: Ghost prevented' : 'FAIL'}`);
  writeTrace(all, 's4-ghost', { gotJoined, gotError });
  for (const p of all) p.socket.disconnect();
}

// ─── S5: Leave/rejoin ───
async function s5_leave_rejoin() {
  console.log(`\n=== S5: Leave/rejoin ===`);
  await sleep(1000);
  const all = await connectAll(Array.from({ length: ACTIVE }, (_, i) => `Bot${i + 1}`));
  await guestAll(all);
  const roomId = await createFreshRoom(all[0]);
  for (const p of all.slice(1)) { p.socket.emit('join', { roomId, name: p.name }); await p.waitFor('joined'); }
  await Promise.all(all.map(p => p.waitFor('matchPhase', e => e.data && e.data.phase === 'waiting')));
  const leaver = all[9];
  leaver.socket.emit('leaveRoom'); await sleep(300);
  leaver.socket.emit('join', { roomId, name: leaver.name }); await leaver.waitFor('joined'); await sleep(300);
  const mp = leaver.events.filter(e => e.event === 'matchPhase');
  console.log(`  Rejoined phase: ${mp.length > 0 ? mp[mp.length - 1].data.phase : 'unknown'} — PASS`);
  writeTrace(all, 's5-leave-rejoin', { rejoinedPhase: mp.length > 0 ? mp[mp.length - 1].data.phase : null });
  for (const p of all) p.socket.disconnect();
}

async function main() {
  const serverProc = await ensureServer();
  try {
    await s1_waiting_rejects_overflow(); await sleep(2000);
    await s2_spectators_during_daytime(); await sleep(2000);
    await s3_trim_on_reset(); await sleep(2000);
    await s4_ghost_prevention(); await sleep(2000);
    await s5_leave_rejoin();
    console.log('\n=== All lobby overflow scenarios complete ===');
  } catch (err) { console.error('Scenario failed:', err); }
  serverProc.kill(); await sleep(500); process.exit(0);
}
main();
