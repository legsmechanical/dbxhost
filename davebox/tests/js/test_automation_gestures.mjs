/* tests/js/test_automation_gestures.mjs — the P4 gestures' writes: deactivate,
 * clear, clear-step, smooth — and the state cache they read and keep. */
const sets = [];
function enc(items) { let s = items.length + '\n'; for (const it of items) s += it.length + '\n' + it; return s; }
function dec(blob) {
    const out = []; if (!blob) return out;
    let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1;
    for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; }
    return out;
}
let list = '';
let listReads = 0;
globalThis.host_module_get_param = (k) => { if (k === 'pa_list') { listReads++; return list; } return '0'; };
globalThis.host_module_get_params = (blob) => enc(dec(blob).map(() => ''));
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_params = () => true;

import { automationRefreshPresence, automationStateFor, automationToggleActive, automationClearKey,
         automationClearStep, automationToggleSmooth, automationTick, automationResetCaches }
    from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';

let ok = 0, bad = 0;
const check = (c, m) => { if (c) { console.log('  ok   — ' + m); ok++; } else { console.log('  FAIL — ' + m); bad++; } };
const tick = () => { S.tickCount++; automationTick(); };
automationResetCaches(); S.tickCount = 100; S.playing = false; S.clipTPS[2][1] = 24;

/* ---- the state cache ---------------------------------------------------- */
list = '2 1 1 8 4:synth:cutoff\n2 1 3 3 4:synth:resonance\n5 0 0 2 5:fx1:mix\n';
automationRefreshPresence();
let s = automationStateFor(2, 1, '4:synth:cutoff');
check(s && s.active && !s.smooth && s.count === 8, 'pa_list -> {active, smooth, count} per (track, clip, target)');
s = automationStateFor(2, 1, '4:synth:resonance');
check(s && s.active && s.smooth, 'flags 3 = active + smooth');
s = automationStateFor(5, 0, '5:fx1:mix');
check(s && !s.active, 'flags 0 = deactivated');
check(automationStateFor(2, 0, '4:synth:cutoff') === null, 'another clip: not automated');

/* ---- Mute + knob ------------------------------------------------------- */
sets.length = 0;
check(automationToggleActive(2, 1, '4:synth:cutoff') === false, 'toggling an active entry deactivates it');
check(automationStateFor(2, 1, '4:synth:cutoff').active === false, 'the cache follows at once — the LED paint does not wait for a re-read');
/* The DSP's list will say the same once the write has crossed. */
list = '2 1 0 8 4:synth:cutoff\n2 1 3 3 4:synth:resonance\n5 0 0 2 5:fx1:mix\n';
listReads = 0;
tick(); tick(); tick();
check(sets[0] === 't2_pa_active=1 4:synth:cutoff 0', 'and writes pa_active 0');
check(listReads === 1, '⚠ the list is re-read ONCE after the write crossed (the DSP is the authority)');
check(automationStateFor(2, 1, '4:synth:cutoff').active === false, 'and agrees');
check(automationToggleActive(2, 0, '4:synth:cutoff') === null, 'nothing automated there: no write, null');

/* ---- Delete + knob ----------------------------------------------------- */
sets.length = 0;
check(automationClearKey(2, 1, '4:synth:resonance') === true, 'clear on an automated parameter');
list = '2 1 0 8 4:synth:cutoff\n5 0 0 2 5:fx1:mix\n';
tick();
check(sets[0] === 't2_c1_undo_checkpoint=1' && sets[1] === 't2_pa_clear_key=1 4:synth:resonance',
      'an undo checkpoint, then the clear');
check(automationStateFor(2, 1, '4:synth:resonance') === null, 'gone from the cache');
check(automationClearKey(2, 1, '4:synth:resonance') === false, 'clearing nothing writes nothing');

/* ---- Delete + step ----------------------------------------------------- */
sets.length = 0;
automationClearStep(2, 1, 5);
tick();
check(sets[0] === 't2_pa_clear_step=1 120 143', 'the step in clip ticks (5 x 24 = 120..143)');

/* ---- knob touched + jog click ------------------------------------------ */
sets.length = 0;
list = '2 1 1 8 4:synth:cutoff\n';
automationRefreshPresence();
check(automationToggleSmooth(2, 1, '4:synth:cutoff') === true, 'stepped -> smooth');
tick();
check(sets[0] === 't2_pa_smooth=1 4:synth:cutoff 1', 'writes pa_smooth 1');
check(automationStateFor(2, 1, '4:synth:cutoff').smooth === true, 'and the cache follows');
check(automationToggleSmooth(2, 1, '4:synth:cutoff') === false, 'and back');

console.log(bad === 0 ? `PASS: test_automation_gestures (${ok} checks)` : `FAIL: test_automation_gestures (${bad} failed)`);
process.exit(bad === 0 ? 0 : 1);
