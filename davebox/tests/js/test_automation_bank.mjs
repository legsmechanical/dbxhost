import './_bulk_get_stub.mjs';
/* tests/js/test_automation_bank.mjs — THE AUTOMATION BANK (spec §2, Josh
 * 2026-09-02): last on the walk after MACROS, replacing the old AUTO bank 6.
 * The card is the LIST of what is automated in the clip (bracketed corners);
 * the knobs are a no-op; jog click enters the menu (cursor + Clear clip);
 * click on a row opens its ops (Delete / Mute / Smooth / Loop); Delete +
 * click clears the clip; Back closes one layer at a time; every edit takes an
 * undo checkpoint. Smooth/Stepped moved here from the module editor.
 *
 * Harness: the whole UI (ui.js + onMidiMessageInternal + tick) over a
 * host_module_get_param stub answering pa_list. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const fb = new Uint8Array(128 * 64);
let painted = 0;
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) { fb[y * 128 + x] = c ? 1 : 0; painted++; } };
const sets = [];
let LIST = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST : '');
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }, { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = px; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION, BANK_MACROS, BANK_SOUND, PAD_MODE_DRUM, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
const { bankCycleForMode } = await import('../../ui/ui_pure.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const ab = await import('../../ui/ui_automation_bank.mjs');
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back = () => { cc(51, 127); cc(51, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const draw = () => { painted = 0; globalThis.clear_screen(); render.drawUI(); };
const T = 0, C = 0;
const menu = () => S.autoBank || {};

step('AUTOMATION is bank 14, last on the melodic and drum walks; the old bank 6 is off them; a Conductor has none', () => {
    assert(BANKS[BANK_AUTOMATION] && BANKS[BANK_AUTOMATION].name === 'AUTOMATION', 'BANKS[14]');
    const mel = bankCycleForMode(0), drum = bankCycleForMode(PAD_MODE_DRUM), con = bankCycleForMode(PAD_MODE_CONDUCT);
    assert(mel[mel.length - 1] === BANK_AUTOMATION && mel[mel.length - 2] === BANK_MACROS, 'melodic: … MACROS, AUTOMATION');
    assert(drum[drum.length - 1] === BANK_AUTOMATION && drum.indexOf(6) < 0 && mel.indexOf(6) < 0, 'drum: … AUTOMATION; bank 6 gone');
    assert(con.indexOf(BANK_AUTOMATION) < 0, 'conductor: none');
});
step('the card lists the clip\'s automation from the owner\'s cache: labels, ON/OFF/SMTH, the pads\' aftertouch as its own row; the knobs are a no-op', () => {
    LIST = '0 0 1 8 0:synth:cutoff 0\n0 0 2 3 0:synth:voices 48\n0 0 1 2 0:slot:volume 0\n1 0 1 2 1:synth:cutoff 0\n';
    auto.automationRefreshPresence();
    S.clipAtHas[T][C] = true;
    S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
    const rows = ab.autoBankRows(T, C);
    assert(rows.length === 4, 'three entries of THIS clip + aftertouch, got ' + JSON.stringify(rows.map(r => r.label)));
    const labels = rows.map(r => r.label);
    assert(labels.indexOf('Syn>Cutoff') >= 0 && labels.indexOf('Syn>Voices') >= 0 && labels.indexOf('Lvl>Volume') >= 0, 'labels, got ' + JSON.stringify(labels));
    assert(rows[rows.length - 1].kind === 'at', 'aftertouch last');
    const vo = rows.find(r => r.label === 'Syn>Voices');
    assert(vo && !vo.active && vo.smooth && vo.loop === 48, 'flags and loop parsed: ' + JSON.stringify(vo));
    draw();
    assert(painted > 200, 'the card drew');
    sets.length = 0;
    cc(71, 4); cc(74, 60); ticks(1);
    assert(sets.length === 0, 'the knobs wrote nothing, got ' + JSON.stringify(sets));
});
step('jog click: the MENU (cursor); click a row: its OPS; Delete runs with a checkpoint and the row leaves the list', () => {
    click(); ticks(1);
    assert(menu().menu === true && !menu().ops, 'menu open');
    assert(ab.autoBankMenuOpen(), 'menu open (predicate)');
    const vi = ab.autoBankRows(T, C).findIndex(r => r.label === 'Lvl>Volume');
    for (let i = 0; i < vi; i++) cc(14, 1);
    ticks(1);
    assert(menu().sel === vi, 'cursor moved to the Volume row, got ' + menu().sel);
    assert(S.activeBank === BANK_AUTOMATION, 'the jog did NOT walk banks while the menu is open');
    click(); ticks(1);
    assert(menu().ops && menu().ops.row.label === 'Lvl>Volume', 'ops for the row under the cursor');
    const ops = menu().ops.rows.map(o => o.op);
    assert(ops[0] === 'delete' && ops.indexOf('active') >= 0 && ops.indexOf('loop') >= 0, 'ops: ' + JSON.stringify(ops));
    sets.length = 0;
    const target = menu().ops.row.target;
    click();                                             /* Delete */
    /* The stub IS the DSP: after the write crosses, its list no longer has the row. */
    LIST = LIST.split('\n').filter(l => l && l.indexOf(' ' + target + ' ') < 0).join('\n') + '\n';
    ticks(2);
    assert(sets.some(x => x.startsWith('t0_c0_undo_checkpoint=')), 'a checkpoint');
    assert(sets.some(x => x === 't0_pa_clear_key=0 ' + target), 'pa_clear_key for the row, got ' + JSON.stringify(sets));
    assert(!menu().ops && menu().menu, 'back on the menu');
    assert(!ab.autoBankRows(T, C).some(r => r.target === target), 'the row is gone from the list');
});
step('Smooth/Stepped is an op HERE (floats only): cutoff offers it, voices (int) does not; Loop edits in steps and writes pa_loop in ticks', () => {
    S.clipTPS[T][C] = 24; S.clipLength[T][C] = 16;
    const rows = ab.autoBankRows(T, C);
    const ci = rows.findIndex(r => r.label === 'Syn>Cutoff');
    menu().sel = ci; click(); ticks(1);
    let ops = menu().ops.rows.map(o => o.op);
    assert(ops.indexOf('smooth') >= 0, 'cutoff offers Smooth, got ' + JSON.stringify(ops));
    const li = ops.indexOf('loop');
    for (let i = 0; i < li; i++) cc(14, 1);
    click(); ticks(1);
    assert(menu().loopEdit === true, 'Loop row: click edits');
    sets.length = 0;
    cc(14, 4); cc(14, 4); ticks(2);
    assert(menu().loopVal === 8, 'jog sets steps, got ' + menu().loopVal);
    /* ⭑ Applies on every change (Josh, 2026-09-03), ONE checkpoint per edit session. */
    assert(sets.some(x => x === 't0_pa_loop=0 0:synth:cutoff 192 0 0'), '8 steps × 24 ticks, got ' + JSON.stringify(sets));
    assert(sets.filter(x => x.startsWith('t0_c0_undo_checkpoint=')).length === 1, 'one checkpoint for the session');
    sets.length = 0;
    click(); ticks(2);
    assert(!sets.some(x => x.startsWith('t0_pa_loop=')), 'the click writes nothing more');
    assert(!menu().ops, 'ops closed by the click');
    /* RATE (Josh, 2026-09-03: /16 to x16): same shape as Loop; the loop length is kept. */
    menu().sel = ci; click(); ticks(1);
    const ri = menu().ops.rows.findIndex(o => o.op === 'rate');
    assert(ri >= 0 && menu().ops.rows[ri].value === 'x1', 'Rate row reads x1 by default, got ' + JSON.stringify(menu().ops.rows[ri]));
    for (let i = 0; i < ri; i++) cc(14, 1);
    click(); ticks(1);
    assert(menu().rateEdit === true, 'Rate: click edits');
    sets.length = 0;
    cc(14, 2); ticks(2);                                  /* x1 -> x4 */
    assert(sets.some(x => x === 't0_pa_loop=0 0:synth:cutoff 192 0 7'), 'x4 (code 7) with the 8-step loop kept, got ' + JSON.stringify(sets));
    cc(14, 127); cc(14, 127); cc(14, 127); cc(14, 127); cc(14, 127); cc(14, 127); ticks(2);   /* down to /4 */
    assert(sets.some(x => x === 't0_pa_loop=0 0:synth:cutoff 192 0 3'), '/4 (code 3), got ' + JSON.stringify(sets));
    cc(14, 127); cc(14, 127); cc(14, 127); ticks(1);
    assert(menu().rateVal === 1, 'clamps at /16, got ' + menu().rateVal);
    back(); ticks(1); assert(!menu().rateEdit && menu().ops, 'Back leaves the edit, ops stay');
    back(); ticks(1);
    const vi = ab.autoBankRows(T, C).findIndex(r => r.label === 'Syn>Voices');
    if (vi >= 0) { menu().sel = vi; click(); ticks(1); ops = menu().ops.rows.map(o => o.op); assert(ops.indexOf('smooth') < 0, 'an int offers no Smooth'); back(); ticks(1); }
});
step('Back closes one layer at a time: ops → menu → card → out of bank mode', () => {
    menu().sel = 0; click(); ticks(1); assert(menu().ops, 'ops open');
    back(); ticks(1); assert(!menu().ops && menu().menu, 'ops closed, menu stays');
    back(); ticks(1); assert(!menu().menu, 'menu closed, card stays'); assert(S.bankCardLatched, 'still latched');
    back(); ticks(1); assert(!S.bankCardLatched, 'the third Back leaves bank mode');
    assert(S.activeBank === BANK_AUTOMATION, 'Back never changes the bank');
});
step('Delete + jog click on the card CLEARS THE CLIP (pa_clear + at_clear, one checkpoint); the list empties', () => {
    S.bankCardLatched = true; sets.length = 0;
    cc(119, 127); click(); cc(119, 0); LIST = ''; ticks(3);
    assert(sets.some(x => x === 't0_pa_clear=0'), 'pa_clear, got ' + JSON.stringify(sets));
    assert(sets.some(x => x === 't0_c0_at_clear=1'), 'the aftertouch lane too');
    assert(sets.filter(x => x.startsWith('t0_c0_undo_checkpoint=')).length >= 1, 'a checkpoint');
    assert(ab.autoBankRows(T, C).length === 0, 'empty list');
});
step('while the menu is open the jog is the menu\'s (no walk); after Back the walk resumes and the menu state is dropped', () => {
    click(); ticks(1); assert(menu().menu, 'menu open');
    cc(14, 127); ticks(1);                               /* jog left: the cursor, not the walk */
    assert(S.activeBank === BANK_AUTOMATION, 'the bank did not move under the open menu: ' + S.activeBank);
    back(); ticks(1); assert(!menu().menu, 'menu closed');
    cc(14, 127); ticks(2);                               /* now the walk: left to MACROS */
    assert(S.activeBank === BANK_MACROS, 'walked to MACROS: ' + S.activeBank);
    assert(!ab.autoBankMenuOpen(), 'no menu state survives the walk');
});

