const {
  DAYTIME_MS, NIGHTTIME_MS, INTERMISSION_MS, END_GAME_MS
} = require('./config');
const { MOB_TYPES } = require('./mob-config');
const { initEnemies, buildSpawnPool } = require('./zombie');
const zombieAi = require('./zombie-ai');
const playerMod = require('./player');
const expMod = require('./exp');
const { _promoteFromQueue, getActivePlayerCount, getActivePlayerIds } = require('./join-manager');
const { recordGameStart } = require('./stats-tracker');

function getWaveComposition(pool) {
  const counts = new Map();
  for (const mt of pool) {
    const idx = MOB_TYPES.indexOf(mt);
    counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([mobType, count]) => ({ mobType, count }));
}

function _computeServerLevel(room) {
  let total = 0;
  for (const id in room.players) total += room.players[id].lvl || 1;
  return total;
}

function startMatch(room, fromEnded) {
  const playerNames = Object.values(room.players).filter(p => !p.isSpectator).map(p => p.name);
  recordGameStart(room.id, playerNames);
  room.matchStarted = true;
  const isRestart = room._postGameWaiting;
  room._postGameWaiting = false;
  room.currentWave = 1;
  room.matchPhase = 'daytime';
  room.phaseTimer = DAYTIME_MS;
  room.zombies.length = 0;
  room.waveServerLevel = Math.max(1, _computeServerLevel(room));
  room.mobSpawnPool = buildSpawnPool(room.waveServerLevel);
  room.grid.clear();
  const readySet = room._endGameReady || new Set();
  let firstReady = null;
  for (const id in room.players) {
    if (readySet.has(id)) { firstReady = room.players[id]; break; }
  }
  for (const id in room.players) {
    const p = room.players[id];
    if (readySet.size > 0 && !readySet.has(id) && p.isSpectator) {
      p.isSpectator = true;
      p.alive = false;
      if (firstReady) { p.x = firstReady.x; p.y = firstReady.y; }
    } else if (readySet.size > 0 || !isRestart || !p.isSpectator) {
      p.isSpectator = false;
      if (room._persistedExp.has(id)) {
        const totalExp = room._persistedExp.get(id);
        const result = expMod.fromCumulativeExp(totalExp);
        p.lvl = Math.max(1, result.level);
        p.exp = totalExp - expMod.cumulativeExp(Math.max(1, p.lvl - 1), 0);
        p.gold = 0;
      } else {
        p.lvl = 1; p.exp = 0; p.gold = 0;
      }
      playerMod.recalcStats(p);
      if (!p.alive) playerMod.respawnPlayer(id, room.players, room.zombies);
    }
  }
  const MAX_PLAYERS = require('./config').MAX_PLAYERS;
  let activeCount = 0;
  for (const id in room.players) {
    const p = room.players[id];
    if (!p.isSpectator) {
      activeCount++;
      if (activeCount > MAX_PLAYERS) {
        p.isSpectator = true;
        p.alive = false;
        console.log(`[room ${room.id}] enforce demoted ${id.slice(0,12)}`);
      }
    }
  }
  console.log(`[room ${room.id}] sm final active=${activeCount}`);
  _promoteFromQueue(room);
  zombieAi.recalcAllZombieTargets(room.zombies, room.players);
  const activePlayers = getActivePlayerIds(room);
  const matchData = { phase: 'daytime', timer: DAYTIME_MS, wave: 1, activePlayers };
  if (readySet.size > 0) {
    matchData.readyPlayers = activePlayers;
  }
  for (const id in room.players) {
    if (!room.players[id].isSpectator) {
      room.io.to('room:' + room.id).emit('playerInfo', playerMod.playerInfoObj(room.players[id]));
    }
  }
  for (const id in room.players) {
    if (room.players[id].isSpectator) {
      room.io.to('room:' + room.id).emit('playerInfo', playerMod.playerInfoObj(room.players[id]));
    }
  }
  room.io.to('room:' + room.id).emit('matchPhase', matchData);
  room.io.to('room:' + room.id).emit('waveComposition', {
    wave: room.currentWave, serverLevel: room.waveServerLevel,
    enemies: getWaveComposition(room.mobSpawnPool)
  });
  room._joinQueue = room._joinQueue.filter(id => room.players[id]?.isSpectator);
  room._broadcastLobbyUpdate();
}

