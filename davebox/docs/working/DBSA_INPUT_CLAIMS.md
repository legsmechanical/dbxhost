# dAVEBOx SA — host-claimed inputs survey (B15) → the G2 triage table

> Produced 2026-08-06 (P0.2 of the plan). Evidence gathered from
> `dbxhost` `8966831a` — gestures verified in code, not from docs alone.
> **The Decision column is Josh's** (G2: "the decisions are what actually make
> 'davebox controls everything' true"). Recommendations are pre-filled from
> `DBSA_STRATEGY.md` where it already took a position.

## The central finding

**Every host jump gesture remains LIVE while davebox runs as the SA overtake,
and firing one suspends/exits davebox into a host screen.** The shim raises
`SHADOW_UI_FLAG_JUMP_TO_*` from button combos with no overtake gating
(`schwung_shim.c:6000-6065`, `:7015`, `:7297-7327`), and the shadow UI's flag
handlers explicitly suspend or exit the running overtake before entering the
requested host screen (`shadow_ui.js:15630-15644` and siblings). So today the
"davebox controls everything" model is porous at exactly these seams.

## The table

Legend — **Absorb**: davebox provides the function; hide the host gesture under
SA. **Keep**: host keeps it under SA (documented as intentional). **Hide**:
gesture disabled under SA, function not replaced. *(SA-gating mechanism for all
of these: the pinned/forced-settings map of B13, or an `overtake` guard —
generic, config-driven, nothing module-named.)*

| # | Surface | Gesture(s) | Under SA today | Recommendation | Decision |
|---|---------|-----------|----------------|----------------|----------|
| 1 | Slot settings / editor | Shift+Vol+Track 1-4 · Track hold (500 ms) | Suspends davebox → host slot editor | **Absorb** — davebox has `Edit Slot...` (sound mode); hide both gestures | ✅ **DELETED 2026-08-09** (gestures gone host-wide) |
| 2 | Master FX | Shift+Vol+Menu · Menu hold | Suspends davebox → host Master FX | **Absorb** — davebox `FX_BUSES` exposes master (+ sends) | ✅ **DELETED 2026-08-09** (incl. Shift+Menu single-press Master FX jump — that press is screen-reader settings now) |
| 3 | Global Settings | Shift+Vol+Step2 · Shift+hold Step2 | Suspends davebox → host settings | **Keep, pruned** — velocity curve, aftertouch, latency comp have no davebox home; B13 pins/hides the baked rows | ✅ **Gestures DELETED 2026-08-09**; the menu survives as the `global_settings` overlay SERVICE opened from davebox's menu (`Host Settings...`) |
| 4 | Tools menu / resume-tool | Shift+Vol+Step13 · Shift+Step13 (tap) · long-press = resume last tool · Shift+Vol+JogClick | Suspends davebox → a menu whose only entry IS davebox (post-B5) | **Hide under SA** — pointless once B5 lands; davebox has Quit + (B14) Suspend | ✅ **Consolidated to Shift+Step15 (tap) 2026-08-09** (Josh); Shift+Vol+JogClick stays as overtake EXIT; long-press resume dropped (resume via the menu) |
| 5 | SA teardown | Shift+Back | Ends the SA session → stock Move (`exit-to-stock.sh`) | **Keep** — the documented failsafe; pairs with the hard-reboot guarantee (G4) | |
| 6 | Quantized Sampler | Shift+Sample | Host sampler overlay over davebox | **Keep** — no davebox equivalent; document | ✅ **Keep + FIXED 2026-08-09**: arm was gated `!shadow_display_mode` (dead under SA); now arms during overtake, and its controls pass the overtake shortcut-skip |
| 7 | Skipback | Shift+Capture | Host skipback capture | **Keep** — same | ✅ **MOVED to Shift+Vol+Capture 2026-08-09** — bare Shift+Capture conflicted with davebox discard-captured-input; require-volume is now the only mode |
| 8 | Set pages | Shift+Vol+Left/Right | Stash/swap whole set libraries, restarts Move | **Hide under SA** — collides with the C1 set story; settle in WS-4 | |
| 9 | Slot mute/solo/bypass | Mute+Track 1-4 · Shift+Mute+Track · Mute+JogClick (bypass) | Host slot mute/solo; Mute (CC 88) also passes to Move | **Decide with the co-run input family** — davebox has its own mute model; double-meaning risk | |
| 10 | Master volume | CC 79 (+ knob touch note 8) | Passes to Move natively; davebox declares `claims_master_knob`; runtime `vol_block` claim exists for tools that want the knob | **Already davebox-consistent** — document only | |
| 11 | Edit CCs | Undo 56 / Copy 60 / Delete 119 | davebox raises `edit_cc_block` while hosting a canvas; otherwise pass to Move | **Already davebox-consistent** — document only | |
| 12 | Co-run groups | `CORUN_GRP_*` cession masks | davebox chooses per-group; side (clip) buttons currently ceded | **Decided 08-04**: davebox KEEPS the side buttons' input (clip select + modifier gestures); implementation is davebox-side (`DAVEBOX_CORUN_KEEP_MASK`) | ✅ |
| 13 | Shadow-UI trigger setting | `shadow_ui_trigger` (Both / Long Press / Shift+Vol) | Selects which of the above gesture families is armed | **Follows the rulings** — moot for absorbed/hidden rows; prune the setting if nothing configurable remains | ✅ **DELETED 2026-08-09** (setting, bindings, features.json key, Shortcuts page; SHM byte reserved) |

## Notes per row

- **1/2 (absorb):** the absorbed host screens remain reachable NOWHERE under SA
  — that is the point. The functions live in davebox's sound mode (slot
  settings, FX buses). Anything the host screens expose that davebox does NOT
  yet (e.g. chain patch save/load `[Save]/[Save As]`, module picker for a slot
  chain, User Presets browser) must be inventoried before hiding — otherwise
  absorb quietly removes features. ⚠ That inventory is the one open piece of
  homework in this row; it belongs to WS-3 implementation.
- **4 (tools):** hiding the gesture ≠ removing the menu code. Stock keeps
  everything; the SA gating is config.
- **5 (Shift+Back):** under the boot-scoped marker this is now robust after
  hard reboots. Keep it undocumented-prominent (manual: "emergency exit").
- **9 (mute family):** dual semantics today — host mutes the SLOT while Move
  mutes its selected track; davebox additionally has its own mute UX. Under
  the B3 bus model, "slot mute" for a Move-track bus may stop making sense.
  Recommend deciding *after* B3 lands.
- **10/11:** these are the model working as intended — runtime claims raised by
  the module that needs them. The B15 documentation duty is a manual appendix
  listing them (G6).

## What implements the hiding (when ruled)

One generic mechanism, shipped with B13: the SA installer writes a
`pinned_settings` / `disabled_gestures` map into the dbx tree's
`config/features.json`; the shim/shadow_ui consult it before raising/handling
each JUMP flag. Stock installs have no map → nothing changes. Every row above
is then one config entry, and stock behaviour is untouched by construction.
