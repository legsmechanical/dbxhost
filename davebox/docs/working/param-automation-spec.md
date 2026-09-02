# Param Automation (Front 3) — ONE automation system

**Status: RULED and IMPLEMENTATION-READY (Josh, 2026-09-02) — full unification, option A.
§6 residue closed: 6.1 bank 6 = read-only OVERVIEW; 6.5 bake/export INCLUDED in v1; 6.6 = 8 CCs
+ Aftertouch; 6.2/6.3/6.4 proposals adopted as defaults. The behavioural spec is Josh's (native
Move cannot be driven by an agent; the manual + his rulings are the source).**

Sources: Move manual §14.2–14.3 (pp. 86–90, 2025-07-25 edition) · Josh's rulings 2026-09-01 ·
davebox MANUAL-SA §11 (the AUTO bank) + the lane machinery in `ui_input_cc.mjs` / `seq8.c`.

---

## 1. The ruling: one system, one grammar, everywhere

Two automation modes side by side — the AUTO bank's lanes and a new per-param system — was
judged a convoluted UX (Josh). The unification:

> **Everything is a device with params; automation is one thing you do to params.**

- **Per-param automation** (Move's model): any param the module editor shows can carry
  automation. New per-clip storage keyed by param; **no lane objects, no 8-lane cap**.
- **MIDI becomes a device.** Every track gains a **MIDI Out** pseudo-device in the editor
  chassis: its knobs ARE the track's CC assignments (pick `CC0–127`) plus **Aftertouch**.
  Automating a CC to external gear is byte-for-byte the same gesture as automating a filter
  cutoff.
- **The AUTO bank (bank 6) RETIRES as a mode.** ⭑RULED (2026-09-02): its slot survives as a
  **read-only automation OVERVIEW** — graphs of what's automated on the track, no editing.
- **Resting values come free**: the un-automated knob position IS the resting value; the
  separate lane concept is gone.
- ⭑RULED **No migration, no backward compatibility** — the lane system (incl. `Sch`
  targets) is deleted outright; existing projects need no preserving.

## 2. Per-route surface (non-Schwung tracks covered)

The editor already shows each route a different device list (sound mode's three flavours);
automation inherits it:

| Route | Devices in the editor | Automatable |
|---|---|---|
| Schwung | chain synth + FX blocks + MIDI Out | everything |
| Move | Move synth (a co-run DOOR, not params) + Schwung-side bus insert FX (≤4) + bus levels | the FX and the levels — **never the Move synth itself** (no param API; parity with today — CC lanes couldn't reach it either). ⭑RULED 2026-09-02: **no MIDI Out device on a Move track** — Move's instruments take notes and aftertouch only, and pad-pressure recording already produces the aftertouch |
| EXT/MIDI | MIDI Out only | all of it — the CC panel becomes the track's instrument surface |

The Move-synth row is a door; doors don't get circles.

⭑RULED (Josh, 2026-09-02) **The SOUND + CONFIG bank is a real knob bank, and its knobs are the
track's mixer levels**: K1 Volume, K2 Pan, K3 Send A, K4 Send B, K5 Module Level (chain slot
only), K6–K8 unassigned — both routes alike, on the bank page AND on the sound menu's
non-editor screens. Jog-click still enters the menu. They are ordinary automatable
parameters (`slot:` / `move_fx:N:` keys). **The chain's per-knob assignment layer leaves the
sound menu's list screens** (Sound Control → Knobs, the Shift+touch assign flow, the knob
card) and moves to its own bank, MACROS (below). ⭑ The step grammar is ONE model in every
mode: **a hold never creates a note; a tap or an explicit edit does** (ruling pending on the
exact shape — see the board).

⭑RULED (Josh, 2026-09-02, pre-P5 planning) **Two new banks; bank order in the jog walk:
… → SOUND + CONFIG → MACROS → AUTOMATION.**
- **MACROS** ✅ BUILT 2026-09-02 (see the plan, item 3 — built on the kit bank page like its
  neighbour SOUND + CONFIG, with the module editor's widget vocabulary via `makeCell` and
  this file's knob travel law, NOT as a page of the host's param-pages engine: no host change,
  and the bank matches the banks beside it; the engine-page form stays available if the
  editor-identical widgets are wanted. The store is davebox's own, typed per target — a target
  need not live in a chain (a Move bus's levels), and Josh's 2026-09-02 idea of davebox BANK
  KNOBS as macro targets is a further kind of the same switch, live but not automatable until
  the automation store learns it — ⭑RULED + BUILT 2026-09-03: Josh's numbered keep-list
  (`BANK_MACRO_ALLOW` in ui_sound: Playback Dir; NOTE FX minus Len mode; HARMONY; DELAY incl.
  the Shift+K1 Clock Feedback; SEQ ARP / LIVE ARP minus Steps mode; ALL LANES Dir), per pad
  mode, written by the bank's own path (`applyBankParam`). ⭑ 2026-09-03 late: bank params are
  AUTOMATION TARGETS — `seq:<track>:<dspKey>`, ranges in `SEQ_AUTO_TARGETS`; the DSP stages
  them like chain params and JS applies through the bank's own write path (one writer). ⏳ Josh's future ask: SEVERAL
  parameters on ONE macro with per-target min/max (a macro as a mapping, not a pointer). The chain's knob_N store is read once as a migration AND
  mirrored on every commit — Josh 2026-09-03: a whole-chain patch carries the assignments, and
  a patch load merges them back. ⭑RULED 2026-09-03: the knobs are the macros AT REST too (a
  track left on MACROS: sound mode open-but-resting on the overview, `soundOpen` vs
  `soundActive`); Module Level is OFF the SOUND + CONFIG card, a macro target only, and the
  card's bottom row is the door.)
  Eight assignable parameters from anywhere on the track's chain (Schwung route),
  or any valid MIDI message / bus level / other automatable parameter (Move and MIDI routes).
  Their widgets and metadata ARE the module editor's — the bank is a page of the same
  param-pages engine, composed by davebox (absolute keys, inline metadata), so editing and
  automating a macro IS editing and automating the underlying parameter: no macro lane, and
  the module editor reflects it because it is the same parameter. Jog-click opens the chain
  knob-assign menu (existing). Purpose: whole-chain manipulation in performance, and quick
  access to the parameters most often automated.
- **AUTOMATION** ✅ BUILT 2026-09-03 (plan item 4; `ui_automation_bank.mjs`; bank 14, last on
  the walk, bank 6 off it; resolution not surfaced — no playback effect yet). The bank card
  is a LIST of the
  parameters automated in the current clip, framed with the module editor's bracketed-corner
  cell to say "press jog to interact"; **the eight knobs are a no-op on the card.** Jog-click
  enters the menu; clicking an automated parameter offers its operations: delete, mute
  (deactivate), Smooth/Stepped (⭑ moves HERE from knob-touch + jog-click in the module editor),
  loop length and resolution (the store already carries `loop_len`/`loop_off`/`resolution`),
  and whatever else a lane needs.

⭑RULED (Josh, 2026-09-02, pre-P5 planning) **Adopted from the review of the above:**
- The AUTOMATION list shows EVERY kind of automation in the clip — pad-pressure (AT) lanes
  included, as rows of their own kind — so it is the one place that answers "what is
  automated here". Its edits (delete, mute, smooth, loop) each take an undo checkpoint.
- A macro whose target vanished (module swapped) shows as UNASSIGNED on the bank, never as a
  blank knob. Macros on a MIDI track wait for the MIDI Out device (P5).
- **Step copy/cut carries NOTE data only** — locks stay with the step (Josh). Clip and row
  copy carry automation, as built.
- **Hold a step, see the locks**: while a step is held, the module editor and MACROS show each
  parameter's value AT THAT STEP. **Clear the clip**: a menu action, with Delete + jog-click on
  the AUTOMATION card as its shortcut. **Quick assign on MACROS**: Shift + touch a macro knob
  picks its target without leaving the bank (the one place the Shift+touch assign flow
  survives). "Go to the parameter" from the AUTOMATION menu: only if it is easy. No "writing"
  ring colour while recording (declined).
- **Hold on an empty step (c)** ⭑RULED (Josh, 2026-09-02 midday, supersedes the Note-knob
  line): **a hold never creates a note; pressing a note pad while the step is held creates
  it.** (The "Note knob on an empty held step" idea had no surface: in the chain editor a held
  step keeps the editor on screen and its knobs, so no Note knob is ever visible there.)
- **THE HELD STEP, ONE LAW EVERYWHERE** ⭑RULED (Josh, 2026-09-02 midday — "I don't want to
  split behavior anywhere"): **a held step redirects the on-screen knobs to that step.** In
  the module editor (and on MACROS) that writes p-locks. The step editor's own values (Note,
  Oct, Leng, Vel, Nudg, Iter, Prob, Ratch) **become a BANK — the STEP bank — alongside the
  other davebox banks**; on it a held step with a note shows and edits that step's values, and
  with no step held (or an empty step held) the knobs read `--`. Banks whose knobs are track
  settings decline the held step (nothing to write per step). **Step edit is never the
  default view.** Shortcut ⭑RULED (Josh, 2026-09-02, revised from Left/Right to the JOG —
  "the generalized gesture to switch between alternate views"): **while holding a step, a jog
  turn right reveals the STEP bank; a jog turn left returns to where you were. Two positions,
  no cycling** — further right turns at the STEP bank do nothing, further left turns at the
  origin do nothing. While a step is held the jog's usual walk (banks on a card, pages in the
  editor) is suspended; release to page, then hold again. Shift+jog (track switch / section
  jump) is declined while a step is held. Jog-click keeps its meanings. The STEP bank is also
  in the ordinary bank walk, reading `--` with no step held.
  ⭑RULED (Josh, 2026-09-02 afternoon, from `held-step-review.md` §6): **a REVEALED STEP bank
  is transient — releasing the step returns to where you were** (a walked-to STEP bank stays);
  **one undo unit per hold session** on the STEP bank; **drum: a velocity-zone pad while
  holding an empty step creates the hit at that velocity**; **arrows keep paging while a step
  is held** (extending a note past the page is intended; gate-drag already measures in absolute
  steps — the review's "page-relative bug" claim was retracted); **any knob or jog turn while a step is down
  promotes the press to a hold** on every bank (a tap on a filled step clears it, so a fast
  press-turn-release must never read as a tap); **bank 6's old held-step CC editor is gated
  off when the STEP bank lands** (no exception until P8); **conductor tracks get the STEP
  bank**; footer hints re-label the jog slot `JOG STEP` while held / `JOG BACK` on a revealed
  STEP bank, per the canon — no new chrome. The "NO NOTE — play a pad first" flash retires.
  ⚠ The manual's "hold several steps to edit them together" has never been true (the second
  press is gate-drag) — corrected with this front.
  **Multi-step hold (a)**: single-step locks only; gate-drag keeps the second press.
  **Macro targets on a MIDI track (a)**: the MIDI Out device's eight CCs + aftertouch, and the
  bus levels — the CC NUMBER is assigned on the device, in one place.

⭑RULED (Josh, 2026-09-02) **The deferred save never runs while the transport plays** —
except at the Record-off edge (the end of a take). It runs on transport stop, after one second
of quiet while stopped (a knob turned while stopped dirties the project per detent), and on
quit, suspend and project switch as today. Rationale: a save is a serialization on the SPI
thread plus a file write with fsync on the JS thread; during a recorded sweep the old rule
fired one every poll, on a tick that is already the system's constraint. The chunked fetch
keeps the dirty flag set until a save completes, so waiting loses nothing.

## 3. The grammar (all ⭑RULED)

- **Write gate**: automation is written only while **Record is on** and the transport plays
  (Move §14.2; also the old lanes' rule). Outside recording, a turn changes the live value.
- **P-locks**: hold a step — during playback or record — and turn a knob: the knob position
  writes to that step, Elektron-style. Multi-step hold writes all held steps (Move
  §14.2.4).
- **Override**: turning during playback without recording overrides temporarily; recorded
  automation **resumes on knob release** (Move parity — supersedes the earlier
  loop-restart answer).
- **Deactivate without delete**: **Mute + knob touch** toggles a param's automation off/on.
- **Status at a glance**: **holding Mute** paints the knob LEDs — unlit = no automation,
  red = active, white = deactivated (Move §14.2.2).
- **Clear**: **Delete + knob touch** deletes ALL of that param's automation in the clip —
  locks and recorded alike.
- **Indication**: **filled circle** by the value = active automation; **empty circle** =
  deactivated (replaces the movy modulation dot/`~` in the editor).

## 4. The curve model (⭑RULED)

**Stepped-hold is the default: a point holds its value until the next point** — which is
also the p-lock range rule (a lock lasts until the next automation point; no to-next-note
machinery). **Per clip, per param, a `Smooth` flag switches playback to linear
interpolation between points.** Live recording is what-you-record-is-what-you-get in either
mode: recorded turns are dense point streams, so the flag audibly matters only for sparse
hand-placed locks — exactly when the choice is wanted.

## 5. What retiring the lanes costs (accepted, with recall options)

1. **Per-lane independent loops + resolution/zoom** (polymetric sweeps). ⭑RULED
   (Josh, 2026-09-02): he wants this back eventually. NOT by keeping old lane code dormant
   (dormant code re-arms latent bugs) — instead the NEW store carries optional per-param
   `loop window (length, offset)` + `resolution` fields from day one, sparse-serialized,
   defaulting to "follow the clip", and the evaluator wraps on that field. v1 surfaces no
   UI for them; lighting them up later is UI-only, no storage migration.
2. **The bank-6 graph card** — replaced by the read-only OVERVIEW (§6.1 ruled).
3. **The remote UI's lane editor** — re-pointed at the new store (or dropped from v1 and
   re-scoped; the rui surface is a follow-up either way).

## 6. Residue — CLOSED (Josh, 2026-09-02)

1. **Bank 6's slot**: ⭑RULED — **keep as a read-only automation OVERVIEW** (graphs of the
   track's automated params; no editing there).
2. **The Smooth toggle's surface**: default adopted — knob touched + jog-click toggles
   Stepped/Smooth for that param in this clip (popup confirms).
3. **Delete+step reach**: default adopted — Delete+step clears every param's lock at that
   step (one gesture, everything automated there), alongside its existing note-clear meaning.
4. **Capture retro-buffer** for editor knobs: phase 2 (default adopted).
5. **Bake/Export**: ⭑RULED (refined 2026-09-02) — **the two paths are SEPARATE**. BAKE
   (Print, result stays in davebox): full inclusion — every automation entry survives, with
   length-pinning when the bake unrolls the clip. EXPORT (→ Ableton Live, MIDI): CC/AT
   entries render into the file; chain-param entries are omitted (no MIDI representation —
   they mean nothing to Live without the chain).
6. **MIDI Out device shape**: ⭑RULED — **8 CC knobs + Aftertouch** per track; assignment
   (pick CC0–127) lives on the device's own config page.

## 7. Engineering notes (non-blocking)

- Storage per clip, keyed by param (slot, component, key) + the MIDI Out pseudo-params;
  state version bump, NO migration (ruled); sidecar + remote-UI sync surface.
- Playback = budgeted slot-param writes on the tick (the 2.9 ms law is READBACK-only;
  writes ride the existing queues; [[schwung-shadow-set-param-fire-and-forget-loss]]
  applies to any shadow path).
- The editor's `decorations` argument (`{value, locked}`) is the rendering seam for the
  circles/live value — an unproven extension point today; wiring it is part of this front.
- Lane machinery deletion (DSP `cc_auto`/lane structs, bank-6 card, LED gradient, step-edit
  CC path) is a large subtraction — prove reachability chains before deleting
  ([[schwung-prove-the-reachability-chain-before-deleting]]).
- Sequencing: implementation starts after Josh's hardware pass on the bank-audit/step-record
  stack (this front reshapes the same editor surface).
