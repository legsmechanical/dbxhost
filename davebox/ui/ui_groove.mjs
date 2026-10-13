/* ui_groove.mjs — the global groove, as the UI holds it.
 *
 * The engine plays ONE groove for the whole project: Off, one of the two
 * built-in swings, or a table (dsp/seq8.c, groove_t). A table comes from a
 * groove the user made — kept as a small JSON file in GROOVE_DIR, beside the
 * MIDI exports, so it can be shared and backed up — and once loaded it is
 * saved inside the project, so the project does not need the file again.
 *
 * This module lists the choices, sends a chosen table to the engine, and makes
 * a new groove from a MIDI part or an Ableton .agr file (the reading itself is
 * ui_groove_core.mjs, which is pure).
 */
import * as os from 'os';
import { S } from './ui_state.mjs';
import { grooveFromJson, grooveToJson, grooveMessages, grooveCleanName } from './ui_groove_core.mjs';

export const GROOVE_DIR = '/data/UserData/dAVEBOx Grooves';
export const GROOVE_OFF = 0, GROOVE_SWING_16 = 1, GROOVE_SWING_8 = 2, GROOVE_TABLE = 3;
const BUILTIN = [
    { id: 'off',  kind: GROOVE_OFF,      label: 'Off' },
    { id: 'sw16', kind: GROOVE_SWING_16, label: 'Swing 1/16' },
    { id: 'sw8',  kind: GROOVE_SWING_8,  label: 'Swing 1/8' },
];

/* The user's grooves, by name, sorted. A folder that is not there is an empty
 * list, not an error. */
export function grooveUserNames() {
    let names = [];
    try {
        const out = os.readdir(GROOVE_DIR) || [];
        names = Array.isArray(out[0]) ? out[0] : (Array.isArray(out) ? out : []);
    } catch (e) { names = []; }
    return names.filter(n => typeof n === 'string' && n.toLowerCase().endsWith('.json') && n[0] !== '.')
                .map(n => n.slice(0, -5))
                .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
}

/* Every choice the Groove row offers, in order: Off, the swings, the user's
 * grooves — and, when the project plays a table whose file is not in the
 * folder (it came with the project), that table under its own name. */
export function grooveOptions() {
    const out = BUILTIN.map(b => ({ id: b.id, kind: b.kind, label: b.label }));
    const names = grooveUserNames();
    for (const n of names) out.push({ id: 'user:' + n, kind: GROOVE_TABLE, label: n, file: n });
    /* (also while a swing plays: the engine keeps the table, so going back
     * to it needs no file) */
    if (S.grooveName && !names.some(n => grooveCleanName(n) === S.grooveName))
        out.push({ id: 'proj', kind: GROOVE_TABLE, label: S.grooveName });
    return out;
}

/* Which option is playing. */
export function grooveCurrentIndex(opts) {
    if (S.grooveKind !== GROOVE_TABLE) {
        const i = opts.findIndex(o => o.kind === S.grooveKind && !o.file && o.id !== 'proj');
        return i < 0 ? 0 : i;
    }
    let i = opts.findIndex(o => o.file && grooveCleanName(o.file) === S.grooveName);
    if (i < 0) i = opts.findIndex(o => o.id === 'proj');
    return i < 0 ? 0 : i;
}

export function grooveLabel() {
    if (S.grooveKind === GROOVE_TABLE) return S.grooveName || 'Groove';
    const b = BUILTIN.find(x => x.kind === S.grooveKind);
    return b ? b.label : 'Off';
}

function readUserGroove(name) {
    let text = null;
    try { text = host_read_file(GROOVE_DIR + '/' + name + '.json'); } catch (e) { text = null; }
    if (!text) return { error: 'CAN\'T READ GROOVE' };
    const g = grooveFromJson(text);
    if (!g.error) g.name = grooveCleanName(name);
    return g;
}

/* Hand a table to the engine and select it. The amount is the engine's to
 * keep; the table brings its own Timing / Quantize / Random / Velocity. */
export function grooveSend(g) {
    for (const [k, v] of grooveMessages(g)) host_module_set_param(k, v);
    S.grooveKind = GROOVE_TABLE;
    S.grooveName = grooveCleanName(g.name);
    S.screenDirty = true;
}

/* Choose one of grooveOptions(). Returns an error string, or null. */
export function grooveSelect(opt) {
    if (!opt) return null;
    if (opt.kind !== GROOVE_TABLE) {
        S.grooveKind = opt.kind;
        host_module_set_param('groove_kind', String(opt.kind));
        S.screenDirty = true;
        return null;
    }
    if (opt.id === 'proj') {                 /* the project's own table: still in the engine */
        S.grooveKind = GROOVE_TABLE;
        host_module_set_param('groove_kind', String(GROOVE_TABLE));
        return null;
    }
    const g = readUserGroove(opt.file);
    if (g.error) return g.error;
    grooveSend(g);
    return null;
}

/* Keep a new groove in the folder (never over another: "Name 2", "Name 3"…)
 * and play it. Returns the name it was kept under, or null when the write
 * failed — the groove still plays, and is saved with the project. */
export function grooveKeep(g, wantName) {
    const base = grooveCleanName(wantName || g.name).replace(/\//g, '-');
    const taken = grooveUserNames().map(n => n.toLowerCase());
    let name = base;
    for (let i = 2; taken.indexOf(name.toLowerCase()) >= 0 && i < 100; i++) {
        const tail = ' ' + i;
        name = base.slice(0, 23 - tail.length).trim() + tail;
    }
    const kept = { ...g, name };
    let ok = false;
    try {
        host_ensure_dir(GROOVE_DIR);
        ok = !!host_write_file(GROOVE_DIR + '/' + name + '.json', grooveToJson(kept));
    } catch (e) { ok = false; }
    grooveSend(kept);
    return ok ? name : null;
}
