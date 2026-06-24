# Server Architecture

## File Map

| File | Role |
|---|---|
| `server.js` | Entry point — requires `server/network` |
| `config.js` | Tuning constants (MAX_PLAYERS, DAMAGE, SPEED, PHASE_MS) |
| `network.js` | Express + Socket.IO setup, static files, lobby broadcast helpers |
| `socket-handlers.js` | All socket events (register, join, leave, input, attack, playAgain, `__test`) |
| `room-manager.js` | RoomManager — creates/destroys rooms, routes connections |
| `room.js` | Room class — tick loop, phase machine, join/queue, binary broadcast |
| `zombie.js` / `zombie-ai.js` | Zombie creation, AI, targeting, movement, merge |
| `player.js` | Player factory, stats, respawn |
| `sword.js` | Melee attack, hitbox interpolation (PVP disabled) |
| `exp.js` / `db.js` / `leaderboard.js` | XP, persistence, leaderboard |
| `binary-protocol.js` | Delta-compressed binary state encoding |
| `spatial-grid.js` | Entity binning for view culling and hit detection |

## Tick Loop (`room.js` — 30Hz via setInterval)

1. Phase timer countdown → `_advancePhase()` on expiry
2. Zombie AI: ensureCount, target, move, attack, merge
3. Player movement processing
4. Sword attack hitbox checks
5. State broadcast (binary, per-player view culled)

## Join / Queue Handlers

| Method | When | Behavior |
|---|---|---|
| `handleDirectJoin(id)` | Client `joinGame` | Checks `activeCount < MAX_PLAYERS` AND `_joinQueue.length === 0`. If both pass: phase-aware join (daytime=alive, non-daytime=dead/waiting). Otherwise: `handleQueueJoin()`. |
| `handleQueueJoin(id)` | Slots full or queue non-empty | Pushes to `_joinQueue`, broadcasts position update. |
| `_promoteFromQueue()` | `removePlayer()` on active player leave (ANY phase) | Shifts from queue, phase-aware: daytime → alive; non-daytime → dead/waiting. |

## Test Mode (`TEST_MODE=1`)

Enables `__test` socket event for automation:

| Action | Effect |
|---|---|
| `advancePhase` | Kills zombies, advances `daytime→nighttime→intermission→daytime` |
| `endMatch` | Force-ends the match, broadcasts `matchEnd` |
| `killAllZombies` | Kills all zombies (unstucks `waveOver`) |

See [scenarios/README.md](./scenarios/README.md) for usage.
