/* ui_audio_convert.mjs — CONVERT TO AUDIO, RESAMPLING THE CLIPS.
 *
 * Josh, 2026-10-26: "changing an instrument track to audio asks whether you
 * want to resample the clips there and loads the resulting clips in the
 * corresponding slots as audio clips" · capture: "Instrument before effects."
 * · "It becomes a Loop-mode audio clip, and its notes are replaced".
 *
 * Mode -> Audio on a track that plays an instrument and has clips asks
 * RESAMPLE CLIPS? Yes records every clip with content, one after another, in
 * real time, each ALONE (the clip-resample engine, resample_clip): a Schwung
 * instrument before its FX (src 2, the slot's instrument output — its FX stay
 * live on the Audio track, so it sounds the same), a Move instrument as heard
 * (src 0; Move's track effects do not carry over). Each take is written
 * straight into the project's samples/ folder. When every take is in, the
 * track converts (drums, Audio, the instrument removed, FX kept) and each
 * clip loads its take as a Loop clip, its notes wiped. No answers the plain
 * conversion (the notes become lanes). Back on the question cancels; Back
 * while recording cancels the whole conversion (what was recorded is
 * removed, nothing converts).
 *
 * The surface is held as for any resample (ui_resample resampleModalCC reads
 * S.resampleTake, which this sets with `convert: true` so resampleTick leaves
 * it to auConvertTick). */

import * as os from 'os';
import { S } from './ui_state.mjs';
import { NUM_CLIPS, SCENE_LETTERS, PAD_MODE_DRUM } from './ui_constants.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { sanitizeName } from './ui_export.mjs';
import { nowMs } from './ui_clock.mjs';

const RS_IDLE = 0, RS_ARMED = 1, RS_STARTING = 2, RS_RECORDING = 3,
      RS_DONE = 4, RS_CANCELLED = 5, RS_FAILED = 6;
export const AU_SRC_PRE = 2;      /* the slot's instrument, before its FX */

function clipHasNotes(t, c) {
    return S.trackPadMode[t] === PAD_MODE_DRUM ? !!S.drumClipNonEmpty[t][c] : !!S.clipNonEmpty[t][c];
}

/* Should Mode -> Audio ask? A track that plays an instrument (a Schwung one
 * loaded, or a Move one) and has a clip with notes. `hasSynth` is the
 * caller's read of the slot. */
export function auConvertOffered(t, hasSynth) {
    const plays = S.trackRoute[t] === 1 || (S.trackRoute[t] === 0 && hasSynth);
    if (!plays) return false;
    for (let c = 0; c < NUM_CLIPS; c++) if (clipHasNotes(t, c)) return true;
    return false;
}

function sampling() {
    try { return !!host_sampler_is_recording(); } catch (e) { return false; }
}

/* Tick context (reads the clips' lengths and the project folder). */
export function auConvertStart(t) {
    const dir = String(host_module_get_param('t' + t + '_au_dir') || '');
    if (!dir) { showActionPopupFor(2500, 'NOT RESAMPLED', 'No project'); return false; }
    const list = [];
    const bpm = (S.bpmMirror > 0 && isFinite(S.bpmMirror)) ? Math.round(S.bpmMirror) : 120;
    const proj = sanitizeName(S.currentSetName || 'Project');
    for (let c = 0; c < NUM_CLIPS; c++) {
        if (!clipHasNotes(t, c)) continue;
        const bars = parseInt(host_module_get_param('resample_bars_t' + t + '_c' + c), 10) | 0;
        if (bars <= 0) continue;
        const base = proj + ' ' + (t + 1) + SCENE_LETTERS[c] + ' ' + bars + 'bar ' + bpm + 'bpm';
        let path = null;
        for (let n = 1; n <= 99 && !path; n++) {
            const p = dir + '/' + base + (n > 1 ? ' ' + n : '') + '.wav';
            const [st] = os.stat(p);
            if (!st) path = p;
        }
        if (path) list.push({ c, bars, path, ok: false });
    }
    if (!list.length) { showActionPopupFor(2500, 'NOTHING TO RESAMPLE'); return false; }
    const src = S.trackRoute[t] === 1 ? 0 : AU_SRC_PRE;
    S.auConvert = { t, list, i: 0, src, phase: 'send', at: 0, seen: false, stopSent: false };
    S.resampleTake = { convert: true };
    return true;
}

