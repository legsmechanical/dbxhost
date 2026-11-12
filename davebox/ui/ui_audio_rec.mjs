/* ui_audio_rec.mjs — Rec on an Audio track records the Move's INPUT into its
 * clip (the engine: dsp/seq8_audio_rec.c; Josh's model, 2026-11-12).
 *
 *   - an empty clip records until Rec again, to the next bar; a clip with a
 *     sample records a LAYER its length (the clip as heard + the input), and
 *     Rec again punches out;
 *   - stopped: the count-in (MIDI's), then the top; playing: it waits for the
 *     clip's next loop (the next bar on an empty clip) — WAIT on the screen;
 *   - the input is heard through the track while the take runs;
 *   - when the host has written the file it becomes the clip's sample, one undo
 *     step. A cancelled or failed take's file is removed.
 *
 * A Slicer keeps Rec for its chops (Josh: "Audio tracks only"). */

import * as os from 'os';
import { S, noteUndoUnit } from './ui_state.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { SCENE_LETTERS } from './ui_constants.mjs';
import { isAudioTrack, auInfo, auMarkStale, dspAnswer } from './ui_audio.mjs';
import { sanitizeName } from './ui_export.mjs';
import { nowMs } from './ui_clock.mjs';
import { disarmRecord } from './ui_record.mjs';
import { forceRedraw, invalidateLEDCache } from './ui_leds.mjs';
import { auIn } from './ui_audio_input.mjs';
import { confirmLineInput, feedbackGateActive, feedbackGateDraw, feedbackGateInput }
    from '/data/UserData/schwung/shared/feedback_gate.mjs';

/* the engine's states (seq8_audio_rec.c) */
const AR_ARMED = 1, AR_RECORDING = 2, AR_ENDING = 3, AR_DONE = 4, AR_CANCELLED = 5, AR_FAILED = 6;
const AR_ERR_TRACK = 1, AR_ERR_BUSY = 2, AR_ERR_LOADING = 3, AR_ERR_SAMPLER = 4, AR_ERR_SILENT = 6, AR_ERR_CAP = 7;

/* Frames from feeding the slot to reading it back at the input: the engine
 * reads the take's input that much later. MEASURED on a Move, 2026-11-12, with
 * a cable from the headphone out to the line in: a click fed at the take's top
 * came back 599 frames later (13.6 ms) on every beat of 7 takes, at 120 and
 * 90 bpm, to the frame; with 599 set, every click lands on its beat. */
export const AU_REC_LATENCY = 599;

const POLL_MS = 60;

function clipName(t, c) { return (t + 1) + SCENE_LETTERS[c]; }

function freePath(base, dir) {
    for (let n = 1; n <= 99; n++) {
        const p = dir + '/' + base + (n > 1 ? ' ' + n : '') + '.wav';
        const [st] = os.stat(p);
        if (!st) return p;
    }
    return null;
}
function samplerBusy() { try { return !!host_sampler_is_recording(); } catch (e) { return false; } }
function removeFile(p) { try { os.remove(p); } catch (e) { /* never written */ } }

/* Is a take running (armed, counting in, recording, or waiting to land)? */
export function auRecActive() { return !!S.auRec; }

/* The engine's answer: [state, track, clip, done, total, peak, err, ticks]. */
function readStatus() {
    const v = dspAnswer('t0_au_rec');
    if (!v) return null;
    return v.split(' ').map((x) => parseInt(x, 10) | 0);
}

/* The Rec button. True when it was this take's (or an Audio track's). */
export function auRecPress() {
    if (S.auRec) {
        const r = S.auRec;
        if (r.phase === 'landing') return true;
        if (S.recordCountingIn) {
            disarmRecord();                               /* the count-in's cancel cancels the take */
            host_module_set_param('t' + r.t + '_au_rec_cancel', '1');
        } else {
            host_module_set_param('t' + r.t + '_au_rec_stop', '1');
            r.stopAsked = true;
        }
        forceRedraw();
        return true;
    }
    const t = S.activeTrack;
    if (!isAudioTrack(t)) return false;
    const c = S.trackActiveClip[t];
    if (auInfo(t, c).state === 1) { showActionPopupFor(2000, 'RECORD', 'Sample loading'); return true; }
    confirmLineInput('Record', (ok) => { if (ok) armTake(t, c); forceRedraw(); });
    forceRedraw();
    return true;
}

