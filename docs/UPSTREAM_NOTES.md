# Upstream Notes (fork → upstream prep)

Running log of fork-main commits that are candidates to PR upstream
(`charlesvestal/schwung`), with what/why, dependencies, and an upstream-readiness
flag. Goal: when we eventually open upstream PRs, we don't have to re-derive what
each change is or accidentally carry a **fork-only divergence** (see the
"⚠️ Fork-only divergences" section in `CLAUDE.md`) into a public PR.

Legend: ✅ ready to PR · 🟡 portable but needs care · ⛔ fork-only, never upstream.

Most recent first. Hashes are fork-main commits.

---

## Module User Presets (per-component preset snapshots) — ✅

Self-contained feature; no fork-only dependencies. Good first upstream PR.

- `99927d81` **feat(shadow): live audition of module presets on scroll, revert on cancel**
  — Scrolling the `[User Presets]` list applies the highlighted preset live
  (debounced ~150ms via a `tickPresetPreview` call from the global tick); **Back**
  reverts to the slot's original `<prefix>:state` captured on entry, the detail
  screen's **Load** commits. Self-gates on its own pending state (no `view` guard
  — that proved unreliable in `globalThis.tick`). `src/shadow/shadow_ui_presets.mjs`
  + `shadow_ui.js`.
- `fdba2082` **feat(shadow): tuck User Presets row under its loaded module**
  — Moves the `[User Presets]` row from the top of the component picker to an
  indented row directly beneath the loaded module, cursor-defaulted there. Dropped
  the module abbrev from the label (context is implicit).
- `de6eaf85` **Add per-component User Presets to the shadow UI**
  — The base feature. Shift+Click any loaded chain component → picker →
  `[User Presets]` → per-component, per-module save/load/delete of the component's
  `<prefix>:state` blob, stored at `presets/<module-id>/<name>.json`. Generic
  across synth/fx/midi_fx; no per-module code. `src/shadow/shadow_ui_presets.mjs`
  (new) + `shadow_ui.js`.

Depends on: the host already exposing `<prefix>:state` get/set per component
(present upstream for synth/fx1/fx2/midi_fx1). The live-audition revert relies on
`getSlotStateWithRetry`.

---

## Remote-UI improvements bundle — ✅

Cluster of independent remote-UI (`schwung-manager`) changes. Can go as one PR or
be split. No fork-only deps.

- `454c6370` perf(remote-ui): coalesce the set-preset re-fetch path too
- `cdbc123d` perf(remote-ui): coalesce per-slot param re-fetch across subscribers
- `2f7a126b` fix(remote-ui): stop redundant full-param re-fetch storm; hoist synth metadata
- `e54a40cc` feat(remote-ui): show loading spinner over custom UI until module is ready
- `726dbf55` feat(remote-ui): move Interface toggle + pop-out inline into slot header
- `3b3a3809` feat(remote-ui): pop custom module UI into its own window (direct WebSocket)
- `a733cafd` feat(remote-ui): toggle between custom and default module UI per slot
- `e2a1b039` perf(remote-ui): send custom_ui before slot settings + bulk-seed iframe
- `04c0a9f3` fix(remote-ui): same-origin framing + re-push state on preset/slot change

---

## Co-run / overtake LED ownership — 🟡

Generally portable co-run improvements, but **coordinate with upstream**:
`7d44ed06` grows `CONTROL_BUFFER_SIZE` (72→76) for `corun.led_keep_mask`, and
`FORKING.md` says struct-size bumps must be coordinated upstream.

- `7d44ed06` feat(corun): per-surface LED ownership via `led_keep_mask`, incl. RGB-sysex LEDs
  — decouples input vs LED ownership; handles Move's RGB-sysex LEDs. (struct grow)
- `52bcc3d7` feat(overtake): give overtake tools full LED ownership when Move's sequencer runs
  — classifies step notes 16-31 as a co-run surface so step LEDs/input are owned correctly.

---

## FX buses — 🟡 (mixed: must be split for upstream)

