# Fork-local patches

Re-appliable patches for **fork-only divergences** carried on fork `main`. They
must be **re-applied on every rebase** onto `upstream/main`. **Fork-only — never
include `patches/` in an upstream PR** (see [[schwung-never-push-claudemd-upstream]]
/ `CLAUDE.md` → "⚠️ Fork-only divergences"). Committed here so they're backed up on
the fork remote.

## fx-blocks-local.patch

Our extra FX-block work — a 2-commit `format-patch` series:

- `0d6402b6` **feat(fx): Send FX + Move FX buses + generic FX-bus picker** (2026-06-14)
- `7ba06ccc` **fix(chain): route fx3/fx4 get_param** (slot synth-chain blocks 3–4, 2026-06-17)

⚠ **Identify these by SUBJECT, not by hash.** The hashes above were `87a997d3` / `72f8f641`
until a rebase over upstream's rewritten history renumbered them, and the stale pair reads as
"the FX work is missing" when it is present and running. Upstream rewrites history on every
release ([[schwung-upstream-rebases-history]]), so expect these to drift again — re-find with
`git log --grep` on the subject, or `git log -S "MOVE_FX_BLOCKS 4"`.

⚠ `0d6402b6` also **absorbed the standalone 2→4 block bump** (once `ab5ec6da`), so the isolation
that commit existed to provide no longer exists — see `CLAUDE.md` → Fork-only divergences.

Split of what's permanent vs temporary:

- **Send FX** is upstreamable — draft PR `charlesvestal/schwung#121` (parked; Charles
  needs review time). Retire this half once #121 merges.
- **Move FX** (`MOVE_FX_BLOCKS=4`) and **slot fx3/fx4** are ⛔ **permanent fork-only**
  (the 4-block divergence — `CLAUDE.md`). Keep forever.

### Re-apply on rebase

After rebasing fork `main` onto `upstream/main` (merged dup commits auto-drop):

```sh
git apply --3way patches/fx-blocks-local.patch
# Expect a ONE-TIME conflict in src/shadow/shadow_ui.js: Send FX and fx3/fx4 both
# edit it, against upstream's moved (merged presets/corun) version. This is inherent
# to the entanglement, not a patch defect. Resolve it, then:
git add -A && git commit -m "Re-apply fork-local FX blocks (patches/fx-blocks-local.patch)"
```

Then **regenerate** so the patch tracks the new base:

```sh
git format-patch -1 <send-fx-hash> --stdout >  patches/fx-blocks-local.patch
git format-patch -1 <fx34-hash>    --stdout >> patches/fx-blocks-local.patch
```

> `git am --3way` is stricter than `git apply --3way` and conflicts even on the first
> commit — prefer `git apply --3way` (fewer conflicts, then a single fork-local commit).

## remote-ui-overtake-tools.patch

Host-side bridge so the **schwung-manager** web UI serves a tool module's
`web_ui.html` remote UI for the **active overtake tool**, reached via the shim's
existing `overtake_dsp:` param prefix. **Entirely in `schwung-manager/`** (no
shim/host-C change); fully generic with no module-specific assumptions.

**Upstreamed as PR `charlesvestal/schwung#148`** (single squashed commit off
`upstream/main`) — carried here as a patch only until that merges. A tool module
pairs by flipping its `web_ui` prefix `synth:`→`overtake_dsp:` and answering
`get_param("module_id")`.

### Re-apply on rebase

Manager-only files don't entangle with upstream's host source, so a clean apply is expected:

```sh
git am --3way patches/remote-ui-overtake-tools.patch
# If git am balks, fall back to a squashed apply:
#   git apply --3way patches/remote-ui-overtake-tools.patch && git add -A && \
#   git commit -m "Re-apply remote-ui-overtake-tools (patches/remote-ui-overtake-tools.patch)"
```

Then **regenerate** so the patch tracks the new base (single squashed commit):

```sh
git format-patch -1 <replayed-commit> --stdout > patches/remote-ui-overtake-tools.patch
```

## remote-ui-responsivity.patch

A responsivity + hardware-load follow-up **on top of `remote-ui-overtake-tools`**
(apply the bridge first). Replaces the per-client browser-driven `refetch_tool`
poll with a single **server-side `toolTickLoop`** in `schwung-manager`:

