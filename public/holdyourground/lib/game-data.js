export const BASE_TURN_SPEED = 12;

export const BASE_STATS = {
  speed: 13,
  attackDmg: 5,
  attackSpeed: 800,
  health: 100,
  maxHealth: 100,
  defense: 0,
  fortune: 0,
  luck: 0,
  // HP restored per second — 0 baseline, only equipped healthRegenFlat/
  // healthRegenScaling attributes grant any (2026-07-12). Applied every
  // server tick in room.js's gameTick(), capped at maxHealth — see
  // item-generation-system.md.
  healthRegen: 0
};

// Equipment slots every character has. 'weapon' stays hotbar-swappable via
// currentItem/inventory (unchanged); armor/ring/necklace/helmet are new and
// live on player.equipment. See CLASS_LOADOUTS for starter items per class.
export const ITEM_SLOTS = ['weapon', 'armor', 'ring', 'necklace', 'helmet'];

// Starter loadout per playerClass. Only 'knight' exists today (no class
// picker yet) but this keeps the door open for more classes later without
// reworking how defaults are resolved. ring/necklace/helmet have no starter
// item — rings and necklaces only come from zombie drops now (removed the
// basic_ring/basic_necklace filler items 2026-07-12, since they had no
// visual representation and were confusingly occupying the slot, blocking
// the first real ring/necklace pickup from being dragged in).
export const CLASS_LOADOUTS = {
  knight: { weapon: 'wooden_sword', armor: 'basic_armor', ring: null, necklace: null, helmet: null }
};

// Size of the general-purpose item bag (distinct from the weapon hotbar
// currentItem/inventory above). Picked-up items land here first — see
// addToInventory() in server/player.js — before being equipped. Slot order is
// left-to-right, top-to-bottom, matching the InvSlot1..16 layout entries in
// hud-layout.json (positioned via Workflow/hud-position-tool.html).
export const INVENTORY_SIZE = 16;

// How close (world units, same scale as PLAYER_RADIUS/ATTACK_RANGE) a player
// has to be to a world item drop to see what it is (hover tooltip) or pick it
// up. Shared between client and server on purpose — server/item-drops.js is
// the actual authority (a pickup request from too far away is silently
// rejected there), but the client needs the exact same number too so it
// doesn't show a tooltip/allow a click that the server would just reject.
export const ITEM_PICKUP_RANGE = 200;

// Master chest (2026-07-14) — fixed world landmark at the map center
// (state.worldW/2, state.worldH/2; matches server/config.js's MASTER_CHEST_X/
// Y independently rather than over a socket event, since the point never
// moves). RANGE mirrors ITEM_PICKUP_RANGE's role — gates the E-key open/
// close in input.js — just a bigger radius since the chest is a large fixed
// structure, not a small ground item. ICON_H is the chest sprite's drawn
// world-space height in render.js, same "plain world-space size, not zoom-
// inflated" convention as ITEM_DROP_ICON_H above.
export const MASTER_CHEST_RANGE = 150;
// 2026-07-14: was 140, way too big in-world per Travis ("needs to be almost
// a third of that size") — 45 is ~1/3 of the original.
export const MASTER_CHEST_ICON_H = 45;

export const SWORD_IMG_SIZE = 1254;
export const BLADE_W = 6;
export const BLADE_TIP_X = 399;
export const BLADE_TIP_Y = -567;
export const BLADE_HILT_X = -366;
export const BLADE_HILT_Y = 396;

// `type` doubles as the equipment-slot category an item can be dragged onto
// (must equal the ITEM_SLOTS name — 'weapon'/'armor'/'ring'/'necklace'/'helmet').
// `class` restricts weapon/armor/helmet items to a matching playerClass — a
// knight can't equip another class's sword/armor/helmet. Rings/necklaces have
// no `class` field on purpose: they're accessories, any class can wear them.
export const ITEMS = {
  wooden_sword: {
    name: 'Wooden Sword',
    type: 'weapon',
    class: 'knight',
    stats: { attackDmg: 5, attackSpeed: -200 }
  },
  basic_armor: {
    name: 'Basic Armor',
    type: 'armor',
    class: 'knight',
    stats: {}
  },
  // Zombie-drop loot (server/item-drops.js rolls between these on a mob
  // kill). `tier` feeds server/item-generator.js's generateItemInstance() —
  // it picks which attribute-value ranges apply (see ITEM_ATTRIBUTES below)
  // and is stored on the rolled instance. `stats` stays empty on these base
  // defs on purpose: a drop's actual bonuses live entirely in its rolled
  // `attributes` array (server-authoritative, generated once at drop time),
  // not on the shared item definition — two t1_ring drops can have
  // completely different rolls. See item-generation-system.md.
  t1_ring: {
    name: 'T1 Ring',
    type: 'ring',
    tier: 1,
    stats: {}
  },
  t1_necklace: {
    name: 'T1 Necklace',
    type: 'necklace',
    tier: 1,
    stats: {}
  }
};

