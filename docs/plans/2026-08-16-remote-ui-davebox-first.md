# dbxhost remote UI rework — davebox-first integrated app

> **STATUS 2026-08-16 (end of build session): phases A–E ALL BUILT AND COMMITTED
> (`0e5fbae3`→`7ad8bdfb`); every off-device gate green (Go+C+JS suites, SA cross-compile,
> jsdom smokes). The device was unreachable all session, so EVERY on-device gate is OWED —
> deploy with `install-sa.sh` (WiFi for the host half), then walk the per-phase verification
> in this doc. Deferred by design: D1a bulk seed; stock remote-ui.js/css left dormant.**

## Context

The browser remote UI is broken and stock-shaped. Under a dAVEBOx SA session, `schwung-manager`
(Go, :7700) never even starts — `standalone/scripts/launch.sh` bypasses `shim-entrypoint.sh`, so
anything answering on :7700 is a stale stock leftover. Even when running, the manager hardcodes
the stock `/dev/shm/schwung-*` SHM paths (5 Go string literals) while the SA host publishes
`/dbxhost-*`, so every SHM open fails and the UI hangs on "Connecting to the Move…". Its whole UI
also models stock's world (Slot 1-4 / Master FX / Tool tabs, module store, upstream catalog) —
none of which survives the unified 8-slot bus-vs-chain model, one-host-one-module, and dAVEBOx as
the primary surface.

**Josh's decisions (2026-08-16):** keep the Go manager as transport but rework it davebox-first;
the browser UI becomes ONE integrated dAVEBOx app; scope = (1) sequencer brought current +
UX/perf, (2) 8-track mixer + per-track instrument view, (3) sound editing (chain params).
Projects view + OLED mirror are follow-ups. No stock-compat constraints; host half stays
module-generic where cheap.

**Verified facts that shape the design** (all checked against `main` @ `875d73e3`):
- The manager binary already deploys with the SA install (`install-host.sh` copies all of
  `build/*`); ⚠ verify at implementation that the SA build path actually *produces*
  `build/schwung-manager` — the Go build lives in `scripts/build.sh:99-130`, and `build-host.sh`
  may only build the C halves. If not, invoke the Go build from `install-sa.sh`/`build-host.sh`.
- The host already pushes EVERY chain/bus param change to the web-notify ring:
  `on_param_changed` fires throughout `shadow_chain_mgmt.c` (~:2159-:2296) and is wired to
  `web_param_notify_push` (`schwung_shim.c:4530`). Device→browser mixer sync needs no new host
  plumbing.
- The mailbox already accepts chain slots 0-7 (`SHADOW_CHAIN_INSTANCES=8`); only the manager
  assumes 4.
- `schwung-remote-api.js` already has a standalone non-iframe transport
  (`?schwungStandalone=1&tool=1`) — the integrated app can be the whole page; the iframe
  first-paint trap disappears by construction.
- davebox's rui machinery (snapshot, rev split, rui_dirty, tests) is healthy and 8-track aware;
  the drift is mixer/track-settings/sound/projects, not the sequencer core.

Authoritative references: `davebox/docs/reference/REMOTE_UI.md` (rui contract),
`DAVEBOX_API.md` (key inventory, 1-param-per-SPI-frame ≈2.9ms law), `SOUND_MODE.md`,
`docs/working/TRACK_OWNS_ITS_INSTRUMENT.md` (chain slot = track index; Move bus = track's
CHANNEL, clamped 1..4 — never the track index).

On execution start: copy this plan into `dbxhost/docs/plans/` per repo convention, and log the
arc in `_worklogs/dbxhost.md` + `OUTSTANDING.md` as work proceeds.

---

## Phase A — plumbing (device testable day one)

