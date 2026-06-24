# Server Architecture

## File Map

| File | Role |
|---|---|
| `server.js` | Entry: Express + Socket.IO setup, dev HTTP override, crash restart |
| `binary-protocol.js` | Binary packet codec (delta-compressed state, view culling) |
| `config.js` | Tuning constants (DAMAGE, SPEED, PHASE_MS, ZOMBIE_LIMIT) |
| `helpers.js` | Shared utilities (ID gen, distances, `removeFromArray`) |
| `network.js` | Express + Socket.IO server creation, lobby helpers, admin commands |
| `socket-handlers.js` | All socket event handlers (join, leave, input, attack, ready, chat) |
| `room-manager.js` | RoomManager — creates/destroys rooms, routes connections |
| `room.js` | Room class — tick loop, phase machine, player/zombie state, binary broadcast |
| `zombie.js` | Zombie creation, spawning (`ensureCount`), revive |
| `zombie-ai.js` | Zombie AI: targeting, movement, attacks, merge logic |
| `player.js` | Player class with factory, stats, reset, death logic |
| `sword.js` | Melee attack calculation (blade interpolation, hitbox), PVP disabled |
| `leaderboard.js` | Leaderboard + XP/gold grant, level-ups, persistence |

## Tick Loop

`room.js` runs `gameLoop` at ~30Hz via `setInterval`:
1. `updateRoomTimer()` — handles phase transitions
2. `ensureCount()` (zombie.js) — fills zombie count during nighttime
3. `updateZombies()` (zombie-ai.js) — target, move, attack, merge
4. `updatePlayers()` (player.js) — process queued inputs
5. `processAttacks()` (sword.js) — calculate swing hitboxes
6. `processProjectiles()` — handle zombie projectiles
7. `checkGameEnd()` — detect match over / all dead
8. `broadcastState()` — binary encode + emit per-player with view culling

## Binary Protocol

`binary-protocol.js` encodes state deltas into typed arrays. Each player receives only entities within their view distance (`VIEW_CULL_DISTANCE` in config). Reduces bandwidth 10-100× vs JSON.

## Spatial Index

Players and zombies are binned into `SPATIAL_CELL_SIZE` grid cells in `room.js`. `getNearbyEntities()` is used by zombie-ai.js for target finding and by sword.js for hit detection.

## Match Lifecycle

Room manages [phase state machine → lobby → match → intermission](./match-lifecycle.md). Zombie AI, spawning, and player attacks are gated per phase.
