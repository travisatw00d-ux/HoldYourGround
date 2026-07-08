# Hold Your Ground — AI Agent Context

Node.js + Socket.IO multiplayer zombie survival IO game.

## Code Map

| Path | What |
|---|---|
| `server/` | 17 JS files — Express, Socket.IO, game logic, SQLite persistence |
| `public/holdyourground/lib/` | Client — 17 modules (Vanilla JS Canvas 2D + ES modules) |
| `public/holdyourground/game.js` | Client entry module |
| `public/shared/data.js` | Server-side copy of shared constants (`require()` only — browser uses `lib/game-data.js`) |
| `Workflow/` | Reference docs, test scenarios, diagnostic logs |
| `server.js` | Entry point |

## Key Facts

- 10 active players max, 100 zombies, 3200×2400 arena, 30Hz tick, binary protocol
- Phases: waiting → daytime(20s) → nighttime(60s) → waveOver → intermission(10s) → repeat
- PVP disabled; zombie merge mechanic (max Lv5); knight tier visuals at lvl 10/20
- Two attack styles (jab/swing) with 4-step combo chain
- Synchronous SQLite via better-sqlite3; Fly.io deploy with zero-scale

## Before Editing

Read the relevant doc in `Workflow/` for context. Start at [workflow.md](Workflow/workflow.md) to find the right document.
