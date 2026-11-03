/* tests/js/test_state_too_new.mjs — a project saved by a NEWER dAVEBOx.
 *
 * The DSP refuses a state whose format is newer than its own (flag 2 on
 * `state_version_mismatch`) and never deletes it. The UI must:
 *   - raise the notice on BOTH load paths: resolveSetLoadDecision (boot and
 *     the picker) and the Move-selector handoff in the tick;
 *   - draw PROJECT TOO NEW, never the erase question;
 *   - on the click, leave dAVEBOx — even with the selection on Yes — and never
 *     arm a load (a load would be refused anyway; a Yes would read as consent);
 *   - mark a newer snapshot "(new)", an older one "(old)", and never offer a
 *     newer one for erasing. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

let exitCalls = 0;
let printed = [];
let params = {};
let swallowed = null;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = (k) => (k in params ? params[k] : '');
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => { printed = []; };
globalThis.print = (x, y, t) => { printed.push(String(t)); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {}; globalThis.set_pixel = () => {}; globalThis.stipple_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.draw_line = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_exit_module = () => { exitCalls++; };

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const pers  = await import('../../ui/ui_persistence.mjs');
const dlg   = await import('../../ui/ui_dialogs.mjs');
const { STATE_VERSION, STATE_VERSIONS_READ } = await import('../../ui/ui_constants.mjs');
const { readFileSync } = await import('fs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
/* the kit's faces paint pixels; this trace is where their text shows */
fonts.setKitTextTrace((t) => printed.push(String(t)));

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
function rest() {
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => new Array(16).fill(0)));
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.confirmStateWipe = false; S.stateTooNew = false;
    S.pendingSetLoad = false; S._modalSwallowCC = -1;
    params = {};
}

step('flag 2 raises the notice, arms no load', () => {
    rest();
    params.state_version_mismatch = '2';
    S.pendingSetLoad = true;
    pers.resolveSetLoadDecision();
    if (!S.confirmStateWipe) throw new Error('no notice');
    if (!S.stateTooNew) throw new Error('drawn as the erase question');
    if (S.pendingSetLoad) throw new Error('a load is still armed');
});

step('the notice reads PROJECT TOO NEW and offers no erase', () => {
    dlg.drawStateWipeConfirm();
    const all = printed.join('|');
    if (all.indexOf('PROJECT TOO NEW') < 0) throw new Error('header: ' + all);
    if (/ERASE/i.test(all)) throw new Error('the erase question is drawn: ' + all);
    if (all.toUpperCase().indexOf('NEWER') < 0) throw new Error('does not say why: ' + all);
});

step('the click leaves, even with the selection on Yes, and arms no load', () => {
    S.confirmStateWipeSel = 0;
    const before = exitCalls;
    cc(3, 127);
    if (swallowed) throw new Error('the handler threw: ' + swallowed);
    if (S.pendingSetLoad) throw new Error('Yes armed a load of a newer file');
    if (exitCalls === before) throw new Error('the click did not leave dAVEBOx');
    if (S.confirmStateWipe) throw new Error('the notice is still up');
});

step('flag 1 is still the erase question (and clears a stale too-new)', () => {
    rest();
    S.stateTooNew = true;
    params.state_version_mismatch = '1';
    pers.resolveSetLoadDecision();
    if (!S.confirmStateWipe || S.stateTooNew) throw new Error('flag 1 drawn as too-new');
    dlg.drawStateWipeConfirm();
    if (printed.join('|').toUpperCase().indexOf('ERASE') < 0) throw new Error('no erase question');
    S.confirmStateWipeSel = 0;
    cc(3, 127);
    if (!S.pendingSetLoad) throw new Error('Yes no longer arms the wipe load');
});

step('the Move-selector handoff raises flag 2 too (tick site)', () => {
    /* The tick's handoff block reads the flag where a load proves it landed.
     * Pin the shape: both flags are recognised there, and 2 is the notice. */
    const src = readFileSync('ui/ui_tick.mjs', 'utf8');
    const i = src.indexOf("host_module_get_param('state_version_mismatch')");
    if (i < 0) throw new Error('handoff read not found');
    const blk = src.slice(i, i + 600);
    if (!/_svmN === 1 \|\| _svmN === 2/.test(blk)) throw new Error('flag 2 not handled at the handoff');
    if (!/S\.stateTooNew = \(_svmN === 2\)/.test(blk)) throw new Error('handoff does not mark it too-new');
});

step('snapshots: newer reads (new), older (old), newer never offered for erase', () => {
    const newer = STATE_VERSIONS_READ[STATE_VERSIONS_READ.length - 1] + 1;
    if (STATE_VERSION !== STATE_VERSIONS_READ[STATE_VERSIONS_READ.length - 1])
        throw new Error('STATE_VERSION is not the newest read');
    const snaps = [{ id: '1', sv: newer, label: 'N' }, { id: '2', sv: 30, label: 'O' },
                   { id: '3', sv: 36, label: 'A' }, { id: '4', sv: STATE_VERSION, label: 'B' }];
    S.snapshotPicker = { mode: 'load', snaps: snaps, sel: 0, confirm: null };
    dlg.drawSnapshotPicker();
    const all = printed.join('|');
    if (all.toUpperCase().indexOf('N (NEW)') < 0) throw new Error('newer not marked (new): ' + all);
    if (all.toUpperCase().indexOf('O (OLD)') < 0) throw new Error('older not marked (old): ' + all);
    if (/A \(|B \(/.test(all)) throw new Error('a readable snapshot marked: ' + all);
    const src = readFileSync('ui/ui_dialogs.mjs', 'utf8');
    if (src.indexOf('snaps[i].sv < STATE_VERSIONS_READ[0]') < 0)
        throw new Error('the erase list is not limited to older formats');
    S.snapshotPicker = null;
});

if (failed) { console.error('FAILED'); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
