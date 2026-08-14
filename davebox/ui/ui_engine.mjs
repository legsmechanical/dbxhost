/* ui_engine.mjs — THE PORT SURFACE.
 *
 * Every conversation with the Schwung chain engine goes through this file and
 * nowhere else. No other file in lab/ may call shadow_* for module work, and no
 * other file may build a `<component>:<key>` string. That discipline is the
 * whole point: when davebox becomes its own standalone host, this file is
 * rewritten against the in-process chain host and everything above it — the
 * discovery pass, the cell mapper, the renderer, any per-module overlays —
 * carries over untouched.
 *
 * Addressing is always the triple (slot, comp, key):
 *   slot — shadow chain slot 0..3 (standalone: whatever the host exposes)
 *   comp — 'synth' | 'fx1'..'fx4' | 'midi_fx1'
 *   key  — the module's own param key
 *
 * Host contract notes that cost real debugging time upstream (movy):
 *  - `<comp>:module` reads AND writes the loaded module id — symmetric since
 *    P6 (the chain host intercepts the colon read; the old `<comp>_module`
 *    underscore alias still works and is what older code reads).
 *  - Track components load by module ID. (master_fx:* components load by DSP
 *    path instead — not used here, noted so the asymmetry isn't rediscovered.)
 */

/* `os` is a QuickJS MODULE, not a global — shadow_ui.js line 1 imports it the
 * same way. Without this import the bare `os.readdir` below throws a
 * ReferenceError that the scan's own try/catch swallows, and every category
 * silently reports zero modules. The bundler must mark 'os' external so the
 * import survives to the device (see scripts/bundle_lab.sh). */
import * as os from 'os';

const MODULES_BASE = '/data/UserData/schwung/modules';

/* component -> where its modules live + the component_type they must declare */
export const COMPONENTS = {
    synth:    { label: 'SYNTH', scanDir: 'sound_generators', type: 'sound_generator' },
    fx1:      { label: 'FX 1',  scanDir: 'audio_fx',         type: 'audio_fx' },
    fx2:      { label: 'FX 2',  scanDir: 'audio_fx',         type: 'audio_fx' },
    fx3:      { label: 'FX 3',  scanDir: 'audio_fx',         type: 'audio_fx' },
    fx4:      { label: 'FX 4',  scanDir: 'audio_fx',         type: 'audio_fx' },
    midi_fx1: { label: 'MIDI',  scanDir: 'midi_fx',          type: 'midi_fx' },
};

/* Read-back key for "which module is loaded". One shape for read and write
 * since P6 made the colon readback symmetric — this helper stays only so the
 * key is built in one place. */
function moduleReadKey(comp) {
    return comp + ':module';
}

/* ---- core param access ---- */

export function engineGet(slot, comp, key) {
    return shadow_get_param(slot, comp + ':' + key);
}

export function engineSet(slot, comp, key, val) {
    return shadow_set_param(slot, comp + ':' + key, String(val));
}

/* SLOT-level params (volume, muted, send_a...) live on the slot itself, not on
 * a component — same shadow_get/set_param call, different key namespace
 * ("slot:volume"). Kept here with every other key-building call per this file's
 * port-surface rule. Slot gains are 0..4, host-clamped, 1.0 = unity.
 *
 * NOTE: the host's setter updates runtime state and the UI mirror but does NOT
 * persist — call engineSaveState() once a gesture ends, not per detent. */

/* The key every "level" control in this module writes.
 *
 * `slot:volume` is the channel's BUS fader — the slot's OUTPUT, after its FX.
 * That is a chain slot's level, in the same sense `move_fx:N:volume` is a Move
 * bus's: both are a track's one position in the mix, and the two families are
 * alternative occupants of that position.
 *
 * ⚠ This was `synth_volume` (the sound generator's own level, applied before
 * anything is summed into the slot) for one reason: Move tracks used to be
 * routed THROUGH Schwung slots (`Move > Schwung`), so the fader also scaled a
 * Move track sharing the slot and could not balance the two against each other.
 * Since Move tracks own their own buses nothing else lands in a chain slot, so
 * there is no second signal to balance and the fader is simply the level.
 *
 * The host still applies `slot:synth_volume` underneath — it defaults to unity
 * and davebox no longer writes it, so it is a no-op multiplier. Deliberately NOT
 * reset here: rewriting a level at load is how a project quietly changes
 * loudness, and the host's own Module Level row remains its editor. */