function handleStartMatch(room, socketId) {
  const p = room.players[socketId];
  if (!p || p.isSpectator) return;
  if (room.matchPhase !== 'waiting' && !(room.matchPhase === 'ended' && room._allPlayersReady())) return;
  startMatch(room, room.matchPhase === 'ended');
}

function _advancePhase(room) {
  console.log('[PHASE] advance from=' + room.matchPhase + ' zombies.length=' + room.zombies.length);
  switch (room.matchPhase) {
    case 'daytime':
      try { require('fs').appendFileSync(require('path').join(__dirname, '..', 'Workflow', 'diag-log.json'), JSON.stringify({ t: Date.now(), action: 'daytime→nighttime', playerCount: Object.keys(room.players).length }) + '\n'); } catch (e) {}
      room.waveServerLevel = Math.max(1, _computeServerLevel(room));
      room.mobSpawnPool = buildSpawnPool(room.waveServerLevel);
      room.matchPhase = 'nighttime';
      room.phaseTimer = 0;
      room.zombies.length = 0;
      const maxAlive = 100 + (room.waveServerLevel - 1);
      room._nightMaxPop = Math.round(maxAlive * 0.3);
      zombieAi.ensureCount(room.zombies, room.mobSpawnPool, room.waveServerLevel, room.players, room._nightMaxPop);
      room.io.to('room:' + room.id).emit('matchPhase', { phase: 'nighttime', timer: 0, wave: room.currentWave, activePlayers: getActivePlayerIds(room) });
      room.io.to('room:' + room.id).emit('waveComposition', {
        wave: room.currentWave, serverLevel: room.waveServerLevel,
        enemies: getWaveComposition(room.mobSpawnPool)
      });
      break;
    case 'nighttime': {
      const anyAlive = Object.values(room.players).some(p => p.alive);
      if (!anyAlive) { _endMatch(room); return; }
      room.matchPhase = 'intermission';
      room.phaseTimer = INTERMISSION_MS;
      room.io.to('room:' + room.id).emit('matchPhase', { phase: 'intermission', timer: INTERMISSION_MS, wave: room.currentWave, activePlayers: getActivePlayerIds(room) });
      break;
    }
    case 'intermission': {
      for (const id in room.players) {
        if (!room.players[id].alive && !room.players[id].isSpectator) {
          playerMod.respawnPlayer(id, room.players, room.zombies);
          room.io.to(id).emit('respawned');
          const rt = expMod.getExpToNext(room.players[id].lvl);
          room.io.to(id).emit('accountUpdate', { exp: room.players[id].exp, level: room.players[id].lvl, expToNext: rt, gold: room.players[id].gold });
        }
      }
      room.currentWave++;
      room.waveServerLevel = Math.max(1, _computeServerLevel(room));
      room.mobSpawnPool = buildSpawnPool(room.waveServerLevel);
      room.matchPhase = 'daytime';
      room.phaseTimer = DAYTIME_MS;
      room.io.to('room:' + room.id).emit('matchPhase', { phase: 'daytime', timer: DAYTIME_MS, wave: room.currentWave, activePlayers: getActivePlayerIds(room) });
      room.io.to('room:' + room.id).emit('waveComposition', {
        wave: room.currentWave, serverLevel: room.waveServerLevel,
        enemies: getWaveComposition(room.mobSpawnPool)
      });
      break;
    }
  }
}

