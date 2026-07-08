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
