const { KNIGHT_ANIMATIONS, ANIMATIONS, ATTACK_SPEED_MULT, TICK_MS } = require('./config');
const sword = require('./sword');

function handleAttack(room, id, facingAngle) {
  const p = room.players[id];
  if (!p || !p.alive || p.isSpectator) return;
  if (p._started && !p.comboChainWindow) {
    if (p.attacking) {
      if (!p._queuedChain) p._queuedChain = { angle: typeof facingAngle === 'number' ? facingAngle : null };
      return;
    }
  }
  const maxCombo = p.attackStyle === 'jab' ? 3 : 4;
  if (p.comboChainWindow && (p.comboStep || 0) < maxCombo) {
    p._chainPendingAngle = typeof facingAngle === 'number' ? facingAngle : null;
    if (p._chainTickTarget <= 0) {
      p._chainTickTarget = room.tickNum + p._chainDelayTicks + (p.comboStep === 3 ? 2 : 0);
    }
    return;
  } else if (p.comboChainWindow) {
    return;
  } else {
    if (p.attackCooldown > 0) return;
    p._started = false;
    p.comboChainWindow = false;
    p.comboStep = 1;
    p._chainTickTarget = 0;
    p._chainPendingAngle = null;
    p._queuedChain = null;
    p._spinRemaining = 0;
    p._lungeRemaining = 0;
    p._combo3MidHit = false;
    p._jabHitCleared = 0;
    p._spinLungeAngle = 0;
  }
  p._lastAttackTime = Date.now();
  _executeAttack(room, id, p.comboStep, typeof facingAngle === 'number' ? facingAngle : null);
}

function _executeAttack(room, id, step, pendingAngle) {
  const p = room.players[id];
  if (!p) return;
  const style = p.attackStyle || 'jab';
  const comboKey = style + '_combo' + (step || 1);
  const anim = p.playerClass === 'knight'
    ? (KNIGHT_ANIMATIONS?.[comboKey] || KNIGHT_ANIMATIONS?.[style + '_combo1'])
    : (ANIMATIONS[p.currentItem]?.[comboKey] || ANIMATIONS[p.currentItem]?.[style + '_combo1']);
  if (!anim) {
    p._started = false;
    p.attackCooldown = 0;
    p.comboStep = 0;
    p._chainTickTarget = 0;
    p._queuedChain = null;
    p._chainPendingAngle = null;
    return;
  }
  const kfData = p.playerClass === 'knight' ? anim.knight_sword : anim;
  if (!kfData || kfData.keyframes.length < 2) {
    p._started = false;
    p.attackCooldown = 0;
    p.comboStep = 0;
    p._chainTickTarget = 0;
    p._queuedChain = null;
    p._chainPendingAngle = null;
    return;
  }
  const kfAnim = p.playerClass === 'knight'
    ? { keyframes: kfData.keyframes, segments: anim.segments }
    : anim;
  if (typeof pendingAngle === 'number' && step < 4) p.facingAngle = pendingAngle;
  p.comboChainWindow = false;
  p.attackCooldown = 6;
  p.attacking = true;
  p.attackFrame = 0;
  p.attackAnim = kfAnim;
  p.attackHitIds = [];
  p.attackLockedAngle = p.facingAngle;
  p.attackStartTime = Date.now();
  p.prevCf = -1;
  p._started = true;
  p._spinRemaining = step >= 4 && p.attackStyle === 'swing' ? 15 : 0;
  p._lungeRemaining = step === 4 ? (p.attackStyle === 'swing' ? 120 : 0) : (step === 3 ? 50 : (step >= 1 ? 30 : 0));
  p._spinLungeAngle = step === 4 && p.attackStyle === 'swing' ? (typeof pendingAngle === 'number' ? pendingAngle : p._lastMouseAngle) : 0;
  p._combo3MidHit = false;
  p._jabHitCleared = 0;
  room.io.to(id).emit('attackStart', { lockedAngle: p.attackLockedAngle, comboStep: step });
}

function handleEquip(room, id, slot) {
  const p = room.players[id];
  if (!p || !p.alive) return;
  if (slot >= 0 && slot < p.inventory.length) {
    p.currentItem = p.inventory[slot];
    const { recalcStats, playerInfoObj } = require('./player');
    recalcStats(p);
    room.io.to('room:' + room.id).emit('playerInfo', playerInfoObj(p));
  }
}