function armTake(t, c) {
    const dir = dspAnswer('t' + t + '_au_dir') || '';
    if (!dir) { showActionPopupFor(2500, 'RECORD', 'No project'); return; }
    const bpm = (S.bpmMirror > 0 && isFinite(S.bpmMirror)) ? S.bpmMirror : 120;
    const path = freePath(sanitizeName(S.currentSetName) + ' ' + clipName(t, c) + ' rec ' + Math.round(bpm) + 'bpm', dir);
    if (!path) { showActionPopupFor(2500, 'RECORD', 'No free name'); return; }
    host_module_set_param('t' + t + '_au_rec_arm', c + ' ' + AU_REC_LATENCY + ' |' + path);
    const layer = !!auInfo(t, c).name;
    S.auRec = { t, c, path, phase: 'armed', layer, at: nowMs(), polled: 0, stopAsked: false,
                lenBars: layer ? 0 : [0, 1, 2, 4, 8][auIn(t).len % 5] };
    if (!S.playing) {
        /* MIDI's count-in: its screen, its click; the engine starts the clip */
        S.recordArmed        = true;
        S.recordArmedLive    = false;
        S.recordCountingIn   = true;
        S.recordArmedTrack   = t;
        S.countInStartMs     = nowMs();
        S.countInBeatStartMs = nowMs();
        S.countInQuarterMs   = 60000 / bpm;
        S.pendingDefaultSetParams.push({ key: 'record_count_in', val: String(t) });
    } else if (!S.trackClipPlaying[t] && S.trackQueuedClip[t] !== c) {
        /* the take is the clip's while it plays: start it */
        S.pendingDefaultSetParams.push({ key: 't' + t + '_launch_clip', val: String(c) });
        S.trackQueuedClip[t] = c;
    }
}

/* Every tick: the take's progress, its end, its landing. */
export function auRecTick() {
    const r = S.auRec;
    if (!r) return;
    /* the count-in is over: the take is the engine's now, not MIDI's record */
    if (S.recordArmed && !S.recordCountingIn && S.recordArmedTrack === r.t) {
        S.recordArmed = false;
        S.recordArmedTrack = -1;
    }
    const now = nowMs();
    if (now - r.polled < POLL_MS) return;
    r.polled = now;
    const a = readStatus();
    if (!a) return;
    const st = a[0], err = a[6];
    r.state = st; r.done = a[3]; r.total = a[4]; r.ticks = a[7];
    if (r.ledSt !== st) { r.ledSt = st; invalidateLEDCache(); }
    if (st === AR_ARMED || st === AR_RECORDING || st === AR_ENDING) { r.phase = st === AR_ARMED ? 'armed' : 'recording'; S.screenDirty = true; return; }
    if (S.recordCountingIn && st !== AR_DONE) { S.screenDirty = true; return; }   /* not armed in the engine yet */
    if (st === AR_DONE) {
        /* the host writes the file on its own thread: land it when written */
        if (r.phase !== 'landing') { r.phase = 'landing'; r.at = now; }
        const [f] = os.stat(r.path);
        if ((samplerBusy() || !f) && now - r.at < 10000) return;
        S.auRec = null; invalidateLEDCache();      /* the pads leave the take's red */
        if (!f) { showActionPopupFor(2500, 'RECORD', 'Not recorded'); forceRedraw(); return; }
        noteUndoUnit();
        host_module_set_param('t' + r.t + '_au_rec_land', String(r.c));
        S.auInfo[r.t][r.c] = Object.assign({}, auInfo(r.t, r.c), { state: 1, err: 0, name: '' });
        auMarkStale(r.t, r.c);
        showActionPopupFor(2000, 'RECORDED', clipName(r.t, r.c) + (err === AR_ERR_CAP ? ' · stopped at 64 bars' : ''));
        forceRedraw();
        return;
    }
    /* CANCELLED / FAILED / IDLE: nothing lands; the file (if any) goes once written */
    if (samplerBusy() && now - r.at < 10000) return;
    S.auRec = null; invalidateLEDCache();          /* the pads leave the take's red */
    removeFile(r.path);
    const why = err === AR_ERR_SILENT ? 'No input heard'
        : err === AR_ERR_SAMPLER ? 'Sampler busy'
        : err === AR_ERR_BUSY ? 'Finish the resample first'
        : err === AR_ERR_LOADING ? 'Sample loading'
        : err === AR_ERR_TRACK ? 'No output for the track'
        : 'Take cancelled';
    showActionPopupFor(2500, 'RECORD', why);
    forceRedraw();
}

