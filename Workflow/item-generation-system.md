# Item Generation System

How rolled item instances (rarity + attributes) get created, stored, and
displayed. Added 2026-07-11 alongside the ring/necklace zombie-drop feature.
Read this before touching rarity odds, attribute pools, value ranges, or
anything that reads/writes a `{instanceId, baseItemId, itemTier, rarityId,
attributes}` object.

## Two kinds of "item" in this codebase

Every slot that can hold an item — bag slots (`p.inventorySlots[i]`),
equip slots (`p.equipment[slot]`, `p.currentItem`), and world drops
(`room.itemDrops[id].item`) — can hold **either**:

- a bare string, e.g. `'wooden_sword'` — a starter/legacy item. Never rolls
  attributes; its bonuses come entirely from `ITEMS[id].stats` (a static
  object in `shared/data.js`/`game-data.js`).
- a **rolled instance**: `{instanceId, baseItemId, itemTier, rarityId,
  attributes: [{attributeId, value}, ...]}`. Only zombie drops produce these
  today (via `item-drops.js:rollDropInstance()`), but nothing in the pipeline
  assumes drops are the only source — any code path that calls
  `generateItemInstance()` gets one.

Because both shapes can show up in the same slot, almost every place that
touches an item needs to normalize first. `resolveBaseItemId(itemOrInstance)`
does that (returns the string as-is, or `.baseItemId` if it's an instance) —
implemented twice, once server-side in `item-generator.js` and once
client-side in `ui.js` (no shared module between them, so keep both in sync
by convention if the shape ever changes). `isRolledInstance(itemOrInstance)`
(same duplication) checks `Array.isArray(itemOrInstance.attributes)` to tell
the two shapes apart.

## Tier vs. rarity — don't conflate these

- **Tier** (`ITEM_TIERS`, currently just `{1: {id:1, name:'Tier 1'}}`) is a
  property of the *base item* (`ITEMS[id].tier`). It picks which value-ranges
  apply when rolling an attribute — see `ranges: {1: {min,max,precision}}` on
  each `ITEM_ATTRIBUTES` entry. Adding Tier 2 gear later means adding a `2:
  {...}` tier entry and a `2: {min,max,precision}` range to every attribute
  that should be rollable on it — the item's own `tier` field decides which
  range map entry gets read (`rollAttributeValue()` falls back to tier 1's
  range if the requested tier has none defined, so partially-tiered
  attributes don't crash).
- **Rarity** (`ITEM_RARITIES`) is rolled fresh per-instance, independent of
  tier. It only decides how many attributes get selected
  (`attributeCount`) and what color/name the tooltip shows. A Tier 1 item and
  a (future) Tier 2 item can both roll Legendary; Legendary just means "5
  attributes," not "5 attributes from some higher-tier-only pool."

## The roll table (`ITEM_RARITIES`, in `shared/data.js` + `game-data.js`)

| Rarity | Weight | Attributes | Color |
|---|---|---|---|
| Common | 50 | 1 | `#ffffff` |
| Uncommon | 30 | 2 | `#22c55e` |
| Rare | 10 | 3 | `#3b82f6` |
| Epic | 5 | 4 | `#a855f7` |
| Legendary | 3 | 5 | `#f97316` |
| Mythic | 1 | 6 | `#ef4444` |
| Ungodly | 0.5 | 7 | `#ffd700` |

Weights sum to 99.5, not 100 — **this is intentional, not a bug**. There's no
synthetic fallback rarity soaking up the missing 0.5%. `rollItemRarity()`
normalizes by dividing by the actual sum of all weights
(`roll = rng() * totalWeight`, then walks the list subtracting each weight
until `roll` lands inside one), so the relative odds are always correct
regardless of whether the weights happen to add to 100. Bumping any weight,
or adding a new rarity, needs no other math to change.

## Generation pipeline (`server/item-generator.js`)

`generateItemInstance(baseItemId, itemTier, rng)` runs, in order:

1. Look up `ITEMS[baseItemId]` — returns `null` if it doesn't exist (never
   throws; callers like `item-drops.js` just treat `null` as "no item").
2. Resolve tier: the passed `itemTier`, or `itemDef.tier`, or `1`.
3. `rollItemRarity(rng)` — weighted pick, see above.
4. `getAttributePoolForItem(itemDef, tier)` — filters `ITEM_ATTRIBUTES` down
   to entries whose `tiers` includes this tier and whose `categories` either
   is `null` (any category — true for all 14 Tier-1 attributes today) or
   includes `itemDef.type`.
5. `selectRandomAttributes(pool, rarity.attributeCount, rules, rng)` — picks
   which attributes actually get rolled (see selection rules below).
6. For each selected attribute, `rollAttributeValue(attrDef, tier, rng)` —
   `min + rng()*(max-min)`, rounded to the attribute's configured
   `precision`.
7. Package into `{instanceId, baseItemId, itemTier, rarityId, attributes}`
   and return it. `instanceId` comes from `crypto.randomUUID()` (falls back
   to a timestamp+random string if unavailable) — this is what makes an
   instance "permanent": once generated it's never re-rolled, only ever
   read/serialized/deserialized as-is (see `db.js` gotcha below — there's no
   persistence yet, but if/when there is, the instance object round-trips
   through `JSON.stringify`/`parse` untouched).

Every one of these functions takes an injectable `rng` parameter, defaulting
to `Math.random`. This is purely for `server/test-item-generator.js` to force
deterministic outcomes — nothing in production code ever passes anything but
the default.

## Attribute selection rules

Two independent booleans, both on `ATTRIBUTE_SELECTION_RULES` at the top of
`item-generator.js` (and overridable per-call via `selectRandomAttributes`'s
third argument, though nothing does today):

- `allowExactDuplicateAttributes` (default `false`) — if `true`, the same
  attribute id could be rolled twice on one item (sampling with
  replacement). Off by default so e.g. two separate "+Attack Damage" rows
  never show up on the same ring.
- `allowFlatAndScalingPair` (default `true`) — the flat and scaling versions
  of the *same stat* (e.g. `attackDamageFlat` + `attackDamageScaling`) are
  normally allowed together even though they share a `stat` field. Setting
  this `false` would make them mutually exclusive, tracked via a `usedStats`
  Set during selection.

Selection is capped at `Math.min(count, pool.length)` whenever duplicates
are disallowed — asking for more attributes than exist in the pool returns
whatever's available rather than looping forever or throwing. An empty or
`null` pool, or a `count <= 0`, returns `[]` immediately.

## Stat math (`calculateItemStatBonuses`)

One function, called from both `player.js:equippedStatTotal()` (live gameplay
stat totals) and `ui.js:formatItemAttribute()`'s sibling tooltip code (display
only — the tooltip re-derives the same numbers rather than trusting a second
source of truth). For a given item-or-instance and player state:

