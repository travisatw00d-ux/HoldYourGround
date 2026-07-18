# Rendering System

## Canvas Sizing & Viewport

16:9 viewport via `resizeViewport()`. Fullscreen uses `screen.width/height`. HUD scales with 0.471 + 0.529 × (viewH / 1080) formula. Camera zoom clamped [minZoom, 4.0] via mouse wheel.

## Background

Two canvases generated once via `generateBackground()` — dark (`#2a2a35`) for night, light (`#e8e4d8`) for daytime/intermission. 80px grid lines. Swapped per phase in render loop.

## Nighttime World-Edge Fog (`render.js`)

`drawNightWorldEdgeFog()` runs only while `state.matchPhase === 'nighttime'`. It draws charcoal darkness banks anchored to all four arena boundaries, using a continuous inward-fading linear gradient plus overlapping soft radial puffs. The colors stay close to the night background (`#2a2a35`) so the effect reads as encroaching darkness rather than pale smoke.

- Fog is clipped to four 420-world-unit edge bands (or one quarter of a smaller arena), guaranteeing that the central play area remains clear.
- Puff ovals run parallel to their boundary: tall on the left/right edges and wide on the top/bottom edges. Their centers remain on the boundary.
- Puffs drift slowly along each edge and independently pulse in inward depth and opacity using `performance.now()`; the underlying edge gradient remains stationary so coverage never develops gaps.
- Offscreen puffs are culled before drawing.
- Render order is background/landmarks/drops, zombies, players, damage numbers, world-edge fog, then the restored screen-space HUD and overlays. This lets the darkness cover world entities near the boundary while keeping the HUD crisp.

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
