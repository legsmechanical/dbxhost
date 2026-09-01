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
| Move | Move synth (a co-run DOOR, not params) + Schwung-side bus insert FX (≤4) + bus levels + MIDI Out (AT) | the FX, levels, MIDI Out — **never the Move synth itself** (no param API; parity with today — CC lanes couldn't reach it either) |
| EXT/MIDI | MIDI Out only | all of it — the CC panel becomes the track's instrument surface |

The Move-synth row is a door; doors don't get circles.

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