- **No busy-escalation** — reads the cheap `rui_poll` digest with `TryGetParam`
  and, on mutex-busy, SKIPS the tick instead of falling back to the heavy full
  `state` read (the old code did the most expensive read exactly under
  contention, self-amplifying on the RT-shared shm channel).
- **Coalesced** — one `state` read per rev change fanned out to every stale
  Tool-tab client (N tabs = 1 read, not N).
- **Unload signal** — emits `tool_info(gone)` once when the overtake tool
  unloads, so the Tool tab clears its iframe instead of polling a dead module.
- **Adaptive cadence** (~100 ms active / 400 ms idle / 500 ms no clients) →
  tighter device→browser sync than the old 150–500 ms browser poll without
  raising steady-state shm traffic.
- `fetchAllParams` logs a warning when a `state` snapshot truncates at the 64 KB
  param cap (otherwise a silent invalid-JSON drop that freezes the remote UI).

**Manager-only and fully generic** (no module-specific assumptions; a tool that
predates `rui_poll` still works via the coalesced full-fetch path). Intended as a
follow-up on **PR `charlesvestal/schwung#148`** (fold in there, or land as its own
commit once #148 merges). Depends on the bridge's `rui_poll`/`state`/`module_id`
contract, so it does **not** apply on stock upstream alone.

### Re-apply on rebase

Manager-only, applies cleanly after the bridge patch:

```sh
git am --3way patches/remote-ui-overtake-tools.patch      # bridge first
git am --3way patches/remote-ui-responsivity.patch        # then this
# If git am balks, fall back to a squashed apply:
#   git apply --3way patches/remote-ui-responsivity.patch && git add -A && \
#   git commit -m "Re-apply remote-ui-responsivity (patches/remote-ui-responsivity.patch)"
```

Then **regenerate** so the patch tracks the new base:

```sh
git format-patch -1 <replayed-commit> --stdout > patches/remote-ui-responsivity.patch
```

### Status & follow-ups (2026-07-18)

- **Off-host verified:** `go build` + `go vet` clean (go 1.26 Docker). Concurrency: the ticker is the sole
  driver of the per-client `toolSynced/toolLastRev/toolLastTick` cursors (all under `c.mu`, never held across a
  `writeJSON`); `handleRefetchTool` is a no-op.
- **Deployed to a device 2026-07-18** (cross-built ARM64, scp temp + `mv -f`, `restart_move.sh`), md5-verified,
  serving `:7700`. Running alongside the davebox module branch `remote-ui-audit-fixes` for a hands-on pass.
  **Merged to fork `main` (fast-forward) 2026-07-18; NOT pushed / not in a PR yet.** (Hands-on device verify
  still owed — merged on Josh's call ahead of it.)
- **Follow-ups (not done):**
  - **F4 — true push:** have the shim enqueue an overtake "dirty" notification on `rui_touch` so the manager's
    5ms `notifyLoop` pushes on-change and the `rui_poll` tick disappears entirely. The remaining responsivity
    headroom; needs shim + DSP plumbing (so out of scope for this manager-only patch).
  - **Write backpressure:** the ticker fans out to clients sequentially; a wedged client can stall a tick up to
    the 5s `writeJSON` timeout. Parallelize the fan-out (goroutine per client) only if it bites in practice.

## remote-ui-push.patch

**Remote-UI push pipeline (F4) + robustness series** — a 7-commit `git am` series layered on
`remote-ui-responsivity.patch` (needs its `toolTickLoop`/`rui_poll` contract; does not apply on
stock upstream alone). Fully generic: everything keys off the manager's existing overtake-tool
remote-UI contract (`overtake_dsp:` prefix, `rui_poll`/`rui_rev`/`rui_play`/`state`); no
module-specific code. Suitable to offer upstream as PRs on top of the overtake-tools bridge
(PR #148) + the responsivity patch, in series order:

1. **True push (F4) + write/state mutex split.** Shim probes the loaded overtake DSP's `rui_poll`
   in-process every 4th SPI frame and pushes digest changes into the existing web-param notify
   ring (module without `rui_poll` latched off until the next overtake load; zero cost with no
   overtake DSP). Manager routes those entries to a `toolKick` channel; the ticker services kicks
   immediately (no shm read) and relaxes its poll to a 2s backstop while pushes are fresh.
   `ruClient` gains a dedicated `writeMu` (never hold the state mutex across a network write) and
   `writeJSONTry` (≤1 in-flight write per client, drop-and-retry) at every periodic fan-out.
2. **Transport-stop edge push.** Play-state EDGES always push (manager cursor `toolLastOn`; shim
   classes the digest's `on` field as immediate alongside `rev` — after a stop the digest freezes,
   so a divider-deferred push would never come).
3. **Playhead rate-limit.** Shim playhead divider ~280ms + manager per-client 400ms floor (edges
   exempt): browsers free-run a local BPM clock and only need phase corrections; a ~100ms stream
   congests slow WiFi links and starves snapshot pushes behind it.
4. **Tool ARRIVAL announce.** Mirror of the existing tool-gone signal: a Tool tab opened before
   the tool loads (or across a tool swap) no longer sits on "No tool loaded" until a manual
   re-subscribe. Frontend shows "checking…" until the first answer.
5. **Device-clock forwarding.** `rui_poll` gains an optional 5th field (`devms`, playing only)
   forwarded as `rui_play`'s 4th — tools may emit a free-running device-clock ms so browsers can
   time-base playhead corrections independent of delivery latency. Fully optional per tool.
6. **Edit-storm protection.** Per-client 300ms edit-quiet window (no snapshot echoes to the
   client that is mid-edit — optimistic UIs reject them anyway) + global 300ms full-read throttle
   + 150ms retry for deferred clients. Prevents a knob drag (one rev bump per set_param) from
   flooding the link with 64KB-read/150KB-push per tick.
7. **Review fixes.** Play-state edge rides along with snapshot fan-outs (snapshots don't carry
   the on flag — an edge coinciding with a rev bump was swallowed); arrival edge consumed before
   the subscribe seed's first write (double-`custom_ui` iframe reload race); the quiet window
   exempts selection/transport/focus keys (`*_ruisel`, `transport`, `*_cc_focus` — contract
   convention: for these the snapshot IS the requested data, not an echo).

Re-apply after an upstream rebase:

```sh
git am --3way patches/remote-ui-overtake-tools.patch    # bridge (upstreamed as PR #148)
git am --3way patches/remote-ui-responsivity.patch
git am --3way patches/remote-ui-push.patch              # this 7-commit series
```

Then regenerate (code commits only — the series excludes patch bookkeeping):

```sh
: > patches/remote-ui-push.patch
git log --reverse --format=%h <base>..HEAD -- src schwung-manager | \
  while read c; do git format-patch -1 --stdout "$c" >> patches/remote-ui-push.patch; done
```

### Status (2026-07-18)

- Verified: full host `build.sh` clean (shim), `go vet`/ARM64 build clean (manager); the series
  `git am`s onto the responsivity tip reproducing an identical tree. Deployed to a device all
  day alongside davebox `remote-ui-audit2-fixes` (hands-on iterated: playhead, clip select,
  edit-storm, tool-arrival all verified live). Merged to fork `main` 2026-07-18.
- Follow-up (non-blocking): table-driven unit test + light refactor of `serviceToolClients`
  (three concerns interleaved: presence/arrival, snapshot fan-out gating, playhead push).

## canvas-takes-click.patch

`0bea22ad` **feat(shadow): let a canvas claim the jog click (`canvas_takes_click`)**

⬆ **Upstream-INTENDED, not a fork divergence** — same status as the Send FX half above.
Retire this file once it merges upstream. Written deliberately generic (no module named,
no consumer assumptions) so it can be sent as-is.

**What it fixes:** a canvas receives the jog wheel, knobs, knob-touch and pad notes, but never
the jog CLICK — the click is the close gesture, taken before the canvas's `onMidi` runs. So a
canvas has no "enter" action, and nothing hierarchical (a directory browser, a drill-down list,
a confirm step) can be built as a canvas UI.

`canvas_takes_click: true` on a canvas param forwards the click instead of stealing it. **Back
is never claimable and always closes**, so a module cannot trap the user by taking the only exit.
Applies to the fullscreen canvas and the co-run overlay alike.

### Re-apply on rebase

```sh
git am patches/canvas-takes-click.patch      # or: git apply --3way
```

Touches `src/shadow/shadow_ui.js` (one guard in the canvas close-gesture block) and
`docs/MODULES.md` (the contract). Low conflict surface — the only likely collision is upstream
moving the close-gesture block itself.

⚠ **Superseded detail:** this patch's docs said *"Back always closes the canvas and cannot be
claimed."* That rule was replaced 2026-07-31 by `canvas-handle-back.patch` below — the guarantee it
protected is now carried by **Shift+Back**. Apply that patch AFTER this one.

✅ **The companion gap this used to flag is now fixed** — see `claims-edit-ccs.patch` below.
(That note claimed the Copy/Delete/Undo carve-out was "scoped to COMPONENT_EDIT". It was not:
the carve-out had been **reverted upstream** and no longer existed in any view. Corrected
2026-07-31.)

## claims-edit-ccs.patch

`1b8290ef` **feat(shadow): let a module claim Undo/Copy/Delete (`claims_edit_ccs`)**

⬆ **Upstream-INTENDED, not a fork divergence.** Retire this file once it merges upstream.
Written generic — no module named, no consumer assumptions.

**What it fixes:** Undo (CC 56) / Copy (CC 60) / Delete (CC 119) reach Move firmware and are not
forwarded to modules, so a module gesture on those buttons also fires Move's own clip
copy/undo/delete behind the screen. Device-confirmed 2026-07-30: holding Copy inside a fullscreen
canvas and tapping two pads copied a **native Move drum pad**.

**Why it is opt-in.** Upstream PR #154 blocked all three whenever the shadow display was up, and
Charles reverted it in **PR #175** because the block was unconditional — it stole Move's native
Undo during ordinary chain use. His revert message names the fix shape: *"capability-gated capture
(module declares it claims the edit CCs)"*. This is that. `capabilities.claims_edit_ccs: true`,
default off, effective only while the declaring module's UI is on screen.

⚠ **`docs/MODULES.md` was stale and this patch corrects it.** The doc commit for PR #154
(`3dd8f055`) was never reverted alongside the code, so the guide described a firmware block that
had not existed since 2026-07-19. That stale section cost a session of searching for an
implementation that was not there.

### Re-apply on rebase

```sh
git apply --3way patches/claims-edit-ccs.patch
```

**Expect exactly ONE conflict, in `src/host/shadow_constants.h`** — inherent, not fixable by
re-anchoring. The new `edit_cc_block` is carved from `shadow_control_t`'s trailing padding (the
struct has a hard `sizeof == CONTROL_BUFFER_SIZE` static assert, so a field cannot simply be
appended). Our fork already spent one of those bytes on the fork-only `vol_block`, leaving
`reserved8`; upstream still has the full `reserved16`. Resolve by carving from whichever padding
field that tree actually has, and keep the total size unchanged. `schwung_shim.c`,
`shadow_ui.c`, `shadow_ui.js` and `docs/MODULES.md` apply cleanly onto `upstream/main`
(verified against `4519d26d`).

## canvas-handle-back.patch

`2bad2ea5` **feat(shadow): make Back contextual in a canvas UI (`handleBack` + Shift+Back failsafe)**

⬆ **Upstream-INTENDED.** ⚠ **Apply AFTER `canvas-takes-click.patch`** — its docs hunk lands inside
that patch's MODULES.md section. Applied in that order, both go on cleanly (verified against
`upstream/main` `4519d26d`); alone, this one conflicts in `docs/MODULES.md` only, never in code.

**What it fixes:** Back closed a canvas unconditionally, so a canvas could not have an inner level —
a text field, a drill-down, a confirm step had no way to be dismissed short of leaving the module.
The canvaskit keyboard had grown an on-screen `ESC` key purely to work around it.

Back is now **contextual**, reusing the SAME consume/fall-through contract chain modules already
have (`ui_chain.js` `handleBack`): the canvas overlay may export `handleBack(ctx)` and return truthy
to consume; no hook, a falsy return, or a hook that throws all fall through and close the canvas as
before. One press steps out of the sub-view, the next leaves the canvas.

⭑ **Shift+Back is the failsafe** and is never offered to the module. That is what keeps this *and*
`canvas_takes_click` safe to opt into: a module can take the click, and can consume Back wrongly or
forever, and still cannot trap the user. Mirrors `capabilities.suspend_keeps_js` (Back suspends,
Shift+Back is the guaranteed full exit).

⚠ This **replaces** the "Back always closes and cannot be claimed" rule from
`canvas-takes-click.patch`. That was the conservative choice while nothing needed Back; the
guarantee it protected is now carried by Shift+Back, which is strictly more capable and no less safe.

⚠ Adds `canvasOverlayHookResult()` beside `invokeCanvasOverlayHook()` rather than changing it —
existing callers read that one's return as *"did a hook run"*, and consume/fall-through needs *"what
did it say"*, where "no hook" and "hook declined" must behave identically.

### Re-apply on rebase

```sh
git apply --3way patches/canvas-takes-click.patch     # first
git apply --3way patches/canvas-handle-back.patch     # then this
```

## shadow-empty-param-readback-is-absent.patch

Single commit `16368a97` — **upstream-INTENDED** (retire on merge).

**Verified against `upstream/main` (2026-08-02):** applies **cleanly**, both files
(`src/shadow/shadow_ui.js`, `docs/MODULES.md`). No expected conflicts. Independent of every
other patch here — it touches only the optional-readback helpers.

**What it fixes:** `<key>:base` / `<key>:modulated` are optional readbacks that only a target with a
modulation system implements. An unimplemented key arrives as `null` *or* as `""`, depending purely
on whether the loaded DSP's `get_param` returns negative or `0` for a key it does not know — the
host turns `0` into "success, zero-length value". Every consumer tested `!== null`, so on a module
that returns `0` the empty string was accepted as a real value, breaking a row three ways at once:
blank value column, a spurious `~` (modulated) marker because live `!=` base, and silently refused
edits because the edit seeded from `""` and `parseFloat` gave NaN.

⭑ Because the trigger is the *generator's* return convention, the same row worked on one module and
broke on another, and changed as modules were swapped — which reads as flaky or module-specific when
it is neither. Measured on device: with DR32 loaded `slot:synth_volume:base` returns `err=0 len=0`,
with Noisemaker loaded it returns `err=4 len=-1`.

Normalizes both spellings of absence in one helper (`getOptionalSlotParam`) used at all four
optional-readback sites. Plain (non-suffixed) reads still go through `getSlotParam`, so a genuinely
empty value elsewhere keeps its meaning. `docs/MODULES.md` documents the `get_param` contract.

## shim-module-level-all-render-paths.patch

Single commit `c88d6976` — **fork-only for now**; upstreamable only as part of the Module Level
series, never alone.

⚠ **Verified against `upstream/main` (2026-08-02): CONFLICTS in `src/schwung_shim.c`, by
construction — do not try to resolve it hunk-by-hunk.** Upstream has no `synth_volume` at all
(`git grep synth_volume upstream/main -- src/` → nothing). The whole Module Level feature is
fork-only, carried by `611b4b98` (per-slot generator level), `9d82ad8b` (the menu row) and
`cbe21a49` (docs), which live only on `davebox-sound-mode`. This patch fixes that feature, so it
cannot apply where the feature does not exist.

**To upstream it:** send the series — `611b4b98`, `9d82ad8b`, `cbe21a49`, then this — as one PR, and
squash this fix into `611b4b98` rather than shipping the bug plus its fix.
**To re-apply on a fork rebase:** apply the three feature commits first, then this cleanly.

**What it fixes:** the gain was applied at exactly one mix site, and that site sits inside the
`rebuild_from_la` branch — so the level only reached the audio while Link Audio was actively
delivering track audio. The ordinary render paths (deferred FX, and the legacy inline fallback)
never applied it. The value still stored, persisted and read back correctly, so the UI stayed honest
while the level did nothing. ⭑ `rebuild_from_la` is not a setting anyone toggles — it is a per-frame
runtime condition including `la_receiving`, which is why this looked intermittent across restarts.

Extracts `shadow_apply_synth_level()` and calls it pre-FX / pre-sum on the two missing paths. The
rebuild path keeps its inline application (it scales while copying and summing the routed track in
one pass); ⚠ all three sites must stay in sync or the level works on some paths and silently does
nothing on the rest.
