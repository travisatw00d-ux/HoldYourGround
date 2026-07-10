# Server Architecture

## File Map

| File | Role | Lines |
|---|---|---|
| `network.js` | Express + Socket.IO setup, static files, lobby broadcast | 54 |
| `socket-handlers.js` | All socket events (register, join, leave, input, attack, playAgain, `__test`, `clientDiag`) | 279 |
| `room-manager.js` | RoomManager — creates/destroys rooms, routes connections, tick scheduler | 86 |
| `room.js` | Room class — tick loop (30Hz), state broadcast, player/zombie lifecycle | 417 |
| `phase-manager.js` | Phase state machine, match lifecycle (start/end/reset/advance) | 237 |
| `join-manager.js` | Direct join, queue, promote, active player counting | 108 |
| `combat-system.js` | Attack handler, combo execution, per-tick combat processing | 208 |
| `spectator-manager.js` | Follow target assignment, stale follow cleanup | 26 |
| `config.js` | Tuning constants (MAX_PLAYERS, DAMAGE, SPEED, PHASE_MS) | 52 |
| `player.js` / `zombie.js` | Entity data structures and state | 153 / 107 |
| `zombie-ai.js` | Targeting, movement, attack, merge, revive | 266 |
| `sword.js` | Blade hitbox checks, damage application | 140 |
| `physics.js` | Movement, collision | 103 |
| `binary-protocol.js` | Binary state packet encoding | 70 |
| `spatial-grid.js` | View culling for broadcast | 57 |
| `exp.js` / `db.js` | XP formulas, SQLite persistence | 28 / 38 |
| `auth.js` | Login/register/bcrypt | 41 |
| `mob-config.js` | Mob type definitions and wave composition | 53 |
| `stats-tracker.js` | Game-start JSONL logging, 24h stats query | 30 |

See [wave-system.md](./wave-system.md) for mob config and spawning, [combat-system.md](./combat-system.md) for sword/combat, [protocol.md](./protocol.md) for binary format.

## Tick Loop (30Hz in `room.js gameTick()`)

1. Phase timer countdown → `phase-manager` on expiry
2. Zombie AI: ensureCount, target, move, attack, merge (`zombie-ai.js`)
3. Combat processing: sword hits, lunge, attack frames, cooldowns (`combat-system.js`)
4. All zombies dead → advance phase
5. Spectator follow reassignment (`spectator-manager.js`)
6. Binary state broadcast (per-player view culled)
7. All phases except `gameTick` live in `phase-manager.js`, `join-manager.js`, `combat-system.js`, `spectator-manager.js`

## Key Event Handlers

| Event | Handler | Behavior |
|---|---|---|
| `playAgain` | `handleDirectJoin` | Ended → ready set. Active → slot/phase/queue. Waiting → respawn if dead. |
| `__test` | Test-mode only | `advancePhase`, `endMatch`, `killAllZombies`. See [scenarios/README.md](./scenarios/README.md). |
| `clientDiag` | File writer | Writes `Workflow/diag-{name}.jsonl`. See [diagnostics.md](./diagnostics.md). |
| `admin:getStats` | Admin only | Returns general stats: uptime, rooms, players, games/players 24h. |
| `admin:getServerStats` | Admin only | Returns RSS/VM memory, CPU lifetime + 10s realtime sampler. |
| `admin:getPlayers` | Admin only | Returns all connected sockets alphabetically with name/type/room. |
| `setBuild` | All players | Changes `player.build`. Redistributes invested points to statPoints, recalcs stats. |
| `spendStatPoint` | All players | Spends one stat point on a stat. Build-scaling affects the bonus amount. |

See [join-queue.md](./join-queue.md), [results-rejoin.md](./results-rejoin.md), [match-lifecycle.md](./match-lifecycle.md) for phase flow and queue rules.
