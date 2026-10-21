/* tests/js/test_project_template_gesture.mjs — the saved project template,
 * from the module's side, through the real gestures.
 *
 * Josh, 2026-09-30: template rows in the PROJECT menu; creating a project
 * asks Empty or From template; a module the template uses that the device
 * lacks leaves that slot empty, with a notice. Josh, 2026-10-21: "multiple
 * templates and a template manager" — Save as Template... names a new one,
 * Templates... lists them (Rename / Replace with Current / Delete), and New's
 * Template opens a list of them; no default template. The copy itself (what a template
 * holds, how New uses it) is project_template.py's, tested in
 * tests/host/test_saved_project_template.sh.
 *
 * Also pinned here: the template SIDECAR. Every field writeSidecar writes is
 * either kept from the project or set to a fresh project's value — a field
 * left out would carry the previous project's value into the new one — and
 * the defaults are checked against a FRESH S. */
import './_bulk_get_stub.mjs';

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
globalThis.host_read_file = (p) => {
    p = String(p);
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
globalThis.host_file_exists = (p) => String(p) in FILES;
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
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

async function main() {
/* ⚠ FIRST, before anything runs: S is fresh only now. */
const { S } = await import('../../ui/ui_state.mjs');
const P = await import('../../ui/ui_persistence.mjs');
const FRESH = JSON.parse(J(P.sidecarObject()));

step('⭐ the template sidecar: every field is KEPT or set to a fresh project\'s value', () => {
    const all = Object.keys(FRESH).sort();
    const defaults = P.sidecarDefaults();
    const classified = P.TEMPLATE_SIDECAR_KEPT.concat(Object.keys(defaults)).sort();
    assert(J(all) === J(classified), 'unclassified: ' + J(all.filter(k => classified.indexOf(k) < 0)) +
           ' / classified but not written: ' + J(classified.filter(k => all.indexOf(k) < 0)));
    for (const k of Object.keys(defaults))
        assert(J(defaults[k]) === J(FRESH[k]), 'default ' + k + ' is ' + J(defaults[k]) + ', a fresh S writes ' + J(FRESH[k]));
});

await import('../../ui/ui.js');
const osStub = await import('os');
const menu = await import('../../ui/ui_menu.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
const te = await import('/data/UserData/schwung/shared/text_entry.mjs');
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (d) => cc(14, d > 0 ? 1 : 127);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; tickmod._tickImpl(); } };
const popup = () => (S.actionPopupLines || []).join(' / ');
const labels = () => (S.globalMenuItems || []).map(it => it && it.label).filter(Boolean);
function ready() {
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'proj-uuid';
    S.pendingSetLoad = false; S.pendingDspSync = 0; S.playing = false;
    S.projectPadPicker = null;
    S.templateManager = null; S.templateNameEntry = null; te.closeTextEntry();   /* nothing left over from a step before */
    if (!S.bankParams || !S.bankParams[0])
        S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
}

step('the sidecar a template carries: this project\'s kept fields, fresh values for the rest, clip A\'s program everywhere', () => {
    ready();
    S.activeTrack = 5; S.trackActiveClip[2] = 7; S.trackAtMode[3] = 2; S.padLayoutChromatic[1] = true;
    S.trackOctave[0] = 1; S.clipProgram[4][0] = [12, 1, 3]; S.clipProgram[4][6] = [99, 0, 0];
    const t = P.templateSidecar();
    assert(t.at === 0 && t.ac[2] === 0 && t.to[0] === FRESH.to[0], 'view/octave not reset: ' + J([t.at, t.ac[2], t.to[0]]));
    assert(t.am[3] === 2 && t.pchr[1] === 1, 'track config lost: ' + J([t.am[3], t.pchr[1]]));
    assert(t.cpg[4].every(c => J(c) === J([12, 1, 3])), 'program not spread from clip A: ' + J(t.cpg[4]));
    assert(t.sv === 1, 'a project from the template opens in Session View (as any new project), sv ' + t.sv);
    S.activeTrack = 0; S.trackActiveClip[2] = 0; S.trackAtMode[3] = 0; S.padLayoutChromatic[1] = false;
    S.clipProgram[4][0] = [-1, -1, -1]; S.clipProgram[4][6] = [-1, -1, -1];
});

/* What is ON SCREEN: every string drawn through the host font or the kit's,
 * from the real frame (drawUI), as the device composes it. */
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
let INK = [];
globalThis.print = (x, y, str) => { INK.push(String(str)); };
fonts.setKitTextTrace((t) => INK.push(t));
/* Kit list labels draw in capitals; compare without case. */
const screen = () => { INK = []; render.drawUI(); return INK.join(' | ').toUpperCase(); };
const back = () => { cc(51, 127); cc(51, 0); ticks(1); };
const keyboardConfirm = () => { for (let i = 0; i < 120; i++) jog(1); click(); };   /* the last key: Confirm */
const TPL = (id, name) => ({ id: id, name: name, source_name: 'x' });
const SAVE = 'Save as Template...', LIST = 'Templates...';
const menuAt = () => { const it = (S.globalMenuItems || [])[S.globalMenuState ? S.globalMenuState.selectedIndex : -1]; return it && it.label; };

step('the Project menu: Save as Template... after Projects...; no Templates... while there are none; no old rows', () => {
    ready();
    listing.templates = [];
    menu.openGlobalMenu();
    const l = labels();
    assert(l.indexOf(SAVE) === l.indexOf('Projects...') + 1, 'rows ' + J(l));
    assert(l.indexOf(LIST) < 0, 'Templates... with no templates');
    assert(l.indexOf('Set as Template') < 0 && l.indexOf('Clear Template') < 0, 'an old row: ' + J(l));
    S.globalMenuOpen = false;
});

step('⭐ Save as Template...: the keyboard, on the project\'s name; Confirm → the DSP save, the chains, then the copy, NAMED', () => {
    ready();
    listing.templates = [];
    S.currentSetName = "Josh's Kit";
    LOG.length = 0;
    menu.openGlobalMenuAt(SAVE);
    click(); ticks(1);
    assert(te.isTextEntryActive(), 'no keyboard');
    assert(te.getTextEntryBuffer() === "Josh's Kit", 'starts from ' + J(te.getTextEntryBuffer()));
    assert(!S.globalMenuOpen, 'the menu is still open under the keyboard');
    const sel0 = S.globalMenuState.selectedIndex;
    jog(1); ticks(1);
    assert(te.isTextEntryActive() && S.globalMenuState.selectedIndex === sel0, 'the jog reached the menu under the keyboard');
    keyboardConfirm();
    assert(!te.isTextEntryActive(), 'Confirm did not close the keyboard');
    assert(popup() === 'SAVING / TEMPLATE', 'popup ' + popup());
    ticks(4);
    const iSave = LOG.indexOf('set save=1');
    const iChains = LOG.indexOf('chains saved');
    const iCopy = LOG.findIndex(l => / template-set t[0-9a-z]+ proj-uuid '.*' \S+ 'Josh'\\''s Kit'$/.test(l));
    assert(iSave >= 0 && iChains > iSave && iCopy > iChains, 'order / quoting: ' + J(LOG));
    const ui = JSON.parse(FILES['/data/UserData/daveboxSA/templates/.incoming-ui.json'] || 'null');
    assert(ui && ui.v === 9 && Array.isArray(ui.am), 'the template sidecar was not written: ' + J(ui));
    assert(popup() === 'TEMPLATE / SAVED', 'popup ' + popup());
});

step('…a second save ADDS (a fresh id, never the first one\'s), and a name in use is refused', () => {
    ready();
    const first = /template-set (t[0-9a-z]+) /.exec(LOG.find(l => /template-set/.test(l)))[1];
    listing.templates = [TPL(first, "Josh's Kit")];
    S.currentSetName = 'Second';
    LOG.length = 0;
    menu.openGlobalMenuAt(SAVE); click(); ticks(1); keyboardConfirm(); ticks(4);
    const c = LOG.filter(l => /template-set/.test(l));
    assert(c.length === 1 && c[0].indexOf(' template-set ' + first + ' ') < 0 && /'Second'$/.test(c[0]), J(c));
    S.currentSetName = "josh's kit";                 /* case does not make it another name */
    LOG.length = 0;
    menu.openGlobalMenuAt(SAVE); click(); ticks(1); keyboardConfirm(); ticks(4);
    assert(!LOG.some(l => /template-set/.test(l)), 'saved over a taken name: ' + J(LOG));
    assert(popup() === 'NAME / TAKEN', 'popup ' + popup());
});

step('Save as Template... mid-load says NOT READY and opens no keyboard', () => {
    ready();
    S.pendingSetLoad = true;
    menu.openGlobalMenuAt(SAVE); click(); ticks(1);
    assert(!te.isTextEntryActive(), 'a keyboard while loading');
    assert(popup() === 'TEMPLATE / NOT READY', 'popup ' + popup());
    S.pendingSetLoad = false; S.globalMenuOpen = false;
});

step('Back on the keyboard: nothing saved, back on the Project menu at Save as Template...', () => {
    ready();
    listing.templates = [];
    LOG.length = 0;
    menu.openGlobalMenuAt(SAVE); click(); ticks(1);
    assert(te.isTextEntryActive(), 'rig: no keyboard');
    back(); ticks(8);
    assert(!te.isTextEntryActive(), 'Back did not close the keyboard');
    assert(!LOG.some(l => /template-set/.test(l)), J(LOG));
    assert(S.globalMenuOpen && menuAt() === SAVE, 'not back on the row: ' + menuAt());
});

step('⭐ Templates...: shown once there are any; the TEMPLATES screen lists them by name, cursor on the first', () => {
    ready();
    listing.templates = [TPL('ta', 'Alpha'), TPL('default', 'Template')];   /* the old one, as it lists */
    menu.openGlobalMenu();
    assert(labels().indexOf(LIST) === labels().indexOf(SAVE) + 1, 'rows ' + J(labels()));
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    assert(S.templateManager && !S.globalMenuOpen, 'the screen did not open');
    const sc = screen();
    assert(/TEMPLATES/.test(sc) && /ALPHA/.test(sc) && /TEMPLATE\b/.test(sc), 'on screen: ' + sc);
    assert(S.templateManager.sel === 0, 'cursor ' + S.templateManager.sel);
});

step('a template\'s menu: its name, Rename, Replace with Current, Delete; Back peels to the list, then the Project menu', () => {
    jog(1); click(); ticks(1);                         /* the old "Template" */
    const sc = screen();
    assert(/TEMPLATE/.test(sc) && /RENAME/.test(sc) && /REPLACE WITH CURRENT/.test(sc) && /DELETE/.test(sc), 'on screen: ' + sc);
    back();
    assert(S.templateManager && !S.templateManager.menu, 'Back did not peel to the list');
    back(); ticks(8);
    assert(!S.templateManager && S.globalMenuOpen && menuAt() === LIST, 'not back on Templates...: ' + menuAt());
});

step('⭐ Delete: DELETE TEMPLATE?, on No; No keeps it; Yes deletes THAT id (the legacy "default" too)', () => {
    ready();
    LOG.length = 0;
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    jog(1); click(); ticks(1);                         /* Template's menu */
    jog(1); jog(1); click(); ticks(1);                 /* Delete */
    assert(/DELETE TEMPLATE/.test(screen()), 'on screen: ' + screen());
    assert(S.templateManager.confirm.sel === 1, 'opens on Yes');
    click(); ticks(1);                                 /* No */
    assert(!LOG.some(l => /template-clear/.test(l)), 'No deleted: ' + J(LOG));
    assert(S.templateManager.menu && !S.templateManager.confirm, 'No did not return to the menu');
    click(); ticks(1); jog(-1); click(); ticks(1);     /* Delete → Yes */
    assert(LOG.some(l => / template-clear default$/.test(l)), J(LOG));
    assert(popup() === 'TEMPLATE / DELETED', 'popup ' + popup());
});

step('deleting the LAST one closes the screen: the Project menu, Templates... gone, cursor on Save as Template...', () => {
    ready();
    listing.templates = [TPL('ta', 'Alpha')];
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    click(); ticks(1); jog(1); jog(1); click(); ticks(1);
    listing.templates = [];                            /* what the script re-lists */
    jog(-1); click(); ticks(8);
    assert(!S.templateManager, 'the empty screen stayed');
    assert(S.globalMenuOpen && menuAt() === SAVE && labels().indexOf(LIST) < 0, 'menu ' + menuAt() + ' ' + J(labels()));
});

step('⭐ Rename: the keyboard on its name; Confirm renames THAT id, quoted; a taken name is refused', () => {
    ready();
    listing.templates = [TPL('ta', 'Alpha'), TPL('tb', 'Beta')];
    LOG.length = 0;
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    click(); ticks(1); click(); ticks(1);              /* Alpha → Rename */
    assert(te.isTextEntryActive() && te.getTextEntryBuffer() === 'Alpha', 'keyboard ' + te.getTextEntryBuffer());
    click(); ticks(1);                                 /* type a key */
    const typed = te.getTextEntryBuffer();
    keyboardConfirm();
    const r = LOG.filter(l => /template-rename/.test(l));
    assert(r.length === 1 && r[0].endsWith(" template-rename ta '" + typed + "'"), J(r));
    assert(popup() === 'TEMPLATE / RENAMED', 'popup ' + popup());
    assert(S.templateManager && S.templateManager.menu, 'not back on its menu');
    /* Beta + the same key would be a name another template has (any case). */
    const k = typed.slice(-1);
    listing.templates = [TPL('ta', typed), TPL('tb', 'Beta'), TPL('tc', ('Beta' + k).toUpperCase())];
    S.templateManager = null;
    LOG.length = 0;
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    jog(1); click(); ticks(1); click(); ticks(1);      /* Beta → Rename */
    assert(te.getTextEntryBuffer() === 'Beta', 'rig: keyboard ' + te.getTextEntryBuffer());
    click(); ticks(1); keyboardConfirm();
    assert(!LOG.some(l => /template-rename/.test(l)), 'renamed onto a taken name: ' + J(LOG));
    assert(popup() === 'NAME / TAKEN', 'popup ' + popup());
    LOG.length = 0;
    click(); ticks(1); keyboardConfirm();              /* Rename again, unchanged: nothing to do */
    assert(!LOG.some(l => /template-rename/.test(l)), 'renamed to its own name: ' + J(LOG));
});

step('⭐ Replace with Current: REPLACE TEMPLATE?, Yes → the save chain on THAT id, no name (it keeps its own)', () => {
    ready();
    listing.templates = [TPL('ta', 'Alpha'), TPL('tb', 'Beta')];
    LOG.length = 0;
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    jog(1); click(); ticks(1); jog(1); click(); ticks(1);        /* Beta → Replace with Current */
    assert(/REPLACE TEMPLATE/.test(screen()) && /BETA/.test(screen()), 'on screen: ' + screen());
    jog(-1); click(); ticks(6);
    const c = LOG.filter(l => /template-set/.test(l));
    assert(c.length === 1 && / template-set tb proj-uuid '[^']*' \S+$/.test(c[0]), J(c));
    assert(LOG.indexOf('set save=1') >= 0 && LOG.indexOf('set save=1') < LOG.indexOf(c[0]), 'no save first: ' + J(LOG));
    assert(!S.templateManager && S.globalMenuOpen && menuAt() === LIST, 'landed on ' + menuAt());
    S.globalMenuOpen = false;
});

step('Note/Session from TEMPLATES goes home: the screen closes, no menu', () => {
    ready();
    listing.templates = [TPL('ta', 'Alpha')];
    menu.openGlobalMenuAt(LIST); click(); ticks(1);
    cc(50, 127); cc(50, 0); ticks(8);
    assert(!S.templateManager && !S.globalMenuOpen, 'still up: ' + J([!!S.templateManager, S.globalMenuOpen]));
});

/* ---- New, in the picker ---- */
function picker() {
    return { projects: [], current: 0, byIndex: { 0: { uuid: 'a', name: 'A', index: 0, color: 2 } },
             touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1, menu: null, colorPick: null,
             confirmNew: null, renameActive: false, restarting: false };
}

step('control: no template → New asks Yes/No and creates an empty project', () => {
    ready();
    listing.templates = [];
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    dlg.projectPadPickerTap(3);
    assert(S.projectPadPicker.confirmNew && !S.projectPadPicker.confirmNew.choose, J(S.projectPadPicker.confirmNew));
    dlg.projectPadPickerClick();
    const c = LOG.filter(l => /new-at 3/.test(l));
    assert(c.length === 1 && !/DBX_TEMPLATE/.test(c[0]), J(c));
});

step('⭐ with templates → New asks Empty / Template, on Template; Template opens the list; a row creates from THAT one', () => {
    ready();
    listing.templates = [TPL('ta', 'Alpha'), TPL('default', 'Template')];
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    dlg.projectPadPickerTap(4);
    const cn = S.projectPadPicker.confirmNew;
    assert(cn && cn.choose && cn.sel === 1, J(cn));
    let sc = screen();
    assert(/EMPTY/.test(sc) && /TEMPLATE/.test(sc), 'on screen: ' + sc);
    dlg.projectPadPickerClick();
    assert(!LOG.some(l => /new-at/.test(l)), 'Template created without the list: ' + J(LOG));
    sc = screen();
    assert(/FROM TEMPLATE/.test(sc) && /ALPHA/.test(sc) && /TEMPLATE/.test(sc), 'on screen: ' + sc);
    assert(cn.pick && cn.pick.sel === 0, 'cursor ' + J(cn.pick));
    dlg.projectPadPickerBack();
    assert(!cn.pick && S.projectPadPicker.confirmNew === cn, 'Back did not return to Empty / Template');
    dlg.projectPadPickerClick();
    dlg.projectPadPickerRotate(1); dlg.projectPadPickerRotate(1);   /* stops on the last */
    assert(cn.pick.sel === 1, 'sel ' + cn.pick.sel);
    dlg.projectPadPickerClick();
    const c = LOG.filter(l => /new-at 4/.test(l));
    assert(c.length === 1 && /DBX_TEMPLATE=default /.test(c[0]) && /DBX_HAVE_MODULES=|DBX_MISSING_OUT=/.test(c[0]), J(c));
    assert(c[0].startsWith('cmd '), 'the host would refuse it: ' + c[0]);
    assert(S.projectPadPicker.byIndex[4], 'the project was not created (CREATE FAILED): ' + J(LOG));
});

step('…and Empty creates an empty one', () => {
    ready();
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    dlg.projectPadPickerTap(5);
    dlg.projectPadPickerRotate(-1);
    assert(S.projectPadPicker.confirmNew.sel === 0, 'sel ' + S.projectPadPicker.confirmNew.sel);
    dlg.projectPadPickerClick();
    const c = LOG.filter(l => /new-at 5/.test(l));
    assert(c.length === 1 && !/DBX_TEMPLATE/.test(c[0]), J(c));
});

step('Shift+tap on an empty pad asks too, then creates and loads', () => {
    ready();
    S.projectPadPicker = picker(); S.shiftHeld = true; LOG.length = 0; S.pendingProjectSwitch = null;
    dlg.projectPadPickerTap(6);
    assert(S.projectPadPicker.confirmNew && S.projectPadPicker.confirmNew.load && !LOG.some(l => /new-at/.test(l)),
           'Shift+tap created without asking: ' + J(LOG));
    dlg.projectPadPickerClick(); dlg.projectPadPickerClick();      /* Template → the first: Alpha */
    assert(LOG.some(l => /DBX_TEMPLATE=ta .*new-at 6/.test(l)), J(LOG));
    const pad = S.pendingProjectSwitch && typeof S.pendingProjectSwitch === 'object' ? S.pendingProjectSwitch.pad : S.pendingProjectSwitch;
    assert(pad === 6, 'not loaded: ' + J(S.pendingProjectSwitch));
    S.shiftHeld = false;
});

step('⭐ a module the device lacks: the project is made, and the screen names what is missing', () => {
    ready();
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    missingAnswer = J({ missing: ['obxd', 'jv880', 'virus'] });
    dlg.projectPadPickerTap(7);
    dlg.projectPadPickerClick(); dlg.projectPadPickerClick();
    missingAnswer = '';
    assert(S.projectPadPicker.byIndex[7], 'not created');
    assert(popup() === 'MODULES MISSING / obxd, jv880 +1 / Those slots are empty', 'popup ' + popup());
});

step('the installed modules are handed to the script: what the instrument and effect pickers list', () => {
    const M = '/data/UserData/schwung/modules';
    osStub.__setReaddir({ [M + '/sound_generators']: ['obxd'], [M + '/audio_fx']: ['freeverb'], [M + '/midi_fx']: [] });
    FILES[M + '/sound_generators/obxd/module.json'] = J({ id: 'obxd', component_type: 'sound_generator' });
    FILES[M + '/audio_fx/freeverb/module.json'] = J({ id: 'freeverb', component_type: 'audio_fx' });
    ready();
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    dlg.projectPadPickerTap(8);
    dlg.projectPadPickerClick(); dlg.projectPadPickerClick();
    osStub.__setReaddir(null);
    const have = FILES['/data/UserData/daveboxSA/templates/.have-modules.txt'];
    assert(have === 'obxd\nfreeverb\n', 'wrote ' + J(have));
    assert(LOG.some(l => /DBX_HAVE_MODULES='\/data\/UserData\/daveboxSA\/templates\/\.have-modules\.txt'.*new-at 8/.test(l)), J(LOG));
});

if (failed) { console.log('FAIL: test_project_template_gesture'); process.exit(1); }
console.log('PASS: test_project_template_gesture');
}
main().catch(e => { console.error(e); process.exit(1); });
