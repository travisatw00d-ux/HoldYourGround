# Server Editing Guide

All server files live in `server/`. Entry: `server.js` → `network.js`.

## Task-to-File Map

| Goal | File(s) | See |
|---|---|---|
| Join/queue logic | `room.js` (handleDirectJoin, handleQueueJoin, _promoteFromQueue) | server-architecture.md, join-queue.md |
| Match phases / timers | `room.js` (_advancePhase), `config.js` (PHASE_MS) | match-lifecycle.md |
| Play Again / end game | `room.js` (_endMatch), `socket-handlers.js` (playAgain) | results-rejoin.md |
| Zombie AI | `zombie-ai.js`, `zombie.js` | wave-system.md |
| Sword/damage | `sword.js`, `config.js` (DAMAGE), `player.js` | combat-system.md |
| Wave composition | `mob-config.js` (getWaveComposition) | wave-system.md |
| Binary protocol | `binary-protocol.js` | protocol.md |
| Lobby | `room-manager.js`, `socket-handlers.js` | match-lifecycle.md |
| Test mode | `socket-handlers.js:__test`, `room.js:_testAdvancePhase` | scenarios/README.md |
| Auth/db | `auth.js`, `db.js` | — |
| Tuning | `config.js` | — |

## Gotchas

| Issue | Root cause |
|---|---|
| Queue not promoting | `_promoteFromQueue()` only called on `wasActive` removal (intentional) |
| Late Play Again drops in | Routes through `handleDirectJoin` (not instant respawn) |
| Test commands ignored | Server needs `$env:TEST_MODE=1` to process `__test` |
| Binary packet wrong size | Offsets in `binary-protocol.js` don't match client parse in `net-events.js` |

## Verify

```bash
node -c server/*.js
$env:TEST_MODE=1; node server.js
```