// Item progression tiers. Distinct from rarity (ITEM_RARITIES below) — tier
// is "how strong a version of this item is" (feeds attribute value ranges),
// rarity is "how many attributes it rolled and how rare that roll is". A
// Tier 1 sword can drop as any rarity from Common to Ungodly; it's still a
// Tier 1 sword either way. Only Tier 1 exists today — add more here (and a
// matching `ranges[tier]` entry on every ITEM_ATTRIBUTES def) to extend.
export const ITEM_TIERS = {
  1: { id: 1, name: 'Tier 1' }
};

// Rarity roll table for generated item instances — see
// server/item-generator.js's rollItemRarity(). `weight` is a RELATIVE
// weight, not a percentage: the roll normalizes by the sum of all weights
// (99.5 here), so the table doesn't need to add up to 100 and there's no
// synthetic fallback rarity soaking up the leftover 0.5. `attributeCount` is
// how many rolled attributes an item of that rarity gets. `color` drives the
// rarity-colored item name in tooltips (ui.js). `luckBoosted` marks which
// rarities the killer's Luck stat scales up — see
// server/item-generator.js's getLuckAdjustedRarities(). Common/Uncommon are
// the ones that shrink to compensate, not boosted themselves.
export const ITEM_RARITIES = [
  { id: 'common', name: 'Common', color: '#ffffff', weight: 50, attributeCount: 1, luckBoosted: false },
  { id: 'uncommon', name: 'Uncommon', color: '#22c55e', weight: 30, attributeCount: 2, luckBoosted: false },
  { id: 'rare', name: 'Rare', color: '#3b82f6', weight: 10, attributeCount: 3, luckBoosted: true },
  { id: 'epic', name: 'Epic', color: '#a855f7', weight: 5, attributeCount: 4, luckBoosted: true },
  { id: 'legendary', name: 'Legendary', color: '#f97316', weight: 3, attributeCount: 5, luckBoosted: true },
  { id: 'mythic', name: 'Mythic', color: '#ef4444', weight: 1, attributeCount: 6, luckBoosted: true },
  { id: 'ungodly', name: 'Ungodly', color: '#ffd700', weight: 0.5, attributeCount: 7, luckBoosted: true }
];

