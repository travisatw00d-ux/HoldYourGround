# Server Editing Guide

All server files live in `server/`. Entry: `server.js` → `network.js`.

## Task-to-File Map

| Goal | File(s) | See |
|---|---|---|
| Join/queue logic | `join-manager.js`, `room.js` (addPlayer/removePlayer) | server-architecture.md, join-queue.md |
| Match phases / timers | `phase-manager.js`, `config.js` (PHASE_MS) | match-lifecycle.md |
| Play Again / end game | `phase-manager.js` (_endMatch), `socket-handlers.js` (playAgain) | results-rejoin.md |
| Combat system | `combat-system.js`, `sword.js`, `config.js`, `player.js` | combat-system.md |
| Zombie AI | `zombie-ai.js`, `zombie.js` | wave-system.md |
| Wave composition | `mob-config.js`, `phase-manager.js` (getWaveComposition) | wave-system.md |
| Binary protocol | `binary-protocol.js` | protocol.md |
| State broadcast | `room.js` (gameTick broadcast phases) | server-architecture.md |
| Spectator follows | `spectator-manager.js` | match-lifecycle.md |
| Test mode | `socket-handlers.js:__test`, `phase-manager.js:_testAdvancePhase` | scenarios/README.md |
| Admin stats | `socket-handlers.js` (admin:getStats/serverStats/getPlayers), `stats-tracker.js` | server-architecture.md |
| Game-start logging | `stats-tracker.js` (recordGameStart called from `phase-manager.js`) | — |
| Auth/db | `auth.js`, `db.js` | — |
| Tuning | `config.js` | — |

## Gotchas

| Issue | Root cause |
|---|---|
| Queue not promoting | `_promoteFromQueue()` only called on `wasActive` removal (intentional) |
| Late Play Again drops in | Routes through `handleDirectJoin` (not instant respawn) |
| Test commands ignored | Server needs `$env:TEST_MODE=1` to process `__test` |
| Binary packet wrong size | Offsets in `binary-protocol.js` don't match client parse in `net-events.js` |
| Admin commands without login | Every admin socket handler must check `if (!socket.account?.isAdmin) return;` — client can't enforce this |
| Game stats file locked | `game-stats.jsonl` is append-only. Don't read/write simultaneously from multiple handlers. |

## Verify

```bash
node -c server/*.js
$env:TEST_MODE=1; node server.js
```