### A1. SHM prefix into the Go manager
`standalone/config.sh` stays the single source; inject at build via `-ldflags -X`; compiled-in
default stays the STOCK prefix **on purpose** (an unstamped/stale binary under SA must fail
loudly — ENOENT logged on line one — never silently attach to the wrong host's segments). No
runtime probing of both prefixes (silent wrong-host attach is the failure the namespace split
exists to prevent).

- `schwung-manager/shmconfig.go`: `var shmPrefix = "/schwung-"` +
  `func shmPath(name string) string`. Replace the 5 literals: `shmconfig.go:62` (control),
  `shmparams.go:71` (param), `shmwebring.go:52` (web-param-set), `shmwebring.go:146`
  (web-param-notify), `display_overlay.go:22` (display-live). Log resolved prefix at startup.
  (`-s -w` strips symbols, not string data — `strings` gate still works.)
- `-shm-prefix` flag for off-device dev; flag > stamp > default.
- `scripts/build.sh` (BOTH the local-go and docker branches — one shared `GO_LDFLAGS` var):
  `-X main.shmPrefix=${SCHWUNG_SHM_PREFIX:-/schwung-}`.
- `standalone/scripts/build-host.sh`: export `SCHWUNG_SHM_PREFIX="$DBX_SHM_PREFIX"`.
- `standalone/scripts/check-config.sh`: pin (1) build-host.sh exports it, (2) build.sh carries
  the -X flag, (3) shmconfig.go's default is the STOCK prefix (so nobody "fixes" it to
  /dbxhost- and reopens the silent-skew hole).
- `standalone/scripts/install-host.sh` (~:121-154): add `schwung-manager` to the
  `strings | grep -cF "$DBX_SHM_PREFIX"` binary gate.

### A2. SA install launches/owns the manager
`standalone/scripts/launch.sh`:
- Pre-flight (before the SHM wipe ~:170): kill stale managers — `pidof schwung-manager`
  (⚠ never `pkill -f`, it matches the invoking ssh shell), remove stock pid file.
- Start after the SHM wipe, before the MoveOriginal loop:
  `"$DBX_DIR/schwung-manager" -port 7700 -roots /data/UserData/ -base "$DBX_DIR" >> "$DBX_DIR/manager.log" 2>&1 &`
  (⚠ never /tmp for logs — root FS full; rotate ~100KB like shim-entrypoint.sh does).
