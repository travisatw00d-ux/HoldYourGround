# Results Screen & Rejoin

## Match End Flow

`_endMatch()` → broadcasts `matchEnd` to all players → client shows results overlay with "Play Again" and "Back to Lobby" buttons.

## Rejoining After End

If a player leaves an ended room ("Back to Lobby") and rejoins:

- Server sends `matchEnd` again (room is still in `ended` phase)
- Client checks `state._joinedEnded` flag (set in `joined` handler)
- Flag is set → `matchPhase(ended)` shows lobby instead of results; `matchEnd` returns early
- Flag cleared on `enterGame()` (normal game start)

**Server fix**: `removePlayer()` calls `_timerEndReset()` when ended room becomes empty, resetting to `waiting` immediately.

## Play Again Routing

`resultsPlayAgainBtn` click → `playAgain` emitted. Server logic:

| Phase | Behavior |
|---|---|
| `ended` | Vote added to `_endGameReady` set |
| `waiting` | Voted + respawned if dead + `matchReset` sent |
| Active match | Voted (ready for next round) + `handleDirectJoin()` (slot/phase/queue checks) |

When all players ready + timer expires → `_timerEndReset()` → lobby → `startMatch()` triggers next round.

## Empty Room Cleanup

When the last player leaves an ended room, `removePlayer()` calls `_timerEndReset()` immediately instead of waiting for the 30s empty timeout. The room resets to `waiting` phase for fresh joins.
