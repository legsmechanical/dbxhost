import './_bulk_get_stub.mjs';
/* tests/js/test_export_flatten.mjs — Export to Ableton records every Audio
 * clip first (Josh, 2026-11-02: "export flattens"): Live sounds like the
 * project, and the project is untouched.
 *
 * Driven through the real entry (confirmExportStart → armExport) and the
 * real tick poll (pollPendingExport). A small fake engine plays the DSP's
 * part: export_take_ticks answers each clip's length; an export_take runs
 * ARMED → RECORDING → DONE and writes its file.
 *   - every sounding Audio clip is taken, one after another, muted tracks too,
 *     before the write is armed; with Apply Conductor the takes ask for it;
 *   - nothing in the project is touched: no pick, reset or Audio setting;
 *   - Back during a take stops the export; a take past the cap refuses it;
 *   - the takes are deleted after the write, whatever becomes of it;
 *   - CONTROL: with no Audio track the write is armed at once. */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_write_file','host_flush_display','host_ensure_dir','host_remove_dir',
                  'shadow_get_param','shadow_set_param','host_vol_block','host_edit_cc_block',
                  'clear_screen','print','fill_rect','stipple_rect','set_pixel','text_width',
                  'move_midi_internal_send','set_led','host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set','host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 || fn.indexOf('width') >= 0 ? '' : 0);
globalThis.host_sampler_is_recording = () => 0;
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
globalThis.host_read_file = () => '';

