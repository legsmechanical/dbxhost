/* ui_groove.mjs — the global groove, as the UI holds it.
 *
 * The engine plays ONE groove for the whole project: Off, one of the two
 * built-in swings, or a table (dsp/seq8.c, groove_t). A table is loaded
 * straight from a file — a MIDI file or an Ableton .agr — through Browse... in
 * the Groove picker, and from then on it is saved inside the project, so the
 * project does not need the file again.
 *
 * This module lists the picker's choices and sends a table to the engine (the
 * reading itself is ui_groove_core.mjs, which is pure).
 */
import { S } from './ui_state.mjs';
import { grooveMessages, grooveCleanName } from './ui_groove_core.mjs';

export const GROOVE_OFF = 0, GROOVE_SWING_16 = 1, GROOVE_SWING_8 = 2, GROOVE_TABLE = 3;
/* Every choice the Groove picker offers, in order: Off, Browse... (the file
 * list), the two swings — and, when the project carries a table, that table
 * under its own name (also while a swing plays: the engine keeps it, so going
 * back to it needs no file). */
export function grooveOptions() {
    const out = [
        { id: 'off',    kind: GROOVE_OFF,      label: 'Off' },
        { id: 'browse', kind: -1,              label: 'Browse...' },
        { id: 'sw16',   kind: GROOVE_SWING_16, label: 'Swing 1/16' },
        { id: 'sw8',    kind: GROOVE_SWING_8,  label: 'Swing 1/8' },
    ];
    if (S.grooveName) out.push({ id: 'proj', kind: GROOVE_TABLE, label: S.grooveName });
    return out;
}

/* Which option is playing. */
export function grooveCurrentIndex(opts) {
    const want = S.grooveKind === GROOVE_TABLE ? 'proj'
               : S.grooveKind === GROOVE_SWING_16 ? 'sw16' : S.grooveKind === GROOVE_SWING_8 ? 'sw8' : 'off';
    const i = opts.findIndex(o => o.id === want);
    return i < 0 ? 0 : i;
}

export function grooveLabel() {
    if (S.grooveKind === GROOVE_TABLE) return S.grooveName || 'Groove';
    return S.grooveKind === GROOVE_SWING_16 ? 'Swing 1/16' : S.grooveKind === GROOVE_SWING_8 ? 'Swing 1/8' : 'Off';
}

/* Hand a table to the engine and select it. The amount is the engine's to
 * keep; the table brings its own Timing / Quantize / Random / Velocity. */
export function grooveSend(g, trial) {
    for (const [k, v] of grooveMessages(g, trial)) host_module_set_param(k, v);
    S.grooveKind = GROOVE_TABLE;
    S.grooveName = grooveCleanName(g.name);
    /* a table brings its own amounts (the same clamps the pieces were sent with) */
    const pct = (v, d) => Math.max(0, Math.min(100, Math.round(v === undefined ? d : v)));
    S.grooveTiming = pct(g.timing, 100); S.grooveVelocity = pct(g.velocity, 0); S.grooveRandom = pct(g.random, 0);
    S.screenDirty = true;
}

/* Choose one of grooveOptions() — any but Browse..., which is a door, not a
 * groove (the menu opens the list). */
export function grooveSelect(opt) {
    if (!opt || opt.id === 'browse') return;
    S.grooveKind = opt.kind;
    host_module_set_param('groove_kind', String(opt.kind));
    S.screenDirty = true;
}
