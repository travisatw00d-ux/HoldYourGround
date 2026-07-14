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
// NOTE: this governs the "remaining" (non-stacked) slots only as of the
// guaranteed-stacking system below — the stacked attribute is a deliberate,
// required duplicate that bypasses this rule entirely.
const ATTRIBUTE_SELECTION_RULES = {
  allowExactDuplicateAttributes: false,
  allowFlatAndScalingPair: true
};

// --- Guaranteed stacked attributes (Rare and above) ---------------------
//
// Starting at Rare, every generated item MUST contain one intentionally
// repeated attribute — not left to random duplicate chance. `stackSize` is
// how many copies of the chosen attribute the item gets (1 = no stack, a
// plain single roll — Common/Uncommon use this); `namingPrefix` feeds
// generateItemName() ("Greater" for a double stack, "Superior" for a
// triple). Server-only — the client never needs this table since it only
// ever displays the already-resolved generatedName/stackData the server
// sends, never generates or reasons about stacking itself.
const RARITY_STACK_RULES = {
  common: { stackSize: 1, namingPrefix: null },
  uncommon: { stackSize: 1, namingPrefix: null },
  rare: { stackSize: 2, namingPrefix: 'Greater' },
  epic: { stackSize: 2, namingPrefix: 'Greater' },
  legendary: { stackSize: 2, namingPrefix: 'Greater' },
  mythic: { stackSize: 3, namingPrefix: 'Superior' },
  ungodly: { stackSize: 3, namingPrefix: 'Superior' }
};

// Behavior toggles for the stacking system. Kept separate from
// RARITY_STACK_RULES (which is "what size stack per rarity") since these
// are "whether/how the mechanism runs at all" — flipping
// requireStackAtRareAndAbove off, for instance, disables guaranteed
// stacking entirely without touching the per-rarity table.
const ATTRIBUTE_STACK_SETTINGS = {
  requireStackAtRareAndAbove: true,
  allowOnlyOneStackedAttributeGroup: true,
  allowAdditionalDuplicates: false,
  rollEachStackValueIndependently: true
};

// --- Rarity -----------------------------------------------------------

// Scales up the weight of every `luckBoosted` rarity (Rare and above) by up
// to 2x at luck=100 (linear: multiplier = 1 + luck/100, uncapped beyond
// 100), and shrinks the non-boosted rarities (Common/Uncommon) to
// compensate so the TOTAL weight stays exactly the same as the base table —
// this is what makes each boosted rarity's probability share actually
// double at luck=100, rather than just getting diluted under a bigger
// denominator (a naive "multiply every weight by 2" would cancel out
// completely under normalization and change nothing). Clamped so the
// non-boosted rarities' combined weight never goes negative — past that
// point (an extremely high luck value) further luck has no additional
// effect; the boosted rarities' proportions relative to EACH OTHER never
// change, only how much of common/uncommon's share they've absorbed does.
// Returns a NEW array (never mutates ITEM_RARITIES) with every field
// preserved except `weight`; returns ITEM_RARITIES itself, unmodified, for
// luck <= 0 (the common case for players with no Luck rolls equipped).
function getLuckAdjustedRarities(luck = 0) {
  if (!luck || luck <= 0) return ITEM_RARITIES;
  const boosted = ITEM_RARITIES.filter(r => r.luckBoosted);
  const unboosted = ITEM_RARITIES.filter(r => !r.luckBoosted);
  const boostedTotal = boosted.reduce((sum, r) => sum + r.weight, 0);
  const unboostedTotal = unboosted.reduce((sum, r) => sum + r.weight, 0);
  if (boostedTotal <= 0 || unboostedTotal <= 0) return ITEM_RARITIES;

  const luckFactor = luck / 100;
  // Cap so the amount redistributed away from common/uncommon (`extra`)
  // never exceeds what they actually have to give.
  const maxLuckFactor = unboostedTotal / boostedTotal;
  const effectiveLuckFactor = Math.min(luckFactor, maxLuckFactor);
  const extra = effectiveLuckFactor * boostedTotal;
  const unboostedShrinkRatio = (unboostedTotal - extra) / unboostedTotal;

  return ITEM_RARITIES.map(r => r.luckBoosted
    ? { ...r, weight: r.weight * (1 + effectiveLuckFactor) }
    : { ...r, weight: r.weight * unboostedShrinkRatio }
  );
}

