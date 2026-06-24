# Client Architecture

## Import Chain

```
index.html → game.js (entry)
  → modules/state.js        — shared state singleton (players, zombies, phase, timer)
  → modules/net.js           — Socket.IO connection, `connectToServer`, sends inputs
  → modules/callback-registry.js  — setter functions to avoid circular imports
  → modules/net-events.js    — socket event handlers, asset loading, UI flow
  → modules/input.js         — keyboard + mouse input buffering and interpolation
  → modules/render.js        — main render loop, background, night/day swap
  → modules/render-entity.js — drawPlayer, drawZombie, blade/hand sprites
  → modules/render-ui.js     — HUD (health bar, XP, hotbar), leaderboard, phase timer
  → modules/camera.js        — viewport transform (follow player, screen shake)
  → modules/diag.js          — diagnostics overlay (FPS, ping, packet stats)
```

## Render Loop

`render.js` runs at display refresh via `requestAnimationFrame`:
1. Clear and apply camera transform
2. Draw background (light `#e8e4d8` / dark `#2a2a35` per phase)
3. Draw zombies via `drawZombie()` (render-entity.js)
4. Draw players via `drawPlayer()` (render-entity.js)
5. Draw UI via `renderUI()` (render-ui.js) — health, XP, hotbar, leaderboard, phase timer

## Interpolation

`input.js` buffers player actions with timestamps. Client-side interpolation smooths position/angle rendering between binary state snapshots. Zombie positions are also interpolated client-side.

## Sprite Caching

Images are loaded in `net-events.js` via `ensureAssets()` and cached as `Image` objects in state. Sprites (hands, body parts, items) are drawn from these cached images using sprite sheet coordinates from `shared/data.js`.

## Event Pipeline

Socket events → `net-events.js` → update `state.js` → render loop picks up changes. Inputs go the other way: `input.js` → `net.js` emit → server processes in tick loop.
