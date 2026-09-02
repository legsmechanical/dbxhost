/* The host's mid-session autosave is HELD while the transport runs, and the
 * hold is set on the EDGE only — never re-asserted every tick. */
import './_bulk_get_stub.mjs';
const calls = [];
globalThis.host_autosave_hold = (on) => calls.push(on);
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_param = () => true;
globalThis.host_module_set_params = () => true;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => true;
globalThis.shadow_set_params = () => true;
globalThis.shadow_get_params = () => '';
import { autosaveHoldFollow } from '../../ui/ui_dsp_bridge.mjs';
import { readFileSync } from 'node:fs';

let failed = 0;
function check(c, m) { console.log((c ? '  ok   — ' : '  FAIL — ') + m); if (!c) failed++; }

autosaveHoldFollow(false); autosaveHoldFollow(false);
check(calls.length === 0, 'stopped from the start: no hold call at all');
autosaveHoldFollow(true); autosaveHoldFollow(true); autosaveHoldFollow(true);
check(calls.length === 1 && calls[0] === true, '⚠ play: ONE hold(true) on the edge, not one per tick');
autosaveHoldFollow(false); autosaveHoldFollow(false);
check(calls.length === 2 && calls[1] === false, 'stop: ONE hold(false) on the edge');

/* And the poll actually feeds it the transport state it just read. */
const src = readFileSync('ui/ui_dsp_bridge.mjs', 'utf8');   /* cwd = davebox/, as the runner sets it */
const i = src.indexOf("S.playing = (v[0] === '1');");
check(i > 0 && src.indexOf('autosaveHoldFollow(S.playing);', i) - i < 600,
      '⚠ pollDSP hands S.playing to autosaveHoldFollow right after reading it');

if (failed) { console.log('FAIL: autosave hold edge'); process.exit(1); }
console.log('PASS: the host autosave hold follows the transport on the edge');
