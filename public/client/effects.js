function updateEffects() {
  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${hitFlash / 20})`;
    ctx.fillRect(0, 0, VW, VH);
    hitFlash--;
  }

  const cam = getCamera();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const dn = dmgNumbers[i];
    dn.timer -= 1 / 60;
    const sx = dn.x - cam.x;
    const sy = dn.y - cam.y - 30 * (1 - dn.timer / dn.duration);
    if (dn.timer <= 0) { dmgNumbers.splice(i, 1); continue; }
    const alpha = dn.timer > 0.3 ? 1 : dn.timer / 0.3;
    ctx.fillStyle = `rgba(255, 60, 60, ${alpha})`;
    ctx.fillText(`-${dn.dmg}`, sx, sy);
  }
  ctx.textBaseline = 'alphabetic';

  for (let i = mergeSmokes.length - 1; i >= 0; i--) {
    const s = mergeSmokes[i];
    s.timer -= 1 / 60;
    if (s.timer <= 0) { mergeSmokes.splice(i, 1); continue; }
    const pct = 1 - s.timer;
    const sx = s.x - cam.x, sy = s.y - cam.y;
    for (let r = 0; r < 3; r++) {
      const radius = 10 + (pct + r * 0.15) * 40;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, radius), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 160, 160, ${Math.max(0, 1 - pct - r * 0.25)})`;
      ctx.fill();
    }
  }
}
