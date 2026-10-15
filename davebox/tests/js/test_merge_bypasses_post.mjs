/* tests/js/test_merge_bypasses_post.mjs — a Live Merge over a POST track
 * bypasses that track's MIDI FX module (Josh, 2026-10-15: "live merge - a)").
 *
 * The module runs first, so the merged clip already holds its output; played
 * through it again it would be applied twice. Driven through the REAL tick:
 * the poll sees the merge go CAPTURED -> IDLE with clips written, reads the
 * engine's merge_post_mask, and bypasses exactly those tracks' modules.
 *   - the masked tracks' midi_fx1 is bypassed, and the state saved;
 *   - an unmasked track is left alone;
 *   - CONTROL: a CANCELLED merge (nothing written) bypasses nothing. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'print', 'clear_screen',
    'fill_rect', 'draw_rect', 'set_pixel', 'flush_display', 'move_midi_inject_to_move', 'set_led',
    'move_midi_internal_send', 'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
    'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi', 'host_module_set_param',
    'pixel_print', 'move_midi_external_send'])
    globalThis[fn] = () => 0;
let saves = 0;
globalThis.shadow_save_state_now = () => { saves++; return 1; };
const sets = [];
globalThis.shadow_set_param = (slot, key, val) => { sets.push([slot, String(key), String(val)]); return 1; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

const UUID = 'merge-uuid';
let MERGE = '3', MASK = '0';
const snapshot = () => { const v = new Array(64).fill('0'); v[55] = MERGE; return v.join(' '); };
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return UUID;
    if (k === 'state_dirty') return '0';
    if (k === 'state_snapshot') return snapshot();
    if (k === 'merge_post_mask') return MASK;
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, POLL_INTERVAL } = await import('../../ui/ui_constants.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID; S.activeTrack = 0; S.sessionView = true; S.playing = false;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
ticks(POLL_INTERVAL * 4);                 /* the poll has seen CAPTURED */
const bypassed = () => sets.filter((x) => x[1] === 'midi_fx1:bypassed' && x[2] === '1').map((x) => x[0]);

step('CONTROL: a CANCELLED merge (nothing written) bypasses nothing', () => {
    sets.length = 0; MASK = String(1 << 2);
    S.mergePlacing = false;
    MERGE = '0'; ticks(POLL_INTERVAL * 3);
    assert(bypassed().length === 0, 'a cancel bypassed: ' + JSON.stringify(bypassed()));
});

step('⭐⭐ a placed merge bypasses exactly the POST tracks it wrote on, and saves', () => {
    MERGE = '3'; ticks(POLL_INTERVAL * 3);
    sets.length = 0; saves = 0; MASK = String((1 << 2) | (1 << 5));
    S.mergePlacing = true;                /* a destination was picked: clips written */
    MERGE = '0'; ticks(POLL_INTERVAL * 3);
    const b = bypassed().sort();
    assert(b.join() === '2,5', 'bypassed slots: ' + JSON.stringify(b));
    assert(saves >= 1, 'the bypass was not saved — it would come back at the next launch');
    assert((S.actionPopupLines || []).join(' ').indexOf('MIDI FX bypassed') >= 0, 'popup: ' + JSON.stringify(S.actionPopupLines));
});

if (failed) { console.error('FAIL: test_merge_bypasses_post'); process.exit(1); }
console.log('PASS: test_merge_bypasses_post');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
