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
> ❓ **OPEN, for Josh:** (a) is `.ablbundle` a REQUIREMENT or just how the export got built? If
> Live is the consumer, writing `.als` directly removes the last unknown — the tradeoff is that a
> bundle carries samples/kits inside it while a `.als` references them by path, so drum-kit
> export may depend on the bundling. (b) WHICH CC was automated in the reference? That single
> fact pins the whole index→message mapping and davebox can then emit any CC or bend lane.
>
> ⚠ Everything below about `Song.abl` remains ACCURATE but is only relevant if the answer to (a)
> is "the bundle is required".

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

**❓ Then one narrower question remains:** whether an envelope target can be a MIDI CC / pitch
bend, or only a device parameter. The example above will probably answer that too — and if it is
device-parameters-only, (A) becomes the fallback for `cc:`/`at`/`pb` rather than the plan.

## 6. If it turns out to be (A), the shape of the work

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