/* the fake engine */
const E = { ticks: {}, queried: [], takes: [], files: {}, sets: [], cmds: [], cancelAt: -1, tick: 0 };
globalThis.host_file_exists = (p) => !!E.files[p];
globalThis.host_system_cmd = (c) => { E.cmds.push(c); return 0; };
globalThis.host_module_get_param = (k) => {
    const m = /^export_take_ticks_t(\d)_c(\d+)_k(\d)$/.exec(k);
    if (m) { E.queried.push(k); const v = E.ticks[m[1] + '_' + m[2]]; return v === undefined ? '0' : String(v); }
    if (k === 'resample_err') return '7';
    return '';
};
globalThis.host_module_set_param = (k, v) => { E.sets.push(k); };

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const { S } = await import('../../ui/ui_state.mjs');
const { PAD_MODE_AUDIO, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
const { resampleModalCC } = await import('../../ui/ui_resample.mjs');

function setup(audio, muted) {
    for (let t = 0; t < 8; t++) { S.trackPadMode[t] = 0; S.trackMuted[t] = false; S.trackSoloed[t] = false; }
    E.ticks = {};
    for (const [t, cs] of audio) { S.trackPadMode[t] = PAD_MODE_AUDIO; for (const [c, n] of cs) E.ticks[t + '_' + c] = n; }
    for (const t of muted) S.trackMuted[t] = true;
    S.playing = false; S.clockFollowOn = false;
    S.resampleState = 0; S.resampleFrames = 0; S.resampleTake = null;
    S.pendingDefaultSetParams.length = 0;
    S.exportFlatten = null; S.exportTakes = null; S.pendingExport = false; S.pendingExportRun = false;
    S.exportApplyConductor = false;
    E.queried = []; E.takes = []; E.files = {}; E.sets = []; E.cmds = []; E.cancelAt = -1;
}

/* One tick: the export's poll, then the engine answers what was queued. */
let rs = null;
function tick(stopAtWrite) {
    E.tick++;
    if (stopAtWrite && armed()) return;
    xp.pollPendingExport();
    const q = S.pendingDefaultSetParams.splice(0);
    for (const e of q) {
        if (e.key === 'export_take') {
            const f = e.val.split(' ');
            rs = { path: e.val.slice(e.val.indexOf('|') + 1), left: 4, ticks: +f[2] };
            E.takes.push(e.val);
            S.resampleState = 1; S.playing = true;
        } else if (e.key === 'resample_clear') S.resampleState = 0;
        else if (e.key === 'transport' && e.val === 'stop') { S.playing = false; if (rs && S.resampleState !== 4) { S.resampleState = 5; rs = null; } }
        else E.sets.push(e.key);
    }
    if (rs) {
        /* Back, through the surface the take holds (ui_resample) */
        if (E.cancelAt === E.takes.length && S.resampleState === 3) {
            assert(resampleModalCC(51, 127) === true, 'Back was not taken while the take ran');
        }
        else if (S.resampleState === 1) S.resampleState = 3;
        else if (S.resampleState === 3 && --rs.left <= 0) {
            E.files[rs.path] = 1; S.resampleFrames = rs.ticks * 229.6875; S.resampleState = 4; rs = null;
        }
    }
}
/* the write is armed (its first phase may have run in the same poll) */
const armed = () => S.pendingExport || S.pendingExportRun;
function runToWrite(max) { for (let i = 0; i < max && !armed() && S.exportFlatten; i++) tick(true); }

step('CONTROL: with no Audio track, the write is armed at once', () => {
    setup([], []);
    xp.confirmExportStart();
    assert(armed() && !S.exportFlatten, 'pendingExport ' + S.pendingExport + ' flatten ' + JSON.stringify(S.exportFlatten));
});

step('⭐ every sounding Audio clip is taken, one after another, muted tracks too', () => {
    setup([[2, [[0, 384], [1, 576]]], [5, [[3, 384]]]], [5]);
    xp.confirmExportStart();
    assert(!armed() && S.exportFlatten, 'the write was armed before any take');
    runToWrite(400);
    const who = E.takes.map((v) => v.split(' ').slice(0, 4).join(' '));
    assert(JSON.stringify(who) === JSON.stringify(['2 0 384 0', '2 1 576 0', '5 3 384 0']), 'takes ' + JSON.stringify(who));
    assert(armed(), 'the write never came');
    const k = S.exportTakes && S.exportTakes['2_1'];
    assert(k && k.ticks === 576 && k.nframes === 576 * 229.6875 && /t2_c1\.wav$/.test(k.path), 'take ' + JSON.stringify(k));
    assert(S.resampleTake === null, 'the surface is still held');
});

step('⭐ nothing in the project is touched: no pick, reset or Audio setting', () => {
    const touched = E.sets.filter((k) => /_au_|_hard_reset|_clear$|_pa_clear/.test(k));
    assert(!touched.length, 'touched ' + JSON.stringify(touched));
});

step('⭐ with Apply Conductor the takes ask for it, and their lengths', () => {
    setup([[2, [[0, 1152]]]], []);
    S.exportApplyConductor = true;
    S.trackPadMode[6] = PAD_MODE_CONDUCT;
    S.confirmExportCondPhase = true;
    S.confirmExportCondSel = 0;
    xp.confirmExportCondClick();
    runToWrite(400);
    assert(E.queried.every((k) => /_k1$/.test(k)) && E.queried.length === 16, 'queried ' + JSON.stringify(E.queried.slice(0, 3)));
    assert(E.takes.length === 1 && E.takes[0].split(' ')[3] === '1', 'take ' + JSON.stringify(E.takes));
    S.trackPadMode[6] = 0;
});

step('⭐ Back during a take stops the export, and its takes go', () => {
    setup([[2, [[0, 384], [1, 384]]]], []);
    E.cancelAt = 2;
    xp.confirmExportStart();
    for (let i = 0; i < 400 && S.exportFlatten; i++) tick(true);
    assert(!S.exportFlatten && !armed() && !S.exportTakes, 'the export went on');
    assert(S.actionPopupLines[0] === 'NOT EXPORTED' && S.actionPopupLines[1] === 'Cancelled', 'popup ' + JSON.stringify(S.actionPopupLines));
    assert(E.cmds.some((c) => /rm -rf '.*\/davebox-exports\/takes'/.test(c)), 'the takes were left');
    assert(S.resampleTake === null, 'the surface is still held');
});

step('a clip that meets the Conductor past the cap refuses the export, recording nothing', () => {
    setup([[2, [[0, 384], [1, -1]]]], []);
    xp.confirmExportStart();
    for (let i = 0; i < 10 && S.exportFlatten; i++) tick(true);
    assert(!armed() && !E.takes.length, 'it recorded');
    assert(S.actionPopupLines[0] === 'NOT EXPORTED' && S.actionPopupLines[1] === '3B and its', 'popup ' + JSON.stringify(S.actionPopupLines));
});

step('a take the engine refuses stops the export, saying why', () => {
    setup([[2, [[0, 384]]]], []);
    xp.confirmExportStart();
    tick(true); tick(true);                      /* list, then the send */
    S.pendingDefaultSetParams.length = 0; S.resampleState = 6; rs = null;
    tick(true);
    assert(!S.exportFlatten && !armed(), 'went on');
    assert(S.actionPopupLines[0] === 'NOT EXPORTED' && S.actionPopupLines[2] === 'The track plays no instrument', 'popup ' + JSON.stringify(S.actionPopupLines));
});

step('⭐ the takes are deleted after the write, whatever becomes of it', () => {
    setup([[2, [[0, 384]]]], []);
    xp.confirmExportStart();
    runToWrite(400);
    assert(armed(), 'no write');
    E.cmds = [];
    tick(false); tick(false);                    /* EXPORTING, then the write (it stops at NO TEMPLATE here) */
    assert(S.exportTakes === null, 'the takes are still pending');
    assert(E.cmds.some((c) => /rm -rf '.*\/davebox-exports\/takes'/.test(c)), 'the takes were left: ' + JSON.stringify(E.cmds));
});

step('Clock Follow on: nothing is recorded, the export says why', () => {
    setup([[2, [[0, 384]]]], []);
    S.clockFollowOn = true;
    xp.confirmExportStart();
    for (let i = 0; i < 10 && S.exportFlatten; i++) tick(true);
    assert(!armed() && !E.takes.length, 'started');
    assert(S.actionPopupLines[0] === 'NOT EXPORTED' && S.actionPopupLines[1] === 'Clock Follow is on', 'popup ' + JSON.stringify(S.actionPopupLines));
});

if (failed) { console.error('FAIL: Export records Audio clips first'); process.exit(1); }
console.log('PASS: Export records Audio clips first');
}
main().catch((e) => { console.error(e); process.exit(1); });
