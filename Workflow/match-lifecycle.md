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

- PVP disabled entirely (`sword.js`)
- All dead during nighttime/waveOver → match ends immediately
- `waveOver` has no timer — advances when all zombies dead
- Manual respawn gated to intermission only

## Join / Queue System

See [join-queue.md](./join-queue.md) — covers all join flows, queue rules, button text, and `playAgain` routing.

## Zombie Mechanics

See [wave-system.md](./wave-system.md) for mob types, level scaling, wave composition, merge, revive, and spawn logic.

## Combat System

See [combat-system.md](./combat-system.md) for attack styles, combo chain, blade hitbox, damage, energy, recovery.

## Spectator System

Dead players auto-spectate. Camera follows a live player. Spectators can cycle targets. Spectator mode ends on match end.

## End Game

Last standing → `matchEnd` → results overlay → "Play Again" / "Back to Lobby". Timer expires → `_timerEndReset()` resets to `waiting` lobby. Empty ended rooms reset immediately.
