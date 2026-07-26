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
