import { state } from './state.js';

const VW = 800;
const VH = 600;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const _cam = { x: 0, y: 0 };

export function getCamera(alpha) {
  const me = state.players[state.myId];
  if (!me) { _cam.x = 0; _cam.y = 0; return _cam; }
  if (alpha === undefined) alpha = 1;
  const mx = (me.px === undefined ? me.x : me.px + (me.x - me.px) * alpha);
  const my = (me.py === undefined ? me.y : me.py + (me.y - me.py) * alpha);
  _cam.x = clamp(mx - VW / 2, 0, Math.max(0, state.worldW - VW));
  _cam.y = clamp(my - VH / 2, 0, Math.max(0, state.worldH - VH));
  return _cam;
}
