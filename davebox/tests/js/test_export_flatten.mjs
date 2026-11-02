import './_bulk_get_stub.mjs';
/* tests/js/test_export_flatten.mjs — Export to Ableton flattens the Audio
 * tracks first (Josh, 2026-11-02: "let's simply flatten audio tracks before
 * exporting" · "export flattens").
 *
 * Driven through the real entry (confirmExportStart → armExport) and the real
 * flatten (auConvertStart / auConvertTick / the in-place apply), the tick's
 * order kept: pollPendingExport, then the conversion. A small fake engine
 * plays the DSP's part: a resample_clip take runs ARMED → RECORDING → DONE and
 * writes its file; a pick loads a few ticks later.
 *   - each sounding Audio track is flattened, one after another, before the
 *     write is armed; a muted one is not;
 *   - the write waits for every recording to be LOADED in its clip;
 *   - Back during a take stops the export;
 *   - CONTROL: with no Audio track the write is armed at once. */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd','host_file_exists','host_write_file','host_flush_display',
                  'host_ensure_dir','host_remove_dir','shadow_get_param','shadow_set_param',
                  'host_vol_block','host_edit_cc_block','clear_screen','print','fill_rect',
                  'stipple_rect','set_pixel','text_width','move_midi_internal_send','set_led',
                  'host_ext_midi_remap_clear','host_ext_midi_remap_set','host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 || fn.indexOf('width') >= 0 ? '' : 0);
globalThis.host_sampler_is_recording = () => 0;
globalThis.host_read_file = () => '';

const DIR = '/data/UserData/daveboxSA/projects/p1/dAVEBOx/samples';
/* the fake engine */
const E = { takes: [], picks: [], info: {}, loadIn: {}, cancelAt: -1, tick: 0 };
globalThis.__stubStat = {};
globalThis.host_module_get_param = (k) => {
    let m;
    if (/^t\d_au_dir$/.test(k)) return DIR;
    if ((m = /^resample_bars_t(\d)_c(\d+)$/.exec(k))) return '1';
    if (k === 'bpm') return '120';
    if ((m = /^t(\d)_au_info_(\d+)$/.exec(k))) {
        const i = E.info[m[1] + '_' + m[2]];
        if (!i) return '';
        /* the info line: 17+ numbers, then |name (state first) */
        return i.state + ' 0 0 16 1 16 0 0 0 0 88200 44100 2 0 0 0 1 0 0 -1 1200|' + i.name;
    }
    return '';
};
globalThis.host_module_set_param = (k, v) => {
    const m = /^t(\d)_au_pick(_join)?$/.exec(k);
    if (m) {
        const bar = String(v).indexOf('|');
        const c = parseInt(String(v).slice(0, bar), 10), path = String(v).slice(bar + 1);
        E.picks.push({ t: +m[1], c, path });
        E.info[m[1] + '_' + c] = { state: 1, name: '' };
        E.loadIn[m[1] + '_' + c] = { at: E.tick + 6, name: path.slice(path.lastIndexOf('/') + 1) };
    }
};

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const cv = await import('../../ui/ui_audio_convert.mjs');
const { S } = await import('../../ui/ui_state.mjs');
const { PAD_MODE_AUDIO } = await import('../../ui/ui_constants.mjs');

function setup(audio, muted) {
    for (let t = 0; t < 8; t++) {
        S.trackPadMode[t] = 0; S.trackRoute[t] = 0; S.trackMuted[t] = false; S.trackSoloed[t] = false;
        for (let c = 0; c < 16; c++) { S.auInfo[t][c] = null; S.clipNonEmpty[t][c] = false; }
    }
    for (const [t, cs] of audio) {
        S.trackPadMode[t] = PAD_MODE_AUDIO;
        for (const c of cs) S.auInfo[t][c] = { state: 2, name: 'old ' + t + c + '.wav', mode: 0 };
    }
    for (const t of muted) S.trackMuted[t] = true;
    S.playing = false; S.clockFollowOn = false;
    S.resampleState = 0; S.resampleTake = null; S.auConvert = null; S.auApply = null;
    S.pendingAuConvertStart = -1; S.pendingDefaultSetParams.length = 0; S.clearDrainHold = 0;
    S.exportFlatten = null; S.pendingExport = false; S.pendingExportRun = false;
    S.currentSetName = 'P';
    /* a clip reset puts the active clip's bank knobs back (the device has them) */
    if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
    E.takes = []; E.picks = []; E.info = {}; E.loadIn = {}; E.cancelAt = -1;
}

/* One tick, in ui_tick's order: the export's poll, then the conversion; then
 * the engine answers what was queued. */
