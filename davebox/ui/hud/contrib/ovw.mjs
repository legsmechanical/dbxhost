/* ovw.mjs — what the SESSION overview shows on a big screen that its OLED
 * cannot: the current knob mode's eight values at rest (the very cells the
 * mixer page draws when a knob is touched, sessMixerCells), and every clip's
 * pattern in brief — 16 bins over the clip, one bit each — for the clip grid.
 * The thumbnails are recomputed at most once a second: a clip's steps change
 * at editing speed, and 128 clips x 256 steps is not work for every frame.
 * Drum clips keep their steps per lane and only for the clip on screen, so a
 * drum track's clips carry no thumbnail (the grid still shows which exist).
 * Cycled imports are read only inside collect(). */
import { S } from '../../ui_state.mjs';
import { SESS_KNOB_MODES } from '../../ui_engine.mjs';
import { sessMixerCells } from '../../ui_render.mjs';
import { cellOut } from './layer.mjs';

const THUMB_MS = 1000;
let thumbAt = -1e9, thumbCache = null;
function thumbs() {
    const now = Date.now();
    if (thumbCache && now - thumbAt < THUMB_MS) return thumbCache;
    thumbAt = now;
    const out = [];
    for (let t = 0; t < 8; t++) {
        if (S.trackPadMode[t] === 1 || S.trackPadMode[t] === 3) { out.push(null); continue; }   /* drum: steps per lane; Audio: a sample, no steps */
        const row = [];
        for (let c = 0; c < 16; c++) {
            const st = S.clipSteps[t] && S.clipSteps[t][c];
            if (!st || !S.clipNonEmpty[t][c]) { row.push(0); continue; }
            const len = Math.max(1, Math.min(256, S.clipLength[t][c] | 0));
            let bits = 0;
            for (let s = 0; s < len; s++) if (st[s] && st[s] !== '0') bits |= 1 << Math.min(15, Math.floor(s * 16 / len));
            row.push(bits);
        }
        out.push(row);
    }
    thumbCache = out;
    return out;
}

/* Every clip's state in the terms the session pads light it (ui_leds.mjs,
 * the session grid): which clips hold anything, which one plays, which one is
 * queued. The editor's snapshot cannot stand in for this — a clip launched
 * while the transport is stopped is queued only here, and an Audio clip's
 * content is its sample, which the snapshot does not carry. */
function clips() {
    const out = [];
    for (let t = 0; t < 8; t++) {
        const drum = S.trackPadMode[t] === 1;
        let has = 0;
        for (let c = 0; c < 16; c++) if (drum ? S.drumClipNonEmpty[t][c] : S.clipNonEmpty[t][c]) has |= 1 << c;
        out.push({ has, ac: S.trackActiveClip[t] | 0, pl: S.trackClipPlaying[t] ? 1 : 0,
                   q: S.trackQueuedClip[t] >= 0 ? S.trackQueuedClip[t] | 0 : -1, rl: S.trackWillRelaunch[t] ? 1 : 0 });
    }
    return out;
}

export const ovw = {
    key: 'ovw',
    collect: (frame) => {
        if (frame.screen !== 'session.overview') return null;
        const mode = SESS_KNOB_MODES[S.sessKnobMode] || SESS_KNOB_MODES[0];
        return { mode: mode.label, modes: SESS_KNOB_MODES.slice(0, 4).map((m) => m.label),
                 modeIdx: S.sessKnobMode | 0, rowOff: S.sceneRow | 0, cells: sessMixerCells(mode).map(cellOut), thumbs: thumbs(), clips: clips() };
    },
};
