// Item drops rolled when a zombie dies (hooked from room.js's emitEvents()
// 'zombieKilled' case, which has the death position). Kept as its own module
// — separate from room.js's per-tick state — so the roll/weight logic can
// grow later (mob-specific tables, more item pools, per-mob drop chance)
// without touching room.js's broadcast/state-ownership code. WHICH base item
// drops is still a flat 50/50 pick between two possible items (below); the
// rarity/attribute rolling for whichever one wins is delegated entirely to
// item-generator.js — see Workflow/item-generation-system.md.
const { ITEM_PICKUP_RANGE, ITEMS } = require('./config');
const itemGenerator = require('./item-generator');

const DROP_CHANCE = 0.5;
const DROP_POOL = ['t1_ring', 't1_necklace'];

// How close (world units, same scale as PLAYER_RADIUS/ATTACK_RANGE in
// config.js) a player has to be to see what a drop is (hover) or pick it up.
// Sourced from shared/data.js (via config.js) rather than a local literal
// because the client needs the exact same number too — input.js gates its
// hover tooltip and click hit-test on it so it doesn't reveal/allow anything
// the server would reject anyway. Enforced server-side in room.js's
// handlePickupItem — a rejected pickup is a silent no-op, same pattern as
// moveItem's class/slot restrictions.
const PICKUP_RANGE = ITEM_PICKUP_RANGE;

// Returns an itemId to drop, or null if the roll missed. Just picks WHICH
// base item drops — the actual rarity/attribute/value rolling happens in
// rollDropInstance() below via item-generator.js.
function rollForDrop(rng = Math.random) {
  if (rng() >= DROP_CHANCE) return null;
  return DROP_POOL[Math.floor(rng() * DROP_POOL.length)];
}

// Combines rollForDrop() with item-generator.js's generateItemInstance() so
// room.js's call site doesn't need to know about tiers/rarities at all — it
// just gets back a fully-rolled instance ready to store, or null if the
// 50% roll missed. The item's own `tier` field (ITEMS[baseItemId].tier)
// decides which attribute-value ranges apply; defaults to 1 if unset.
// `luck` (default 0) is the KILLING PLAYER's current Luck stat — passed
// straight through to generateItemInstance()/rollItemRarity() to shift the
// rarity odds toward higher tiers. It does NOT affect the 50% WHICH-item
// roll above (that's a separate, un-luck-affected chance); it only affects
// what rarity the item comes out as once one does drop.
function rollDropInstance(rng = Math.random, luck = 0) {
  const baseItemId = rollForDrop(rng);
  if (!baseItemId) return null;
  const tier = (ITEMS[baseItemId] && ITEMS[baseItemId].tier) || 1;
  return itemGenerator.generateItemInstance(baseItemId, tier, rng, luck);
}

module.exports = { rollForDrop, rollDropInstance, DROP_CHANCE, DROP_POOL, PICKUP_RANGE };
