# Export: where automation can live in a Move Song.abl

> 🔴🔴 **REFRAMED 2026-09-05 by Josh, and this supersedes most of what follows.** Three
> clarifications: **(1)** there is no path or expectation for Live-set INPUT — ignore it
> entirely (the Live→Move analysis below was answering a question nobody asked). **(2)**
> *"davebox can write whatever it wants into a live set it creates for export — the issue is
> whether live can read it appropriately."* **(3)** Live reads clip-level automation for all
> standard MIDI messages.
>
> ⇒ **The question is not "what does Move write", it is "what does Live accept" — and the
> reference `.als` is therefore a complete SPEC, not merely a goal.** It is self-describing:
> the MIDI track declares `<MidiControllers>` with **131** `ControllerTargets.<n> Id="…"`
> entries; a `<ClipEnvelope>`'s `<EnvelopeTarget><PointeeId>` names one of those ids; events are
> `FloatEvent Time/Value` with times in BEATS. `<NextPointeeId>` at the document head means **we
> own the id space** — davebox assigns the ids itself. Measured from the file: index **0** is
> PITCH BEND (values −8192…8191) and the automated CC sits at index **13** (values 0…127).
>
> ✅ **BOTH ANSWERED by Josh, 2026-09-05:**
> **(a) `.ablbundle` is REQUIRED** — *"needs to be the ablbundle to ensure move devices and
> samples inside it load properly."* So writing a `.als` is OUT, and everything below about
> `Song.abl` is the live path, not a fallback. The `.als` analysis stays as REFERENCE ONLY: it
> documents what Josh wants to SEE in Live, and nothing more.
> **(b) The reference automates PITCH BEND and CC 11.** With the count that pins the whole
> `ControllerTargets` mapping arithmetically: CC 11 sits at index **13**, so the offset is 2, and
> with 131 entries (indices 0–130) the layout is
> `0` = pitch bend · `1` = ? · `2 + N` = **CC N** (N = 0…127, indices 2–129) · `130` = ?
> ⚠ Indices 1 and 130 are the two non-CC slots and are UNCONFIRMED — likely channel pressure
> (which davebox's `at` target needs) and program change, in some order. One more reference with
> aftertouch automated would settle it. ⭑ This is `.als`-side knowledge, so it only matters if we
> ever verify Live's rendering by hand; it is NOT what the bundle needs.

> 🔴 **CORRECTED 2026-09-05, same day, by Josh: *"are you saying alsbundle files require
> automation to tied to notes?"* — NO, and §5 originally implied it. Move RECORDS PARAMETER
> AUTOMATION NATIVELY** (Move manual: select a device in Device View, press Record, turn an
> encoder), so clip-level automation certainly exists in the format. `clip.envelopes` was `[]` in
> all 23 files here for a mundane reason — **none of those sets has any automation recorded.**
> Most are davebox exports, which write none; the device sets are davebox's own. I turned "I have
> no examples" into "the format cannot do it". The unblock is therefore the ORIGINAL one and it
> was right all along: **record automation on the Move, save, and read that Song.abl.** See §5.

**Status: FINDINGS ONLY (2026-09-05). Nothing built.** The export half of sequence item 9 was
deferred because "the Set's schema is undocumented". It is now HALF answered — the field names are
known, and one of the three candidate encodings is ruled out — but the decisive question needs a
sixty-second check by Josh on the Mac. **Do not build against this until §5 is answered.**

Josh supplied `dbxautomationreference.als` as the reference. ⚠ Read it as **the goal, not the
encoding** — see §4.

## 1. What davebox actually writes

`ui_export.mjs` builds **`Song.abl`** (JSON) and `export/pack.py` zips it into an
**`.ablbundle`**. It does NOT write Ableton's desktop `.als` (gzipped XML). The two are different
formats with different schemas, and this is the single most important thing to hold on to when
reading the reference file.

`Song.abl` declares `"$schema": "http://tech.ableton.com/schema/song/1.8.3/song.json"`.
⚠ **That URL is a namespace, not a document** — `tech.ableton.com` does not resolve (checked
2026-09-05; general network was fine, `example.com` returned 200). There is no schema file on the
device either (`find / -xdev -name "song*.json"` → nothing).

## 2. The field names, and where they came from

Live 12 Suite contains the Move-song importer, so its binary carries the key names. Provenance —
`strings -a "/Applications/Ableton Live 12 Suite.app/Contents/MacOS/Live"`, the cluster at lines
**667690–667710** (and its duplicate at 1014385–1014406):

```
automations          <- per-NOTE
PitchBend
Pressure
Invalid CC number
Duplicate CC number
breakpoint
...
envelopes            <- per-CLIP
parameterId
Unknown id
Object has wrong type
breakpoints
```

Also present: `oAllClipEnvelopesInAllTracks.has_value()` in `DocumentMigration.cpp`, and the
document-version ladder `0.9.0 … 1.7.0`.

So there are **two** automation containers:

| container | shape | keyed by |
|---|---|---|
| `clip.envelopes` (list) | `{parameterId, breakpoints:[{time,value}]}` | a numeric `parameterId` that must RESOLVE ("Unknown id") |
| `clip.notes[n].automations` (object) | `{"<key>": [{time,value}, …]}` | `PitchBend`, `Pressure`, or a **CC number** |

## 3. What real files show

Read from an actual device set
(`Sets/afc52b01-…/Project 1/Song.abl`, 200 KB) and every `.ablbundle` in `~/Downloads` and
`~/Desktop` — **23 files**:

- **`clip.envelopes` is `[]` in every single one.** Not one example exists locally.
- `clip.notes[n].automations` is POPULATED, with `Pressure` breakpoint lists.
- ⚠ **There is no parameter-id space in the document.** Device `parameters` and
  `deviceData.modulations` are keyed by parameter NAME strings (`Voice_Filter1_Frequency`); the
  only ids anywhere are `lockId`, `grooveId` and `grooves[].id`. So nothing in a Move-written
  Song.abl could be the referent of `parameterId`.
- ⭑ **Per-note automation `time` is NOTE-RELATIVE, bounded by the note's `duration`** — measured,
  not assumed: across 18 populated notes, no automation time exceeded its note's duration (0/18),
  and the minimum never tracked `startTime` (notes start as late as 31.0 while automation times
  stay under 8). Clip-absolute encoding would show the exact opposite on both counts.

## 4. ⚠ How to read the reference `.als`

`dbxautomationreference.als` (Live 12.3.2): tracks `0-Main` and `1-MIDI`, **no devices**, one
`MidiClip` carrying two `ClipEnvelope`s —

- `PointeeId 15991`, values −8192 … 8191 → **pitch bend** (14-bit signed)
- `PointeeId 16004`, values 0 … ~127 → **a CC**

Times are in beats: 0, 1, 1.5, 2.5, 3, 4.

⚠⚠ **This is not the encoding to copy, for two reasons.**
1. `PointeeId` is Live's own internal id space. Live's MIDI-track pitch-bend/CC controls are a
   Live-side feature; a Move set cannot produce them.
2. **Live Sets cannot be transferred to Move at all** — Ableton state this explicitly
   ("It is currently not possible to transfer Live Sets from Live to Move"), so this file could
   never have come from Move and cannot be converted into a Move set. Move → Live works; the
   reverse does not.

So it says **what Josh wants to SEE when the export lands in Live** — a CC envelope and a bend
envelope on the clip — and says nothing about how `Song.abl` should encode that.

## 5. Which container davebox should write — and how to settle it

The plan (`param-automation-plan.md` P7) reads: *"EXPORT (→ Live, MIDI): cc:/at entries render
into the non-destructive renderers (:258-459, :939); chain-param entries omitted (no MIDI
representation)."*

- **(A) Per-note `automations`** — `at` → `Pressure`, `cc:N` → the CC-number key, `pb` →
  `PitchBend`. ✅ Exists and is populated in real files. Times note-relative (§3).
  ⚠ Awkward fit: davebox's automation is a CLIP-level lane, so it would have to be sliced per
  note and re-based, and automation in the gaps between notes has nowhere to go.
- **(B) Clip `envelopes`** — `{parameterId, breakpoints}`. ⭐ **This is very probably the right
  answer and was wrongly dismissed.** Move records parameter automation itself, so Move writes
  this container; we simply have no file that contains one, which is why `parameterId`'s referent
  is still unknown. 🚫 The earlier claim that it "targets device parameters only, so cc:/at have
  no clip-level home" was an INFERENCE FROM ABSENCE and is retracted.
- **(C) Live-side MIDI-track envelopes**, as in the reference `.als`. 🚫 Still dead, and this one
  IS evidenced: Live can READ `.ablbundle` (`NFile::SIsInUnpackedAblBundle`) but there is no
  "export set to Move" anywhere in its binary, and Ableton document that Live Sets cannot be
  transferred to Move. Its JSON writer (`PersistenceSave.cpp`) serves `devicePreset.json` —
  presets, which ARE exportable to Move — not `song.json`.

**❓ THE UNBLOCK — 60 seconds ON THE MOVE (not the Mac):** record automation on any Move device
parameter (Device View → Record → turn an encoder), save the set. Then read that `Song.abl` — it
is pulled straight off the device, no Move Manager needed:
`scp "ableton@<ip>:/data/UserData/UserLibrary/Sets/<uuid>/Project N/Song.abl" .`
That one file shows `clip.envelopes` in use and what `parameterId` refers to, which is the whole
question the deferral was about.

## 5b. 🚫 RETRACTED — "the bundle is bounded by what Move can do" is FALSE

This section previously argued that because Move's own automation is device-parameter automation,
a MIDI message might have no clip-level target in `Song.abl`. **Josh killed it with better
evidence than the argument had:**

> *"we've already established that ablbundle sets can contain more than move could provide on its
> own bc we're putting 8 tracks into them and move only has 4. the implication is the ablbundle
> set IS an abl set as far as ableton is concerned."*

davebox already writes **8 tracks** into a bundle when Move itself holds 4, and Live reads it. So
`Song.abl` is a general Ableton set format, and **what Move can author says nothing about what the
format can express.** The only constraint is Live's READER.

⚠⚠ That is now TWICE in one session that reasoning from "I have no example of X" produced a false
claim about the format ([[verify-the-premise-not-just-the-test]]). The lesson is specific: **the
schema's capability is not observable from the corpus we happen to hold.** Stop theorising about
it and test the reader.

## 5c. ⭐ RULED (Josh, 2026-09-05) — MIDI params, **and the mixer**

> *"the export only needs to name midi params. bc davebox doesn't automate move devices directly
> and live doesn't support schwung modules. midi envelopes are the only thing that CAN carry
> over."*
> …then: *"mixer level levels, pan, and send levels should also carry and be based on the dbxhost
> bus levels."*

The test is **does the target exist in Live**, and it settles every kind:

| davebox target kind | exports? | why |
|---|---|---|
| `cc:<n>` / `at` / `pb` | ✅ | a MIDI message means the same thing in Live |
| `level` → volume, pan, send A, send B | ✅ | **the track MIXER is standard Ableton, not a Schwung module** — `track.mixer` is `{pan, volume, sends, …}` and Live models it as a device (`mTrackMixerDevice`). Source of values: the **dbxhost bus levels** (Josh) |
| `level` → **Module Level** (`synth_volume`) | 🚫 **RULED OUT (Josh): "don't carry module level"** | it is the module's own output gain INSIDE a Schwung chain, and there is no Schwung module in Live |
| `chain` (a module param) | 🚫 never | Live has no Schwung modules; no destination exists |
| `bank` (`seq:`) | 🚫 never | davebox's own sequencer params; nothing in Live receives them |

⭑ This vindicates `param-automation-plan.md` P7 on chain params, and 5b's proposed inversion
stays retracted. But P7's wording ("cc:/at entries render…") is now **too narrow** — it never
mentioned the mixer, which is the second half of the scope.

### ⚠⚠ Three consequences of the mixer half, none of them optional

**1. ⭐ RULED (Josh): THE EXPORT MUST CARRY TWO EMPTY RETURN TRACKS** — *"an exported set needs
to carry to empty return tracks so that the 2 sends populate in each track."* He reached this
independently and it is the same conclusion the schema forces.

Today the export deliberately does the opposite: `ui_export.mjs:414` writes `returnTracks: []`,
and `:219` sets `mixer.sends = []` with the comment *"returnTracks is []"*. Live asserts the two
agree — `track.trackMixerDevice().component<FSends>().sends().size() == numReturnTracks` — so
Send A / Send B have nowhere to land until this changes. **A prerequisite step in the EXPORT, and
it stands on its own regardless of automation**: even the static send levels cannot round-trip
without it.

⭐ **RULED (Josh): EMPTY returns** — bare, no devices. So the sends land in silence by design;
the point is that the send LEVELS and their automation round-trip, and the user adds whatever
effect they want on the other end.
⚠ One technical risk this leaves standing: the export carries a Dummy Drift on every regular
track because *"Live rejects a track with no device"* (`ui_export.mjs` header), and whether a
RETURN track is subject to the same rule is untested. If an import ever fails after the returns
are added, **that is the first suspect** — the fix would be a dummy device on each return, not a
change to this ruling.

**2. THE VOLUME VALUE SPACE IS NOT KNOWN, ONLY COPIED.** `defaultMixer()` hardcodes
`volume: 0.6137250661849976` with no comment and no traceable origin (`git log -S` finds nothing).
It is plainly NOT dB, and 0.6137 is a suspiciously specific normalised value — so some earlier
work established it empirically and did not write down what it means. davebox's own levels are a
LINEAR GAIN (`SLOT_LEVEL_MAX`, 1.0 = unity), so an automation curve needs gain → this space, and
that mapping is very unlikely to be linear.
⚠ **Do not guess it.** Determine it: write two static exports at known davebox gains, open both
in Live, and read the resulting fader values. Guessing a curve here yields automation that plays
back at the wrong level everywhere — and quietly, since nothing errors.

**3. PAN NEEDS A CENTRE CONVERSION.** Song.abl's `mixer.pan` is `0.0` at centre (so presumably
−1…+1); davebox's pan is `0…1` with `0.5` centre. Map accordingly, and verify the sign — an
inverted pan automation is not obvious by ear on a mono-ish source.

