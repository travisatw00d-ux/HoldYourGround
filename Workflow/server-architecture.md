# Server Architecture

## File Map

| File | Role |
|---|---|
| `network.js` | Express + Socket.IO setup, static files, lobby broadcast |
| `socket-handlers.js` | All socket events (register, join, leave, input, attack, playAgain, `__test`, `clientDiag`) |
| `room-manager.js` | RoomManager — creates/destroys rooms, routes connections |
| `room.js` | Room class — tick loop (30Hz), phase machine, join/queue, binary broadcast |
| `config.js` | Tuning constants (MAX_PLAYERS, DAMAGE, SPEED, PHASE_MS) |
| `player.js` / `zombie.js` | Entity data structures and state |
| `zombie-ai.js` | Targeting, movement, attack, merge, revive |
| `sword.js` | Blade hitbox checks, damage application |
| `physics.js` | Movement, collision |
| `binary-protocol.js` | Binary state packet encoding |
| `spatial-grid.js` | View culling for broadcast |
| `exp.js` / `db.js` | XP formulas, SQLite persistence |
| `auth.js` | Login/register/bcrypt |
| `mob-config.js` | Mob type definitions and wave composition |

See [wave-system.md](./wave-system.md) for mob config and spawning, [combat-system.md](./combat-system.md) for sword/combat, [protocol.md](./protocol.md) for binary format.

## Tick Loop (30Hz in `room.js`)

1. Phase timer → `_advancePhase()` on expiry
2. Zombie AI: ensureCount, target, move, attack, merge
3. Player movement, sword attack hitbox checks
4. Binary state broadcast (per-player view culled)

## Key Event Handlers

| Event | Handler | Behavior |
|---|---|---|
| `playAgain` | `handleDirectJoin` | Ended → ready set. Active → slot/phase/queue. Waiting → respawn if dead. |
| `__test` | Test-mode only | `advancePhase`, `endMatch`, `killAllZombies`. See [scenarios/README.md](./scenarios/README.md). |
| `clientDiag` | File writer | Writes `Workflow/diag-{name}.jsonl`. See [diagnostics.md](./diagnostics.md). |

See [join-queue.md](./join-queue.md), [results-rejoin.md](./results-rejoin.md), [match-lifecycle.md](./match-lifecycle.md) for phase flow and queue rules.
