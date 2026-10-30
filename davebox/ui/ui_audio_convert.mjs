/* ui_audio_convert.mjs — PICK AUDIO, RESAMPLING THE CLIPS FIRST.
 *
 * Josh, 2026-10-26: "changing an instrument track to audio asks whether you
 * want to resample the clips there and loads the resulting clips in the
 * corresponding slots as audio clips" · capture: "Instrument before effects."
 * · "It becomes a Loop-mode audio clip, and its notes are replaced".
 *
 * Audio picked in Instmt/Dest on a track that plays an instrument and has
 * clips asks RESAMPLE THE CLIPS? Yes records every clip with notes, one after another, in
 * real time, each ALONE (the clip-resample engine, resample_clip): a Schwung
 * instrument before its FX (src 2, the slot's instrument output — its FX stay
 * live on the Audio track, so it sounds the same), a Move instrument as heard
 * (src 0; Move's track effects do not carry over). Each take is written
 * straight into the project's samples/ folder. When every take is in, the
 * track converts (Audio, its notes cleared, the instrument removed, FX kept)
 * and each clip loads its take as a Loop clip. No answers the plain
 * conversion (the notes are cleared — Q2). Back on the question cancels; Back
 * while recording cancels the whole conversion (what was recorded is
 * removed, nothing converts).
 *
 * The surface is held as for any resample (ui_resample resampleModalCC reads
 * S.resampleTake, which this sets with `convert: true` so resampleTick leaves
 * it to auConvertTick). */

import * as os from 'os';
import { S } from './ui_state.mjs';
import { NUM_CLIPS, SCENE_LETTERS, PAD_MODE_DRUM, PAD_MODE_AUDIO } from './ui_constants.mjs';
import { clipHasContent } from './ui_pure.mjs';
import { hardResetClip } from './ui_editops.mjs';
import { auPick } from './ui_audio.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { sanitizeName } from './ui_export.mjs';
import { nowMs } from './ui_clock.mjs';
import { engineLoadedModule, engineSet, slotIndex } from './ui_engine.mjs';
/* a cycle (ui_sound imports this module): used only inside a function body */
import { soundTrackTypeChanged } from './ui_sound.mjs';

const RS_IDLE = 0, RS_ARMED = 1, RS_STARTING = 2, RS_RECORDING = 3,
      RS_DONE = 4, RS_CANCELLED = 5, RS_FAILED = 6;
export const AU_SRC_WET = 0;      /* the mix: a Move instrument as heard */
export const AU_SRC_DRY = 1;      /* one slot's own output, through its FX */
export const AU_SRC_PRE = 2;      /* the slot's instrument, before its FX */

/* A clip that sounds: one with notes, or an Audio clip with a sample (a Loop
 * clip has no steps and still plays). */
function clipHasNotes(t, c) {
    if (S.trackPadMode[t] === PAD_MODE_AUDIO) return clipHasContent(t, c);
    return S.trackPadMode[t] === PAD_MODE_DRUM ? !!S.drumClipNonEmpty[t][c] : !!S.clipNonEmpty[t][c];
}

/* What a take of track t records (resample_clip's src), or -1 when it plays
 * nothing that can be recorded. A Schwung instrument: before its FX (`post`
 * false — they stay on the Audio track and go on sounding) or through them
 * (Dry). A MIDI track that follows another: that track's instrument, the same
 * two ways. A Move instrument: as heard, either way (Move's own effects do
 * not carry over). External MIDI: -1. `hasSynth` is the caller's read of t's
 * own slot. */
export function auConvertSource(t, hasSynth, post) {
    /* an Audio track: its clips' samples, fed to its own slot */
    if (S.trackPadMode[t] === PAD_MODE_AUDIO) return post ? AU_SRC_DRY : AU_SRC_PRE;
    let r = S.trackRoute[t] | 0;
    if (r === 0 && !hasSynth) return -1;
    if (r === 2) {
        const to = S.trackMidiTo[t] | 0;
        if (to <= 0) return -1;
        r = S.trackRoute[to - 1] | 0;
        if (r === 2) return -1;
    }
    if (r === 1) return AU_SRC_WET;
    return post ? AU_SRC_DRY : AU_SRC_PRE;
}

export function auConvertHasNotes(t) {
    for (let c = 0; c < NUM_CLIPS; c++) if (clipHasNotes(t, c)) return true;
    return false;
}

/* Should picking Audio ask? A track that plays an instrument and has a clip
 * with notes. */
export function auConvertOffered(t, hasSynth) {
    return auConvertSource(t, hasSynth, false) >= 0 && auConvertHasNotes(t);
}

/* FREEZE TRACK (a TRACK CONFIG row; Josh, 2026-10-30: "freeze track (convert
 * track to resampled audio)" · "freeze track should have pre or post effect
 * option. pre leaves the track insert effects in place after. post mutes them
 * after" · "freeze track lives on track config"): the same conversion, asked
 * for on its own. The refusals come first; then FREEZE TRACK N with Pre /
 * Post (Pre first; Back cancels). A Move instrument records as heard, so it
 * has no choice: Yes / No, No first. */