/* ---- the BANK CARD knows its knobs are automated (Josh, 2026-09-03) ------- */
step('⭑ on the NOTE FX card: Mute + touch mutes Gate Time\'s automation (Mute is a modifier), Delete + touch clears it, a turn with a held step LOCKS it', () => {
    LIST = '0 0 1 4 seq:0:noteFX_gate 0 0\n';
    auto.automationRefreshPresence();
    /* The previous step left sound mode open (resting on MACROS); a real walk
     * off that bank exits it. The rig sets the bank directly, so exit here. */
    snd.soundExit();
    S.bankCardLatched = false; S.activeBank = 1; S.trackActiveBank[T] = 1; S.altMode = false;
    S.bankParams[T][1][5] = 100;
    sets.length = 0; S.muteUsedAsModifier = false;
    cc(88, 127);                                   /* Mute down */
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 5, 127]));   /* touch K6 */
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, 5, 0]));
    cc(88, 0); ticks(2);
    assert(S.muteUsedAsModifier === true, 'Mute was a modifier');
    assert(sets.some(x => x === 't0_pa_active=0 seq:0:noteFX_gate 0'), 'muted, got ' + JSON.stringify(sets));
    /* the turn: the bank's own knob goes through the owner too. A held step is
     * DECLINED on a track-setting bank (the held-step law; the lock is the
     * macro's), so a stopped turn is the plain case: with automation present
     * it moves the RESTING value. */
    sets.length = 0;
    S.playing = false; S.clipTPS[T][C] = 24; S.knobLocked.fill(false);   /* soft takeover: unlocked */
    cc(76, 2); ticks(2);
    assert(S.bankParams[T][1][5] > 100, 'the bank value moved, got ' + S.bankParams[T][1][5]);
    assert(sets.some(x => x.startsWith('t0_pa_rest_move=0 seq:0:noteFX_gate ')), 'the stopped turn moved the rest, got ' + JSON.stringify(sets.slice(0, 8)));
    /* ⭑ and a HELD STEP + turn LOCKS it from the card too (Josh, 2026-09-03:
     * the knob is an automation target; Resolution and friends still decline). */
    sets.length = 0;
    S.heldStep = 3; S.heldStepBtn = 3; S.heldStepNotes = [60];
    cc(76, 1); ticks(2);
    assert(sets.some(x => x.startsWith('t0_pa_set2=') && x.includes(' seq:0:noteFX_gate ')), 'a lock from the card, got ' + JSON.stringify(sets.slice(0, 8)));
    sets.length = 0;
    S.activeBank = 0; cc(71, 1); ticks(2);                   /* CLIP K1 Resolution: not a target */
    assert(!sets.some(x => x.startsWith('t0_pa_set2=')), 'Resolution still declines the hold');
    S.activeBank = 1;
    S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    /* Delete + touch clears */
    sets.length = 0;
    cc(119, 127);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 5, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, 5, 0]));
    cc(119, 0); ticks(2);
    assert(sets.some(x => x === 't0_pa_clear_key=0 seq:0:noteFX_gate'), 'cleared, got ' + JSON.stringify(sets));
});

