# Match Lifecycle

## Phase State Machine

```
waiting → daytime(20s) → nighttime(60s) → waveOver → intermission(10s) → repeat
```

| Phase | Zombie AI | Zombie Spawn | Player Attacks | Background |
|---|---|---|---|---|
| `waiting` | off | off | off | dark |
| `daytime` | off | off | on | light |
| `nighttime` | full | ensureCount→100 | on | dark |
| `waveOver` | full (no spawn) | off | on | dark |
| `intermission` | off | off | on | light |
| `ended` | off | off | off | dark |

- PVP is disabled entirely (`sword.js`)
- All dead during nighttime/waveOver → match ends immediately
- Some dead → "Waiting for Next Wave..." overlay, auto-respawn at intermission→daytime
- `waveOver` has no timer — advances when all zombies dead
- Manual respawn gated to intermission only

## Join Button System (`updateJoinButton`)

`net-events.js:52` — Single function driving `#joinGameBtn` visibility and text based on `state`:

| State | Button | Text |
|---|---|---|
| Screen is `menu` / `eliminated` / `results` | Hidden | — |
| Screen is `playing` + not spectator | Hidden | — |
| In queue (`queuedPlayers` has myId), pos > 0 | Visible | `"In queue: X people ahead"` |
| In queue, pos = 0 | Visible | `"In queue: waiting for slot..."` |
| `matchPhase === 'waiting'` | Visible | `"Waiting for daytime..."` |
| Spectator (not queued) | Visible | `"Join Game"` |

Called from 7 events: `spectatorAssigned`, `joinedGame`, `queueUpdate`, `matchPhase`, `matchReset`, `enterGame`, `joined`. Every path that changes state updates the button.

Click handler (`game.js`) always emits `joinGame` — server decides direct vs queue.

## Player Join Flows

Three distinct ways a player enters the game, determined by `handleDirectJoin()` (`room.js:355`):

| Flow | Condition | Behavior |
|---|---|---|
| **A** | Lobby → match starts | Button shows "Waiting for daytime...", click does nothing (guard at `game.js:365`). `matchPhase(daytime)` → `enterGame()` → button hidden. |
| **B** | All 10 slots full, spectator clicks "Join Game" | Spectator → `handleQueueJoin()` → queue with position tracking. Promoted only when an active player leaves/disconnects **during daytime** (`removePlayer` → `_promoteFromQueue`). Promotion is phase-aware: daytime = instant alive, non-daytime = dead/waiting (C1). |
| **C1** | Slots open, non-daytime phase | Joins as dead/waiting (`alive=false`, `isSpectator=false`). Placed near a living player for camera following. Sees all zombies (`&& p.alive` culling fix). Auto-respawns at next intermission→daytime transition. |
| **C2** | Slots open, daytime phase | Instant drop-in alive via `respawnPlayer`. Full active player immediately. |

## Queue Rules

Server queue (`_joinQueue` array in `room.js`) follows strict rules:
- **Only promotes on player leave/disconnect**: `_promoteFromQueue()` is called exclusively from `removePlayer()`, and only when `wasActive && matchPhase === 'daytime'`
- **No auto-promotion**: Removed from `startMatch()`, `_advancePhase()` (intermission→daytime), and `gameTick()` tick loop
- **Client emits `joinGame` always**: Server routes to `handleDirectJoin` (slots open) or `handleQueueJoin` (slots full) via `socket-handlers.js:182-190`
- **Queue filtered on match start**: `_joinQueue` is filtered to only spectators (`startMatch()` line 169)
- **Queue cleared on end-game reset**: `_timerEndReset()` line 345

## Phase Guard

`_advancePhase()` intermission→daytime loop respawns dead active players but explicitly **skips spectators**:
```js
if (!this.players[id].alive && !this.players[id].isSpectator)
```
This prevents queue players (who are `isSpectator=true, alive=false`) from being accidentally activated during the daytime transition.

## Lobby

DOM overlay with 10 player cards (5×2 grid). Each card: name, [knight preview](./client-architecture.md) canvas, Exp + rank. Ghosted slots for empty positions. "Start Match" / "Leave" buttons. Join order maintained via `_lobbyOrder` array (server → `lobbyUpdate` event).

## Zombie Mechanics

- Up to 100 zombies on map
- Merging: when two zombies overlap, they merge into one higher-level zombie with combined health (max Lv5)
- Revive: dead zombies can be revived after `ZOMBIE_REVIVE_MS` delay (zombie.js/room.js)
- Targeting: nearest non-dead player with line-of-sight favorability (zombie-ai.js)

## Spectator System

Dead players automatically spectate. Camera follows a live player. Spectators can cycle targets. Spectator mode ends on match end.

## End Game

Last player/team standing → `matchEnd` event → "Match Over" overlay → "Play Again" button → `matchReset` event → lobby screen for next round.
