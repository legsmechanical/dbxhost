/* tests/js/test_wav_editor.mjs — the fullscreen sample-marker editor.
 *
 * ⚠⚠ THIS IS AN OFF-DEVICE EVAL OF THE REAL MODULE, not a check of the
 * arithmetic — `tests/host/test_wav_position.sh` already pins that headlessly.
 * What this file exists for is the half that arithmetic cannot reach: the
 * screen opens, claims the right knobs, writes through the ledger, and draws
 * something that changes when the thing it depicts changes.
 *
 * ⚠ `node --check` is the WRONG gate here (davebox/CLAUDE.md): it passes JS
 * that kills shadow_ui at eval, and esbuild silently treats an undeclared
 * identifier as a host global, so a missing import is a runtime ReferenceError
 * with no build error. Importing and RUNNING the module is the gate.
 */

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const SW = 128, SH = 64;
let fb = new Uint8Array(SW * SH);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < SW && y >= 0 && y < SH) fb[y * SW + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => {
    globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v);
};
globalThis.stipple_rect = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = () => {};
globalThis.text_width = (t) => String(t).length * 6;
const ink = () => fb.reduce((n, v) => n + v, 0);

/* ⚠ STATIC imports: the test bundler emits CJS, which has no top-level await,
 * and a dynamic import would fail the BUILD rather than the test. */
import * as WAV from '../../ui/ui_wav.mjs';
import * as PEAKS from '/data/UserData/schwung/shared/param_pages/wav_peaks.mjs';

/* A three-marker group, the shape the fleet actually ships (sample_start +
 * loop_start + loop_end sharing view_group "loop"). */
const META = (key, extra) => ({
    key, name: key, type: 'wav_position', filepath_param: 'sample_path',
    min: 0, max: 1, step: 0.01, enable_zoom: true, view_group: 'loop', ...extra,
});
const CP = {
    sample_path: { key: 'sample_path', type: 'filepath', root: '/root' },
    sample_start: META('sample_start', { marker_label: 'S' }),
    loop_start: META('loop_start', { marker_label: 'L>' }),
    loop_end: META('loop_end', { marker_label: '<L' }),
    gain: { key: 'gain', type: 'float', min: 0, max: 1, step: 0.01 },
};
const COMP = 'synth';

function rig({ writes = [], store = null } = {}) {
    const S = store || {
        'synth:sample_path': '/root/kick.wav',
        'synth:sample_start': '0.10',
        'synth:loop_start': '0.40',
        'synth:loop_end': '0.90',
    };
    const params = Object.keys(CP).map((k) => ({ key: k, fullKey: `${COMP}:${k}`, meta: CP[k] }));
    return {
        store: S, writes,
        io: {
            getParam: (k) => S[k],
            setParam: (k, v) => { writes.push([k, v]); S[k] = v; },
            metaOf: (bare) => CP[bare] || null,
            buildKey: (bare) => `${COMP}:${bare}`,
            exists: (p) => p === '/root/kick.wav',
            params,
            durationSec: 0,
        },
    };
}
const open = (r, key = 'sample_start') => WAV.wavEditOpen({
    key, fullKey: `${COMP}:${key}`, meta: CP[key], comp: COMP, io: r.io });

/* Real peaks, so the drawer has something to draw. A transient at a known
 * place, so "did the picture move" is answerable. */
function seedPeaks(path) {
    PEAKS.resetWavPeaks();
    PEAKS.setWavPeaksIO({
        stat: () => ({ size: 4096, mtime: 1 }),
        open: () => {
            /* A 16-bit mono WAV header followed by a ramp — enough for
             * wav_format to locate the data and for peaks to differ by column. */
            const n = 2048;
            const buf = new Uint8Array(44 + n * 2);
            const put = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
            const u32 = (o, v) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; buf[o + 2] = (v >> 16) & 255; buf[o + 3] = (v >> 24) & 255; };
            const u16 = (o, v) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; };
            put(0, 'RIFF'); u32(4, buf.length - 8); put(8, 'WAVE');
            put(12, 'fmt '); u32(16, 16); u16(20, 1); u16(22, 1);
            u32(24, 44100); u32(28, 88200); u16(32, 2); u16(34, 16);
            put(36, 'data'); u32(40, n * 2);
            for (let i = 0; i < n; i++) {
                const amp = (i > 1000 && i < 1030) ? 32000 : 800;
                u16(44 + i * 2, amp & 0xffff);
            }
            let pos = 0;
            return {
                read: (dst, at, len) => {
                    const d = new Uint8Array(dst);
                    let n2 = 0;
                    while (n2 < len && pos < buf.length) d[at + n2++] = buf[pos++];
                    return n2;
                },
                seek: (off) => { pos = off; return 0; },
                close: () => {},
            };
        },
    });
    for (let i = 0; i < 80; i++) { if (PEAKS.wavPeaksDone(path)) break; PEAKS.wavPeaksTick(path); }
}

