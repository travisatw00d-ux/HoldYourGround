# Redesign Implementation Plan

Companion to `GameDirection.md`. This maps the vision onto the current codebase and breaks it into small, independently-testable steps. Nothing here should be built all at once — each phase should be committed and verified before starting the next.

## Good news: the core loop already exists

`server/phase-manager.js` already runs `daytime → nighttime → intermission(results) → daytime`, which is almost exactly Day / Night / Results. We are not building a new phase system — we're changing what happens *inside* each phase and how night ends. Specifically:

| Vision concept | Current equivalent | Gap |
|---|---|---|
| Day phase (prep, safe) | `daytime`, 20s timer | Already safe/timer-based, fine as-is for v1 |
| Night phase (combat) | `nighttime`, no timer, ends on all-dead | Needs "return to base" as an additional end condition |
| Results phase | `intermission`/`ended`, ~10-30s | Already shows level/kills; needs more stats |
| Server Level | `room.waveServerLevel` = sum of player levels | Already matches the vision almost exactly, keep as-is |
| Night Threat | **Does not exist** — same scalar used for both | New: a second scalar that ramps during a single night |
| Portals | **Does not exist** — all spawns are ad-hoc random/edge | New: fixed spawn-point entities with HP |
| Base | **Does not exist** — only the master chest fixed point | New: safe-zone + HP entity, can reuse chest's proximity-check pattern |

Because so much of the skeleton is already there, the risk isn't "does the phase loop work" — it's "don't break combat/loot/inventory/networking while adding four new concepts (base, portals, night threat, extended stats) on top of it."

## Guiding rules for every phase below

- Each phase ships behind a config constant that can be flipped off if something breaks (e.g. `ENABLE_PORTALS`), at least until it's proven stable.
- Each phase is `node -c server/*.js` + a manual playtest before moving to the next.
- Don't touch `sword.js`/`combat-system.js` combat math, `player.js` inventory/equipment, or the networking/binary-protocol layer except to add new fields — those systems work today and are explicitly called out in `GameDirection.md` as things to preserve.
- New systems get their own files (`server/base.js`, `server/portal.js`) rather than being crammed into `room.js`, following the existing pattern of `zombie-ai.js`/`zombie.js` as separate modules from `room.js`.

---

## Phase 1 — Base entity (foundation, no visible gameplay change yet)

**Goal:** introduce a Base as a real server-side entity before anything depends on it.

- `server/config.js`: add `BASE_X`/`BASE_Y` (can literally reuse `MASTER_CHEST_X/Y` — center of map — so the chest sits inside the base) and `BASE_SAFE_RADIUS`.
- New `server/base.js`: `room.base = { hp, maxHp, x, y }`, `isInBase(p)` (same squared-distance check as `room._nearMasterChest`), `damageBase(amount)`.
- `room.js`: initialize `room.base` in `startMatch`, expose `base` in the state broadcast (same way `zombies`/`players` already go out) so the client *could* draw it, but no client HP bar yet.
- No zombies target the base yet. No night-end logic changes yet. This phase only proves the entity exists and syncs correctly.

**Verify:** base HP field visible in client console via existing state-inspection tooling (J key debug HUD), stays at maxHp all match.

## Phase 2 — Return-to-base ends the night

**Goal:** implement the actual design change to night-ending (currently only "everyone dead" ends it).

