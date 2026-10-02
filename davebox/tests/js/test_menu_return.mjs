import './_bulk_get_stub.mjs';
/* tests/js/test_menu_return.mjs — everything entered or done from the Project
 * menu returns to the Project menu, cursor on its row (Josh, 2026-10-01:
 * "anything i enter or do from the project menu should return me to the project
 * menu when i leave/it's done"). Loading a project lands in the project (ruled
 * 2026-10-02). Note/Session still goes home. Real gestures: the menu row's
 * click, Back, the jog click on a confirm, Note/Session. */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const J = JSON.stringify;

/* The host: commands in order (set_params too, so the save's order shows),
 * files written, and the project listing a test sets. */
const LOG = [];
const FILES = {};
let listing = { current: 0, projects: [{ uuid: 'a', name: 'A', index: 0, color: 2 }], templates: [] };
let missingAnswer = '';
/* As on the device (shadow_ui.c js_host_system_cmd): a command whose first
 * word is not an allowed verb is REFUSED with -1. "From Template" led with its
 * variables and was refused on the device while this stub ran it. */
const ALLOWED = ['tar ', 'cp ', 'mv ', 'mkdir ', 'rm ', 'ls ', 'test ', 'chmod ', 'sh '];
globalThis.host_system_cmd = (c) => {
    c = String(c);
    if (!ALLOWED.some(v => c.startsWith(v))) { LOG.push('REFUSED ' + c); return -1; }
    LOG.push('cmd ' + c);
    const m = /new-at (\d+)/.exec(c);
    if (m) listing.projects.push({ uuid: 'new' + m[1], name: 'NEW', index: Number(m[1]), color: 1 });
    return 0;
};
let SNAPIDX = null;
globalThis.host_read_file = (p) => {
    p = String(p);
    if (SNAPIDX && /-snap-index\.json$/.test(p)) return SNAPIDX;
    if (/projects\.json$/.test(p)) return J(listing);
    if (/\.last-missing\.json$/.test(p)) return missingAnswer;
    return FILES[p] !== undefined ? FILES[p] : '';
};
/* As on the device, a write into a folder that does not exist FAILS (the atomic
 * write opens "<path>.tmp" there). Only templates/ is modelled: it is the one
 * folder this feature brings into being — on a Move that has never saved a
 * template it is not there, and "Set as Template" said FAILED. */