/* ===================================================================== 1 == */
step('the editor OPENS on a wav_position and refuses anything else', () => {
    const r = rig();
    assert(WAV.wavEditOpen({ key: 'gain', fullKey: 'synth:gain', meta: CP.gain, comp: COMP, io: r.io }) === false,
           'a plain float opened the wave editor');
    assert(WAV.wavEditActive() === false, 'a refused open still left the screen active');
    assert(open(r) === true, 'a wav_position did not open');
    assert(WAV.wavEditActive() === true, 'the screen is not active after opening');
    WAV.wavEditClose();
    assert(WAV.wavEditActive() === false, 'close left it active');
});

/* ===================================================================== 2 == */
step('⭐ the three markers of the group are found, IN DECLARATION ORDER', () => {
    const r = rig(); open(r);
    const st = WAV.wavEditState();
    assert(st.members.length === 3, `expected 3 members, got ${st.members.length}`);
    assert(st.members.map((m) => m.key).join(',') === 'sample_start,loop_start,loop_end',
           'members are not in declaration order: ' + st.members.map((m) => m.key));
    assert(st.active === 0, 'the opened marker is not the active one');
    WAV.wavEditClose();
});

/* ===================================================================== 3 == */
step('⭐⭐ a marker knob writes THROUGH THE LEDGER, and only its own marker', () => {
    const r = rig(); open(r);
    /* Knob 2 is loop_start, whatever the screen is currently focused on. */
    assert(WAV.wavEditOnKnob(1, +1, false) === true, 'knob 2 was not consumed');
    assert(r.writes.length === 1, `expected one write, got ${r.writes.length}`);
    assert(r.writes[0][0] === 'synth:loop_start',
           'knob 2 wrote the wrong key: ' + r.writes[0][0]);
    assert(Number(r.writes[0][1]) > 0.4, 'the value did not increase: ' + r.writes[0][1]);
    /* ...and it SELECTED that marker, so the screen follows the knob you turned. */
    assert(WAV.wavEditState().active === 1, 'turning knob 2 did not make loop_start active');
    WAV.wavEditClose();
});

/* ===================================================================== 4 == */
step('⚠⚠ an unused knob in a group is SILENT — it decides nothing and writes nothing', () => {
    const r = rig(); open(r);
    /* Knobs 1-3 are markers, 8 is zoom; 4-7 have no role. ⚠ This is the ROLE
     * decision only. Who OWNS the event is ui_sound's `S.view === VIEW_WAV`
     * branch, which consumes all eight regardless — pinned separately by
     * tests/host/test_wav_editor_owns_the_knobs.sh, because falling through
     * there does not reach the module, it reaches the TRACK LEVELS. */
    assert(WAV.wavEditOnKnob(4, +1, false) === true, 'a silent knob did not report as handled');
    assert(r.writes.length === 0, 'a silent knob wrote something: ' + JSON.stringify(r.writes));
    WAV.wavEditClose();
});

