# Hold Your Ground — AI Agent Context

Node.js + Socket.IO multiplayer zombie survival IO game.

## Code Map

| Path | What |
|---|---|
| `server/` | 16 JS files — Express, Socket.IO, game logic, SQLite persistence |
| `public/holdyourground/` | Client — Vanilla JS Canvas 2D + ES modules |
| `public/shared/data.js` | Shared constants (stats, items, animations) consumed by both |
| `Workflow/` | Reference docs, test scenarios, diagnostic logs |
| `server.js` | Entry point (just `require('./server/network')`) |

## Key Facts

- 10 active players max, 100 zombies, 3200×2400 arena, 30Hz tick, binary protocol
- Phases: waiting → daytime(20s) → nighttime(60s) → waveOver → intermission(10s) → repeat
- PVP disabled; zombie merge mechanic (max Lv5); knight tier visuals at lvl 10/20
- No delta compression; full state broadcast every ~55ms
- Synchronous SQLite via better-sqlite3; Fly.io deploy with zero-scale

## Testing

```bash
$env:TEST_MODE=1; node server.js    # run server in test mode
node Workflow/scenarios/test-queue-promotion.js    # run queue scenarios
node Workflow/scenarios/test-lobby-overflow.js     # run lobby overflow tests
```

Before editing, read the relevant doc in `Workflow/` for context.
