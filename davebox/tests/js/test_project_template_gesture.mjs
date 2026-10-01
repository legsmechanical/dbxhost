/* tests/js/test_project_template_gesture.mjs — the saved project template,
 * from the module's side, through the real gestures.
 *
 * Josh, 2026-09-30: Set as Template and Clear Template are rows in the PROJECT
 * menu; setting over a saved template warns first; creating a project asks
 * Empty or From template; a module the template uses that the device lacks
 * leaves that slot empty, with a notice. The copy itself (what a template
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
globalThis.host_system_cmd = (c) => {
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
    S.activeTrack = 0; S.trackActiveClip[2] = 0; S.trackAtMode[3] = 0; S.padLayoutChromatic[1] = false;
    S.clipProgram[4][0] = [-1, -1, -1]; S.clipProgram[4][6] = [-1, -1, -1];
});

step('the Project menu has Set as Template, and no Clear Template while there is none', () => {
    ready();
    listing.templates = [];
    menu.openGlobalMenu();
    const l = labels();
    assert(l.indexOf('Set as Template') === l.indexOf('Projects...') + 1, 'rows ' + J(l));
    assert(l.indexOf('Clear Template') < 0, 'Clear Template with no template');
    S.globalMenuOpen = false;
});

step('⭐ Set as Template (none saved): no question; the DSP save, then the chains, then the copy', () => {
    ready();
    listing.templates = [];
    LOG.length = 0;
    menu.openGlobalMenuAt('Set as Template');
    click();
    assert(!S.confirmTemplate, 'asked with nothing to overwrite');
    assert(popup() === 'SAVING / TEMPLATE', 'popup ' + popup());
    ticks(4);
    const iSave = LOG.indexOf('set save=1');
    const iChains = LOG.indexOf('chains saved');
    const iCopy = LOG.findIndex(l => / template-set default proj-uuid '/.test(l));
    assert(iSave >= 0 && iChains > iSave && iCopy > iChains, 'order: ' + J(LOG));
    const ui = JSON.parse(FILES['/data/UserData/dbx-host/templates/.incoming-ui.json'] || 'null');
    assert(ui && ui.v === 9 && Array.isArray(ui.am), 'the template sidecar was not written: ' + J(ui));
    assert(popup() === 'TEMPLATE / SET', 'popup ' + popup());
});

step('Set as Template over a saved one: REPLACE TEMPLATE?, No selected; No does nothing', () => {
    ready();
    listing.templates = [{ id: 'default', name: 'Template', source_name: 'Old' }];
    LOG.length = 0;
    menu.openGlobalMenuAt('Set as Template');
    click();
    assert(S.confirmTemplate && S.confirmTemplate.kind === 'replace' && S.confirmTemplate.sel === 1, J(S.confirmTemplate));
    click();                                   /* No */
    ticks(4);
    assert(!LOG.some(l => /template-set/.test(l)) && !S.pendingTemplateSet, 'No went ahead: ' + J(LOG));
});

step('…and Yes replaces it', () => {
    ready();
    LOG.length = 0;
    menu.openGlobalMenuAt('Set as Template');
    click(); jog(-1);                          /* to Yes */
    assert(S.confirmTemplate.sel === 0, 'sel ' + S.confirmTemplate.sel);
    click();
    ticks(4);
    assert(LOG.some(l => / template-set default proj-uuid /.test(l)), J(LOG));
});

step('Clear Template: shown while one is saved; asks; Yes clears', () => {
    ready();
    LOG.length = 0;
    menu.openGlobalMenu();
    assert(labels().indexOf('Clear Template') === labels().indexOf('Set as Template') + 1, 'rows ' + J(labels()));
    menu.openGlobalMenuAt('Clear Template');
    click();
    assert(S.confirmTemplate && S.confirmTemplate.kind === 'clear', J(S.confirmTemplate));
    jog(-1); click();
    assert(LOG.some(l => /template-clear default$/.test(l)), J(LOG));
    assert(popup() === 'TEMPLATE / CLEARED', 'popup ' + popup());
});

step('Back on the confirm closes it and does nothing', () => {
    ready();
    LOG.length = 0;
    menu.openGlobalMenuAt('Clear Template');
    click();
    cc(51, 127); cc(51, 0); ticks(1);
    assert(!S.confirmTemplate && !LOG.some(l => /template-/.test(l)), J(LOG));
    S.globalMenuOpen = false;
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

step('⭐ with a template → New asks Empty / Template, on Template; Template creates from it', () => {
    ready();
    listing.templates = [{ id: 'default', name: 'Template', source_name: 'Old' }];
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    dlg.projectPadPickerTap(4);
    const cn = S.projectPadPicker.confirmNew;
    assert(cn && cn.choose && cn.sel === 1, J(cn));
    dlg.projectPadPickerClick();
    const c = LOG.filter(l => /new-at 4/.test(l));
    assert(c.length === 1 && /DBX_TEMPLATE=default /.test(c[0]) && /DBX_HAVE_MODULES=|DBX_MISSING_OUT=/.test(c[0]), J(c));
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
    dlg.projectPadPickerClick();
    assert(LOG.some(l => /DBX_TEMPLATE=default .*new-at 6/.test(l)), J(LOG));
    const pad = S.pendingProjectSwitch && typeof S.pendingProjectSwitch === 'object' ? S.pendingProjectSwitch.pad : S.pendingProjectSwitch;
    assert(pad === 6, 'not loaded: ' + J(S.pendingProjectSwitch));
    S.shiftHeld = false;
});

step('⭐ a module the device lacks: the project is made, and the screen names what is missing', () => {
    ready();
    S.projectPadPicker = picker(); S.shiftHeld = false; LOG.length = 0;
    missingAnswer = J({ missing: ['obxd', 'jv880', 'virus'] });
    dlg.projectPadPickerTap(7);
    dlg.projectPadPickerClick();
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
    dlg.projectPadPickerClick();
    osStub.__setReaddir(null);
    const have = FILES['/data/UserData/dbx-host/templates/.have-modules.txt'];
    assert(have === 'obxd\nfreeverb\n', 'wrote ' + J(have));
    assert(LOG.some(l => /DBX_HAVE_MODULES='\/data\/UserData\/dbx-host\/templates\/\.have-modules\.txt'.*new-at 8/.test(l)), J(LOG));
});

if (failed) { console.log('FAIL: test_project_template_gesture'); process.exit(1); }
console.log('PASS: test_project_template_gesture');
}
main().catch(e => { console.error(e); process.exit(1); });
