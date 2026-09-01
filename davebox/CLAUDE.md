# dAVEBOx SA — the module

**Working rule:** before acting on any assumed or suggested cause/fix, read the relevant code and
verify the assumption first.

> **Provenance:** ported from the frozen Legacy repo's `CLAUDE.md` on 2026-08-14 and re-verified
> against this tree. The subtree merge (P1, 08-08) carried the code but **not** this file, so for
> six days the module's critical constraints — coalescing, `get_param` from `onMidiMessage`, the
> QuickJS syntax trap — lived only in a frozen repo nobody was working in. Retired sections
> (capability gating, set-duplicate inheritance) were dropped, not copied; paths were corrected
> from Legacy's to SA's.

**The host is `..` — this same repo.** Host + launcher + heal + this module + installer are ONE
deliverable with one version. If the module needs something from the host, **change the host**;
don't design around it. See the root [`CLAUDE.md`](../CLAUDE.md) for host rules, deploy commands
and the architecture.

dAVEBOx is a Schwung **tool module** (`component_type: "tool"`) for Ableton Move — a standalone
8-track MIDI sequencer. No audio of its own. C (DSP) + JavaScript (UI).
`button_passthrough: [79]` + `claims_master_knob: true` — Move firmware handles CC 79 natively, and
`claims_master_knob` stops the host running its own acceleration (which caused inconsistent knob
speed and MIDI-output pauses).

## Build / deploy

```sh
../standalone/scripts/install-sa.sh        # the whole deliverable: host + module. Preferred.
./scripts/build_sound.sh                   # SA module only (DSP + JS)
./scripts/install_sound.sh                 # SA module only, to the device
bash scripts/bundle_ui.sh                  # JS bundle only
nm -D dist/davebox-sound/dsp.so | grep GLIBC   # must be ≤ 2.35
```

- ⚠ **The SA module id is `davebox-sound`** — use the `*_sound.sh` scripts. `install.sh` targets
  `davebox`, the **frozen Legacy id**, and no such directory exists on the device: it would create
  one, report success, and change nothing that runs.
  [[schwung-davebox-sa-module-id-is-davebox-sound]]
- ⚠ **Never bundle with `bundle_ui.py`** — the concat leaves inline imports, QuickJS then reports
  "duplicate import binding", and the OLED says "failed to load tool". Use `bundle_ui.sh` (esbuild).
  [[schwung-davebox-bundler-footgun]]
- ⚠ **A module deploy needs a host restart.** Copying a new `dsp.so` / `module.json` in is not
  enough, and swapping the synth out and back does not do it either — the old code stays live and
  the deploy looks like a no-op. [[schwung-module-deploy-needs-restart]]
- **Ask before deploying**, and see [[schwung-ask-before-deploy-if-testing]].
  ⭑ **Both installers now REFUSE over a live standalone session** and mean it — liveness is the
  flock at `/dev/shm/.dbxhost-session.lock` (the supervisor PID; live iff that PID is alive), never a
  marker file. `install_sound.sh` gained this on 2026-08-15, having had **no guard at all** while
  `install-host.sh` always did. ⚠ The old `standalone_active` marker was retired in P4b — testing it
  can only ever answer "clear", which reads like a check and is not one.
  Override with `FORCE=1` (module half) or `--force` (host half): the running session keeps the old
  code and the new code applies at the next launch.
- ⚠⚠ **ALWAYS check versions after a deploy** (Josh, standing — this has bitten more than once).
  Verify by **CONTENT, not exit code**, and pick a signature the compiler cannot erase:
  1. **`md5` the deployed artifact against the local build** — unambiguous, no signature to choose.
  2. If you must grep, use a **long, unique** string the change introduces (`slot:pan`, a path, a
     log line). ⚠ **A short `strcmp` literal is INLINED and never reaches `.rodata`** — grepping
     the deployed shim for `pan` returns 0 even when the pan code is present, while its longer
     siblings (`volume`, `send_a`) show up and make the false negative look proven.
     ⚠ A `static inline` helper (`shadow_pan_gain_l`) lives in a header — no symbol either.
  3. Compare artifact mtime against **source** mtimes, never the commit date — a commit can land
     hours after the edit.
  ⚠ The shim has **TWO copies** (install dir + the `/usr/lib` mirror) — check both, and remember it
  re-maps via LD_PRELOAD only on the next **launch**. ⚠ The SA bundle is `dist/davebox-sound/ui.js`,
  **not** `dist/davebox/`. [[schwung-deploy-verify-signature-must-survive-the-compiler]]
