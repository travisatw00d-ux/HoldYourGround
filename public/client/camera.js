function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getCamera() {
  const me = players[myId];
  if (!me) return { x: 0, y: 0 };
  return {
    x: clamp(me.x - VW / 2, 0, Math.max(0, worldW - VW)),
    y: clamp(me.y - VH / 2, 0, Math.max(0, worldH - VH))
  };
}