- Legacy items: sums `ITEMS[baseId].stats` directly (flat, no scaling).
- Rolled instances: for each `{attributeId, value}`, looks up the attribute
  definition. `mode: 'flat'` adds `value` as-is; `mode: 'scaling'` multiplies
  by `playerState.lvl` first. Today the only scaling source is player level;
  if that ever needs to change (item level, server-wide difficulty, etc.)
  this is the one place to touch — nothing else reads `.lvl` directly for
  this purpose.

Both paths land in the same `{[stat]: total}` map, added together. This is
why `recalcStats()` in `player.js` had to gain
`+ equippedStatTotal(p, 'maxHealth')` / `+ equippedStatTotal(p, 'maxEnergy')`
— those two stats used to be base-only, and a rolled `maxHealthFlat`/
`maxEnergyScaling` attribute would otherwise have no effect at all.

## Server-authoritative — no exceptions

The client never generates or mutates a roll. `generateItemInstance()` only
exists in `server/item-generator.js` (CommonJS, `server/`-only — nothing
under `public/` requires it). The client's copy in `ui.js` only *reads*
instance objects it received from the server (via `playerInfo`,
`itemDropAdded`, etc.) to build tooltips/icons/drag-ghosts — it has no
roll/generate function at all, on purpose. If a future feature needs
client-side prediction of a roll's outcome, that's a deliberate design
conversation, not a "just call the same function" change.

## Required functions (all in `server/item-generator.js`)

