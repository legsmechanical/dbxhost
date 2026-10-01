/* ui_template.mjs — the saved project TEMPLATE, from the module's side.
 *
 * Josh, 2026-09-30: "Set a current project as template: new projects are based
 * off the project (which is snapshot at the time when that source project is
 * set as template - it doesn't track changes to the source project…), without
 * any of its sequences." Ruled the same day: Set as Template and Clear
 * Template are rows in the PROJECT menu (never a pad); setting over an existing
 * template warns first; creating a project asks Empty or From template; a
 * module the template uses that the device lacks leaves that slot empty, with a
 * notice. And: "the template must survive deleting the source project" — it is
 * a separate copy (project_template.py), which this file only asks for.
 *
 * One template today, id "default"; the storage and every command take an id,
 * so named templates would be a UI change here.
 *
 *   Set:   the menu row → (REPLACE TEMPLATE? if one exists) → saveState() →
 *          the tick sends the DSP save → next tick (ui_tick's save chain):
 *          engineSaveState() flushes the chains, the template sidecar is
 *          written, project-cmd.sh template-set copies it all.
 *   Clear: the menu row → CLEAR TEMPLATE? → project-cmd.sh template-clear.
 *   New:   the picker asks Empty / Template → createProject().
 */
import { S } from './ui_state.mjs';
import { saveState, templateSidecar, showActionPopup, showActionPopupFor, STATE_PREFIX } from './ui_persistence.mjs';
import { DAVEBOX_HOST_DIR, engineSaveState, engineListModules } from './ui_engine.mjs';

export const TEMPLATE_ID = 'default';
const PROJECT_CMD    = DAVEBOX_HOST_DIR + '/scripts/project-cmd.sh';
const PROJECTS_JSON  = DAVEBOX_HOST_DIR + '/projects.json';
const TEMPLATES_DIR  = DAVEBOX_HOST_DIR + '/templates';
/* Dot-names: project_template.py never lists them as templates. */
const INCOMING_UI    = TEMPLATES_DIR + '/.incoming-ui.json';
const HAVE_MODULES   = TEMPLATES_DIR + '/.have-modules.txt';
const MISSING_OUT    = TEMPLATES_DIR + '/.last-missing.json';

/* The saved templates, as the last project listing named them. The picker and
 * every template verb re-list, so this is current wherever it is asked. */
export function templatesKnown() {
    let d = null;
    try { d = JSON.parse(host_read_file(PROJECTS_JSON) || ''); } catch (e) { d = null; }
    return (d && Array.isArray(d.templates)) ? d.templates : [];
}
export function hasTemplate() { return templatesKnown().some(t => t && t.id === TEMPLATE_ID); }

/* ---- Set / Clear: the Project menu rows ---- */

export function requestSetTemplate() {
    if (hasTemplate()) { S.confirmTemplate = { kind: 'replace', sel: 1 }; S.screenDirty = true; return; }
    armTemplateSet();
}
export function requestClearTemplate() {
    S.confirmTemplate = { kind: 'clear', sel: 1 };
    S.screenDirty = true;
}
/* The confirm's jog-click (MIDI-handler context). sel 0 = Yes, as every
 * confirm here draws it. */
export function templateConfirmClick() {
    const c = S.confirmTemplate;
    S.confirmTemplate = null;
    S.screenDirty = true;
    if (!c || c.sel !== 0) return;
    if (c.kind === 'replace') { armTemplateSet(); return; }
    if (c.kind === 'clear') {
        const rc = host_system_cmd('sh ' + PROJECT_CMD + ' template-clear ' + TEMPLATE_ID);
        S.globalMenuOpen = false;
        showActionPopup(rc === 0 ? 'TEMPLATE' : 'CLEAR FAILED', rc === 0 ? 'CLEARED' : undefined);
    }
}
function armTemplateSet() {
    /* Mid-load, S is the previous project's and a save is refused: a template
     * taken now would be of the wrong project. */
    if (S.pendingSetLoad || S.pendingDspSync > 0 || !S.currentSetUuid) {
        showActionPopup('TEMPLATE', 'NOT READY');
        return;
    }
    S.globalMenuOpen = false;
    saveState();                      /* the sidecar now, the DSP save next tick */
    S.pendingTemplateSet = true;      /* the tick after that: runTemplateSet */
    showActionPopup('SAVING', 'TEMPLATE');
}
/* ui_tick's save chain, the tick after the DSP 'save' went out. */
export function runTemplateSet() {
    engineSaveState();                /* Schwung's chains, to disk */
    /* ⚠ The hand-off files live in templates/, which does not exist until the
     * first template is saved — and a write into a missing folder fails. */
    host_ensure_dir(TEMPLATES_DIR);
    if (!host_write_file(INCOMING_UI, JSON.stringify(templateSidecar()))) {
        showActionPopup('TEMPLATE', 'FAILED');
        return;
    }
    const rc = host_system_cmd('sh ' + PROJECT_CMD + ' template-set ' + TEMPLATE_ID + ' ' +
                               S.currentSetUuid + " '" + INCOMING_UI + "' " + STATE_PREFIX);
    showActionPopup('TEMPLATE', rc === 0 ? 'SET' : 'FAILED');
}

/* ---- New ---- */

/* The module ids this device can load: what the instrument and effect pickers
 * list (a sound generator's pack entries resolve by prefix, in the script). */
function writeHaveModules() {
    const ids = [];
    for (const comp of ['synth', 'fx1', 'midi_fx1'])
        for (const m of engineListModules(comp)) if (m && m.id && ids.indexOf(m.id) < 0) ids.push(m.id);
    host_ensure_dir(TEMPLATES_DIR);
    return ids.length > 0 && host_write_file(HAVE_MODULES, ids.join('\n') + '\n');
}

/* Create a project on picker pad k — empty (today's New), or from the
 * template. Returns the host's exit code. From the template, a module the
 * device lacks leaves its slot empty and is named on the screen. */
export function createProject(k, fromTemplate) {
    if (!fromTemplate) return host_system_cmd('sh ' + PROJECT_CMD + ' new-at ' + k);
    const have = writeHaveModules();
    host_system_cmd("rm -f '" + MISSING_OUT + "'");
    const rc = host_system_cmd('DBX_TEMPLATE=' + TEMPLATE_ID + ' DBX_STATE_PREFIX=' + STATE_PREFIX +
                               (have ? " DBX_HAVE_MODULES='" + HAVE_MODULES + "'" : '') +
                               " DBX_MISSING_OUT='" + MISSING_OUT + "'" +
                               ' sh ' + PROJECT_CMD + ' new-at ' + k);
    let missing = [];
    try {
        const j = JSON.parse(host_read_file(MISSING_OUT) || '');
        if (j && Array.isArray(j.missing)) missing = j.missing.filter(m => typeof m === 'string' && m);
    } catch (e) { /* no answer: nothing to report */ }
    if (missing.length) {
        const shown = missing.slice(0, 2).join(', ') + (missing.length > 2 ? ' +' + (missing.length - 2) : '');
        showActionPopupFor(4000, 'MODULES MISSING', shown, 'Those slots are empty');
    }
    return rc;
}
