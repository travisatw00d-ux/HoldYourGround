# Hold Your Ground — Project Workflow

Multiplayer zombie survival IO game. 100 zombies, 3200×2400 arena, last standing wins. XP/gold → level up (T1→T2 at 10, T2→T3 at 20) → leaderboard.

## Tech Stack

| Layer | Stack | Runs On |
|---|---|---|
| Game server | Node.js + Socket.IO + SQLite + binary protocol | Fly.io |
| Client | Vanilla JS Canvas 2D + ES modules | Browser |
| Website | Next.js static export + Cloudflare Workers | Cloudflare |

## Key Docs

| Document | Covers |
|---|---|
| [server-architecture.md](./server-architecture.md) | 13 server files, tick loop, binary broadcast, spatial grid, zombie AI |
| [client-architecture.md](./client-architecture.md) | 8 client modules, render loop, import chain, sprite caching |
| [editing.md](./editing.md) | Task-to-file mapping, gotchas, verification checklist |
| [match-lifecycle.md](./match-lifecycle.md) | Phase state machine, lobby system, zombie gating, spectator/end-game |
| [deploy.md](./deploy.md) | Two-project sync, backend/frontend deploy, image management |
| [troubleshooting.md](./troubleshooting.md) | Common issues and fixes |

## Two-Project Architecture

**`HoldYourGround\`** is the source of truth. **`IOWebsite\`** mirrors `public\` for the marketing site.
Sync rules and deploy commands in [deploy.md](./deploy.md).
