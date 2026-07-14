# Item Generation System

How rolled item instances (rarity + attributes + guaranteed stacking) get
created, stored, and displayed. Added 2026-07-11 alongside the ring/necklace
zombie-drop feature; extended 2026-07-12 with guaranteed stacked attributes
and dynamic item names, and again 2026-07-12 with the Luck stat's
rarity-odds boost (see "Luck: boosting rarity odds" below). Read this before
touching rarity odds, attribute pools, value ranges, stack rules, or
anything that reads/writes a rolled item instance object.

## Two kinds of "item" in this codebase

Every slot that can hold an item — bag slots (`p.inventorySlots[i]`),
equip slots (`p.equipment[slot]`, `p.currentItem`), and world drops
(`room.itemDrops[id].item`) — can hold **either**:

- a bare string, e.g. `'wooden_sword'` — a starter/legacy item. Never rolls
  attributes; its bonuses come entirely from `ITEMS[id].stats` (a static
  object in `shared/data.js`/`game-data.js`).
- a **rolled instance**: see "Instance shape" below. Only zombie drops
  produce these today (via `item-drops.js:rollDropInstance()`), but nothing
  in the pipeline assumes drops are the only source — any code path that
  calls `generateItemInstance()` gets one.

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

| Rarity | Weight | Attributes | Color | Luck-Boosted |
|---|---|---|---|---|
| Common | 50 | 1 | `#ffffff` | no |
| Uncommon | 30 | 2 | `#22c55e` | no |
| Rare | 10 | 3 | `#3b82f6` | yes |
| Epic | 5 | 4 | `#a855f7` | yes |
| Legendary | 3 | 5 | `#f97316` | yes |
| Mythic | 1 | 6 | `#ef4444` | yes |
| Ungodly | 0.5 | 7 | `#ffd700` | yes |

Weights sum to 99.5, not 100 — **this is intentional, not a bug**. There's no
synthetic fallback rarity soaking up the missing 0.5%. `rollItemRarity(rng, luck)`
normalizes by dividing by the actual sum of all weights
(`roll = rng() * totalWeight`, then walks the list subtracting each weight
until `roll` lands inside one), so the relative odds are always correct
regardless of whether the weights happen to add to 100. Bumping any weight,
or adding a new rarity, needs no other math to change. `luckBoosted` (new
2026-07-12) marks which rarities the killer's Luck stat scales up — see the
next section.

## Luck: boosting rarity odds

Added 2026-07-12, per design direction from Travis: Fortune and Luck are two
separate stats (`fortune`/`luck` on `BASE_STATS`, `fortuneFlat`/
`fortuneScaling`/`luckFlat`/`luckScaling` on `ITEM_ATTRIBUTES`). **Fortune**
is reserved for a future gold-drop % multiplier — deliberately NOT
implemented yet, since there's no gold-drop mechanic in the game to multiply
until that feature exists. Only the stat plumbing (data model, stat
calculation, display) exists for Fortune today; it has zero gameplay effect.
**Luck** raises the odds of rolling a higher item rarity, and IS fully wired
up: the killing player's current `luck` stat (read live off
`room.players[playerId].luck` at the moment of the kill, never cached/
snapshotted) flows through `item-drops.js:rollDropInstance(rng, luck)` →
`item-generator.js:generateItemInstance(baseItemId, itemTier, rng, luck)` →
`rollItemRarity(rng, luck)`.

`getLuckAdjustedRarities(luck)` (`server/item-generator.js`, server-only —
the client never rolls, so it never needs this) is the actual mechanism:

- At `luck <= 0` it returns `ITEM_RARITIES` completely unchanged (no
  allocation, no-op fast path — this is what every drop rolls against by
  default with no Luck equipped).
