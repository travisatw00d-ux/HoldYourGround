// Currency model (2026-07-13, per Travis): a single total-bronze integer is
// the source of truth (p.currencyBronze on the player object, currency_bronze
// on the account row) — silver/gold are purely a DISPLAY denomination
// derived from that total, never stored separately. "100 bronze = 1 silver,
// 100 silver = 1 gold" means 1 gold = 10000 bronze; toDenominations() below
// is the one place that math lives, both server and client should treat
// totalBronze as the only real number and only ever show gold/silver/bronze
// as a derived readout.
//
// This REPLACES the old flat per-kill "gold" auto-credit (exp.js's old
// getGoldForKill(), removed) — the only way to earn currency now is picking
// up dropped coins in the world (see rollGoldDropAmount() below and
// room.js's emitEvents 'zombieKilled' case). Per Travis's explicit choice,
// existing accounts' old flat `gold` column values were reinterpreted as
// bronze on migration (see db.js's one-time currency_bronze backfill) rather
// than lost or converted with a multiplier.
const BRONZE_PER_SILVER = 100;
const SILVER_PER_GOLD = 100;
const BRONZE_PER_GOLD = BRONZE_PER_SILVER * SILVER_PER_GOLD;

// Splits a total-bronze integer into its {gold, silver, bronze} display
// denominations. Pure/stateless — safe to call as often as needed, doesn't
// mutate anything. Negative/non-finite input is defensively clamped to 0
// rather than producing NaN/negative denominations.
function toDenominations(totalBronze) {
  const total = Number.isFinite(totalBronze) && totalBronze > 0 ? Math.floor(totalBronze) : 0;
  const gold = Math.floor(total / BRONZE_PER_GOLD);
  const silver = Math.floor((total % BRONZE_PER_GOLD) / BRONZE_PER_SILVER);
  const bronze = total % BRONZE_PER_SILVER;
  return { gold, silver, bronze };
}

// Gold-coin world-drop mechanic — independent of item-drops.js's 50%
// equipment-instance roll (a zombie can drop neither, either, or both; the
// two rolls don't affect each other). 30% chance per kill, 3-15 bronze on a
// hit. `rng` is injectable (defaults to Math.random) for deterministic
// tests, same convention as item-drops.js's rollForDrop()/rollDropInstance().
const GOLD_DROP_CHANCE = 0.3;
const GOLD_DROP_MIN = 3;
const GOLD_DROP_MAX = 15;

function rollGoldDropAmount(rng = Math.random) {
  if (rng() >= GOLD_DROP_CHANCE) return null;
  return GOLD_DROP_MIN + Math.floor(rng() * (GOLD_DROP_MAX - GOLD_DROP_MIN + 1));
}

module.exports = {
  BRONZE_PER_SILVER, SILVER_PER_GOLD, BRONZE_PER_GOLD,
  toDenominations,
  GOLD_DROP_CHANCE, GOLD_DROP_MIN, GOLD_DROP_MAX,
  rollGoldDropAmount
};
