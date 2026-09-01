# Param Automation (Front 3) — ONE automation system

**Status: RULED in the large (Josh, 2026-09-01) — full unification, option A. The behavioural
spec is Josh's (native Move cannot be driven by an agent; the manual + his rulings are the
source). Open residue in §6. Not implementation-ready until §6 closes or its proposals are
adopted by default.**

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
- **The AUTO bank (bank 6) RETIRES as a mode.** Whether its slot survives as a read-only
  automation OVERVIEW (graph of what's automated on the track) is open — §6.1.
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

1. **Per-lane independent loops + resolution/zoom** (polymetric sweeps). Recallable later
   as a per-param loop-length property; not v1.
2. **The bank-6 graph card** — §6.1 decides whether an overview view replaces it.
3. **The remote UI's lane editor** — re-pointed at the new store (or dropped from v1 and
   re-scoped; the rui surface is a follow-up either way).

## 6. Open residue (❓ — small; proposals stand as defaults if unanswered)

1. **Bank 6's slot**: retire outright, or keep as a read-only automation OVERVIEW (graphs
   of the track's automated params)? (Option A vs B from the discussion.)
2. **The Smooth toggle's surface.** Proposal: knob touched + jog-click toggles
   Stepped/Smooth for that param in this clip (popup confirms).
3. **Delete+step reach**: proposal — Delete+step clears every param's lock at that step
   (one gesture, everything automated there), alongside its existing note-clear meaning.
4. **Capture retro-buffer** for editor knobs (knob moves captured like notes, Move §14.3):
   proposed phase 2.
5. **Bake/Export inclusion** of param automation: v1 scope call.
6. **MIDI Out device shape**: how many CC knobs per track (8 like the old lanes? 16?),
   and where assignment lives (the device's own config page, mirroring the old assign
   mode). Engineering proposal at implementation time.

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
