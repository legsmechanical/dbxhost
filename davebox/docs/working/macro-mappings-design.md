# Macro mappings — several targets on one knob, each with a range

**Status: BUILT (2026-09-05) — §7 steps 1-3 are in: the store's legs, the mapped turn, and the
leg list. §6 is RULINGS, not questions. Step 4 is a no-op (ruling A needed no automation change);
what remains is step 5's manual pass and the two OPEN items at the foot of §5.** Josh's ask (2026-09-03, with the bank-param keep-list):
*"something for the future that may be worth keeping in mind: I eventually want to be able to
assign multiple parameters to a single macro knob and constrain their min and max values."*

## 1. What a macro is today (the shape this reshapes)

- A knob slot is ONE typed target: `GS.trackMacros[t][k] = {kind, …}` with kinds `chain`
  (`comp`,`key`), `level` (`key`), `bank` (`bank`,`k`[,`alt`]), `midi` (`target`).
- **The knob IS its parameter.** A turn runs the knob travel law on the target's own range
  (`KNOB_TRAVEL`: 255 positions × 2 detents, enum 4/step) and writes the target. The widget
  drawn in the cell is the target's own widget, at the target's own value (the poll re-reads it).
- **Automation records the TARGET, never the macro** (`macroAutoTarget`: `<slot>:<comp>:<key>`,
  `seq:<t>:<key>`, or the raw MIDI target). There is no "macro value" anywhere in the store.
- The chain's `knob_N_target/param` store is MIRRORED from the chain-kind slots so a whole-chain
  patch carries the assignments (Josh: "put it back"); non-chain kinds live only in the sidecar
  (`mac`).

## 2. The proposed shape

A slot becomes a **mapping**: a knob VALUE plus a list of legs.

```
GS.trackMacros[t][k] = {
  v: 0..1,                        // the knob's own position (NEW — a macro now has a value)
  legs: [ { kind:…, lo: 0..1, hi: 0..1 }, … ]   // each leg = today's target + a range
}
```

- `lo`/`hi` are fractions of the target's own range, so a leg is portable across targets with
  different units, and `lo > hi` is an INVERTED leg (turn up, cutoff goes down) for free.
- ⭑ `v` is only ever used by a **multi-target** mapping. A one-target mapping — ranged or not —
  is the plain path plus a clamp on the value, which is what keeps an int at two detents a voice
  instead of spreading 255 knob positions across eight values.
- A leg's output is `lo + v·(hi − lo)` in the target's units, rounded to its step; an enum leg
  quantises the same way the travel law does today.
- A ONE-leg mapping with `lo=0, hi=1` behaves exactly like today's macro, so the migration
  is `{kind…} → {v: <read from the target>, legs:[{…, lo:0, hi:1}]}` and nothing visible changes
  until a second leg or a range is set.
- The chain mirror keeps writing `knob_N_target/param` from the FIRST chain-kind leg (the
  patch format has one target per knob; the rest stays in the sidecar).

## 3. The one hard consequence: the knob stops being its parameter

With two legs there is no single parameter to *be*. Three things that were free become
decisions:

1. **What the widget shows.** Today: the target's widget at the target's value. Proposal: a
   one-leg mapping keeps that (unchanged look); a multi-leg mapping draws a plain `arc` of `v`
   with the label the user gave the slot (or `M1`..`M8`), and the touched header reads
   `<label>  <v as %>`.