// Rolls a rarity definition using each entry's `weight` as a RELATIVE
// weight — normalizes by the sum of all weights (99.5 with the base table)
// rather than requiring the table to sum to 100. `rng` is injectable
// (defaults to Math.random) so tests can supply a seeded PRNG for repeatable
// runs. `luck` (the killing player's current Luck stat, default 0) shifts
// the odds toward higher rarities via getLuckAdjustedRarities() above —
// luck <= 0 rolls against the unmodified ITEM_RARITIES table exactly as
// before this feature existed.
function rollItemRarity(rng = Math.random, luck = 0) {
  const table = getLuckAdjustedRarities(luck);
  const totalWeight = table.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight <= 0) return table[0];
  let roll = rng() * totalWeight;
  for (const rarity of table) {
    if (roll < rarity.weight) return rarity;
    roll -= rarity.weight;
  }
  // Floating-point safety net only (roll can land exactly on the boundary
  // due to rounding) — NOT a synthetic fallback rarity. In practice this
  // returns the same rarity the loop would have anyway.
  return table[table.length - 1];
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

// Picks ONE random attribute definition out of `pool` — used to choose the
// guaranteed stacked attribute. Returns null on an empty/invalid pool
// (caller must handle that as "no stack possible", not throw).
function selectRandomAttribute(pool, rng = Math.random) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
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

// --- Guaranteed stacking: attribute generation ---------------------------
//
// Builds the full `attributes` array for one item: the guaranteed stack
// first (if this rarity requires one), then fills the remaining slots with
// other eligible, non-duplicate attributes. Returns
// { attributes, stackedAttribute, stackSize } — stackedAttribute is null
// when no stack applies (Common/Uncommon, or a degenerate empty pool).
//
// Slot accounting: the stack consumes normal attribute slots, it is never a
// bonus added on top of the rarity's attributeCount. E.g. Rare's 3 total
// slots = 2 for the double stack + 1 remaining; Mythic's 6 = 3 for the
// triple stack + 3 remaining.
function generateItemAttributes({ rarityId, attributePool, itemTier, rng = Math.random }) {
  const rarity = getRarityDef(rarityId);
  if (!rarity) return { attributes: [], stackedAttribute: null, stackSize: 1 };

  const stackRule = ATTRIBUTE_STACK_SETTINGS.requireStackAtRareAndAbove
    ? (RARITY_STACK_RULES[rarityId] || { stackSize: 1, namingPrefix: null })
    : { stackSize: 1, namingPrefix: null };
  const totalAttributeCount = rarity.attributeCount;
  const stackSize = Math.max(1, stackRule.stackSize || 1);

  const generatedAttributes = [];
  let stackedAttribute = null;

  if (stackSize > 1) {
    stackedAttribute = selectRandomAttribute(attributePool, rng);
    if (!stackedAttribute) {
      // Pool too small/empty to even pick a stacked attribute — degrade
      // gracefully to a normal (unstacked) roll rather than throwing or
      // looping. Prefer expanding ITEM_ATTRIBUTES' eligible pool over ever
      // hitting this in practice; Tier 1's 14-attribute pool is never this
      // small today.
      console.warn('[item-generator] rarity "' + rarityId + '" requires a stacked attribute but the eligible pool is empty — generating an unstacked item instead.');
    } else {
      const sharedValue = ATTRIBUTE_STACK_SETTINGS.rollEachStackValueIndependently
        ? null
        : rollAttributeValue(stackedAttribute, itemTier, rng);
      for (let index = 0; index < stackSize; index++) {
        generatedAttributes.push({
          attributeId: stackedAttribute.id,
          value: ATTRIBUTE_STACK_SETTINGS.rollEachStackValueIndependently
            ? rollAttributeValue(stackedAttribute, itemTier, rng)
            : sharedValue,
          stackIndex: index + 1
        });
      }
    }
  }

  const remainingCount = totalAttributeCount - generatedAttributes.length;
  // The stacked attribute is excluded entirely from the remaining pool —
  // this is what structurally guarantees a double stack can never
  // accidentally become a triple, and that no second duplicate group can
  // form alongside the intentional one.
  const remainingPool = stackedAttribute
    ? attributePool.filter(attr => attr.id !== stackedAttribute.id)
    : attributePool;

  if (remainingCount > 0 && remainingPool.length < remainingCount) {
    console.warn('[item-generator] rarity "' + rarityId + '" needs ' + remainingCount +
      ' non-stacked attribute(s) but only ' + remainingPool.length + ' are eligible — capping instead of duplicating.');
  }

  const remainingAttributes = remainingCount > 0
    ? selectRandomAttributes(remainingPool, remainingCount, {
        allowExactDuplicateAttributes: ATTRIBUTE_STACK_SETTINGS.allowAdditionalDuplicates,
        allowFlatAndScalingPair: ATTRIBUTE_SELECTION_RULES.allowFlatAndScalingPair
      }, rng)
    : [];

  for (const attribute of remainingAttributes) {
    generatedAttributes.push({
      attributeId: attribute.id,
      value: rollAttributeValue(attribute, itemTier, rng),
      stackIndex: null
    });
  }

  return {
    attributes: generatedAttributes,
    stackedAttribute,
    stackSize: stackedAttribute ? stackSize : 1
  };
}

