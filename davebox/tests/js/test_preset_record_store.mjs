/* tests/js/test_preset_record_store.mjs — the user-preset record SURVIVES a
 * relaunch, and CANNOT survive onto the wrong project or module.
 *
 * The record ({name, path, hash, mod} per slot:comp) used to be session-lived;
 * since 2026-08-31 it rides the UI sidecar (`upr`). Four things are pinned
 * here, each of which fails SILENTLY if broken:
 *
 *   1. setPresetRecord persists — the sidecar written on a record change
 *      carries the record. (A missed writeSidecar call just means "(none)"
 *      after the next relaunch, which is exactly the bug this store closes.)
 *   2. restoreUiSidecar replaces the map WHOLESALE — a record from the
 *      previous project must not ride into the next one on a matching key.
 *      Both branches: with a sidecar, and without one (fresh project).
 *   3. Restore validates SHAPE — an entry without name or path is not a
 *      record and must be dropped, not half-loaded.
 *   4. The accessor's staleness guard FIRES — a record whose `mod` no longer
 *      matches the slot's module is dropped at read time. Positive control
 *      first: with the matching module it returns the record; with module
 *      identity unseeded ('' — the async-discovery window) it must NOT drop.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function assert(cond, label) { if (cond) ok(label); else bad(label, 'assertion failed'); }

/* ---- host stubs -------------------------------------------------------- */
const written = Object.create(null);          /* path -> last payload */
let fsFiles = Object.create(null);            /* path -> contents for reads */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (p in fsFiles ? fsFiles[p] : '');
globalThis.host_file_exists = (p) => (p in fsFiles);
globalThis.host_write_file = (p, c) => { written[p] = c; return true; };
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');

const UUID = 'test-preset-rec-uuid';
const uiPath = persist.uuidToUiStatePath(UUID);

/* Make writeSidecar willing: a project is loaded and no switch is mid-air. */
S.currentSetUuid = UUID;
S.awaitingProjectSelect = false;
S.pendingSetLoad = false;
S.pendingDspSync = 0;

/* ---- 1. setPresetRecord persists through the sidecar ------------------- */
try {
    delete written[uiPath];
    const hook = snd.soundPresetRecForTest(1, 'synth', 'obxd');
    hook.set({ name: 'Fat Brass', path: '/p/obxd/fat.json',
               mod: 'obxd', hash: 'abc:3' });
    const us = JSON.parse(written[uiPath] || 'null');
    assert(us && us.upr && us.upr['1:synth'] &&
           us.upr['1:synth'].name === 'Fat Brass' &&
           us.upr['1:synth'].path === '/p/obxd/fat.json' &&
           us.upr['1:synth'].hash === 'abc:3' &&
           us.upr['1:synth'].mod === 'obxd',
           'setPresetRecord writes the sidecar and upr carries the record');
    /* Positive control for the staleness guard below: same module reads it. */
    assert(hook.get() && hook.get().name === 'Fat Brass',
           'accessor returns the record when the module matches');
} catch (e) { bad('record persists via sidecar', e); }

/* ---- 4a. unseeded module identity must NOT drop the record ------------- */
try {
    const hook = snd.soundPresetRecForTest(1, 'synth', '');
    assert(hook.get() && hook.get().name === 'Fat Brass',
           'accessor keeps the record while module identity is unseeded');
} catch (e) { bad('unseeded identity keeps record', e); }

/* ---- 4b. the staleness guard fires ------------------------------------- */
try {
    const hook = snd.soundPresetRecForTest(1, 'synth', 'dexed');
    assert(hook.get() === null, 'accessor drops a record whose mod mismatches');
    assert(!S.presetRec['1:synth'], 'the stale record is deleted, not just hidden');
} catch (e) { bad('staleness guard fires', e); }

/* ---- 2+3. restore replaces wholesale, and validates shape -------------- */
try {
    /* Seed a "previous project" leftover the restore must clear. */
    S.presetRec['0:synth'] = { name: 'Ghost', path: '/p/x.json', hash: null, mod: '' };
    fsFiles[uiPath] = JSON.stringify({ v: 9, upr: {
        '2:fx1':   { name: 'Wash', path: '/p/rev/wash.json', hash: 'dd:9', mod: 'cloudseed' },
        '3:synth': { name: 'NoPath' },                    /* shape-invalid: dropped */
        '4:fx2':   'not-an-object',                       /* shape-invalid: dropped */
    }});
    bridge.restoreUiSidecar(false);
    assert(!S.presetRec['0:synth'], 'restore clears records the sidecar does not carry');
    const r = S.presetRec['2:fx1'];
    assert(r && r.name === 'Wash' && r.path === '/p/rev/wash.json' &&
           r.hash === 'dd:9' && r.mod === 'cloudseed',
           'restore rehydrates a well-formed record');
    assert(!S.presetRec['3:synth'] && !S.presetRec['4:fx2'],
           'restore drops shape-invalid entries');
} catch (e) { bad('restore replaces + validates', e); }

/* ---- 2b. the no-sidecar branch resets too ------------------------------ */
try {
    fsFiles = Object.create(null);            /* fresh project: no sidecar */
    assert(S.presetRec['2:fx1'], 'precondition: a record is live before the reset');
    bridge.restoreUiSidecar(false);
    assert(Object.keys(S.presetRec).length === 0,
           'restore without a sidecar leaves an EMPTY map');
} catch (e) { bad('no-sidecar branch resets', e); }

process.exit(failed);
}
main().catch(e => { bad('main', e); process.exit(1); });