// Full pool of rollable item attributes (Tier 1). Every flat stat has a
// paired scaling version — same `stat`, `mode: 'scaling'` instead of
// `'flat'` — treated as a fully separate attribute type (an item CAN roll
// both the flat and scaling version of the same stat; see
// ATTRIBUTE_SELECTION_RULES in item-generator.js). Fields:
//   stat        - player stat this feeds; equippedStatTotal() in
//                 server/player.js sums these across all equipped items
//   mode        - 'flat' (fixed bonus) or 'scaling' (multiplied by player
//                 level — see calculateItemStatBonuses() in item-generator.js)
//   tiers       - item tiers this attribute is eligible to roll on
//   categories  - ITEM_SLOTS-style types (`'weapon'`/`'ring'`/etc.) this can
//                 roll on, or null for "any category" (every Tier 1
//                 attribute is unrestricted today)
//   ranges      - { [tier]: { min, max, precision } } — rolled value's range
//                 and decimal rounding for that tier
//   displayName - shown in tooltips; scaling attributes get a dynamic
//                 "Scaling " prefix and "/lvl" suffix at display time (see
//                 formatItemAttribute()) rather than baking it into this field
//   itemNameText - used ONLY for generated item names, e.g. "Basic Ring of
//                 Greater Attack Damage" (see item-generation-system.md's
//                 stacking section) — deliberately separate from displayName
// attackSpeed attributes use the same raw-ms-delta convention as
// ITEMS[x].stats.attackSpeed elsewhere in this codebase (negative = faster);
// the tooltip converts it to the familiar 600/cooldownMs rate multiplier,
// same as every other attackSpeed display in the game.
// First-pass placeholder ranges — expect to rebalance by hand-editing this
// object (and its mirror in public/shared/data.js) after playtesting.
export const ITEM_ATTRIBUTES = {
  attackDamageFlat: { id: 'attackDamageFlat', displayName: 'Attack Damage', itemNameText: 'Attack Damage', stat: 'attackDmg', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 4, precision: 0 } } },
  attackDamageScaling: { id: 'attackDamageScaling', displayName: 'Attack Damage', itemNameText: 'Scaling Attack Damage', stat: 'attackDmg', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.1, max: 0.5, precision: 2 } } },
  attackSpeedFlat: { id: 'attackSpeedFlat', displayName: 'Attack Speed', itemNameText: 'Attack Speed', stat: 'attackSpeed', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: -60, max: -10, precision: 0 } } },
  attackSpeedScaling: { id: 'attackSpeedScaling', displayName: 'Attack Speed', itemNameText: 'Scaling Attack Speed', stat: 'attackSpeed', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: -3, max: -0.5, precision: 2 } } },
  armorFlat: { id: 'armorFlat', displayName: 'Armor', itemNameText: 'Armor', stat: 'defense', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 4, precision: 0 } } },
  armorScaling: { id: 'armorScaling', displayName: 'Armor', itemNameText: 'Scaling Armor', stat: 'defense', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.1, max: 0.4, precision: 2 } } },
  turnRateFlat: { id: 'turnRateFlat', displayName: 'Turn Rate', itemNameText: 'Turn Rate', stat: 'turnSpeed', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 3, precision: 0 } } },
  turnRateScaling: { id: 'turnRateScaling', displayName: 'Turn Rate', itemNameText: 'Scaling Turn Rate', stat: 'turnSpeed', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.05, max: 0.2, precision: 2 } } },
  maxEnergyFlat: { id: 'maxEnergyFlat', displayName: 'Max Energy', itemNameText: 'Max Energy', stat: 'maxEnergy', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 5, max: 20, precision: 0 } } },
  maxEnergyScaling: { id: 'maxEnergyScaling', displayName: 'Max Energy', itemNameText: 'Scaling Max Energy', stat: 'maxEnergy', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.5, max: 2, precision: 2 } } },
  maxHealthFlat: { id: 'maxHealthFlat', displayName: 'Max Health', itemNameText: 'Max Health', stat: 'maxHealth', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 5, max: 20, precision: 0 } } },
  maxHealthScaling: { id: 'maxHealthScaling', displayName: 'Max Health', itemNameText: 'Scaling Max Health', stat: 'maxHealth', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.5, max: 2.5, precision: 2 } } },
  fortuneFlat: { id: 'fortuneFlat', displayName: 'Fortune', itemNameText: 'Fortune', stat: 'fortune', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 3, precision: 0 } } },
  fortuneScaling: { id: 'fortuneScaling', displayName: 'Fortune', itemNameText: 'Scaling Fortune', stat: 'fortune', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.05, max: 0.25, precision: 2 } } },
  // Fortune and Luck are deliberately separate stats (2026-07-12, per
  // Travis): Fortune is reserved for a future gold-drop % multiplier (not
  // built yet — there's no gold-drop mechanic to multiply until that
  // feature exists, see item-generation-system.md), Luck raises the odds of
  // rolling a higher item rarity (built now — see getLuckAdjustedRarities()
  // in server/item-generator.js).
  luckFlat: { id: 'luckFlat', displayName: 'Luck', itemNameText: 'Luck', stat: 'luck', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 3, precision: 0 } } },
  luckScaling: { id: 'luckScaling', displayName: 'Luck', itemNameText: 'Scaling Luck', stat: 'luck', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.05, max: 0.25, precision: 2 } } },
  // Health Regen (2026-07-12) — HP restored per second, applied every
  // server tick in room.js's gameTick() (always on, not gated to out-of-
  // combat — simplest-first, see item-generation-system.md). Ranges match
  // Fortune/Luck's family (both minor "utility" stats with a 0 baseline).
  healthRegenFlat: { id: 'healthRegenFlat', displayName: 'Health Regen', itemNameText: 'Health Regen', stat: 'healthRegen', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 3, precision: 0 } } },
  healthRegenScaling: { id: 'healthRegenScaling', displayName: 'Health Regen', itemNameText: 'Scaling Health Regen', stat: 'healthRegen', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.05, max: 0.25, precision: 2 } } },
  // Speed (2026-07-12) — movement speed, NOT attackSpeed. `speed` already
  // exists as a real, fully-applied stat (BASE_SPEED, physics movement,
  // spendable stat points), so this needed no new server wiring at all —
  // equippedStatTotal('speed') was already summed into p.speed in
  // recalcStats(); adding these two pool entries is the entire feature.
  // Ranges mirror turnRateFlat/Scaling (same "movement" stat family,
  // both effectively capped downstream — turnSpeed has no hard cap but
  // speed's total is clamped to each build's speedCap in recalcStats).
  speedFlat: { id: 'speedFlat', displayName: 'Speed', itemNameText: 'Speed', stat: 'speed', mode: 'flat', tiers: [1], categories: null, ranges: { 1: { min: 1, max: 3, precision: 0 } } },
  speedScaling: { id: 'speedScaling', displayName: 'Speed', itemNameText: 'Scaling Speed', stat: 'speed', mode: 'scaling', tiers: [1], categories: null, ranges: { 1: { min: 0.05, max: 0.2, precision: 2 } } }
};

// Drawn height (world/canvas units) of the generic loot.png ground icon —
// width is derived from this at draw time using the sprite's own aspect
// ratio (see render.js). input.js's hitTestItemDrop() uses the exact same
// value to build a hit rectangle that matches the visible icon precisely
// (no padding), since drops can land close together and need tight,
// unambiguous click/hover targets.
export const ITEM_DROP_ICON_H = 28;

