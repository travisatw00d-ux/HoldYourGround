const {
  WORLD_W, WORLD_H, PLAYER_RADIUS, BASE_SPEED, BASE_ATTACK_DMG,
  BASE_ATTACK_SPEED_MS, BASE_HEALTH, COLORS, SPAWN_MIN_DIST, ITEMS,
  ITEM_SLOTS, CLASS_LOADOUTS, INVENTORY_SIZE, BASE_TURN_SPEED
} = require('./config');
const { resolveBaseItemId, calculateItemStatBonuses } = require('./item-generator');
const db = require('./db');

function getLoadout(playerClass) {
  return CLASS_LOADOUTS[playerClass] || CLASS_LOADOUTS.knight;
}

// Loads a logged-in player's persisted equipment (see db.js's equipment_json
// column comment, and room.js's removePlayer() for the write side). Returns
// null on any failure (no account row, column never written, corrupted/
// malformed JSON) — addPlayer() treats null as "no saved data, use the
// class loadout defaults," so a bad row can never block joining. Never
// called for guests (accountId is null for them) — see addPlayer() below.
function loadSavedEquipment(accountId) {
  try {
    const row = db.prepare('SELECT equipment_json FROM accounts WHERE id = ?').get(accountId);
    if (!row || !row.equipment_json) return null;
    const parsed = JSON.parse(row.equipment_json);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    // Still degrades to "no saved data" either way (a bad row must never
    // block joining), but logged now (2026-07-12) so a real DB/parse
    // failure is visible in server logs instead of just looking identical
    // to "this account never had anything saved."
    console.error(`[equipment] load failed for account ${accountId}:`, e);
    return null;
  }
}

