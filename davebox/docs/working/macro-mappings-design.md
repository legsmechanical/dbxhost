# Macro mappings — several targets on one knob, each with a range

**Status: DESIGN ONLY (2026-09-04 night, sequence item 8). Nothing built. Needs Josh's rulings
on the questions in §6 before code.** Josh's ask (2026-09-03, with the bank-param keep-list):
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
2. **What the poll does.** Today the widget follows the target when something ELSE moves it
   (automation, the module editor, an LFO). A multi-leg `v` cannot be inferred back from its
   targets (two legs may disagree), so `v` is authoritative and the poll skips multi-leg slots.
   ⚠ This is the same trap as the 09-03 "only the first widget animates" bug in reverse — the
   rule must be written down in the poll, not discovered.
3. **What automation records — see §4.**

## 4. Automation identity (the ruling that matters most)

Two coherent options; they cannot both be true for one slot.

- **A. Record the LEGS (today's law, extended).** A turn writes every leg's target, and each leg
  records its own lane exactly as it does now. `+` nothing new in the owner, the AUTOMATION
  bank, the bank cards, Delete/Mute, the module editor's dot: they all already see the targets.
  `−` a 3-leg macro sweep records 3 lanes; smoothing / muting the *gesture* means editing 3
  lanes; and a lane recorded THROUGH a range plays back the range's output, which is right, but
  turning the range later does not re-shape old data (it is baked into the lane).
- **B. Record the MACRO (`mac:<t>:<k>`, a new target kind in the owner).** One lane of `v`;
  playback drives the legs through their ranges live, so re-ranging re-shapes playback.
  `+` one gesture, one lane, ranges are live. `−` a NEW target kind in `ui_automation.mjs`
  (`pushPair` branch + applier, like `seq:`), the AUTOMATION bank must label it, the bank cards
  and module editor cannot show "this param is automated" for the legs (the dot would have to
  be derived), and a leg's target automated directly AND through a macro has two writers —
  the exact thing the one-writer rule forbids, so one must win (proposal: the direct lane).

**Recommendation: A for a one-leg mapping (unchanged), B for a multi-leg one — and the moment a
second leg is added, the slot's existing lanes stay where they are (on the targets).** It keeps
today's world untouched and gives the multi-leg case the thing it exists for (a live mapping).
The cost is that the owner learns one more target kind (`mac:`), the same size as `seq:` was.

## 5. Surface

- **Assignment list** (jog-click on MACROS, today's `knobTargetList`): a slot row expands to
  its legs — `Cutoff  0..100%`, `Reso  40..80%`, `+ add` — jog to a leg, click to open the
  same target picker as today, Shift+click to remove. `lo`/`hi` are two more rows under a leg,
  adjusted in place (continuous, per the enum-vs-continuous law); the widget previews the leg
  as they move. No new screen: the list gets deeper, not wider.
- **Shift+touch quick-assign** stays: on an EMPTY slot it makes a one-leg mapping; on an
  occupied slot it ADDS a leg (today it replaces). Q6.3 asks whether that is what Josh wants.
- **Label.** A multi-leg slot needs a name; proposal: auto (`Cutoff+1`, first leg + count)
  with the text-entry keyboard behind the row for a custom one. Persisted in the sidecar.
- **Rings** (`registerRingCells`): `v` for multi-leg, the target's norm for one-leg — the same
  rule as the widget.

## 6. Questions for Josh (rulings needed before building)

1. §4: leg-lanes (A), macro-lane (B), or the split (A for one leg, B for many)?
2. Should re-ranging a leg move the target NOW (apply `v` through the new range immediately)
   or only on the next turn? (Proposal: now — a range edit is a turn of that leg.)
3. Shift+touch on an occupied slot: replace (today) or add a leg?
4. Is an inverted range (`lo > hi`) wanted, or should the list refuse it? (Proposal: allow.)
5. Ranges on enum targets: a sub-range of the option list, or all-or-nothing? (Proposal:
   sub-range — `lo..hi` picks the option span; it falls out of the fraction model for free.)
6. Does a bank-kind leg (`seq:`) participate, or only chain/level/MIDI? (Proposal: all kinds —
   the leg is today's record plus two numbers; nothing kind-specific.)

## 7. Order of work once ruled

1. Store shape + migration + sidecar `mac` v-bump; one-leg parity pinned in
   `test_macros_bank.mjs` (the whole file must pass unchanged — that is the control).
2. The turn: `v` → legs through ranges; the widget/poll/ring rule of §3.
3. The list: legs, ranges, add/remove, label.
4. Automation per the §4 ruling (B adds the `mac:` kind to the owner + AUTOMATION bank label).
5. Manual §6.x + CHANGELOG; memory note on "a macro is a mapping, not a pointer".

Related: `param-automation-spec.md` §2 (the store), memory
`davebox-macros-bank-second-sound-identity` (the kinds, the one-writer rule, the poll hand rule).