export const SLOT_LEVEL_KEY = 'volume';


/* And the law for MOVING it, shared by every level control so they cannot drift
 * apart in feel. Levels are 0..4; a detent of 1/64 puts unity ~64 detents away
 * and the whole range in ~256.
 *
 * That is deliberately fine. `decodeDelta` returns a BATCHED count — the shadow
 * UI framework accumulates encoder ticks in overtake mode and sends the total in
 * one CC — so a quick turn arrives as a few large messages, not many small ones.
 * A coarse step turns each of those into an audible jump: at 1/16 a batch of
 * four moved a quarter of unity at once, which read as fast AND jerky. The step
 * has to be small enough that a batch still lands as a slide.
 *
 * The 8 knobs and the master knob get identical treatment because the host does
 * not accelerate either — it intercepts CC 79 only, and davebox claims it
 * (`claims_master_knob`), so both arrive as the same raw batched counts. */
export const SLOT_LEVEL_STEP = 1 / 64;

/* Ceiling for every level control — chain slots AND Move buses alike, so one
 * mixer position cannot offer more range than another depending on who occupies
 * it.
 *
 * 2x, not the wire bound's 4x, because 4x is not headroom that EXISTS. The gain
 * clamps to int16 where it is applied, so on anything mixed near full scale the
 * top half of that range is guaranteed clipping presented as travel — a control
 * whose upper reaches work only on quiet material reads as more headroom than
 * the system has. 2x also puts unity at the midpoint of a ~128-detent throw
 * (SLOT_LEVEL_STEP), which is a better place to mix from than unity at a
 * quarter of the way up.
 *
 * ⚠ The host still CLAMPS at 4 — that is the WIRE bound, deliberately left
 * permissive so an already-saved state carrying 3.0 loads as 3.0 rather than
 * being silently reinterpreted. No davebox surface can produce such a value;
 * this is the UI contract, not the storage one. */
export const SLOT_LEVEL_MAX = 2;

/* The four session-view mixer params, as ONE table. Everything about a mode —
 * its param key, its range and detent, its default, how it formats, how it
 * DRAWS — lives on the same row, so a mode cannot pick up the wrong key or the
 * wrong widget by drifting out of step with a parallel array.
 *
 * `widget` is a render-cell kind (see ui_cells' toRenderCell for the vocabulary):
 * a level is a **fader** because that is what a level is; pan is a **bipolar
 * arc** because its meaning is distance from centre, not a quantity; the sends
 * are plain unipolar arcs. `snap`/`snapZone` give pan a sticky centre.
 *
 * ⚠ Lives here, not in ui_input_cc, because BOTH the input path and the render
 * path need it and ui_render must not import an input module. ui_engine imports
 * nothing but `os`, so it is safe for anything to depend on. */
/* ---- canvas knob feel, ported from canvaskit ------------------------------
 *
 * The kit's continuous cells are `min:0, max:255, step:1, sens:2` — 256
 * positions across the range, TWO detents per position. That is the feel Josh
 * asked these mixer knobs to adopt, and the resolution comes with it: the old
 * hand-picked 0.05 step gave pan and the sends twenty positions for a whole
 * sweep, which is why they felt notchy next to a canvas knob.
 *
 * Everything is expressed as a fraction of each param's own range, so one law
 * covers a 0..2 level and a 0..1 send without either feeling different. */
export const KNOB_POSITIONS = 255;   /* canvaskit KIT_PARAM_MAX */
export const KNOB_SENS      = 2;     /* canvaskit KIT_SENS — detents per step */

