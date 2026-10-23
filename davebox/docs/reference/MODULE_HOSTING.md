# Module hosting — davebox as a host for Schwung modules

How dAVEBOx loads and edits Schwung modules (synths, effects, MIDI FX) inside its
own session.

**Modules are written for Schwung, not for dAVEBOx.** A module built and tested
on stock Schwung must work here unchanged; keeping it compatible is this side's
job. dAVEBOx SA is launched from stock Schwung and plays the modules installed
there (`daveboxSA/modules` is a link to stock's tree), through the Schwung chain
host that this repo's fork carries. Nothing below is a contract for module
authors: the host mechanisms that exist only here (last section) are dAVEBOx's
own plumbing, offered upstream, and no third-party module should depend on them.

Status: **shipped.** This began in 2026-07 as `lab/` (module id `davebox-lab`), a
separate tool module that exercised the pipeline in isolation; the pipeline now
lives in davebox proper (`ui/ui_engine.mjs`, `ui/ui_sound.mjs`), and `lab/` stays
as a dev rig. The phase-1 sections below are kept for the reasoning they record.

---

## Why this exists

The goal is one environment where you sequence *and* choose instruments *and*
edit effects.

*History (2026-07, superseded).* The long-term destination was then written as
"standalone — davebox as its own host, owning the device outright". That is not
what dAVEBOx SA became: it runs as its own session on a fork of the Schwung host,
launched from and dependent on a stock Schwung install. The reasoning of the
time, kept as written:

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

## History: what a standalone port would and would not get (superseded)

⚠ Superseded: dAVEBOx SA did not become its own host owning the device. It runs
on a fork of the Schwung host, launched from stock Schwung (see the top of this
file). Kept for the disciplines it records, which still hold.

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

## A module's own chain screen (`ui_chain.js`)

dAVEBOx runs a module's chain screen where stock runs it (`src/shadow/shadow_ui.js`
`enterComponentEdit` → `loadModuleUi`): opening a component that publishes **no**
`ui_hierarchy` loads `ui_chain.js` (or the file module.json's `"ui_chain"` names) and
gives it the screen. A component that publishes a hierarchy gets the shared grid, and a
module declaring `host_canvas_ui` keeps its place ahead of both. No module is named
anywhere; the code is `ui/ui_chain_host.mjs` (contract + shims) and `openChainScreenIfOwed`
in `ui/ui_sound.mjs` (where it opens).

What a script gets, and what each binding means here:

| binding | in dAVEBOx |
|---|---|
| `chain_ui.init/tick/onMidiMessageInternal/handleBack` (or changed plain globals) | as stock: `tick` draws every frame; Back asks `handleBack()` first |
| `host_module_get_param/set_param` | the opened slot + component; a set is an **edit** (below) |
| `shadow_get_param` | the real binding |
| `shadow_set_param` | the real binding, except a write to the opened slot's `<comp>:` keys, which is an **edit** |
| `shadow_get_ui_slot()` | the opened slot |
| `shadow_get_display_mode()` | 1 |
| `shadow_get_shift_held()` | dAVEBOx's Shift |
| `host_pad_block(1)` | the module gets pads 68–99 (+ pressure) first |
| `move_midi_inject_to_move` (a pad) | plays the pad through dAVEBOx's own pad path, after the call returns |
| `host_swap_module()` | closes the screen and opens the module browser |
| `host_open_file_in_tool` | `false` (SA has no tools) |

Kept by dAVEBOx while the screen is up: Volume (79), Note/Session (50), Play (85),
Record (86). Shift and Mute reach the module **and** dAVEBOx. Shift + jog closes.

⭐ **A parameter the script writes is an edit**, as an editor knob's is: it lands at once,
and after the call it goes to `automationParamEdit` (a held step makes a lock, Record a
take). Only keys in the component's `chain_params` count — a module's private keys (9W9's
`mute_ms`, `mutes`) are written and nothing else. The edit is handed over after the call
because the automation path writes dAVEBOx's DSP through the shimmed names. Not covered:
Mute/Delete + knob touch (the script, not dAVEBOx, knows which parameter is under a knob).

⚠ **`tick()` runs at most once per `CHAIN_TICK_MS` (40 ms)**, not every host frame. The
script shares dAVEBOx's JS thread, so every input dAVEBOx handles (lights, page changes,
knobs) waits behind its tick, and a grid script's tick makes a blocking engine read.
Measured on the device: 1.3 ms → 5.6 ms per frame at the full rate. A skipped frame leaves
the last one on screen. A pad's SOUND is unaffected either way: the engine plays pads on
the audio thread.

