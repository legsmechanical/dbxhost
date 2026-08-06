# dAVEBOx SA — strategy for the whole arc

> 2026-08-04. Josh: *"before getting into the live set editing and loading, we should step back and
> figure out a strategy for structuring all the work i spec'd that makes the most sense. including
> any gaps in what i spec'd."*
>
> This supersedes the **phasing** in [`DBSA_SPEC_PLAN.md`](DBSA_SPEC_PLAN.md) (its per-bullet
> findings still stand). Set-routing decision lives in [`DBSA_SET_MODEL.md`](DBSA_SET_MODEL.md).
> **Planning only — nothing implemented.**

`host` = `schwungbox-host`, `davebox` = `schwung-davebox`.

---

## 0. Verification notes

The plan's load-bearing citations were spot-checked against code and hold up. Two things worth
stating outright:

⚠⚠ **B6 is not a future risk — it is bleeding now.** The autosave gate is
`!isOvertakeActive && autosaveCounter >= AUTOSAVE_INTERVAL` (`host/src/shadow/shadow_ui.js:15845`),
and under SA **davebox is a permanent overtake**. So an entire SA session's host settings persist
only at explicit flush points. A crash or hard reboot loses everything since launch. **Today.**

⚠ The stale `standalone_active` bug is confirmed in source: `launch.sh` removes the marker only on
the clean-exit path, so a hard reboot leaves it behind — which corrupts the *"reboot always returns
you to stock"* recovery guarantee.

Minor: the tools-dir hardcode is `shadow_ui_tools.mjs:48`, not `:52`. No case was found where the
plan and the code disagree on substance.

---

## 1. Structure — four workstreams, not fifteen bullets

The bullets group by **what breaks if you get them wrong**, which is also what they share as
subsystems.

### WS-1 — "One honest level model" ⬅ THE SPINE
*B13 (flags) → B3 → B4 → B7 → B2*

Everything the user hears, and every knob that changes it, has one owner: davebox. Force
Move→Schwung on (which brings the whole `rebuild_from_la` world alive — the Move-FX branch is dead
code without it, `host/src/schwung_shim.c:2285-2334`), surface the four Move buses in davebox, flip
the volume knob to `slot:volume`, retire the injected Module Level row, fix channels, then scale to 8.

**Why it's the spine:** it defines what SA *is* semantically. The manual, the set rewrite, the
surface triage and the 8-chain UI all *describe* this model — build them before it settles and they
get rebuilt.

### WS-2 — "Nothing is ever lost; the device is always recoverable"
*B6 + the hazard family*

Autosave-during-overtake, the stale-marker fix, the double-launch guard, `saveSongIfDirty` at launch,
and the exit guarantees. Grouped by **risk class**, not spec adjacency — all of it is "persistent
state vs. ungraceful death", and it shares one rule: *liveness from `/dev/shm`, intent from `/data`.*

### WS-3 — "davebox is the only surface you ever see"
*B5, B11, B12, B13 (menu), B14, B15, + the co-run track buttons*

Boot-to-exit experience — and the big unspec'd half: triage of **every** host surface a user can
still reach (gap G2).

### WS-4 — "Sets wire themselves"
*B8/B9/B10 — design C1, decided*

Deliberately last, per Josh's own call. Nothing else depends on it; SA works today with
manually-compliant sets. Gated by the five device experiments.

**Parallelism:** WS-2 is independent — start now. WS-3's survey (B15) is a doc — start now. WS-1 and
WS-3 serialise internally but not against each other, with one seam: **do the surface triage before
the 8-chain expansion.**

### Where the old phasing was wrong

1. **P0.1 no longer gates B2.** Q3 was answered "capacity, budget shared" — the CPU measurement is
   now documentation. Don't wait on it.
2. **The set rewrite was bundled into the first increment.** Josh deferred it; Phase 1's real exit
   criterion is the level model.
3. ⭑ **B2 before the surface triage is backwards — and fixing that dissolves Q2.** Q2 asks whether
   slots 5-8 need shadow-UI gestures given only 4 track buttons. But if the triage concludes (as
   "davebox controls everything" implies) that the shadow slot editor is absorbed or hidden under SA,
   then **no** slot has one and 5-8 aren't a special case. Doing B2 first risks building shadow-UI
   plumbing for slots 5-8 that the next stage deletes.
4. **B6 was filed as an "independent" Phase-1 item.** It should be first-week work — it is the only
   spec item where the *status quo* is losing data.

---

## 2. The gaps

**blocker** = decide before related work starts · **companion** = must ship alongside a spec item ·
**deferrable**