/* canvaskit's `accumStep`, generalised for BATCHED counts.
 *
 * ⚠ The kit is called once per physical detent, so it fires at most one step.
 * davebox is not: `decodeDelta` hands us the shadow framework's accumulated
 * count, so a quick turn arrives as one CC carrying several detents. Firing a
 * single step per message would make a fast turn move LESS than a slow one.
 * We therefore drain the accumulator, which is the same law sampled coarsely.
 *
 * ⭑ The reversal reset is the part that makes it feel right, and it is kept
 * exactly: turning back does not first have to unwind the detents you already
 * put in, so a direction change responds on the very next detent. */
export function knobAccumSteps(accum, delta, sens) {
    if ((accum > 0 && delta < 0) || (accum < 0 && delta > 0)) accum = 0;
    accum += delta;
    const steps = (accum / sens) | 0;               /* trunc toward zero */
    return { accum: accum - steps * sens, steps };
}

export const SESS_KNOB_MODES = [
    { key: 'volume', label: 'VOLUME', widget: 'vbar',   def: 1.0, max: SLOT_LEVEL_MAX,
      fmt: (v) => v.toFixed(2) + 'x' },
    { key: 'pan',    label: 'PAN',    widget: 'arcbip', def: 0.5, max: 1.0,
      fmt: (v) => { const pct = Math.round((v - 0.5) * 200); return pct === 0 ? 'C' : pct < 0 ? Math.abs(pct) + 'L' : pct + 'R'; },
      snap: 0.5, snapZone: 0.02 },
    { key: 'send_a', label: 'SEND A', widget: 'arc',    def: 0.0, max: 1.0,
      fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'send_b', label: 'SEND B', widget: 'arc',    def: 0.0, max: 1.0,
      fmt: (v) => Math.round(v * 100) + '%' },
];
/* One step = one of 255 positions across THIS mode's range. Derived, not
 * written per mode, so no mode can drift to a different feel. */
for (const m of SESS_KNOB_MODES) m.step = m.max / KNOB_POSITIONS;
/* Derived, never hand-mirrored — these used to be two literal arrays beside the
 * table above, which is one edit away from a mode writing another mode's key. */
export const SESS_KNOB_KEYS     = SESS_KNOB_MODES.map(m => m.key);
export const SESS_KNOB_DEFAULTS = SESS_KNOB_MODES.map(m => m.def);
export function engineGetSlotParam(slot, key) {
    return shadow_get_param(slot, 'slot:' + key);
}

export function engineSetSlotParam(slot, key, val) {
    return shadow_set_param(slot, 'slot:' + key, String(val));
}

/* CHAIN-level params whose key carries its own namespace (knob_N_*, lfoN:*):
 * passed through BARE — the chain host owns these keys directly, they are not
 * in the slot: namespace. The knob/LFO editors (P7 absorb) read and write the
 * exact keys the host's editors did. */
export function engineGetChainParam(slot, key) {
    return shadow_get_param(slot, key);
}

export function engineSetChainParam(slot, key, val) {
    return shadow_set_param(slot, key, String(val));
}

/* Link Audio rebuild is DERIVED from track routing, never a user setting.
 *
 * A track routed to Move plays a Move instrument, and dAVEBOx owns that
 * instrument's audio: it comes back through the corresponding Move FX bus so it
 * can be levelled, effected and sent like anything else. That return path only
 * exists under the Link Audio rebuild, so the rebuild must be on exactly when
 * at least one track is routed to Move — which is a fact we already have, not a
 * question to ask the user. This replaces the "Move->Schwung" Global Settings
 * row, which was a technical toggle for something the routing already implies.
 *
 * Idempotent and cheap (one param write only when the answer changes), so it is
 * safe to call from every path that can alter routing, which is the point: the
 * flag must never disagree with the routes.
 */
