/*
 * dictation.mjs — push-to-talk speech-to-text for the shared keyboard.
 *
 * Hold a button to talk, release to transcribe. The audio is the Move's input
 * (built-in mic, or line-in when a cable is in), taken through the host
 * sampler; the transcription runs in a separate helper process
 * (src/stt/stt_helper.c, started by stt-run.sh) at the lowest priority, off
 * the audio core. This module is the state machine between the two:
 *
 *   idle → starting → listening → finalizing → transcribing → idle
 *                                     (+ a short `notice` after a refusal or failure)
 *
 *   starting      sampler asked to record; waiting for it to report recording
 *   listening     recording; ends on release, the cap, or the sampler stopping
 *                 on its own (the Sample button stops it)
 *   finalizing    sampler stopping; waiting until the WAV is closed on disk
 *   transcribing  the helper has the go; waiting for its result file
 *
 * The helper is spawned at press time so loading the model overlaps the speech.
 * Every exit path goes through `finish()`, which puts the user's own sampler
 * source and voice prompts back as they were: the sampler belongs to the user
 * (Shift+Volume+Sample), dictation only borrows it.
 *
 * Files (never /tmp on a Move): <install>/dictation/<id>.{wav,go,cancel,json}.
 * The id keeps a cancelled helper's late answer away from the next dictation.
 *
 * The microphone, always: with a cable in the line-in jack the Move records
 * the cable, so a take tells the Move the jack is empty (CC 114 = 0, the
 * Move's own jack report) and tells it the truth again when the take ends.
 * The host's `host_line_in_connected()` follows the hardware, not what we
 * tell the Move, so the truth is always at hand to restore.
 *
 * The module using the keyboard owns the rest through setDictationHooks():
 *   refuse()  a notice when dictation may not run now (polled while
 *             listening too, so a transport started from outside ends it)
 *   begin()   the take is starting: silence anything that would play the
 *             mic out loud (monitoring)
 *   end()     the take has stopped: put that back. Paired with begin()
 *             exactly once, on every exit.
 *
 * Idle costs nothing: tick() makes no host call unless a dictation is live.
 */

const INSTALL_DIR = (typeof HOST_INSTALL_DIR === 'string' && HOST_INSTALL_DIR)
    ? HOST_INSTALL_DIR : '/data/UserData/schwung';
export const STT_DIR = INSTALL_DIR + '/stt';
export const WORK_DIR = INSTALL_DIR + '/dictation';

export const MAX_TALK_MS = 10000;      /* a take is capped here */
export const MIN_HOLD_MS = 300;        /* a shorter press is a tap: show the hint */
const START_TIMEOUT_MS = 600;          /* sampler must report recording by then */
const FINALIZE_TIMEOUT_MS = 3000;      /* WAV closed by then */
const RESULT_TIMEOUT_MS = 20000;       /* helper answered by then */
const RESULT_POLL_MS = 100;
const NOTICE_MS = 1600;

const SOURCE_MOVE_INPUT = 1;
const CC_MIC_IN_DETECT = 114;          /* the Move's line-in jack report: 0 = empty (mic) */

let hooks = null;
/* Register the keyboard owner's hooks (see the header); null clears them. */
export function setDictationHooks(h) { hooks = h || null; }
function hook(name) {
    if (!hooks || typeof hooks[name] !== 'function') return undefined;
    try { return hooks[name](); } catch (e) { return undefined; }
}
function tellMoveLineIn(plugged) {
    move_midi_inject_to_move([0x0B, 0xB0, CC_MIC_IN_DETECT, plugged ? 127 : 0]);
}

let st = null;          /* the live dictation, or null */
let notice = null;      /* { text, until } */
let seq = 0;

function now() { return Date.now(); }

function samplerOverlay() {
    try { return shadow_get_overlay_state() || {}; } catch (e) { return {}; }
}
function recording() { return !!host_sampler_is_recording(); }

function showNotice(text) { notice = { text, until: now() + NOTICE_MS }; }

/* Put the sampler, the jack and monitoring back the way the user had them.
 * Idempotent per dictation; runs as soon as the take has stopped. */
function restoreSampler(d) {
    if (!d || d.restored) return;
    d.restored = true;
    if (d.prevSource !== SOURCE_MOVE_INPUT) host_sampler_set_source(d.prevSource | 0);
    host_sampler_set_silent(0);
    if (d.forcedMic) tellMoveLineIn(!!host_line_in_connected());   /* the hardware's answer, now */
    hook('end');
}

function writeCancel(d) {
    if (d && d.spawned) host_write_file(d.base + '.cancel', '1');
}

/* The single exit. `why` = a notice to show, or null. */
function finish(why) {
    const d = st;
    st = null;
    if (!d) { if (why) showNotice(why); return; }
    if (d.state === 'starting' || d.state === 'listening') host_sampler_stop();
    restoreSampler(d);
    if (d.state !== 'done') writeCancel(d);
    if (why) showNotice(why);
}

/* ---- public ------------------------------------------------------------- */

