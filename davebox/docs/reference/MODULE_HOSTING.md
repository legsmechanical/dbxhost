# Module hosting — davebox as a host for Schwung modules

How davebox loads and edits other Schwung modules (synths, effects) inside its
own environment, and how that work is staged so it survives the eventual move to
a standalone host.

Status: **phase 1, dev rig only.** `lab/` (module id `davebox-lab`) is a
separate tool module that exercises the pipeline in isolation. Nothing in
davebox proper depends on it yet.

---

## Why this exists

The goal is one environment where you sequence *and* choose instruments *and*
edit effects. The long-term destination is standalone — davebox as its own host,
owning the device outright.

Standalone can't be the first step. Schwung's audio engine is compiled into
`schwung-shim.so`, which is LD_PRELOADed into `MoveOriginal`
(`schwung/scripts/build.sh`). It is the shim that dlopens the chain host, and
the chain host that dlopens every synth and effect. `launch-standalone.sh`
SIGKILLs `MoveOriginal`, so going standalone first would kill the slots, the
chain, Master FX and the mixer — every single thing this feature integrates.

So: build the integration while the engine is alive, and structure it so the
port is cheap.

## The layering

| Layer | File | Standalone port |
|-------|------|-----------------|
| Engine access | `lab/ui_engine.mjs` | **rewritten** against the in-process chain host |
| Discovery + param model | `lab/ui_discover.mjs` | carries over |
| Render mapping | `lab/ui_cells.mjs` | carries over |
| Renderer | `ui/ui_movy.mjs` | carries over |

**The one rule:** every conversation with the chain engine goes through
`ui_engine.mjs`. No other file calls `shadow_*` for module work, and no other
file builds a `<component>:<key>` string. Break that and the port becomes a
rewrite instead of swapping one file.

Addressing is always the triple `(slot, comp, key)` — never a pre-joined
string — so slot identity isn't baked into the layers above.

## The pipeline

```
engineDescribe()          module tells us what it has
      |                   (chain_params + ui_hierarchy)
      v
discover()                -> banks of param DESCRIPTORS
      |                   {key,label,short,kind,min,max,step,sens,options}
      v
toRenderCell()            + live values -> RENDER cells
      |                   {kind,label,name,text,norm,signed,options,sel}
      v
drawKitBankPage()         pixels
```

Two descriptor shapes on purpose. The first is canvaskit's *input* vocabulary
(`uni`/`bip`/`tog`/`enumc`/`count`/`oct`/`len`/`dir`/`file`); the second is
`ui_movy.mjs`'s *render* vocabulary (`arc`/`arcbip`/`hbar`/`enumsq`/`valsq`/
`frac`/`dirsq`). Keeping them separate is what lets a hand-written overlay name
kinds directly, and what keeps the renderer ignorant of where cells came from.

### Kind mapping

| chain_params | → kind | widget |
|---|---|---|
| `float`/`int`, min ≥ 0 | `uni` | arc knob |
| range straddling zero | `bip` | arc knob + centre tick |
| `int`, span ≤ 16 | `count` / `oct` | big numeric read-out |
| `enum`, 2 options | `tog` | bar |
| `enum`, fraction-shaped options | `len` | stacked fraction |
| `enum`, direction-shaped options | `dir` | arrows |
| `enum`, otherwise | `enumc` | framed square + picker |
| `filepath` | `file` | browser hand-off (not yet wired) |

Knob sensitivity falls out of the kind, using canvaskit's three classes —
continuous 2 detents/step, pick 6, deliberate 12. That's why a synth nobody has
ever configured still feels calibrated: sweeps move fast, dropdowns cost travel,
toggles resist an accidental brush. Discrete kinds **clamp** at their ends, never
wrap.

### Layout discovery

1. `ui_hierarchy.levels.root.knobs` → the "Main" bank (already an 8-knob page).
2. Each level reachable from `root.params` that has its own `knobs` → its own
   bank, named by the level.
3. No usable hierarchy → chunk `chain_params` publish order into pages of 8.
   `ui_*` keys are the module's internal UI state and are excluded.
4. Any `filepath` param the layout missed is appended as a "Files" bank — it's
   usually the most important control the module has.

`discover()` reports which path it took as `source`, so a badly-laid-out module
can be diagnosed without guessing.

## Host contract gotchas

These cost real debugging time upstream in movy; they are encoded in
`ui_engine.mjs` so they don't have to be rediscovered.

- **Load with `<comp>:module`, read back from `<comp>_module`.** The underscore
  alias is the readback key for track components. Reading the colon key returns
  empty and the slot looks unloaded. (`master_fx:*` components are the
  exception — already colon-namespaced, and they load by DSP *path*, not id.)
- **Enums may read back by NAME but must be written by INDEX.** `parseValue`
  resolves names against the option list; `commitString` always emits the index.
