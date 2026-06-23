# How To Full Deploy

This project has TWO separate deploy targets. You must update **both** when changing frontend files.

---

## Architecture Overview

| Component | Location | Hosting | Deploy Method |
|---|---|---|---|
| **Backend** (game server) | `C:\Dev\IOGames\HoldYourGround\` | fly.io | `npm run deploy` |
| **Frontend** (website) | `C:\Dev\IOWebsite\` | Cloudflare Workers | `git push origin main` (auto-deploys) |

The **backend** serves:
- WebSocket game server (Socket.IO)
- Health endpoint (`/health`)
- Image files (`/images/`)

The **frontend** serves:
- HTML pages
- JavaScript game client
- CSS styles
- Image files (`/images/`)

Both projects have their own copy of the game files. When you change frontend code, you must sync them.

---

## Deploying Backend Changes Only

If you only changed server logic (files in `server/`, `server.js`, `package.json`, etc.):

```bash
cd C:\Dev\IOGames\HoldYourGround
npm run deploy
```

This runs `fly deploy --no-cache` and updates the live game server at fly.io.

---

## Deploying Frontend Changes Only

If you only changed client-side files (HTML, JS, CSS, images in `public/`):

### ⚠️ CRITICAL — Copy ALL changed files

The frontend project (`IOWebsite`) is a **separate copy** of the game files. You must manually sync changes.

Minimum files to copy (adjust paths as needed):

```bash
# Copy game code
copy "C:\Dev\IOGames\HoldYourGround\public\holdyourground\game.js" "C:\Dev\IOWebsite\public\holdyourground\game.js"
copy "C:\Dev\IOGames\HoldYourGround\public\holdyourground\index.html" "C:\Dev\IOWebsite\public\holdyourground\index.html"
copy "C:\Dev\IOGames\HoldYourGround\public\holdyourground\modules\*.js" "C:\Dev\IOWebsite\public\holdyourground\modules\"

# Copy shared data (ITEM_VISUALS, ANIMATIONS, ZOMBIE_VISUALS, blade coords, etc.)
# MISSING THIS FILE = invisible swords, hands, and items!
copy "C:\Dev\IOGames\HoldYourGround\public\shared\data.js" "C:\Dev\IOWebsite\public\shared\data.js"

# Copy styles
copy "C:\Dev\IOGames\HoldYourGround\public\style.css" "C:\Dev\IOWebsite\public\style.css"

# Copy images
copy "C:\Dev\IOGames\HoldYourGround\images\*.png" "C:\Dev\IOWebsite\public\images\"
```

> **⚠️ Don't forget `public\shared\data.js`!** This file defines `ITEMS`, `ITEM_VISUALS`, `ANIMATIONS`, `ZOMBIE_VISUALS`, `BLADE_TIP_X/Y`, and `BLADE_HILT_X/Y`. Missing it causes swords, hands, and items to be invisible. The game will run but nothing will render visually.

### Step 2 — Deploy to Cloudflare

```bash
cd C:\Dev\IOWebsite
git add -A
git commit -m "Describe your changes"
git push origin main
```

Cloudflare Workers auto-detects the push, runs `next build` (generates `out/`), and deploys.

### Fallback — Manual deploy (if auto-deploy fails)

```bash
cd C:\Dev\IOWebsite
double-click deploy.bat
```

This runs `next build` followed by `npx wrangler deploy` using the API token stored in `.env`.

---

## Full Deploy (Both Backend + Frontend)

Use this checklist when you changed BOTH server and client code:

- [ ] 1. Make your changes in `C:\Dev\IOGames\HoldYourGround\`
- [ ] 2. Copy ALL changed frontend files to `C:\Dev\IOWebsite\public\`
  - `HoldYourGround\public\holdyourground\` → `IOWebsite\public\holdyourground\`
  - `HoldYourGround\public\shared\data.js` → `IOWebsite\public\shared\data.js` (⚠️ critical!)
  - `HoldYourGround\public\style.css` → `IOWebsite\public\style.css`
  - `HoldYourGround\images\*.png` → `IOWebsite\public\images\`
- [ ] 3. Deploy backend: `npm run deploy` in `HoldYourGround\`
- [ ] 4. Commit & push frontend: `git push origin main` in `IOWebsite\`
- [ ] 5. Wait ~1-2 minutes for Cloudflare auto-deploy to complete, OR run `deploy.bat` for immediate deploy
- [ ] 6. If `deploy.bat` says "No targets deployed", activate manually:
     `npx wrangler versions deploy --version-id <id>`
- [ ] 7. Test in incognito window at `https://iolegends.com`

---

## Adding or Renaming Images

Images must exist in BOTH projects:

| Project | Image folder |
|---|---|
| Backend | `C:\Dev\IOGames\HoldYourGround\images\` |
| Frontend | `C:\Dev\IOWebsite\public\images\` |

If you add a new image:
1. Place it in `HoldYourGround\images\`
2. Copy it to `IOWebsite\public\images\`
3. Update both projects' JS files to reference it
4. Deploy both (backend + frontend)

If you rename an image (to force cache refresh):
1. Rename the file in `HoldYourGround\images\`
2. Update `HoldYourGround\public\holdyourground\modules\render.js`
3. Copy to `IOWebsite\public\images\` with the new name
4. Update `IOWebsite\public\holdyourground\modules\render.js`
5. Deploy backend + frontend

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Player visible but **sword/hands invisible** | `shared/data.js` missing from `IOWebsite\public\shared\`. Copy from `HoldYourGround\public\shared\data.js`. |
| Hands/Images huge or wrong size | Check if `IOWebsite\public\images\` has the correct file dimensions (64×78 for hands, ~4-5KB). Copy from `HoldYourGround\images\` if wrong. |
| Cloudflare serving old content | Push to frontend git repo to trigger auto-deploy, or run `deploy.bat`. |
| "No targets deployed" during manual deploy | Run `npx wrangler versions deploy --version-id <id>` to activate. |
| Game won't load / connection errors | Deploy backend: `npm run deploy` in `HoldYourGround\`. |
| Changes not showing after deploy | Hard refresh (`Ctrl+Shift+R`) or test in incognito. |

---

## Quick Reference

```bash
# Backend deploy
cd C:\Dev\IOGames\HoldYourGround
npm run deploy

# Frontend auto-deploy
cd C:\Dev\IOWebsite
git add -A && git commit -m "msg" && git push origin main

# Frontend manual deploy (fallback)
cd C:\Dev\IOWebsite
deploy.bat
```