export function freezeTrackRequest(t, hasSynth) {
    const name = 'Track ' + (t + 1);
    if (S.playing) { showActionPopupFor(2500, 'STOP TO FREEZE', 'It plays from the top'); return; }
    if (S.clockFollowOn) { showActionPopupFor(2500, 'NOT FROZEN', 'Clock Follow is on'); return; }
    const pre = auConvertSource(t, hasSynth, false);
    if (pre < 0) {
        showActionPopupFor(2500, 'NOTHING TO FREEZE', S.trackRoute[t] === 0 ? name + ' has no instrument' : name + ' plays MIDI out');
        return;
    }
    const anySolo = S.trackSoloed.some((v) => v);
    if (S.trackMuted[t] || (anySolo && !S.trackSoloed[t])) { showActionPopupFor(2500, 'NOTHING TO FREEZE', name + ' is muted'); return; }
    if (!auConvertHasNotes(t)) {
        showActionPopupFor(2500, 'NOTHING TO FREEZE', name + (S.trackPadMode[t] === PAD_MODE_AUDIO ? ' has no samples' : ' has no notes'));
        return;
    }
    S.confirmConvertToDrum = true; S.confirmConvertToDrumSel = 1;
    S.confirmConvertTrack = t; S.confirmConvertAudio = 'freeze';
    S.auFreeze = { t, choice: pre !== AU_SRC_WET, hasSynth };
}

/* Its answer (input context): `right` is the right-hand button — Post, or
 * Yes where there is no choice. */
export function freezeTrackAnswer(right) {
    const f = S.auFreeze;
    S.auFreeze = null;
    if (!f) return;
    if (!f.choice && !right) return;
    const post = f.choice && right;
    S.auConvertSrc = auConvertSource(f.t, f.hasSynth, post);
    S.auConvertBypass = post;
    S.pendingAuConvertStart = f.t;
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
    /* the source as the question read it (the slot's instrument is not read
     * here); a follower's or a Move track's needs no slot read */
    const src = S.auConvertSrc >= 0 ? S.auConvertSrc : auConvertSource(t, true, false);
    const bypass = !!S.auConvertBypass;
    S.auConvertSrc = -1; S.auConvertBypass = false;
    if (src < 0) { showActionPopupFor(2500, 'NOT RESAMPLED', 'Nothing to record'); return false; }
    const inPlace = S.trackPadMode[t] === PAD_MODE_AUDIO;
    S.auConvert = { t, list, i: 0, src, bypass, inPlace, phase: 'send', at: 0, seen: false, stopSent: false };
    S.resampleTake = { convert: true };
    return true;
}

function status(cv, line2) {
    showActionPopupFor(60000, (cv.inPlace ? 'FREEZE ' : 'TO AUDIO ') + (cv.i + 1) + '/' + cv.list.length,
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
        /* Every take is in: convert, then each clip takes its recording. An
         * Audio track is audio already: each clip takes its recording IN
         * PLACE, at default settings (Josh, 2026-10-30: "audio tracks ought to
         * be able to be frozen (essentially resampling every clip in place)"). */
        S.resampleTake = null;
        S.auConvert = null;
        const takes = cv.list.map((x) => ({ c: x.c, path: x.path }));
        const n = cv.list.length + ' clip' + (cv.list.length === 1 ? '' : 's') + ' resampled';
        if (cv.inPlace) {
            S.auApply = { t: cv.t, takes, i: 0, bypassFx: cv.bypass, inPlace: true, reset: -1 };
            showActionPopupFor(2500, 'FROZEN', n);
        } else {
            S.pendingTrackConvert = { t: cv.t, toAudio: true, bypassFx: cv.bypass, takes };
            showActionPopupFor(2500, 'TO AUDIO', n);
        }
        return;
    }
    if (st === RS_CANCELLED) {
        if (sampling()) return;
        abort(cv, cv.inPlace ? 'NOT FROZEN' : 'NOT CONVERTED', 'Cancelled');
        return;
    }
    if (st === RS_FAILED) {
        if (S.playing) S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
        abort(cv, 'NOT RESAMPLED', 'Could not record');
    }
}

/* After the conversion (tick, from pendingTrackConvert): each clip loads its
 * take (the conversion already cleared the notes). The take is already in
 * samples/, so the pick takes it as it is (no copy). ONE CLIP PER TICK: every
 * clip writes the same key, and one key written twice before it drains keeps
 * only the second. */
export function auConvertApply(t, takes, bypassFx) {
    S.auApply = { t, takes: takes.slice(), i: 0, bypassFx: !!bypassFx };
}
/* Freeze Post: the takes hold the track's insert FX, so they are bypassed —
 * kept, not removed, as a bake leaves its MIDI FX. TRACK CONFIG, where Freeze
 * was asked for, re-reads its rows: it rebuilt them at the conversion, before
 * this, and went on reading the FX as playing (found on the device). */
const FX_BLOCKS = ['fx1', 'fx2', 'fx3', 'fx4'];
function bypassInserts(t) {
    const slot = slotIndex(t);
    for (const b of FX_BLOCKS)
        if (engineLoadedModule(slot, b)) engineSet(slot, b, 'bypassed', '1');
    soundTrackTypeChanged(t);
}
function applyTick() {
    const a = S.auApply;
    if (!a) return false;
    if (a.i >= a.takes.length) {
        S.auApply = null; S.screenDirty = true;
        if (a.bypassFx) bypassInserts(a.t);
        return true;
    }
    const k = a.takes[a.i];
    if (a.inPlace) {
        /* the clip starts over (sample, steps, settings: Shift + Delete's
         * reset), then picks; the pick goes straight to the engine and the
         * reset through the queue, so the pick waits for the reset to go */
        if (a.reset !== a.i) { hardResetClip(a.t, k.c); a.reset = a.i; return true; }
        if (S.clearDrainHold || S.pendingDefaultSetParams.some((e) => e.key === 't' + a.t + '_c' + k.c + '_hard_reset'))
            return true;
    }
    a.i++;
    auPick(a.t, k.c, k.path);
    return true;
}
