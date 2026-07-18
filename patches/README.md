# Fork-local patches

Re-appliable patches for **fork-only divergences** carried on fork `main`. They
must be **re-applied on every rebase** onto `upstream/main`. **Fork-only — never
include `patches/` in an upstream PR** (see [[schwung-never-push-claudemd-upstream]]
/ `CLAUDE.md` → "⚠️ Fork-only divergences"). Committed here so they're backed up on
the fork remote.

## fx-blocks-local.patch

Our extra FX-block work — a 2-commit `format-patch` series:

- `87a997d3` **feat(fx): Send FX + Move FX buses + generic FX-bus picker**
- `72f8f641` **fix(chain): route fx3/fx4 get_param** (slot synth-chain blocks 3–4)

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

**Remote-UI true push (F4) + non-blocking client fan-outs** — layers on
`remote-ui-responsivity.patch` (needs its `toolTickLoop`/`rui_poll` contract; does not apply on
stock upstream alone). One commit, two halves:

- **Manager:** `ruClient` write/state mutex split (`writeMu` vs `mu`), `writeJSONTry`
  (TryLock + goroutine, ≤1 in-flight write per client, drop-and-retry) at every periodic fan-out
  (tool ticker, 5ms notify drain, 30s backstop), `writeJSONAsync` for tool_info(gone). Closes the
  "wedged client stalls every loop for up to 5s" class flagged in the 07-18 audit.
- **Shim + manager (F4):** shim probes the overtake DSP's `rui_poll` in-process every 4th SPI
  frame and pushes digest changes into the web param notify ring (rev change = immediate;
  playhead-only = every 8th probe ≈96ms; module without `rui_poll` latched off until next
  overtake load). Manager routes those entries to a `toolKick` channel; the ticker services kicks
  immediately (no shm read) and relaxes its own poll to a 2s backstop while pushes are fresh.

Re-apply after an upstream rebase:

```sh
git am --3way patches/remote-ui-overtake-tools.patch
git am --3way patches/remote-ui-responsivity.patch
git am --3way patches/remote-ui-push.patch
```

Then regenerate: `git format-patch -1 <replayed-commit> --stdout > patches/remote-ui-push.patch`

### Status (2026-07-18)

- Off-host verified: full host `build.sh` clean (shim) + `go vet`/`go build` clean (go 1.26
  Docker, manager). **NOT deployed** (device unreachable at build time): manager binary deploy =
  scp temp + `mv -f` + `restart_move.sh` (safe first — F4 stays dormant without the new shim);
  shim needs `install.sh local` (reboot). NOT merged to fork main; branch `remote-ui-push`.
