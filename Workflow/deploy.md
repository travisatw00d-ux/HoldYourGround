# Deploy Guide

## Two-Project Architecture

| Project | Role | Hosting | Deploy |
|---|---|---|---|
| `HoldYourGround\` | Game server (Express + Socket.IO) | [Fly.io](https://fly.io) | `npm run deploy` |
| `IOWebsite\` | Marketing site + game client | [Cloudflare Workers](https://workers.cloudflare.com) | `git push origin main` |

**`HoldYourGround\public\` is the source of truth.** Frontend files must be synced to `IOWebsite\public\` before deploying.

> ⚠️ The live site (Cloudflare) cannot serve `/socket.io/socket.io.js` — that path only exists on the game server. The CDN URL in `index.html` handles both environments.

## Sync Checklist (after frontend changes)

```
HoldYourGround\public\holdyourground\  →  IOWebsite\public\holdyourground\
HoldYourGround\public\shared\data.js   →  IOWebsite\public\shared\data.js  (⚠️ server needs this!)
HoldYourGround\public\style.css        →  IOWebsite\public\style.css
HoldYourGround\images\*.png            →  IOWebsite\public\images\
```

Server crashes without `shared/data.js` — it's `require()`'d by `server/config.js` and `server/mob-config.js`. Browser now uses `lib/game-data.js` (ES module import).

## Deploy Commands

### Backend only (server changes)
```bash
cd HoldYourGround
npm run deploy    # fly deploy --no-cache
```

### Frontend only (client changes)
```bash
cd IOWebsite
git add -A && git commit -m "msg" && git push origin main
# Cloudflare auto-deploys
# Fallback: double-click deploy.bat
```

### Full deploy (both)
Run sync checklist → deploy backend → push frontend. Wait ~1-2 min for Cloudflare.

## Image Management

Images in both projects must match. Add/rename in `HoldYourGround\images\` → copy to `IOWebsite\public\images\` → update JS references → deploy both.
