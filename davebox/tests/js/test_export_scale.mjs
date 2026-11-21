import './_bulk_get_stub.mjs';
/* tests/js/test_export_scale.mjs — the Ableton export writes the project's
 * scale. Before: it always wrote "Major" (the root was already right). */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const writes = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { writes.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;   /* the bank knob's turn now reaches the automation owner (2026-09-03) */
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { SCALE_NAMES } = await import('../../ui/ui_constants.mjs');
const xp = await import('../../ui/ui_export.mjs');
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
globalThis.init();

/* What the Ableton export calls each dAVEBOx scale (Live / Move's own names). */
const WANT = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian',
              'Harmonic Minor', 'Melodic Minor', 'Major Pentatonic', 'Minor Pentatonic',
              'Minor Blues', 'Whole Tone', 'Whole-half Dim.'];

step('one Ableton name per dAVEBOx scale, in order', () => {
    if (xp.ABL_SCALE_NAMES.length !== SCALE_NAMES.length) throw new Error('length ' + xp.ABL_SCALE_NAMES.length + ' vs ' + SCALE_NAMES.length);
    WANT.forEach((n, i) => { if (xp.ablScaleName(i) !== n) throw new Error(i + ': ' + xp.ablScaleName(i) + ' != ' + n); });
    if (xp.ablScaleName(99) !== 'Major') throw new Error('out of range should export as Major');
});

step('the exported song carries the project scale and root', () => {
    const ctx = { drift: 0, master: {}, moveMap: {}, chainCfg: null, samples: [], sampleBySrc: {},
                  usedDest: {}, auTakes: {}, paMixerIds: [] };
    S.padKey = 9; S.padScale = 10;
    const song = xp.exportSongForTest(120, ctx);
    if (song.scale !== 'Minor Pentatonic') throw new Error('scale ' + song.scale);
    if (song.rootNote !== 9) throw new Error('root ' + song.rootNote);
    S.padScale = 0;
    if (xp.exportSongForTest(120, ctx).scale !== 'Major') throw new Error('control: Major');
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
