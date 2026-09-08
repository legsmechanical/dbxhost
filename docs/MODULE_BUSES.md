# Module buses — and what a module owes BOTH hosts

A **module bus** is a subset of one module's voices, rendered into its own buffer, with its own
insert chain and its own two send levels. A drum rack putting its hats through a reverb and its
kick dry is the case it exists for.

Upstream calls this **#453**; it landed in Schwung **1.3.0**. This fork ported **piece 1** (the
module-facing half) on 2026-09-08.

> ⚠ **"Bus" is overloaded in this codebase.** In davebox, `S.bus` is a MIXER POSITION — a Move FX
> strip, the master strip, or the chain slot occupying that place — and `VIEW_BUSES` is the master
> strip's screen. A MODULE bus is a different thing living inside one slot. The source keeps them
> apart (`ui_modbus.mjs`, `modBus*`); the SCREENS never collide, because davebox does not use the
> word for mixer strips anywhere the user can see. On the OLED a module bus is called **"Buses"**
> (`MODBUS_LABEL`).

---

## The alignment: one contract, two hosts

**DR32 must run on stock Schwung AND under dAVEBOx** (Josh, 2026-09-08). It does, and the reason
is structural rather than tested-into-existence: **both halves of the contract are opt-in from the
HOST's side.**

| the module publishes | the host uses it only if |
|---|---|
| `get_param("split_voices")` → `[{"id","label"},…]` | it knows to ask for that key |
| exported symbol `move_plugin_render_split` | it knows to `dlsym` that name |

A host that knows neither — stock Schwung **< 1.3.0** — asks for neither and calls neither, so the
module takes its ordinary `render_block` path, unchanged, byte for byte. Nothing about a module's
existing behaviour moves when it gains bus support.

```
                        stock < 1.3.0     stock >= 1.3.0      dbxhost (this fork)
  split_voices asked?         no                yes                  yes
  render_split dlsym'd?       no                yes                  yes
  buses offered in UI?        no          shadow_ui_buses.mjs    davebox's own screens
  module's audio path     render_block      either, per frame     either, per frame
```

⚠ **The host switches between `render_block` and `render_split` AT RUNTIME, PER FRAME**, by whether
any voice is currently assigned to a bus. Assigning one voice flips the module's entry point
mid-stream with no reload. **The two paths must therefore be state-compatible** — same voice
allocator, same envelopes, LFOs and phase — and neither may advance state the other does not.
DR32 satisfies this by construction: `dr32_kit_render_split` mirrors `dr32_kit_render`'s loop over
the same voices with the same block counter.

### What a module must get right

- **`render_split` ACCUMULATES and clears nothing.** The host clears the distinct destinations
  before the call, and **entries alias deliberately**: two voices the user put on one bus are
  handed the SAME pointer, and their sum is supposed to happen inside the module's own render. A
  `memset` of a destination erases another voice's audio.
- **Never write more than `frames` into any `voice_out[]` entry or into `main_out`.** Those
  pointers alias shared bus buffers and the caller's own output.
- **The index is the render-buffer index.** `split_voices` entry *i* is `voice_out[i]`, so a
  module must list every voice it has, INCLUDING empty ones. Dropping empties shifts every voice
  behind them onto the wrong buffer.
- **Ids should be stable across content changes; labels may follow the content.** DR32 uses
  `pad1..pad32` (its own param prefix) as ids and the loaded sample name as the label, so a saved
  bus assignment survives a kit change.
- **`main_out` carries what belongs to no voice** — a send return, a master stage. It is the same
  buffer an unassigned voice is handed.
- **A separate exported symbol, never a field appended to `plugin_api_v2_t`.** Extending that
  struct once boot-looped a device: a host built against the shorter version reads past what the
  module allocated.

### A whole-instrument stage is the awkward case

If a module has a stage that runs over its own **summed** mix — a glue compressor, a master
saturator — then a voice routed out to a host bus leaves *before* it, and the stage applies to some
voices and not others depending on routing.

DR32 hit exactly this and **the stage was removed** (its always-on Drum Bus, 2026-09-08). That was
the right answer for DR32 — a slot chain can hold a compressor, and one baked into the module was
reachable only from inside it. A module that keeps such a stage has to decide what it means, and
say so; there is no answer the host can pick for it.

---

## Where the fork diverges from upstream, and why

All three are deliberate, all three are pinned by tests, and **none of them is visible to a
module** — which is what keeps the contract single.

| | upstream | this fork | why |
|---|---|---|---|
| a bus's insert cap | `MAX_AUDIO_FX` (8) | **`BUS_FX_SLOTS` (8)**, separate from `MAX_AUDIO_FX` (4) | Josh: a module may ship an 8-effect bus. Raising `MAX_AUDIO_FX` would widen every SLOT chain too — 60 hand-written `fx4` sites across 8 files. New chains get their own cap; nothing else moves. |
| `chain_drain_sends` | `int16_t *const *accum`, `slot_volume_0_127` | **`int32_t *const *accum`, `float slot_gain`** | this shim's `accumulate_sends` sums into int32 for headroom and clamps ONCE; draining into int16 would clip twice, invisibly. Its fader is already a float. |
| bus send key | two producers (`busSendGridRealKey` + `busSendKey`), a test that they agree | **ONE producer**; the test pins the ABSENCE of a second | a spelling that disagrees edits the wrong bus silently. One producer cannot disagree with itself. |

⚠ **Send *addressing* stays ours** (`send_fx:a:` / `send_fx:b:` vs upstream's `send1:`/`send2:`).
It is invisible to a module — `default_buses` declares only `name`, `voices` and `fx`, never a send
level — so no aliasing is needed. Do not rename davebox's prefixes.

---

## What is NOT ported

- **#453 piece 2** — send-FX chain editing (insert/remove/move). This fork already has send FX
  load/unload; editing is host chrome.
- **#453 piece 3** — the async FX load/retire ring, including `fx_load_gate.h`. `chain_bus.c` does
  not include it.

---

## Reading order for the code

| | |
|---|---|
| the rules, host-agnostic, node-runnable | `src/shared/bus_model.mjs` |
| the render arithmetic + the solo partition | `src/host/bus_mix.h` |
| `bus<N>:` key routing, voice-id resolution | `src/host/bus_route.h` |
| stored ids → the voice map, orphan counting | `src/host/bus_voice_apply.h` |
| why per-voice send levels belong to the MODULE | `src/host/voice_send_source.h` |
| the `bus<N>:` param surface, the worker, the drain | `src/modules/chain/dsp/chain_bus.c` |
| the wiring — dlsym, routing, render, lifecycle | `src/modules/chain/dsp/chain_host.c` |
| persistence | `chain_patch.c` (`bus_parse_section`), `shadow_ui.js` (`buildSlotPatchJson`) |
| davebox's data layer and its tri-state door | `davebox/ui/ui_modbus.mjs` |
| davebox's screens | `davebox/ui/ui_sound.mjs`, the `VIEW_MODBUS*` views |

⚠⚠ **`split_voices` has THREE answers and they are not two:** JSON, `""` (the module cannot split —
offer nothing, ever), and `null`/no-answer (the read did not complete — offer nothing YET, and ask
again). Collapsing the last two latches the feature off after one slow read, with nothing on screen
to contradict it. `davebox/ui/ui_modbus.mjs` keeps them apart as `'open' | 'absent' | 'unknown'`
and never as a boolean; `davebox/tests/js/test_modbus_tristate.mjs` pins it.
