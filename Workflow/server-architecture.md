# Server Architecture

## File Map

| File | Role |
|---|---|
| `server.js` | Entry point — requires `server/network` (1 line) |
| `binary-protocol.js` | Binary packet codec (delta-compressed state, view culling) |
| `config.js` | Tuning constants (MAX_PLAYERS, DAMAGE, SPEED, PHASE_MS) |
| `network.js` | Express + Socket.IO setup, static file serving, lobby broadcast helpers |
| `socket-handlers.js` | All socket events (register, join, leave, input, attack, ready, chat, admin) |
| `room-manager.js` | RoomManager — creates/destroys rooms, routes connections |
| `room.js` | Room class — tick loop, phase machine, player/zombie state, binary broadcast, join/queue handlers |
| `zombie.js` | Zombie creation, spawning, revive |
| `zombie-ai.js` | Zombie AI: targeting, movement, attacks, merge logic, ensureCount |
| `player.js` | Player class with factory, stats, reset, death logic |
| `sword.js` | Melee attack calculation (blade interpolation, hitbox), PVP disabled |
| `leaderboard.js` | Leaderboard + XP/gold grant, level-ups, persistence |

## Tick Loop

`room.js` runs `gameLoop` at ~30Hz via `setInterval`:
1. `updateRoomTimer()` — handles phase transitions
 2. `ensureCount()` (zombie-ai.js) — fills zombie count during nighttime
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

## Join / Queue Handlers

`room.js` has three methods for player entry:

| Method | When | Behavior |
|---|---|---|
| `handleDirectJoin(id)` | Client emits `joinGame` | Checks `getActivePlayerCount()`. If slots available, branches on phase: daytime → instant alive via `respawnPlayer` (Flow C2); non-daytime → dead/waiting with camera near a living player (Flow C1). If all 10 slots full, falls back to `handleQueueJoin` (Flow B). |
| `handleQueueJoin(id)` | Slots full or direct join fell back | Pushes player's socket ID to `_joinQueue`, broadcasts position update via `_broadcastQueueUpdate`. |
| `_promoteFromQueue()` | Only from `removePlayer()` during `matchPhase === 'daytime'` | Shifts from queue, clears stale entries, then phase-aware: daytime → `respawnPlayer` + `joinedGame`; non-daytime → `alive=false` + `joinedGame({isDead: true})`. |

Queue promotion is **never** called from `startMatch()`, `_advancePhase()`, or `gameTick()` — only reactively when an active player leaves during daytime.

## Match Lifecycle

Room manages [phase state machine → lobby → match → intermission](./match-lifecycle.md). Zombie AI, spawning, and player attacks are gated per phase.
