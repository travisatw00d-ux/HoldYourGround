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