## 5d. The one remaining unknown, and it is now small

**Can a `clip.envelopes` entry's `parameterId` name a MIDI message?**

⭑ Encouraging, and it is evidence not inference: **`Song.abl` already has a MIDI-message
vocabulary** — per-note `automations` uses exactly `PitchBend`, `Pressure` and CC numbers
("Invalid CC number", "Duplicate CC number" are the reader's own error strings). So this is not
about inventing names; it is about whether the CLIP-level container accepts the same ones.

The candidate set is small and enumerable:

MIDI:
1. `"parameterId": "PitchBend"` — the note-vocabulary string
2. `"parameterId": 11` — a bare CC number
3. `"parameterId": "11"` — the same as a string
4. `"parameterId": "Pressure"` — for `at`

Mixer (the same question, different vocabulary — the mixer is a device, so its parameter names are
the candidates):
5. `"parameterId": "volume"` / `"pan"` — the `track.mixer` JSON keys verbatim
6. `"parameterId": "Volume"` / `"Pan"` — Live's own parameter-name casing
7. a send: whatever names a send slot once return tracks exist (blocked on consequence 1)

**The probe:** write one bundle per variant, Josh double-clicks each, and Live's own log names the
outcome — `Unknown id` / `Object has wrong type` / `Parse error at offset` / `Couldn't open song`
at `~/Library/Preferences/Ableton/Live 12.3.2/Log.txt`.
⚠ Run a CONTROL first: confirm a known-good bundle import leaves SOME trace in that log, because
as of 2026-09-05 it contains no `ablbundle`/`song.abl` lines at all — otherwise "no error" is
indistinguishable from "not read" ([[a-check-that-cries-wolf-is-worse-than-none]]).

**If clip level rejects all four**, the fallback is per-note `automations`, which demonstrably
carries these exact messages — at the cost of slicing a clip-level lane per note and dropping
what falls between notes. ⚠ That would need a ruling from Josh; he has not agreed to it.

## 6. The shape of the work once §5d is answered

1. `render_melodic_clip`'s scratch format (`EXPORT_RENDER_PATH`) carries `tick pitch …` per note.
   Check whether it already has a field that could carry per-note automation before adding one.
2. Slice each `cc:`/`at`/`pb` lane by note extent; re-base times to the note's start; drop or
   clamp points falling between notes (a ruling is owed on which).
3. Emit `automations` on each note in `ui_export.mjs`'s note builder, keyed `Pressure` / the CC
   number / `PitchBend`.
4. Value ranges from the reference: bend −8192…8191, CC 0…127.
5. The oracle for values is the reference `.als`; the oracle for ACCEPTANCE is Live opening the
   bundle without complaint (`Unknown id`, `Invalid CC number`, `Object has wrong type` are its
   own error strings — worth grepping the Live log after a test import).

Related: `param-automation-plan.md` §P7, `ui_export.mjs`, `dsp/seq8_bake.c:228-459` and `:926`.