2. **What the poll does.** ⭑ CORRECTED 2026-09-05 (Josh: *"and the pickup fix would apply only
   to multi destination macro knobs?"*). The line is **several targets**, not "has a range":
   - **One target, ranged or not** — there is nothing to disagree with, so the widget follows the
     target exactly as it always did. Such a slot is the PLAIN path plus a clamp and stores no
     `v` at all (see §4).
   - **Several targets** — `v` is authoritative and follows the **anchor**, the first addressable
     leg. Legs can disagree, but a recorded macro sweep wrote them all from one `v`, so in the
     case that actually happens the anchor is the right answer.
   ⚠⚠ The re-derive must run ONLY when the anchor moved to a value we did not write — every poll
   would snap `v` back to the anchor's own grid between detents, and a slow turn on a coarse
   anchor would never advance.
3. **What automation records — see §4.**

## 4. Automation identity — RULED: record the LEGS (A)

**Josh, 2026-09-05: A. A turn writes every leg's target, and each leg records its own lane
exactly as it does today.** There is no `mac:` target kind, the automation owner does not change,
and the AUTOMATION bank, the bank cards, Delete/Mute and the module editor's dot all keep seeing
the targets they already see. The rejected alternative (a `mac:<t>:<k>` lane whose playback drove
the legs live) is not built and should not be re-proposed without a fresh ruling.

What A costs, stated so it is not rediscovered as a bug:

- A three-leg sweep records THREE lanes. Smoothing or muting the *gesture* means editing three
  lanes; there is no one object that is "the macro's automation".
- **A range is BAKED into the lane at record time.** A lane recorded through `lo..hi` plays back
  the range's output — correct — but re-ranging the leg later does not re-shape data already
  recorded. Only new turns use the new range.
- ~~A multi-leg macro's knob does not follow playback, so the first turn after playback JUMPS.~~
  **RESOLVED 2026-09-05.** Move's knobs are endless encoders, so there was never a pickup
  *flavour* to choose — the whole problem was a stale stored position. A one-target mapping keeps
  no position (§3.2) and a multi-target one follows its anchor, so nothing jumps.
  ⚠ **The residual, and it is inherent to A, not a gap:** on a multi-target knob, if you
  automate a NON-anchor leg separately, the first turn pulls it back into line with the anchor.
  One knob imposes one position on everything it drives. Recorded macro sweeps never hit this —
  every leg came from the same `v`.
  ⚠ Also inherent: an int or enum leg riding a multi-target knob only changes every ~255/N
  detents. That is the price of sharing one knob with a float, and it is why a SINGLE ranged leg
  is deliberately NOT driven this way.

## 5. Surface

- **Assignment list** (jog-click on MACROS, today's `knobTargetList`): a slot row expands to
  its legs — `Cutoff  0..100%`, `Reso  40..80%`, `+ add` — jog to a leg, click to open the
  same target picker as today, Shift+click to remove. `lo`/`hi` are two more rows under a leg,
  adjusted in place (continuous, per the enum-vs-continuous law); the widget previews the leg
  as they move. No new screen: the list gets deeper, not wider.
- **Shift+touch quick-assign is RETIRED** (Josh, 2026-09-05: *"i don't think we need shift +
  knob gesture at all anymore since macro assignment is more easily available from macro bank.
  we can handle anything we need from the assignment menu"*). The assignment list is the ONE
  route in and out of a mapping — legs, ranges, labels and removal all live there. ⚠ This is the
  ASSIGN gesture only: Shift + TURN on a pitch-bend macro still LATCHES the bend (`pbShiftTurned`),
  which is a value gesture, not an assignment one, and is untouched.
- **Label.** ✅ AUTO is built (`Cutoff+1`, first leg's short name + the count; the K-list row
  adds `~` when any leg is ranged). ⏳ OPEN: the **custom** label behind a text-entry row is not
  built — it needs a keyboard screen and Josh has not asked for one. The auto label has been
  legible in every case so far.
- **Rings** (`registerRingCells`): `v` for multi-leg, the target's norm for one-leg — the same
  rule as the widget.

## 6. Rulings (Josh, 2026-09-05)

1. §4 — **A: record the LEGS.** Every leg records its own lane; no macro lane, no `mac:` kind.
   (He rejected both the split and B.)
2. Re-ranging a leg — **it does NOT move the target now.** A range edit takes effect on the
   NEXT turn of that knob. (The proposal was "apply now"; he unticked it.)
3. Shift+touch — **the gesture is retired entirely**, not re-specced. See §5.
4. Inverted ranges (`lo > hi`) — **allowed.** Turn the knob up, that target goes down.
5. Enum legs — **a sub-range** of the option list, not all-or-nothing.
6. Leg kinds — **all of them**: chain, level, MIDI and bank (`seq:`). A leg is today's target
   record plus two numbers; nothing is kind-specific.

Decisions NOT put to Josh (mine, each pinned in a test rather than left as prose):

- **Seeding `v`** when a slot first becomes multi-leg or ranged: inverse-map the FIRST leg's
  current value through its range and clamp to 0..1, so nothing jumps at the moment of adding.
- **Patch-load merge** with a multi-leg mapping: the patch's `knob_N` replaces the FIRST
  chain-kind leg's TARGET and keeps its range and the other legs; if the mapping has no chain
  leg, the patch's target is PREPENDED as one. The one-leg case is byte-for-byte today's.
- **The chain mirror** writes the first chain-kind leg (§2 already says this).

## 7. Order of work once ruled

1. Store shape + migration + sidecar `mac` v-bump; one-leg parity pinned in
   `test_macros_bank.mjs` (the whole file must pass unchanged — that is the control).
2. The turn: `v` → legs through ranges; the widget/poll/ring rule of §3.
3. The list: legs, ranges, add/remove, label.
4. Automation per the §4 ruling (B adds the `mac:` kind to the owner + AUTOMATION bank label).
5. Manual §6.x + CHANGELOG; memory note on "a macro is a mapping, not a pointer".

Related: `param-automation-spec.md` §2 (the store), memory
`davebox-macros-bank-second-sound-identity` (the kinds, the one-writer rule, the poll hand rule).