let lastLinkAudioRouting = null;
export function syncLinkAudioRoutingFromRoutes(routes) {
    let wanted = 0;
    for (let t = 0; t < routes.length; t++) {
        if (routes[t] === 1 /* ROUTE_MOVE */) { wanted = 1; break; }
    }
    if (wanted === lastLinkAudioRouting) return wanted;
    lastLinkAudioRouting = wanted;
    shadow_set_param(0, 'master_fx:link_audio_routing', String(wanted));
    return wanted;
}

/* Force the next sync to write even if the value looks unchanged — used after a
 * project load, where the host's flag belongs to the PREVIOUS project and our
 * cached copy would otherwise suppress the correcting write. */
export function invalidateLinkAudioRoutingCache() {
    lastLinkAudioRouting = null;
}

/* Flush chain state to disk. shadow_ui.js defines this global and it already
 * persists slot volumes/channels/mute/solo, so no host change was needed to
 * make slot level survive a reboot. Synchronous file write — call it at the END
 * of a gesture. */
export function engineSaveState() {
    return !!shadow_save_state_now();
}

/* ---- which host build are we on? ----
 *
 * There is only one. davebox ships inside dbxhost, in the same deliverable, built
 * and deployed together — so "which host" has no second answer to distinguish and
 * the question is gone rather than answered.
 *
 * What used to be here: a host_build_info() probe returning UPSTREAM_DEFAULTS when
 * absent, a HOST_CONTRACT_MIN handshake, and engineUnderDaveboxHost(). All of it
 * existed because davebox and the host were separate repos, so a change spanning
 * both was two commits with nothing tying them together and a new davebox could
 * land on an old host. Merging the repos is what made that unrepresentable; see
 * docs/UPSTREAM.md and the CLAUDE.md invariant: if the code is in the tree, the
 * feature exists.
 *
 * ⚠ Do NOT reintroduce a probe here for a param-key NAMESPACE. `fx3:` and
 * `send_fx:a:` are routed prefixes, not bindings, so no typeof can see them — the
 * historical bug was rows whose reads returned nothing and whose writes vanished,
 * silently. The reason that cannot happen now is not a better probe; it is that
 * the host routing those prefixes is the only host there is. */

/* Audio-FX blocks routed in a slot chain. Pinned against the host's
 * CHAIN_COMPONENTS fxN list by tests/host/test_slot_fx_blocks_matches_js.sh —
 * change both together. */
export const SLOT_FX_BLOCKS = 4;

/* Chain slots the host renders — NOT the same axis as SLOT_FX_BLOCKS above
 * (that is FX blocks WITHIN one slot). Pinned against the host's four
 * declarations by tests/host/test_slot_count_is_single_sourced.sh.
 *
 * ⚠ Everything that addresses a slot must derive from this. The old idiom was
 * `& 3`, which is not a bounds check — it ALIASES, so a track addressed to a
 * slot outside the range plays into the wrong chain with no error anywhere.
 * Use slotIndex() to sanitise a value that arrives from state, the wire, or a
 * user edit. */
export const CHAIN_SLOTS = 8;

/* Sanitise a slot index: clamp into range rather than wrap. A clamp is wrong
 * in a visible, bounded way; a wrap is wrong in an invisible way (slot 4
 * silently becoming slot 0 is indistinguishable from a correct slot 0). */
export function slotIndex(v) {
    const n = v | 0;
    if (n < 0) return 0;
    return n >= CHAIN_SLOTS ? CHAIN_SLOTS - 1 : n;
}

/* `slotLetter` (A, B, C, ...) lived here until the track gained ownership of
 * its instrument: the slot stopped being a user-facing concept, so there is
 * nothing left to letter. `slotIndex` stays — it sanitises an index the DSP
 * still carries. */

