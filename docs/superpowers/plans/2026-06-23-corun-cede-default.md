# Implementation plan — co-run cede-default contract

**Spec:** `2026-06-23-corun-cede-default-spec.md` (cede-default, uniform, soft-migration)
**Repo:** `schwung` host (protected) + `schwung-davebox` (lockstep migration)
**Supersedes:** the flag-based `feat/corun-input-classification` branch (keep its
classification + 32-bit widen + JS-bridge work; replace the `CORUN_KEEP_EXTENDED`
flag/tier with the cede model).

---

## ⛔ PREREQUISITE (BLOCKING) — public Schwung v0.11.0 first

Per [[schwung-upstream-rebases-history]], upstream rewrites public `main` history
every release, so fork `main`'s merge-base collapses and our open PRs go
whole-repo/conflicting. **Do this before any cede-default code:**

- **P0.1 Rebase fork host `main` onto upstream v0.11.0** (same recipe as the
  2026-06-20 v0.10.0 rebase: fetch tag, `git cherry` to auto-drop the ~97% already
  upstream, replay the fork-only remainder, hand-merge any concurrent collisions).
  Backup branch `main-pre-v0.11.0-rebase`.
- **P0.2 Re-validate the co-run host work survived the rebase**: canvas co-run
  (`92f8d404`+`e1fcf651`), MUTE group (`6decd147`). Device smoke-test.
