# Editing Guide

Server: Node.js + Socket.IO + SQLite + binary protocol. Client: Vanilla JS Canvas 2D + ES modules. Full context: [workflow.md](./workflow.md).

## Structure
- **Server**: `server.js` → `network.js` → `socket-handlers.js` (events) → `room-manager.js` → `room.js` (tick loop, join/queue, phase machine)
- **Client**: `index.html` → `game.js` → `net.js` → `net-events.js` (handlers) → `state.js` → `render.js` (rAF loop)
- **Bridge**: `public/shared/data.js` is consumed by both server (`require`) and client (`window.*`)

## What to Edit When

| Goal | Server files | Client files | Read |
|---|---|---|---|
| Join button text/visibility | — | `net-events.js:52` (updateJoinButton) | join-queue, client-arch |
| Queue/join logic | `room.js` (handleDirectJoin, handleQueueJoin, _promoteFromQueue) | — | server-arch, join-queue |
| Play Again / end-game | `socket-handlers.js:157`, `room.js:_endMatch` | `game.js:356` (resultsPlayAgainBtn) | results-rejoin |
| Match phases / timers | `room.js`, `config.js` | `render-ui.js`, `render.js` | match-lifecycle |
| Test mode (`__test`) | `socket-handlers.js:198`, `room.js:_testAdvancePhase` | — | scenarios/README |
| Results screen on rejoin | `room.js:removePlayer` (empty ended reset) | `net-events.js` (joined/matchEnd) | results-rejoin |
| Lobby | `room-manager.js`, `socket-handlers` | `game.js`, `net-events.js` | match-lifecycle |
| Zombie AI | `zombie-ai.js`, `zombie.js` | `render-entity.js` | server-arch |
| Items / weapons | `sword.js`, `config.js`, `player.js` | `render-entity.js` | shared/data.js |

## Gotchas

| Issue | Root cause |
|---|---|
| Sword hits miss (Y offset) | `render-entity.js:175` getBladeSegment uses `ox` not `oy` |
| Queue not promoting | `room.js:101` `_promoteFromQueue()` only called on `wasActive` removal (intentional) |
| Results showing on rejoin | Client `_joinedEnded` flag in `matchEnd` handler suppresses stale results |
| Late Play Again drops in | `socket-handlers.js:169` routes through `handleDirectJoin` (not instant respawn) |
| Test commands ignored | Server needs `$env:TEST_MODE=1` to process `__test` events |
| Room ID unknown on client | `init` event includes `roomId` since [session commit] |

## Verify
```bash
node -c server/*.js
$env:TEST_MODE=1; node server.js
```