/* ---- Move FX buses: the OTHER kind of mixer position ----
 *
 * A Move-routed track plays one of Move's own instruments, and that
 * instrument's audio comes back through the matching Move FX bus. So the bus is
 * a track's mixer position exactly as a chain slot is — its level, sends, mute
 * and solo are the track's, and every screen that addresses one addresses it
 * through the key builders here.
 *
 * ⚠ The bus number is WHICH MOVE INSTRUMENT the track plays — i.e. its CHANNEL,
 * which is what the Instrument row (`Move 1`-`Move 4`) sets. It is NOT the track
 * index: track 6 can play `Move 2` and must then address BUS 2. Reading the
 * index would open a different instrument's strip, silently.
 *
 * ⚠ `move_fx:` keys are 1-BASED and ignore the slot argument of
 * engineGet/engineSet entirely — pass 0 and read the bus out of the key.
 *
 * Clamped, not wrapped, for slotIndex's reason: a Move-routed track parked on
 * channel 9 has no fifth bus, and bus 4 is wrong in a visible way. */
export const MOVE_BUSES = 4;
export function moveBusForChannel(ch) {
    const n = ch | 0;                       /* 1-based here (0-based in the DSP) */
    return n < 1 ? 1 : (n > MOVE_BUSES ? MOVE_BUSES : n);
}
/* The component half of a bus key, for engineGet/engineSet(0, comp, key). */
export function moveBusComp(bus) {
    return 'move_fx:' + bus;
}
export function moveBusPrefix(bus) {
    return moveBusComp(bus) + ':';
}

/* Send FX buses (send_fx:a: / send_fx:b:) — routed by this host. */
export const HAS_SEND_FX = true;

/* The install this host owns. Still a literal rather than something discovered:
 * it names a path the module composes for the DSP and the exit/project scripts.
 * ⚠ Pinned by standalone/scripts/check-config.sh against config.sh's DBX_DIR —
 * change one and the CI gate names the other. */
export const DAVEBOX_HOST_DIR = '/data/UserData/dbx-host';

/* Runtime claim on the master volume knob: suppresses CC 79 + touch note 8 from
 * reaching Move firmware, so the knob can mean something else without Move also
 * moving its master level and covering the screen with its overlay. Requires
 * the host's host_vol_block (fork). Gated on typeof so an unpatched host simply
 * doesn't claim it — the editor still works, Move's volume just moves too. */
export function engineVolBlock(on) {
    host_vol_block(on ? 1 : 0);
    return true;
}

/* Batched reads. shadow_get_params(slot, key, value) exists but its wire format
 * is defined shim-side and undocumented in the JS contract, so this loops for
 * now. Callers already treat it as one call, so switching to the bulk path
 * later is a change to this function alone. */
export function engineGetMany(slot, comp, keys) {
    const out = {};
    for (const k of keys) out[k] = engineGet(slot, comp, k);
    return out;
}

export function engineSetMany(slot, comp, pairs) {
    for (const k in pairs) engineSet(slot, comp, k, pairs[k]);
    return true;
}

/* ---- module lifecycle ---- */

export function engineLoadedModule(slot, comp) {
    return shadow_get_param(slot, moduleReadKey(comp)) || '';
}

export function engineLoadModule(slot, comp, moduleId) {
    return shadow_set_param(slot, comp + ':module', String(moduleId));
}

/* Scan the filesystem for modules valid in this component. Returns
 * [{id, name, path}] sorted by name. A leading NONE entry is the caller's job. */
export function engineListModules(comp) {
    const spec = COMPONENTS[comp];
    const result = [];
    if (!spec) return result;
    const dir = MODULES_BASE + '/' + spec.scanDir;
    try {
        /* os.readdir returns [names, errno] — the array is element 0. */
        const res = os.readdir(dir);
        const entries = res && res[0];
        if (!entries || !entries.length) return result;
        for (const entry of entries) {
            if (entry === '.' || entry === '..') continue;
            try {
                const raw = host_read_file(dir + '/' + entry + '/module.json');
                if (!raw) continue;
                const json = JSON.parse(raw);
                const ct = json.component_type ||
                           (json.capabilities && json.capabilities.component_type);
                if (ct !== spec.type) continue;
                result.push({
                    id:   json.id || entry,
                    name: json.name || entry,
                    path: dir + '/' + entry + '/' + (json.dsp || 'dsp.so'),
                });
            } catch (e) { /* skip unreadable/!json module dirs */ }
        }
    } catch (e) { /* missing category dir = no modules of this type */ }
    result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return result;
}

