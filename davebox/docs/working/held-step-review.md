# The held step — design review before the spec is final

**Status: REVIEW for Josh's rulings (2026-09-02).** Reviewed against three sources: the
automation spec §2/§3 as ruled today, `MANUAL-SA.md` §6.1–6.3 (the documented grammar), and
the Move manual's own step editing and per-step automation (native parity), plus a line-level
inventory of everything a held step does in the code today (`ui_input_pads.mjs`,
`ui_input_cc.mjs`, `ui_tick.mjs`, `ui_render.mjs`, `ui_sound.mjs`, `ui_automation.mjs`).

The test throughout: **quick, intuitive, predictable — and one law, no split.**

---

## 1. The ruling under review, restated

1. A held step redirects the on-screen knobs to that step. Editor and MACROS write p-locks.
2. The step editor's values (Note, Oct, Leng, Vel, Nudg, Iter, Prob, Ratch) become the STEP
   bank. With a note held it edits that step; with nothing (or an empty step) held it reads `--`.
3. A hold never creates a note. A pad press while the step is held creates it.
4. While holding a step, jog right reveals the STEP bank, jog left returns. Two positions, no
   cycling. Step edit is never the default view.
5. Track-setting banks decline a held step.

Verdict up front: **the model holds.** It is one law, it survives every gesture in the
inventory, and it is *more* predictable than today (where a hold changes the screen under you
on every bank except the editor). What follows is the set of edges the ruling does not yet
cover, each with a recommendation. Eight need a decision; the rest are engineering.

---

## 2. Native Move: the other mode-free design, and the one real conflict

Move never uses the device encoders for note editing. While a step is held:

| Move control | does |
|---|---|
| the 8 encoders | per-step automation (a lock), always |
| the wheel | note length (10 % of a step per click) |
| the Volume encoder | velocity |
| + / − | transpose a semitone; long-press an octave |
| ← / → | nudge 10 % of a step; Shift = 1 %; long-press = a full step |
| pads | add notes to the step |