- `phase-manager.js`'s `_advancePhase` nighttime case: add a check — all alive, non-spectator players within `isInBase()` — alongside the existing `anyAlive` check. Either condition transitions to `intermission`.
- Add a minimum-time-outside guard (e.g. can't end the night in the first 15s) so a group can't trivially reset it, and a soft client-side "prompt" once the whole team is back near base (a toast, not automatic) if we want it to feel deliberate rather than instant — decide during playtesting, easy to add after.
- This is a pure logic change; no new entities. Low risk, test heavily since it changes match flow.

**Verify:** manually walk all players back to the map center mid-fight, confirm intermission triggers; confirm all-dead still works as fallback.

## Phase 3 — Night Threat scalar

**Goal:** separate "how strong is a zombie" (server level, keep as-is) from "how intense is *this* night" (new).

- `room.js`: add `room.nightThreat`, reset to a base value (e.g. 1) at `daytime → nighttime` transition, incremented on a timer while `matchPhase === 'nighttime'` (e.g. +1 every 30s, tune later).
- Wire it into exactly one thing first: `zombieAi.ensureCount`'s `maxAlive` argument (currently `room._nightMaxPop`, a flat formula off server level only) — make the population cap scale with `nightThreat` too. Leave mob *stats* (health/damage, from `getMobStats`) driven by server level only, per the design doc's split.
- Send `nightThreat` in the existing `matchPhase`/tick broadcast so the client can show a simple number/meter later (Phase 6).

**Verify:** during a long night, alive-zombie cap visibly climbs over time even with server level constant; a short night stays calm.

## Phase 4 — Portals (the biggest piece, build in two steps)

**Step 4a — portals as static, destroyable landmarks (no spawning yet)**

- New `server/portal.js`: portal entity `{ id, x, y, hp, maxHp, type: 'zombie' }`. `spawnPortalsForNight(room)` picks 2-4 positions (reuse the existing `randomZombieSpawn`-style rejection sampling: away from base, away from players, min-distance from each other) at `daytime → nighttime` transition.
- Extend hit-detection so portals are a valid target: `sword.js`'s `checkSwordHit` currently loops zombies; add a parallel (or merged) loop over `room.portals` using the same capsule-vs-circle test, since portals don't move (much simpler than zombie hit-testing — no velocity/prediction needed).
- Destroying a portal (`hp <= 0`) removes it from `room.portals`, broadcasts an event, awards the team a reward (gold/exp — reuse the existing gold-drop/currency path).
- No change yet to where zombies actually come from — this step is purely "can portals exist, be seen, be destroyed."

**Step 4b — portals as the primary spawn source**

- `zombieAi.ensureCount` (or a new `ensureCountFromPortals`) sources new-zombie positions from `room.portals` (near an active portal) instead of pure `randomZombieSpawn`, for the majority of spawns.
- Keep a reduced-rate `randomZombieSpawn`/`randomEdgeSpawn` call running alongside for ambient spawns, per the design doc ("most from portals, some ambient so the map's never fully safe").
- A portal with zero remaining "ammo" or past some production cap can go dormant/stop contributing, independent of being destroyed — optional refinement, not required for v1.

**Verify:** kill-all-portals mid-night and confirm spawn rate visibly drops to ambient-only; confirm at least one portal always exists early in a night so players have a first objective.

## Phase 5 — Base under light pressure

**Goal:** make staying in base indefinitely mildly costly, per the design doc ("not a tower-defense game," so keep this simple).

- Simplest version: zombies that wander within some radius of the base and get no closer player target periodically hit `damageBase()` — reuse the existing zombie-attack-cooldown pattern from `processZombieAttacks` (zombie-ai.js), just retargeted at `room.base` instead of a player when a zombie is base-adjacent and no player is closer.
- Base `hp <= 0` → new failure condition, routes into the same `_endMatch` path as all-players-dead.
- Keep this tunable and probably weak at first (base regens slowly during day) — this is the easiest piece to over-tune and make miserable, so ship it conservatively and adjust from playtesting.

**Verify:** leave the base fully undefended for a long night, confirm it eventually takes damage but not so fast it's unfair; confirm defeating/ignoring it still lets players win by other means (portals/retreat).

## Phase 6 — Results panel + client UI

**Goal:** surface everything above to players.

- `room.js`: track per-night stats already partially there (`p.kills`) plus new counters — `p.damageDealtNight`, `p.goldCollectedNight`, `room.portalsDestroyedNight`, `room.peakNightThreat`, night start/end timestamps. Reset at `daytime → nighttime`. This is additive to `_getSortedPlayerStats`/the `matchEnd`/intermission payload, not a replacement.
- Client `render-ui.js`'s `renderResults()`: extend the existing rows rather than rebuilding the panel — add columns/sections for the new stats, matching the design doc's list (kills, team kills, damage, portals destroyed, gold, peak threat, night duration).
- Add a base HP bar and simple portal markers to the HUD/minimap (`hud.js`), and a night-threat indicator near the existing phase timer. Cosmetic/UI-only, safe to iterate on repeatedly without touching server logic.

**Verify:** play a full night, confirm results panel shows real numbers matching what happened (spot-check kill count, gold, portals).

## Phase 7 — Balance pass

Not code architecture — tuning constants (threat ramp rate, portal count/HP, base damage rate, spawn split between portals/ambient) based on actual playtests. Everything above should already be built with these as named constants in `config.js` specifically so this phase doesn't require touching logic.

---

## What's deliberately deferred (per GameDirection.md's own scope guidance)

- Multiple portal types (necromancer/demon/spider/elite/boss) — zombie portals only for v1.
- Base building/upgrade trees beyond maybe one or two simple upgrades — full "base upgrade shop" is a later pass once the core loop is fun.
- Player revival system — the doc explicitly says this can be decided later; today's respawn-at-next-day-phase behavior is a reasonable placeholder and doesn't block anything above.
- Optional/secondary night objectives beyond "destroy portals" — the stats panel is built to extend (per the doc: "system should be structured so more statistics can be added later"), so this can slot in without rework.

## Suggested build order recap

1. Base entity (inert)
2. Return-to-base night-end condition
3. Night Threat scalar → spawn cap only
4. Portals: destroyable landmarks, then primary spawn source
5. Base takes light pressure + becomes a failure condition
6. Results panel + HUD surfacing
7. Balance pass

Each step is independently shippable and testable, and none of them require touching combat, inventory, equipment, or networking internals — only additive fields and new modules alongside the existing ones.
