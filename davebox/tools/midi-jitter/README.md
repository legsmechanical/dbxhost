# dAVEBOx MIDI Jitter Analyzer

Tiny in-browser tool for the Phase 2 A/B verification: captures MIDI arrival timestamps from a USB MIDI source and compares inter-arrival jitter across two runs.

## Run the tool

Web MIDI requires a secure context (won't work from `file://`):

```sh
cd tools/midi-jitter
python3 -m http.server 8080
```

Open <http://localhost:8080> in Chrome or Edge. (Safari has no Web MIDI support.)

Grant the MIDI permission prompt. Pick the Move's USB MIDI input from the dropdown.

## What the test proves

It measures the spread (stddev) of time gaps between consecutive MIDI note-on arrivals while dAVEBOx plays a deterministic clip on ROUTE_EXTERNAL.

- **Mode A (Phase 2 OFF, legacy `ext_queue` path):** notes get bunched onto JS tick boundaries (~10ms granularity). Wide stddev.
- **Mode B (Phase 2 ON, audio-thread drain path):** notes get bunched onto audio block boundaries (~3ms granularity). Tight stddev.

The expected outcome is **B has substantially smaller stddev than A**. That delta is the Phase 2 win, quantified.

## How to run the A/B comparison

### Setup
1. Connect Move via USB-A to your Mac. Confirm "Move" (or equivalent) appears in the tool's MIDI input dropdown.
2. On the Move: load dAVEBOx, set a track to **ROUTE_EXTERNAL**, program a 16-step clip with notes on every step.
3. Start the clip at ~120 BPM (anything works as long as it's steady — the test only needs deterministic note timing).

### Capture A — legacy slow path (Phase 2 sentinel OFF)

Force the sentinel off in JS (one-line tweak):

In `ui/ui.js` line ~3823, change:
```js
S.extSendAsyncEnabled = (typeof shadow_overtake_send_external_async_active === 'function');
```
to:
```js
S.extSendAsyncEnabled = false; // A/B TEST: forced off, legacy ext_queue path
```

Deploy JS only + restart:
```sh
python3 scripts/bundle_ui.py && ./scripts/install.sh
ssh root@move.local "..."  # full restart per CLAUDE.md
```

Reboot Move (Shift+Back doesn't reload JS). Open dAVEBOx. Start the test clip. In the tool: pick the input, set target events (default 200), click **Start capture**. When capture stops, click **Save current as A**.

### Capture B — Phase 2 fast path (sentinel ON)

Restore the original line:
```js
S.extSendAsyncEnabled = (typeof shadow_overtake_send_external_async_active === 'function');
```

Re-deploy JS + reboot. Start the clip. **Start capture**. **Save current as B**.

### Read the result

The A vs B overlay panel shows both histograms and a conclusion line ("B is tighter — Nx jitter reduction"). Click **Download JSON** to keep the raw data for the PR.

## Notes

- Note-on only is checked by default (filters out CC, MIDI clock, note-off so the stats only see note arrivals).
- Web MIDI `event.timeStamp` is `performance.now()`-aligned, sub-ms accurate. Good enough for ms-scale measurements.
- The tool runs entirely in the browser — no server, no upload, no telemetry.
- This is a dev tool — not part of the dAVEBOx module deploy.