- ⚠ **`build_sound.sh` injects `-DSEQ8_STATE_PREFIX="seq8sa"` and `-DDAVEBOX_MODULE_ID` into BOTH
  halves** (C via `-D`, JS via esbuild `--define`). The two MUST agree or the DSP and its sidecar
  land in different files.

## Local DSP testing (run before deploying)

```sh
tests/run.sh    # compiles seq8.c on the host — no Docker, no Move
```

- **TDD for DSP logic**: add or update a `tests/test_*.c` that *fails* for the bug, then implement
  until green. API + gotchas in `tests/README.md`.
- **First-line check, NOT a substitute for on-device verification.** The harness uses a stub host,
  so it cannot catch host/shim-integration bugs: MIDI inject-drain, SPI/MIDI_IN occupancy, co-run,
  timing under RT load, LEDs, display. [[schwung-dsp-test-harness]]
- davebox is MIDI-only — assert on emitted MIDI, param round-trips and state, never audio.
- ⚠ `tests/run.sh` is not built by `build.sh` — [[schwung-build-doesnt-build-tests]].
- ⭑ **To SEE a screen without a device:**
  `node --import ./tools/audit_loader.mjs tools/audit_screens.mjs <outdir>` renders the REAL
  draw functions (`soundRender`, `drawGlobalMenu`, `drawProjectPadPicker`) to PNGs, using the
  device's own 5×7 font atlas. `tools/audit_mockups.mjs` renders *proposals* through the real
  kit primitives, so a mockup is pixel-truthful.
  ⚠⚠ Use `audit_loader`, **not** `render_loader`: the latter STUBS the host shared modules, so
  every host-chassis screen renders BLANK — which reads as "this screen draws nothing" rather
  than "this screen draws in the other chassis".
  [[schwung-audit-harness-must-not-stub-the-subject]]
- ⚠⚠ For UI work, `node --check` is the WRONG gate — it passes JS that kills `shadow_ui` at eval.
  ⭑ **This is NOT limited to module UI JS — it applies to the HOST's own `src/shadow/shadow_ui.js`
  too.** Proved 2026-08-15: a stray top-level `}` left by an edit made `node --check` exit **0**, and
  on device nothing loaded at all (session up, 19 SHM segments, `boot LED blank: timed out`).
  ⭑ When an edit is supposed to RESTORE a prior state — adding then removing temporary
  instrumentation — that is a round trip, so verify it by diffing the endpoints, not by re-parsing:
  `git diff <rev-before> HEAD -- <file>` must be **EMPTY**.
  [[schwung-node-check-wrong-gate-for-shadow-ui-js]]. Repro silent guard/tick faults by **evaling
  the real `ui_*.mjs` off-device** against stubs
  ([[schwung-offdevice-eval-repro-and-fresh-launch-rig]]).
- ⚠⚠ **`globalThis.tick` SWALLOWS errors** — one missing stub kills every later stage, so a JS test
  can pass against a tick that stopped on line one.
  [[schwung-tick-swallows-errors-late-stages-never-run]]

## Critical constraints — these bite hard

- **Coalescing, ON-DEVICE JS PATH ONLY**: only the LAST `set_param` per audio buffer reaches the
  DSP, and `shadow_send_midi_to_dsp` shares the same delivery channel and also coalesces. In
  `onMidiMessage`, if both fire, the `set_param` is lost. Defer `set_param`s to `tick()` via a
  pending variable (the `pendingRepeatLane` pattern). Multi-field operations need a single atomic
  DSP command. *(The REMOTE path — browser → manager → shadow_param ring — does NOT coalesce:
  serialized synchronous round-trips, 64 KB values. See `docs/reference/REMOTE_UI.md`.)*
- **`get_param` from `onMidiMessage` silently returns null.** It only works from tick/render
  callbacks. Sync JS state from the DSP in the tick/render path instead.
- ⚠⚠ **Every `get_param` costs a FULL SPI FRAME (~2.9 ms).** Slow readback is round trips, never
  DSP work — batch via a digest (`tN_digest`) rather than looping.
  [[schwung-param-roundtrip-is-the-cost]]
