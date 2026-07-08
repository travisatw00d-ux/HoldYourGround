# Wave & Enemy System

## Mob Types (`mob-config.js`)

| Mob | Unlock Lv | Count Range | Health (base) | Speed (base) | Special |
|---|---|---|---|---|---|
| Zombie | 1 | 90–110 + 2/level | 5 + 1.5/level | 1.5 | Default |
| Troll | 5 | 5–15 + 1/level | 15 + 2/level | 1.3 | Larger sprites |
| Goblin | 10 | 3–10 + 1/level | 8 + 1.8/level | 1.6–0.01/level | Speed decays with level |

## Wave Composition

Server builds each wave's composition at `nighttime` start based on `serverLevel`:
- Lower-level mobs have high `minCount`/`maxCount` and `countGrowth`
- Higher-tier mobs unlock at their `unlockLevel` thresholds
- Composition sent to client via `waveComposition` event for the NW popup

See `mob-config.js` for exact formula: count = clamp(minCount + countGrowth × (serverLevel - unlockLevel), minCount, maxCount).

## Zombie Mechanics (`zombie-ai.js`, `zombie.js`)

- **Targeting**: nearest alive player with line-of-sight favorability
- **Merging**: two overlapping zombies merge into one higher-level zombie (max Lv5). Merging increases health but not speed.
- **Revive**: dead zombies resurrect after `ZOMBIE_REVIVE_MS` delay (config in `config.js`)
- **Spawning**: `ensureCount` tried to reach target count every tick during nighttime
- **AI loop**: target → move → attack when in range

## Spawning & Despawning

Zombies spawn at random arena positions during `nighttime`. Despawn is death-only (no distance culling). Server broadcasts full state — client renders all zombies within viewport.