const DIRS = new Set();
const parentOf = (p) => String(p).replace(/\/[^\/]+$/, '');
globalThis.host_write_file = (p, body) => {
    if (/\/templates$/.test(parentOf(p)) && !DIRS.has(parentOf(p))) return false;
    FILES[String(p)] = String(body); return true;
};
globalThis.host_file_exists = (p) => String(p) in FILES || (!!SNAPIDX && /-snap-index\.json$/.test(String(p)));
globalThis.host_ensure_dir = (d) => { DIRS.add(String(d).replace(/\/$/, '')); return true; };
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { LOG.push('set ' + k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.host_module_get_params = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_save_state_now = () => { LOG.push('chains saved'); return true; };
for (const fn of ['host_vol_block', 'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect',
                  'draw_line', 'set_pixel', 'flush_display', 'move_midi_internal_send', 'set_led',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_autosave_hold',
                  'pixel_print', 'move_midi_external_send', 'stipple_rect'])
    globalThis[fn] = () => 0;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_state_subdir = () => 'dAVEBOx';
let REG = null;
globalThis.host_register_primary = (o) => { REG = o; return true; };
globalThis.shadow_get_shift_held = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);


async function main() {
const { S } = await import('../../ui/ui_state.mjs');
await import('../../ui/ui.js');
const menu = await import('../../ui/ui_menu.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
const corun = await import('../../ui/ui_corun.mjs');
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; tickmod._tickImpl(); } };
const labels = () => (S.globalMenuItems || []).map(it => it && it.label).filter(Boolean);
const row = () => S.globalMenuOpen && S.globalMenuItems ? (S.globalMenuItems[S.globalMenuState.selectedIndex] || {}).label : null;
function ready() {
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'proj-uuid';
    S.pendingSetLoad = false; S.pendingDspSync = 0; S.playing = false;
    S.projectPadPicker = null; S.snapshotPicker = null; S.daveBox = null;
    S.confirmExit = null; S.confirmExitFromMenu = null; S.pendingMenuAt = null;
    S.globalMenuOpen = false;
    if (!S.bankParams || !S.bankParams[0])
        S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
}
function useRow(label) {
    menu.openGlobalMenuAt(label);
    assert(row() === label, 'rig: the menu is not on ' + label + ' (on ' + row() + ')');
    click();
}
const backInMenuAt = (label, what) => { ticks(3); assert(row() === label, what + ': not back in the Project menu on ' + label + ' (menu ' + S.globalMenuOpen + ', row ' + row() + ')'); };

step('⭐ Projects… then Back: back in the Project menu, on Projects…', () => {
    ready();
    useRow('Projects...');
    ticks(2);
    assert(S.projectPadPicker, 'rig: the picker did not open');
    back(); ticks(2);
    if (S.projectPadPicker) { back(); ticks(2); }
    backInMenuAt('Projects...', 'Projects… Back');
});

step('Projects… then LOAD a project: lands in the project, not the menu (ruled)', () => {
    ready();
    useRow('Projects...');
    ticks(2);
    const p = S.projectPadPicker;
    assert(p && p.fromMenu, 'rig: picker not marked as opened from the menu');
    p.fromMenu = false;   /* what _pppLoad does once a load is accepted */
    dlg.closeProjectPadPicker(); ticks(3);
    assert(!S.globalMenuOpen, 'the menu came back after a load');
});

step('Projects… then Note/Session (go home): the menu stays shut', () => {
    ready();
    useRow('Projects...');
    ticks(2);
    cc(50, 127); cc(50, 0); ticks(3);
    assert(!S.globalMenuOpen, 'go-home reopened the Project menu');
});

step('Quit → No: back on Quit; and Back (= No) too', () => {
    ready();
    useRow('Quit');
    assert(S.confirmExit === 'quit' && !S.globalMenuOpen, 'rig: no exit confirm');
    click();                                   /* sel 1 = No */
    backInMenuAt('Quit', 'Quit No');
    S.globalMenuOpen = false;
    useRow('Suspend session');
    back();
    backInMenuAt('Suspend session', 'Suspend Back');
});

step('Load state with no snapshots: the menu stays, with the notice', () => {
    ready();
    useRow('Load state');
    ticks(1);
    assert(S.globalMenuOpen && row() === 'Load state', 'the menu closed on NO SNAPSHOTS');
});

step('Export while playing: the menu stays, with the notice', () => {
    ready();
    S.playing = true;
    useRow('Export to Ableton');
    ticks(1);
    assert(S.globalMenuOpen, 'the menu closed on STOP TRANSPORT');
    S.playing = false;
});

step('Clear Sess → Yes: the project reloads, then the Project menu is back on Clear Sess', () => {
    ready();
    useRow('Clear Sess');
    assert(S.confirmClearSession, 'rig: no clear confirm');
    jog(-1);                                   /* to Yes */
    click();
    assert(!S.globalMenuOpen, 'rig: the clear did not start');
    ticks(12);
    backInMenuAt('Clear Sess', 'Clear Sess');
});

step('Open Your Dave Box → Back: on its row', () => {
    ready();
    FILES['/data/UserData/dbx-host/daves-seen.txt'] = '1\n2\n';   /* an album with Daves in it */
    useRow('Open Your Dave Box');
    ticks(1);
    assert(S.daveBox, 'rig: the Dave Box did not open');
    back();
    backInMenuAt('Open Your Dave Box', 'Dave Box Back');
});

step('Host Settings… closes → on its row', () => {
    ready();
    corun.initPrimarySurface();
    assert(REG && typeof REG.onServiceReturn === 'function', 'rig: no service-return hook');
    useRow('Host Settings...');
    assert(!S.globalMenuOpen, 'rig: the menu stayed open under the service');
    REG.onServiceReturn('global_settings');
    backInMenuAt('Host Settings...', 'Host Settings close');
});

step('Load state with snapshots → Back: on Load state', () => {
    ready();
    SNAPIDX = J({ snaps: [{ id: '1', sv: 36, label: 'x' }] });   /* STATE_VERSION */
    useRow('Load state');
    ticks(1);
    assert(S.snapshotPicker, 'rig: the snapshot picker did not open');
    back();
    backInMenuAt('Load state', 'Load state Back');
    SNAPIDX = null;
});

step('Set as Template (none saved): back in the menu on Set as Template, Clear Template now listed', () => {
    ready();
    listing.templates = [];
    useRow('Set as Template');
    listing.templates = [{ id: 'default', name: 'Template', source_name: 'x' }];
    ticks(6);
    backInMenuAt('Set as Template', 'Set as Template');
    assert(labels().indexOf('Clear Template') >= 0, 'the menu was not rebuilt: ' + J(labels()));
});

step('Clear Template → Yes: back on Set as Template (the Clear row is gone)', () => {
    ready();
    listing.templates = [{ id: 'default', name: 'Template', source_name: 'x' }];
    useRow('Clear Template');
    assert(S.confirmTemplate, 'rig: no clear confirm');
    jog(-1); click();
    listing.templates = [];
    backInMenuAt('Set as Template', 'Clear Template');
    assert(labels().indexOf('Clear Template') < 0, 'Clear Template still listed');
});

if (failed) { console.log('FAIL: test_menu_return'); process.exit(1); }
console.log('PASS: test_menu_return');
}
main().catch(e => { console.error(e); process.exit(1); });
