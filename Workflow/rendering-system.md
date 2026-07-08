# Rendering System

## Canvas Sizing & Viewport

16:9 viewport via `resizeViewport()`. Fullscreen uses `screen.width/height`. HUD scales with 0.471 + 0.529 × (viewH / 1080) formula. Camera zoom clamped [minZoom, 4.0] via mouse wheel.

## Background

Two canvases generated once via `generateBackground()` — dark (`#2a2a35`) for night, light (`#e8e4d8`) for daytime/intermission. 80px grid lines. Swapped per phase in render loop.

## Camera (`camera.js`)

Follows `state.myId` (or spectating target). Interpolated position using `alpha` snap (based on server interval). Clamped to arena bounds. Dead spectators cycle targets via Arrow keys.

## Sprite Caching (`render-entity.js`)

`getSpriteFromSheet(sheet, drawW, drawH, frame)` — renders sprites to offscreen canvas at 2× resolution, cached by `frame.x_y_wxh_drawWxdrawH` key.

## HUD Layout (`hud.js`)

`hud-layout.json` defines all HUD element positions, scales, zIndex, fill areas. `drawHUD()` renders sorted by zIndex:
- Health/Energy/XP bars with custom clip-path fill shapes and gradients
- Attack highlight glow (Jab/Swing toggle, green radial gradient when ready)
- Phase name + timer text overlays
- Player name, level, stats hotkey text

See [animation-system.md](./animation-system.md) for entity drawing pipeline.