- Teardown: add to all sidecar kill lists (~:251,:256,:316,:321); in the RELAUNCH branch it must
  die BEFORE the SHM wipe (rm doesn't unmap — a survivor writes into deleted segments).
- `exit-to-stock.sh`: kill ours so stock's entrypoint can bind :7700.
- **New `standalone/scripts/restart-manager.sh`**: build → scp temp → `mv -f` → kill+relaunch →
  tail log. ~10s iteration loop, no session restart. Build this in A — it's the workhorse for
  B–E.

### A3. `-base` flag
`main.go` (~:3342): basePath currently probed as `<root>/schwung`. Add `-base` (default = current
probe) for App/RemoteUI. Module web_ui still resolves via the `$DBX_DIR/modules` symlink →
`tools/davebox-sound/web_ui.html` (`findModuleWebUI`, `remote_ui.go:1434`).

### A4. Verify
- Off-device: `go build/vet/test ./...`; shmPath unit test; check-config.sh green.
- Device: `ls /dev/shm | grep dbxhost` + manager.log shows prefix + all three SHM connects.
- WS probe (node ≥22 built-in WebSocket → `ws://move.local:7700/ws/remote-ui`,
  send `{type:"subscribe_tool"}`): expect `tool_info davebox-sound` <1s, then `param_update`
  frames with `overtake_dsp:rui_*`.
- **Josh gate:** open :7700/remote-ui → Tool tab paints the existing sequencer editor (hang gone).

## Phase B — reshape into one davebox-first app

### B1. Server deletions (main.go routes + handlers + templates)
DELETE: module store/catalog (`/modules*`, `/api/modules*`, catalogSvc, `-catalog-url`),
install/update/download/`/api/open-in-tool`, `/system/check-update|upgrade*`,
`/system/repair*` + `repair_status.go` + `self_heal.go` + `healShimIfStale` (⚠ actively
dangerous under SA — heals `schwung-shim.so`, but this install's soname is `davebox-shim.so`),
`module_config.go` + module settings, templates modules/module_detail/download/install/repair,
`templates/remote_ui.html` (the 6 tabs).

KEEP live (Josh 2026-08-16): `/files` (real dbxhost op), `/ws/remote-ui` + ALL of
remote_ui.go's param bridge (D/E build on it), `schwung-remote-api.js` standalone branch,
`middleware/`, `/system/logs`, **`/mirror` + `/stream-auto` proxy — made FUNCTIONAL (B6)**,
**`/help` — repurposed as the dAVEBOx documentation shell (B7)**.
KEEP retargeted: `/config` (to -base), `/system` info (read-only).
Nav (`templates/base.html`): **dAVEBOx · Mirror · Files · Help · Config · System**.

### B6. Screen mirror — functional, not dormant (Josh 2026-08-16)
The pieces all exist: `display_server.c` (SSE server :7681, reads the display-live SHM at ~30Hz)
+ manager `/mirror` page + `/stream-auto` reverse proxy (`display_overlay.go`, prefix fixed by
A1). To make it live:
- Verify `display_server` is built by the SA build (it lives in `src/host/display_server.c`;
  check `scripts/build.sh` emits it into `build/` so `install-host.sh` ships it — if not, add
  it) and that it composes its SHM path from `SCHWUNG_SHM_PREFIX` (a hardcoded literal there
  gets the same fix as A1's Go literals). Add it to install-host.sh's `strings` prefix gate.
- `launch.sh`: start it as a sidecar with the same lifecycle as the manager (A2's start/kill/
  wipe-ordering rules apply identically).
- Confirm the `shadow_control->display_mirror` gate is on under SA (it feeds the display-live
  segment writer, `schwung_shim.c:5907-5934`); if it's a settings flag, default it on.
- Verify: open :7700/mirror during a live session → live OLED at ~30Hz; check it tracks a
  davebox screen change and the SSE stream survives a session relaunch.

### B7. Help = dAVEBOx documentation shell (Josh 2026-08-16)
Keep the `/help` route + template, gut the stock Schwung content. Serve rendered markdown from a
docs directory shipped with the module (suggest `modules/tools/davebox-sound/help/` so it rides
`install_sound.sh`, or `$DBX_DIR/help/` if it should ride the host half — decide at
implementation by which install script should own doc updates). Shell behaviour: index page
lists whatever `.md` files exist (title from first heading), renders them server-side (the
manager already has html/template; a small markdown renderer or pre-rendered HTML both fine —
prefer pre-rendered at build time to keep the Go binary dependency-free). Empty state:
"documentation coming". Content authoring is explicitly LATER — this arc ships the shell only.

### B2. Landing route
`GET /` → 302 to `/api/remote-ui/module-assets/<id>/web_ui.html?schwungStandalone=1&tool=1` when
the tool is present; else a "waiting for dAVEBOx…" page polling a trivial new `/api/tool`.
(Redirect, not inline serve, so sibling JS/assets resolve against the module dir.)

### B3. Extract the generic chain-param renderer
From `static/remote-ui.js` (2521 lines) kill: tab bar, switchSlot, renderSlot/SlotSettings/
MappedKnobs/MasterFx*/Tool. **KEEP the custom-panel machinery** (Josh 2026-08-16): the module
web_ui discovery (`findModuleWebUI`), the module-asset route, and the iframe + postMessage
bridge in `schwung-remote-api.js` — Phase E hosts a chain module's own `web_ui.html` (e.g.
OB-Xd's panel) in the Sound view. Refactor `renderCustomUI` into a reusable
`mountModulePanel(el, moduleId, slot)` helper rather than deleting it. EXTRACT into new
`static/chain-params.js` (the Phase E asset): knob SVG + drag/throttle, in-place updates,
formatValue/clamp/norm, renderParamItem, renderPresetBrowser, breadcrumb/nav-stack. API:
`window.chainParams.mount(el, {hierarchy, chainParams, values, onSet, prefix})` — no WS, no
globals.

### B4. Split web_ui.html (2410 lines) before it grows
Siblings in `davebox/`, plain ordered `<script>` tags (no bundler — this file is not part of the
ui/ esbuild bundle):
`web_ui.html` (shell) · `web_ui_core.js` (transport, kv cache, parseModel, playhead clock,
MOCK SHIM, DIAG) · `web_ui_seq.js` (grid/roll/drums/CC/conductor/inspector) · `web_ui_mix.js`
(D) · `web_ui_sound.js` (E).
- `davebox/scripts/build_sound.sh:81-82`: copy `web_ui*.js` too.
- Confirm `.js` MIME on the module-asset handler (silent no-execute otherwise).
- Update pins: `tests/host/test_slot_count_is_single_sourced.sh`, node syntax check in
  `davebox/tests/run.sh` covers every new file. NEW shell test: every `web_ui_*.js` is (a)
  copied by build_sound.sh and (b) referenced by a `<script>` tag.
- Mock shim stays in core; its "learn every new field" rule (REMOTE_UI.md §8.9) now covers
  mixer/sound keys.

### B5. Verify
Mock-shim browser preview pixel-identical pre/post split (python3 -m http.server);
`curl -sI :7700/` → 302; app is the page, no chrome. **Josh gate:** the app IS the page.

## Phase C — sequencer current + perf/UX

- **C1 DIAG overlay first** (the instrument): `~` toggle, localStorage-persisted — WS state,
  push age, device rev vs applied, snapshot bytes, delta ratio, suppress-window, playhead
  offset/slew, rui_trunc. Every perf claim gets measured here, not argued.
- **C2 Close the owed device checklist** in `davebox/docs/working/remote-ui-audit-2026-07.md`
  (~:30-36, five hands-on items merged unverified). Failures = Phase C bugs, priority over perf.
- **C3 Drift:** `remote_ui.go:181` componentPrefixes += fx3/fx4 (⚠ fork FX-block rule: check all
  four blocks); slot handling accepts 0-7 with bounds vs 8; `wsSlotInfo` → map keyed by
  component.
- **C4 Perf, in order:** (1) manager-side snapshot DELTA per client (serviceToolClients already
  unmarshals the 64KB map; send changed keys only; ⚠ browser kv is sticky → diff key SETS,
  send removed keys as `""`; full push on reconnect/refetch). (2) WS permessage-deflate
  (rui JSON is highly repetitive; enable after (1) so effects are separable). (3) keep the quiet
  window / writeJSONTry drop-don't-queue / rev gate untouched — load-bearing for WiFi bursts.
  ⚠ Never time-base anything new on receipt time (WiFi bursts 0.3-1.3s); devms only.
- **C5 UX:** never gate first paint on a WS message; connection pill Live / Reconnecting /
  "dAVEBOx not running" (a real SA state — session exited, manager up); confirm
  handleSubscribeTool no longer serialises behind retry ladders.
- **Verify:** Go delta-differ test (add/change/remove/reset); DIAG before/after numbers while
  playing a dense clip + dragging notes. **Josh gate:** feels immediate, hardware glitch-free
  under hard editing.

## Phase D — mixer + per-track instrument view

### D1. Architecture: manager-side merge — nothing mixer-shaped in the DSP snapshot
davebox's DSP doesn't own mixer data (`slot:*` / `move_fx:*` live in host structs); putting it in
the snapshot would mean get_param-per-key on the RT path. Device→browser already works via the
notify ring (verified). 64KB budget untouched; test_rui_budget keeps meaning what it means.
Browser derives addresses from `rui_index` (route/chan per track):
- route 0 (Schwung) → chain slot = TRACK INDEX; keys `slot:volume|pan|send_a|send_b|muted|soloed`.
- route 1 (Move) → bus = `moveBusForChannel(chan)` clamp 1..4 (⚠ the CHANNEL, not the index —
  mirror `ui/ui_engine.mjs:290-325`); keys `move_fx:<bus>:*`.
- route 2 (External) → no strip; grey it, say why.
JS unit test pinning the off-diagonal case (track 6 / chan 2 → bus 2).

### D2. Wire contract
New WS `subscribe_mixer`/`unsubscribe_mixer` (per-client bool, like masterFxSub). Manager
normalises: browser `chain:<0-7>:volume` ↔ mailbox slot=n + `slot:volume`; `move_fx:<1-4>:*`
passes through. One `mixerkeys.go` with a Go round-trip test. Seed on subscribe = ~72 gets in a
goroutine (~210ms serial, acceptable v1).
**D1a (recommended, generic, upstream-offerable): bulk get/set for host keys** — add
req_type 3/4 branch in shadow_chain_mgmt.c's mailbox handler reusing the shim's bulk wire format
(`schwung_shim.c:3934-3945`); seed → ~3ms. ⚠ Runs on the audio thread: WHITELIST strip/plugin
param keys; reject `*:module`, `*:state`, `load`, `preset` (dlopen/alloc). Go side gets
BulkGet/BulkSet; ⚠ struct-offset mirror trap: Go offset test + C `_Static_assert` added
together. If D1a slips, ship the serial seed — don't block the mixer.

### D3. Cross-surface sync
Device→browser: already live via notify ring. Browser→device audio: immediate. Browser→device
OLED: stale until screen re-entry — ACCEPT for this arc (live mirroring would cost
get_param-per-row-per-poll; the right later shape is a single `mix_digest` for the visible
track — follow-up, don't build).

### D0. ⭑ UI LANGUAGE RULE (Josh 2026-08-16, applies to EVERY user-facing string this arc)
"Chain slot", "Schwung chain", "bus", "slot N" are HOST-INTERNAL terms — not davebox vocabulary.
A track OWNS ITS INSTRUMENT (per TRACK_OWNS_ITS_INSTRUMENT.md); the browser copy mirrors the
device's own labels: a track's instrument is shown as the loaded module's NAME (e.g. "OB-Xd"),
or "Move 1..4", or "MIDI" — never "Chain"/"CHN"/"slot 2". Internal terms stay confined to wire
keys, code identifiers, and code comments. Follow `dbxhost/docs/UI_LANGUAGE.md` §5.0 spirit for
naming; when unsure what to call something, use what the device's Track Settings screen calls
it. (Also: record this as a memory when execution starts — it applies beyond this arc.)

### D4. UI (`web_ui_mix.js`)
8 strips in track order: mode glyph, instrument badge (module name / Move N / MIDI — see D0),
fader (0..2×
ceiling per `SLOT_LEVEL_MAX`, not the host's 4× wire clamp), pan, sends A/B, audio M/S.
⚠ TWO mutes, never conflated: `tN_mute/solo` (sequencer, in rui_index, lives on the session
grid) vs `slot:muted`/`move_fx:N:muted` (audio, on the strip, labelled "Audio"). Solo is ONE
exclusive group across chains AND buses — dim all others. No meters (no host telemetry —
follow-up).

### D5. Autosave dirty bit (board item — cross-process gap)
Browser writes ride shim→`shadow_direct_set_param`; dirty masks live in `shadow_ui.c` (other
process). Fix: dedicated 64-byte SHM segment `<prefix>web-write-dirty` (two volatile uint32
masks; shim ORs after successful direct set; shadow_ui drains per tick into
`g_slot_param_dirty_mask` / `shadow_mark_fx_bus_dirty`). Chosen over reusing shadow_control_t
reserved bytes (struct is mirrored in three places). Wiped by the launcher's `/dbxhost-*` glob
like the other rings. Test: browser fader move → exit → relaunch → level survives.

### D6. Verify
Go key round-trip; moveBusForChannel JS unit; bulk whitelist C test (if D1a). Device: OLED knob
turn → WS shows the key <~10ms; browser fader → audible; the bus-vs-index trap case (track 6 set
to Move 2 → bus 2 moves, not bus 4); persistence round trip. **Josh gate:** mix the session from
the browser and the hardware agrees.

## Phase E — sound editing

- Reuse the manager pipeline: `handleGetHierarchy` takes `{slot, component}` for ARBITRARY
  component strings (host already routes `move_fx:<bus>:fx<blk>:<key>` — same component keys
  shadow_ui.js builds). Enumeration: chain slot n → synth, fx1..fx4, midi_fx1; Move bus b →
  `move_fx:<b>:fx1..fx4` (no synth — Move's own instrument stays a device surface this arc).
- Browser renders via `chain-params.js` (B3), transport = setParam with D2 namespace.
- **Custom module panels (Josh 2026-08-16):** when the selected track's SYNTH module ships its
  own `web_ui.html` (obxd, palette, etc.), the Sound view's synth card hosts that panel via the
  B3-preserved iframe pipeline (`mountModulePanel`; assets at
  `/api/remote-ui/module-assets/<id>/…`; postMessage bridge with slot-scoped param routing —
  the iframe's `setParam("cutoff")` must resolve against the SELECTED track's chain slot, so
  the bridge carries the slot index the way the stock per-slot subscribe did). Generated editor
  is the fallback when no panel exists. FX blocks always use the generated editor. Mirrors the
  on-device rule: davebox hosts a declaring module's own canvas.
  ⚠ Verify against one real panel (obxd) on device: panel loads in the card, edits reach the
  right slot when two chain tracks host the same module, and the instant-render rule holds
  (panel paints before values arrive).
- Scope fence: functional param editor + hierarchy breadcrumb + preset browser where declared.
  NO LFO editor, NO knob-assignment editor (davebox's absorbed screens), NO canvas hosting.
  A component without `chain_params` metadata degrades VISIBLY (key + text field), never
  silently. Custom-panel hosting is scoped to display+edit only — no panel-driven preset
  management beyond what the panel itself does over setParam.
- Verify: browser cutoff drag audible + OLED Sound Control agrees; Move-bus insert edit reaches
  the bus; preset step re-pushes full component (existing 120ms-throttled resend path).
  **Josh gate:** dial a sound from the browser.

## UX outline (one page, three views, persistent header)
Header: transport ▶/■ + BPM + bar:beat · project/clip name · connection pill · view switcher
**Sequencer | Mixer | Sound** · DIAG toggle.
Sequencer = landing view (today's layout). Track selection is GLOBAL (click any track header);
Mixer and Sound follow it. Mixer strips' instrument badge jumps to Sound. Sound = the track's
instrument + FX laid out left-to-right (MIDI FX → instrument → FX 1..4; for a Move-routed track,
a "Move N — edit on device" card → its FX 1..4) with the track's mixer strip inline at the right
edge (matching the device's own track screen — same mental model as hardware). All labels per
D0's vocabulary rule (instrument names, never chain/slot terms). Rules: no modal blocks the
playhead; view switches mount from cached kv instantly; nothing requires a round trip to render.

## Traps ledger (consolidated)
SHM prefix skew → stock default + stamp + check-config pins + strings gate ·
stale stock manager → pidof pre-flight + exit-to-stock release · pkill -f matches own shell ·
manager must die BEFORE SHM wipe on relaunch · Go↔C offset mirror → paired tests ·
no new snapshot fields (RT cost) · bulk on audio thread → whitelist ·
Move bus = channel not index · two mutes never conflated ·
sticky kv + deltas → key-set diff, removed = "" · WiFi bursts → devms only ·
new GLOBAL set_param keys silently dropped by host (ride tN_* or grandfathered) ·
any new DSP mutation must rui_mark (extend test_rui_rev same commit) ·
node --check is a lint, mock-shim browser preview is the gate ·
md5 deployed artifacts, never exit codes / short grep literals · never /tmp on the Move.

## Out of scope (follow-ups, noted for the board)
Projects view (header project name = click target with nothing behind it yet) · Help CONTENT
(shell ships this arc, docs authored later) · live OLED mirroring of browser mixer edits
(mix_digest) · level meters · upstream-PR extraction (3 generic commits: shm-prefix stamp,
snapshot delta + WS compression, host-key bulk — keep each module-clean per docs/UPSTREAM.md).

## Critical files
`schwung-manager/remote_ui.go` · `schwung-manager/main.go` · `schwung-manager/shmconfig.go` +
`shmparams.go` + `shmwebring.go` + `display_overlay.go` · `schwung-manager/static/remote-ui.js`
(→ chain-params.js) · `standalone/scripts/launch.sh` + `build-host.sh` + `check-config.sh` +
`install-host.sh` (+ new `restart-manager.sh`) · `scripts/build.sh` ·
`davebox/web_ui.html` (→ split) · `davebox/scripts/build_sound.sh` ·
`davebox/ui/ui_engine.mjs` (authoritative mixer addressing to mirror) ·
`src/schwung_shim.c` + `src/host/shadow_chain_mgmt.c` (D1a bulk + D5 dirty segment only).