- **P0.3 Refactor/re-cut the open upstream PRs** against v0.11.0 (#121 draft, #125,
  #126, plus the #132/#133/#134 batch status) — per the existing OUTSTANDING item.
- **P0.4 Re-base the cede-default work on the fresh `main`.** Do NOT rebase the old
  flag branch — start a new branch `feat/corun-cede-default` off post-v0.11.0 `main`
  and cherry-pick only the reusable classification/widen/JS-bridge commits, dropping
  the flag/carve-out commits. (Cleaner than rebasing through the model change.)

Nothing below starts until P0 is green.

---

## Phase 1 — Land spec + plan (docs)

- Copy the spec + this plan into `schwung/docs/superpowers/{specs,plans}/` on
  `feat/corun-cede-default`. (First host write → trips host-guard; get Josh's OK.)
- Mark the 2026-06-21 flag spec as superseded (one-line banner, keep for history).

## Phase 2 — Tests first (red)

Extend the existing `corun` unit test (the flag branch added one):
- **Cede truth table:** for `CORUN_MODEL_CEDE`, every group → PEER iff bit set in
  `cede_mask`, else TOOL. Spot-check each of the 24 groups.
- **Legacy golden:** with `CORUN_MODEL_CEDE` clear, `corun_event_owner` is
  byte-identical to the pre-change (v0.11.0) implementation for every event —
  including the 12 buttons staying TOOL (unclassified-equivalent). This is the
  zero-breakage guarantee, asserted not assumed.
- **LED follow vs distinct:** `CORUN_LED_DISTINCT` clear → LED owner == input
  owner; set → LED owner from `led_cede_mask`. Cover davebox's paint-track-cede-
  press case.
- **Back:** `CORUN_OWNER_NONE` when framework-owned; routes to peer/tool when
  `CORUN_CEDE_BACK` / kept. Map equivalence to today's `CORUN_KEEP_BACK` behavior.

Tests fail → proceed.

## Phase 3 — Header / constants (`src/host/shadow_constants.h`)

- Restructure the `corun` SHM struct:
  ```c
  struct { int8_t target; int8_t id; uint8_t flags; uint8_t _pad;
           uint32_t cede_mask; uint32_t led_cede_mask; } corun;
  ```
  (Legacy path reads the two mask slots as `keep_mask`/`led_keep_mask`.)
- New flags: `CORUN_MODEL_CEDE`, `CORUN_LED_DISTINCT`, `CORUN_CEDE_BACK`.
- Keep the full classifier (`corun_group_for_event` already maps all inputs) and
  the 24 group bits + composites. **Remove** `CORUN_KEEP_EXTENDED`,
  `CORUN_GRP_EXTENDED_ALL`, and the extended carve-out.
- Bump `CONTROL_BUFFER_SIZE` until `shadow_control_size_check` compiles (~76→~84).

## Phase 4 — Ownership resolution

- `corun_event_owner`: branch on `flags & CORUN_MODEL_CEDE`.
  - **Cede path:** `(cede_mask & grp) ? PEER : TOOL`; Back via `CORUN_CEDE_BACK`.
  - **Legacy path:** call the verbatim pre-change keep-mask resolver (lift the old
    body into `corun_event_owner_legacy` so the golden test pins it).
- LED ownership helper `corun_led_owner`: distinct vs follow-input, per model.

## Phase 5 — Routing sites + JS bridge

- Point both routing sites (pre-ioctl input filter in `schwung_shim.c`; the two
  LED-ownership sites) at the new resolution. No per-site logic — single source.
- JS bridge (`shadow_ui.js` / host JS): carry the prior branch's `uint32_t` casts
  + `0x7FFFFFFF` range guards; add `flags` plumbing; mirror cede semantics in any
  JS-side co-run owner check (`coRunCedes`/`coRunWants` → invert to cede model).
- Reconcile the known C-vs-JS `CORUN_KEEP_DEFAULT` discrepancy (JS omits MUTE) —
  moot under cede-default (no keep-default), but verify JS path parity.

## Phase 6 — Module-facing API + published constants

- New host JS functions: `shadow_corun_begin(target, id, cede_mask)` v2 (sets
  `CORUN_MODEL_CEDE`); `shadow_corun_set_cede_mask`; `shadow_corun_set_led_cede_mask`
  (sets `CORUN_LED_DISTINCT`). Decide legacy-API retention vs rename (avoid silent
  signature reinterpretation — keep old name on legacy path or version it).
- **Publish `CORUN_GRP_*` to JS** (generated constants or host getter) so modules
  stop hand-copying bit values. This is now the public contract surface.

## Phase 7 — davebox migration (`schwung-davebox`, lockstep)

- Re-express davebox's masks as cede-lists (keep-by-default):
  - Move-native/default: `cede = {JOG, KNOBS, MASTER, SHIFT, BACK, TOUCH,
    TRACK_BUTTONS, MUTE}` (+ FX-picker extras). Newly classified buttons it doesn't
    list stay kept — same as today, now intentional.
  - **Evaluate folding in the 2026-06-23 chain-edit Mute fix:** cede `MUTE` in
    chain-edit natively and drop the `S.schwungCoRunSlot` JS guard. If clean,
    do it (removes the guard hack); else leave the guard and keep MUTE kept.
  - LED: `led_cede_mask = cede_mask \ {TRACK_BUTTONS}`, set `CORUN_LED_DISTINCT`.
- Switch davebox to the v2 cede API + published constants.

## Phase 8 — Build, deploy, device regression (the held deploy)

- ARM `build.sh` clean; static size-check passes. Deploy shim+host+shadow_ui
  **together** (ABI bump), plus davebox bundle. md5-verify shim + bundle on device.
- Regression matrix:
  - davebox co-run **unchanged** in Move-native, chain-edit, FX picker: kept inputs
    kept, ceded inputs ceded, LEDs correct (incl. track-button paint).
  - Newly classified buttons (Play/Copy/Delete/nav/…) behave as today in davebox
    co-run (kept) — proves the default end-to-end.
  - Throwaway test tool that cedes ONE new button (e.g. `CAPTURE`) → peer receives
    it, davebox-equivalent doesn't. Proves the new power.
  - Mute chain-edit bypass still works (regression on the just-shipped fix).

## Phase 9 — Merge + upstream

- Merge `feat/corun-cede-default` → host `main` + push (gated on Josh).
- Bundle the upstream PR: cede-default contract + MUTE group + canvas co-run, off
  v0.11.0. Host-only, zero module breakage (legacy path), publishes input
  constants. Pair with the davebox migration PR.

---

## Decisions locked (from spec review with Josh, 2026-06-23)

- Cede-default model; **soft migration** (legacy keep path retained, deprecation
  later) — fork == upstream, no breakage.
- LED layer mirrored (`led_cede_mask`, `CORUN_LED_DISTINCT` for the follow sentinel).
- All routable inputs first-class; only plug-detect sensors (CC 114/115) excluded;
  power button out of scope (not a routable event).
- Discrete buttons each their own bit (Shift/Menu/Back/Copy/Delete/Undo/Capture/nav
  all independent); only multi-key surfaces (pads/steps/knobs/touch/track-rows/jog)
  are single groups. Composites (NAV/EDIT/TRANSPORT) are optional conveniences.
- Publish `CORUN_GRP_*` constants to JS (no more hand-copying).

## Still open (decide during impl)

- Legacy JS API retention vs rename (Phase 6).
- Whether to fold the chain-edit Mute fix into the cede model (Phase 7).
