import './_bulk_get_stub.mjs';
/* tests/js/test_automation_extend_note_grid.mjs — EXTEND FROM THE NOTE GRID.
 *
 * Josh, 2026-10-20: "can we make it so that it works outside of automation if
 * the last gesture while step is held was to create or modify an automation
 * point?" Hold a step on the clip's grid, turn a knob to lock a parameter on
 * it, press a later step: that lock's value is extended (tN_pa_hold_write over the span), and
 * the note is NOT stretched. With no lock — or a note edit after it — the
 * later step stretches the note exactly as before. Performed with real step
 * presses, knob turns and a pad, through the UI's own entry point.
 *
 * Rig shared with test_automation_bank.mjs. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
let fb = new Uint8Array(128 * 64);
let painted = 0;
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) { fb[y * 128 + x] = c ? 1 : 0; painted++; } };
const sets = [];
let LIST = '';
/* The AUTOMATION bank polls tN_cC_at_has every poll (ui_dsp_bridge) since the
 * old bank 6 was deleted, so the stub must answer it or the poll clears the
 * aftertouch row back off the card. */
let AT_HAS = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v);
    if (/_at_clear$/.test(k)) AT_HAS = ''; };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob);
    for (let i = 0; i + 1 < it.length; i += 2) { sets.push(it[i] + '=' + it[i + 1]);
        if (/_at_clear$/.test(it[i])) AT_HAS = ''; } return true; };
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST
    : /_at_has$/.test(k) ? AT_HAS
    : /_step_\d+_notes$/.test(k) ? '60'
    : /_step_\d+_gate$/.test(k) ? '12'
    : /_step_\d+_vel$/.test(k) ? '100' : '');
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }, { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
const printed = [];
globalThis.print = (x, y, t, c) => { printed.push(String(t)); for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = px; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
const leds = {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; }; globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
S.touchHoldMs = 0;
const { BANKS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const { EXTEND_LED: EXT } = await import('../../ui/ui_leds.mjs');
auto.automationResolveOffForTest(true);

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const STEP = (i) => 16 + i;
const T = 0, C = 0, NOTEFX = 1;

S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 32; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = 0;
S.clipSteps[T][C][2] = 1;                                /* a note on step 3 */
S.clipNonEmpty[T][C] = true;
LIST = '0 0 1 4 seq:0:noteFX_gate 0 0\n';
auto.automationRefreshPresence();
S.bankCardLatched = false; S.activeBank = NOTEFX; S.trackActiveBank[T] = NOTEFX; S.altMode = false;
S.bankParams[T][NOTEFX][5] = 100;
S.playing = false; S.knobLocked.fill(false);

/* The hold's writes, and among them the STRETCHES (a span longer than the
 * held step): "t0_pa_hold_write=<clip> <target> <from> <to> <tps> <value> <type> <rebase>". */
const holdWrites = () => sets.filter(s => s.startsWith('t0_pa_hold_write='));
const extendsOf = () => holdWrites().filter(s => { const f = s.split(' '); return f[2] !== f[3]; });
const lockValue = () => { const w = holdWrites().filter(s => s.split(' ')[2] === s.split(' ')[3]); return w.length ? w[w.length - 1].split(' ')[5] : null; };
const gatesOf = () => sets.filter(s => /^t0_c0_step_2_gate=/.test(s));
const holdStep3 = () => { note(STEP(2), 127); ticks(40); };
const letGo = (i) => { note(STEP(i), 0); note(STEP(2), 0); ticks(3); };

step('setup: holding step 3 reads its note', () => {
    holdStep3();
    assert(S.heldStep === 2 && S.heldStepNotes.length === 1, 'held, notes ' + JSON.stringify(S.heldStepNotes));
    note(STEP(2), 0); ticks(3);
});

step('⚠ CONTROL: no lock in the hold → a later step stretches the NOTE, as before', () => {
    holdStep3(); sets.length = 0;
    note(STEP(5), 127); ticks(2);
    assert(gatesOf().length === 1 && extendsOf().length === 0, 'note stretch expected: ' + JSON.stringify(sets));
    letGo(5);
});

step('⭐ the hold\'s last gesture was a LOCK → a later step EXTENDS that lane, not the note (Josh, 2026-10-20)', () => {
    holdStep3(); sets.length = 0;
    cc(76, 1); ticks(3);                                 /* NOTE FX K6 Gate Time: a lock on step 3 */
    assert(sets.some(s => s.startsWith('t0_pa_hold_write=0 seq:0:noteFX_gate 2 2 24 ')), 'setup: the lock: ' + JSON.stringify(sets));
    const v = lockValue();
    const nUndo = sets.filter(s => /_undo_checkpoint=1$/.test(s)).length;
    note(STEP(5), 127); ticks(3);
    const ex = extendsOf();
    assert(ex.length === 1 && ex[0] === 't0_pa_hold_write=0 seq:0:noteFX_gate 2 5 24 ' + v + ' 1 1',
           'the extend carries the lock\'s value, from the hold\'s base: ' + JSON.stringify(sets));
    assert(gatesOf().length === 0, 'the note was stretched too: ' + JSON.stringify(gatesOf()));
    assert(sets.filter(s => /_undo_checkpoint=1$/.test(s)).length === nUndo, 'the extend shares the lock\'s undo');
    letGo(5);
});

step('⭐ across bars on the note grid: Right pages while held, a bar-2 step extends to it', () => {
    holdStep3(); sets.length = 0;
    cc(76, 1); ticks(3);
    S.clipLength[T][C] = 32;                             /* the tick's sync re-derives it from the stub */
    cc(63, 127); cc(63, 0);                              /* Right: page 2 */
    assert(S.trackCurrentPage[T] === 1, 'setup: paged, page ' + S.trackCurrentPage[T]);
    note(STEP(4), 127); ticks(3);
    const ex = extendsOf();
    assert(ex.length === 1 && ex[0] === 't0_pa_hold_write=0 seq:0:noteFX_gate 2 20 24 ' + lockValue() + ' 1 1',
           'step 3 → bar 2 step 5: ' + JSON.stringify(sets));
    note(STEP(4), 0); cc(62, 127); cc(62, 0); ticks(2);
    note(STEP(2), 0); ticks(3);
    S.trackCurrentPage[T] = 0;
});

step('⭐ SHORTEN on the note grid, and the range shows in an AUTOMATION colour (not the note span\'s) while held', () => {
    holdStep3(); sets.length = 0;
    cc(76, 1); ticks(3);
    note(STEP(7), 127); note(STEP(7), 0); ticks(3);        /* 2..7 */
    let lit = []; for (let i = 0; i < 16; i++) if (leds[16 + i] === EXT) lit.push(i);
    assert(JSON.stringify(lit) === '[2,3,4,5,6,7]', 'the range 3..8 in the extend colour: ' + JSON.stringify(lit));
    assert(EXT !== 56 && !Object.keys(leds).some(k => k >= 16 && k < 32 && leds[k] === 56), 'the note span colour is not used for a lock');
    note(STEP(7), 127); note(STEP(7), 0); ticks(3);        /* again: 2..6 */
    lit = []; for (let i = 0; i < 16; i++) if (leds[16 + i] === EXT) lit.push(i);
    assert(JSON.stringify(lit) === '[2,3,4,5,6]', 'shortened range: ' + JSON.stringify(lit));
    const ex = extendsOf().map(s => s.slice('t0_pa_hold_write=0 seq:0:noteFX_gate '.length));
    const v = lockValue();
    assert(JSON.stringify(ex) === JSON.stringify(['2 7 24 ' + v + ' 1 1', '2 6 24 ' + v + ' 1 1']), 'the presses: ' + JSON.stringify(ex));
    assert(gatesOf().length === 0, 'the note was not touched');
    letGo(7);
});

step('⭐ only the LAST-turned parameter extends: Gate Time, then Velocity Offset → Velocity Offset alone', () => {
    holdStep3(); sets.length = 0;
    cc(76, 1); ticks(3);                                 /* K6 Gate Time */
    cc(73, 1); ticks(3);                                 /* K3 Velocity Offset */
    const second = holdWrites().map(s => s.split(' ')[1]).filter(t => t !== 'seq:0:noteFX_gate')[0];
    assert(second, 'setup: K7 locked a second parameter: ' + JSON.stringify(sets));
    note(STEP(5), 127); note(STEP(5), 0); ticks(3);
    const ex = extendsOf();
    assert(ex.length === 1 && ex[0].split(' ')[1] === second, 'only ' + second + ' extends: ' + JSON.stringify(ex));
    letGo(5);
});

step('a NOTE edit after the lock hands the gesture back to the note', () => {
    holdStep3(); sets.length = 0;
    cc(76, 1); ticks(3);                                 /* lock … */
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 68, 100]));   /* … then a pad: a note into the step */
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, 68, 0])); ticks(3);
    sets.length = 0;
    note(STEP(5), 127); ticks(2);
    assert(extendsOf().length === 0 && gatesOf().length === 1, 'the note should stretch now: ' + JSON.stringify(sets));
    letGo(5);
});

step('a lock from an EARLIER hold of the same step is forgotten: the next hold stretches the note', () => {
    holdStep3(); cc(76, 1); ticks(3);
    note(STEP(2), 0); ticks(3);                          /* that hold ends with a lock as its last gesture */
    holdStep3(); sets.length = 0;                        /* a new hold, nothing turned */
    note(STEP(5), 127); ticks(2);
    assert(extendsOf().length === 0 && gatesOf().length === 1, 'a stale lock was extended: ' + JSON.stringify(sets));
    letGo(5);
});

if (failed) { console.error('FAIL: test_automation_extend_note_grid'); process.exit(1); }
console.log('PASS: test_automation_extend_note_grid');
}
main().catch(e => { console.error(e); process.exit(1); });
