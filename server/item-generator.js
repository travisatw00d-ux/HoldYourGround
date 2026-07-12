// Server-authoritative item generation: rarity rolls, attribute selection,
// and value rolls for equippable items (rings/necklaces today; the pool is
// tier/category-agnostic so weapons/armor/helmets can drop through the same
// pipeline later without changes here). See Workflow/item-generation-system.md
// for the full design writeup — this file is the "engine", the actual data
// (tiers/rarities/attributes) lives in public/shared/data.js (mirrored to
// public/holdyourground/lib/game-data.js for the client) so both sides agree
// on names/colors/ranges without a network round-trip for every tooltip.
//
// The client NEVER generates or reroll an item — every function here that
// touches Math.random (directly or via the injected `rng`) only ever runs
// server-side. The client only displays whatever instance the server sends.
const crypto = require('crypto');
const { ITEMS, ITEM_TIERS, ITEM_RARITIES, ITEM_ATTRIBUTES } = require('./config');

// Attribute-selection behavior — kept as named config (not hardcoded inline)
// so it can be tuned or overridden per-call without touching the selection
// algorithm itself. Per the spec: exact duplicate attribute types are
// disallowed by default, but an item CAN roll both the flat and scaling
// version of the same underlying stat (they're different attribute IDs).
const ATTRIBUTE_SELECTION_RULES = {
  allowExactDuplicateAttributes: false,
  allowFlatAndScalingPair: true
};

// --- Rarity -----------------------------------------------------------

// Rolls a rarity definition from ITEM_RARITIES using each entry's `weight`
// as a RELATIVE weight — normalizes by the sum of all weights (99.5 with the
// current table) rather than requiring the table to sum to 100. `rng` is
// injectable (defaults to Math.random) so tests can supply a seeded PRNG for
// repeatable runs.
function rollItemRarity(rng = Math.random) {
  const totalWeight = ITEM_RARITIES.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight <= 0) return ITEM_RARITIES[0];
  let roll = rng() * totalWeight;
  for (const rarity of ITEM_RARITIES) {
    if (roll < rarity.weight) return rarity;
    roll -= rarity.weight;
  }
  // Floating-point safety net only (roll can land exactly on the boundary
  // due to rounding) — NOT a synthetic fallback rarity. In practice this
  // returns the same rarity the loop would have anyway.
  return ITEM_RARITIES[ITEM_RARITIES.length - 1];
}

function getRarityDef(rarityId) {
  return ITEM_RARITIES.find(r => r.id === rarityId) || null;
}

// --- Attribute pool / selection ----------------------------------------

// Returns every ITEM_ATTRIBUTES entry eligible for this item at this tier:
// tier must be in the attribute's `tiers` list, and the item's `type` must
// be in the attribute's `categories` list (or `categories` is null, meaning
// "any category" — true for every Tier 1 attribute today).
function getAttributePoolForItem(item, itemTier) {
  const category = item && item.type;
  return Object.values(ITEM_ATTRIBUTES).filter(attr => {
    if (!attr.tiers.includes(itemTier)) return false;
    if (attr.categories && !attr.categories.includes(category)) return false;
    return true;
  });
}

// Picks `count` attribute definitions out of `pool` without repeated
// Math.random calls looping forever. Two independent rules:
//   allowExactDuplicateAttributes - if true, the SAME attribute id can be
//     picked more than once (sampling with replacement).
//   allowFlatAndScalingPair - if false, once an attribute with a given
//     `stat` is picked, no other attribute sharing that `stat` can be picked
//     (i.e. flat and scaling versions become mutually exclusive).
// Safe by construction: if the pool can't satisfy `count` unique picks, the
// selection is capped at however many unique attributes ARE available
// instead of looping forever or throwing.
function selectRandomAttributes(pool, count, rules = {}, rng = Math.random) {
  const allowDup = rules.allowExactDuplicateAttributes ?? ATTRIBUTE_SELECTION_RULES.allowExactDuplicateAttributes;
  const allowPair = rules.allowFlatAndScalingPair ?? ATTRIBUTE_SELECTION_RULES.allowFlatAndScalingPair;
  if (!Array.isArray(pool) || pool.length === 0 || count <= 0) return [];

  const remaining = pool.slice();
  const selected = [];
  const usedStats = new Set();
  const targetCount = allowDup ? count : Math.min(count, pool.length);

  while (selected.length < targetCount && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    const attr = remaining[idx];
    if (!allowPair && usedStats.has(attr.stat)) {
      remaining.splice(idx, 1);
      continue;
    }
    selected.push(attr);
    usedStats.add(attr.stat);
    if (!allowDup) remaining.splice(idx, 1);
  }
  return selected;
}

// Rolls a numeric value for one attribute at one tier, using that
// combination's configured { min, max, precision }. Falls back to the
// attribute's Tier 1 range if the requested tier has no range configured
// (keeps generation from hard-failing while higher tiers are still being
// authored) — this is a safety net, not a substitute for actually adding the
// tier's range when a new tier is introduced.
function rollAttributeValue(attributeDefinition, itemTier, rng = Math.random) {
  const range = (attributeDefinition.ranges && attributeDefinition.ranges[itemTier])
    || (attributeDefinition.ranges && attributeDefinition.ranges[1]);
  if (!range) return 0;
  const raw = range.min + rng() * (range.max - range.min);
  const precision = range.precision ?? 0;
  const factor = Math.pow(10, precision);
  return Math.round(raw * factor) / factor;
}