// Loads a logged-in player's persisted currency total (currency_bronze —
// see db.js's column comment and currency.js for the denomination math).
// Same defensive shape as loadSavedEquipment() above: any failure degrades
// to 0 (never blocks joining), but logs a real DB/parse failure rather than
// silently looking like "this account never had any currency." Never called
// for guests (accountId is null for them).
function loadSavedCurrency(accountId) {
  try {
    const row = db.prepare('SELECT currency_bronze FROM accounts WHERE id = ?').get(accountId);
    if (!row) return 0;
    const v = row.currency_bronze;
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch (e) {
    console.error(`[currency] load failed for account ${accountId}:`, e);
    return 0;
  }
}

// Loads a logged-in player's persisted master chest contents (2026-07-14 —
// see db.js's master_chest_json column comment and room.js's
// _saveMasterChest() for the write side). Same defensive shape as
// loadSavedEquipment/loadSavedCurrency above: any failure (no row, no data,
// malformed JSON, wrong shape) degrades to null, which addPlayer() below
// treats as "start with an empty chest" — never blocks joining. Returns an
// array normalized to exactly INVENTORY_SIZE slots (padding with null or
// truncating) rather than trusting the stored length verbatim, so a future
// INVENTORY_SIZE change or a corrupted/truncated blob can never hand
// getItemAtLocation/setItemAtLocation an out-of-bounds array. Never called
// for guests (accountId is null for them) — they get a fresh empty in-memory
// chest every session, same as guests never getting persisted equipment.
function loadSavedMasterChest(accountId) {
  try {
    const row = db.prepare('SELECT master_chest_json FROM accounts WHERE id = ?').get(accountId);
    if (!row || !row.master_chest_json) return null;
    const parsed = JSON.parse(row.master_chest_json);
    if (!Array.isArray(parsed)) return null;
    const normalized = new Array(INVENTORY_SIZE).fill(null);
    for (let i = 0; i < Math.min(INVENTORY_SIZE, parsed.length); i++) normalized[i] = parsed[i] ?? null;
    return normalized;
  } catch (e) {
    console.error(`[masterChest] load failed for account ${accountId}:`, e);
    return null;
  }
}

function randomSpawn(zombies, minDist) {
  const margin = PLAYER_RADIUS * 4;
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = margin + Math.random() * (WORLD_W - margin * 2);
    const y = margin + Math.random() * (WORLD_H - margin * 2);
    if (minDist && zombies.length > 0) {
      let tooClose = false;
      for (const z of zombies) {
        if (!z.alive) continue;
        const dx = x - z.x, dy = y - z.y;
        if (dx * dx + dy * dy < minDist * minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
    }
    return { x, y };
  }
  return { x: WORLD_W / 2 + (Math.random() - 0.5) * 200, y: WORLD_H / 2 + (Math.random() - 0.5) * 200 };
}

// Sums stats off every equipped item: weapon (p.currentItem, hotbar-swappable)
// plus armor/ring/necklace/helmet (p.equipment). Each slot can hold either a
// plain base-item-id string (starter gear from CLASS_LOADOUTS, which never
// rolls attributes) or a full rolled instance object (anything from a drop —
// see item-generator.js/item-drops.js) — calculateItemStatBonuses() handles
// both shapes and also applies scaling attributes against p.lvl.
function equippedStatTotal(p, statKey) {
  let total = 0;
  if (p.currentItem) total += calculateItemStatBonuses(p.currentItem, p)[statKey] || 0;
  const equipment = p.equipment;
  if (equipment) {
    for (const slot of ITEM_SLOTS) {
      if (slot === 'weapon') continue;
      const item = equipment[slot];
      if (item) total += calculateItemStatBonuses(item, p)[statKey] || 0;
    }
  }
  return total;
}

function recalcStats(p) {
  const build = p.playerBuild || 'standard';
  const base = BUILD_BASE[build] || {};
  const scale = BUILD_SCALING[build] || BUILD_SCALING.standard;
  p.speed = (base.speed ?? BASE_SPEED) + equippedStatTotal(p, 'speed');
  p.attackDmg = (base.attackDmg ?? BASE_ATTACK_DMG) + equippedStatTotal(p, 'attackDmg');
  p.attackSpeed = BASE_ATTACK_SPEED_MS + equippedStatTotal(p, 'attackSpeed');
  p.turnSpeed = BASE_TURN_SPEED + equippedStatTotal(p, 'turnSpeed');
  // Defense is tracked and displayed but not yet applied to incoming zombie
  // damage in zombie-ai.js — that mitigation formula is follow-up combat work.
  p.defense = equippedStatTotal(p, 'defense');
  // Fortune and Luck are separate stats (2026-07-12, per Travis): Fortune
  // is tracked/displayed but not yet applied to anything — it's reserved
  // for a future gold-drop % multiplier, "wired but not yet applied" same
  // as defense above, follow-up work once gold drops exist as a mechanic.
  // Luck IS applied: room.js reads p.luck at the moment of a zombie kill
  // and passes it into item-drops.js's rollDropInstance(), which shifts the
  // rarity roll toward higher tiers — see item-generator.js's
  // getLuckAdjustedRarities().
  p.fortune = equippedStatTotal(p, 'fortune');
  p.luck = equippedStatTotal(p, 'luck');
  // Health Regen (2026-07-12) — HP restored per second, 0 baseline (only
  // equipped healthRegenFlat/healthRegenScaling grant any). Actually
  // applied every tick in room.js's gameTick(), not just tracked/displayed
  // like Defense/Fortune above.
  p.healthRegen = equippedStatTotal(p, 'healthRegen');
  p.maxHealth = (base.maxHealth ?? BASE_HEALTH) + equippedStatTotal(p, 'maxHealth');
  p.maxEnergy = 100 + equippedStatTotal(p, 'maxEnergy');
  if (p.investedPoints) {
    p.maxHealth += (p.investedPoints.maxHealth || 0) * scale.maxHealth;
    p.maxEnergy += (p.investedPoints.maxEnergy || 0) * scale.maxEnergy;
    p.speed = Math.min(scale.speedCap || 16, p.speed + (p.investedPoints.speed || 0) * scale.speed);
    p.attackDmg += (p.investedPoints.attackDmg || 0) * scale.attackDmg;
    p.attackSpeed += (p.investedPoints.attackSpeed || 0) * (-20);
    p.turnSpeed += (p.investedPoints.turnSpeed || 0) * 1;
  }
  if (p.health > p.maxHealth) p.health = p.maxHealth;
}

const BUILD_SCALING = {
  standard: { maxHealth: 10, maxEnergy: 10, speed: 0.03, attackDmg: 1, speedCap: 16 },
  glassCannon: { maxHealth: 5, maxEnergy: 10, speed: 0.03, attackDmg: 2, speedCap: 16 },
  tank: { maxHealth: 15, maxEnergy: 10, speed: 0.05, attackDmg: 0.5, speedCap: 16 }
};

const BUILD_BASE = {
  glassCannon: { maxHealth: 80, attackDmg: 8 },
  tank: { maxHealth: 150, speed: 11, attackDmg: 3 }
};

let colorIndex = 0;

function addPlayer(id, name, players, zombies, accountType, accountId) {
  const spawn = randomSpawn(zombies, SPAWN_MIN_DIST);
  const ci = colorIndex++ % COLORS.length;
  const playerClass = 'knight';
  const loadout = getLoadout(playerClass);
  // Persisted gear (2026-07-12) overrides the class loadout defaults for a
  // logged-in account that has previously saved equipment — see
  // loadSavedEquipment() above and room.js's removePlayer() for the write
  // side. `saved` is either null (guest, brand-new account, or no saved
  // data yet) or the full {weapon,armor,ring,necklace,helmet} shape; every
  // field is read defensively with `!== undefined` / `?? null` so a
  // partial/legacy JSON blob can't leave any slot as `undefined` (which
  // would behave subtly differently from an intentional `null`/unarmed-or-
  // unequipped slot down the line — see playerInfoObj/net-events.js).
  const saved = accountId ? loadSavedEquipment(accountId) : null;
  players[id] = {
    id,
    _idBytes: Buffer.from(id, 'utf8'),
    name: name || 'Player',
    accountType: accountType || 'guest',
    accountId: accountId || null,
    x: spawn.x, y: spawn.y,
    velX: 0, velY: 0,
    radius: PLAYER_RADIUS,
    color: COLORS[ci],
    alive: true,
    input: { dx: 0, dy: 0 },
    health: BASE_HEALTH,
    maxHealth: BASE_HEALTH,
    energy: 100,
    maxEnergy: 100,
    attackCooldown: 0,
    facingAngle: 0,
    currentItem: saved ? (saved.weapon !== undefined ? saved.weapon : null) : loadout.weapon,
    inventory: [loadout.weapon],
    equipment: saved
      ? { armor: saved.armor ?? null, ring: saved.ring ?? null, necklace: saved.necklace ?? null, helmet: saved.helmet ?? null }
      : { armor: loadout.armor, ring: loadout.ring, necklace: loadout.necklace, helmet: loadout.helmet || null },
    // General-purpose item bag — distinct from `inventory` above (that's the
    // weapon hotbar). Picked-up items land in the first null slot here; see
    // addToInventory(). Fixed size, left-to-right/top-to-bottom like InvSlot1..16
    // in hud-layout.json.
    inventorySlots: new Array(INVENTORY_SIZE).fill(null),
    // Master chest (2026-07-14, drag-in + persistence wired same day) — the
    // player's personal storage grid, same 16-slot shape/index convention as
    // inventorySlots (left-to-right/top-to-bottom, matches ChestSlot1..16 in
    // hud-layout.json). Unlike inventorySlots (never persisted, by design),
    // a logged-in account's chest survives every disconnect/leave/match —
    // see loadSavedMasterChest() above and room.js's _saveMasterChest() for
    // the write side, which fires on every chest mutation, not just on
    // leave. Guests always start with a fresh empty chest (accountId is
    // null for them, matching `saved`/equipment above).
    masterChest: accountId ? (loadSavedMasterChest(accountId) || new Array(INVENTORY_SIZE).fill(null)) : new Array(INVENTORY_SIZE).fill(null),
    kills: 0,
    lastHitById: null,
    attacking: false,
    attackFrame: 0,
    attackAnim: null,
    attackHitIds: [],
    attackLockedAngle: 0,
    attackStartTime: 0,
    prevCf: -1,
    lvl: 1,
    exp: 0,
    // currencyBronze (2026-07-13) replaces the old flat `gold` field —
    // total-bronze integer, see currency.js for the denomination math. A
    // logged-in account's persisted balance (loadSavedCurrency() above)
    // carries over on join, same as saved equipment; guests always start at
    // 0 (accountId is null for them, matching `saved` above).
    currencyBronze: accountId ? loadSavedCurrency(accountId) : 0,
    playerClass,
    cameraZoom: 1.0,
    viewW: 800,
    viewH: 600,
    fullscreen: false,
    godMode: false,
    attackStyle: 'jab',
    comboStep: 0,
    _lastAttackTime: 0,
    _chainTickTarget: 0,
    _chainPendingAngle: null,
    _chainDelayTicks: 5,
    _started: false,
    _queuedChain: null,
    comboChainWindow: false,
    sprint: false,
    sprintEndCooldown: 0,
    _spinRemaining: 0,
    _lungeRemaining: 0,
    _combo3MidHit: false,
    _lastMouseAngle: 0,
    _spinLungeAngle: 0,
    _jabHitCleared: 0,
    isSpectator: false,
    statPoints: 0,
    investedPoints: {},
    playerBuild: 'standard'
  };
  recalcStats(players[id]);
}

function setFullscreen(id, players, enabled) {
  const p = players[id];
  if (p) p.fullscreen = !!enabled;
}

function setCameraZoom(id, players, opts) {
  const p = players[id];
  if (!p) return;
  p.cameraZoom = Math.max(0.1, Math.min(4.0, (opts && opts.zoom) || 1));
  if (opts && opts.viewW) p.viewW = opts.viewW;
  if (opts && opts.viewH) p.viewH = opts.viewH;
}

// Puts a picked-up item into the first empty bag slot (left-to-right, top-to-
// bottom — array index order matches InvSlot1..16 in hud-layout.json). Returns
// the slot index it landed in, or -1 if the bag is full. Doesn't equip it —
// that's a separate action (drag onto an equipment slot). `itemOrInstance` is
// either a plain base-item-id string or a full rolled instance object (see
// item-generator.js) — this function just stores whatever it's given, it
// doesn't care which.
function addToInventory(p, itemOrInstance) {
  if (!p || !p.inventorySlots || !itemOrInstance) return -1;
  const idx = p.inventorySlots.indexOf(null);
  if (idx === -1) return -1;
  p.inventorySlots[idx] = itemOrInstance;
  return idx;
}

// Drag-and-drop item locations. Three shapes, matching the client's slot defs
// (InvSlot1..16 -> bag index 0..15, EquipWeapon/Armor/Ring/Necklace/Helmet ->
// equip slot names in ITEM_SLOTS, ChestSlot1..16 -> chest index 0..15):
//   { kind: 'bag', index: 0..INVENTORY_SIZE-1 }
//   { kind: 'equip', slot: 'weapon'|'armor'|'ring'|'necklace'|'helmet' }
//   { kind: 'chest', index: 0..INVENTORY_SIZE-1 }
// 'weapon' is special-cased to p.currentItem (the existing hotbar-swappable
// source of truth) rather than living in p.equipment like the other four.
// 'chest' (2026-07-14) is the master chest's 16-slot grid, p.masterChest —
// same plain-array-of-slots shape as the bag, no restrictions on what can go
// in it (see canPlaceItem below), just gated by proximity to the chest at the
// room.js call site (handleMoveItem/handleDropItem) rather than here.
function getItemAtLocation(p, loc) {
  if (!p || !loc) return null;
  if (loc.kind === 'bag') {
    if (!p.inventorySlots || loc.index < 0 || loc.index >= p.inventorySlots.length) return null;
    return p.inventorySlots[loc.index] || null;
  }
  if (loc.kind === 'chest') {
    if (!p.masterChest || loc.index < 0 || loc.index >= p.masterChest.length) return null;
    return p.masterChest[loc.index] || null;
  }
  if (loc.kind === 'equip') {
    if (loc.slot === 'weapon') return p.currentItem || null;
    return (p.equipment && p.equipment[loc.slot]) || null;
  }
  return null;
}

function setItemAtLocation(p, loc, itemId) {
  if (loc.kind === 'bag') {
    p.inventorySlots[loc.index] = itemId;
  } else if (loc.kind === 'chest') {
    p.masterChest[loc.index] = itemId;
  } else if (loc.kind === 'equip') {
    if (loc.slot === 'weapon') p.currentItem = itemId;
    else p.equipment[loc.slot] = itemId;
  }
}

// Slots that require the item's `class` to match the player's class in
// addition to its `type` matching the slot name — weapon/armor/helmet are
// class-specific gear; rings/necklaces are universal accessories.
const CLASS_RESTRICTED_SLOTS = new Set(['weapon', 'armor', 'helmet']);

function canPlaceItem(itemDef, loc, playerClass) {
  if (loc.kind === 'bag' || loc.kind === 'chest') return true; // bag/chest slots take any item
  if (!itemDef) return false;
  if (itemDef.type !== loc.slot) return false;
  if (CLASS_RESTRICTED_SLOTS.has(loc.slot) && itemDef.class !== playerClass) return false;
  return true;
}

// Moves an item between any two locations (bag<->bag, bag<->equip,
// bag<->chest, chest<->chest, equip<->chest), and, for equip slots, only if
// the item's type/class match — see canPlaceItem. If the destination is
// already occupied, this SWAPS instead of no-oping (added 2026-07-12
// specifically so dragging a new ring/necklace onto an already-equipped one
// replaces it and the displaced item lands in the exact bag slot the new one
// came from) — the swap only goes through if the displaced item is also
// valid to land in `from` (always true when `from` is a bag or chest slot,
// since canPlaceItem lets those take anything; for an equip<->equip drag both
// items' types would need to match the other slot too, which in practice
// means only same-slot swaps are possible there). Returns true if the
// move/swap happened (caller should recalcStats + broadcast playerInfo).
// Chest-involving moves are proximity-gated by the caller (room.js's
// handleMoveItem), not here — this function only knows about slot shapes.
function moveItem(p, from, to) {
  if (!p || !from || !to) return false;
  if (to.kind === 'bag' && (!p.inventorySlots || to.index < 0 || to.index >= p.inventorySlots.length)) return false;
  if (to.kind === 'chest' && (!p.masterChest || to.index < 0 || to.index >= p.masterChest.length)) return false;
  if (to.kind === 'equip' && !ITEM_SLOTS.includes(to.slot)) return false;
  if (from.kind === to.kind && (from.kind === 'bag' || from.kind === 'chest') && from.index === to.index) return false;
  if (from.kind === to.kind && from.kind === 'equip' && from.slot === to.slot) return false;
  const itemAtFrom = getItemAtLocation(p, from);
  if (!itemAtFrom) return false;
  const itemDefFrom = ITEMS[resolveBaseItemId(itemAtFrom)];
  if (!canPlaceItem(itemDefFrom, to, p.playerClass)) return false;

  const itemAtTo = getItemAtLocation(p, to);
  if (itemAtTo) {
    const itemDefTo = ITEMS[resolveBaseItemId(itemAtTo)];
    if (!canPlaceItem(itemDefTo, from, p.playerClass)) return false; // displaced item wouldn't be valid back in `from`
    setItemAtLocation(p, from, itemAtTo);
    setItemAtLocation(p, to, itemAtFrom);
    return true;
  }

  setItemAtLocation(p, from, null);
  setItemAtLocation(p, to, itemAtFrom);
  return true;
}

function respawnPlayer(id, players, zombies) {
  const p = players[id];
  if (!p) return;
  const spawn = randomSpawn(zombies, SPAWN_MIN_DIST);
  p.x = spawn.x; p.y = spawn.y;
  p.velX = 0; p.velY = 0;
  p.alive = true;
  p.input = { dx: 0, dy: 0 };
  p.lastHitById = null;
  p.health = p.maxHealth || BASE_HEALTH;
  p.attackCooldown = 0;
  p.attacking = false;
  p.attackAnim = null;
  p.attackHitIds = [];
  p.prevCf = -1;
  p.comboStep = 0;
  p._lastAttackTime = 0;
  p._chainTickTarget = 0;
  p._chainPendingAngle = null;
  p._chainDelayTicks = 5;
  p._started = false;
  p._queuedChain = null;
  p.comboChainWindow = false;
  p.godMode = false;
  p.isSpectator = false;
  p.sprint = false;
  p.energy = p.maxEnergy || 100;
  p.sprintEndCooldown = 0;
  p._lungeRemaining = 0;
  p._combo3MidHit = false;
  p._lastMouseAngle = 0;
  p._spinLungeAngle = 0;
  p._jabHitCleared = 0;
  p._spinRemaining = 0;
}

function playerInfoObj(p) {
  return {
    id: p.id, name: p.name, color: p.color,
    currentItem: p.currentItem, inventory: p.inventory,
    // Unified 5-slot view for HUD/character-window display. weapon mirrors
    // currentItem (still the hotbar-swappable source of truth); armor/ring/
    // necklace/helmet come from p.equipment.
    equipment: {
      weapon: p.currentItem,
      armor: p.equipment && p.equipment.armor,
      ring: p.equipment && p.equipment.ring,
      necklace: p.equipment && p.equipment.necklace,
      helmet: p.equipment && p.equipment.helmet
    },
    inventorySlots: p.inventorySlots,
    masterChest: p.masterChest,
    maxHealth: p.maxHealth, maxEnergy: p.maxEnergy, speed: p.speed, attackDmg: p.attackDmg, attackSpeed: p.attackSpeed,
    turnSpeed: p.turnSpeed, defense: p.defense || 0, fortune: p.fortune || 0, luck: p.luck || 0, healthRegen: p.healthRegen || 0,
    lvl: p.lvl || 1,
    playerClass: p.playerClass || 'knight',
    attackStyle: p.attackStyle || 'jab',
    isSpectator: p.isSpectator,
    statPoints: p.statPoints || 0,
    playerBuild: p.playerBuild || 'standard'
  };
}

function resetColorIndex() { colorIndex = 0; }

module.exports = { randomSpawn, recalcStats, addPlayer, respawnPlayer, playerInfoObj, resetColorIndex, setFullscreen, setCameraZoom, addToInventory, moveItem, getItemAtLocation, setItemAtLocation, BUILD_SCALING, BUILD_BASE };
