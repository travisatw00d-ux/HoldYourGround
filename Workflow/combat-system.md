# Combat System

## Attack Styles

Toggled via Space bar (stored as `state.attackStyle`). Each style has its own recovery cooldown:

| Style | Mechanics |
|---|---|
| **Jab** | Quick forward thrust, no mirroring, short recovery |
| **Swing** | Wide arc, mirror at combo step ≥2, 360° spin at combo4, longer recovery per step |

## Combo Chain

Attacks fire in sequence: combo1 → combo2 → combo3 → combo4 (spin). `comboChainWindow` flag from server keeps the combo alive while the player clicks. Server sends `attackStart` with `comboStep` and `lockedAngle`. Client `playReturnAnim()` fires on `comboWindowEnd`.

## Blade Hitbox (`getBladeSegment`)

Calculates world-space tip/hilt coordinates each frame from player position, weapon visual offset/rotation, and blade constants (`BLADE_TIP_X/Y`, `BLADE_HILT_X/Y`, `BLADE_W`). Knight and classic use separate constant sets (e.g. `KNIGHT_BLADE_TIP_X`).

Server runs hitbox checks in `sword.js` — ray-vs-circle against zombie positions. Client uses the same segment for debug overlay.

## Damage & Stats

Each player has `attackDmg`, `attackSpeed`, `speed` from server `playerInfo`. Base stats in `game-data.js` (`BASE_STATS`). Items modify stats (e.g. `wooden_sword: { attackDmg: 5, attackSpeed: -200 }`).

## Energy & Recovery

Players have `energy`/`maxEnergy` (bar in HUD). Attacks consume energy. Recovery cooldowns scale per combo step and style. Server controls all energy/recovery logic.

## Sword Mirroring

Swing combo steps ≥ 2 mirror the sword sprite horizontally (`ctx.scale(-1, 1)`). This visually represents switching grip for the returning arc. Controlled by `state._mirrorSword`.

## Combo Cap Enforcement (2026-07-14)

`comboStep` must never exceed its style's cap (jab=3, swing=4; unarmed wraps 1↔2 with no cap). Two coordinated checks enforce this — both are required, neither alone is sufficient:

- `sword.js` (`checkSwordHit`): `comboChainWindow` is forced `false` once `comboStep >= maxCombo`, so the window never reopens during the combo's own final step.
- `combat-system.js` (`processCombatTick`'s chain-trigger loop): hard-rejects executing any scheduled chain step `> maxCombo` regardless of which upstream path scheduled it.

Root cause (found via an offline simulation harness): without these, spam-clicking could drive `comboStep` past its cap indefinitely under certain click-timing patterns, aborting each runaway step after only a few ticks. This produced three symptoms together: inconsistent swing damage, an apparent "stuck at step 3" state, and jab occasionally chaining into a step-4 spin despite jab's cap being 3. See editing-server.md's task-map/gotchas for full detail.

## Triple-Jab Hitbox Sampling (2026-07-14)

`checkSwordHit` uses the same sub-frame sweep for jab_combo3 as every other attack (a same-day single-sample-only experiment was reverted after it was found to structurally whiff thrust 2 of the triple jab at every tested range — see editing-server.md's task-map row for the full history). The forward-only segment filter still restricts damage to the outbound half of each poke; the sweep just ensures a fast poke can't skip past its own peak extension between tick boundaries.

## Missed Combo-Continuation Window Lockout (2026-07-14)

`processCombatTick`'s cooldown-expiry loop used to impose an unexplained, undocumented flat `Math.round(1000 / TICK_MS)` (exactly 1 second) attackCooldown whenever a combo-continuation window closed WITHOUT a click having arrived to schedule the next step — applied regardless of comboStep, and during that second EVERY click (including a brand new, unrelated attack) was silently swallowed. This was the actual "stuck, can't do the final combo, forced back to idle" bug, and it also explains "swing step 1 doesn't deal damage" as the same bug: rapid re-clicks during the frozen second do nothing server-side at all, which looks identical to a whiffed swing. Fixed by using normal style/step recovery scaled by `p.attackSpeed` when no continuation was scheduled, and — when one WAS scheduled (a click landed inside the window) — bridging forward to exactly 1 tick past the scheduled continuation instead of a flat second, so the already-scheduled step still fires correctly. The no-continuation path emits `comboWindowEnd` when the window closes, but withholds `comboReady` until the recovery cooldown expires, so single attacks still have downtime and attack-speed gear matters. Server-side `isMidCombo()` stays true through that recovery tail for weapon/equipment mutation guards, but `toggleAttackStyle` uses the narrower `isAttackStyleLocked()` helper so players can swap jab/swing during recovery once no attack/chain is still live. Swing recovery is deliberately longer than jab recovery (`SWING_RECOVERY_BASE_TICKS` > `JAB_RECOVERY_BASE_TICKS`).

## Triple-Jab Live-Aim Tracking (2026-07-14, widened same day)

jab_combo3's 3-poke flourish locks its aim once at the start and holds it frozen by default (`p.facingAngle` doesn't update from the mouse while `p.attacking`, see room.js's `handleInput`). `checkSwordHit` overrides this for jab_combo3 specifically: every tick, `p.attackLockedAngle` is simply set to the player's live `p._lastMouseAngle` (which — unlike `facingAngle` — does keep updating mid-attack). A first pass used a small ~20°-per-poke clamped correction instead of full tracking, which fixed a stationary-target mismatch but still broke down under active rotation ("twisting") as low as 30°/sec — jab is a fast, low-commitment poke, not a big committed swing, so there's no real exploit concern in just letting it fully follow the mouse. Verified via simulation up to 360°/sec against an accurately-tracked target — no misses at any tested rate.

## Triple-Jab Knockback Suppression (2026-07-14)

Even with the live-aim fix above, poke 3 still missed reliably — the actual remaining cause: `checkSwordHit`'s hit-application code applies knockback (pushes the target radially away from the player) on EVERY landed hit, unconditionally, including mid-flourish. For a target that isn't dead-center (the normal case — zombies surround the player from every angle), two compounding radial knockbacks (poke 1, then poke 2) reliably ejected the target sideways out of poke 3's narrow fixed-angle capsule, regardless of aim correction. Fixed by suppressing knockback on pokes 1 and 2 of jab_combo3 specifically — poke 3 (the actual finishing blow) still knocks back normally. Verified via an exhaustive simulation sweep (distance × angle × lunge, 4182 configurations): the fix brought "poke 1 & 2 land, poke 3 misses" from hundreds of failing configurations down to zero.