/* ---- canvaskit bank structure ----
 *
 * Modules built on schwung-canvaskit ship a generated canvas.js whose config is
 * a HAND-AUTHORED bank layout: bank order, which params group together, 4-char
 * labels chosen to fit, and which banks are envelopes. That is strictly better
 * information than our own walk can derive, because it is intent rather than
 * inference — so where a module publishes it, we use it.
 *
 * The config lives inside the generated file's IIFE and is not exported, but
 * the kit attaches its internals to the overlay it does export:
 *   globalThis.bank_editor._test = { BANKS, JUMP_SECTIONS, CONFIG, ... }
 * `_test` is the kit's own test surface, NOT a published contract — a kit
 * version bump could rename it. Every read below is therefore defensive and
 * returns null on anything unexpected, so a rename degrades to our derived
 * layout instead of breaking the editor.
 *
 * ⚠ THE HAZARD: shadow_load_ui_module evaluates the script into the SHARED
 * QuickJS globalThis — the one davebox's own init/tick/onMidiMessage* live on.
 * A module UI script may assign those. shadow_ui saves and restores them around
 * every load for exactly this reason; not doing so would stop davebox ticking.
 * Restore has to honour whether the property EXISTED, not just its value. */
function moduleDirFor(comp, moduleId) {
    const spec = COMPONENTS[comp];
    if (!spec || !moduleId) return '';
    const base = MODULES_BASE + '/' + spec.scanDir;
    /* Directory name usually IS the id, but module.json is the authority — a
     * mismatch would otherwise silently find no canvas. */
    const direct = base + '/' + moduleId;
    try {
        const raw = host_read_file(direct + '/module.json');
        if (raw && JSON.parse(raw).id === moduleId) return direct;
    } catch (e) { /* fall through to the scan */ }
    try {
        const res = os.readdir(base);
        const entries = (res && res[0]) || [];
        for (const entry of entries) {
            if (entry === '.' || entry === '..') continue;
            try {
                const raw = host_read_file(base + '/' + entry + '/module.json');
                if (raw && JSON.parse(raw).id === moduleId) return base + '/' + entry;
            } catch (e) { /* skip */ }
        }
    } catch (e) { /* no category dir */ }
    return '';
}

export function engineLoadKitStructure(comp, moduleId) {
    const dir = moduleDirFor(comp, moduleId);
    if (!dir) return null;
    const path = dir + '/canvas.js';
    if (!host_file_exists(path)) return null;

    const G = globalThis;
    const had = {
        init: Object.prototype.hasOwnProperty.call(G, 'init'),
        tick: Object.prototype.hasOwnProperty.call(G, 'tick'),
        mi:   Object.prototype.hasOwnProperty.call(G, 'onMidiMessageInternal'),
        me:   Object.prototype.hasOwnProperty.call(G, 'onMidiMessageExternal'),
        be:   Object.prototype.hasOwnProperty.call(G, 'bank_editor'),
        co:   Object.prototype.hasOwnProperty.call(G, 'canvas_overlay'),
        cos:  Object.prototype.hasOwnProperty.call(G, 'canvas_overlays'),
    };
    const saved = {
        init: G.init, tick: G.tick,
        mi: G.onMidiMessageInternal, me: G.onMidiMessageExternal,
        be: G.bank_editor, co: G.canvas_overlay, cos: G.canvas_overlays,
    };

    let out = null;
    try {
        if (shadow_load_ui_module(path)) {
            const t = G.bank_editor && G.bank_editor._test;
            if (t && Array.isArray(t.BANKS) && t.BANKS.length) {
                out = {
                    banks: t.BANKS,
                    sections: Array.isArray(t.JUMP_SECTIONS) ? t.JUMP_SECTIONS : null,
                    /* ⭑ The LIVE overlay, kept for modules that opt into hosting.
                     *
                     * Adoption can only ever carry DATA. Everything a module
                     * expresses as CODE — its header function, cellViz, the
                     * browse picker, icons — dies at this boundary, which is why
                     * a hosted DR32 page could never say which pad it was
                     * editing. Keeping the object lets us run its real
                     * bank_editor(ctx) instead of re-implementing it.
                     *
                     * Safe to retain after the globals are restored below: the
                     * overlay closes over its own IIFE scope, so it does not
                     * depend on globalThis.bank_editor still pointing at it.
                     *
                     * Only used when the module DECLARES hosting (see
                     * engineHostsOwnUi) — davebox tracks a ctx contract it does
                     * not own, so a module reaching past it must fail on the
                     * author's terms, not silently inside our shell. */
                    overlay: G.bank_editor,
                };
            }
        }
    } catch (e) {
        out = null;
    }

    /* Restore unconditionally — including on the throw path above. */
    if (had.init) G.init = saved.init; else delete G.init;
    if (had.tick) G.tick = saved.tick; else delete G.tick;
    if (had.mi) G.onMidiMessageInternal = saved.mi; else delete G.onMidiMessageInternal;
    if (had.me) G.onMidiMessageExternal = saved.me; else delete G.onMidiMessageExternal;
    if (had.be) G.bank_editor = saved.be; else delete G.bank_editor;
    if (had.co) G.canvas_overlay = saved.co; else delete G.canvas_overlay;
    if (had.cos) G.canvas_overlays = saved.cos; else delete G.canvas_overlays;

    return out;
}

