# Troubleshooting

| Symptom | Fix |
|---|---|
| **Sword/hands invisible** | `shared/data.js` missing from `IOWebsite\public\shared\`. Copy from [source](../public/shared/data.js). |
| **Sprites wrong size** | Images in `IOWebsite\public\images\` wrong dimensions. Copy from [source](../images/). |
| **Cloudflare serving old content** | Push frontend git to trigger auto-deploy, or run `deploy.bat`. See [deploy.md](./deploy.md). |
| **"No targets deployed" in wrangler** | `npx wrangler versions deploy --version-id <id>` to activate latest version. |
| **Game won't load / connection errors** | Deploy backend: `npm run deploy` in `HoldYourGround\`. |
| **Changes not showing in browser** | Hard refresh (`Ctrl+Shift+R`) or incognito window. |
| **Sword hits not registering** | Check `sword.js` blade tip/hilt coordinates in `shared/data.js`. Verify `BLADE_TIP_X/Y` and `BLADE_HILT_X/Y` match sprite sheet. |
| **All commands not found** | Ensure running from correct project root. Commands expect `C:\Dev\IOGames\HoldYourGround\` or `C:\Dev\IOWebsite\`. |

## Still Stuck?

Check [deploy.md](./deploy.md) for the full deploy procedure, [server-architecture.md](./server-architecture.md) for server-side debugging, or [client-architecture.md](./client-architecture.md) for rendering/asset issues.
