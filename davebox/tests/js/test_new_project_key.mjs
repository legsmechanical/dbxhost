
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_new_project_key.mjs — A NEW PROJECT KEEPS ITS RANDOM KEY
 * (Josh, 2026-09-10: "key and scale is no longer being randomized on new
 * project creation" … "they always land on a minor").
 *
 * ⚠⚠ EVERY PART OF THIS WORKED, WHICH IS WHY IT TOOK A LOG TO SEE. The shell
 * seeder writes a random key+scale note (verified on the device, end to end,
 * into a sandbox SETS_DIR); the consumer reads it, applies it and deletes it
 * (verified in a rig). The values were then thrown away by the STATE LOAD,
 * which runs about a second LATER and writes the DSP's defaults — key 9,
 * scale 1 (seq8.c:4467), which is A minor. Nine projects in a row came up A
 * minor and none of the three pieces was broken.
 *
 * So the thing to pin is the ORDER, and the observable is what survives an
 * overwrite that happens AFTER the note is already gone.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };

const sets = [];
const files = {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (files[p] !== undefined ? files[p] : '');
globalThis.host_file_exists = (p) => (files[p] !== undefined);
globalThis.host_write_file = () => true; globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
/* ⚠ A REAL readback, not ''. The sync reads `key`/`scale` back from the DSP.
 * ✅ FIXED 2026-09-10 — the guard that made this note necessary is gone: the
 * reads went through `!== null && !== undefined` on the RAW string, an empty
 * answer passed it, and `parseInt("", 10) | 0` was 0, so a failed read
 * silently rewrote the key to C. `dspGetInt` now parses first and tests for a
 * NUMBER. The last case in this file is the control that pins it. */
const DSP = { key: '9', scale: '1' };
globalThis.host_module_get_param = (k) => (DSP[String(k)] !== undefined ? DSP[String(k)] : '');
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => String(t).length * 6; globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {}; globalThis.host_ext_midi_remap_enable = () => {};
globalThis.host_autosave_hold = () => {}; globalThis.shadow_save_state_now = () => 1;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const persist = await import('../../ui/ui_persistence.mjs');

S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.currentSetUuid = 'new-proj-uuid';
const notePath = persist.uuidToNewProjectPath(S.currentSetUuid);
const lastOf = (k) => { const w = sets.filter(([kk]) => kk === k); return w.length ? w[w.length - 1][1] : null; };

/* The DSP's defaults, i.e. what a state load writes for a brand-new project. */
const DEFAULT_KEY = 9, DEFAULT_SCALE = 1;         /* A minor — seq8.c:4467 */

step('setup: the note is there, and the sync reads it, applies it and DELETES it', () => {
    files[notePath] = JSON.stringify({ key: 4, scale: 7 });   /* E harmonic minor */
    S.padKey = DEFAULT_KEY; S.padScale = DEFAULT_SCALE;
    sets.length = 0;
    bridge.syncClipsFromDsp();
    if (S.padKey !== 4 || S.padScale !== 7) throw new Error('the sync did not apply the note');
    if (lastOf('key') !== '4' || lastOf('scale') !== '7') throw new Error('the DSP was not told');
});

step('⭐⭐ …and the values SURVIVE the state load that lands afterwards', () => {
    /* The load: the DSP's own defaults, written over everything the sync did.
     * This is the second that was missing — the note is already gone by now,
     * so nothing could put the random key back. */
    S.padKey = DEFAULT_KEY; S.padScale = DEFAULT_SCALE;
    sets.length = 0;
    const applied = bridge.applyNewProjectSeed();
    if (!applied) throw new Error('⭑ nothing was held over the load — the seed died with the sync');
    if (S.padKey !== 4 || S.padScale !== 7)
        throw new Error('⭑ the project came up in ' + S.padKey + '/' + S.padScale
            + ' — the defaults are ' + DEFAULT_KEY + '/' + DEFAULT_SCALE + ' (A minor), which is the bug');
    if (lastOf('key') !== '4' || lastOf('scale') !== '7')
        throw new Error('the DSP was not re-told after the load: ' + JSON.stringify(sets));
});

step('⚠ ONE SHOT: a second load does NOT re-randomise a project the user has since tuned', () => {
    S.padKey = 0; S.padScale = 0;                 /* the user chose C major */
    sets.length = 0;
    if (bridge.applyNewProjectSeed()) throw new Error('the seed fired twice');
    if (S.padKey !== 0 || S.padScale !== 0) throw new Error('a second load moved the user\'s key');
});

step('⚠ CONTROL: an ORDINARY project (no note) holds nothing back and changes nothing', () => {
    delete files[notePath];
    DSP.key = '3'; DSP.scale = '5';
    S.padKey = 3; S.padScale = 5;
    sets.length = 0;
    bridge.syncClipsFromDsp();
    if (S.newProjectSeed) throw new Error('a project with no note stashed a seed anyway');
    if (bridge.applyNewProjectSeed()) throw new Error('and it applied one');
    if (S.padKey !== 3 || S.padScale !== 5) throw new Error('an ordinary load moved the key');
});

/* ── the empty-readback guard (Block 1, 2026-09-10) ───────────────────────
 *
 * ⚠⚠ THE BUG THIS PINS: `host_module_get_param` returns `undefined` ONLY when
 * the DSP signals an error (`len < 0`, `src/schwung_host.c:1466`). A serve that
 * writes ZERO bytes returns `len == 0`, and JS gets an EMPTY STRING. The old
 * guard — `raw !== null && raw !== undefined` — passed that, and
 * `parseInt("", 10) | 0` is 0. So a read that never answered wrote a confident
 * ZERO: key 0 is C, and the user's project silently changed key.
 *
 * ⭑ THE CONTROL THAT MUST FAIL comes first: with the fix reverted, the empty
 * case below rewrites padKey to 0. Without a case that CAN fail, "it passed"
 * would mean nothing. → [[a-check-that-cries-wolf-is-worse-than-none]] */
step('⭐⭐ an EMPTY readback leaves the key ALONE — it does not become C', () => {
    delete files[notePath];                        /* ordinary project, no seed */
    DSP.key = ''; DSP.scale = '';                  /* the zero-byte serve */
    S.padKey = 7; S.padScale = 3;                  /* what the user actually has */
    bridge.syncClipsFromDsp();
    if (S.padKey === 0 && S.padScale === 0)
        throw new Error('⭑ THE BUG: an empty read rewrote the project to key 0 (C), scale 0');
    if (S.padKey !== 7 || S.padScale !== 3)
        throw new Error('an empty read moved the key to ' + S.padKey + '/' + S.padScale
            + ' — it must leave 7/3 untouched');
});

step('⚠ a MISSING key (undefined) is treated the same as an empty one', () => {
    delete files[notePath];
    delete DSP.key; delete DSP.scale;              /* stub answers '' for unknowns */
    S.padKey = 5; S.padScale = 2;
    bridge.syncClipsFromDsp();
    if (S.padKey !== 5 || S.padScale !== 2)
        throw new Error('a missing read moved the key to ' + S.padKey + '/' + S.padScale);
});

step('⚠ POSITIVE CONTROL: a REAL zero still lands — 0 is a legitimate key (C)', () => {
    delete files[notePath];
    DSP.key = '0'; DSP.scale = '0';                /* the user really is in C */
    S.padKey = 7; S.padScale = 3;
    bridge.syncClipsFromDsp();
    if (S.padKey !== 0 || S.padScale !== 0)
        throw new Error('⭑ the guard is too strict — it rejected a REAL 0, which is C major. '
            + 'Got ' + S.padKey + '/' + S.padScale);
});

process.exit(failed);
}
main();
