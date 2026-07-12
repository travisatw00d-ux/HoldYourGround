# Animation System

## Core Interpolation (`anims.js`)

All animation uses a shared keyframe engine:

- **`interpKeyframes(data, segments, f)`** — walks segment list with continuous frame `f`, smoothstep-eases between keyframes
- **`lerpPosePolar(from, to, t)`** — blends offset/rotation in polar space so the weapon arcs naturally instead of cutting through the body
- **`shortAngleDelta(a, b)`** — wraps rotation to [-PI, PI] so blends never spin the long way

## Pose Blending for Remote Players

`_remoteAnimState` Map tracks each remote player's current attack animation independently:
- **Active** = playing forward, holding at `holdFrame` (combo window open)
- **Releasing** = playing back-half of clip (combo window closed mid-swing)
- **Returning** = polar blend to idle (350ms)

Local and remote use the same `interpKeyframes` + `lerpPosePolar` — they can never visually diverge.

## Attack Lifecycle

1. **`startAttackAnim(lockedAngle, comboStep)`** — sets `state.localAnim` with animation data and hold-frame logic
2. **Hold** — frame frozen at `_holdFrame` while waiting for combo continuation
3. **`playReturnAnim()`** — combo window expired: either releases the clip to play its back-half, or starts a 350ms polar idle transition
4. **`handleAnimNaturalEnd()`** — clip reached end: chains combo2→combo1 back-half for swing, or drops to idle

## Visual Effects

- **Movement bob** — sinusoidal x/y offset based on speed, smoothed for remote
- **Head lean** — `updateLean()` rotates head based on lateral velocity
- **Breath pulse** — subtle `sin(t)` scale oscillation
- **Idle sway** — low-frequency rotation + position oscillation per hand key
- **Sword mirror** — swing combo step ≥2 mirrors the sword sprite (left-hand grip)
- **Spin** — 360° rotation over 500ms on swing combo4

## Knight vs Classic

Knight visuals (lvl 10+) use `knight_sword`/`knight_hand` keyframe pairs and `KnightSheet.png`. Classic use per-item `ANIMATIONS` and `ITEM_VISUALS`.

## Unarmed (no weapon equipped)

When `p.currentItem` is empty, the knight punches instead of swinging a sword — a basic 2-hit combo (right hand, then left hand), added 2026-07-11. The key design decision: **it reuses the existing `knight_sword`/`knight_hand` keyframe slots** rather than adding a third slot to the animation pipeline, because the server's hit-detection (`combat-system.js`) and most of the client interpolation code (`getKnightInterpolatedVis`/`getKnightRemoteVis`) are hardcoded to read the `knight_sword` key as "whatever's in the primary/right hand." So:

