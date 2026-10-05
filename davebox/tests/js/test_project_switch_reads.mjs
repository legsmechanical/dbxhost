/* tests/js/test_project_switch_reads.mjs — A PROJECT SWITCH READS THE PROJECT
 * BACK ONCE.
 *
 * After a load the tick reads the whole project back from the engine (the
 * track digests, ~1,500 values). It is the slow part of a switch, and it ran up
 * to three times: the load-completion poll saw the engine's edit revision
 * change (a fresh engine starts at 0; an unread digest answers FULL) and ran a
 * full sync; the completion's own explicit sync ran a second; and a second
 * later the reload watcher, still holding the last engine's instance id, took
 * the fresh engine for a hot reload and ran a third. The per-clip bank refresh
 * after it then read three values per track one round trip at a time.
 *
 * Driven through the REAL tick against an engine stub that comes back FRESH on
 * the load (new instance id, revision 0) — the in-session switch — and, as a
 * second model, one that keeps its instance. Counted in READS: one full
 * readback = one `t0_digest` read.
 * Cases: (1) fresh engine → one readback, and the per-clip bank refresh made no
 * single reads; (2) same engine → one readback; (3) CONTROL: a genuine hot
 * reload afterwards (a new instance id) still re-syncs; (4) a Conductor's 64
 * per-clip values come in one round trip, and land. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'stipple_rect', 'draw_line', 'print', 'clear_screen', 'fill_rect', 'draw_rect',
    'set_pixel', 'flush_display', 'move_midi_inject_to_move', 'set_led', 'move_midi_internal_send',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi', 'pixel_print', 'move_midi_external_send'])
    globalThis[fn] = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

/* The engine. `fresh` decides what a state_load does to it. */
let eng = { id: 'I1', rev: 7, uuid: 'proj-a' };
let fresh = true;
let conductor = -1;
const single = [];
let inBulk = false;
globalThis.host_module_set_param = (k, v) => {
    if (String(k) === 'state_load') {
        eng = fresh ? { id: 'I2', rev: 0, uuid: String(v) } : { id: eng.id, rev: eng.rev, uuid: String(v) };
    }
    return 0;
};
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (!inBulk) single.push(k);
    if (k === 'instance_id') return eng.id;
    if (k === 'rui_rev') return String(eng.rev);
    if (k === 'rui_dirty') return 'FULL';
    if (k === 'state_uuid') return eng.uuid;
    if (k === 'state_dirty') return '0';
    if (k === 'conductor_track') return String(conductor);
    if (/^t\d_c\d+_cond_resp$/.test(k)) return '10101010';
    if (k === 'state_snapshot') return new Array(64).fill('0').join(' ');
    /* A digest carrying the clip pfx_snapshot, as the engine's does — so a
     * per-clip read seen below is one the refresh made, not the sync. */
    const dm = /^t(\d)_digest$/.exec(k);
    if (dm) {
        let out = '';
        for (let c = 0; c < 16; c++) out += 't' + dm[1] + '_c' + c + '_pfx_snapshot=' + new Array(44).fill('0').join(' ') + '\n';
        return out;
    }
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const realBulk = globalThis.host_module_get_params;
const bulkKeys = [];
globalThis.host_module_get_params = (b) => {
    inBulk = true;
    try { const r = realBulk(b); bulkKeys.push(b); return r; } finally { inBulk = false; }
};
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.activeTrack = 0; S.sessionView = false; S.playing = false;
S.currentSetUuid = 'proj-a'; S.lastDspInstanceId = 'I1';
S.tickCount = 1000;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
ticks(250);                                   /* settled on project A */
const readbacks = () => single.filter((k) => k === 't0_digest').length;

function switchTo(uuid) {
    single.length = 0; bulkKeys.length = 0;
    S.currentSetUuid = uuid;
    S.pendingSetLoad = true;
    ticks(300);                               /* past the completion AND three watcher ticks */
}

step('⭐ (1) in-session switch, fresh engine: ONE full readback, and the bank refresh made no single reads', () => {
    fresh = true;
    switchTo('proj-b');
    assert(S.lastDspInstanceId === 'I2', 'setup: the load completed on the fresh engine (id ' + S.lastDspInstanceId + ')');
    const n = readbacks();
    const perClip = single.filter((k) => /_pfx_snapshot$|_playback_dir$|_playback_audio_reverse$/.test(k));
    console.log(`    readbacks ${n}, per-clip single reads ${perClip.length}, single reads ${single.length}`);
    assert(n === 1, 'the project was read back ' + n + ' times');
    assert(perClip.length === 0, perClip.length + ' per-clip bank reads went one at a time: ' + perClip.slice(0, 4).join(', '));
});

step('⭐ (2) in-session switch, same engine: ONE full readback', () => {
    fresh = false;
    eng.rev = 41;                             /* edits made in project B */
    ticks(8);
    switchTo('proj-c');
    const n = readbacks();
    assert(n === 1, 'the project was read back ' + n + ' times');
});

step('⭐ (4) a project with a Conductor: its 64 per-clip values arrive in one round trip', () => {
    conductor = 3; fresh = true;
    switchTo('proj-d');
    conductor = -1;
    const cond = single.filter((k) => /_cond_(resp|when|oct|lock)$/.test(k));
    assert(S.conductorTrack === 3, 'setup: the Conductor was restored (' + S.conductorTrack + ')');
    assert(S.condResp[5][0] === 1 && S.condResp[5][1] === 0, 'the Conductor values did not land: ' + S.condResp[5].join(''));
    assert(cond.length === 0, cond.length + ' Conductor reads went one at a time');
    assert(readbacks() === 1, 'the project was read back ' + readbacks() + ' times');
});

step('CONTROL (3) a genuine hot reload afterwards still re-syncs', () => {
    single.length = 0;
    eng = { id: 'I9', rev: 0, uuid: eng.uuid };
    ticks(120);
    assert(readbacks() >= 1, 'a new instance id did not re-sync');
});

if (failed) { console.error('FAIL: test_project_switch_reads'); process.exit(1); }
console.log('PASS: test_project_switch_reads');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
