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

## 5b. ⚠⚠ The plan's assumption may be exactly BACKWARDS

`param-automation-plan.md` P7 says: *"cc:/at entries render … chain-param entries omitted (no
MIDI representation)."* That was written from a MIDI point of view — CC is expressible on the
wire, a chain param is not.

But the bundle is a MOVE SET, and Move's own automation is **device-parameter** automation. So in
`Song.abl` the reverse may hold:

- **A chain/device parameter is exactly what `clip.envelopes` is FOR** — Move records device
  automation itself, so this container is its native home. These may export cleanly.
- **A MIDI message (`cc:`, `at`, `pb`) may have no clip-level target at all** — Move has no
  concept of automating outbound MIDI; the only MIDI-message vocabulary found anywhere in Live's
  importer strings (`PitchBend`, `Pressure`, CC numbers) sits with the **per-note** block, not
  with `envelopes`.

⚠ This is a HYPOTHESIS, not a finding — it is exactly the inference-from-absence that already
went wrong once here. The Move-recorded example above tests it directly: if the envelope it
produces names a device parameter, that half is confirmed, and whether a MIDI target can appear
at all becomes the one remaining question.

**If MIDI messages genuinely cannot be clip envelopes in a bundle, the honest options are:**
1. Export chain-param automation as clip envelopes (the reverse of the plan) and omit `cc:`/`at`/
   `pb` — stating the limitation in the manual.
2. Fall back to per-note `automations` for the MIDI kinds, accepting that a clip-level lane gets
   sliced per note and that automation between notes is dropped. ⚠ Needs a ruling from Josh; he
   has not agreed to this, only to its existence being a fact.
3. Both: envelopes for parameters, per-note for MIDI.

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