- **The host silently drops NEW module-defined global `set_param` keys.** Existing globals (`bpm`,
  `key`, `transport`, `mute_all_clear`…) are grandfathered; a *new* global returns silently and the
  DSP handler never fires. Per-track `tN_*` keys reliably reach the DSP. Workaround: piggyback the
  global onto an existing per-track push (`tN_padmap` sets `active_track` and
  `dsp_inbound_enabled`). Verify a new global arrives with a one-line `seq8_ilog` at the top of
  `set_param` before building on it. ⚠ `host_module_set_param('debug_log', …)` is also unreliable —
  same failure mode.
- **No MIDI panic before `state_load`** — it floods the MIDI buffer and drops the load param.
- **Shift+Back does not reload JS** — `init()` re-runs in the same runtime. A full restart is
  required for JS changes.
- **`reapplyPalette` resets CC LED hardware state**: the host's `src/shared/input_filter.mjs`
  `buttonCache` holds the stale colour, so later `setButtonLED` calls are silently dropped. Call
  `setButtonLED(cc, colour, true)` after every `reapplyPalette` for persistent button LEDs.
- **Palette SysEx rate-limit**: gate updates to the `POLL_INTERVAL` cadence and use
  `ccPaletteCache` to skip unchanged SysEx, or rapid knob turns fill the MIDI queue.
- **ROUTE_MOVE external MIDI bypasses the pfx chain** — injecting causes an echo cascade (Move
  echoes cable-2 back → re-injection → crash). Use ROUTE_SCHWUNG if live external MIDI needs pfx.
- **`pfx_send` from a `set_param` context does NOT release Move synth voices.**
- **`get_clock_status` is NULL**; `get_bpm` doesn't track BPM changes while stopped.
- ⚠ **Never call `seq8_ilog` from the audio thread** — [[schwung-davebox-rt-logging-footgun]].

## QuickJS compatibility

`shadow_ui` runs QuickJS, not V8.

- **Member expressions as object keys are a SYNTAX ERROR**: `{ S.shiftHeld: val }` → use a plain
  identifier `{ shiftHeld: val }`. This cost a multi-hour debug session once.
- **Confirmed supported**: `??`, spread/rest, `for...of`, `Array.from`, `globalThis`, `Set`, `Map`.

## JS layout and internals

JS modules live under `ui/` — `ui.js` plus 26 `ui_*.mjs` — bundled to `dist/davebox-sound/ui.js`.

- `ui_*.mjs` import each other but **NEVER** `ui.js`. The entry file is init + MIDI dispatch +
  `globalThis` wrappers only; all other logic lives in modules.
- The `ui_record.mjs` ↔ `ui_dsp_bridge.mjs` import cycle is intentional and documented at both
  import sites — cycled bindings may only be referenced **inside function bodies**, never at
  module-init time.
- Tick drain-order constraints are in `ui_tick.mjs`'s header banner — read it before touching
  `_tickImpl`.
- ⚠ **esbuild treats undeclared identifiers as host globals** — a missing import produces NO build
  error, only a runtime `ReferenceError`. When moving code between modules, audit every bare name
  (local, import, `S.*`, or a known host global).
- **Two-tick deferred pattern** (`_toggle` / `_set_notes`): activate the step on tick N, write notes
  on N+1. The phase-2 check must precede phase-1 in `tick()`.
- `pendingDrumResync` is deferred 2 ticks after a drum clip switch; `pendingStepsReread` 2 ticks
  after `_reassign` / `_copy_to`.
- `bankParams[t][b][k]`: 7 banks, refreshed via `tN_cC_pfx_snapshot`. Track config uses dedicated
  arrays + `readTrackConfig`/`applyTrackConfig` — **not** `bankParams`.
- **JS tick rate ≈ 94 Hz** on device; `STEP_HOLD_TICKS=19` is calibrated for it. Older constants
  assume 196 Hz.
- ⚠ **There are TWO objects called `S`** — [[schwung-davebox-two-state-objects]].

## State persistence

DSP state **v=36**. On a mismatch (`v>0 && v≠36`) a confirm dialog asks before erasing; "No" exits
the module with the file preserved. **Backward compatibility matters** — prefer migrating old
fields in `seq8_load_state` over bumping. See `dsp/CLAUDE.md` for the key list.

⭑⭑ **The storage model (since 2026-08-12): ONE directory per project.** State lives in
`Sets/<uuid>/dAVEBOx/`, and the library swap is ONE bind mount — copy is a copytree, delete is a
single rmtree. **Never reintroduce pruners, a name index, or set-duplicate inheritance**; all three
were deleted deliberately. [[schwung-state-colocation-model]]

