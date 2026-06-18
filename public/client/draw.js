function drawHealthBar(ctx, x, y, w, h, hp, maxHp) {
  const pct = Math.max(0, hp / maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - w / 2, y, w, h);
  const col = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * pct, h - 2);
}

function getBladeSegment(p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return null;
  const angle = getDrawAngle(p);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const ox = sx + rx, oy = sy + ry;
  const scale = vis.scale;
  const rot = angle + (vis.rotation || 0);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const tipX = ox + (window.BLADE_TIP_X * cosR - window.BLADE_TIP_Y * sinR) * scale;
  const tipY = oy + (window.BLADE_TIP_X * sinR + window.BLADE_TIP_Y * cosR) * scale;
  const hiltX = ox + (window.BLADE_HILT_X * cosR - window.BLADE_HILT_Y * sinR) * scale;
  const hiltY = oy + (window.BLADE_HILT_X * sinR + window.BLADE_HILT_Y * cosR) * scale;
  return { hiltX, hiltY, tipX, tipY };
}

function drawSword(ctx, p, sx, sy) {
  const vis = getVis(p);
  if (!vis) return;

  const angle = getDrawAngle(p);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;

  const sw = 1254 * vis.scale;
  const sh = 1254 * vis.scale;

  ctx.save();
  ctx.translate(sx + rx, sy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(swordImg, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function drawDebugSwordHitbox(ctx, p, sx, sy) {
  const seg = getBladeSegment(p, sx, sy);
  if (!seg) return;
  const { hiltX, hiltY, tipX, tipY } = seg;
  const bladeW = 12;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
  ctx.lineWidth = bladeW * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hiltX, hiltY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,200,0,0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`hitbox (bladeW=${bladeW})`, tipX + 6, tipY - 6);

  ctx.restore();
}

function drawZombieHand(ctx, z, szx, szy, angle, handKey, lvl) {
  const vis = window.ZOMBIE_VISUALS && window.ZOMBIE_VISUALS[handKey];
  if (!vis) return;
  const isT2 = lvl >= 6;
  const img = handKey === 'left_hand'
    ? (isT2 ? zombieT2LeftHandImg : zombieLeftHandImg)
    : (isT2 ? zombieT2RightHandImg : zombieRightHandImg);
  if (!img.complete || img.naturalWidth === 0) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = vis.offsetX * cos - vis.offsetY * sin;
  const ry = vis.offsetX * sin + vis.offsetY * cos;
  const handScale = isT2 ? 1.1 : 1.0;
  const sw = img.naturalWidth * vis.scale * handScale;
  const sh = img.naturalHeight * vis.scale * handScale;
  ctx.save();
  ctx.translate(szx + rx, szy + ry);
  ctx.rotate(angle + (vis.rotation || 0));
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}