function status(cv, line2) {
    showActionPopupFor(60000, 'TO AUDIO ' + (cv.i + 1) + '/' + cv.list.length,
                      (cv.t + 1) + SCENE_LETTERS[cv.list[cv.i].c] + (line2 ? ', ' + line2 : ''), 'Back cancels');
}

function abort(cv, ...lines) {
    for (const e of cv.list) { try { os.remove(e.path); } catch (er) { /* never written */ } }
    S.pendingDefaultSetParams.push({ key: 'resample_clear', val: '1' });
    S.auConvert = null;
    S.resampleTake = null;
    showActionPopupFor(2500, ...lines);
}

/* Every tick while a conversion records. */
export function auConvertTick() {
    if (applyTick()) return;
    const cv = S.auConvert;
    if (!cv) return;
    const e = cv.list[cv.i];
    const st = S.resampleState | 0;
    if (cv.phase === 'send') {
        /* The previous take's clear must have landed (the engine is idle). */
        if (st !== RS_IDLE || sampling()) return;
        S.pendingDefaultSetParams.push({ key: 'resample_clip',
            val: cv.t + ' ' + e.c + ' ' + e.bars + ' 0 0 ' + cv.src + ' |' + e.path });
        cv.phase = 'run'; cv.at = nowMs(); cv.seen = false; cv.stopSent = false; cv.shown = -1;
        status(cv, 'starting');
        return;
    }
    if (cv.phase !== 'run') return;
    if (st === RS_IDLE) {
        if (!cv.seen && nowMs() - cv.at > 3000) abort(cv, 'NOT RESAMPLED', 'No response');
        return;
    }
    cv.seen = true;
    if (st === RS_ARMED || st === RS_STARTING) return;
    if (st === RS_RECORDING) {
        const frames = S.resampleFrames >>> 0, done = S.resampleDone >>> 0;
        if (frames) {
            const bar = Math.min(e.bars, Math.floor(done * e.bars / frames) + 1);
            if (bar !== cv.shown) { cv.shown = bar; status(cv, 'bar ' + bar + '/' + e.bars); }
        }
        return;
    }
    if (st === RS_DONE) {
        if (!cv.stopSent) { cv.stopSent = true; S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' }); }
        if (sampling()) return;
        const [s] = os.stat(e.path);
        if (!s) { abort(cv, 'NOT RESAMPLED', 'A take was not saved'); return; }
        e.ok = true;
        S.pendingDefaultSetParams.push({ key: 'resample_clear', val: '1' });
        cv.i++;
        if (cv.i < cv.list.length) { cv.phase = 'send'; return; }
        /* Every take is in: convert, then each clip takes its recording. */
        S.resampleTake = null;
        S.auConvert = null;
        S.pendingTrackConvert = { t: cv.t, toDrum: true, toAudio: true,
                                  takes: cv.list.map((x) => ({ c: x.c, path: x.path })) };
        showActionPopupFor(2500, 'TO AUDIO', cv.list.length + ' clip' + (cv.list.length === 1 ? '' : 's') + ' resampled');
        return;
    }
    if (st === RS_CANCELLED) {
        if (sampling()) return;
        abort(cv, 'NOT CONVERTED', 'Cancelled');
        return;
    }
    if (st === RS_FAILED) {
        if (S.playing) S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
        abort(cv, 'NOT RESAMPLED', 'Could not record');
    }
}

/* After the conversion (tick, from pendingTrackConvert): each clip loads its
 * take, its notes go. The take is already in samples/, so the pick takes it
 * as it is (no copy). ONE CLIP PER TICK: every clip writes the same two keys,
 * and one key written twice before it drains keeps only the second. */
export function auConvertApply(t, takes) {
    S.auApply = { t, takes: takes.slice(), i: 0 };
}
function applyTick() {
    const a = S.auApply;
    if (!a) return false;
    if (a.i >= a.takes.length) { S.auApply = null; S.pendingDrumResync = 2; S.screenDirty = true; return true; }
    const k = a.takes[a.i++];
    host_module_set_param('t' + a.t + '_au_wipe', String(k.c));
    host_module_set_param('t' + a.t + '_au_pick', k.c + '|' + k.path);
    return true;
}
