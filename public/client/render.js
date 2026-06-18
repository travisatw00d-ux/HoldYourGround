function render() {
  ctx.clearRect(0, 0, VW, VH);

  const cam = getCamera();

  const me = players[myId];
  if (me && me.alive) {
    const target = Math.atan2((mouseY + cam.y) - me.y, (mouseX + cam.x) - me.x);
    if (localAnim) {
      const diff = target - localAnim.lockedAngle;
      const norm = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxRot = 5 * Math.PI / 180;
      me.facingAngle = localAnim.lockedAngle + Math.max(-maxRot, Math.min(maxRot, norm));
    } else {
      me.facingAngle = target;
    }
  }

  if (localAnim) {
    const elapsed = performance.now() - localAnim.startTime;
    const duration = (localAnim.totalFrames / 60) * 1000 / 4;
    localAnim.frame = Math.floor((elapsed / duration) * localAnim.totalFrames);
    if (localAnim.frame >= localAnim.totalFrames) localAnim = null;
  }

  if (backgroundCanvas) {
    ctx.drawImage(backgroundCanvas, cam.x, cam.y, VW, VH, 0, 0, VW, VH);
  }

  for (const z of zombies) {
    if (!z.alive) continue;
    const szx = z.x - cam.x, szy = z.y - cam.y;
    if (szx < -40 || szx > VW + 40 || szy < -40 || szy > VH + 40) continue;

    const zombieAngle = z.headingAngle || 0;

    const headImg = (z.lvl >= 6 && zombieT2HeadImg.complete && zombieT2HeadImg.naturalWidth > 0) ? zombieT2HeadImg : zombieHeadImg;
    if (headImg.complete && headImg.naturalWidth > 0) {
      ctx.save();
      const headScale = (z.lvl >= 6 ? 1.1 : 1.0);
      const sz = (40 * headScale) / Math.max(headImg.naturalWidth, headImg.naturalHeight);
      const w = headImg.naturalWidth * sz;
      const h = headImg.naturalHeight * sz;
      ctx.translate(szx, szy);
      ctx.rotate(zombieAngle - Math.PI / 2);
      ctx.drawImage(headImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'left_hand', z.lvl);
    drawZombieHand(ctx, z, szx, szy, zombieAngle, 'right_hand', z.lvl);

    ctx.fillStyle = '#ff6666';
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const zombieLabel = 'zombie' + (z.lvl && z.lvl > 1 ? ' lvl ' + z.lvl : '');
    ctx.fillText(zombieLabel, szx, szy - 30);
    drawHealthBar(ctx, szx, szy - 24, 30, 3, z.health, z.maxHealth);
  }

  const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
  const topKills = sorted.length > 0 ? sorted[0].kills : 0;

  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    const sx = p.x - cam.x;
    const sy = p.y - cam.y;

    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;

    drawSword(ctx, p, sx, sy);
    if (debugHitbox) drawDebugSwordHitbox(ctx, p, sx, sy);

    const hbw = 36;
    const hbh = 4;
    drawHealthBar(ctx, sx, sy - 36, hbw, hbh, p.health, p.maxHealth);

    const isTop = topKills > 0 && p.kills === topKills;

    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    if (isTop && p.kills > 0) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
    } else if (id === myId) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, sx, sy - 42);
  }

  if (me) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Spd: ${me.speed || window.BASE_STATS.speed}  Atk: ${me.attackDmg || window.BASE_STATS.attackDmg}  SpdAtk: ${me.attackSpeed || window.BASE_STATS.attackSpeed}ms`, 10, 18);
    ctx.fillText(`HP: ${Math.max(0, me.health)}/${me.maxHealth}`, 10, 34);

    if (debugHitbox) {
      ctx.fillStyle = 'rgba(255,200,0,0.8)';
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('HITBOX DEBUG ON [H to toggle]', 10, 52);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`X: ${Math.round(me.x)}  Y: ${Math.round(me.y)}`, VW - 10, VH - 10);
    ctx.textBaseline = 'alphabetic';
  }

  if (serverLevelImg.complete && serverLevelImg.naturalWidth > 0) {
    const ui = window.SCREEN_UI && window.SCREEN_UI.serverLevel;
    if (ui) {
      const sw = serverLevelImg.naturalWidth * ui.scale;
      const sh = serverLevelImg.naturalHeight * ui.scale;
      ctx.save();
      ctx.translate(ui.x, ui.y);
      ctx.drawImage(serverLevelImg, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      const textX = ui.x;
      const textY = ui.y + (ui.ty || 0);
      const text = String(serverLevel);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '32px "Lilita One", "Segoe UI", sans-serif';
      const grad = ctx.createLinearGradient(textX, textY - 14, textX, textY + 14);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#b0b0b0');
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.save();
      ctx.translate(2, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(text, textX, textY);
      ctx.restore();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 10;
      ctx.strokeText(text, textX, textY);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(text, textX - 1, textY - 1);
      ctx.fillStyle = grad;
      ctx.fillText(text, textX, textY);
      ctx.textBaseline = 'alphabetic';
    }
  }

  updateEffects();

  if (me && me.alive && localAnim) {
    const seg = getBladeSegment(me, me.x - cam.x, me.y - cam.y);
    if (seg) bladeHistory = seg;
  } else if (!localAnim) {
    bladeHistory = null;
  }
}