`rollItemRarity(rng)`, `getRarityDef(rarityId)`,
`getAttributePoolForItem(item, itemTier)`,
`selectRandomAttributes(pool, count, rules, rng)`,
`rollAttributeValue(attributeDefinition, itemTier, rng)`,
`generateItemInstance(baseItemId, itemTier, rng)`,
`resolveBaseItemId(itemOrInstance)`, `isRolledInstance(itemOrInstance)`,
`calculateItemStatBonuses(itemOrInstance, playerState)`,
`formatItemAttribute(attribute)` (server-side formatter used nowhere yet —
`ui.js` has its own client-side `formatItemAttribute()` for the tooltip,
kept separate since it needs to call `formatStatValue()` for the
attack-speed special case, which is a client-only concept).

## Validation tests

`server/test-item-generator.js` — plain Node script (`node
server/test-item-generator.js`), no test framework in this repo. Covers:
attribute count is exact per rarity (forces the rarity via a deterministic
`rng` that lands on each rarity's midpoint, see `rngForRarity()` in that
file), duplicate prevention, flat+scaling pairing (both directions),
sampling-with-replacement when enabled, empty/invalid pool safety, rolled
values stay in range (with a small rounding-tolerance), every instance gets
a unique id, JSON round-trip preserves a rolled instance exactly, unknown
base item id returns `null`, and a 100,000-roll simulation checks the
rarity distribution lands within tolerance of the configured weights. Run it
after touching any of `ITEM_RARITIES`/`ITEM_ATTRIBUTES`/`item-generator.js`.

## Adding things later

- **New attribute**: add an entry to `ITEM_ATTRIBUTES` in **both**
  `shared/data.js` and `game-data.js` (hand-mirrored, same rule as every
  other shared constant in this project) with a `ranges` entry for every
  tier it should be rollable on. No code changes needed — the generator
  reads the pool data-driven.
- **New rarity**: add an entry to `ITEM_RARITIES` (both files). Weights
  don't need to sum to anything in particular.
- **New tier**: add an entry to `ITEM_TIERS` (both files), then a `ranges[N]`
  entry to whichever attributes should be rollable at that tier, then set
  `tier: N` on the base items that should drop at it.
- **New item category** (e.g. a `'boots'` slot): add it to `ITEM_SLOTS`, then
  either leave `categories: null` on attributes that should apply everywhere
  or list the new category explicitly on the ones that shouldn't.

## Gotchas

| Issue | Root cause |
|---|---|
| Rolled `maxHealth`/`maxEnergy` attribute has no effect | `recalcStats()` in `player.js` must add `equippedStatTotal(p, 'maxHealth')`/`'maxEnergy'` — these two stats used to be base-only before this system existed. Already fixed 2026-07-11; if a similar stat gets added later (a brand-new `stat` key in `ITEM_ATTRIBUTES` that no existing base-stat code reads), check whether `recalcStats()` actually consumes it before assuming it "just works." |
| `fortune` (or any new field only sent via `playerInfo`) silently resets to 0 every ~55ms | Same class of bug as `equipment`/`inventorySlots` (see editing-client.md's gotcha table) — the binary `state` handler in `net-events.js` rebuilds `state.players[id]` from scratch every tick and only carries over fields explicitly copied from `state.playerMeta[id]`. Fixed for `fortune` 2026-07-11 (added to both the `state` handler's rebuild and the `playerInfo` handler's assignment) preventively, before it was ever reported — any new per-player stat needs the same treatment. |
| Two "Attack Damage" rows on one item look like a bug | Not a bug if one is flat and one is scaling — `allowFlatAndScalingPair` defaults to `true` intentionally, so e.g. `attackDamageFlat` + `attackDamageScaling` rolling together is expected. Only exact duplicate attribute ids (same `attributeId` twice) are prevented by default. |
| Rarity weights don't sum to 100 | Intentional (99.5 total, see the roll table above) — `rollItemRarity()` normalizes by the actual sum, not a hardcoded 100. Don't add a filler/unused rarity to make the math round out. |
| `ui.js`'s `resolveBaseItemId`/`isRolledInstance`/rarity-color logic drifts from the server's | These exist in two places (`item-generator.js` server-side, `ui.js` client-side) with no shared module — there's no compile-time guarantee they stay in sync. If the instance shape ever changes, grep both files. |

## See also

- `editing-server.md` — "Item drops" and "Item drop pickup/hover range" rows.
- `editing-client.md` — "Item drops" and "Item drop hover tooltip" rows.
- `server/test-item-generator.js` — run this after any balance change.