- Otherwise it scales every `luckBoosted: true` rarity's weight up by
  `(1 + luckFactor)` where `luckFactor = luck / 100` — so Luck=100 exactly
  doubles Rare/Epic/Legendary/Mythic/Ungodly's weight — and shrinks the
  `luckBoosted: false` rarities (Common/Uncommon) proportionally so the
  **total weight across the whole table never changes**.
- That total-weight invariance is the whole trick: `rollItemRarity()`
  normalizes by total weight, so if boosted weights merely got multiplied
  without touching Common/Uncommon, the bigger denominator would cancel the
  effect out completely and change nothing. Shrinking Common/Uncommon by
  exactly the amount added to the boosted rarities is what makes each
  boosted rarity's actual probability *share* genuinely multiply by the same
  factor as its weight (e.g. Ungodly's ~0.5/99.5 ≈ 0.503% base share
  becomes ~1% at Luck=100).
- `effectiveLuckFactor` is clamped to
  `Math.min(luckFactor, unboostedTotal / boostedTotal)` (≈4.1026 with the
  current weight table) so Common/Uncommon's combined weight can never go
  negative. Past that clamp point (an extremely high Luck value, far beyond
  anything reachable through normal gear) additional Luck has no further
  effect — a safe plateau, not a crash. The boosted rarities' weights
  relative to EACH OTHER (e.g. Rare:Epic staying 2:1) never change at any
  Luck level; only how much of Common/Uncommon's combined share they've
  collectively absorbed does.

Luck only affects **which rarity** gets picked — it has no effect on which
base item drops (the separate 50% `DROP_CHANCE` roll in `item-drops.js`),
which attributes get selected, or what values they roll.

## Health Regen and Speed (2026-07-12)

Two more rollable attribute pairs, added alongside Fortune/Luck/etc. — same
flat+scaling shape as every other stat in `ITEM_ATTRIBUTES`, nothing new
structurally.