/* Does this module ask davebox to run its OWN canvas UI?
 *
 * OPT-IN, and deliberately so. davebox supplies a ctx it does not own the
 * contract for (~8 functions), so under automatic hosting a module reaching
 * beyond that surface would break *inside davebox*, silently, and the bug
 * report would land on the module author for someone else's shell. A
 * declaration means somebody verified it works hosted.
 *
 * Declared, not sniffed — the same rule as the host's own input claims. The
 * synthesised/adopted path stays the fallback, so a module that does not
 * declare simply looks the way it looks today rather than blanking.
 */
/* A module's declared capabilities, cached per module id. Read straight from
 * module.json rather than through the engine, because these are STATIC facts
 * about the module, not live parameters. */
const capsCache = {};
export function engineModuleCaps(comp, moduleId) {
    if (!moduleId) return null;
    if (moduleId in capsCache) return capsCache[moduleId];
    let caps = null;
    const dir = moduleDirFor(comp, moduleId);
    if (dir) {
        try {
            const raw = host_read_file(dir + '/module.json');
            if (raw) caps = JSON.parse(raw).capabilities || null;
        } catch (e) { caps = null; }
    }
    capsCache[moduleId] = caps;
    return caps;
}

export function engineHostsOwnUi(comp, moduleId) {
    const caps = engineModuleCaps(comp, moduleId);
    return !!(caps && caps.host_canvas_ui === true);
}

/* Does this module want Undo (56) / Copy (60) / Delete (119)?
 *
 * ⚠ The HOST raises this claim for its own screens (shadow_ui's
 * reconcileEditCcClaim), but its entry-condition table lists VIEWS —
 * CANVAS / HIERARCHY_EDITOR / COMPONENT_EDIT / COMPONENT_PARAMS — and when
 * davebox HOSTS a module canvas the view is davebox's own overtake view. The
 * host cannot know a tool is showing a module's UI, so it never raises the
 * claim and those three buttons stay with Move firmware. davebox has to claim
 * them itself while it is the one on screen. */
export function engineClaimsEditCcs(comp, moduleId) {
    const caps = engineModuleCaps(comp, moduleId);
    return !!(caps && caps.claims_edit_ccs === true);
}

/* ---- self-description (feeds ui_discover) ---- */

/* `diag` records WHY a module ended up on the path it did. A silent fall back to
 * chain_params is indistinguishable from a module that genuinely publishes no
 * hierarchy, and that ambiguity already cost one wrong diagnosis (Mini-JV, which
 * does publish one). Never let a parse failure disappear into a bare catch. */
