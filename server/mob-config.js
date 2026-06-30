const { MOB_TYPES } = require('../public/shared/data.js');

// mobProgressLevel = serverLevel - mobUnlockLevel + 1
// If progress < 1: mob is locked.
// If progress <= 10: spawn level 1..progress
// If progress > 10:  spawn level (progress-10)..progress
function getMobProgressLevel(serverLevel, unlockLevel) {
  return serverLevel - unlockLevel + 1;
}

function getMobSpawnLevelRange(serverLevel, unlockLevel) {
  const progress = getMobProgressLevel(serverLevel, unlockLevel);
  if (progress < 1) return null;
  const min = progress <= 10 ? 1 : progress - 10;
  const max = progress;
  return { min, max };
}

function getRandomSpawnLevel(serverLevel, unlockLevel) {
  const range = getMobSpawnLevelRange(serverLevel, unlockLevel);
  if (!range) return null;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

// Only mobs whose unlockLevel <= serverLevel
function getUnlockedMobs(serverLevel) {
  return MOB_TYPES.filter(m => serverLevel >= m.unlockLevel);
}

// Pick a random unlocked mob weighted by (unlockLevel could be flat random)
function chooseMobType(serverLevel) {
  const unlocked = getUnlockedMobs(serverLevel);
  if (unlocked.length === 0) return MOB_TYPES[0];
  return unlocked[Math.floor(Math.random() * unlocked.length)];
}

// Get the count range { min, max } for a mob type at a given server level
function getSpawnCountRange(mobType, serverLevel) {
  const levelsSinceUnlock = Math.max(0, serverLevel - mobType.unlockLevel);
  const min = mobType.minCount + levelsSinceUnlock * mobType.countGrowth;
  const max = mobType.maxCount + levelsSinceUnlock * mobType.countGrowth;
  return { min, max };
}

// Get stats for a mob at a given level
function getMobStats(mobType, level) {
  const health = Math.round(mobType.baseHealth + (level - 1) * mobType.healthGrowth);
  const speed = Math.max(0.5, mobType.baseSpeed - (level - 1) * (mobType.speedDecay || 0));
  return { health, speed };
}

module.exports = {
  MOB_TYPES,
  getMobProgressLevel,
  getMobSpawnLevelRange,
  getRandomSpawnLevel,
  getUnlockedMobs,
  chooseMobType,
  getSpawnCountRange,
  getMobStats
};
