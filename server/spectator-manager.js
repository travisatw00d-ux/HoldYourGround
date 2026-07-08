function _assignFollowTarget(room, spectatorId) {
  const alive = Object.values(room.players)
    .filter(p => p.alive && !p.isSpectator)
    .sort((a, b) => (b.lvl || 1) - (a.lvl || 1));
  if (alive.length > 0) {
    room.spectatorFollows.set(spectatorId, alive[0].id);
  } else {
    room.spectatorFollows.delete(spectatorId);
  }
}

function cleanStaleFollows(room) {
  const staleFollows = [];
  for (const [specId, targetId] of room.spectatorFollows) {
    const spec = room.players[specId];
    if (spec && !spec.isSpectator && spec.alive) {
      staleFollows.push(specId);
      continue;
    }
    const target = room.players[targetId];
    if (!target || !target.alive || target.isSpectator) {
      _assignFollowTarget(room, specId);
    }
  }
  for (const id of staleFollows) room.spectatorFollows.delete(id);
}

module.exports = { _assignFollowTarget, cleanStaleFollows };