- **Health Regen** (`healthRegenFlat`/`healthRegenScaling`, `stat:
  'healthRegen'`) is a brand-new stat with a 0 baseline — it didn't exist
  anywhere in the game before this. `player.js`'s `recalcStats()` computes
  `p.healthRegen` the same way as Defense/Fortune/Luck, but unlike Defense/
  Fortune it's **actually applied**, not just tracked/displayed:
  `room.js`'s `gameTick()` adds `p.healthRegen * (TICK_MS / 1000)` to
  `p.health` every tick for every alive, non-spectator player, capped at
  `p.maxHealth`. It's always-on regardless of day/night phase or recent
  damage taken — a deliberate simplest-first choice (no "out of combat
  only" gating), not an oversight; revisit if that ever feels too strong
  once players can stack multiple Health Regen rolls.
- **Speed** (`speedFlat`/`speedScaling`, `stat: 'speed'`) needed **zero**
  new server code — `speed` was already a fully-live stat (`BASE_SPEED`,
  physics movement, spendable stat points), and `recalcStats()` already
  summed `equippedStatTotal(p, 'speed')` into `p.speed` before these
  attributes existed. Adding the two `ITEM_ATTRIBUTES` pool entries is the
  entire feature. This is NOT `attackSpeed` (attack cooldown) — it's plain
  movement speed, and like every other source of speed (base + invested
  stat points), the final total still gets clamped to the current build's
  `speedCap` (16 for all three builds) in `recalcStats()`.

## Instance shape

```js
{
  instanceId: 'unique-item-id',
  baseItemId: 't1_ring',
  baseName: 'T1 Ring',              // plain ITEMS[baseItemId].name, stored so
                                     // the client never has to look it up
  generatedName: 'T1 Ring of Greater Attack Damage', // baseName unless a
                                     // stack applies — see naming below
  itemTier: 1,
  rarityId: 'rare',
  stackData: {                      // null for Common/Uncommon (no stack)
    attributeId: 'attackDamageFlat',
    stackSize: 2,
    nameModifier: 'greater'
  },
  attributes: [
    { attributeId: 'attackDamageFlat', value: 3, stackIndex: 1 },
    { attributeId: 'attackDamageFlat', value: 4, stackIndex: 2 },
    { attributeId: 'maxHealthFlat', value: 12, stackIndex: null }
  ]
}
```

`stackIndex` is `1..stackSize` for copies belonging to the guaranteed stack,
`null` for every other (non-stacked) attribute. Nothing merges the stacked
copies into one entry — each is stored and displayed as its own row, exactly
as rolled.

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
5. `generateItemAttributes({ rarityId, attributePool, itemTier, rng })` —
   builds the full `attributes` array: the guaranteed stack first (if this
   rarity requires one — see below), then fills the remaining slots with
   other eligible, non-duplicate attributes. Returns
   `{ attributes, stackedAttribute, stackSize }`.
6. `generateItemName({ baseName, rarityId, stackedAttribute })` — builds
   `generatedName` from the stacked attribute's `itemNameText`, or returns
   `baseName` unchanged if there's no stack.
7. Package into the instance shape above and return it. `instanceId` comes
   from `crypto.randomUUID()` (falls back to a timestamp+random string if
   unavailable) — this is what makes an instance "permanent": once
   generated it's never re-rolled or renamed, only ever
   read/serialized/deserialized as-is (see `db.js` gotcha below — there's no
   persistence yet, but if/when there is, the instance object round-trips
   through `JSON.stringify`/`parse` untouched).

Every one of these functions takes an injectable `rng` parameter, defaulting
to `Math.random`. This is purely for `server/test-item-generator.js` to force
deterministic outcomes — nothing in production code ever passes anything but
the default.

## Guaranteed stacked attributes (Rare and above)

Starting at Rare, every generated item **must** contain one intentionally
repeated attribute — this is a required feature of the rarity, not left to
random duplicate chance. Configured in `server/item-generator.js`'s
`RARITY_STACK_RULES` (server-only — the client never needs this table since
it only displays the already-resolved `generatedName`/`stackData` the
server sends):

| Rarity | Total Rolls | Stack Size | Naming Prefix |
|---|---|---|---|
| Common | 1 | none (1) | — |
| Uncommon | 2 | none (1) | — |
| Rare | 3 | 2 (double) | Greater |
| Epic | 4 | 2 (double) | Greater |
| Legendary | 5 | 2 (double) | Greater |
| Mythic | 6 | 3 (triple) | Superior |
| Ungodly | 7 | 3 (triple) | Superior |

`stackSize: 1` means "no duplicate stack, one normal occurrence" — Common
and Uncommon skip the stacking branch entirely in
`generateItemAttributes()` and behave exactly like before this feature
existed (plain `selectRandomAttributes()` over the full pool).

For Rare+, `generateItemAttributes()`:

1. Picks ONE attribute via `selectRandomAttribute(pool, rng)` — the
   guaranteed stacked attribute.
2. Rolls it `stackSize` times, each via its own `rollAttributeValue()` call
   (`ATTRIBUTE_STACK_SETTINGS.rollEachStackValueIndependently`, default
   `true` — each stacked copy gets its own independent roll, never the same
   value repeated or the rolls combined into one stored total).
3. Excludes that exact attribute id from the pool used for the remaining
   slots (`remainingPool = attributePool.filter(a => a.id !== stackedAttribute.id)`)
   — this is what structurally guarantees a double stack can never
   accidentally become a triple, and that no second duplicate group can
   form alongside the intentional one (both explicitly called out as
   invalid in the spec: a Rare with 3x the same attribute, or a Mythic with
   its triple stack PLUS an unrelated pair).
4. Fills the remaining slots (`rarity.attributeCount - stackSize`) via the
   existing `selectRandomAttributes()` — same non-duplicate rule as before,
   still allows a flat+scaling pair among the non-stacked slots.

The stack **consumes** normal attribute slots, it is never a bonus on top of
the rarity's `attributeCount` — Rare's 3 total slots are 2 (stack) + 1
(remaining), Mythic's 6 are 3 (stack) + 3 (remaining), etc.

Exact-type matching: the repeated rolls must use the exact same attribute
definition. `attackDamageFlat` stacked twice is valid; `attackDamageFlat` +
`attackDamageScaling` is NOT a stack (they're separate attribute ids, even
though they share the same `stat`) — every copy in the loop uses
`stackedAttribute.id`, so this is structurally guaranteed, not just
convention.

`ATTRIBUTE_STACK_SETTINGS` (also server-only, in `item-generator.js`) holds
the behavior toggles: `requireStackAtRareAndAbove` (master on/off switch —
false disables the whole stacking system, reverting every rarity to the old
plain-selection behavior), `allowOnlyOneStackedAttributeGroup` (always true
today — the design only ever calls `selectRandomAttribute()` once per item,
so this is structurally enforced rather than actively checked),
`allowAdditionalDuplicates` (false — governs the *remaining* slots' duplicate
rule, same meaning as `ATTRIBUTE_SELECTION_RULES.allowExactDuplicateAttributes`
did before this feature), and `rollEachStackValueIndependently` (true — set
false to have all copies in a stack share one rolled value instead of
rolling separately, though nothing exercises that today).

## Item naming

`generateItemName({ baseName, rarityId, stackedAttribute })`: if there's no
stacked attribute (Common/Uncommon, or the degenerate empty-pool fallback
below) or the rarity's `namingPrefix` is null, returns `baseName` unchanged.
Otherwise returns `` `${baseName} of ${namingPrefix} ${stackedAttribute.itemNameText}` ``
— e.g. `"Basic Ring of Greater Attack Damage"` (Rare/Epic/Legendary,
"Greater") or `"Basic Ring of Superior Armor"` (Mythic/Ungodly, "Superior").

`itemNameText` is a dedicated field on every `ITEM_ATTRIBUTES` entry
(mirrored in both `shared/data.js` and `game-data.js`), deliberately separate
from `displayName`: `displayName` is the bare stat name used in tooltip
attribute rows (gets a dynamic "Scaling " prefix at display time — see
`formatItemAttribute()`), while `itemNameText` is baked directly into the
generated name string and already includes "Scaling " for scaling attributes
(e.g. `attackDamageScaling.itemNameText === 'Scaling Attack Damage'`) since
there's no further transformation applied to it.

The generated name is computed once, server-side, at drop time, and stored
on the instance permanently — it does not change on equip/unequip/save/load,
same as every other field on a rolled instance.

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

`getLuckAdjustedRarities(luck)` (weight-redistribution table used by
`rollItemRarity` — see "Luck: boosting rarity odds" above),
`rollItemRarity(rng, luck)`, `getRarityDef(rarityId)`,
`getAttributePoolForItem(item, itemTier)`,
`selectRandomAttribute(pool, rng)` (picks the ONE guaranteed stacked
attribute), `selectRandomAttributes(pool, count, rules, rng)` (fills the
remaining, non-stacked slots), `rollAttributeValue(attributeDefinition, itemTier, rng)`,
`generateItemAttributes({ rarityId, attributePool, itemTier, rng })`,
`generateItemName({ baseName, rarityId, stackedAttribute })`,
`generateItemInstance(baseItemId, itemTier, rng, luck)`,
`resolveBaseItemId(itemOrInstance)`, `isRolledInstance(itemOrInstance)`,
`calculateItemStatBonuses(itemOrInstance, playerState)`,
`formatItemAttribute(attribute)` (server-side formatter used nowhere yet —
`ui.js` has its own client-side `formatItemAttribute()` for the tooltip,
kept separate since it needs to call `formatStatValue()` for the
attack-speed special case, which is a client-only concept — neither one
needs stackIndex-specific logic since each stacked copy is just its own
array entry, rendered as its own row automatically).

## Validation tests

`server/test-item-generator.js` — plain Node script (`node
server/test-item-generator.js`), no test framework in this repo. Covers, in
addition to everything from the original (non-stacking) system: exact
attribute count per rarity, that Rare/Epic/Legendary always contain exactly
one double-stacked attribute (never a triple, never a missing stack) and
Mythic/Ungodly always contain exactly one triple-stacked attribute (never an
extra duplicate group alongside it), that flat and scaling versions are
never mixed within one stack, that every stacked copy's value is rolled
independently (statistical check across 100 generated Mythic items — not
hardcoded to the same number), that generated names use "of Greater"
(Rare/Epic/Legendary) or "of Superior" (Mythic/Ungodly) with the stacked
attribute's exact `itemNameText`, that Common/Uncommon names are never
modified, that small/empty attribute pools degrade safely (cap instead of
loop/throw, with a `console.warn`), that JSON round-trip preserves
`generatedName`/`stackData`/`baseName`, and that two generator calls seeded
with the identical `mulberry32` PRNG produce byte-identical instances (minus
`instanceId`). Also covers Luck: `getLuckAdjustedRarities(0)` is a no-op
identical to the base table, total weight is conserved across a range of
Luck values (1 through 100,000), every `luckBoosted` rarity's weight is
exactly double its base at Luck=100, Common/Uncommon weight shrinks but
never goes negative even at extreme Luck, boosted rarities keep the same
weight ratio relative to each other at every Luck level, a 100,000-roll
simulation confirms Rare/Ungodly's real hit-rate roughly doubles at
Luck=100 vs. Luck=0, and `generateItemInstance`'s `luck` parameter actually
reaches the rarity roll end-to-end (a fixed rng() fraction lands in a
different rarity bucket at Luck=100 than at Luck=0, since the bucket
boundaries shift while the raw roll value doesn't). Run it after touching
any of `ITEM_RARITIES`/`ITEM_ATTRIBUTES`/`RARITY_STACK_RULES`/
`item-generator.js`.

## Adding things later

- **New attribute**: add an entry to `ITEM_ATTRIBUTES` in **both**
  `shared/data.js` and `game-data.js` (hand-mirrored, same rule as every
  other shared constant in this project) with a `ranges` entry for every
  tier it should be rollable on, plus an `itemNameText` (used only if this
  attribute ever gets picked as the stacked one). No code changes needed —
  the generator reads the pool data-driven.
- **New rarity**: add an entry to `ITEM_RARITIES` (both files) AND a
  matching entry to `RARITY_STACK_RULES` (server-only, in
  `item-generator.js`) — `{ stackSize: 1, namingPrefix: null }` for no
  stack, or `{ stackSize: 2|3, namingPrefix: 'Greater'|'Superior'|... }` for
  a guaranteed stack. Weights don't need to sum to anything in particular.
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
| An item shows its plain base name instead of "of Greater/Superior [Attribute]" | Only Rare+ items get a modified `generatedName` — Common/Uncommon are supposed to keep the base name unchanged (`stackData` is `null` for them). If a Rare+ item is showing the base name, check `instance.stackData` — `null` there means either `ATTRIBUTE_STACK_SETTINGS.requireStackAtRareAndAbove` is off, or the eligible attribute pool was empty at generation time (see the next gotcha) and it degraded to an unstacked roll. |
| A Rare+ item generated with fewer attributes than its rarity normally gets, or with no stack at all | Only happens if `getAttributePoolForItem()` returned too few (or zero) eligible attributes for that item/tier combination — `generateItemAttributes()` logs a `console.warn` and caps/degrades rather than looping or throwing (see "Edge-case handling" in the original spec). Tier 1's 20-attribute pool (as of 2026-07-12) is never actually this small for rings/necklaces today; this only matters if a future item category's `categories` filter narrows the pool a lot, or a new tier is added without giving most attributes a range for it. Check the server console for the warning if this ever shows up in play. |
| Two Attack Damage rows with different values look like a display bug | This is the guaranteed-stack feature working as intended at Rare+ — e.g. `+3 Attack Damage` / `+4 Attack Damage` on the same ring is a valid double stack, each copy rolled independently (never combined into one number). Only exactly one attribute type is allowed to repeat per item (`allowOnlyOneStackedAttributeGroup`); if you see a THIRD row of the same attribute on a Rare/Epic/Legendary item, or two different attributes each duplicated on the same item, that's the actual bug to chase — check `generateItemAttributes()`'s remaining-pool filtering. |
| Fortune stat shows on gear/tooltips but does nothing in-game | Intentional as of 2026-07-12 — Fortune is reserved for a future gold-drop % multiplier that hasn't been built yet (no gold-drop mechanic exists to multiply). Only Luck currently has a gameplay effect (rarity odds). Don't wire Fortune into anything until gold drops exist as a feature — that's a deliberate sequencing decision, not an oversight. |
| Luck seems to have no effect on drop rarity | Check three things in order: (1) is the killer's `p.luck` actually nonzero — `recalcStats()` in `player.js` must compute it via `equippedStatTotal(p, 'luck')`; (2) is `room.js`'s `'zombieKilled'` case reading `this.players[e.playerId].luck` fresh at kill time (not a stale/cached value) before calling `itemDrops.rollDropInstance(Math.random, killerLuck)`; (3) remember Luck is statistical, not deterministic — even at Luck=100, Ungodly only goes from ~0.5% to ~1% per drop, so seeing zero Ungodly drops in a short play session is expected, not a bug (see the "Fortune/Luck not seen in drops" false alarm from 2026-07-12 — a 20,000-item simulation confirmed fortune/luck attributes and rarity boosts were always working, just statistically rare). |
| `luck` (or any new field only sent via `playerInfo`) silently resets to 0 every ~55ms | Same class of bug as `fortune`/`equipment`/`inventorySlots` (see the `fortune` gotcha above and editing-client.md's gotcha table) — the binary `state` handler in `net-events.js` rebuilds `state.players[id]` from scratch every tick and only carries over fields explicitly copied from `state.playerMeta[id]`. Fixed for `luck` 2026-07-12 (added to both the `state` handler's rebuild and the `playerInfo` handler's assignment) alongside the rest of this feature. |
| Rolled `speedFlat`/`speedScaling` attribute seems to have no effect | Check whether the player is already at their build's `speedCap` (16 for all three builds today) — `recalcStats()` clamps the FINAL speed (base + equipment + invested points) to that cap, so equipment-granted speed only shows up if there's still headroom under it. This isn't a bug specific to the item system — it's the same cap spendable stat points already respect. |
| Health Regen doesn't seem to heal | Check, in order: (1) is `p.healthRegen` actually nonzero — `recalcStats()` computes it via `equippedStatTotal(p, 'healthRegen')`; (2) is the player already at `maxHealth` (regen is a no-op there, by design — nothing to display differently, health just doesn't visibly move); (3) remember it's continuous, not a burst — 1-3 HP/sec from a single flat roll is a slow, steady trickle over `BASE_HEALTH`'s 100, not an instant heal, so it can look like "nothing happened" over a short observation window. Unlike Defense/Fortune, this one IS actually applied every tick (see `room.js`'s `gameTick()`), not just tracked/displayed. |
| `healthRegen` (or any new field only sent via `playerInfo`) silently resets to 0 every ~55ms | Same recurring bug class as `fortune`/`luck`/`equipment`/`inventorySlots` — fixed preventively for `healthRegen` 2026-07-12 (added to both the `state` handler's rebuild and the `playerInfo` handler's assignment in `net-events.js`) alongside the rest of this feature, same as every stat before it. |

## See also

- `editing-server.md` — "Item drops" and "Item drop pickup/hover range" rows.
- `editing-client.md` — "Item drops" and "Item drop hover tooltip" rows.
- `server/test-item-generator.js` — run this after any balance change.