- `28b44126` **feat(fx): Send FX + Move FX buses + generic FX-bus picker**
  — **Send FX** (2 post-fader buses A/B + generic FX-bus picker) is ✅ upstreamable.
  — **Move FX** (4 per-Move-track insert buses) and the **fx3/fx4** chain-insert
  routing it carries are part of the ⛔ **fork-only 4-block divergence** (`MOVE_FX_BLOCKS=4`,
  slot synth-chain 2→4). For upstream, this commit must be split so only Send FX
  (built on the upstream 2-block model) goes out.

---

## ⛔ Fork-only — DO NOT upstream

- `2e6b91d9` **fix(chain): route fx3/fx4 get_param so slot FX blocks 3-4 open their param page**
  — Pure fork divergence: exists only because the fork raised the slot synth-chain
  from 2→4 audio-FX blocks. Mirrors fx1/fx2 get_param routing for fx3/fx4. Keep out
  of upstream PRs (would have nothing to attach to on the 2-block upstream).

See `CLAUDE.md` → "⚠️ Fork-only divergences (never push upstream)" for the full
list (Move FX = 4 insert blocks; slot synth-chain = 4 audio-FX blocks) and the
isolating commits.

---

## Build / minor — ✅

- `df488264` **build: host target depends on all `src/host/*.h`**
  — Make the host build target depend on every `src/host/*.h` so header changes
  trigger a rebuild. Trivial, portable.

---

## MIDI_IN inject crash + hardening (2026-06-18)

Investigated a hard device crash (MoveOriginal SIGABRT) hit by suspending an
overtake tool (davebox, Clock Follow) mid-transport-arming. Root cause: the
`/schwung-midi-inject` ring is de-facto **multi-producer** (shim overtake-exit
cleanup + davebox MovePlay/JS host) but was single-writer in code → a torn slot
(cable=0/CIN=0) reaches Move firmware → SIGABRT. Confirmed via shim backtrace
(abort on a MoveOriginal worker thread; shim only the signal handler).

- **Crash fix = upstream PR #106** (flagist0) — "MPSC-safe ring for
  /schwung-midi-inject". Makes the inject ring a bounded MPSC queue (alloc/commit
  cursors; single `shadow_midi_inject_push` helper). **Cherry-picked onto fork
  main** (clean, no conflicts) and **verified on-device** (our repro that
  crashed reliably no longer crashes, with no other change). **Our own
  arming-guard fix (PR #124) was closed as superseded** — it was a narrower
  workaround (defer the cleanup batch during arming) for the same race #106 fixes
  properly. When #106 merges upstream and we sync, the cherry-pick dedupes.
- **Filter — our PR #125** (`fix(shim): drop garbage MIDI_IN forwards to overtake
  tools`, draft, off upstream/main). **Distinct path**: torn reads of the
  *unfiltered hardware* MIDI_IN buffer forwarded *to overtake tools* via
  `shadow_ui_midi_publish` (not the inject ring → Move). #106 doesn't touch it.
  CIN-aware status-byte guard. Cherry-picked onto fork main. ✅ upstreamable.
- **Backtrace instrumentation** (`crash_signal_handler` → dumps a symbolizable
  stack to `/data/UserData/schwung/shim_crash_bt.txt`). Kept on fork main as a
  diagnostic; candidate for a separate small upstream PR. ✅
- **OPEN follow-up (not fixed): inject-pipe starvation / no QoS.** The inject
  ring is a shared, throttled, flow-control-free side-channel into Move's
  hardware mailbox; under a heavy ROUTE_MOVE note flood (e.g. davebox repeat-mode
  many-pad 1/32) the MovePlay transport-control injects get starved → transport
  won't start/stop reliably + transient desync. #106 makes it crash-safe (drops
  on ring-full instead of corrupting) but adds no priority. Real fix = prioritize
  transport-control injects over note floods (host) + davebox Clock-Follow
  start-handshake robustness (module). See memory `schwung-corun-exit-crash`.

---

_Coverage: this file documents all non-merge fork-main commits not in
`upstream/main` from 2026-06-14 onward. Re-check with
`git log --no-merges upstream/main..main` and append new work here._
