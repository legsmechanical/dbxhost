# Export: where automation can live in a Move Song.abl

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

## 5. The three candidate encodings — and the one question that decides it

The plan (`param-automation-plan.md` P7) reads: *"EXPORT (→ Live, MIDI): cc:/at entries render
into the non-destructive renderers (:258-459, :939); chain-param entries omitted (no MIDI
representation)."* Those renderers emit **notes**, which points at (A).

- **(A) Per-note `automations`.** `at` → `Pressure`; `cc:N` → the CC-number key; `pb` →
  `PitchBend`. ✅ The encoding demonstrably EXISTS in the schema and in real Move files, and
  Live's importer reads it. Times are note-relative (§3).
  ⚠ The cost: davebox's automation is a CLIP-level lane, and this is a PER-NOTE container, so a
  lane has to be sliced per note and re-based to each note's start — and automation in the gaps
  between notes has nowhere to go.
- **(B) Clip `envelopes` with a `parameterId`.** Only meaningful for a target that IS a Move
  device parameter. `cc:`/`at`/`pb` never are, and chain params are explicitly omitted by the
  plan. 🚫 Dead for the targets we export.
- **(C) Live-side MIDI-track envelopes**, as in the reference file. 🚫 Not expressible in
  `Song.abl`; needs the Live→Move direction, which does not exist.

**❓ THE OPEN QUESTION (Josh, sixty seconds, on the Mac — not the Move):** open a
davebox-exported `.ablbundle` in Live 12 and confirm whether per-note `automations` survive into
something visible. If they do, (A) is the path and the work is well-defined. If they do not, the
honest answer is that **davebox cannot export CC/AT automation into a Move set at all**, and item
9 should be closed as not-possible rather than left open.

**❓ Also open, and it changes (A)'s value:** does Move itself ever WRITE `clip.envelopes`? All 23
local files say `[]`. If Move never emits them, that container may be import-only, which would
also explain why nothing we have shows one.

## 6. If (A) is confirmed, the shape of the work

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
