import './_bulk_get_stub.mjs';
/* tests/js/test_export_colors.mjs — every colour in an exported track is one
 * Live can read.
 *
 * A tester's Live refused an exported bundle: "Error loading document: cannot
 * convert to i: color" (2026-10-09). In a set Move writes itself, a colour is
 * always an integer palette index on a track and on a CLIP; only a scene's is
 * null. Our clips carried null. The track is built on the real path
 * (buildTrack → buildClip, notes from the stubbed engine read) and every
 * `color` in the result is checked.
 * CONTROL: an empty slot has no clip, so nothing is invented for it.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd','host_file_exists','host_write_file',
                  'host_ensure_dir','host_remove_dir','host_module_set_param',
                  'shadow_get_param','shadow_set_param','host_vol_block','host_edit_cc_block',
                  'clear_screen','print','fill_rect','stipple_rect','set_pixel','text_width',
                  'move_midi_internal_send','set_led','host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set','host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 || fn.indexOf('width') >= 0 ? '' : 0);
/* The engine's render of a clip: "<span> <count> <cycle>", notes in a file. */
globalThis.host_module_get_param = (k) => (/^t\d+_c0_export$/.test(k) ? '384 2 384' : /_export/.test(k) ? '0 0 0' : '');
globalThis.host_read_file = () => '0:60:100:24;96:64:90:24;';

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const { S } = await import('../../ui/ui_state.mjs');
for (let t = 0; t < 8; t++) { S.trackPadMode[t] = 0; S.trackRoute[t] = 0; S.trackChannel[t] = t + 1; }
const ctx = () => ({ drift: { name: 'Drift', parameters: { Enabled: true } }, moveSong: null,
                     paEnvelopes: [], paLanes: [], paMixerIds: {}, paBendSemis: {}, nextPaId: 2 });

const colours = (o, path, out) => {
    if (Array.isArray(o)) o.forEach((v, i) => colours(v, path + '[' + i + ']', out));
    else if (o && typeof o === 'object') for (const k in o) {
        if (k === 'color') out.push([path, o[k]]);
        colours(o[k], path + '/' + k, out);
    }
    return out;
};
const isIndex = (v) => Number.isInteger(v) && v >= 0;

let track = null;
step('a track with a clip builds on the real path', () => {
    track = xp.exportTrackForTest(2, ctx());
    assert(track && track.clipSlots && track.clipSlots.length > 1, 'no clip slots');
    assert(track.clipSlots[0].clip, 'setup: the stubbed clip did not build');
    assert(track.clipSlots[0].clip.notes && track.clipSlots[0].clip.notes.length === 2, 'setup: its notes did not come through');
});
step('⭐ every colour in the track is an integer palette index — none is null', () => {
    const all = colours(track, 'track', []);
    assert(all.length >= 2, 'found only ' + all.length + ' colour(s) — the walk missed the clip');
    const wrong = all.filter(([, v]) => !isIndex(v));
    assert(wrong.length === 0, 'not an index: ' + JSON.stringify(wrong));
});
step('⭐ the clip wears its track\'s colour', () => {
    assert(track.clipSlots[0].clip.color === track.color, 'clip ' + track.clipSlots[0].clip.color + ', track ' + track.color);
});
step('each track\'s clips take that track\'s own colour', () => {
    const a = xp.exportTrackForTest(0, ctx()), b = xp.exportTrackForTest(5, ctx());
    assert(a.color !== b.color, 'setup: two tracks share a colour');
    assert(a.clipSlots[0].clip.color === a.color && b.clipSlots[0].clip.color === b.color, 'a clip took another track\'s colour');
});
step('CONTROL: an empty slot stays empty — no clip is invented to carry a colour', () => {
    assert(track.clipSlots[1].clip === null, 'slot 1 holds ' + JSON.stringify(track.clipSlots[1].clip));
});
step('the colour survives the JSON the bundle is written as', () => {
    const back = JSON.parse(JSON.stringify(track));
    assert(back.clipSlots[0].clip.color === track.color, 'lost in serialisation');
});
if (failed) { console.log('FAIL: export colours'); process.exit(1); }
console.log('PASS: every exported colour is an integer palette index');
}
main().catch((e) => { console.error(e); process.exit(1); });