### G1 — Co-run side-button behaviour — ✅ RESOLVED, and smaller than it looked
⚠⚠ **Terminology trap, corrected by Josh 08-04.** CC 40-43 are **clip** buttons in davebox, not track
buttons: *"Side buttons — switch clips on the active track"* (`davebox/MANUAL-SA.md:213, 337`), and
davebox has **no dedicated track buttons at all** — *"There are no dedicated track buttons. Change
the active track with: …"* (`:235`). The code agrees (`ui_corun.mjs:38` — "the side clip buttons").
The host's `CORUN_GRP_TRACK_BUTTONS` name describes what **Move** does with them once ceded, which is
what made the earlier reading wrong.

**So the ask is simply:** in co-run, the side buttons go back to davebox's own track-view behaviour —
**selecting clips**, with their clip LED semantics (off = empty, dim = holds notes, solid = current;
`MANUAL-SA.md:1386`) and their modifier gestures (Copy + side, Delete + side, Shift+Delete + side;
`:345-347`). davebox already owns their LEDs; this adds the input.

**Move-track selection is unaffected** — it was never these buttons' job in davebox. davebox already
flips Move to the instrument the active davebox track is routed to: `enterMoveNativeCoRun(t)` injects
a cable-0 tap via `move_midi_inject_to_move`, handling Move's reversed CC mapping
(`ui_corun.mjs:213-245`).
⚠ One wrinkle to carry: that injection **needs its ~12-tick defer** (`S.pendingMoveCoRunInject`) or
Move's repaint lands before co-run's LED passthrough is live and gets stripped.

### G2 — Triage of every reachable host surface — **BLOCKER**, and the biggest unwritten half
The spec removes tools (B5) and two settings rows (B13). It says nothing about the rest:

| Surface | Gesture | Recommendation |
|---|---|---|
| Slot settings / editor | Shift+Vol+Track, Track hold | **Absorb** — davebox has `Edit Slot...`; hide the host gesture |
| Master FX | Shift+Vol+Menu, Menu hold | **Absorb** — davebox's `FX_BUSES` already exposes master |
| Global Settings | Shift+Vol+Step2 | **Keep, pruned** — velocity curve, aftertouch, latency comp have no davebox home; hiding them strands users |
| Quantized Sampler / Skipback | Shift+Sample / Shift+Capture | **Keep** — useful, no davebox equivalent; document as intentional |
| Set pages | Shift+Vol+Left/Right | **Hide under SA** — collides with the future set story; settle in WS-4 |
| Mute combos (slot mute/solo/bypass) | Mute+Track etc. | Decide with the co-run input family |

B15's survey gathers the evidence; **the decisions are Josh's**, and they are what actually make
"davebox controls everything" true. Ship with B5/B13 — same remove/hide pass.

### G3 — First-run and onboarding — **COMPANION** to WS-1/WS-3
With `move_to_slot` defaulting to 0 and the level model flipped, **an existing set will sound
different on first SA launch**. That is Q8, and it is really a first-run *experience* question, not a
migration checkbox. Also: 8 empty chains, no modules — default set? hint overlay? QUICKSTART is the
vehicle; the product decision is unmade.

### G4 — Recovery and escape — **BLOCKER**-class, already overdue
Today's guarantee is "power-cycle returns you to stock" — and the stale marker breaks its aftermath.
There is no "hold X on boot" story and probably doesn't need one **if** the invariant *"hard reboot →
clean stock, no residue"* is made true and tested: fix the marker, add the double-launch guard, add a
boot-time residue sweep (the same pass that later heals C1 leftovers). A non-expert's whole recovery
manual should be one sentence: **"turn it off and on again; you get stock Move."**
Also document what the user sees when `davebox-heal` fails (launch.sh correctly refuses to launch).

### G5 — Exit / return-to-stock guarantees — **COMPANION** to B14
What is *guaranteed* after Suspend, Quit, reboot? Under C1 set routing stays davebox-shaped (decided,
archived). Baked settings must live only in the dbx tree's `features.json` so stock is untouched —
make that a **tested invariant, not an accident**. Uninstall needs a documented script eventually;
write the guarantee down now so nothing violates it.

### G6 — Documentation — **COMPANION**, continuous
`MANUAL-SA.draft.md` moves with every user-visible commit (already a repo rule). Two debts this arc
creates: the B15 claims table becomes a manual appendix, and the QUICKSTART launch narrative changes
twice. `MANUAL.md` stays frozen — `test_manual_freeze.sh` pins it.

### G7 — Testing — **COMPANION**, one new harness worth building
- **Exists, extend:** host `tests/host` pins (CI-gated), davebox DSP harness, build-info gating tests
  — extend for the pinned-settings map, tools allowlist, splash config.
