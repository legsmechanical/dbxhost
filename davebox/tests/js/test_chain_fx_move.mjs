/* tests/js/test_chain_fx_move.mjs — MOVE an insert FX, and everything follows.
 *
 * Josh, 2026-09-22: reorder insert effects, with automation, macros and knob
 * maps following the module. chainFxMove is the one call the Move Up / Move
 * Down rows make: the host permutes the chain (`fx:move`), dAVEBOx's automation
 * store renames its targets (`pa_fx_move`), the mirror and macro legs follow.
 * CONTROL: a move the host REFUSES changes nothing on this side either.
 */
let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let hostAccepts = true;
const slotSets = [];
const bulk = [];
let paList = '0 0 1 2 3:fx1:cutoff 0 0 100\n0 1 1 1 3:fx3:mix 0 0 100\n0 0 1 1 5:fx1:cutoff 0 0 100\n';
globalThis.shadow_set_param = (slot, key, val) => { slotSets.push(slot + ' ' + key + '=' + val); return hostAccepts ? 1 : 0; };
globalThis.shadow_get_param = () => '';
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : '');
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = (pairs) => { bulk.push(String(pairs)); return true; };
globalThis.host_module_get_params = () => '';
for (const fn of ['host_read_file', 'host_file_exists', 'host_write_file', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'shadow_set_params', 'shadow_get_params',
                  'host_vol_block', 'host_edit_cc_block', 'move_midi_internal_send', 'set_led',
                  'clear_screen', 'print', 'fill_rect', 'draw_rect', 'set_pixel', 'host_autosave_hold'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { S: GS } = await import('../../ui/ui_state.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const targetsOf = (t, c) => auto.automationEntriesFor(t, c).map(e => e.target).sort();

function seed() {
    hostAccepts = true; slotSets.length = 0; bulk.length = 0;
    auto.automationRefreshPresence();
    GS.trackMacros = GS.trackMacros || [];
    GS.trackMacros[0] = [
        { v: 0.5, legs: [{ kind: 'chain', comp: 'fx1', key: 'cutoff' }] },
        { v: 0.2, legs: [{ kind: 'chain', comp: 'fx2', key: 'drive' }, { kind: 'chain', comp: 'synth', key: 'gain' }] },
    ];
}

step('control: the seeded mirror names slot 3\'s fx1 and fx3', () => {
    seed();
    assert(JSON.stringify(targetsOf(0, 0)) === JSON.stringify(['3:fx1:cutoff', '5:fx1:cutoff']), 'clip 0: ' + JSON.stringify(targetsOf(0, 0)));
    assert(JSON.stringify(targetsOf(0, 1)) === JSON.stringify(['3:fx3:mix']), 'clip 1: ' + JSON.stringify(targetsOf(0, 1)));
});
step('⭐ moving slot 3\'s fx1 to fx3: the host is asked, and the mirror follows the modules', () => {
    seed();
    assert(snd.chainFxMove(0, 3, 1, 3) === true, 'the move reported failure');
    assert(slotSets.includes('3 fx:move=1>3'), 'the host was not asked to move: ' + JSON.stringify(slotSets));
    assert(JSON.stringify(targetsOf(0, 0)) === JSON.stringify(['3:fx3:cutoff', '5:fx1:cutoff']), 'clip 0: ' + JSON.stringify(targetsOf(0, 0)));
    assert(JSON.stringify(targetsOf(0, 1)) === JSON.stringify(['3:fx2:mix']), 'clip 1: ' + JSON.stringify(targetsOf(0, 1)));
});
step('the DSP store is told to rename its targets (t0_pa_fx_move "3 1 3")', () => {
    auto.automationTick();
    assert(bulk.some(b => b.indexOf('t0_pa_fx_move') >= 0 && b.indexOf('3 1 3') >= 0), 'no pa_fx_move sent: ' + JSON.stringify(bulk));
});
step('macro legs on this track follow: fx1 → fx3, fx2 → fx1, the synth leg untouched', () => {
    const m = GS.trackMacros[0];
    assert(m[0].legs[0].comp === 'fx3', 'leg on fx1 is now ' + m[0].legs[0].comp);
    assert(m[1].legs[0].comp === 'fx1', 'leg on fx2 is now ' + m[1].legs[0].comp);
    assert(m[1].legs[1].comp === 'synth', 'the synth leg changed to ' + m[1].legs[1].comp);
});
step('⚠ CONTROL: a move the host REFUSES changes nothing here — mirror, macros, store', () => {
    seed(); hostAccepts = false;
    assert(snd.chainFxMove(0, 3, 1, 3) === false, 'a refused move reported success');
    auto.automationTick();
    assert(JSON.stringify(targetsOf(0, 0)) === JSON.stringify(['3:fx1:cutoff', '5:fx1:cutoff']), 'mirror renamed anyway: ' + JSON.stringify(targetsOf(0, 0)));
    assert(GS.trackMacros[0][0].legs[0].comp === 'fx1', 'a macro leg moved anyway');
    assert(!bulk.some(b => b.indexOf('pa_fx_move') >= 0), 'the DSP store was told to rename anyway');
});

if (failed) { console.log('FAIL: chain fx move'); process.exit(1); }
console.log('PASS: a moved insert FX takes its automation and macros with it; a refused move changes nothing');
}
main().catch(e => { console.error(e); process.exit(1); });
