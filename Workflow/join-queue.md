# Join / Queue System

## Join Button (`updateJoinButton`)

`net-events.js:52` — Drives `#joinGameBtn` visibility and text:

| State | Text |
|---|---|
| Screen menu/eliminated/results | Hidden |
| Playing + non-spectator | Hidden |
| In queue, pos > 0 | `"In queue: X people ahead"` |
| In queue, pos = 0 | `"In queue: waiting for slot..."` |
| Dead spectating (`isDeadSpectating`) | `"Waiting for daytime..."` |
| Spectator (not queued) | `"Join Game"` |

Called from 7 events: `spectatorAssigned`, `joinedGame`, `queueUpdate`, `matchPhase`, `matchReset`, `enterGame`, `joined`. Click always emits `joinGame` — server decides direct vs queue.

## Player Join Flows

| Flow | When | Behavior |
|---|---|---|
| **A** | Lobby → match starts | Button shows "Waiting for daytime..." (pre-lobby). `matchPhase(daytime)` → `enterGame()` → hidden. |
| **B (queue)** | 10 slots full, click Join Game | `handleQueueJoin()` → queue. Promoted when an active player leaves via `removePlayer` → `_promoteFromQueue()` (any phase). Daytime = alive, non-daytime = dead/waiting (C1). |
| **C1** | Slot open, non-daytime | `handleDirectJoin` → dead/waiting (`alive=false`). Respawns at next intermission→daytime. |
| **C2** | Slot open, daytime | `handleDirectJoin` → instant alive via `respawnPlayer`. |

## Queue Rules

Server queue (`_joinQueue` in `room.js`):

- **Auto-top-off**: `_promoteFromQueue()` called from `removePlayer()` on ANY active player removal (no daytime guard). Always refills to 10 active.
- **Phase-aware**: Daytime promotion → alive. Non-daytime → dead/waiting, respawns at next daytime.
- **Queue-jump prevention**: `handleDirectJoin` checks `_joinQueue.length > 0`. If anyone is waiting, new joiners go to queue back.
- **Cleanup**: Players removed from queue on direct join activation (`handleDirectJoin` line 403) and on disconnect (`removePlayer` line 99).
- **Filtered on match start**: `startMatch()` filters `_joinQueue` to spectators only.
- **Cleared on end-game reset**: `_timerEndReset()` clears queue.
- **No auto-promotion from ticks**: Never called from `gameTick()` or `_advancePhase()`.

## Play Again Routing

`resultsPlayAgainBtn` click → `playAgain` emitted. Server logic in `socket-handlers.js:157`:

| Phase | Behavior |
|---|---|
| `ended` | Added to `_endGameReady` set (votes to continue) |
| `waiting` | Added to `_endGameReady`, respawned if dead, `matchReset` sent |
| Active (daytime/nighttime/etc) | Added to `_endGameReady` (ready for next round), then routes through `handleDirectJoin` (slot/phase/queue checks). NOT instantly dropped in. |