// Builds the final display name from the base item name plus the stacked
// attribute's naming text — e.g. "Basic Ring" + rare + attackDamageFlat ->
// "Basic Ring of Greater Attack Damage". Common/Uncommon (no namingPrefix)
// and any item that didn't end up with a stacked attribute (degenerate
// empty-pool case above) fall back to the plain base name unchanged.
function generateItemName({ baseName, rarityId, stackedAttribute }) {
  const stackRule = RARITY_STACK_RULES[rarityId];
  if (!stackedAttribute || !stackRule || !stackRule.namingPrefix) return baseName;
  return baseName + ' of ' + stackRule.namingPrefix + ' ' + stackedAttribute.itemNameText;
}

// --- Instance generation -------------------------------------------------

function generateInstanceId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Generates one fully-rolled item instance for `baseItemId` at `itemTier`.
// This is the only place rarity/attributes/values/names get rolled — the
// result is saved as permanent data (see item-drops.js/room.js), never
// rerolled or renamed on load. Returns null if baseItemId isn't a known item.
// `luck` (default 0) is the KILLING PLAYER's current Luck stat at the
// moment of the drop — passed through to rollItemRarity() to shift the
// rarity odds toward higher tiers; it has no effect on which attributes get
// selected or what values they roll, only on which rarity gets picked.
function generateItemInstance(baseItemId, itemTier, rng = Math.random, luck = 0) {
  const itemDef = ITEMS[baseItemId];
  if (!itemDef) return null;
  const tier = itemTier || itemDef.tier || 1;
  const rarity = rollItemRarity(rng, luck);
  const pool = getAttributePoolForItem(itemDef, tier);

  const { attributes, stackedAttribute, stackSize } = generateItemAttributes({
    rarityId: rarity.id,
    attributePool: pool,
    itemTier: tier,
    rng
  });

  const stackRule = RARITY_STACK_RULES[rarity.id];
  const stackData = (stackedAttribute && stackRule && stackRule.namingPrefix)
    ? {
        attributeId: stackedAttribute.id,
        stackSize,
        nameModifier: stackRule.namingPrefix.toLowerCase()
      }
    : null;

  const baseName = itemDef.name;
  const generatedName = generateItemName({ baseName, rarityId: rarity.id, stackedAttribute });

  return {
    instanceId: generateInstanceId(),
    baseItemId,
    baseName,
    generatedName,
    itemTier: tier,
    rarityId: rarity.id,
    stackData,
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
// without changing every call site). Stacked attributes are just multiple
// entries in `attributes` sharing an attributeId — this sums them
// naturally, no special-casing needed. Centralized here rather than
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
// the client/server boundary). Each stacked copy is a separate entry in
// `attributes`, so this renders each one as its own line automatically —
// no stackIndex-specific handling needed here.
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
  RARITY_STACK_RULES,
  ATTRIBUTE_STACK_SETTINGS,
  getLuckAdjustedRarities,
  rollItemRarity,
  getRarityDef,
  getAttributePoolForItem,
  selectRandomAttribute,
  selectRandomAttributes,
  rollAttributeValue,
  generateItemAttributes,
  generateItemName,
  generateItemInstance,
  resolveBaseItemId,
  isRolledInstance,
  calculateItemStatBonuses,
  formatItemAttribute
};