// --- Instance generation -------------------------------------------------

function generateInstanceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Generates one fully-rolled item instance for `baseItemId` at `itemTier`.
// This is the only place rarity/attributes/values get rolled — the result
// is saved as permanent data (see item-drops.js/room.js), never rerolled on
// load. Returns null if baseItemId isn't a known item.
function generateItemInstance(baseItemId, itemTier, rng = Math.random) {
  const itemDef = ITEMS[baseItemId];
  if (!itemDef) return null;
  const tier = itemTier || itemDef.tier || 1;
  const rarity = rollItemRarity(rng);
  const pool = getAttributePoolForItem(itemDef, tier);
  const chosen = selectRandomAttributes(pool, rarity.attributeCount, ATTRIBUTE_SELECTION_RULES, rng);
  const attributes = chosen.map(attr => ({
    attributeId: attr.id,
    value: rollAttributeValue(attr, tier, rng)
  }));
  return {
    instanceId: generateInstanceId(),
    baseItemId,
    itemTier: tier,
    rarityId: rarity.id,
    attributes
  };
}

// --- Consuming a rolled instance ----------------------------------------

// Bag/equipment slots can hold either a plain base-item-id string (starter
// gear seeded from CLASS_LOADOUTS, which never rolls) or a full rolled
// instance object (anything that came from a drop). Every place that needs
// "what ITEMS entry is this, regardless of representation" goes through
// this instead of assuming one shape.
function resolveBaseItemId(itemOrInstance) {
  if (!itemOrInstance) return null;
  return typeof itemOrInstance === 'string' ? itemOrInstance : itemOrInstance.baseItemId;
}

function isRolledInstance(itemOrInstance) {
  return !!itemOrInstance && typeof itemOrInstance === 'object' && Array.isArray(itemOrInstance.attributes);
}

// Computes the stat bonuses ONE equipped item/instance contributes, as a
// { [stat]: totalBonus } map — combines the base ITEMS[...].stats (used by
// non-rolled starter gear like wooden_sword) with the instance's rolled
// attributes, if any. Scaling attributes multiply by playerState.lvl (the
// progression source is intentionally read from playerState rather than
// hardcoded, so it can be swapped for item level/server level/etc. later
// without changing every call site). Centralized here rather than
// duplicated per-stat so the flat+scaling math only exists in one place —
// see server/player.js's equippedStatTotal(), which calls this once per
// equipped item per stat lookup.
function calculateItemStatBonuses(itemOrInstance, playerState) {
  const bonuses = {};
  if (!itemOrInstance) return bonuses;
  const baseId = resolveBaseItemId(itemOrInstance);
  const itemDef = ITEMS[baseId];
  if (itemDef && itemDef.stats) {
    for (const key in itemDef.stats) {
      bonuses[key] = (bonuses[key] || 0) + itemDef.stats[key];
    }
  }
  if (isRolledInstance(itemOrInstance)) {
    const level = (playerState && playerState.lvl) || 1;
    for (const rolled of itemOrInstance.attributes) {
      const attrDef = ITEM_ATTRIBUTES[rolled.attributeId];
      if (!attrDef) continue;
      const amount = attrDef.mode === 'scaling' ? rolled.value * level : rolled.value;
      bonuses[attrDef.stat] = (bonuses[attrDef.stat] || 0) + amount;
    }
  }
  return bonuses;
}

// Human-readable line for one rolled attribute, e.g. "+5 Attack Damage" or
// "+0.30/lvl Scaling Armor". Scaling attributes get a "Scaling " prefix on
// the label (instead of "Attack Damage") and a "/lvl" suffix on the value
// (instead of appending "per Player Level" after the number) — see the
// matching comment on ui.js's formatItemAttribute(), which mirrors this.
// attackSpeed is special-cased to the same 600/cooldownMs rate-multiplier
// conversion used everywhere else attackSpeed is displayed in this game
// (ui.js's formatStatValue on the client does the identical conversion for
// tooltip rendering — kept in sync by convention, not by sharing code across
// the client/server boundary).
function formatItemAttribute(attribute) {
  const attrDef = ITEM_ATTRIBUTES[attribute.attributeId];
  if (!attrDef) return String(attribute.attributeId) + ': ' + attribute.value;
  const scaling = attrDef.mode === 'scaling';
  const sign = attribute.value > 0 ? '+' : '';
  const label = (scaling ? 'Scaling ' : '') + attrDef.displayName;
  return sign + attribute.value + (scaling ? '/lvl' : '') + ' ' + label;
}

module.exports = {
  ATTRIBUTE_SELECTION_RULES,
  rollItemRarity,
  getRarityDef,
  getAttributePoolForItem,
  selectRandomAttributes,
  rollAttributeValue,
  generateItemInstance,
  resolveBaseItemId,
  isRolledInstance,
  calculateItemStatBonuses,
  formatItemAttribute
};
