# Client Editing Guide

All client files live in `public/holdyourground/lib/`. Entry: `game.js` (imported by `index.html` as module).

## Task-to-File Map

| Goal | File(s) | See |
|---|---|---|
| Join button text/visibility | `lib/render-ui.js` (updateJoinButton) | join-queue.md |
| HUD layout/position | `lib/hud.js`, `hud-layout.json` | rendering-system.md |
| Attack animation | `lib/anims.js` (startAttackAnim, playReturnAnim) | animation-system.md, combat-system.md |
| Attack style toggle | `lib/input.js` (Space key), `lib/anims.js` (startIdleTransition) | combat-system.md |
| Player/zombie drawing | `lib/render-entity.js` (drawPlayer, drawZombie) | rendering-system.md |
| Game data constants | `lib/game-data.js` (BLADE_*, STATS, MOB_TYPES, ANIMATIONS) | combat-system.md, wave-system.md |
| Screen management | `lib/ui.js` (showScreen, leaveToMenu) | match-lifecycle.md |
| NW popup | `lib/next-wave-popup.js` | wave-system.md |
| Socket handling | `lib/net-events.js` (registerEvents) | protocol.md |
| Asset loading | `lib/assets.js` (enterGame, ensureAssets) | — |
| Audio | `lib/audio.js` (playSound, playMobSound) | — |

## Gotchas

| Issue | Root cause |
|---|---|
| Sword/hands invisible | Wrong blade constants in `game-data.js` or missing sprite frames |
| Animation plays wrong arc | `lerpPosePolar` vs `lerpPose` — polar is required for swing arcs |
| Remote sword spins 360° | `shortAngleDelta` not used in blend — will look like long-way spin |
| HUD misaligned | `hud-layout.json` coords wrong or `viewportScale` formula mismatch |

## Verify

Open browser devtools. Check: `state` object, `state.players`, `state.zombies`, no console errors. Toggle HUD debug with J key.