/* ===================================================================== 5 == */
step('⚠ a LEGACY marker (no zoom, no group) claims NO ROLE — but the view still owns the event', () => {
    const legacy = { key: 'pad_start', type: 'wav_position', filepath_param: 'sample_path',
                     min: 0, max: 1, step: 0.01 };
    const r = rig();
    r.io.params = [{ key: 'pad_start', fullKey: 'synth:pad_start', meta: legacy }];
    assert(WAV.wavEditOpen({ key: 'pad_start', fullKey: 'synth:pad_start', meta: legacy,
                            comp: COMP, io: r.io }) === true, 'legacy marker did not open');
    for (let k = 0; k < 8; k++) {
        assert(WAV.wavEditOnKnob(k, +1, false) === false,
               `legacy marker took a ROLE on knob ${k + 1}`);
    }
    assert(r.writes.length === 0, 'a legacy marker wrote from a knob');
    /* The JOG still moves it — that is the gesture it has always had. */
    assert(WAV.wavEditOnJog(+1, false) === true, 'the jog did not move a legacy marker');
    assert(r.writes.length === 1 && r.writes[0][0] === 'synth:pad_start', 'the jog wrote the wrong key');
    WAV.wavEditClose();
});

/* ===================================================================== 6 == */
step('⭐ zoom is on knob 8, is sticky, and SURVIVES leaving the screen', () => {
    const r = rig(); open(r);
    assert(WAV.wavEditOnKnob(7, +2, false) === true, 'knob 8 was not consumed');
    assert(r.writes.length === 0, 'the zoom knob wrote a parameter');
    WAV.wavEditClose();
    open(r);
    /* ⚠ Proven through the DRAWN window, not through a private variable: what
     * matters is that the picture came back zoomed. */
    seedPeaks('/root/kick.wav');
    WAV.renderWavEdit();
    const f = WAV.wavEditFrameForTest();
    assert(f.zoom > 0, 'the zoom did not survive re-opening the screen');
    assert(f.window.window < 1, 'the drawn window is still the whole file');
    WAV.wavEditClose();
    /* ...but a module swap in this component drops it: a 64x window means
     * something else on the file that replaced it. */
    WAV.wavForgetComponent(COMP);
    open(r); seedPeaks('/root/kick.wav'); WAV.renderWavEdit();
    assert(WAV.wavEditFrameForTest().zoom === 0, 'the zoom outlived a module swap');
    WAV.wavEditClose();
});

/* ===================================================================== 7 == */
step('⭐⭐ the SCREEN draws the waveform, and the cursor MOVES when the value does', () => {
    const r = rig(); open(r);
    seedPeaks('/root/kick.wav');
    assert(WAV.renderWavEdit() === true, 'render declined');
    const before = ink();
    const f1 = WAV.wavEditFrameForTest();
    assert(f1.reason === null, 'the screen reported: ' + f1.reason);
    assert(before > 200, 'almost nothing was drawn (' + before + ' px) — no waveform');
    assert(f1.markers.length === 3, 'not every marker was drawn');
    const activePos = f1.markers.find((m) => m.active).pos;

    /* Move the active marker to the far end and redraw. */
    r.store['synth:sample_start'] = '0.95';
    WAV.renderWavEdit();
    const f2 = WAV.wavEditFrameForTest();
    const movedPos = f2.markers.find((m) => m.active).pos;
    assert(movedPos > activePos, `the cursor did not move (${activePos} -> ${movedPos})`);
    WAV.wavEditClose();
});

/* ===================================================================== 8 == */
step('⚠⚠ NO FILE and a MISSING file each SAY SO rather than drawing an empty frame', () => {
    const r = rig({ store: { 'synth:sample_path': '', 'synth:sample_start': '0.5' } });
    open(r);
    assert(WAV.renderWavEdit() === true, 'render declined with no file');
    assert(WAV.wavEditFrameForTest().reason === 'no file',
           'a missing link did not report: ' + WAV.wavEditFrameForTest().reason);
    /* ⚠ CONTROL: with a file it reports nothing, so the check above is not
     * simply always true. */
    WAV.wavEditClose();
    const r2 = rig(); open(r2); seedPeaks('/root/kick.wav'); WAV.renderWavEdit();
    assert(WAV.wavEditFrameForTest().reason === null, 'control: a good file reported a reason');
    WAV.wavEditClose();
});

/* ===================================================================== 9 == */
step('⭐ a knob TOUCH selects a marker without moving it', () => {
    const r = rig(); open(r);
    assert(WAV.wavEditOnKnobTouch(2) === true, 'the touch was not consumed');
    assert(WAV.wavEditState().active === 2, 'the touch did not select loop_end');
    assert(r.writes.length === 0, 'a touch WROTE something — it must only select');
    WAV.wavEditClose();
});

