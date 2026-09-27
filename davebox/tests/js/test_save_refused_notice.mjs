/* tests/js/test_save_refused_notice.mjs — A PROJECT TOO BIG TO SAVE SAYS SO,
 * and a write that fails is retried and reported.
 *
 * The DSP refuses to serve a project larger than its state buffer (a cut blob
 * would load as a quietly smaller project). That refusal used to reach this
 * side as an empty chunk 0 — exactly what "nothing to save" looks like — so
 * nothing was shown, and every quiet poll asked again: a full serialization on
 * the SPI thread every ~40 ms, for as long as the project stayed open.
 *
 * Driven through the REAL tick (globalThis.tick → pollDSP) against a DSP stub
 * that behaves as seq8.c does: chunk 0 serves only when dirty; on a too-big
 * project it returns '' and sets save_refused (a condition, never cleared by
 * reading); a fitting serialization clears it and the last chunk cleans the
 * state. The card is asserted as DRAWN (the print calls), not just as state.
 *
 * Cases: (1) refused → the card, once; (2) fifty more quiet polls → no new
 * attempt, no new card (back-off); (3) input, then quiet → one more attempt
 * and the card again; (4) shrunk → written, PROJECT SAVED; (5) CONTROL:
 * awaiting a project selection → no attempt, no card; (6) host_write_file
 * failing → SAVE FAILED / CHECK STORAGE once, and the blob lands on a later
 * poll once the write succeeds. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const written = [];
let writeOk = true;
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'stipple_rect', 'draw_line',
    'set_pixel', 'flush_display', 'move_midi_internal_send', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi', 'host_module_set_param', 'pixel_print',
    'move_midi_external_send'])
    globalThis[fn] = () => 0;
globalThis.host_write_file = (p, c) => { if (!writeOk) return false; written.push({ p, c }); return true; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
const printed = [];
globalThis.print = (x, y, t) => { printed.push({ x, t: String(t) }); };
globalThis.clear_screen = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};

/* The DSP, as seq8.c behaves. */
const UUID = 'too-big-uuid';
const BLOB = '{"v":36,"tracks":[]}';
const dsp = { dirty: true, big: true, refused: 0, snapLen: 0, chunk0Reads: 0, blob: BLOB };
/* The largest snapshot the DSP can serve: sizeof(state_buf) - 1, in 32 KB
 * chunks (SEQ8_STATE_CHUNK_MAX). */
const STATE_BUF_MAX = (1 << 20) - 1, CHUNK = 32768;
globalThis.host_module_get_param = (k) => {
    k = String(k);
    const cm = /^state_chunk_([1-9]\d*)$/.exec(k);
    if (cm) {
        const off = parseInt(cm[1], 10) * CHUNK;
        if (off >= dsp.snapLen) return '';
        const part = dsp.blob.slice(off, off + CHUNK);
        if (off + part.length >= dsp.snapLen) dsp.dirty = false;
        return part;
    }
    if (k === 'state_uuid') return UUID;
    if (k === 'state_snapshot') { const a = new Array(64).fill('0'); return a.join(' '); }
    if (k === 'save_refused') return String(dsp.refused);
    if (k === 'state_snap_len') return String(dsp.snapLen);
    if (k === 'state_chunk_0') {
        dsp.chunk0Reads++;
        dsp.snapLen = 0;
        if (!dsp.dirty) return '';
        if (dsp.big) { dsp.refused = 1; return ''; }
        dsp.refused = 0;
        dsp.snapLen = dsp.blob.length;
        if (dsp.blob.length <= CHUNK) dsp.dirty = false;   /* chunk 0 is also the last */
        return dsp.blob.slice(0, CHUNK);
    }
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS } = await import('../../ui/ui_constants.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID;
S.tickCount = 1000;
const statePath = persist.uuidToStatePath(UUID);

const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
/* Real hardware input (a knob-touch release): stamps the quiet clock. */
const input = () => globalThis.onMidiMessageInternal(new Uint8Array([0x90, 0, 0]));
/* ~1.2 s of quiet at the test clock (10.6 ms/tick): past SAVE_QUIET_MS. */
const QUIET = 115;
function cardShown(lines) {
    printed.length = 0;
    render.drawUI();
    const texts = printed.map(p => p.t);
    return lines.every(l => texts.indexOf(l) >= 0);
}
/* Count how many times a card appeared over a run of ticks: a card is a new
 * S.actionPopupEndTick carrying `first` as its first line. */
function runCounting(n, first) {
    let shows = 0, lastEnd = S.actionPopupEndTick;
    for (let i = 0; i < n; i++) {
        S.tickCount++; globalThis.tick();
        /* A NEW show: the end moved and lies in the future (an expiry moves
         * it too, to the past or -1, and is not a show). */
        if (S.actionPopupEndTick !== lastEnd) {
            lastEnd = S.actionPopupEndTick;
            if (lastEnd > S.clockMs && S.actionPopupLines[0] === first) shows++;
        }
    }
    return shows;
}
const TOO_BIG = ['PROJECT TOO BIG', 'NOT SAVED', 'REMOVE SOME CLIPS'];

step('precondition: the three card lines fit the notice card (116 px, 2 px margins)', () => {
    for (const l of TOO_BIG) assert(globalThis.text_width(l) <= 112, l + ' is too wide');
});

let shows1 = 0;
step('⭐ (1) a refused save shows PROJECT TOO BIG / NOT SAVED / REMOVE SOME CLIPS — once', () => {
    input(); ticks(1);
    shows1 = runCounting(QUIET, 'PROJECT TOO BIG');
    assert(dsp.chunk0Reads >= 1, 'no save attempt was made');
    assert(dsp.refused === 1, 'setup: the DSP refused');
    assert(shows1 === 1, 'the card appeared ' + shows1 + ' times');
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(TOO_BIG),
           'the card lines, got ' + JSON.stringify(S.actionPopupLines));
    assert(cardShown(TOO_BIG), 'the card was not DRAWN: ' + JSON.stringify(printed.map(p => p.t)));
    assert(!written.some(w => w.p === statePath), 'something was written');
});