That is also "one law": the encoders always lock; the note is edited with everything *else*.
It has no page switch at all, which makes it faster for the four common edits. It has no home
for Iter / Prob / Ratch (davebox's own), so davebox would need the STEP bank regardless.

**The one direct conflict: the wheel.** Move's wheel-while-held is note length; our ruling
makes it the view toggle. Both cannot exist. **Recommendation: keep the ruling.** The toggle
reaches all eight values with their names on screen; length stays on K3 of the STEP bank, one
jog turn away. Native's non-wheel shortcuts are *compatible* with the ruling and are worth
adopting where they are free (see §4.3 arrows, §4.4 +/−).

---

## 3. The STEP bank itself

### 3.1 Two ways in, two lifetimes (decision 1)

The STEP bank is reachable two ways, and they should have different lifetimes:

- **Walked to** on the bank card (jog on the card, or the picker): it is the active bank and
  stays up. With nothing held it reads `--`; hold a step and it fills. Release, it goes back
  to `--`. This is the "I am editing steps now" posture.
- **Revealed** under a hold from anywhere else (jog right): it is transient. **Releasing the
  step returns to where you were**, exactly like jog left. Otherwise "step edit is never the
  default" is violated the moment a user lets go with the STEP bank showing, and the bank they
  were on has silently changed.

Recommendation: reveal is transient, release returns. Jog left returns early.

### 3.2 What the knobs do on an empty held step

`--` on all eight, and the knobs decline (nothing to write; there is no note). A pad press
creates the note, the cells fill, and the knobs go live in the same hold. The "NO NOTE — play
a pad first" flash (`ui_tick.mjs:1752`, `ui_render.mjs:1485`) retires: it existed only because
a hold needed a note to auto-assign.

### 3.3 The tap window is the sharp edge (engineering, must not regress)

Today a *tap* on a filled melodic step **clears it** (`ui_input_pads.mjs:1681-1721`), and a
tap is any press released inside ~200 ms (`STEP_HOLD_TICKS = 19`). The step editor's knobs
only act after the threshold (`heldStepNotes` is empty until then), so a fast press-turn-release
cannot both edit and then clear — the turn does nothing before the threshold. The editor's lock
path solved the same problem the other way: the first turn *promotes* the press to a hold
(`S.stepHoldPromote`, `ui_automation.mjs:547`).

The STEP bank must promote, not gate. A user who presses a step and turns Vel in 150 ms expects
the velocity to change, not the step to vanish on release. Rule: **any knob turn or jog turn
while a step is down promotes the press to a hold** (closes the tap window), on every bank.
Same mechanism, one more caller. Pin it: the promote path is the one that "a fast press-turn-
release cleared my step" would regress into.

### 3.4 One undo unit per hold (decision 2)

A lock gesture is one undo checkpoint (`ensureCheckpoint`). Step record's whole session is one.
The step editor's writes today (`_vel`, `_gate`, `_nudge`, …) take none of their own. Under the
new law a hold on the STEP bank is a *session* on that step — Vel, then Leng, then a pad press.
Recommendation: **one checkpoint per hold, taken lazily on the first write**, so Undo removes
"what I did to that step" and not one detent of it. Same shape as step record.

### 3.5 Registering the bank is eight edits, not one (engineering)

The inventory lists them: `BANKS`, both cycle arrays, `bankDisplayName`, `bankCyclePos`,
`BANK_SOUND_PREV`, `PARAM_LED_BANKS`, `PER_CLIP_BANKS`, and every `activeBank === 6` guard.
Conductor tracks fall into the melodic step editor today, so the STEP bank belongs in the
conductor cycle too (or the conductor declines; pick one — recommend include, it edits the
conductor's clip today). Drum tracks get the drum layout (Leng Vel Nudg — Iter Prob Ratch —),
melodic the note box + six. This is the existing render (`ui_render.mjs:1602-1673`) moved
behind a bank, not new drawing.

---

## 4. Every gesture on a held step, under the new law

### 4.1 Pads while held — the note gesture (ruled; one drum decision)

Melodic: a pad press toggles that pitch on the held step, additive (`ui_input_pads.mjs:463`).
On an empty step that IS the creation. Unchanged, and it is the ruling.

Drum (decision 3): the pads are lanes, not pitches; there is no pitch to choose, and the
velocity-zone pads set the hit's velocity while held (`:316-322`). On an *empty* held drum step
today they write `_vel` to nothing. Recommendation: **a velocity-zone pad while holding an
empty drum step creates the hit at that velocity.** It is the drum reading of "a pad press while
held creates the note", and it is faster than tap-then-hold.

External MIDI note-in while held (`ui.js:788-806`) keeps its additive behaviour; the "replace
the auto-assigned note" branch retires with the auto-assign.

### 4.2 Second step press — gate-drag (ruled; the manual is wrong)

After the threshold, a second step press is gate-drag (`:1370-1391`, `:1474-1497`), and the
spec's multi-step ruling (a) keeps it. But `MANUAL-SA.md` §6.3 says *"hold several steps to
edit them together"* — which the code has never done: the second press has always been
gate-drag. Fix the manual with this front; nothing to build.

Inside the tap window a second press toggles further steps (`:1355`, `:1446`). Keep; it is the
"tap several steps together" line of the manual and it does not involve a hold.

### 4.3 Left / Right while held (RULED: keep paging — and there was NO bug)

Today they page the step grid underneath the hold (`ui_input_cc.mjs:2649-2712`). **That is
intended and stays** (Josh): paging while holding lets you extend a note past the current
page visually — page forward, tap the step where it should end.

⚠ **Retraction.** The first version of this review called the cross-page gate-drag "a latent
bug" (length computed against the new page). It is not: `heldStep` is absolute, and the tapped
step is computed as `currentPage * 16 + idx` at tap time — also absolute — so the span from a
step on page 0 to a step on page 1 is measured correctly (`ui_input_pads.mjs:1370-1391` drum,
`:1474-1497` melodic; no page guard precedes either). The claim came from the code inventory
and was relayed without being checked against the arithmetic. Nothing to fix here; a test that
pages before the second press is still worth adding as a pin, since the behaviour is now a
ruled feature.

Native's arrows-nudge is therefore NOT adopted; nudge stays on K5 of the STEP bank.

### 4.4 Up / Down while held

Today: the pad octave range shifts so you can reach the note you want (`:2754-2786`), which is
what the ruling needs ("press a pad while held"). Keep. Move's +/− transposes the *held note*
instead; davebox's K1/K2 do that on the STEP bank. No change.

### 4.5 Jog while held (ruled; engineering notes)

- Intercept **before** sound mode's jog handler (`ui.js:556-560` → `soundOnCC`) and before the
  bank-card walk (`_onCC_jog`), on `heldStep >= 0`. Both walk today with nothing checking the
  hold.
- The jog is a relative encoder with acceleration. One detent toggles; further detents in the
  same direction are ignored; the opposite direction returns. Debounce ~150 ms after a toggle
  so a flick does not bounce.
- Shift+jog (track switch, section jump) declined while held. Jog-click keeps its meanings;
  on the revealed STEP bank it does nothing.
- If the hold began *on* the STEP bank (walked to), left and right both do nothing.

### 4.6 Knobs on the other banks (ruled)

The generic bank-knob handler already returns early while a step is held (`ui_input_cc.mjs:
3700`, `:4130`), so "decline" is today's behaviour minus the screen change. The MACROS bank
locks (it is a param-pages page). The AUTOMATION bank's knobs are a no-op on its card anyway.

Bank 6 until P8 deletes it: the old held-step CC editor (`:3385-3424`, the graph view at
`ui_render.mjs:1493-1596`) is a *third* held-step surface. It should be gated off with this
front — decline like a settings bank — rather than left as an exception until P8. It is the one
place the old "hold changes the screen" behaviour would survive.

### 4.7 Modifier + step (unchanged, listed for completeness)

Delete+step (clears notes + every lock at the step), Copy+step (notes only, locks stay — ruled),
Shift+step (shortcuts; blocks entering a hold), Loop+step (loop gesture; Loop press clears a
hold) all run *before* the hold branch and are untouched. Mute+step in Track View falls into the
ordinary press today; leave it.

### 4.8 Step record

Does not use holds; owns ← / → while its session is open (`ui_record.mjs`). A step hold during
step record runs the editor concurrently today (no guard). Under the new law the arrows stay
step record's while it is open — the nudge meaning of §4.3 yields to it, as paging does now.
Recommend also declining the jog toggle while step record is open; it is a modal session.

### 4.9 LEDs

The gate-span overlay and the K3-touch length paint (`ui_leds.mjs:207-231`, `:345-374`) fire on
`heldStepNotes.length > 0`, so they light on a filled held step on every bank and stay dark on an
empty one. Correct under the new law. Move also turns the following step LEDs red while a lock is
being written to show the lock's range; davebox's P4 paints rings, not steps. Not required;
noted as a later polish.

---

## 5. Hints (Josh's note, in the UI language)

The footer canon (`UI_LANGUAGE.md` §, keys `JOG · CLK · BACK · SHFT · MUTE · KNB`) already
shows what the jog does on every screen: `JOG BANK` on a card, `JOG PAGE` in the editor. When a
step is held the jog's meaning *changes*, and the rule "never hint a gesture that does not exist"
says the pair must change with it. So the hint is not extra chrome — it is the same slot
re-labelled for the duration of the hold:

| where | nothing held | step held |
|---|---|---|
| bank card / editor | `JOG BANK` / `JOG PAGE` | `JOG STEP` |
| STEP bank, walked to | `JOG BANK` | `JOG BANK` (it is the active bank) |
| STEP bank, revealed | — | `JOG BACK` |

`JOG STEP` follows the canon's noun form (`CLK STEP` exists). Two words, no new row, no popup.
The STEP bank's own footer otherwise follows the kit-page rules (`KNB` pair per the touched knob,
`BACK EXIT` as every bank). That is as unobtrusive as the language allows, and it is discoverable
exactly when it matters.

---

## 6. Decisions, in one place

1. **Reveal is transient**: releasing the step returns to the origin; jog left returns early.
   (Recommend yes.)
2. **One undo unit per hold session** on the STEP bank. (Recommend yes.)
3. **Drum: a velocity-zone pad while holding an empty step creates the hit** at that velocity.
   (Recommend yes.)
4. ~~Arrows while held = nudge~~ **RULED (Josh): arrows keep paging while held** — it is how
   a note is extended past the page. ⚠ The "gate-drag measures page-relative" bug claim was
   WRONG (retracted, §4.3); pin the cross-page case with a test, change nothing.
5. **Jog while held = the toggle, not native's length.** (Confirms the ruling.)
6. **Bank 6's held-step CC editor is gated off now**, not left as an exception until P8.
   (Recommend yes.)
7. **Conductor tracks get the STEP bank** in their cycle. (Recommend yes.)
8. **Hints**: `JOG STEP` / `JOG BACK` re-label the jog slot while held; no new chrome.
   (Recommend yes.)

Engineering that needs no ruling: promote-on-first-turn everywhere (§3.3); the "NO NOTE" flash
retires; the manual's multi-step line is corrected; the jog intercept order and debounce (§4.5);
the eight registration edits (§3.5); a cross-page gate-drag test is added as a pin (§4.3 — no bug, retracted).