⚠ The shims are installed **around each hosted call** and restored in `finally`, never
for the screen's lifetime: dAVEBOx calls `host_module_*` for its own DSP from every tick.

Not yet: stock's bare `ui.js` fallback (a module's standalone screen would take over a
running sequencer — name it with `"ui_chain": "ui.js"` to opt in), the trailing
My Presets / Module menus (`shadow_component_trailing_menus` — this host has no
equivalent either), `onPresetsChanged` / `restorePage`, `onMidiMessageExternal`.
Test: `tests/js/test_chain_ui_screen.mjs`.

## Host mechanisms only this fork has (dAVEBOx-internal, not a module contract)

Moved here from `docs/MODULES.md` on 2026-10-22 so that guide documents only
Schwung's contract. These exist for dAVEBOx's own engine (`davebox/dsp/`) and are
offered upstream (`docs/UPSTREAM.md`). **No third-party module should be written
against them**: a module that needs one would work only in a dAVEBOx session,
which is the outcome this split exists to prevent. The text below is unchanged
from the guide; where it says "a module" or "an overtake DSP", read "dAVEBOx's
engine".

### The POWER button

`host_power_claim(1)` (a JS binding) says the module on screen answers POWER
itself. While it is set and the module owns the screen (overtake mode 2), the shim
holds the power SysEx back from Move (`src/host/shim_power_gate.h`), so Move never
raises "Press wheel to shut down", and stores the press; `shadow_ui` reads it every
tick and calls `globalThis.onPowerButton(id)` (0x2A tap, 0x3A hold). The host drops
the claim in `exitOvertakeMode` / `suspendOvertakeMode`, so a parked or exited
module never swallows the button. The power-off itself is the launcher's, after
teardown: the module leaves a marker and the launcher runs `heal --poweroff`
(`/sbin/shutdown -h now`, what Move's own power service runs).

### Where a MIDI FX's output goes

A MIDI FX's output goes to its own slot's synth. Two per-slot chain parameters
send a copy somewhere else as well; they are separate axes and do not interact. A
third sends ALL of it elsewhere instead.

| Chain key (bare, per slot) | Values | What it adds |
|---|---|---|
| `midi_fx_pre_mode` | `0` Post (default) / `1` Pre | Pre also injects the output into Move's own MIDI input on the slot's receive channel, so Move's native track plays (and can record) it. |
| `midi_fx_to_host` | `0` off (default) / `1` on | The notes the effect GENERATES are also handed to the host, for a host-side sequencer to record. Nothing is sent to Move. |
| `midi_fx_host_route` | `0` off (default) / `1` on | **Instead of** the synth: the effect's WHOLE output — the transform of every note the slot is sent as well as what it generates — goes to the host, and nothing reaches this slot's synth or (in Pre mode) Move. For a host-side sequencer whose track plays an instrument that is not this slot's: it sends the track's notes into the slot only to borrow its MIDI FX, and sends the result on itself. |

`midi_fx_to_host` hands over only what the effect produced on its own:

- output it emits in answer to the clock (Start / Clock / Continue / Stop arriving
  at its `process_midi`), and
- output from its per-block `tick`.

It never hands over the output of a NOTE the slot was sent. That is a transform of
someone's playing — and a sequencer that plays its own clip into the slot would be
handed back what it already holds, on every pass. So a chord effect contributes
nothing here; a clock-driven generator or an arpeggiator does. Only channel-voice
messages cross (never realtime).

All three keys are saved with the slot. `midi_fx_to_host` and `midi_fx_host_route` are reset when the MIDI FX is
unloaded or swapped (it is a statement about that effect); `midi_fx_pre_mode` is
not. `midi_fx:pre_capable` reads `1` when the loaded MIDI FX declares
`capabilities.pre_capable`.

The chain passes the notes to a sink the host registers
(`chain_set_midi_fx_sink`, an optional export of the chain DSP). With no sink
registered the key is inert.

#### Receiving them in a module (`move_plugin_slot_midi_v1`)

An overtake DSP — a sequencer that wants to record what a slot's MIDI FX
generates — exports one function:

```c
void move_plugin_slot_midi_v1(void *instance, int slot, const uint8_t *msg, int len);
```

The host looks the symbol up once, after `create_instance`; a module that does
not export it is never called, and on a host without the feature the export is
simply dead. It is called on the audio thread, once per message, **after** the
module's own `render_block` for that frame and never during it — whichever
thread or call stack the slot produced the message on (a render-pool lane for
tick output; inside the module's own render, when the module is the clock the
generator runs from). `slot` is 0-based, `msg` is two or three bytes of
channel-voice MIDI. The notes have already sounded on the slot's synth: record
them, do not play them. Realtime rules apply.

Between the slot and the module the host queues (a 64-entry multi-producer
ring); if it fills, the newest message is dropped. With no module taking the
notes the host discards them every frame.

### Host extensions (`move_plugin_host_ext_v1`)

`host_api_v1_t` cannot grow, so a capability added later is handed to the module by a
call: after `create_instance`, the host looks up `move_plugin_host_ext_v1` in the module
and, if the module exports it, calls it once with a `const move_host_ext_v1_t *` that
stays valid for the life of the host. Store the pointer; check `ext->size` before
reading a member (the struct grows at its end). A module that does not export the
symbol is simply not called, and on a host without extensions the pointer stays NULL —
keep a fallback.

```c
static const move_host_ext_v1_t *g_ext;
void move_plugin_host_ext_v1(const move_host_ext_v1_t *ext) { g_ext = ext; }
```

| Member | What it does |
|---|---|
| `int set_slot_param(int slot, const char *key, const char *value)` | Sets one parameter of chain slot `slot` (0-based) **now**, from `render_block` or `set_param` — on the audio thread, in program order with the module's own `midi_send_internal_slot` calls. A value written before a note is sent to the same slot is in place when that note is voiced. `key` is a chain parameter key (`synth:cutoff`, `fx2:mix`, `slot:volume`, `move_fx:1:volume`). Keys that load or replace something (`…:module`, patches, state) are refused. Transient: the slot is not marked edited. Returns 1 if dispatched, 0 if refused. **Only an overtake DSP is offered this** (the slot it would address is another module's). Audio thread rules apply to the caller: no formatting through `printf`-family calls that allocate, and keep the number of writes per block small — each one costs whatever the target module's `set_param` costs. |
| `void set_tempo(float bpm)` | For a module that runs its own clock (it sends Start / Clock / Stop through `midi_send_internal`): declares its tempo, so `get_bpm()` answers with exactly that value — while it plays, while it is stopped, and before its first Start — instead of a tempo measured from its block-quantized clock ticks. Call it when the tempo changes; pass `0` to withdraw (for example while following Move's clock, which the host measures itself). A running Move transport still takes precedence. Callable from `render_block` or `set_param`. The host withdraws it when the module is unloaded. |
| `void set_move_info(const void *info, size_t size)` | For a module that owns the session (an overtake sequencer): publishes what the session's key, scale, tempo and transport are, as a `move_info_t` (`src/host/move_info.h`; `size` = your `sizeof`). The host copies it; every module that reads `move_info.h` (`move_info_read()`, through the shim's `schwung_move_info()`) then gets it. Call it when a field changes, not every block; fill what you do not know with `move_info.h`'s explicit unknowns. Pass `NULL` to withdraw — readers then get 0, "not provided". Audio thread or `set_param`: a copy under a seqlock. The host withdraws it when the module is unloaded. **Fork-only:** upstream fills `move_info` from Move's own set instead. |
| `int midi_send_slot_direct(int slot, const uint8_t *msg, int len)` | `midi_send_internal_slot`, but delivered to the slot's INSTRUMENT and audio FX past its MIDI FX (and its transpose), with source `MOVE_MIDI_SOURCE_DIRECT`. For a sequencer that runs a slot's MIDI FX on what is played but not on what it plays back, and for sending on what the effect handed back under `midi_fx_host_route`. Voice messages; realtime goes the usual way. Audio thread. |
