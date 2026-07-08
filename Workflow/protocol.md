# Network Protocol

## Binary State Packet (server → client)

`state` event carries an ArrayBuffer. Layout (all little-endian):

| Offset | Type | Field |
|---|---|---|
| 0 | u8 | Protocol version |
| 1 | f64 | Server emit timestamp |
| 9 | u16 | Arena width |
| 11 | u16 | Arena height |
| 13 | u16 | Server level |
| 15 | u8 | Player count N |
| 16 | u16 | Zombie count M |
| 18 | u16 | Total zombies ever spawned |
| 20 | u16 | Server real alive count |
| 22 | u8 | Is spectator |
| 23 | f32 | Camera zoom |
| 27 | u16 | Camera view W |
| 29 | u16 | Camera view H |

Per player (repeated N times): u8 idLen + utf8 id + f32 x + f32 y + i16 health + u8 alive + u8 attacking + f32 facingAngle + f32 attackLockedAngle + f64 attackStartTime + i16 kills + u8 lvl + u8 comboStep + i16 energy + i16 maxEnergy + u8 comboChainWindow + u8 nameLen + utf8 name + u8 isSpectator.

Per zombie (repeated M times): i32 id + f32 x + f32 y + i16 health + i16 maxHealth + f32 heading + u8 lvl + u8 mobType + u8 alive.

## Client Input Events (client → server)

- **`input`** — 20Hz via `setInterval`. Payload: `{ dx: -1/0/1, dy: -1/0/1, sprint: bool, angle: float }`
- **`attack`** — On mousedown. Payload: `{ facingAngle: float }`
- **`equip`** — Key 1-9. Payload: `{ slot: int }`
- **`cameraZoom`** — On scroll. Payload: `{ zoom: float, viewW: int, viewH: int }`
- **`toggleAttackStyle`** — Space bar. No payload.

## Other Events

`join`, `spectate`, `spectateTarget`, `playAgain`, `leaveRoom`, `startMatch`, `toggleGodMode`, `killAllMobs`, `adminAdvancePhase`, `adminSetLevel`, `respawn`, `fullscreen`, `diagPing`, `clientDiag`.

## Shared Data (`game-data.js`)

Exported as ES module on client, `require()`'d on server via `shared/data.js`. Contains `BLADE_*`, `KNIGHT_BLADE_*`, `KNIGHT_ANIMATIONS`, `KNIGHT_VISUALS`, `MOB_TYPES`, `ZOMBIE_*`, `ITEMS`, `ITEM_VISUALS`, `ANIMATIONS`, `BASE_STATS` — consumed by both sides.
