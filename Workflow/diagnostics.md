# Diagnostics System

## Client Overlay (`diag.js`)

Cycled via H key: hitbox → diag overlay → off → hitbox. Shows:
- FPS + frame time (cyan <20ms, yellow ≥20ms)
- Ping (green <80, yellow <150, red ≥150)
- Arrival/server intervals, RAF gap, packet size

## Heartbeat & Stalled Tab Detection

- Every 600 frames (~10s), client emits `clientDiag{ event:'frame', frames, stateAge, phase, socketId }` → written to `Workflow/diag-{name}.jsonl`
- If no `state` event for 8s → emits `clientDiag{ event:'stalled' }`
- Tab visibility changes also logged
- Build version polling: fetches `/version` every 8s, reloads on mismatch

## Server-Side Logging

`clientDiag` socket event handler writes JSONL to `Workflow/diag-{name}.jsonl`.
Test mode also writes structured events to `Workflow/diag-log.json` (NDJSON).
Trace files in `scenarios/` embed the diag log for post-mortem analysis.

## Quick Check

Open devtools console: `state.diag.lastPacketBytes`, `state.fps`, `state.ping`.