// Minimum ON-SCREEN pixel size of the loot icon's HOVER/CLICK HITBOX (input.js's
// hitTestItemDrop()) as the camera zooms out — NOT the drawn icon's size.
// Originally (2026-07-13) this floored both the drawn icon AND the hitbox
// together, since at the game's minimum zoom (~0.32, a 3200x2400 world in a
// 1024x576 viewport) a pure ITEM_DROP_ICON_H * zoom hitbox is under 9px
// tall — nearly impossible to hover precisely, worse the further you zoom
// out. But flooring the DRAWN size too made the bag visibly grow larger
// than its real size when zoomed out, which Travis didn't want ("I want
// the bags to stay the same size all the time as they initially were").
// Same day: render.js reverted to drawing at a plain, never-inflated
// ITEM_DROP_ICON_H, while input.js kept `Math.max(ITEM_DROP_ICON_H,
// ITEM_DROP_ICON_MIN_SCREEN_PX / zoom)` for the hit-test rectangle only —
// the invisible hoverable area stays generous at low zoom, the visible
// icon does not grow. These two are now DELIBERATELY DECOUPLED — do not
// "fix" them back into using the same formula.
export const ITEM_DROP_ICON_MIN_SCREEN_PX = 26;

// Currency (2026-07-13) — total-bronze integer is the only real number
// (server's p.currencyBronze / account's currency_bronze column); gold/
// silver are purely a DISPLAY split derived from it here. Mirrors
// server/currency.js's toDenominations() — the ratio only needs to be
// defined once client-side since the server never actually needs to show
// denominations, just add to and persist the raw total. Keep the two in
// sync by convention if this ever changes (same convention as every other
// client/server constant pair in this file).
export const BRONZE_PER_SILVER = 100;
export const SILVER_PER_GOLD = 100;
const BRONZE_PER_GOLD = BRONZE_PER_SILVER * SILVER_PER_GOLD;

export function toDenominations(totalBronze) {
  const total = Number.isFinite(totalBronze) && totalBronze > 0 ? Math.floor(totalBronze) : 0;
  const gold = Math.floor(total / BRONZE_PER_GOLD);
  const silver = Math.floor((total % BRONZE_PER_GOLD) / BRONZE_PER_SILVER);
  const bronze = total % BRONZE_PER_SILVER;
  return { gold, silver, bronze };
}

// Short "Ng Ns Nb" readout, omitting denominations that are zero (except
// bronze, which always shows so a totally empty wallet still reads "0b"
// instead of a blank string). Used everywhere currency is displayed —
// welcome panel, Char Stats, the in-inventory CurrencyDisplay readout.
export function formatCurrency(totalBronze) {
  const { gold, silver, bronze } = toDenominations(totalBronze);
  const parts = [];
  if (gold > 0) parts.push(gold + 'g');
  if (silver > 0 || gold > 0) parts.push(silver + 's');
  parts.push(bronze + 'b');
  return parts.join(' ');
}

// Same as formatCurrency() but wraps each denomination in a colored span
// (2026-07-13, per Travis: "a nice vibrant bronze color... a nice shiny
// silver... a nice gold" — every place currency is shown, not just one) —
// `.currency-gold`/`.currency-silver`/`.currency-bronze` in style.css own
// the actual colors. Every currency display site should use THIS, not the
// plain-text formatCurrency() above, and must set it via `.innerHTML`
// (never `.textContent`, which would print the raw `<span>` tags as text
// instead of rendering them).
export function formatCurrencyHtml(totalBronze) {
  const { gold, silver, bronze } = toDenominations(totalBronze);
  const parts = [];
  if (gold > 0) parts.push('<span class="currency-gold">' + gold + 'g</span>');
  if (silver > 0 || gold > 0) parts.push('<span class="currency-silver">' + silver + 's</span>');
  parts.push('<span class="currency-bronze">' + bronze + 'b</span>');
  return parts.join(' ');
}

// Drawn height (world/canvas units) of the gold-coin ground icon — its own
// distinct, much smaller size than the generic loot.png bag (ITEM_DROP_ICON_H
// above), since Travis wants the coin instantly recognizable on the ground
// rather than hidden behind the generic "mystery bag" treatment equipment
// drops get. Roughly half the on-screen size of a knight's hand — starting
// point only, trivially tunable (a single constant) once Travis sees it
// in-game and wants it bigger/smaller.
export const GOLD_COIN_ICON_H = 12;

export const ITEM_VISUALS = {
  wooden_sword: {
    offsetX: 23,
    offsetY: 24,
    scale: 0.047,
    rotation: 0.76
  }
};

// Flat inventory/equipment-slot icons — client-only, no server mirror needed
// since this is purely a rendering lookup (unlike ITEM_VISUALS/ANIMATIONS,
// which govern in-hand combat animation and use a totally different sheet).
// `sheet` names a key on `state` (see assets.js) holding the loaded Image +
// its frames map. Add an entry here whenever a new item gets real art.
export const ITEM_ICONS = {
  wooden_sword: { sheet: 'knightWeapons', frame: 'T1Sword.png' },
  t1_ring: { sheet: 'ring', frame: 'T1Ring.png' },
  t1_necklace: { sheet: 'necklace', frame: 'T1Necklace.png' }
};