JS `init()` reads the UUID and compares it with the `state_uuid` `get_param`. A mismatch →
`state_load=UUID` next tick → `pendingDspSync=5` → `syncClipsFromDsp()` → `restoreUiSidecar(true)`.
The same path fires on resume when the set changed while suspended.

UI sidecar (`seq8sa-ui-state.json`) v=8 — per-track active bank, per-track octave, Euclid memory,
drum vel-zone arm; written on suspend / Quit / Shift+Back, wiped on Clear Session. Deferred save:
handlers set `inst->state_dirty = 1` and JS `pollDSP()` writes via `host_write_file` when dirty.

⚠⚠ **Every state write must be crash-atomic** (temp + fsync + rename). Readers parse with `strstr`,
so a torn file loads as a silently SMALLER project, and only an **inode change** proves temp+rename
in a single-process test. [[schwung-atomic-write-inode-is-the-only-pin]]

## Two manuals — `MANUAL.md` is FROZEN, `MANUAL-SA.md` is live

- **`MANUAL.md`** — dAVEBOx as an ordinary tool inside official Schwung. Frozen at its final
  release under that model. **Never edit it, never port changes into it.**
- **`MANUAL-SA.md`** — dAVEBOx SA. The only manual under development. Edit the draft
  `docs/working/MANUAL-SA.draft.md` in the same commit as any `feat:`/`fix:` that changes
  user-visible behaviour; `scripts/cut_release.sh` promotes the draft at release time. Never
  hand-edit the published file.
- ⚠ **`cut_release.sh` must never write or stage `MANUAL.md`.** It used to promote into it, and
  restoring that target would silently overwrite the frozen manual with a document describing
  features Legacy does not have. **`tests/test_manual_freeze.sh` pins this**, and runs from
  `tests/run.sh`.
- Skip the draft for internal-only changes (refactors, DSP plumbing, build, debug logging).
- Keep it lean and user-facing — [[schwung-davebox-manual-lean-userfacing]].
- ⭑ **The browser Help page IS the draft.** `scripts/gen_help.py` splits it (plus `QUICKSTART.md`)
  into one page per chapter under `$DBX_DIR/help/`, which `schwung-manager` renders at `/help`;
  `install-host.sh` regenerates it on every host deploy, and mirrors that one directory rather
  than merging it so a renamed chapter cannot linger. So the Help site cannot drift from the
  manual — but equally, **never hand-edit `help/`**: it is a build artifact, and the next deploy
  deletes it. Cross-references are rewritten from the manual's GitHub anchors, which means
  `slugify()` in `gen_help.py` and in `schwung-manager/help.go` must stay identical
  (`tests/test_help_generation.sh` + the manager's `help_test.go` pin both ends).

## Two changelogs, both `[Unreleased]`

For every `feat:`/`fix:` commit add an entry under the right subsection in **both**:
- `CHANGELOG.md` (tracked, **user-facing**) — short and plain-language; this ships as release notes.
- `notes/tech-changelog.md` (gitignored, **technical**) — DSP keys, struct names, root-cause/fix
  mechanics. The deep archive of why and how. ⚠ **`notes/` does not exist in this tree** — it was
  gitignored, so the subtree merge did not carry it; the Legacy repo still has it. Recreate it here
  or drop the convention, but don't assume the file is present.

`scripts/cut_release.sh` finalizes both. An empty `CHANGELOG.md [Unreleased]` aborts the cut; a
missing `notes/tech-changelog.md` only warns.

## Reference docs

- `docs/reference/DAVEBOX_API.md` — parameter keys, structs, algorithm details.
- `docs/reference/SOUND_MODE.md` — the sound-mode / Track Settings surface.
- `docs/reference/REMOTE_UI.md` — the `rui_*` snapshot contract (reads are snapshot-only, no WS
  `get_param`), write keys, web coordinate system, invariants.
- `docs/reference/MODULE_HOSTING.md` — hosting a declaring module's own `bank_editor(ctx)`.
- `../docs/UI_LANGUAGE.md` — the OLED UI spec. Compose from the shared primitives; don't draw
  directly.
- `dsp/CLAUDE.md` — DSP logging, build, state keys, deferred save, the setparam split.

⚠ `docs/reference/SCHWUNG_PATCHES.md` and `HOST_SUPPORT_PACKS.md` describe the **pre-merge** world
(patches to an upstream-bound host, packs to ship capability without waiting for upstream). Treat
both as history — the host is this repo.