- **The chain host instantiates asynchronously.** Discovery immediately after a
  load returns null metadata — `ui.js` waits a few ticks (`pendingDiscover`).
- **Dispatch MIDI by status byte first.** Pad notes are 68–99 and knob CCs are
  71–78: overlapping numbers, different message types. Getting this wrong
  silently swallows every knob turn.
- **`shadow_get_param` is a synchronous SHM round-trip.** Poll only the visible
  bank, and never let the renderer depend on a value it wasn't already handed.
  Standalone makes these in-process calls, but the discipline is what keeps the
  UI off the audio path later.

## Standalone: what a port would and would not get

Settled 2026-07-27. The plan is to finish this as a tool/overtake module, while
keeping a later standalone port cheap. Recording the honest limits so this
doesn't get re-argued.

**Carries over unchanged** — the whole param/UI layer: discovery, the level
walk, the cell mapper, `ui_movy`, section picker, envelope and filter graphics,
knob-sensitivity classes, `ui_sound.mjs`, and any per-module overrides. Most of
the *visible* work.

**Rewritten, by design** — `ui_engine.mjs`. Ten functions. That is the entire
port surface, and keeping it that way is the point.

**Cannot be pre-built, however we proceed.** Standalone means davebox *is* the
host: `chain_host.c` linked in, QuickJS embedded, its own SPI loop, audio mixer
and display stack. Nothing in phase 1 or 2 builds any of that, and no amount of
"keeping it in mind" substitutes. It is the bulk of the standalone effort.

The real-time model is the same story. Today the UI runs in `shadow_ui` (its own
process) while DSP runs in the shim on Move's FIFO thread. Standalone collapses
both into one process that also owns the SPI ioctl loop — a genuinely different
concurrency problem that phase 1/2 never exercises.

**Knowingly disposable.** Co-run, `move_midi_inject_to_move`, Move routing,
`schSlotForTrack`, sequencing Move's own tracks. All of it makes the overtake
version good and none of it survives standalone, which also loses every
Move-native instrument permanently. Build it anyway — a deliberately weakened
phase 1 to protect a hypothetical phase 2 is the wrong trade — but know the bill.

### The four disciplines that keep the port cheap

Near-zero cost now; expensive to retrofit:

1. **The `ui_engine.mjs` rule is absolute.** Nothing else calls `shadow_*` for
   module work; nothing else builds a `<component>:<key>` string. One leaked
   convenience call and the port surface stops being one file.
2. **Address by `(slot, comp, key)`** — never a pre-joined string, never a
   hardcoded slot index.
3. **Never block on the engine from a MIDI handler.** Defer to `tick()`, budget
   the polling. This one is free: phase-2 correctness needs it anyway, because
   davebox is a sequencer. Sequencer timing and standalone-readiness point the
   same way here.
4. **Keep Move-specific code out of the hosting files** (`ui_engine`,
   `ui_discover`, `ui_cells`, `ui_sound`). It belongs in davebox's existing
   modules.

## canvaskit feature audit

Found by scouring `schwung-canvaskit/core/engine.js` rather than one device
session at a time. The point of the table is the **split**: porting a renderer
is mechanical, but almost every kit feature is driven by a hand-authored
`CONFIG` that a discovered module does not have. The inference is the real work.

### Class A — pure drawing, ports mechanically

