# Hold Your Ground — Project Workflow

## What It Is
A **multiplayer zombie survival IO game**. 100 zombies spawn in a 3200×2400 arena. Last player (or team) standing wins. Earn XP/gold by killing zombies, level up (T1→T2 at lvl 10, T2→T3 at lvl 20), and top the leaderboard.

## How It Works
- **Movement:** WASD / Arrow keys with smooth acceleration
- **Combat:** Click to swing sword toward mouse cursor. Hitbox calculated from blade tip/hilt keyframe interpolation
- **Zombies:** Target nearest player. When two overlap they **merge** into one higher-level zombie with combined health
- **Server:** Node.js + Socket.IO, tick loop at ~30Hz, binary-protocol broadcasts at ~18Hz with view culling
- **Client:** Vanilla JS Canvas 2D with `requestAnimationFrame`, client-side interpolation, sprite caching

## Match Structure
The game uses a phased lobby → match → intermission loop. See **[how-the-game-runs-matches.md](./how-the-game-runs-matches.md)** for the full phase state machine, lobby system, zombie gating, socket events, and file map.

## Two-Project Architecture

| Project | Role | Hosting | Deploy Command |
|---|---|---|---|
| `HoldYourGround\` | Game server (Express + Socket.IO + SQLite) | Fly.io | `npm run deploy` |
| `IOWebsite\` | Marketing site + game client delivery | Cloudflare Workers | `deploy.bat` |

## The Critical Sync Step
**`HoldYourGround\public\` is the source of truth.** After editing game files, manually copy to `IOWebsite\public\`:
- `public\holdyourground\` (all files)
- `public\shared\data.js` (game constants — most commonly missed)
- `public\style.css`
- `images\*` → `IOWebsite\public\images\`

## Full Deployment
See **[HowToFullDeploy.md](./HowToFullDeploy.md)** for step-by-step instructions covering backend-only deploy, frontend-only deploy, full redeploy checklists, image management, and troubleshooting (invisible swords, Cloudflare cache, etc.).