step('⭐ (2) fifty more quiet polls: no new attempt, no new card (back-off)', () => {
    const reads = dsp.chunk0Reads;
    const n = runCounting(50 * 4, 'PROJECT TOO BIG');
    assert(dsp.chunk0Reads === reads, 'chunk 0 was asked ' + (dsp.chunk0Reads - reads) + ' more times');
    assert(n === 0, 'the card re-appeared ' + n + ' times');
});

step('(3) input, then quiet → one more attempt and the card again', () => {
    const reads = dsp.chunk0Reads;
    input(); ticks(1);
    const n = runCounting(QUIET, 'PROJECT TOO BIG');
    assert(dsp.chunk0Reads === reads + 1, 'expected ONE more attempt, got ' + (dsp.chunk0Reads - reads));
    assert(n === 1, 'the card appeared ' + n + ' times');
});

step('⭐ (4) shrunk below the limit → written, and PROJECT SAVED is shown', () => {
    dsp.big = false;
    input(); ticks(1);
    const n = runCounting(QUIET, 'PROJECT SAVED');
    assert(written.some(w => w.p === statePath && w.c === BLOB), 'the project was not written');
    assert(dsp.refused === 0, 'setup: the DSP cleared the refusal');
    assert(n === 1, 'PROJECT SAVED appeared ' + n + ' times');
    assert(S.saveRefused === false, 'S.saveRefused still set');
    assert(cardShown(['PROJECT SAVED']), 'PROJECT SAVED was not drawn');
    /* And a later ordinary save says nothing. */
    dsp.dirty = true; input(); ticks(1);
    const again = runCounting(QUIET, 'PROJECT SAVED');
    assert(again === 0, 'an ordinary save showed PROJECT SAVED');
});

step('⭐ (6) a failed write says SAVE FAILED / CHECK STORAGE once, and lands on a later poll', () => {
    dsp.big = false; dsp.dirty = true;
    writeOk = false;
    written.length = 0;
    input(); ticks(1);
    const n = runCounting(QUIET, 'SAVE FAILED');
    assert(n === 1, 'SAVE FAILED appeared ' + n + ' times');
    assert(JSON.stringify(S.actionPopupLines) === JSON.stringify(['SAVE FAILED', 'CHECK STORAGE']),
           'got ' + JSON.stringify(S.actionPopupLines));
    assert(cardShown(['SAVE FAILED', 'CHECK STORAGE']), 'the card was not drawn');
    assert(S.pendingStateWrite && S.pendingStateWrite.blob === BLOB, 'the blob was not kept for a retry');
    assert(!dsp.dirty, 'setup: the DSP considers it saved — only the kept blob can save it now');
    writeOk = true;
    const m = runCounting(QUIET, 'SAVE FAILED');
    assert(written.some(w => w.p === statePath && w.c === BLOB), 'the kept blob was never written');
    assert(m === 0, 'SAVE FAILED re-appeared');
    assert(S.pendingStateWrite === null, 'pending write not cleared');
});

step('⭐ (7) the largest project the DSP can serve (1 MB, 32 chunks) is fetched whole and written', () => {
    let big = '{"v":36,"pad":"';
    big += 'x'.repeat(STATE_BUF_MAX - big.length - 2) + '"}';
    assert(big.length === STATE_BUF_MAX, 'fixture is exactly the DSP maximum');
    dsp.blob = big; dsp.big = false; dsp.dirty = true; writeOk = true;
    written.length = 0;
    input(); ticks(1); ticks(QUIET);
    const w = written.find(x => x.p === statePath);
    assert(w && w.c.length === big.length && w.c === big,
           'the 1 MB project was not written whole (got ' + (w ? w.c.length : 'nothing') + ')');
    dsp.blob = BLOB;
});

step('(6b) a write that never recovers is dropped after the retry cap', () => {
    dsp.dirty = true; writeOk = false;
    input(); ticks(1);
    ticks(QUIET * 8);           /* > 5 retries at 1 s spacing */
    assert(S.pendingStateWrite === null, 'still retrying after the cap');
    writeOk = true;
});

step('CONTROL (5, run last — it leaves the select-before-load screen armed): awaiting a project selection → no attempt, no card', () => {
    dsp.big = true; dsp.dirty = true; dsp.refused = 0;
    S.awaitingProjectSelect = true;
    const reads = dsp.chunk0Reads;
    input(); ticks(1);
    const n = runCounting(QUIET, 'PROJECT TOO BIG');
    assert(dsp.chunk0Reads === reads, 'a save was attempted while awaiting a selection');
    assert(n === 0, 'the card appeared');
    S.awaitingProjectSelect = false;
    /* POSITIVE for the same setup, once the gate opens. */
    const n2 = runCounting(QUIET, 'PROJECT TOO BIG');
    assert(n2 === 1, 'the same too-big project, gate open, should show the card once — got ' + n2);
});

if (failed) { console.error('FAIL: test_save_refused_notice'); process.exit(1); }
console.log('PASS: test_save_refused_notice');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
