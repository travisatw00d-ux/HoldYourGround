const { WORLD_W, WORLD_H } = require('./config');

function buildPlayerBlock(list) {
  let size = 0;
  for (let i = 0; i < list.length; i++) size += 1 + list[i]._idBytes.length + 37 + 1 + Buffer.byteLength(list[i].name || '', 'utf8') + 1;
  const buf = Buffer.allocUnsafe(size);
  let o = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const idBytes = p._idBytes;
    buf[o++] = idBytes.length;
    idBytes.copy(buf, o); o += idBytes.length;
    buf.writeFloatLE(p.x, o); o += 4;
    buf.writeFloatLE(p.y, o); o += 4;
    buf.writeInt16LE(Math.round(p.health), o); o += 2;
    buf[o++] = p.alive ? 1 : 0;
    buf[o++] = p.attacking ? 1 : 0;
    buf.writeFloatLE(p.facingAngle || 0, o); o += 4;
    buf.writeFloatLE(p.attackLockedAngle || 0, o); o += 4;
    buf.writeDoubleLE(p.attackStartTime || 0, o); o += 8;
    buf.writeInt16LE(p.kills || 0, o); o += 2;
    buf[o++] = p.lvl || 1;
    buf[o++] = p.comboStep || 0;
    buf.writeInt16LE(Math.round(p.energy), o); o += 2;
    buf.writeInt16LE(p.maxEnergy || 100, o); o += 2;
    // Whether the server still considers this player "waiting on a possible
    // combo continuation" (holds its weapon pose) vs. "done, relax to idle".
    // Broadcasting this lets remote clients start the return-to-idle blend
    // on the exact same tick the attacker's own client does (via
    // comboWindowEnd), instead of waiting ~1s longer for comboStep to reset.
    buf[o++] = p.comboChainWindow ? 1 : 0;
    const nameBytes = Buffer.from(p.name || '', 'utf8');
    buf[o++] = nameBytes.length;
    nameBytes.copy(buf, o); o += nameBytes.length;
    buf[o++] = p.isSpectator ? 1 : 0;
  }
  return buf;
}

function buildStateBuffer(playerBlock, playerCount, serverLevel, viewZombies, emitTime, playerIsSpectator, cameraZoom, viewW, viewH, totalZombies, serverAlive) {
  const zCount = viewZombies.length;
  const buf = Buffer.allocUnsafe(31 + playerBlock.length + zCount * 23);
  let o = 0;
  buf[o++] = 1;
  buf.writeDoubleLE(emitTime, o); o += 8;
  buf.writeUInt16LE(WORLD_W, o); o += 2;
  buf.writeUInt16LE(WORLD_H, o); o += 2;
  buf.writeUInt16LE(serverLevel, o); o += 2;
  buf[o++] = playerCount;
  buf.writeUInt16LE(zCount, o); o += 2;
  buf.writeUInt16LE(totalZombies || 0, o); o += 2;
  buf.writeUInt16LE(serverAlive || 0, o); o += 2;
  buf[o++] = playerIsSpectator ? 1 : 0;
  buf.writeFloatLE(cameraZoom || 1, o); o += 4;
  buf.writeUInt16LE(viewW || 1024, o); o += 2;
  buf.writeUInt16LE(viewH || 576, o); o += 2;
  playerBlock.copy(buf, o); o += playerBlock.length;
  for (let i = 0; i < zCount; i++) {
    const z = viewZombies[i];
    buf.writeInt32LE(z.id, o); o += 4;
    buf.writeFloatLE(z.x, o); o += 4;
    buf.writeFloatLE(z.y, o); o += 4;
    buf.writeInt16LE(Math.round(z.health), o); o += 2;
    buf.writeInt16LE(Math.round(z.maxHealth || z.health), o); o += 2;
    buf.writeFloatLE(z.headingAngle || 0, o); o += 4;
    buf[o++] = z.lvl || 1;
    buf[o++] = z.mobType != null ? z.mobType : 0;
    buf[o++] = z.alive ? 1 : 0;
  }
  return buf;
}

module.exports = { buildPlayerBlock, buildStateBuffer };