let rs = null;      /* the take running: { path, left } */
function tick() {
    E.tick++;
    S.tickCount = E.tick;
    if (S.pendingExport && !S.pendingExportRun) { S.pendingExportRun = true; S.pendingExport = false; }
    else if (!S.pendingExportRun) xp.pollPendingExport();
    if (S.pendingAuConvertStart >= 0) {
        const t = S.pendingAuConvertStart;
        S.pendingAuConvertStart = -1;
        if (!S.playing) cv.auConvertStart(t);
    }
    cv.auConvertTick();
    /* the engine */
    const q = S.pendingDefaultSetParams.splice(0);
    S.clearDrainHold = 0;
    for (const e of q) {
        if (e.key === 'resample_clip') {
            const path = e.val.slice(e.val.indexOf('|') + 1);
            E.takes.push({ val: e.val, path });
            rs = { path, left: 5 };
            S.resampleState = 1; S.playing = true;
        } else if (e.key === 'resample_clear') S.resampleState = 0;
        else if (e.key === 'transport' && e.val === 'stop') S.playing = false;
    }
    if (rs) {
        if (E.cancelAt === E.takes.length && S.resampleState === 3) { S.resampleState = 5; S.playing = false; rs = null; }
        else if (S.resampleState === 1) S.resampleState = 3;
        else if (S.resampleState === 3 && --rs.left <= 0) {
            globalThis.__stubStat[rs.path] = { size: 1000, mode: 0o100644 };
            S.resampleState = 4; rs = null;
        }
    }
    for (const k in E.loadIn) if (E.loadIn[k].at === E.tick) { E.info[k] = { state: 2, name: E.loadIn[k].name }; }
}
function run(max) { for (let i = 0; i < max && !S.pendingExportRun && (S.exportFlatten || S.pendingExport); i++) tick(); }

step('CONTROL: with no Audio track, the write is armed at once', () => {
    setup([], []);
    xp.confirmExportStart();
    assert(S.pendingExport && !S.exportFlatten, 'pendingExport ' + S.pendingExport + ' flatten ' + JSON.stringify(S.exportFlatten));
});

step('⭐ each sounding Audio track is flattened first, one after another; a muted one is not', () => {
    setup([[2, [0, 1]], [5, [3]], [6, [0]]], [6]);
    xp.confirmExportStart();
    assert(!S.pendingExport && S.exportFlatten, 'the write was armed before any flatten');
    run(400);
    const who = E.takes.map((x) => x.val.split(' ').slice(0, 2).join(' '));
    assert(JSON.stringify(who) === JSON.stringify(['2 0', '2 1', '5 3']), 'takes ' + JSON.stringify(who));
    /* before its effects (src 2), no warm-up: Flatten track's defaults */
    assert(E.takes.every((x) => x.val.split(' ')[3] === '0' && x.val.split(' ')[5] === '2'), 'takes ' + JSON.stringify(E.takes.map((x) => x.val)));
    assert(S.pendingExportRun, 'the write never came');
    const picked = E.picks.map((p) => p.t + ':' + p.c);
    assert(JSON.stringify(picked) === JSON.stringify(['2:0', '2:1', '5:3']), 'picks ' + JSON.stringify(picked));
    assert(E.picks.every((p, i) => p.path === E.takes[i].path), 'a clip picked something other than its take');
});

step('⭐ the write waits until every recording is loaded in its clip', () => {
    setup([[2, [0]]], []);
    xp.confirmExportStart();
    let pickedAt = -1;
    for (let i = 0; i < 400 && !S.pendingExportRun; i++) {
        tick();
        if (pickedAt < 0 && E.picks.length) pickedAt = E.tick;
        if (pickedAt >= 0 && E.info['2_0'].state !== 2)
            assert(!S.pendingExport && !S.pendingExportRun, 'armed while the take was still loading');
    }
    assert(pickedAt >= 0 && S.pendingExportRun, 'never armed');
    assert(E.info['2_0'].state === 2, 'armed before the load');
});

step('⭐ Back during a take stops the export', () => {
    setup([[2, [0, 1]]], []);
    E.cancelAt = 2;                           /* the second take is cancelled */
    xp.confirmExportStart();
    for (let i = 0; i < 400 && S.exportFlatten; i++) tick();
    for (let i = 0; i < 20; i++) tick();
    assert(!S.exportFlatten && !S.pendingExport && !S.pendingExportRun, 'the export went on');
    assert(S.actionPopupLines[0] === 'NOT EXPORTED', 'popup ' + JSON.stringify(S.actionPopupLines));
    assert(E.picks.length === 0, 'a cancelled flatten still replaced clips');
});

step('Clock Follow on: nothing is recorded, the export says why', () => {
    setup([[2, [0]]], []);
    S.clockFollowOn = true;
    xp.confirmExportStart();
    assert(!S.exportFlatten && !S.pendingExport, 'started');
    assert(S.actionPopupLines[0] === 'NOT EXPORTED', 'popup ' + JSON.stringify(S.actionPopupLines));
    S.clockFollowOn = false;
});

if (failed) { console.error('FAIL: Export flattens Audio tracks first'); process.exit(1); }
console.log('PASS: Export flattens Audio tracks first');
}
main().catch((e) => { console.error(e); process.exit(1); });
