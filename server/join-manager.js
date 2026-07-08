const { MAX_PLAYERS } = require('./config');
const playerMod = require('./player');

function getActivePlayerCount(room) {
  let count = 0;
  for (const id in room.players) { if (!room.players[id].isSpectator) count++; }
  return count;
}

function getActivePlayerIds(room) {
  return Object.keys(room.players).filter(id => !room.players[id].isSpectator);
}

function _broadcastQueueUpdate(room, directTargetId) {
  const activeCount = getActivePlayerCount(room);
  let queuePos = 0;
  const queued = room._joinQueue.map((id, idx) => {
    const p = room.players[id];
    if (!p) return null;
    const pos = ++queuePos;
    return { id, name: p.name, pos };
  }).filter(Boolean);
  const data = { queued, playerCount: activeCount };
  if (directTargetId) room.io.to(directTargetId).emit('queueUpdate', data);
  room.io.to('room:' + room.id).emit('queueUpdate', data);
}

function handleDirectJoin(room, id) {
  const p = room.players[id];
  if (!p || !p.isSpectator) return;
  const activeCount = getActivePlayerCount(room);
  if (room.matchPhase === 'ended' || activeCount >= MAX_PLAYERS || room._joinQueue.length > 0) {
    handleQueueJoin(room, id);
    return;
  }
  p.isSpectator = false;
  p.lvl = 1; p.exp = 0; p.gold = 0;
  room._persistedExp.delete(p.id);
  const qIdx = room._joinQueue.indexOf(id);
  if (qIdx >= 0) room._joinQueue.splice(qIdx, 1);

  if (room.matchPhase === 'daytime') {
    playerMod.respawnPlayer(id, room.players, room.zombies);
    playerMod.recalcStats(p);
    room.io.to(id).emit('playerInfo', playerMod.playerInfoObj(p));
    room.io.to(id).emit('joinedGame');
  } else if (room.matchPhase === 'waiting') {
    playerMod.recalcStats(p);
    room.io.to(id).emit('playerInfo', playerMod.playerInfoObj(p));
    room.io.to(id).emit('joinedGame');
  } else {
    p.alive = false;
    playerMod.recalcStats(p);
    const living = Object.values(room.players).find(p2 => p2.alive && p2.id !== id);
    if (living) { p.x = living.x; p.y = living.y; }
    room.io.to(id).emit('joinedGame', { isDead: true });
  }

  for (const oid in room.players) {
    room.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(p));
  }
  _broadcastQueueUpdate(room);
  room.lastBroadcast = 0;
}

function handleQueueJoin(room, id) {
  const p = room.players[id];
  if (!p || !p.isSpectator) return;
  if (!room._joinQueue.includes(id)) {
    room._joinQueue.push(id);
    _broadcastQueueUpdate(room, id);
    room.lastBroadcast = 0;
  }
}

function _promoteFromQueue(room) {
  const activeCount = getActivePlayerCount(room);
  let slots = Math.max(0, MAX_PLAYERS - activeCount);
  while (slots > 0 && room._joinQueue.length > 0) {
    const qid = room._joinQueue.shift();
    const qp = room.players[qid];
    if (!qp || !qp.isSpectator) { continue; }
    qp.isSpectator = false;
    qp.lvl = 1; qp.exp = 0; qp.gold = 0;
    room._persistedExp.delete(qp.id);
    playerMod.recalcStats(qp);

    if (room.matchPhase === 'daytime') {
      playerMod.respawnPlayer(qid, room.players, room.zombies);
      room.io.to(qid).emit('playerInfo', playerMod.playerInfoObj(qp));
      room.io.to(qid).emit('joinedGame');
    } else if (room.matchPhase === 'waiting' || room.matchPhase === 'ended') {
      qp.alive = false;
      room.io.to(qid).emit('playerInfo', playerMod.playerInfoObj(qp));
    } else {
      qp.alive = false;
      const living = Object.values(room.players).find(p2 => p2.alive && p2.id !== qid);
      if (living) { qp.x = living.x; qp.y = living.y; }
      room.io.to(qid).emit('joinedGame', { isDead: true });
    }

    for (const oid in room.players) {
      room.io.to(oid).emit('playerInfo', playerMod.playerInfoObj(qp));
    }
    slots--;
  }
  _broadcastQueueUpdate(room);
  room._broadcastLobbyUpdate();
  room.lastBroadcast = 0;
}

function handleEndGameReady(room, id) { room._endGameReady.add(id); room._broadcastEndGameUpdate(); room._broadcastLobbyUpdate(); }
function handleEndGameLeave(room, id) { room._endGameReady.delete(id); room._broadcastEndGameUpdate(); room._broadcastLobbyUpdate(); }

module.exports = {
  getActivePlayerCount, getActivePlayerIds,
  handleDirectJoin, handleQueueJoin, _promoteFromQueue,
  _broadcastQueueUpdate,
  handleEndGameReady, handleEndGameLeave
};
