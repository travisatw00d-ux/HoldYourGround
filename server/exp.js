function getExpForKill(zombieLvl) {
  return Math.floor(5 + Math.pow(zombieLvl, 1.5));
}

function getGoldForKill(zombieLvl) {
  return Math.floor(zombieLvl * 1.5);
}

function getExpToNext(level) {
  return level * 100;
}

// Total XP needed to reach level N (sum of level*100 for levels 1..N-1)
function cumulativeExp(level, exp) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += i * 100;
  }
  return total + exp;
}

// Convert cumulative XP back to (level, exp)
function fromCumulativeExp(cumulative) {
  let level = 1;
  let remaining = cumulative;
  while (remaining >= level * 100) {
    remaining -= level * 100;
    level++;
  }
  return { level, exp: remaining };
}

module.exports = { getExpForKill, getGoldForKill, getExpToNext, cumulativeExp, fromCumulativeExp };