- ⭑ **Missing and cheap:** the `Song.abl` rewriter is pure JSON-in/JSON-out — **build it TDD against
  fixtures before any device experiment.** Same for launch.sh's marker/guard state machine (shell).
- **Hardware-only:** forced-LA soak, 8-chain headroom (instrumentation exists —
  `spi_slot_render_max`, `host/src/schwung_shim.c:1751-1753`), splash/LED timing, C1's five
  experiments. Budget explicit device sessions; these are the only parts that can't be pre-verified.
- **Uncovered, deferrable:** davebox's UI tier.

### G10 — Per-set state is a SHARED contract between two hosts — **✅ DISSOLVED 2026-08-06**

**Josh's separation ruling ended this gap:** dAVEBOx SA is an entirely separate workspace; host
state (`set_state`, `slot_state`, `active_set.txt`, both config files) is now PRIVATE per install
(`schwungbox-host` `6e9ac1f4`, enforced by installer + `tests/host/test_workspace_separation.sh`).
The two hosts no longer read or write each other's per-set files, so **B2's format-contract hazard
is gone**: the dbx host can move to 8 slots without any stock host ever rewriting (and truncating)
its config. The intra-workspace rule below still applies to davebox's own files, and the fx3/fx4
paragraph still matters for sets a user exports/shares across installs by hand.

*Original analysis kept for the record (found 2026-08-04 while building Stage 0, from Josh's
question "will these saves conflict with the regular non-dbx host saves?"):*

Per-set state paths are **hardcoded to the stock tree** — `/data/UserData/schwung/set_state/<uuid>`
(`host/src/shadow/shadow_ui.js:15630`), not install-dir relative — so **both hosts read and write the
same files**.

✅ **No concurrent hazard:** the hosts cannot run simultaneously (SPI exclusivity, `launch.sh` kills
the stock stack, and the new double-launch guard enforces it).
✅ **No format hazard today:** `schwungbox-host` and the `schwung/` daily driver both carry
`MOVE_FX_BLOCKS 4` and `send_fx` — the fork was taken from the daily driver, so they currently write
identical formats.

⚠⚠ **But the format is a contract between two independently-evolving hosts, and B2 breaks it.** When
4→8 chains lands in the dbx host only:
- `slot_4.json`..`slot_7.json` are **safe** — a 4-slot host iterates `SHADOW_UI_SLOTS` and never
  touches them.
- `shadow_chain_config.json` is **not** — it is ONE file listing all slots, so a 4-slot host rewrites
  it wholesale and silently drops every channel/volume/mute setting for slots 5-8 the next time the
  daily driver loads that set.

⭑ **The pattern: per-slot files degrade safely; single files describing ALL slots do not.** Same shape
as `move_fx_meta.json`. Design for it *before* 8 chains — either version the config, make the
lesser-featured host preserve unknown slots, or move to per-slot files.

Against **official** Schwung (2 FX blocks, no sends) the same mechanism drops fx3/fx4 from any set it
rewrites — which matters as soon as SA ships to people who also run stock.

