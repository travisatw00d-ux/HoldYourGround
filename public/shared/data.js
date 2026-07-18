(function () {
  const BASE_TURN_SPEED = 12;

  const BASE_STATS = {
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
  const ITEM_SLOTS = ['weapon', 'armor', 'ring', 'necklace', 'helmet'];

  // Starter loadout per playerClass. Only 'knight' exists today (no class
  // picker yet) but this keeps the door open for more classes later without
  // reworking how defaults are resolved. ring/necklace/helmet have no starter
  // item — rings and necklaces only come from zombie drops now (removed the
  // basic_ring/basic_necklace filler items 2026-07-12, since they had no
  // visual representation and were confusingly occupying the slot, blocking
  // the first real ring/necklace pickup from being dragged in).
  const CLASS_LOADOUTS = {
    knight: { weapon: 'wooden_sword', armor: 'basic_armor', ring: null, necklace: null, helmet: null }
  };

  // Size of the general-purpose item bag (distinct from the weapon hotbar
  // currentItem/inventory above). Picked-up items land here first — see
  // addToInventory() in server/player.js — before being equipped. Slot order is
  // left-to-right, top-to-bottom, matching the InvSlot1..16 layout entries in
  // hud-layout.json (positioned via Workflow/hud-position-tool.html).
  const INVENTORY_SIZE = 16;

  // How close (world units) a player has to be to a world item drop to see
  // what it is or pick it up — see the matching comment in game-data.js.
  // item-drops.js is the actual authority (enforced in room.js's
  // handlePickupItem); the client mirrors this number so it doesn't show a
  // tooltip/allow a click the server would just reject.
  const ITEM_PICKUP_RANGE = 200;

  const SWORD_IMG_SIZE = 1254;
  const BLADE_W = 6;
  const BLADE_TIP_X = 399;
  const BLADE_TIP_Y = -567;
  const BLADE_HILT_X = -366;
  const BLADE_HILT_Y = 396;

  // `type` doubles as the equipment-slot category (must equal an ITEM_SLOTS
  // name). `class` restricts weapon/armor/helmet items to a matching
  // playerClass; rings/necklaces have no `class` — any class can wear them.
  const ITEMS = {
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
    // Zombie-drop loot — see server/item-drops.js + server/item-generator.js.
    // `tier` feeds generateItemInstance()'s attribute-value ranges. `stats`
    // stays empty on purpose: a drop's bonuses live entirely in its rolled
    // `attributes` array (generated once, server-side, at drop time) — see
    // item-generation-system.md.
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

  // Item progression tiers — distinct from rarity (ITEM_RARITIES below). See
  // the matching comment in game-data.js for the full explanation.
  const ITEM_TIERS = {
    1: { id: 1, name: 'Tier 1' }
  };

  // Rarity roll table — see server/item-generator.js's rollItemRarity() and
  // the matching comment in game-data.js. `weight` is relative (normalized
  // at roll time by the sum of all weights), `attributeCount` is how many
  // rolled attributes that rarity gets, `color` drives the tooltip name color.
  // `luckBoosted` marks which rarities the killer's Luck stat scales up —
  // see server/item-generator.js's getLuckAdjustedRarities(). Common/
  // Uncommon are the ones that shrink to compensate, not boosted themselves.
  const ITEM_RARITIES = [
    { id: 'common', name: 'Common', color: '#ffffff', weight: 50, attributeCount: 1, luckBoosted: false },
    { id: 'uncommon', name: 'Uncommon', color: '#22c55e', weight: 30, attributeCount: 2, luckBoosted: false },
    { id: 'rare', name: 'Rare', color: '#3b82f6', weight: 10, attributeCount: 3, luckBoosted: true },
    { id: 'epic', name: 'Epic', color: '#a855f7', weight: 5, attributeCount: 4, luckBoosted: true },
    { id: 'legendary', name: 'Legendary', color: '#f97316', weight: 3, attributeCount: 5, luckBoosted: true },
    { id: 'mythic', name: 'Mythic', color: '#ef4444', weight: 1, attributeCount: 6, luckBoosted: true },
    { id: 'ungodly', name: 'Ungodly', color: '#ffd700', weight: 0.5, attributeCount: 7, luckBoosted: true }
  ];

  // Full pool of rollable item attributes (Tier 1) — see the matching
  // comment in game-data.js for the full field-by-field explanation. Keep
  // this in sync with game-data.js exactly; server/item-generator.js is the
  // authority that actually rolls against these ranges. `itemNameText` is
  // used ONLY for generated item names (e.g. "Basic Ring of Greater Attack
  // Damage" — see item-generation-system.md's stacking section); it's
  // deliberately separate from `displayName` (used for tooltip attribute
  // rows) since `displayName` stays the bare stat name and gets a dynamic
  // "Scaling " prefix at display time instead of having it baked in.
  const ITEM_ATTRIBUTES = {
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
    // feature exists, see item-generation-system.md), Luck raises the odds
    // of rolling a higher item rarity (built now — see
    // getLuckAdjustedRarities() in server/item-generator.js).
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

  const ITEM_VISUALS = {
    wooden_sword: {
      offsetX: 23,
      offsetY: 24,
      scale: 0.047,
      rotation: 0.76
    }
  };

  const ANIMATIONS = {
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
        segments: [10, 10, 10, 10, 10, 10]
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

  const ZOMBIE_ANIMATIONS = {
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

  const ZOMBIE_VISUALS = {
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
  const GOBLIN_ANIMATIONS = {
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

  const GOBLIN_VISUALS = {
    left_hand: { offsetX: 18, offsetY: -18, scale: 0.212, rotation: -1.30 },
    sword: { offsetX: 25, offsetY: 24, scale: 0.250, rotation: 1.68 }
  };

  const SCREEN_UI = {
    serverLevel: { x: 53, y: 56, scale: 0.4, ty: -6 }
  };

  const MOB_TYPES = [
    { id: 'zombie',  name: 'Zombie',  emoji: '🧟', miniFrame: 'zombieminibig.png', unlockLevel: 1,  minCount: 90,  maxCount: 110, countGrowth: 2, baseHealth: 5, healthGrowth: 1.5, baseSpeed: 1.5, speedDecay: 0 },
    { id: 'troll',   name: 'Troll',   emoji: '👹', unlockLevel: 5,  minCount: 5,   maxCount: 15,  countGrowth: 1, baseHealth: 15, healthGrowth: 2,   baseSpeed: 1.3, speedDecay: 0 },
    // attackRange: goblin swings a real blade, so its stab reaches further
    // than the bare-handed zombie/troll contact range (see ZOMBIE_ATTACK_RANGE
    // in server/config.js, used as the fallback for mobs without this field).
    // damage: 2x the flat ZOMBIE_DAMAGE (10) — per Travis, doubled at goblin's
    // level-1 baseline (see zombie-ai.js's processZombieAttacks fallback).
    { id: 'goblin',  name: 'Goblin',  emoji: '👺', unlockLevel: 10, minCount: 3,   maxCount: 10,  countGrowth: 1, baseHealth: 8,  healthGrowth: 1.8, baseSpeed: 1.6, speedDecay: 0.01, attackRange: 40, damage: 20 },
  ];

  const KNIGHT_BLADE_TIP_X = -5;
  const KNIGHT_BLADE_TIP_Y = -74;
  const KNIGHT_BLADE_HILT_X = 4;
  const KNIGHT_BLADE_HILT_Y = 16;

  // knight_right_hand is the unarmed fist that replaces knight_sword when
  // p.currentItem is empty (see drawKnightRightHand() in render-entity.js).
  const KNIGHT_VISUALS = {
    jab: {
      knight_sword: { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
      knight_hand:  { offsetX: 28, offsetY: -23, scale: 0.383, rotation: 0.00 },
      knight_right_hand: { offsetX: 28, offsetY: 23, scale: 0.383, rotation: 3.14 }
    },
    swing: {
      knight_sword: { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
      knight_hand:  { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
      // Unused (client always forces unarmed to the .jab pose regardless of
      // jab/swing toggle) — see the matching comment in game-data.js.
      knight_right_hand: { offsetX: 25, offsetY: -43, scale: 0.383, rotation: -0.42 }
    }
  };

  const KNIGHT_ANIMATIONS = {
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

    // Unarmed 2-hit punch combo — see the matching comment in
    // lib/game-data.js for why this reuses the knight_sword/knight_hand
    // keyframe slots instead of introducing separate punch keys.
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MOB_TYPES, BASE_STATS, BASE_TURN_SPEED, ITEM_SLOTS, CLASS_LOADOUTS, INVENTORY_SIZE, ITEM_PICKUP_RANGE, ITEMS, ITEM_TIERS, ITEM_RARITIES, ITEM_ATTRIBUTES, ITEM_VISUALS, ANIMATIONS, SWORD_IMG_SIZE, BLADE_W, BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y, ZOMBIE_VISUALS, ZOMBIE_ANIMATIONS, GOBLIN_VISUALS, GOBLIN_ANIMATIONS, SCREEN_UI, KNIGHT_VISUALS, KNIGHT_ANIMATIONS, KNIGHT_BLADE_TIP_X, KNIGHT_BLADE_TIP_Y, KNIGHT_BLADE_HILT_X, KNIGHT_BLADE_HILT_Y };
  } else {
    window.BASE_TURN_SPEED = BASE_TURN_SPEED;
    window.BASE_STATS = BASE_STATS;
    window.ITEM_SLOTS = ITEM_SLOTS;
    window.CLASS_LOADOUTS = CLASS_LOADOUTS;
    window.INVENTORY_SIZE = INVENTORY_SIZE;
    window.ITEM_PICKUP_RANGE = ITEM_PICKUP_RANGE;
    window.ITEMS = ITEMS;
    window.ITEM_TIERS = ITEM_TIERS;
    window.ITEM_RARITIES = ITEM_RARITIES;
    window.ITEM_ATTRIBUTES = ITEM_ATTRIBUTES;
    window.ITEM_VISUALS = ITEM_VISUALS;
    window.ANIMATIONS = ANIMATIONS;
    window.SWORD_IMG_SIZE = SWORD_IMG_SIZE;
    window.BLADE_W = BLADE_W;
    window.BLADE_TIP_X = BLADE_TIP_X;
    window.BLADE_TIP_Y = BLADE_TIP_Y;
    window.BLADE_HILT_X = BLADE_HILT_X;
    window.BLADE_HILT_Y = BLADE_HILT_Y;
    window.ZOMBIE_VISUALS = ZOMBIE_VISUALS;
    window.ZOMBIE_ANIMATIONS = ZOMBIE_ANIMATIONS;
    window.GOBLIN_VISUALS = GOBLIN_VISUALS;
    window.GOBLIN_ANIMATIONS = GOBLIN_ANIMATIONS;
    window.MOB_TYPES = MOB_TYPES;
    window.SCREEN_UI = SCREEN_UI;
    window.KNIGHT_VISUALS = KNIGHT_VISUALS;
    window.KNIGHT_ANIMATIONS = KNIGHT_ANIMATIONS;
    window.KNIGHT_BLADE_TIP_X = KNIGHT_BLADE_TIP_X;
    window.KNIGHT_BLADE_TIP_Y = KNIGHT_BLADE_TIP_Y;
    window.KNIGHT_BLADE_HILT_X = KNIGHT_BLADE_HILT_X;
    window.KNIGHT_BLADE_HILT_Y = KNIGHT_BLADE_HILT_Y;
  }
})();