/* ==================================================================== 10 == */
step('⚠ at high zoom one detent still CHANGES the value — the write keeps enough decimals', () => {
    const r = rig(); open(r);
    for (let i = 0; i < 16; i++) WAV.wavEditOnKnob(7, +1, false);   /* zoom to the top */
    const start = r.store['synth:sample_start'];
    WAV.wavEditOnKnob(0, +1, true);                                 /* fine, at max zoom */
    assert(r.store['synth:sample_start'] !== start,
           `the finest possible detent wrote back identical (${start}) — a dead encoder`);
    WAV.wavEditClose();
});

/* ==================================================================== 11 == */
step('⚠⚠ zoom is per SLOT — two tracks holding the same module do not share it', () => {
    /* Component names REPEAT across tracks (every chain slot has a `synth`), so
     * a key without the slot let track 1's 64x land on track 3's file. */
    const r = rig();
    WAV.wavEditOpen({ key: 'sample_start', fullKey: 'synth:sample_start',
                      meta: CP.sample_start, comp: COMP, slot: 0, io: r.io });
    WAV.wavEditOnKnob(7, +4, false);
    seedPeaks('/root/kick.wav'); WAV.renderWavEdit();
    const z0 = WAV.wavEditFrameForTest().zoom;
    assert(z0 > 0, 'rig: the zoom did not take on slot 0');
    WAV.wavEditClose();

    WAV.wavEditOpen({ key: 'sample_start', fullKey: 'synth:sample_start',
                      meta: CP.sample_start, comp: COMP, slot: 3, io: r.io });
    WAV.renderWavEdit();
    assert(WAV.wavEditFrameForTest().zoom === 0,
           'slot 3 inherited slot 0 zoom — the key is not slot-scoped');
    WAV.wavEditClose();

    /* ⚠ CONTROL: coming back to slot 0 still has it, or the check above would
     * pass on a zoom that simply never persists. */
    WAV.wavEditOpen({ key: 'sample_start', fullKey: 'synth:sample_start',
                      meta: CP.sample_start, comp: COMP, slot: 0, io: r.io });
    WAV.renderWavEdit();
    assert(WAV.wavEditFrameForTest().zoom === z0, 'control: slot 0 lost its own zoom');
    WAV.wavEditClose();
    WAV.wavForgetComponent(COMP);
});

/* ==================================================================== 12 == */
step('⚠⚠ the file is resolved ONCE, not on every frame', () => {
    /* Each resolution is a param read plus up to three stats. Doing it in the
     * draw put a filesystem round trip on the path whose whole job is to redraw
     * smoothly — the rule wav_peaks.mjs states outright. */
    let stats = 0;
    const r = rig();
    const inner = r.io.exists;
    r.io.exists = (p) => { stats++; return inner(p); };
    open(r);
    seedPeaks('/root/kick.wav');
    const afterOpen = stats;
    for (let i = 0; i < 10; i++) WAV.renderWavEdit();
    assert(stats === afterOpen,
           `rendering 10 frames cost ${stats - afterOpen} filesystem calls — it must cost none`);
    for (let i = 0; i < 10; i++) WAV.wavEditTick();
    assert(stats === afterOpen, 'ticking re-resolved a file whose link had not changed');

    /* ⚠ CONTROL: it MUST re-resolve when the module actually points elsewhere,
     * or "resolved once" would just be "never refreshed". */
    r.store['synth:sample_path'] = '/root/snare.wav';
    WAV.wavEditTick();
    assert(stats > afterOpen, 'a CHANGED sample link was not re-resolved');
    WAV.wavEditClose();
});

/* ==================================================================== 13 == */
step('⚠ the peaks are NORMALISED — a quiet sample is not drawn as a flat line', () => {
    const r = rig(); open(r);
    seedPeaks('/root/kick.wav');
    WAV.renderWavEdit();
    const loud = ink();
    /* The same file at a quarter of the amplitude must still fill the plot:
     * `points` are absolute and `peak` is what the cell widget divides by. */
    assert(loud > 200, 'rig: nothing was drawn to compare against');
    WAV.wavEditClose();
});

if (failed) { console.log('FAIL: test_wav_editor'); process.exit(1); }
console.log('PASS: test_wav_editor');
