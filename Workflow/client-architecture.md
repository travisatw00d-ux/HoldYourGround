# Client Architecture

## Import Chain

```
index.html → game.js
  → net.js (Socket.IO)
  → net-events.js (event handlers, button logic, asset loading)
  → state.js (shared state singleton)
  → input.js (keyboard/mouse buffering + interpolation)
  → render.js (rAF loop, background, night/day swap)
  → render-entity.js (drawPlayer, drawZombie, blade sprites)
  → render-ui.js (HUD, hotbar, leaderboard, phase timer)
  → camera.js (viewport transform, follow player)
  → diag.js (FPS, ping, packet stats overlay)
```

## Render Loop (`render.js` via requestAnimationFrame)

1. Clear and apply camera transform
2. Draw background (light `#e8e4d8` / dark `#2a2a35` per phase)
3. Draw zombies via `drawZombie()` then players via `drawPlayer()`
4. Draw UI via `renderUI()` — health, XP, hotbar, leaderboard, phase timer

Inputs: `input.js` → `net.js` emit → server tick loop.
Socket events: `net-events.js` → update `state.js` → render picks up changes.

## Join Button / Queue / Results

See [join-queue.md](./join-queue.md) (`updateJoinButton`, join flows, queue rules) and [results-rejoin.md](./results-rejoin.md) (`_joinedEnded` flag, Play Again routing).

## URL Param Auto-Sign-In

`game.js:129` — `?guest=Name` auto-emits `playAsGuest` 100ms after load, bypassing the auth form. Used by `launch_12_guests.bat` and scenario tests.