### G8 — Consequences of 8 chains beyond Q2 — **COMPANION** to B2
The 4096-byte config cap; Mute+Track reaching only 4 slots; co-run pairing at 8 davebox tracks ↔ 4
Move tracks (see G1's second wrinkle); the manual's mental model. None hard — but all must ship in
the same pass or slots 5-8 are half-alive.

### G9 — Forced-LA is a permanent audio commitment — **BLOCKER** for B13's flag half
Baking Move→Schwung on engages latency comp and its artifacts for every user forever. It degrades
safely on starvation (`host/src/schwung_shim.c:2270-2278`) but **the sound of it under sustained load
is unmeasured.** One evening's soak-listen before the flag is forced. Cheap; don't skip.

---

## 3. Recommended order — five stages

**Stage 0 — "Harden the ground"** *(mostly internal, ~days)*
B6 autosave (dirty-driven, debounced, from shadow_ui's JS tick — keep the timeout-skip guard), the
stale-marker fix, double-launch guard, `saveSongIfDirty` in launch.sh, the B15 survey doc, the G9
soak-listen.
**After:** a crash or hard reboot loses no host settings and leaves no residue — the device is
unconditionally recoverable, and the full input-claims map exists.

**Stage 1 — "One honest level model"** *(the spine; user-visible)*
B13's flag half (generic pinned-settings map), B3 (davebox exposes the Move buses; `move_to_slot`
default 0; ⚠ gate on a new `host_build_info()` field — **never `typeof`**, it's a param namespace),
B4 (flip `SLOT_LEVEL_KEY`, retire Module Level). Needs Q5, Q7, Q8.
**After:** every knob controls the real level of the thing it names. *This is the moment SA sounds
like its own instrument.*

**Stage 2 — "davebox is the only surface"** *(user-visible)*
G2's triage → B5 allowlist, B13's menu half, hide/absorb the triaged gestures, B14 Suspend-to-Move
(+Q10), the co-run track-button keep (+G1's re-fire), B11 splash (+Q9), B12 boot LEDs.
**After:** power-on to exit, a user sees only davebox plus documented escape hatches.

**Stage 3 — "Capacity"** *(user-visible)*
B2 4→8 (constants, SHM contract bump, config cap, JS loops, `host_build_info` slot count) + B7
(Q6) + G8's edges + the headroom measurement for the manual.
⚠ **G10 must be settled first**: `shadow_chain_config.json` is shared with the 4-slot daily driver
and describes all slots in one file, so booting stock on an 8-slot set would silently drop slots 5-8.
**After:** 8 chains on channels 1-8, documented budget.

**Stage 4 — "Sets wire themselves"** *(user-visible; highest care)*
The five C1 experiments → the rewriter (TDD off-device first) → prompt placement → launch.sh
integration → set-pages-under-SA decision.
**After:** load any set, launch davebox, correct wiring with zero setup. **Last because it is the
only stage that touches users' musical files** — it goes after every Stage-0 recovery mechanism is
proven.

---

## 4. What to do first

1. ⭑ **The Stage-0 durability bundle** (B6 + marker fix + launch guards). Highest ratio in the arc:
   closes the one *currently-bleeding* data-loss hole, fixes an already-open bug that corrupts the
   recovery story, and is prerequisite hygiene for everything riskier later. All host-side, all
   testable, **no open questions block it.**
2. ⭑ **The B15 survey → the G2 triage table.** Pure documentation, zero risk, and it converts the
   vaguest part of the spec into a decision sheet Josh can answer in one sitting — which unblocks all
   of Stage 2 and dissolves Q2.
   ✅ **DONE 2026-08-06 → [`DBSA_INPUT_CLAIMS.md`](DBSA_INPUT_CLAIMS.md).** Central finding: every
   host jump gesture stays LIVE during an SA session and suspends davebox into a host screen —
   verified in code. Decision column awaits Josh. *(Item 1, the Stage-0 bundle, shipped 08-05/06;
   B6 autosave is ON and device-verified as of `8966831a`.)*

Third, given a device evening: the **G9 soak-listen** (forced Move→Schwung under real playing). Under
an hour, and it converts a Stage-1 unknown into a fact.

**On doing set work first:** no compelling argument to override Josh. The tempting counter — the C1
experiments are cheap and de-risk early — doesn't hold, because **nothing before Stage 4 consumes
their answers.**

---

## 5. Decisions owed, grouped by the stage that needs them

**Before Stage 1**
- **Q5** — saved non-unity `slot_synth_volumes` when Module Level dies: reset / fold-in once /
  keep-hidden. *Recommend fold-in once — preserves loudness, leaves nothing invisible.*
- **Q7** — confirm the Move-bus level stays post-insert-FX (code is post; likely a one-word yes).
- **Q8** — `move_to_slot` → 0 for existing sessions: silent or prompted. *Fold into G3.*
- **G9** — forced-LA soak acceptable?

**Before Stage 2**
- **G2 table** — keep / absorb / hide per host surface. *The one big product sitting.*
- **Q9** — splash footer: fork version or upstream base tag (base tag needs a build-time stamp).
- **Q10** — plain Back at davebox home once hold-Back is removed.

**Before Stage 3**
- **Q6** — hard-force channels 1-8 (killing the Receive=All MPE recipe) vs. force-defaults-but-
  reachable. *Recommend the latter — the MPE recipe is documented and the regression would be silent.*
- **Q2** — close as dissolved by Stage 2, or answer if any shadow-UI surface survived triage.

**Before Stage 4**
- The five C1 experiments — chiefly *does Move reload an in-place-rewritten `Song.abl`*.
- Confirmation-prompt placement (no UI is alive when launch.sh rewrites).
- Set pages under SA: retire, hide, or repurpose.

---

## Risk to a user's music — stated once

The only work in this arc that can damage musical data is **Stage 4's set rewriting** (mitigations
decided: field-level patch, atomic rename, validation-abort, archive, never-restore) and **Stage 0's
autosave** if it ever saves shim defaults over a good file (the existing timeout-skip guard must
survive the change). Everything else is at worst confusing, never destructive — and Stage 0 exists to
keep it that way.
