import { state } from './state.js';

export function drawDiag(ctx) {
  if (!state.showDiag) return;
  ctx.save();
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(6, 86, 200, 106);
  const ftCol = state.frameTimeMs > 20 ? '#ff9' : '#9fe';
  ctx.fillStyle = ftCol;
  ctx.fillText(`fps ${state.fpsValue}  frame ${state.frameTimeMs.toFixed(1)} (max ${state.maxFrameMs.toFixed(0)})`, 10, 90);
  ctx.fillStyle = state.ping < 80 ? '#9f9' : state.ping < 150 ? '#fe9' : '#f99';
  ctx.fillText(`ping ${state.ping}ms (max ${state.maxPing}ms)`, 10, 106);
  ctx.fillStyle = state.maxArrival < 100 ? '#9f9' : state.maxArrival < 160 ? '#fe9' : '#f99';
  ctx.fillText(`arrival ${Math.round(state.lastArrival)} (max ${Math.round(state.maxArrival)})`, 10, 122);
  ctx.fillStyle = state.maxSrvInterval < 80 ? '#9f9' : state.maxSrvInterval < 120 ? '#fe9' : '#f99';
  ctx.fillText(`srv ${Math.round(state.lastSrvInterval)} (max ${Math.round(state.maxSrvInterval)})`, 10, 138);
  ctx.fillStyle = state.maxFrameGap < 25 ? '#9f9' : state.maxFrameGap < 45 ? '#fe9' : '#f99';
  ctx.fillText(`rafgap ${Math.round(state.lastFrameGap)} (max ${Math.round(state.maxFrameGap)})`, 10, 154);
  ctx.fillStyle = '#9fe';
  ctx.fillText(`pkt ${(state.lastPacketBytes / 1024).toFixed(1)}KB`, 10, 170);
  ctx.fillStyle = 'rgba(159,238,238,0.6)';
  ctx.fillText('[F] toggle diag', 10, 186);
  ctx.restore();
}
