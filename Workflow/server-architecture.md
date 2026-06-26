# Server Architecture

## File Map

| File | Role |
|---|---|
| `network.js` | Express + Socket.IO setup, static files, lobby broadcast helpers |
| `socket-handlers.js` | All socket events (register, join, leave, input, attack, playAgain, `__test`, `clientDiag`) |
| `room-manager.js` | RoomManager — creates/destroys rooms, routes connections |
| `room.js` | Room class — tick loop, phase machine, join/queue, binary broadcast |
| `config.js` | Tuning constants (MAX_PLAYERS, DAMAGE, SPEED, PHASE_MS) |
| `player.js` / `zombie.js` / `zombie-ai.js` / `sword.js` | Game entities and combat |
| `binary-protocol.js` / `spatial-grid.js` | Delta-compressed binary state, view culling |
| `exp.js` / `db.js` / `leaderboard.js` | XP, persistence, leaderboard |

## Tick Loop (`room.js` — 30Hz via setInterval)

1. Phase timer countdown → `_advancePhase()` on expiry
2. Zombie AI: ensureCount, target, move, attack, merge
3. Player movement, sword attack hitbox checks
4. Binary state broadcast (per-player view culled, spectators excluded)

## Join / Queue Handlers

| Method | Trigger | Behavior |
|---|---|---|
| `handleDirectJoin(id)` | `joinGame` or auto on join | Routes to queue during `ended`. Otherwise: activeCount < MAX_PLAYERS + queue empty → phase-aware join (daytime=alive, non-daytime=dead/waiting). Else → `handleQueueJoin()`. |
| `handleQueueJoin(id)` | Slots full or queue non-empty | Pushes to `_joinQueue`, broadcasts position. |
| `_promoteFromQueue()` | `removePlayer()` on leave (ANY phase) or `startMatch()` | Shifts from queue. Phase-aware: daytime → alive via respawnPlayer; waiting/ended → `isSpectator=false` only (no game enter); else → dead/waiting. |
| `getFilteredLobbyPlayers()` | Every `lobbyUpdate` broadcast | Returns ready-set players + non-spectators during post-game lobby. Returns all during fresh lobby. |

## Key Event Handlers (`socket-handlers.js`)

| Event | Handler | Behavior |
|---|---|---|
| `playAgain` | Server routes through `handleDirectJoin` | Ended → adds to ready set. Active → `handleDirectJoin` (slot/phase/queue checks). Waiting → respawns if dead. |
| `__test` | Test-mode only | `advancePhase`, `endMatch`, `killAllZombies`. See [scenarios/README.md](./scenarios/README.md). |
| `clientDiag` | File writer | Writes `Workflow/diag-{name}.jsonl` per player. See [diagnostics.md](./diagnostics.md). |

## Phase-Aware Join Behavior

| Phase | Join Game | Queue Promotion |
|---|---|---|
| Daytime | Instant alive | `respawnPlayer` + `joinedGame` |
| Nighttime/waveOver/intermission | Dead/waiting (`isDead:true`) | Dead/waiting (`isDead:true`) |
| Waiting/Ended | Routes to queue | `isSpectator=false` only (lobby card shown) |

See [join-queue.md](./join-queue.md) for full flow details.