- `KNIGHT_ANIMATIONS.unarmed_combo1`/`unarmed_combo2` (game-data.js/shared/data.js) still use `knight_sword`/`knight_hand` as their track names — on combo1 (right punch) the *big* forward motion lives under `knight_sword` and a small guard shift under `knight_hand`; on combo2 (left punch) it's reversed.
- `server/combat-system.js`'s `_executeAttack` picks which track is authoritative for damage via `activeHandKey` — `knight_sword` on step 1, `knight_hand` on step 2. Everything else in `sword.js`'s hit-detection is untouched; it just consumes whichever track `p.attackAnim` points to.
- `render-entity.js`'s `drawKnightRightHand()` draws `T1KnightRightHand.png` but pulls its animated position from the **`knight_sword`** interpolation functions, exactly like `drawKnightSword()` does — only the sprite differs. `drawKnightHand()` (left fist) is completely unchanged.
- The one place this reuse gets tricky: `knight_sword`'s **idle** target (used by `playReturnAnim()`, `startIdleTransition()`, `getKnightRemoteVis`'s "returning" phase, and `getKnightIdleVis`'s transition blend) must resolve to `KNIGHT_VISUALS[style].knight_right_hand` when unarmed, not `.knight_sword` — otherwise the fist blends toward the sword's idle spot and pops to the real one once the 350ms transition ends. Search for `swordTargetKey`/`isPrimarySlot`/`idleKey` in `anims.js` for the four places this redirect happens.
- `maxCombo` is 2 for unarmed (vs 3 for jab, 4 for swing) — set in three places server-side (`handleAttack`, `_executeAttack`'s comboKey, `processCombatTick`'s combo-end check) via an `isUnarmed = p.playerClass === 'knight' && !p.currentItem` check, and client-side in `startAttackAnim`/`getKnightRemoteVis` via the same pattern (`animStyle = isUnarmed ? 'unarmed' : style`). The player's jab/swing toggle (`state.attackStyle`) keeps governing *idle stance* while unarmed (which idle offsets to use) but never affects which combo plays — it's always the same 2-hit punch.
- `sword.js` forces `isSwing = false` when unarmed so the swing-only damage multiplier (0.7x) and wider hit-detection margin don't leak into punches regardless of the player's jab/swing toggle.
- Known limitation: the debug hitbox line (J key) always visualizes the `knight_sword` slot, so during an unarmed combo's second hit (left hand active) it doesn't move to match — visual-debug-only, doesn't affect actual damage.
- The punch reach/guard keyframe values are a first-pass approximation (no visual feedback when authoring them) — expect to retune by hand-editing `KNIGHT_ANIMATIONS.unarmed_combo1`/`2` in `game-data.js`+`shared/data.js` after playtesting. `position-tool.html` only supports idle poses, not combo keyframes.
- Tuned 2026-07-11 per playtesting: punch travel distance cut ~1/3 (forward `offsetX` delta 58→39), damage is a flat `2` regardless of `attackDmg`/build/gear (`sword.js`'s `checkSwordHit`, `isUnarmed` branch), each punch can only ever hit one zombie (`hitLoop` labeled break + an `attackHitIds.length` guard so a second target can't be hit on a later tick either), and there's no end-of-combo recovery pause — `maxCombo` is `Infinity` for unarmed so it never takes the "combo finished" branch in `processCombatTick`, and `comboStep` just wraps 1↔2 forever in the chain-continuation loop instead of climbing past 2. Net effect: right/left punches chain continuously at the same short between-hit cooldown jab/swing use between their own combo steps, with no bigger pause distinguishing "end of combo."
- Fixed 2026-07-11: unarmed was letting the next punch chain in before the current one's full animation (forward + return-to-idle) had played. Root cause: `sword.js`'s `checkSwordHit` sets `p.comboChainWindow = true` partway through the forward swing (`currentCf < halfFrames + margin`) — intentional for jab/swing so a recovery half can cancel into the next hit's startup, but it was firing for unarmed too. Fix: that line is now wrapped in `if (!isUnarmed)`, so for unarmed `p.comboChainWindow` stays `false` (set at attack start in `_executeAttack`) for the whole punch and only flips `true` in `processCombatTick`'s `attackFrame >= totalTicks` check, i.e. once the full clip has finished. Combined with the `maxCombo = Infinity` change above, this still opens a short chain window right at that point (not a long recovery pause) — so the "no waiting period" feel is preserved, but the current punch's animation always completes first.
- Fixed 2026-07-11: unarmed punches no longer lunge the player forward. `_executeAttack`'s `p._lungeRemaining` assignment is now `isUnarmed ? 0 : (...)` — armed jab/swing lunge distances are unchanged.
- Fixed 2026-07-11: going from a swing attack straight to unarmed left the fists frozen in what looked like the end of a sword swing. Root cause: `KNIGHT_VISUALS.swing.knight_right_hand` was never a real fist pose — it's a leftover copy-paste of `swing.knight_sword`'s offsets (same x/y/rotation, only scale differs) — and every unarmed idle/return-to-idle lookup that happened to be resolving against the `swing` style (because the player had the jab/swing toggle set to swing) picked it up. Fix: unarmed now always resolves both hands' idle pose to the `.jab` entry in `KNIGHT_VISUALS`, ignoring the jab/swing toggle entirely — the toggle only ever affects armed sword grip. This is enforced in `anims.js` in four places: `getKnightIdleVis`'s `forceJab` (local player, `knight_right_hand` always + `knight_hand` when locally unarmed), `startIdleTransition` (now a no-op while unarmed since there's nothing to blend), `playReturnAnim` (forces `style = 'jab'` when unarmed before picking transition targets), and `getKnightRemoteVis`'s returning-phase `baseIdleStyle` (forces `'jab'` for remote players). `render-entity.js`'s `drawKnightHand`/`drawKnightRightHand` were simplified to match — remote unarmed always requests the `'jab'` override instead of the player's actual toggle. `KNIGHT_VISUALS.swing.knight_right_hand` is left in the data (commented as unused) rather than deleted, to keep the object shape consistent.