export function dictationState() {
    const n = (notice && notice.until > now()) ? notice.text : '';
    if (!st) return { state: n ? 'notice' : 'idle', seconds: 0, notice: n };
    const secs = (st.state === 'listening') ? Math.floor((now() - st.listenAt) / 1000) : 0;
    return { state: st.state, seconds: secs, notice: '' };
}

/* True while a dictation owns the input (Rec held / sampler busy for us). */
export function dictationListening() {
    return !!st && (st.state === 'starting' || st.state === 'listening' || st.state === 'finalizing');
}
export function dictationActive() { return !!st; }

/* Rec down. */
export function dictationPress() {
    if (st && st.state === 'transcribing') finish(null);   /* talking again replaces it */
    if (st) return;
    notice = null;
    const no = hook('refuse');
    if (no) { showNotice(String(no)); return; }
    const ov = samplerOverlay();
    if ((ov.samplerState | 0) !== 0 || recording()) { showNotice('MIC BUSY'); return; }
    const id = 'd' + now().toString(36) + (seq++).toString(36);
    const base = WORK_DIR + '/' + id;
    st = {
        id, base, state: 'starting', pressAt: now(), listenAt: 0, stopAt: 0, lastPoll: 0,
        prevSource: (ov.samplerSource | 0), restored: false, spawned: false, released: false,
        forcedMic: !!host_line_in_connected(),
    };
    hook('begin');
    if (st.forcedMic) tellMoveLineIn(false);
    host_sampler_set_silent(1);
    host_sampler_set_source(SOURCE_MOVE_INPUT);
    host_sampler_start(base + '.wav');
    host_system_cmd("sh '" + STT_DIR + "/stt-run.sh' '" + WORK_DIR + "' " + id + " >/dev/null 2>&1 &");
    st.spawned = true;
}

/* Rec up. */
export function dictationRelease() {
    if (!st) return;
    if (st.state === 'starting' || st.state === 'listening') {
        if (now() - st.pressAt < MIN_HOLD_MS) { finish('HOLD REC TO TALK'); return; }
        if (st.state === 'starting') { st.released = true; return; }
        stopTake();
    }
}

/* Back: cancel the dictation (the keyboard stays). True if there was one. */
export function dictationCancel() {
    if (!st) return false;
    finish(null);
    return true;
}

/* Tear everything down (keyboard closing). */
export function dictationAbort() {
    finish(null);
    notice = null;
}

function stopTake() {
    host_sampler_stop();
    st.state = 'finalizing';
    st.stopAt = now();
}

/* Advance. Returns { changed, text } — text is the transcript once, then null. */
export function dictationTick() {
    if (!st) {
        if (notice && notice.until <= now()) { notice = null; return { changed: true, text: null }; }
        return { changed: false, text: null };
    }
    const d = st;
    const t = now();
    const before = d.state + ':' + dictationState().seconds;
    let text = null;

    if (d.state === 'starting' || d.state === 'listening') {
        const no = hook('refuse');
        if (no) { finish(String(no)); return { changed: true, text: null }; }
    }

    if (d.state === 'starting') {
        if (recording()) {
            d.state = 'listening'; d.listenAt = t;
            if (d.released) stopTake();
        } else if (t - d.pressAt > START_TIMEOUT_MS) {
            finish('MIC BUSY');
            return { changed: true, text: null };
        }
    } else if (d.state === 'listening') {
        if (!recording()) {                      /* stopped behind our back (Sample) */
            d.state = 'finalizing'; d.stopAt = t;
        } else if (t - d.listenAt >= MAX_TALK_MS) {
            stopTake();
        }
    }
    if (d.state === 'finalizing') {
        if (!recording()) {
            restoreSampler(d);
            host_write_file(d.base + '.go', '1');
            d.state = 'transcribing'; d.goAt = t; d.lastPoll = 0;
        } else if (t - d.stopAt > FINALIZE_TIMEOUT_MS) {
            finish('STT FAILED');
            return { changed: true, text: null };
        }
    } else if (d.state === 'transcribing') {
        if (t - d.lastPoll >= RESULT_POLL_MS) {
            d.lastPoll = t;
            const path = d.base + '.json';
            if (host_file_exists(path)) {
                let r = null;
                try { r = JSON.parse(host_read_file(path) || 'null'); } catch (e) { r = null; }
                d.state = 'done';
                st = null;
                if (r && r.ok && typeof r.text === 'string' && r.text.trim()) text = r.text;
                else showNotice(r && (r.err === 'no_speech' || r.err === 'too_short') ? 'NO SPEECH' : 'STT FAILED');
                return { changed: true, text };
            }
            if (t - d.goAt > RESULT_TIMEOUT_MS) {
                finish('STT FAILED');
                return { changed: true, text: null };
            }
        }
    }
    return { changed: (d.state + ':' + dictationState().seconds) !== before, text };
}

/* Turn a transcript into something the keyboard could have typed: trimmed,
 * single-spaced, no trailing sentence punctuation, only characters in `allowed`
 * (plus space), at most `maxLen` long. */
export function sanitizeTranscript(text, allowed, maxLen) {
    let s = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
    let out = '';
    for (const ch of s) if (ch === ' ' || allowed.indexOf(ch) >= 0) out += ch;
    out = out.replace(/ +/g, ' ').trim();
    return out.slice(0, maxLen);
}
