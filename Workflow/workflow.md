# Hold Your Ground — Project Workflow

Multiplayer zombie survival IO game. 100 zombies, 10 active players, 3200×2400 arena, last standing wins per wave. XP/gold → level up (T1→T2 at 10, T2→T3 at 20). AGENTS.md provides AI session context.

## Tech Stack

| Layer | Stack | Runs On |
|---|---|---|
| Game server | Node.js + Socket.IO + SQLite + binary protocol | Fly.io |
| Client | Vanilla JS Canvas 2D + ES modules | Browser |
| Website | Next.js static export + Cloudflare Workers | Cloudflare |

## Doc Web

| Document | Covers |
|---|---|
| [server-architecture.md](./server-architecture.md) | 17 server files, tick loop, join/queue, binary broadcast |
| [client-architecture.md](./client-architecture.md) | 17 client modules (`lib/`), render loop, import chain |
| [rendering-system.md](./rendering-system.md) | Canvas sizing, HUD layout, sprite cache, background, camera |
| [animation-system.md](./animation-system.md) | Keyframe interpolation, polar blending, remote sync, knight visuals |
| [combat-system.md](./combat-system.md) | Jab/swing attacks, combo chain, blade hitbox, damage/energy/recovery |
| [wave-system.md](./wave-system.md) | Mob types, level scaling, wave composition, zombie merge/revive |
| [protocol.md](./protocol.md) | Binary state packet layout, input format, events |
| [match-lifecycle.md](./match-lifecycle.md) | Phase state machine, spectator, end game |
| [join-queue.md](./join-queue.md) | Join flows (A/B/C1/C2), queue rules, button text |
| [results-rejoin.md](./results-rejoin.md) | Results screen, rejoin behavior, empty room cleanup |
| [editing-client.md](./editing-client.md) | Client task-to-file map, gotchas, verify |
| [editing-server.md](./editing-server.md) | Server task-to-file map, gotchas, verify |
| [diagnostics.md](./diagnostics.md) | Client heartbeat, stalled tab detection, diag overlay & logging |
| [troubleshooting.md](./troubleshooting.md) | Common issues and fixes |
| [scenarios/README.md](./scenarios/README.md) | Automated test scenarios, `__test` commands |
| [deploy.md](./deploy.md) | Two-project sync, backend/frontend deploy, image management |

## Two-Project Architecture

**`HoldYourGround\`** is the source of truth. **`IOWebsite\`** mirrors `public\` for the marketing site.
Sync rules and deploy commands in [deploy.md](./deploy.md).