/* ---- the SESSION STRIP is automatable (Josh, 2026-09-04) ------------------ */
step('⭑ a session strip turn goes through the owner: playing → pa_live on <slot>:slot:volume; Delete + touch clears it', () => {
    snd.soundExit();
    S.sessionView = true; S.sessMixerLatched = false; S.sessKnobMode = 0;
    S.trackRoute[0] = 0; S.sessVolBus[0] = 0; S.sessVolSlots[0] = 1; S.sessVolLevel[0] = 1.0;
    S.knobLocked.fill(false);
    LIST = ''; auto.automationRefreshPresence(); auto.automationNoteWrite();
    S.playing = true; sets.length = 0;
    cc(71, 4); ticks(2);
    assert(sets.some(x => x.startsWith('t0_pa_live=0:slot:volume ')), 'the strip turn is a live edit on 0:slot:volume, got ' + JSON.stringify(sets.slice(0, 6)));
    S.playing = false;
    LIST = '0 0 1 4 0:slot:volume 0 0\n'; auto.automationRefreshPresence(); sets.length = 0;
    cc(119, 127);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 0, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0x80, 0, 0]));
    cc(119, 0); ticks(2);
    assert(sets.some(x => x === 't0_pa_clear_key=0 0:slot:volume'), 'Delete + touch cleared the strip\'s automation, got ' + JSON.stringify(sets));
    S.sessionView = false;
});

if (failed) { console.log('FAIL: automation bank'); process.exit(1); }
console.log('PASS: the AUTOMATION bank — the list, the menu, the ops, Clear clip');
}
main().catch(e => { console.error(e); process.exit(1); });