/* The heading's tag for track t: ' WAIT' / ' REC 1.2' — or null. */
export function auRecTag(t) {
    const r = S.auRec;
    if (!r || r.t !== t || S.recordCountingIn) return null;
    if (r.phase === 'armed') return (Math.floor(S.clockMs / 440) % 2 === 0) ? ' WAIT' : '     ';
    if (r.phase === 'recording') {
        const bars = Math.floor((r.done || 0) / ((60 / ((S.bpmMirror > 0) ? S.bpmMirror : 120)) * 4 * 44100));
        return ' REC ' + (bars + 1);
    }
    return null;
}

/* Session view's top bar during a take: "REC 2B · 3" / "WAIT 2B" — or null. */
export function auRecBarText() {
    const r = S.auRec;
    if (!r || r.phase === 'landing') return null;
    if (r.phase === 'armed' || S.recordCountingIn) return (Math.floor(S.clockMs / 440) % 2 === 0) ? 'WAIT ' + clipName(r.t, r.c) : ' ';
    const bars = Math.floor((r.done || 0) / ((60 / ((S.bpmMirror > 0) ? S.bpmMirror : 120)) * 4 * 44100));
    return 'REC ' + clipName(r.t, r.c) + ' BAR ' + (bars + 1);
}

/* For the LEDs: 'wait' (armed / counting in), 'rec', or null — and whose clip. */
export function auRecLedState() {
    const r = S.auRec;
    if (!r || r.phase === 'landing') return null;
    return (r.phase === 'armed' || S.recordCountingIn) ? 'wait' : 'rec';
}
export function auRecClip() { return S.auRec ? [S.auRec.t, S.auRec.c] : null; }

/* Track view's pads during a take into an empty clip, pad k (0..31): one pad
 * a BAR — the bars recorded lit, the one recording pulsing, the rest of a set
 * Length dim, past it dark; while it waits, pad 1 blinks. A clip with a
 * sample keeps its sections (ui_leds). Returns 'wait' / 'done' / 'now' /
 * 'todo' / null. */
export function auRecBarPad(k) {
    const r = S.auRec;
    if (!r || r.phase === 'landing') return null;
    if (auRecLedState() === 'wait') return k === 0 ? 'wait' : null;
    const bars = Math.floor((r.done || 0) / ((60 / ((S.bpmMirror > 0) ? S.bpmMirror : 120)) * 4 * 44100));
    const cur = Math.min(31, bars);
    if (k < cur) return 'done';
    if (k === cur) return 'now';
    return k < (r.lenBars | 0) ? 'todo' : null;
}

/* The speaker-feedback gate's modal: its input, and drawing it. */
export function auRecModalCC(d1, d2) { return feedbackGateActive() ? feedbackGateInput(d1, d2) : false; }
export function auRecDrawModal() { if (feedbackGateActive()) { feedbackGateDraw(); return true; } return false; }
