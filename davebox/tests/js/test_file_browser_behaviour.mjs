/* tests/js/test_file_browser_behaviour.mjs — dAVEBOx's file browser AUDITIONS,
 * and runs the module's browser_hooks, because the behaviour now lives beside
 * the state instead of inside the host's own screen.
 *
 * ⚠⚠ WHAT WAS ACTUALLY BROKEN, and it was silent for six months. dAVEBOx shares
 * MODULES with the host, not SCREENS, and the split was drawn around DATA:
 * `filepath_browser.mjs` carried the entries and the cursor, while auditioning
 * and the hooks stayed in shadow_ui.js. dAVEBOx draws its own browser, so it
 * simply had none of it — no audition, no hooks, no error, nothing to grep for.
 * Upstream shipped live_preview on 2026-03-04 (9c48f4d3). Five of the 100
 * captured modules declare it across 23 filepath params, and mrdrums declares
 * browser_hooks on 17 of them.
 *
 * ⭑ THE FIXTURE IS mrdrums' OWN DECLARATION, read out of the 100-module
 * capture, not a shape I invented. A hand-written fixture is what let a
 * six-pass review miss what Josh hit in his first minute on hardware.
 *
 * ⚠⚠ AND THE RIG USES PRODUCTION'S OWN io OBJECT. That is the point of
 * `soundFileBrowserForTest` handing it over rather than accepting one: the trap
 * here is that `queueWrite` returns UNDEFINED, which the shared code reads as
 * "the write did not take". A hand-written test io returning true would prove
 * the wiring correct and ship the bug — the same shape as the wave editor's rig,
 * which had no `siblingKey` and therefore asserted the fallback was right.
 */

import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

/* the engine, answering reads and recording nothing — writes go through the
 * pending-write ledger, which the hook hands back. */
/* ⚠ TWO arguments, and the key already carries its component: engineGet builds
 * `comp + ':' + key` and calls `shadow_get_param(slot, fullKey)`. A three-arg
 * stub answers '' to everything, which is not an error anywhere — it is a
 * borrowed value of "" that "restores" the module's param to empty. */
const ENGINE = { 'synth:ui_auto_select_pad': 'on', 'synth:pad_sample_path': '/s/kick.wav',
                 'fx2:ui_auto_select_pad': 'FX2' };
