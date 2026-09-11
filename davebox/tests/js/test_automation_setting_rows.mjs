import './_bulk_get_stub.mjs';
/* tests/js/test_automation_setting_rows.mjs — Smooth and Wrap are SETTINGS in a
 * lane's ops pop-up: a static label on the left, the value on the right.
 *
 * Josh, 2026-09-11: "make sure that it and smooth (which are both set and
 * forget) both get a value readout on the right side and a static label on the
 * left of the automation setting menu. Smooth: On/Off. Wrap: Carry/Reset."
 *
 * Performs the gesture: open the AUTOMATION menu, click a lane, jog to each
 * row, click it — and asserts the label, the value, the write that reaches the
 * DSP, and that the pop-up STAYS OPEN on the new value. */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let LIST = '';
let STEPS = {};                      /* 't<T>_c<C>' -> the pa_steps answer */
let stepReads = 0;
let failStepsRead = false;
const leds = {};                     /* note -> colour, NoteOn only */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
const bulk = [];
const _dec = (blob) => { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; };
globalThis.host_module_set_params = (b) => { const it = _dec(b); for (let i = 0; i + 1 < it.length; i += 2) bulk.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) { stepReads++; return failStepsRead ? null : (STEPS[m[1]] || ''); }
    return '';
};
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }, { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.clockFollowTicks = true;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (d) => cc(14, d > 0 ? d : 128 + d);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
S.trackActiveClip[0] = 0; S.trackQueuedClip[0] = -1;
LIST = '0 0 1 3 0:synth:cutoff 0\n';                  /* ACTIVE, stepped, Carry */
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[0] = BANK_AUTOMATION; S.bankCardLatched = true;
ticks(2);
click();                                            /* card -> menu */
click();                                            /* the lane -> its ops */
const rowsOf = () => S.autoBank.ops.rows;
const sel = (op) => { const i = rowsOf().findIndex(o => o.op === op); jog(i - S.autoBank.ops.sel); return i; };

step('setup: the lane\'s ops pop-up is open', () => assert(S.autoBank && S.autoBank.ops, 'ops not open'));
step('⭐ Smooth and Wrap read as SETTINGS: a static label, the value on the right', () => {
    const sm = rowsOf().find(o => o.op === 'smooth'), wr = rowsOf().find(o => o.op === 'wrap');
    assert(sm && sm.label === 'Smooth' && sm.value === 'Off', 'Smooth row: ' + JSON.stringify(sm));
    assert(wr && wr.label === 'Wrap' && wr.value === 'Carry', 'Wrap row: ' + JSON.stringify(wr));
});
step('⭐ clicking Wrap flips it to Reset IN PLACE, writes pa_wrap, and the pop-up stays open', () => {
    sel('wrap'); bulk.length = 0; click(); ticks(2);
    assert(S.autoBank.ops, 'the pop-up closed');
    assert(rowsOf().find(o => o.op === 'wrap').value === 'Reset', 'value did not flip');
    assert(rowsOf().find(o => o.op === 'wrap').label === 'Wrap', 'the LABEL changed — it must be static');
    assert(bulk.indexOf('t0_pa_wrap=0 0:synth:cutoff 1') >= 0, 'no pa_wrap write: ' + JSON.stringify(bulk));
    assert(bulk.indexOf('t0_c0_undo_checkpoint=1') >= 0 && bulk.indexOf('t0_c0_undo_checkpoint=1') < bulk.indexOf('t0_pa_wrap=0 0:synth:cutoff 1'), 'an undo checkpoint first');
    bulk.length = 0; click(); ticks(2);
    assert(rowsOf().find(o => o.op === 'wrap').value === 'Carry' && bulk.indexOf('t0_pa_wrap=0 0:synth:cutoff 0') >= 0, 'and back to Carry');
});
step('⭐ clicking Smooth flips it to On in place, writes pa_smooth, label unchanged', () => {
    sel('smooth'); bulk.length = 0; click(); ticks(2);
    const sm = rowsOf().find(o => o.op === 'smooth');
    assert(S.autoBank.ops && sm.label === 'Smooth' && sm.value === 'On', 'Smooth row after click: ' + JSON.stringify(sm));
    assert(bulk.indexOf('t0_pa_smooth=0 0:synth:cutoff 1') >= 0, 'no pa_smooth write: ' + JSON.stringify(bulk));
});
step('⭐ Mode: Curve -> Punch hides Smooth and Wrap, keeps the cursor on Mode, writes pa_mode', () => {
    const md = rowsOf().find(o => o.op === 'mode');
    assert(md && md.label === 'Mode' && md.value === 'Curve', 'Mode row: ' + JSON.stringify(md));
    sel('mode'); bulk.length = 0; click(); ticks(2);
    assert(S.autoBank.ops, 'the pop-up closed');
    const ops = rowsOf().map(o => o.op);
    assert(rowsOf().find(o => o.op === 'mode').value === 'Punch', 'value did not flip');
    assert(ops.indexOf('smooth') < 0 && ops.indexOf('wrap') < 0, 'Smooth / Wrap still shown in Punch: ' + JSON.stringify(ops));
    assert(rowsOf()[S.autoBank.ops.sel].op === 'mode', 'cursor left Mode');
    assert(bulk.indexOf('t0_pa_mode=0 0:synth:cutoff 1') >= 0, 'no pa_mode write: ' + JSON.stringify(bulk));
    bulk.length = 0; click(); ticks(2);
    const back = rowsOf();
    assert(back.find(o => o.op === 'mode').value === 'Curve' && bulk.indexOf('t0_pa_mode=0 0:synth:cutoff 0') >= 0, 'back to Curve');
    assert(back.find(o => o.op === 'smooth').value === 'On', 'Smooth came back WITH its setting (On, set above)');
    assert(back.find(o => o.op === 'wrap'), 'Wrap came back');
});
step('⭐ Link reads On by default; a click flips it to Off in place and writes pa_link, after an undo checkpoint', () => {
    const lk = rowsOf().find(o => o.op === 'link');
    assert(lk && lk.label === 'Link' && lk.value === 'On', 'Link row: ' + JSON.stringify(lk));
    sel('link'); bulk.length = 0; click(); ticks(2);
    assert(S.autoBank.ops, 'the pop-up closed — Link is a setting');
    assert(rowsOf().find(o => o.op === 'link').value === 'Off', 'value did not flip');
    const w = bulk.indexOf('t0_pa_link=0 0:synth:cutoff 0');
    assert(w >= 0, 'no pa_link write: ' + JSON.stringify(bulk));
    assert(bulk.indexOf('t0_c0_undo_checkpoint=1') >= 0 && bulk.indexOf('t0_c0_undo_checkpoint=1') < w, 'an undo checkpoint first');
    sel('mode'); click(); ticks(2);                                     /* Punch */
    assert(rowsOf().find(o => o.op === 'link'), 'Link stays in Punch — a lock follows its note there too');
    click(); ticks(2);                                                  /* back to Curve */
    sel('link'); bulk.length = 0; click(); ticks(2);
    assert(rowsOf().find(o => o.op === 'link').value === 'On' && bulk.indexOf('t0_pa_link=0 0:synth:cutoff 1') >= 0, 'and back On');
});
step('CONTROL: an ACTION row still closes the pop-up (Mute)', () => {
    sel('active'); click(); ticks(1);
    assert(!S.autoBank.ops, 'Mute is an action — the pop-up should close after it');
});
step('a reopened pop-up reads the flags back from the lane (Reset from the DSP list)', () => {
    LIST = '0 0 11 3 0:synth:cutoff 0\n';            /* ACTIVE | SMOOTH | WRAP_RESET */
    auto.automationRefreshPresence();
    click();                                        /* menu row -> ops */
    const sm = rowsOf().find(o => o.op === 'smooth'), wr = rowsOf().find(o => o.op === 'wrap');
    assert(sm.value === 'On' && wr.value === 'Reset', 'from flags 11: ' + JSON.stringify([sm, wr]));
    assert(rowsOf().find(o => o.op === 'link').value === 'On', 'flags 11 has no UNLINKED bit: linked');
});
step('Link: Off reads back from the DSP list (flags 5 = ACTIVE | UNLINKED)', () => {
    cc(51, 127); cc(51, 0); ticks(1);                /* Back: ops -> menu */
    LIST = '0 0 5 3 0:synth:cutoff 0\n';
    auto.automationRefreshPresence();
    click();
    assert(rowsOf().find(o => o.op === 'link').value === 'Off', 'from flags 5: ' + JSON.stringify(rowsOf()));
});
if (failed) process.exit(1);
console.log('test_automation_setting_rows: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
