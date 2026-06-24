# Editing Guide

Multiplayer zombie survival IO game. 100 zombies, 3200×2400 arena, last standing wins. XP/gold → level up (T1→T2 at 10, T2→T3 at 20).
Server: Node.js + Socket.IO + SQLite + binary protocol on Fly.io
Client: Vanilla JS Canvas 2D + ES modules in browser
Full context: [workflow.md](./workflow.md)

## Structure
- **Server**: `server.js` → `server/network.js` (Express+Socket.IO) → `socket-handlers.js` (all events) → `room-manager.js` → `room.js` (tick loop at 30Hz)
- **Client**: `index.html` (loads `shared/data.js` as `<script>`) → `game.js` → `net.js` (Socket.IO) → `net-events.js` (incoming) → `state.js` (singleton) → `render.js` (rAF loop)
- **Bridge**: `public/shared/data.js` is consumed by server (`require`) and client (`window.*`). Must always sync to IOWebsite.

## What to Edit When

| You want to... | Server files | Client files | Shared (data.js) | Read |
|---|---|---|---|---|
| Add weapon/item | sword.js, config.js, player.js | render-entity.js | ITEMS, ANIMATIONS, VISUALS | server-arch, client-arch |
| Tune game balance | config.js | — | — | server-arch |
| Change zombie AI | zombie-ai.js, zombie.js | render-entity.js | ZOMBIE_ANIMATIONS | match-lifecycle |
| Fix hit detection | sword.js, config.js | render-entity.js (getBladeSegment), render.js | BLADE_TIP/HILT_X/Y | server-arch |
| Change match phases | room.js, config.js | render-ui.js, render.js | — | match-lifecycle |
| Add socket event | socket-handlers.js | net-events.js | — | both arch docs |
| Change UI/HUD | — | render-ui.js, index.html | SCREEN_UI | client-arch |
| Change lobby | room-manager.js, socket-handlers | game.js, net-events.js | — | match-lifecycle |
| Room capacity | config.js (MAX_PLAYERS), room-manager.js | — | — | server-arch |
| Join button text/visibility | — | net-events.js (updateJoinButton) | — | client-arch, match-lifecycle |
| Queue/join logic | room.js (handleDirectJoin, handleQueueJoin, _promoteFromQueue) | — | — | server-arch, match-lifecycle |
| Guest URL auto-sign-in | — | game.js (?guest= param) | — | client-arch |
| Leaderboard | leaderboard.js, room.js | render-ui.js (updateLeaderboard) | — | both arch docs |
| Knight/T2/T3 content | config.js, sword.js | render-entity.js | KNIGHT_* constants | both arch docs |

## Gotchas

| Issue | Root cause |
|---|---|
| Sword hits miss (Y offset) | render-entity.js:175 getBladeSegment uses ox not oy for hiltY/tipY |
| Room shows wrong capacity | room-manager.js:32 uses MAX_ROOMS(5) not MAX_PLAYERS(10) |
| Merged zombie ignores targets | zombie-ai.js:112 createZombie sets random recalcTimer; add recalcTimer:0 |
| Dead imports after splits | render.js, render-ui.js may import unused symbols — clean them |
| IOWebsite sprites invisible | shared/data.js not synced — always sync after edits |
| Server crash on startup | Missing require — run `node -c server/*.js` first |

## Verify
```bash
node -c server/*.js        # syntax check all server files
node server.js             # test startup (Ctrl+C to stop)
# Client: Ctrl+Shift+R in browser
```

## Sync
After any edit to `HoldYourGround\public\` → copy changed files to `C:\Dev\IOWebsite\public\`.
Full deploy instructions: [deploy.md](./deploy.md)