function _endMatch(room) {
  room.matchPhase = 'ended';
  room.phaseTimer = END_GAME_MS;
  room._endGameReady = new Set();
  room._postGameWaiting = true;
  room._roundSaved = false;
  room._saveRound();
  room._roundSaved = true;
  room.io.to('room:' + room.id).emit('matchEnd', {
    wave: room.currentWave,
    timer: END_GAME_MS,
    serverLevel: _computeServerLevel(room),
    playerStats: room._getSortedPlayerStats(),
    lobbyPlayers: room.getLobbyPlayers()
  });
  room.io.to('room:' + room.id).emit('matchPhase', { phase: 'ended', timer: END_GAME_MS, wave: room.currentWave, activePlayers: getActivePlayerIds(room) });
  room._broadcastQueueUpdate();
  room._broadcastLobbyUpdate();
}

function resetMatch(room) {
  room.matchPhase = 'waiting';
  room.phaseTimer = 0;
  room.currentWave = 0;
  room.matchStarted = false;
  room._roundSaved = false;
  room._endGameReady = new Set();
  room._lastEndGameBroadcast = 0;
  room._lobbyOrder = Object.keys(room.players);
  room.mobSpawnPool = buildSpawnPool(room.currentServerLevel || 1);
  room.zombies = initEnemies(room.mobSpawnPool, room.currentServerLevel || 1, room.players);
  room.grid.clear();
  for (const id in room.players) {
    if (!room.players[id].alive) playerMod.respawnPlayer(id, room.players, room.zombies);
  }
  room.io.to('room:' + room.id).emit('matchReset');
}

function _timerEndReset(room) {
  const readySnapshot = Array.from(room._endGameReady);
  room.matchPhase = 'waiting';
  room.phaseTimer = 0;
  room.currentWave = 0;
  room.matchStarted = false;
  room._roundSaved = false;
  room._lastEndGameBroadcast = 0;
  room._lobbyOrder = Object.keys(room.players);
  const sl = Math.max(1, _computeServerLevel(room));
  room.mobSpawnPool = buildSpawnPool(sl);
  room.zombies = initEnemies(room.mobSpawnPool, sl, room.players);
  room.grid.clear();
  room._endGameReady = new Set(readySnapshot);
  for (const id in room.players) {
    if (readySnapshot.includes(id) && !room.players[id].alive) playerMod.respawnPlayer(id, room.players, room.zombies);
  }
  for (const id in room.players) {
    const p = room.players[id];
    if (!p.isSpectator && !readySnapshot.includes(id)) {
      p.isSpectator = true;
      p.alive = false;
    }
  }
  const prePromoteActive = getActivePlayerCount(room);
  const prePromoteQueue = room._joinQueue.length;
  _promoteFromQueue(room);
  const postPromoteActive = getActivePlayerCount(room);
  const postPromoteQueue = room._joinQueue.length;
  room.io.to('room:' + room.id).emit('matchReset', { readyPlayers: readySnapshot, activePlayers: getActivePlayerIds(room) });
  console.log(`[room ${room.id}] _timerEndReset: ready=${readySnapshot.length} queue=${prePromoteQueue}->${postPromoteQueue} active=${prePromoteActive}->${postPromoteActive}`);
  room._broadcastQueueUpdate();
  room.io.to('room:' + room.id).emit('lobbyUpdate', {
    players: room.getLobbyPlayers().filter(p => readySnapshot.includes(p.id) || !room.players[p.id]?.isSpectator)
  });
}

function _testAdvancePhase(room) {
  if (room.matchPhase === 'ended') { _timerEndReset(room); return; }
  room.killAllMobs();
  _advancePhase(room);
  if (room.matchPhase !== 'daytime' && room.matchPhase !== 'intermission') {
    _advancePhase(room);
  }
}

module.exports = {
  startMatch, handleStartMatch, _advancePhase, _endMatch,
  resetMatch, _timerEndReset, _testAdvancePhase, _computeServerLevel
};