function processCombatTick(room) {
  const ids = Object.keys(room.players);

  for (const id of ids) {
    const p = room.players[id];
    if (!p.alive || p.isSpectator || !p.attacking) continue;
    const events = sword.checkSwordHit(p, room.zombies, room.players, room.grid);
    room.emitEvents(events);
    if (p._queuedChain && p.comboChainWindow) {
      p._chainTickTarget = room.tickNum + p._chainDelayTicks + (p.comboStep === 3 ? 2 : 0);
      p._chainPendingAngle = p._queuedChain.angle;
      p._queuedChain = null;
    }
    if (p._lungeRemaining > 0) {
      let dirAngle = p.comboStep === 4 && p.attackStyle === 'swing' ? p._spinLungeAngle : p.attackLockedAngle;
      if (p.comboStep === 4 && p.attackStyle === 'swing') {
        const diff = p._lastMouseAngle - p._spinLungeAngle;
        const clamped = Math.max(-0.25, Math.min(0.25, diff));
        dirAngle = p._spinLungeAngle + clamped;
      }
      const perTick = p.comboStep === 4 && p.attackStyle === 'swing' ? 8 : 15;
      const amount = Math.min(p._lungeRemaining, perTick);
      p.x += Math.cos(dirAngle) * amount;
      p.y += Math.sin(dirAngle) * amount;
      p._lungeRemaining -= amount;
    }
    p.attackFrame++;
    const totalFrames = sword.animTotal(p.attackAnim);
    const totalTicks = Math.ceil(totalFrames / (2 * ATTACK_SPEED_MULT));
    if (p.attackFrame >= totalTicks) {
      const maxCombo = p.attackStyle === 'jab' ? 3 : 4;
      if (!(p._spinRemaining > 0 && p.attackStyle === 'swing' && p.comboStep === 4)) {
        p.attackLockedAngle = p.facingAngle;
        p.attacking = false;
        p.attackAnim = null;
        p.attackHitIds = [];
        p.prevCf = -1;
        if (p.comboStep >= maxCombo) {
          p.comboChainWindow = false;
          p.attackCooldown = (p.attackStyle === 'swing' ? 16 : 20) + (p.comboStep - 1) * 8;
          p.comboStep = 0;
          p._started = false;
          p._chainTickTarget = 0;
          p._queuedChain = null;
          p._spinRemaining = 0;
          p._lungeRemaining = 0;
          p._combo3MidHit = false;
          p._jabHitCleared = 0;
          p._spinLungeAngle = 0;
        } else {
          p.comboChainWindow = true;
          p.attackCooldown = Math.max(1, Math.round(p.attackSpeed / TICK_MS / 2));
          if (p.comboStep === 3) p.attackCooldown += 8;
          if (p._queuedChain) {
            p._chainTickTarget = room.tickNum + p._chainDelayTicks + (p.comboStep === 3 ? 2 : 0);
            p._chainPendingAngle = p._queuedChain.angle;
            p._queuedChain = null;
          }
        }
      }
    }
    if (p._spinRemaining > 0 && p.comboStep === 4 && p.attackStyle === 'swing') {
      p.attackLockedAngle += (Math.PI * 2) / 15;
      p._spinRemaining--;
      p.attackFrame = 4;
      if (p._spinRemaining === 0) {
        p.attackLockedAngle = p.facingAngle;
        p.attacking = false;
        p.attackAnim = null;
        p.attackHitIds = [];
        p.prevCf = -1;
        p.comboChainWindow = false;
        p.attackCooldown = (p.attackStyle === 'swing' ? 16 : 20) + (p.comboStep - 1) * 8;
        p.comboStep = 0;
        p._started = false;
        p._chainTickTarget = 0;
        p._queuedChain = null;
        room.io.to(id).emit('comboWindowEnd');
      }
    }
  }

  for (const id of ids) {
    const p = room.players[id];
    if (!p || p.attacking || p.attackCooldown <= 0) continue;
    p.attackCooldown--;
    if (p.attackCooldown > 0) continue;
    if (p.comboChainWindow) {
      p.comboChainWindow = false;
      p.attackCooldown = Math.round(1000 / TICK_MS);
      if (p._chainTickTarget <= 0) room.io.to(id).emit('comboWindowEnd');
    } else {
      p.comboStep = 0;
      p._started = false;
      p.attackCooldown = 0;
      p._queuedChain = null;
      p._chainPendingAngle = null;
      p._chainTickTarget = 0;
      p._spinRemaining = 0;
      p._lungeRemaining = 0;
      room.io.to(id).emit('comboWindowEnd');
      room.io.to(id).emit('comboReady');
    }
  }

  for (const id of ids) {
    const p = room.players[id];
    if (!p || p._chainTickTarget <= 0) continue;
    if (room.tickNum < p._chainTickTarget) continue;
    const step = (p.comboStep || 0) + 1;
    p.comboStep = step;
    p._chainTickTarget = 0;
    p.attackCooldown = 0;
    const chainAngle = p._chainPendingAngle;
    p._chainPendingAngle = null;
    p._lastAttackTime = Date.now();
    _executeAttack(room, id, step, chainAngle);
  }
}

module.exports = { handleAttack, _executeAttack, handleEquip, processCombatTick };