export function engineDescribe(slot, comp) {
    let chainParams = null, hierarchy = null;
    const diag = { cpLen: 0, hLen: 0, cpError: null, hError: null };

    const cpRaw = engineGet(slot, comp, 'chain_params');
    diag.cpLen = cpRaw ? cpRaw.length : 0;
    if (cpRaw) {
        try { chainParams = JSON.parse(cpRaw); }
        catch (e) { chainParams = null; diag.cpError = String(e); }
    }

    const hRaw = engineGet(slot, comp, 'ui_hierarchy');
    diag.hLen = hRaw ? hRaw.length : 0;
    if (hRaw) {
        try { hierarchy = JSON.parse(hRaw); }
        catch (e) {
            hierarchy = null;
            diag.hError = String(e);
            /* Truncation shows up as a parse error at the very end of the blob —
             * record the tail so a transport limit is distinguishable from
             * genuinely malformed JSON. */
            diag.hTail = hRaw.slice(-40);
        }
    }
    return { chainParams, hierarchy, diag };
}

/* ---- opaque state blob (module presets ride on this) ---- */

export function engineGetState(slot, comp) { return engineGet(slot, comp, 'state'); }
export function engineSetState(slot, comp, blob) { return engineSet(slot, comp, 'state', blob); }

/* ---- USER presets (the wrapped-JSON store) ----
 *
 * The host's own "Module Presets" browser (shadow_ui_presets.mjs) stores one
 * component's state per file under presets/<module-id>/, so filtering to the
 * loaded module is free — we only ever list that one folder. Format:
 *
 *   { "name": "Fat Brass", "module": "obxd", "version": 1, "state": <blob> }
 *
 * `state` is the PARSED object when the module's state is JSON, and the raw
 * opaque string otherwise. Recall is the ordinary slot-load path
 * (`<comp>:state`), which is why no per-module code is needed.
 *
 * Do NOT confuse these with a module's BAKED-IN presets: those aren't files at
 * all, they're the list_param/count_param/name_param level (see ui_discover's
 * findPresetSpec) — an index the module owns, not a store we can write. */
export const PRESET_ROOT = '/data/UserData/schwung/presets';

export function engineListUserPresets(moduleId) {
    const out = [];
    if (!moduleId) return out;
    const dir = PRESET_ROOT + '/' + moduleId;
    try {
        const res = os.readdir(dir);
        const entries = res && res[0];
        if (!entries || !entries.length) return out;
        for (const entry of entries) {
            if (entry === '.' || entry === '..') continue;
            if (entry.length < 6 || entry.slice(-5) !== '.json') continue;
            /* Prefer the in-file name (it survives filename sanitising), fall
             * back to the basename — same precedence the host browser uses. */
            let name = entry.slice(0, -5);
            try {
                const raw = host_read_file(dir + '/' + entry);
                if (raw) {
                    const j = JSON.parse(raw);
                    if (j && typeof j.name === 'string' && j.name) name = j.name;
                }
            } catch (e) { /* unreadable/!json: keep the basename */ }
            out.push({ name, path: dir + '/' + entry });
        }
    } catch (e) { /* no folder = this module has no user presets */ }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
}

/* Read a preset file and hand back the blob to feed engineSetState. Returns
 * null when the file is missing/corrupt so the caller can say so rather than
 * pushing `undefined` into the slot and silently zeroing the sound. */
export function engineReadUserPreset(path) {
    try {
        const raw = host_read_file(path);
        if (!raw) return null;
        const j = JSON.parse(raw);
        if (!j || j.state === undefined || j.state === null) return null;
        return (typeof j.state === 'string') ? j.state : JSON.stringify(j.state);
    } catch (e) { return null; }
}

/* ---- slots ---- */

export function engineSlots() {
    const raw = shadow_get_slots();
    if (!raw) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        out.push({ idx: i, channel: raw[i].channel, name: raw[i].name || '' });
    }
    return out;
}

export function engineFocusedSlot() {
    return shadow_get_ui_slot() | 0;
}
