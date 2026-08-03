/* tests/js/test_buildinfo_gating.mjs — pins how davebox adapts to the host BUILD.
 *
 * Why this test exists: an audit that only checked `typeof host_x === 'function'`
 * concluded davebox degraded cleanly on stock Schwung. It did not. `fx3:`/`fx4:`
 * and `send_fx:a:`/`send_fx:b:` are fork-only param NAMESPACES, and no typeof
 * check can see a namespace — so on stock those rows rendered, every read came
 * back empty and every write was silently discarded. Worse than the feature being
 * absent, and invisible to the audit.
 *
 * The stock case is the one that matters here: davebox must not offer what the
 * running host cannot do.
 */
import { engineBuildInfo, engineSlotFxBlocks, engineHasSendFx,
         engineUnderDaveboxHost, DAVEBOX_HOST_DIR } from '../../ui/ui_engine.mjs';

let failed = 0;
function eq(got, want, label) {
    if (got !== want) {
        console.error(`FAIL: ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
        failed = 1;
    }
}
function underHost(answer) {
    if (answer === null) delete globalThis.host_build_info;
    else globalThis.host_build_info = () => answer;
}

/* ---- stock Schwung: binding absent -> upstream defaults ---- */
underHost(null);
eq(engineSlotFxBlocks(), 2, 'stock: only fx1..fx2 are routed');
eq(engineHasSendFx(), false, 'stock: no Send FX namespace');
eq(engineUnderDaveboxHost(), false, 'stock: not the davebox host');
eq(engineBuildInfo().install_dir, '/data/UserData/schwung', 'stock: install dir');

/* ---- the dAVEBOx host build ---- */
underHost(JSON.stringify({
    install_dir: DAVEBOX_HOST_DIR, shm_prefix: '/dbxhost-',
    slot_fx_blocks: 4, send_fx: true,
}));
eq(engineSlotFxBlocks(), 4, 'fork: fx1..fx4 routed');
eq(engineHasSendFx(), true, 'fork: Send FX routed');
eq(engineUnderDaveboxHost(), true, 'fork: is the davebox host');

/* ---- a fork-capable build installed elsewhere is NOT the davebox host ----
 * Identity must come from the PATH, not from the binding merely existing — so the
 * check stays correct if host_build_info ever lands upstream. */
underHost(JSON.stringify({
    install_dir: '/data/UserData/schwung', slot_fx_blocks: 4, send_fx: true,
}));
eq(engineUnderDaveboxHost(), false,
   'a fork build at the stock dir must not claim to be the davebox host');
eq(engineSlotFxBlocks(), 4, 'but its routed blocks are still reported honestly');

/* ---- malformed / hostile answers fall back, never throw ---- */
for (const bad of ['not json', 'null', '{}', '[]', '']) {
    underHost(bad);
    eq(engineSlotFxBlocks(), 2, `malformed (${JSON.stringify(bad)}): upstream blocks`);
    eq(engineHasSendFx(), false, `malformed (${JSON.stringify(bad)}): no Send FX`);
    eq(engineUnderDaveboxHost(), false, `malformed (${JSON.stringify(bad)}): not davebox host`);
}

/* A partial answer must not silently imply fork capabilities. */
underHost(JSON.stringify({ install_dir: DAVEBOX_HOST_DIR }));
eq(engineSlotFxBlocks(), 2, 'partial answer: block count defaults to upstream');
eq(engineHasSendFx(), false, 'partial answer: Send FX defaults off');
eq(engineUnderDaveboxHost(), true, 'partial answer: install_dir still identifies the host');

/* A nonsensical block count must not produce zero/negative rows. */
for (const n of [0, -1, 'four', null]) {
    underHost(JSON.stringify({ slot_fx_blocks: n }));
    eq(engineSlotFxBlocks(), 2, `slot_fx_blocks=${JSON.stringify(n)}: falls back to 2`);
}

/* A binding that throws must not take the module down. */
globalThis.host_build_info = () => { throw new Error('boom'); };
eq(engineSlotFxBlocks(), 2, 'throwing binding: upstream blocks');
eq(engineUnderDaveboxHost(), false, 'throwing binding: not the davebox host');

delete globalThis.host_build_info;

if (failed) process.exit(1);
console.log('buildinfo gating: all pins ok');
