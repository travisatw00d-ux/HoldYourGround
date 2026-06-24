# Test Scenarios

Automated scripts that simulate players via `socket.io-client`. Auto-starts the server with `TEST_MODE=1`. Each run writes `trace-<timestamp>.json` to this folder.

## Running

```bash
node Workflow/scenarios/test-queue-promotion.js
```

## Scenarios

| Scenario | What it tests |
|---|---|
| `nighttime_auto_top_off` | Queue promotes during nighttime (dead/waiting), respawns at daytime |
| `queue_jump_prevention` | New spectator goes to queue back when people are waiting |
| `rejoin_after_end` | Rejoining ended room doesn't show stale results; empty ended room resets |
| `play_again_in_progress` | Play Again during active match routes through `handleDirectJoin` (not instant drop-in) |

## Test-Mode Commands (`__test`)

Sent by any player in a room when `TEST_MODE=1`:

| Action | Effect |
|---|---|
| `advancePhase` | Kills zombies, advances `daytime→nighttime→intermission→daytime` |
| `endMatch` | Force-ends match, all players receive `matchEnd` |
| `killAllZombies` | Kills all zombies (unstucks `waveOver`) |

Example: `p.socket.emit('__test', { action: 'advancePhase' })`.

## Trace Output

`trace-<timestamp>.json` contains `scenario`, `serverDiagLog`, `summary`, and `events` (all socket events sorted by time, with player names).