export const ANIMATIONS = {
  wooden_sword: {
    jab_combo1: {
      keyframes: [
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        { offsetX: 51, offsetY: 19, scale: 0.047, rotation: 0.69 },
        { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
        { offsetX: 59, offsetY: 15, scale: 0.047, rotation: 0.67 },
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
      ],
      segments: [19, 19, 17, 17]
    },
    jab_combo3: {
      segments: [10,10,10,10,10,10],
      keyframes: [
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
      ],
    },
    swing_combo1: {
      keyframes: [
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
      ],
      segments: [10]
    }
  }
};

export const ZOMBIE_ANIMATIONS = {
  attack: {
    segments: [12, 12, 12, 12, 12],
    left_hand: {
      keyframes: [
        { offsetX: 16, offsetY: -20, scale: 0.23, rotation: -1.55 },
        { offsetX: 34, offsetY: -22, scale: 0.23, rotation: -1.55 },
        { offsetX: 41, offsetY: -14, scale: 0.23, rotation: -1.55 },
        { offsetX: 17, offsetY: -23, scale: 0.23, rotation: -1.55 },
        { offsetX: 17, offsetY: -23, scale: 0.23, rotation: -1.55 },
        { offsetX: 17, offsetY: -23, scale: 0.23, rotation: -1.55 },
      ]
    },
    right_hand: {
      keyframes: [
        { offsetX: 16, offsetY: 20, scale: 0.23, rotation: -1.55 },
        { offsetX: 16, offsetY: 20, scale: 0.23, rotation: -1.55 },
        { offsetX: 16, offsetY: 20, scale: 0.23, rotation: -1.55 },
        { offsetX: 37, offsetY: 21, scale: 0.23, rotation: -1.55 },
        { offsetX: 43, offsetY: 12, scale: 0.23, rotation: -1.55 },
        { offsetX: 15, offsetY: 24, scale: 0.23, rotation: -1.55 },
      ]
    }
  }
};

export const ZOMBIE_VISUALS = {
  left_hand: {
    offsetX: 16,
    offsetY: -20,
    scale: 0.230,
    rotation: -1.55
  },
  right_hand: {
    offsetX: 16,
    offsetY: 20,
    scale: 0.230,
    rotation: -1.55
  }
};

// Goblin: single left hand gripping a sword (no right_hand sprite exists
// for goblin — see GoblinLeftHand.png/GoblinSword.png in spritesheet.json).
// Idle pose = keyframe[0] of the matching GOBLIN_ANIMATIONS.attack track.
export const GOBLIN_ANIMATIONS = {
  attack: {
    segments: [12, 12, 12, 12, 12],
    left_hand: {
      keyframes: [
        { offsetX: 18, offsetY: -18, scale: 0.212, rotation: -1.30 },
        { offsetX: 30, offsetY: -20, scale: 0.212, rotation: -0.90 },
        { offsetX: 40, offsetY: -18, scale: 0.212, rotation: -0.60 },
        { offsetX: 22, offsetY: -18, scale: 0.212, rotation: -1.10 },
        { offsetX: 18, offsetY: -18, scale: 0.212, rotation: -1.30 },
        { offsetX: 18, offsetY: -18, scale: 0.212, rotation: -1.30 },
      ]
    },
    sword: {
      keyframes: [
        { offsetX: 25, offsetY: 24, scale: 0.250, rotation: 1.68 },
        { offsetX: 45, offsetY: 22, scale: 0.250, rotation: 1.58 },
        { offsetX: 63, offsetY: 24, scale: 0.250, rotation: 1.48 },
        { offsetX: 33, offsetY: 24, scale: 0.250, rotation: 1.63 },
        { offsetX: 25, offsetY: 24, scale: 0.250, rotation: 1.68 },
        { offsetX: 25, offsetY: 24, scale: 0.250, rotation: 1.68 },
      ]
    }
  }
};

export const GOBLIN_VISUALS = {
  left_hand: { offsetX: 18, offsetY: -18, scale: 0.212, rotation: -1.30 },
  sword: { offsetX: 25, offsetY: 24, scale: 0.250, rotation: 1.68 }
};

export const SCREEN_UI = {
  serverLevel: { x: 53, y: 56, scale: 0.4, ty: -6 }
};

export const MOB_TYPES = [
  { id: 'zombie',  name: 'Zombie',  emoji: '🧟', miniFrame: 'zombieminibig.png', unlockLevel: 1,  minCount: 90,  maxCount: 110, countGrowth: 2, baseHealth: 5, healthGrowth: 1.5, baseSpeed: 1.5, speedDecay: 0 },
  { id: 'troll',   name: 'Troll',   emoji: '👹', unlockLevel: 5,  minCount: 5,   maxCount: 15,  countGrowth: 1, baseHealth: 15, healthGrowth: 2,   baseSpeed: 1.3, speedDecay: 0 },
  // attackRange: goblin swings a real blade, so its stab reaches further
  // than the bare-handed zombie/troll contact range (see ZOMBIE_ATTACK_RANGE
  // in server/config.js, used as the fallback for mobs without this field).
  // damage: 2x the flat ZOMBIE_DAMAGE (10) — per Travis, doubled at goblin's
  // level-1 baseline (see zombie-ai.js's processZombieAttacks fallback).
  { id: 'goblin',  name: 'Goblin',  emoji: '👺', unlockLevel: 10, minCount: 3,   maxCount: 10,  countGrowth: 1, baseHealth: 8,  healthGrowth: 1.8, baseSpeed: 1.6, speedDecay: 0.01, attackRange: 40, damage: 20 },
];

export const KNIGHT_BLADE_TIP_X = -5;
export const KNIGHT_BLADE_TIP_Y = -74;
export const KNIGHT_BLADE_HILT_X = 4;
export const KNIGHT_BLADE_HILT_Y = 16;

export const KNIGHT_VISUALS = {
  jab: {
    knight_sword: { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
    knight_hand:  { offsetX: 28, offsetY: -23, scale: 0.383, rotation: 0.00 },
    // Unarmed idle pose — replaces knight_sword when p.currentItem is empty
    // (see drawKnightRightHand() in render-entity.js). Tune via the "Knight
    // Items" > "Right Hand" mode in public/position-tool.html.
    knight_right_hand: { offsetX: 28, offsetY: 23, scale: 0.383, rotation: 3.14 }
  },
  swing: {
    knight_sword: { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
    knight_hand:  { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
    // Unused — never a real fist pose, just an old copy-paste of knight_sword's
    // swing offsets. Unarmed always renders both hands using .jab's
    // knight_right_hand/knight_hand values regardless of the jab/swing toggle
    // (forced in anims.js — search "forceJab"), so this entry is never read.
    // Left in place instead of deleted so KNIGHT_VISUALS.swing keeps a full
    // shape; don't hand-tune this expecting it to do anything.
    knight_right_hand: { offsetX: 25, offsetY: -43, scale: 0.383, rotation: -0.42 }
  }
};

export const KNIGHT_ANIMATIONS = {
  jab_combo1: {
    segments: [30, 30],
    knight_sword: {
      keyframes: [
        { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
        { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
        { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
        { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
        { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
      ]
    }
  },
  jab_combo3: {
    segments: [10,10,10,10,10,10],
    knight_sword: {
      keyframes: [
        { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
        { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
        { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
        { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
        { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
        { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
        { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
        { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
        { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
        { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
        { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
        { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
        { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
      ]
    }
  },
  swing_combo1: {
    segments: [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    knight_sword: {
      keyframes: [
        { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
        { offsetX: 28, offsetY: -42, scale: 0.43, rotation: -0.33 },
        { offsetX: 36, offsetY: -37, scale: 0.43, rotation: -0.09 },
        { offsetX: 46, offsetY: -28, scale: 0.43, rotation: 0.27 },
        { offsetX: 54, offsetY: -13, scale: 0.43, rotation: 0.71 },
        { offsetX: 58, offsetY: 6, scale: 0.43, rotation: 1.18 },
        { offsetX: 56, offsetY: 26, scale: 0.43, rotation: 1.65 },
        { offsetX: 47, offsetY: 43, scale: 0.43, rotation: 2.09 },
        { offsetX: 35, offsetY: 55, scale: 0.43, rotation: 2.45 },
        { offsetX: 26, offsetY: 62, scale: 0.43, rotation: 2.69 },
        { offsetX: 22, offsetY: 64, scale: 0.43, rotation: 2.78 },
        { offsetX: 26, offsetY: 62, scale: 0.43, rotation: 2.69 },
        { offsetX: 35, offsetY: 55, scale: 0.43, rotation: 2.45 },
        { offsetX: 47, offsetY: 43, scale: 0.43, rotation: 2.09 },
        { offsetX: 56, offsetY: 26, scale: 0.43, rotation: 1.65 },
        { offsetX: 58, offsetY: 6, scale: 0.43, rotation: 1.18 },
        { offsetX: 54, offsetY: -13, scale: 0.43, rotation: 0.71 },
        { offsetX: 46, offsetY: -28, scale: 0.43, rotation: 0.27 },
        { offsetX: 36, offsetY: -37, scale: 0.43, rotation: -0.09 },
        { offsetX: 28, offsetY: -42, scale: 0.43, rotation: -0.33 },
        { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
        { offsetX: 4, offsetY: -33, scale: 0.383, rotation: -0.08 },
        { offsetX: 6, offsetY: -33, scale: 0.383, rotation: -0.07 },
        { offsetX: 9, offsetY: -32, scale: 0.383, rotation: -0.04 },
        { offsetX: 13, offsetY: -32, scale: 0.383, rotation: -0.01 },
        { offsetX: 16, offsetY: -30, scale: 0.383, rotation: 0.02 },
        { offsetX: 20, offsetY: -28, scale: 0.383, rotation: 0.05 },
        { offsetX: 23, offsetY: -26, scale: 0.383, rotation: 0.08 },
        { offsetX: 26, offsetY: -24, scale: 0.383, rotation: 0.11 },
        { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
        { offsetX: 28, offsetY: -22, scale: 0.383, rotation: 0.13 },
        { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
        { offsetX: 26, offsetY: -24, scale: 0.383, rotation: 0.11 },
        { offsetX: 23, offsetY: -26, scale: 0.383, rotation: 0.08 },
        { offsetX: 20, offsetY: -28, scale: 0.383, rotation: 0.05 },
        { offsetX: 16, offsetY: -30, scale: 0.383, rotation: 0.02 },
        { offsetX: 13, offsetY: -32, scale: 0.383, rotation: -0.01 },
        { offsetX: 9, offsetY: -32, scale: 0.383, rotation: -0.04 },
        { offsetX: 6, offsetY: -33, scale: 0.383, rotation: -0.07 },
        { offsetX: 4, offsetY: -33, scale: 0.383, rotation: -0.08 },
        { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
      ]
    }
  },
  swing_combo2: {
    segments: [3,3,3,3,3,3,3,3,3,3],
    knight_sword: {
      keyframes: [
        { offsetX: 22, offsetY: 64, scale: 0.43, rotation: 2.78 },
        { offsetX: 27, offsetY: 62, scale: 0.43, rotation: 2.69 },
        { offsetX: 39, offsetY: 57, scale: 0.43, rotation: 2.43 },
        { offsetX: 54, offsetY: 44, scale: 0.43, rotation: 2.05 },
        { offsetX: 68, offsetY: 23, scale: 0.43, rotation: 1.59 },
        { offsetX: 73, offsetY: -4, scale: 0.43, rotation: 1.09 },
        { offsetX: 67, offsetY: -32, scale: 0.43, rotation: 0.6 },
        { offsetX: 53, offsetY: -54, scale: 0.43, rotation: 0.14 },
        { offsetX: 35, offsetY: -68, scale: 0.43, rotation: -0.24 },
        { offsetX: 21, offsetY: -74, scale: 0.43, rotation: -0.5 },
        { offsetX: 16, offsetY: -76, scale: 0.43, rotation: -0.59 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 28, offsetY: -22, scale: 0.383, rotation: 0.13 },
        { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
        { offsetX: 25, offsetY: -25, scale: 0.383, rotation: 0.09 },
        { offsetX: 22, offsetY: -28, scale: 0.383, rotation: 0.04 },
        { offsetX: 18, offsetY: -30, scale: 0.383, rotation: -0.02 },
        { offsetX: 14, offsetY: -33, scale: 0.383, rotation: -0.08 },
        { offsetX: 9, offsetY: -34, scale: 0.383, rotation: -0.15 },
        { offsetX: 4, offsetY: -35, scale: 0.383, rotation: -0.21 },
        { offsetX: 0, offsetY: -35, scale: 0.383, rotation: -0.26 },
        { offsetX: -3, offsetY: -35, scale: 0.383, rotation: -0.29 },
        { offsetX: -4, offsetY: -35, scale: 0.383, rotation: -0.3 },
      ]
    }
  },
  swing_combo3: {
    segments: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    knight_sword: {
      keyframes: [
        { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
        { offsetX: 28, offsetY: -42, scale: 0.43, rotation: -0.33 },
        { offsetX: 36, offsetY: -37, scale: 0.43, rotation: -0.09 },
        { offsetX: 46, offsetY: -28, scale: 0.43, rotation: 0.27 },
        { offsetX: 54, offsetY: -13, scale: 0.43, rotation: 0.71 },
        { offsetX: 58, offsetY: 6, scale: 0.43, rotation: 1.18 },
        { offsetX: 56, offsetY: 26, scale: 0.43, rotation: 1.65 },
        { offsetX: 47, offsetY: 43, scale: 0.43, rotation: 2.09 },
        { offsetX: 35, offsetY: 55, scale: 0.43, rotation: 2.45 },
        { offsetX: 26, offsetY: 62, scale: 0.43, rotation: 2.69 },
        { offsetX: 22, offsetY: 64, scale: 0.43, rotation: 2.78 },
        { offsetX: 27, offsetY: 62, scale: 0.43, rotation: 2.69 },
        { offsetX: 39, offsetY: 57, scale: 0.43, rotation: 2.43 },
        { offsetX: 54, offsetY: 44, scale: 0.43, rotation: 2.05 },
        { offsetX: 68, offsetY: 23, scale: 0.43, rotation: 1.59 },
        { offsetX: 73, offsetY: -4, scale: 0.43, rotation: 1.09 },
        { offsetX: 67, offsetY: -32, scale: 0.43, rotation: 0.60 },
        { offsetX: 53, offsetY: -54, scale: 0.43, rotation: 0.14 },
        { offsetX: 35, offsetY: -68, scale: 0.43, rotation: -0.24 },
        { offsetX: 21, offsetY: -74, scale: 0.43, rotation: -0.50 },
        { offsetX: 16, offsetY: -76, scale: 0.43, rotation: -0.59 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
        { offsetX: 4, offsetY: -33, scale: 0.383, rotation: -0.08 },
        { offsetX: 6, offsetY: -33, scale: 0.383, rotation: -0.07 },
        { offsetX: 9, offsetY: -32, scale: 0.383, rotation: -0.04 },
        { offsetX: 13, offsetY: -32, scale: 0.383, rotation: -0.01 },
        { offsetX: 16, offsetY: -30, scale: 0.383, rotation: 0.02 },
        { offsetX: 20, offsetY: -28, scale: 0.383, rotation: 0.05 },
        { offsetX: 23, offsetY: -26, scale: 0.383, rotation: 0.08 },
        { offsetX: 26, offsetY: -24, scale: 0.383, rotation: 0.11 },
        { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
        { offsetX: 28, offsetY: -22, scale: 0.383, rotation: 0.13 },
        { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
        { offsetX: 25, offsetY: -25, scale: 0.383, rotation: 0.09 },
        { offsetX: 22, offsetY: -28, scale: 0.383, rotation: 0.04 },
        { offsetX: 18, offsetY: -30, scale: 0.383, rotation: -0.02 },
        { offsetX: 14, offsetY: -33, scale: 0.383, rotation: -0.08 },
        { offsetX: 9, offsetY: -34, scale: 0.383, rotation: -0.15 },
        { offsetX: 4, offsetY: -35, scale: 0.383, rotation: -0.21 },
        { offsetX: 0, offsetY: -35, scale: 0.383, rotation: -0.26 },
        { offsetX: -3, offsetY: -35, scale: 0.383, rotation: -0.29 },
        { offsetX: -4, offsetY: -35, scale: 0.383, rotation: -0.30 },
      ]
    }
  },

  // Unarmed 2-hit punch combo (no weapon in the weapon slot): hit 1 is a
  // right-hand punch, hit 2 is a left-hand punch. IMPORTANT: this reuses the
  // knight_sword/knight_hand keyframe SLOTS rather than introducing separate
  // "punch" keys — the server's hit-detection (server/combat-system.js
  // _executeAttack) is hardcoded to read the 'knight_sword' slot for combo
  // step 1 and now the 'knight_hand' slot for step 2 (see the isUnarmed
  // branch there), and the client's drawKnightRightHand()/drawKnightHand()
  // read from those same slots via getKnightInterpolatedVis/getKnightRemoteVis
  // regardless of whether a weapon is equipped — only which *sprite* gets
  // drawn changes. So "knight_sword" here means "whatever's in the right
  // hand" (a fist, in this case) and "knight_hand" means "the left hand" —
  // same as always, just repurposed. Idle anchors match KNIGHT_VISUALS.jab.
  // knight_right_hand (28,23,.383,3.14) and .knight_hand (28,-23,.383,0.00).
  // Approximate first-pass keyframes — expect to retune the "punch" reach via
  // playtesting, there's no position-tool.html support for combo keyframes
  // (only idle poses), so tuning these means hand-editing the numbers here.
  unarmed_combo1: {
    segments: [30, 30],
    knight_sword: {
      keyframes: [
        { offsetX: 28, offsetY: 23, scale: 0.383, rotation: 3.14 },
        { offsetX: 67, offsetY: 10, scale: 0.383, rotation: 2.87 },
        { offsetX: 28, offsetY: 23, scale: 0.383, rotation: 3.14 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 28, offsetY: -23, scale: 0.383, rotation: 0.00 },
        { offsetX: 10, offsetY: -37, scale: 0.383, rotation: -0.36 },
        { offsetX: 28, offsetY: -23, scale: 0.383, rotation: 0.00 },
      ]
    }
  },
  unarmed_combo2: {
    segments: [30, 30],
    knight_sword: {
      keyframes: [
        { offsetX: 28, offsetY: 23, scale: 0.383, rotation: 3.14 },
        { offsetX: 10, offsetY: 9, scale: 0.383, rotation: 3.50 },
        { offsetX: 28, offsetY: 23, scale: 0.383, rotation: 3.14 },
      ]
    },
    knight_hand: {
      keyframes: [
        { offsetX: 28, offsetY: -23, scale: 0.383, rotation: 0.00 },
        { offsetX: 67, offsetY: -10, scale: 0.383, rotation: 0.27 },
        { offsetX: 28, offsetY: -23, scale: 0.383, rotation: 0.00 },
      ]
    }
  }
};
