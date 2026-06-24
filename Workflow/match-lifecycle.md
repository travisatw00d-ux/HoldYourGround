# Match Lifecycle

## Phase State Machine

```
waiting → daytime(20s) → nighttime(60s) → waveOver → intermission(10s) → repeat
```

| Phase | Zombie AI | Zombie Spawn | Player Attacks | Background |
|---|---|---|---|---|
| `waiting` | off | off | off | dark |
| `daytime` | off | off | on | light |
| `nighttime` | full | ensureCount→100 | on | dark |
| `waveOver` | full (no spawn) | off | on | dark |
| `intermission` | off | off | on | light |
| `ended` | off | off | off | dark |

- PVP is disabled entirely (`sword.js`)
- All dead during nighttime/waveOver → match ends immediately
- Some dead → "Waiting for Next Wave..." overlay, auto-respawn at intermission→daytime
- `waveOver` has no timer — advances when all zombies dead
- Manual respawn gated to intermission only

## Lobby

DOM overlay with 10 player cards (5×2 grid). Each card: name, [knight preview](./client-architecture.md) canvas, Exp + rank. Ghosted slots for empty positions. "Start Match" / "Leave" buttons. Join order maintained via `_lobbyOrder` array (server → `lobbyUpdate` event).

## Zombie Mechanics

- Up to 100 zombies on map
- Merging: when two zombies overlap, they merge into one higher-level zombie with combined health (max Lv5)
- Revive: dead zombies can be revived after `ZOMBIE_REVIVE_MS` delay (zombie.js/room.js)
- Targeting: nearest non-dead player with line-of-sight favorability (zombie-ai.js)

## Spectator System

Dead players automatically spectate. Camera follows a live player. Spectators can cycle targets. Spectator mode ends on match end.

## End Game

Last player/team standing → `matchEnd` event → "Match Over" overlay → "Play Again" button → `matchReset` event → lobby screen for next round.
