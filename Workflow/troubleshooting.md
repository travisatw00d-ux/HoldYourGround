# Troubleshooting

| Symptom | Fix |
|---|---|
| **Sword/hands invisible** | Blade constants in `game-data.js` wrong or sprite sheet missing frames. Check `BLADE_TIP_X/Y`, `BLADE_HILT_X/Y` match sprite. |
| **Knight sprites wrong size** | `KnightSheet.png` dimensions don't match `KnightSheet.json`. Regenerate with animation creator tool. |
| **HUD elements offscreen** | `hud-layout.json` coords or `hudScale` range wrong. Toggle J key for debug boundaries. |
| **Network errors / won't connect** | Backend not deployed. Run `npm run deploy` in `HoldYourGround\`. |
| **Sword hits not registering** | Server `sword.js` blade constants don't match `game-data.js`. Keep both in sync. |
| **Animation plays wrong arc** | The attack needs `lerpPosePolar` instead of a straight lerp. Check `anims.js` blend function. |
| **Remote player sword spins 360°** | `shortAngleDelta` not used in the return-to-idle blend path. |
| **Changes not showing** | Hard refresh (`Ctrl+Shift+R`) or incognito. Build version mismatch — client polls `/version`. |
| **Cloudflare serving old content** | Push frontend git to trigger auto-deploy. See [deploy.md](./deploy.md). |
| **Game won't load / "No targets deployed"** | `npx wrangler versions deploy --version-id <id>` to activate. |

## Still Stuck?

Check [editing-client.md](./editing-client.md) or [editing-server.md](./editing-server.md) for the right file to edit. See [deploy.md](./deploy.md) for deploy procedure.