| Feature | kit function | ui_movy |
|---|---|---|
| arc knob (uni + bipolar) | `drawArcKnob` | have |
| horizontal bar | `drawHBar` | have |
| **vertical bar** | `drawVBar` | **missing** |
| enum square | `drawEnumSquare` | have |
| **X box** (mod target = None) | `drawXBox` | **missing** |
| stacked fraction | `drawFracStack` | have |
| action square | `drawActionSquare` | have |
| direction arrows | `drawDirSquare` | have |
| big numeric read-out | `drawBigNum` | have |
| **waveform box** | `drawWaveBox` | **missing** |
| ADSR envelope | `drawEnvelopeRow` | ported |
| **filter response curve** | `drawFilterCurve` | **missing** |
| **LFO waveform** | `drawLfoWave` | **missing** |
| **bank icons** | `drawBankIcon` / `ICON_W` | **missing** |
| section picker | `drawBankPicker` | ported |
| enum list overlay | `drawEnumOverlay` | have |
| header / page bar | `drawChrome` | have |
| **HUD card** | `hudCard` | **missing** |
| value zoom | *(davebox's own)* | shared via `drawKitValueOverlay` |
| step editor | `drawStepEditor` | n/a — sequencer-specific |

### Class B — needs config the kit hand-authors, so we must INFER it

| Kit config | How a discovered module supplies it |
|---|---|
| `banks[]` layout | level-graph walk (`buildLevelPages`) |
| `sections[]` | grouped from the walk's `<parent>/<level>` prefixes |
| cell `kind` | `chain_params` type + option-shape sniffing |
| knob `sens` | falls out of the kind (3 classes) |
| `env: true` / `{startCol,…}` | `detectEnvelope` — A/D/S/R name run in one row |
| `filterViz: {cutoffKey, resoKey, mode}` | **infer from names**; unknown mode → `lp` |
| LFO viz keys | **infer from names** |
| `icons[]` | **out of scope** (Josh, 07-26) — no inferable source; skipped rather than guessed |
| `defaults` | n/a — the engine already holds live values |

**Read this before adding a widget:** if it lands in class B, the renderer is
the easy half. Budget for the inference and for the per-module overlay that
will eventually override a bad guess.

### Touch highlighting

The kit drives the touched state from **capacitive knob touch** — notes 0-7,
note-on ≥ 64 sets the knob, note-off clears it (`core/engine.js:1007`). davebox
instead derives it from *turning*, which is why an early version of the rig
showed no highlight on a bare touch and let it linger on a timer. The rig now
follows the kit: touch sets it, release clears it, and the turn-driven fallback
still decays so a knob turned without touch contact still highlights.

## Decided against: hosting a module's OWN canvas UI

Settled 2026-07-28 (Josh). **Not building it.** Recorded here because the mechanism is fully
mapped and tractable, so the temptation to "just try it" will recur.

The idea: some modules ship an on-device canvas UI, which davebox's menu currently shows as an
`opaque` row (named, valued, not openable). Hosting means running the module's own canvas code
inside davebox. The mechanism holds up — `shadow_load_ui_module` is a C global
(`shadow_ui.c:2444`); the module's script sets `globalThis.canvas_overlay` with
`onOpen/onMidi/tick/draw/onClose/onExit`, called `fn(ctx, payload)`; `ctx` is plain (draw
primitives + `getParam`/`setParam`) and davebox can supply all of it.

Why it's not worth it:

- **The valuable half already shipped.** Their canvas is ONE `canvas`-type param — a Bank
  Editor — not a whole param UI. Adopting the authored bank *structure* (round 6, `b248d0a`)
  gets davebox drawing those pages natively for 7 of 9 canvas modules. Hosting would add the
  two hand-rolled ones (echidna, pushnpull) and whatever a canvas expresses that our pages
  can't.
- **It re-invites the failure class we spent 2026-07-28 removing.** Their `tick`/`draw` would
  run inside davebox's tick with a synchronous SHM `getParam` **per frame**. The two stalls
  fixed that day — a whole-chain save firing between encoder bursts, and 8 chain enumerations
  per poll — were exactly this shape. Beyond routing their `getParam` through our cache and
  `queueWrite`, we do not control what foreign draw code does per frame, and davebox is a
  sequencer whose timing budget is the product.
- The globals-clobber hazard is *not* the blocker — `engineLoadKitStructure` already
  save/restores `globalThis.init`/`tick` around this exact call.

**If it is ever revisited:** time-box a spike behind a gate, load one module's canvas, and
measure real tick cost with its draw code running. Decide on numbers, not on prediction.

## Known gaps (phase 1)

- **SHIFT section picker** — canvaskit's icon overlay (`core/engine.js`,
  `drawBankPicker`) isn't translated into `ui_movy.mjs` yet. Biggest missing
  piece of the visual language.
- **ADSR envelope graphic** — `env: true` banks. Auto-detectable from A/D/S/R
  knob groups.
- **Per-module overlay files** — auto-discovery gives "usable"; hand-written
  overlays give "good". Movy ships 12 (`schwung-movy/src/modules/*.json`). The
  loader seam should land before the layout stabilises; retrofitting it is
  painful, adding files to it is free.
- **`filepath` params** render their basename but don't open a browser yet.
- **Instruments only** — `synth`. `COMPONENTS` in `ui_engine.mjs` already
  describes the FX and MIDI-FX components; wiring them is pointing the same code
  at a different component key.

## Build / test / deploy

```sh
node lab/test/discover.test.mjs      # pure layers, off-device, no Move needed
bash scripts/bundle_lab.sh           # -> dist/davebox-lab/
./scripts/install_lab.sh             # deploy alongside davebox (restarts the stack)
```

Installs to `modules/tools/davebox-lab/`, so the stable davebox install is
untouched and both appear in the Tools menu. The rig is JS-only — no `dsp.so`,
no Docker build.

## Provenance

The discovery rules follow **schwung-movy** (`src/model/hierarchy.ts`, MIT,
(c) 2026 megadake) — re-derived rather than ported, since movy's version is
TypeScript against its own state object and carries drum/automation/LFO concerns
this rig has no use for. The renderer is davebox's existing `ui/ui_movy.mjs`, a
source translation of **schwung-canvaskit**. Per that kit's standing rule it is a
source to draw upon, not a dependency: `lab/` adds no build step and regenerates
nothing.
