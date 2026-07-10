# Client Architecture

## Import Chain

```
index.html → game.js
  → lib/net.js (Socket.IO connection, build version polling)
  → lib/net-events.js (socket event registration, binary state parse)
  → lib/state.js (shared state singleton)
  → lib/input.js (keyboard/mouse buffering)
  → lib/render.js (rAF loop, background swap, camera apply)
  → lib/render-entity.js (drawPlayer, drawZombie, sprite cache)
  → lib/anims.js (keyframe interpolation, remote anim sync, pose blending)
  → lib/render-ui.js (leaderboard, hotbar, server level, dmg numbers)
  → lib/hud.js (health/energy/XP bars, phase timer, attack highlights)
  → lib/camera.js (viewport transform, follow player)
  → lib/diag.js (FPS, ping, packet stats overlay)
  → lib/assets.js (asset loading, enterGame lifecycle)
  → lib/next-wave-popup.js (NW popup show/hide/counts)
  → lib/ui.js (DOM refs, screen management, auth forms, room list)
  → lib/audio.js (Web Audio API, spatial sound, mob sounds)
  → lib/callback-registry.js (auth/roomList/lobbyCount callbacks)
  → lib/game-data.js (constants, items, animations, mob types)
```

## Module Roles

| Module | Lines | Role |
|---|---|---|
| `game.js` | 420 | Orchestrator, event bindings, intervals |
| `state.js` | 76 | All shared state |
| `net.js` | 18 | Socket connect + build checker |
| `net-events.js` | 467 | Socket event handlers + binary parser |
| `render.js` | 229 | Main render loop (rAF) |
| `render-entity.js`| 257 | Entity drawing |
| `anims.js` | 510 | Animation engine |
| `render-ui.js` | 275 | UI draws + leaderboard |
| `hud.js` | 421 | HUD bar rendering |
| `camera.js` | 26 | Camera calc |
| `input.js` | 125 | Keyboard/mouse |
| `audio.js` | 117 | Sound system |
| `assets.js` | 121 | Load images + enterGame |
| `next-wave-popup.js` | 215 | Wave popup |
| `ui.js` | 335 | DOM + screens + auth |
| `diag.js` | 26 | Diagnostics overlay |
| `game-data.js` | 320 | Constants & data |
| `callback-registry.js` | 11 | Callback registration |

See [rendering-system.md](./rendering-system.md), [animation-system.md](./animation-system.md), [combat-system.md](./combat-system.md), [protocol.md](./protocol.md).