globalThis.shadow_get_param = (slot, fullKey) => ENGINE[fullKey] || '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
for (const fn of ['set_pixel', 'fill_rect', 'draw_rect', 'stipple_rect', 'clear_screen',
                  'print', 'pixel_print', 'flush_display'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

/* mrdrums' real filepath declaration, out of the fleet capture. */
function mrdrumsSampleParam() {
    const capture = JSON.parse(readFileSync('../tests/fixtures/module-contracts.json', 'utf8'));
    const mods = capture.modules;
    const list = Array.isArray(mods) ? mods : Object.values(mods);
    const mrdrums = list.find((m) => (m.id || m.name) === 'mrdrums');
    assert(mrdrums, 'mrdrums is not in the fleet capture — the fixture cannot be built');
    let found = null;
    (function walk(o) {
        if (found) return;
        if (Array.isArray(o)) { for (const v of o) walk(v); return; }
        if (o && typeof o === 'object') {
            if (o.type === 'filepath' && o.live_preview !== undefined && o.browser_hooks) { found = o; return; }
            for (const v of Object.values(o)) walk(v);
        }
    })(mrdrums);
    assert(found, 'no filepath param with live_preview AND browser_hooks found on mrdrums');
    return found;
}

async function main() {
const { makeCell } = await import('../../ui/ui_discover.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const shared = await import('/data/UserData/schwung/shared/filepath_browser.mjs');

const decl = mrdrumsSampleParam();

step('control: the fixture is the real declaration, with both fields set', () => {
    assert(decl.live_preview === true, 'live_preview is not true on the captured param');
    assert(decl.browser_hooks && Array.isArray(decl.browser_hooks.on_open),
           'the captured param declares no on_open hook');
    assert(decl.browser_hooks.on_open[0].restore === true,
           'the captured hook does not BORROW — the restore path would not be exercised');
});

/* ---- 1. the cell must not drop the behaviour ---------------------------- */
step('⭐ the cell carries live_preview and browser_hooks, not only where to browse', () => {
    const c = makeCell(decl.key, decl);
    assert(c.kind === 'file', 'the declaration did not produce a file cell');
    assert(c.fileRoot === decl.root, 'root was dropped');           /* control */
    assert(c.filePreview === true, 'live_preview was dropped by makeCell');
    assert(c.fileHooks && c.fileHooks.on_open, 'browser_hooks was dropped by makeCell');
});

/* ---- 2. the io production actually hands the shared code ---------------- */
const B = snd.soundFileBrowserForTest();
B.setContext(3, 'synth');

step('⚠⚠ setParam returns TRUTHY — queueWrite returns undefined, and undefined means FAILED', () => {
    B.clearWrites();
    const r = B.io.setParam('pad_sample_path', '/s/x.wav');
    assert(r, 'the io reported the write as failed; a preview would never record what it set');
    const w = B.pendingWrites();
    assert(w.length === 1 && w[0][1] === 'synth' && w[0][2] === 'pad_sample_path',
           'the write did not reach the ledger as (comp, key): ' + JSON.stringify(w));
});

step('a component-qualified key is SPLIT, not written as one long key', () => {
    B.clearWrites();
    B.io.setParam('fx1:mix', '0');
    const w = B.pendingWrites();
    assert(w.length === 1 && w[0][1] === 'fx1' && w[0][2] === 'mix',
           'a qualified key was not split: ' + JSON.stringify(w));
});

step('⚠ the io addresses the component IN SCOPE, not a hardcoded one', () => {
    /* The browser is reachable from any component — an fx insert has filepath
     * params too. A test that only ever runs on `synth` cannot tell the two
     * apart, and did not. */
    B.setContext(3, 'fx2');
    B.clearWrites();
    B.io.setParam('ir_path', '/s/hall.wav');
    const w = B.pendingWrites();
    assert(w.length === 1 && w[0][1] === 'fx2',
           'the write did not follow the component in scope: ' + JSON.stringify(w));
    B.setContext(3, 'synth');
});

step('getParam reads through the same addressing', () => {
    assert(B.io.getParam('ui_auto_select_pad') === 'on', 'a bare key did not read from the component in scope');
    assert(B.io.getParam('synth:ui_auto_select_pad') === 'on', 'a qualified key did not read');
    /* ⚠ A DIFFERENT component, or the two read paths are indistinguishable —
     * they were, and a mutation that ignored the qualifier survived. */
    assert(B.io.getParam('fx2:ui_auto_select_pad') === 'FX2',
           'a qualified key was read against the component in scope instead of its own');
});

/* ---- 3. a whole browse, driven through production ----------------------- *
 * The LISTING is supplied here: off-device `os.readdir` answers ENOENT by
 * design (see tests/js/stubs/quickjs_os.mjs), and what is under test is the
 * audition, not the directory read — which has its own pins. */
const LISTING = [
    { kind: 'up',   label: '..',      path: '/s' },
    { kind: 'file', label: 'kick.wav', path: '/s/kick.wav' },
    { kind: 'file', label: 'snare.wav', path: '/s/snare.wav' },
];
function openBrowse() {
    B.clearWrites();
    const cell = makeCell(decl.key, decl);
    B.open({ pkey: decl.key, key: decl.key, cell, raw: '/s/kick.wav' });
    const st = B.state();
    st.items = LISTING.slice();
    st.selectedIndex = 1;
    return st;
}

step('⭐ on_open BORROWS the module’s param — the pad auto-select suspend actually happens', () => {
    openBrowse();
    const w = B.pendingWrites();
    assert(w.some((x) => x[2] === 'ui_auto_select_pad' && x[3] === 'off'),
           'the on_open hook never ran: ' + JSON.stringify(w));
    assert(B.state().hookRestoreValues.ui_auto_select_pad === 'on',
           'the previous value was not borrowed, so it can never be put back');
});

step('⭐ moving the highlight ARMS an audition, and the debounce holds it back', () => {
    const st = openBrowse();
    shared.moveFilepathBrowserSelection(st, 1);
    shared.armFilepathPreview(st);
    assert(st.previewPendingPath === '/s/snare.wav', 'the audition was not armed');
    B.clearWrites();
    shared.tickFilepathPreview(st, B.io, st.previewPendingTime + 10);
    assert(B.pendingWrites().length === 0, 'the parameter was written before the highlight rested');
});

step('⭐ once it rests, the sample parameter is written — the audition you can HEAR', () => {
    const st = openBrowse();
    shared.moveFilepathBrowserSelection(st, 1);
    shared.armFilepathPreview(st);
    B.clearWrites();
    shared.tickFilepathPreview(st, B.io, st.previewPendingTime + shared.FILEPATH_PREVIEW_DEBOUNCE_MS);
    const w = B.pendingWrites();
    assert(w.some((x) => x[2] === decl.key && x[3] === '/s/snare.wav'),
           'no audition write reached the engine: ' + JSON.stringify(w));
    assert(st.previewCurrentValue === '/s/snare.wav',
           'the audition did not record what it set — it would re-write on every tick');
});

step('⭐ BACK puts everything back: the sample AND the borrowed param', () => {
    const st = openBrowse();
    shared.moveFilepathBrowserSelection(st, 1);
    shared.armFilepathPreview(st);
    shared.tickFilepathPreview(st, B.io, st.previewPendingTime + 1000);
    B.clearWrites();
    B.leave();
    const w = B.pendingWrites();
    assert(w.some((x) => x[2] === decl.key && x[3] === '/s/kick.wav'),
           'the sample was left on the auditioned file after Back: ' + JSON.stringify(w));
    assert(w.some((x) => x[2] === 'ui_auto_select_pad' && x[3] === 'on'),
           'the borrowed param was not restored — pad auto-select stays suspended: ' + JSON.stringify(w));
    assert(B.state() === null, 'the browser state outlived the close');
});

step('⭐ a PICK stands — the close must not revert what the user chose', () => {
    /* ⚠ AUDITION FIRST. Without one the preview value never moves off the
     * original, so the cancel path has nothing to revert and this step passes
     * on a tree where the pick is not recorded at all — it did, until a
     * mutation said so. */
    const st = openBrowse();
    shared.moveFilepathBrowserSelection(st, 1);
    shared.armFilepathPreview(st);
    shared.tickFilepathPreview(st, B.io, st.previewPendingTime + 1000);
    st.selectedIndex = 2;
    B.activate();
    B.clearWrites();
    B.leave();
    const reverts = B.pendingWrites().filter((x) => x[2] === decl.key);
    assert(reverts.length === 0,
           'the close reverted the picked sample: ' + JSON.stringify(reverts));
    assert(B.pendingWrites().some((x) => x[2] === 'ui_auto_select_pad' && x[3] === 'on'),
           'the borrowed param was not restored after a pick');
});

step('closing twice does nothing the second time', () => {
    openBrowse();
    B.leave();
    B.clearWrites();
    B.leave();
    assert(B.pendingWrites().length === 0, 'a second close wrote again: ' + JSON.stringify(B.pendingWrites()));
});

/* ---- 4. a module that declares NEITHER is untouched --------------------- */
step('control: a plain filepath param auditions nothing and borrows nothing', () => {
    const plain = { key: 'ir_path', name: 'IR', type: 'filepath', root: '/data' };
    const cell = makeCell('ir_path', plain);
    assert(cell.filePreview === undefined && cell.fileHooks === null, 'the plain cell invented behaviour');
    B.clearWrites();
    B.open({ pkey: 'ir_path', key: 'ir_path', cell, raw: '/s/a.wav' });
    const st = B.state();
    st.items = LISTING.slice(); st.selectedIndex = 1;
    shared.moveFilepathBrowserSelection(st, 1);
    shared.armFilepathPreview(st);
    shared.tickFilepathPreview(st, B.io, Date.now() + 100000);
    B.leave();
    assert(B.pendingWrites().length === 0,
           'a param that asked for no preview was written anyway: ' + JSON.stringify(B.pendingWrites()));
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main();
