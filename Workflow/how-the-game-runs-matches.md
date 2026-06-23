# How the Game Runs Matches

## Phase State Machine (`room-manager.js`)

```
waiting → daytime(20s) → nighttime(60s) → waveOver(until cleared) → intermission(10s) → repeat
```

| Phase | Zombie AI | Zombie Spawn | Player Attacks | Background |
|---|---|---|---|---|
| `waiting` | off | off | off | dark |
| `daytime` | off | off | on (zombies only) | light (`#e8e4d8`) |
| `nighttime` | full | `ensureCount` fills to 100 | on (zombies only) | dark (`#2a2a35`) |
| `waveOver` | full (no spawn) | off | on (zombies only) | dark |
| `intermission` | off | off | on (zombies only) | light |
| `ended` | off | off | off | dark |

- **PVP disabled entirely** — `sword.js` skips player-vs-player damage
- **All players dead during `nighttime`/`waveOver`** → match ends immediately (`_endMatch`)
- **Some players die, match continues** → dead players see "Waiting for Next Wave..." screen, auto-respawn at intermission→daytime transition
- **`waveOver`** has no timer — advances to `intermission` when ALL zombies are dead
- **Manual respawn** gated to `intermission` phase only

## Lobby System

Before the match, players enter a **lobby screen** (DOM overlay, 10 player cards in 5×2 grid). Each card shows:
- Player name (top), knight preview (canvas, middle), Exp + "Void" rank (bottom)
- Empty slots show ghosted "Waiting..." cards
- Server tracks join order via `_lobbyOrder` array, broadcasts `lobbyUpdate` to room
- Cards shift left/up when players leave (order maintained by `_lobbyOrder.filter`)
- "Start Match" button (anyone), "Leave" button

## Key Socket Events (Server → Client)

| Event | When | Client Action |
|---|---|---|
| `lobbyUpdate` | Player joins/leaves during `waiting` | Renders lobby cards |
| `matchPhase` | Phase transition or player joins room | Updates phase display, toggles lobby/game |
| `matchEnd` | All players dead | Shows Match Over overlay |
| `matchReset` | Play Again clicked | Shows lobby screen for next round |

## Background Swapping

`generateBackground(w, h, color)` in `render.js` creates two canvases on asset load:
- Dark (`#2a2a35`) for `nighttime`, `waveOver`, `waiting`
- Light (`#e8e4d8`) for `daytime`, `intermission`

Timer displayed via `phaseTimerStart - (performance.now() - phaseStartedAt)` — no drift.

## Key Files

| File | Role |
|---|---|
| `server/room-manager.js` | Phase machine, zombie gating, lobby order, match lifecycle |
| `server/network.js` | Socket events, lobby broadcast, respawn gating |
| `server/sword.js` | PVP removed, zombies-only melee |
| `server/config.js` | `DAYTIME_MS`, `NIGHTTIME_MS`, `INTERMISSION_MS` |
| `public/.../state.js` | `matchPhase`, `phaseTimer`, `lobbyPlayers`, background canvases |
| `public/.../net.js` | `ensureAssets`, `enterGame`, `renderLobbyCards`, `drawKnightPreview` |
| `public/.../render.js` | Background swap, phase timer display |
| `public/.../index.html` | Lobby grid, match overlays, phase display |
| `public/style.css` | Lobby cards, phase display, start button |
