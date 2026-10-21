/* ui_template.mjs — saved project TEMPLATES, from the module's side.
 *
 * Josh, 2026-09-30: "Set a current project as template: new projects are based
 * off the project (which is snapshot at the time when that source project is
 * set as template - it doesn't track changes to the source project…), without
 * any of its sequences." And: "the template must survive deleting the source
 * project" — each one is a separate copy (project_template.py), which this
 * file only asks for. A module a template uses that the device lacks leaves
 * that slot empty, with a notice.
 *
 * Josh, 2026-10-21: "multiple templates and a template manager". Ruled the
 * same day: the Project menu's row is "Save as Template..." (it always ADDS a
 * named template); "Templates..." (shown while any exist) lists them, each
 * with Rename / Replace with Current / Delete; New still asks Empty /
 * Template, and Template opens a list of them; there is no default template.
 * A device's one template from before (id "default") lists as "Template".
 * The screens are in ui_dialogs.mjs; this file is the storage side.
 *
 *   Save:    the keyboard's name → armTemplateSet → saveState() → the tick
 *            sends the DSP save → next tick (ui_tick's save chain):
 *            runTemplateSet — engineSaveState() flushes the chains, the
 *            template sidecar is written, project-cmd.sh template-set copies
 *            it all. Replace is the same chain on an existing id, no name.
 *   Delete:  project-cmd.sh template-clear <id>.  Rename: template-rename.
 *   New:     the picker's Empty / Template → createProject(k, id).
 */
import { S } from './ui_state.mjs';
import { saveState, templateSidecar, showActionPopup, showActionPopupFor, STATE_PREFIX } from './ui_persistence.mjs';
import { DAVEBOX_HOST_DIR, engineSaveState, engineListModules } from './ui_engine.mjs';

const PROJECT_CMD    = DAVEBOX_HOST_DIR + '/scripts/project-cmd.sh';
const PROJECTS_JSON  = DAVEBOX_HOST_DIR + '/projects.json';
const TEMPLATES_DIR  = DAVEBOX_HOST_DIR + '/templates';
/* Dot-names: project_template.py never lists them as templates. */
const INCOMING_UI    = TEMPLATES_DIR + '/.incoming-ui.json';
const HAVE_MODULES   = TEMPLATES_DIR + '/.have-modules.txt';
const MISSING_OUT    = TEMPLATES_DIR + '/.last-missing.json';
/* The script's id charset (project_template.py _tdir). An id also rides
 * inside an `sh -c "…"` string unquoted (createProject), so nothing else may
 * ever reach the shell as one. */
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export const SAVE_ROW = 'Save as Template...';
export const LIST_ROW = 'Templates...';

/* The saved templates, by name, as the last project listing named them. Every
 * verb below re-lists (project-cmd.sh runs do_list after each), so this is
 * current wherever it is asked. */
export function templatesKnown() {
    let d = null;
    try { d = JSON.parse(host_read_file(PROJECTS_JSON) || ''); } catch (e) { d = null; }
    return (d && Array.isArray(d.templates))
        ? d.templates.filter(t => t && typeof t.id === 'string' && ID_RE.test(t.id)) : [];
}
export function anyTemplates() { return templatesKnown().length > 0; }

/* One line, spaces folded — what project_template.py stores. */
export function cleanTemplateName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 64);
}
export function templateNameTaken(name, exceptId) {
    const n = cleanTemplateName(name).toLowerCase();
    return templatesKnown().some(t => t.id !== exceptId && String(t.name || '').toLowerCase() === n);
}
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

/* Mid-load, S is the previous project's and a save is refused: a template
 * taken now would be of the wrong project. */
export function templateSaveReady() {
    return !(S.pendingSetLoad || S.pendingDspSync > 0 || !S.currentSetUuid);
}

/* target: { id, name } — a name makes a new template; name null replaces the
 * template `id` and keeps its name. `back` is the screen the result lands on. */
export function armTemplateSet(target) {
    if (!templateSaveReady()) { showActionPopup('TEMPLATE', 'NOT READY'); return false; }
    if (!target || !ID_RE.test(target.id || '')) return false;
    saveState();                         /* the sidecar now, the DSP save next tick */
    S.pendingTemplateSet = target;       /* the tick after that: runTemplateSet */
    showActionPopup('SAVING', 'TEMPLATE');
    return true;
}
export function newTemplateId() {
    let id = 't' + Date.now().toString(36);
    const ids = templatesKnown().map(t => t.id);
    for (let n = 2; ids.indexOf(id) >= 0; n++) id = 't' + Date.now().toString(36) + n;
    return id;
}
/* ui_tick's save chain, the tick after the DSP 'save' went out. */
export function runTemplateSet() {
    const t = S.pendingTemplateSet;
    S.pendingTemplateSet = null;
    if (!t) return;
    engineSaveState();                /* Schwung's chains, to disk */
    /* ⚠ The hand-off files live in templates/, which does not exist until the
     * first template is saved — and a write into a missing folder fails. */
    host_ensure_dir(TEMPLATES_DIR);
    let rc = -1;
    if (host_write_file(INCOMING_UI, JSON.stringify(templateSidecar())))
        rc = host_system_cmd('sh ' + PROJECT_CMD + ' template-set ' + t.id + ' ' +
                             S.currentSetUuid + " '" + INCOMING_UI + "' " + STATE_PREFIX +
                             (t.name ? ' ' + shq(cleanTemplateName(t.name)) : ''));
    showActionPopup('TEMPLATE', rc === 0 ? 'SAVED' : 'FAILED');
    /* Back to the Project menu, rebuilt (Templates... shows once one exists). */
    S.pendingMenuAt = t.name ? SAVE_ROW : LIST_ROW;
}

export function deleteTemplate(id) {
    if (!ID_RE.test(id || '')) return false;
    return host_system_cmd('sh ' + PROJECT_CMD + ' template-clear ' + id) === 0;
}
export function renameTemplate(id, name) {
    const n = cleanTemplateName(name);
    if (!ID_RE.test(id || '') || !n) return false;
    return host_system_cmd('sh ' + PROJECT_CMD + ' template-rename ' + id + ' ' + shq(n)) === 0;
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

/* Create a project on picker pad k — empty (today's New), or from template
 * `templateId`. Returns the host's exit code. From a template, a module the
 * device lacks leaves its slot empty and is named on the screen. */
export function createProject(k, templateId) {
    if (!templateId || !ID_RE.test(templateId)) return host_system_cmd('sh ' + PROJECT_CMD + ' new-at ' + k);
    const have = writeHaveModules();
    host_system_cmd("rm -f '" + MISSING_OUT + "'");
    /* ⚠ host_system_cmd runs only a command whose FIRST WORD is an allowed
     * verb (shadow_ui.c: sh, cp, rm, …) and refuses the rest — so the
     * variables cannot lead; they go inside an `sh -c`. */
    const rc = host_system_cmd('sh -c "DBX_TEMPLATE=' + templateId + ' DBX_STATE_PREFIX=' + STATE_PREFIX +
                               (have ? " DBX_HAVE_MODULES='" + HAVE_MODULES + "'" : '') +
                               " DBX_MISSING_OUT='" + MISSING_OUT + "'" +
                               ' sh ' + PROJECT_CMD + ' new-at ' + k + '"');
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
