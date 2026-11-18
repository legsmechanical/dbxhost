/*
 * dictation.mjs — push-to-talk speech-to-text for the shared keyboard.
 *
 * Hold a button to talk, release to transcribe. The audio is the Move's
 * built-in mic (see "The microphone, always" below), taken through the host
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
 * Every exit path goes through `finish()`. The user's own sampler source,
 * voice prompts, jack report and monitoring are put back ONCE THE SAMPLER HAS
 * STOPPED, never before: a stop is a request the sampler's worker carries out
 * up to ~200 ms later, and it announces "Sample saved" if the prompts are on
 * by then. A cancelled take waits in `draining` for that; dictationService()
 * finishes it. The sampler belongs to the user (Shift+Volume+Sample),
 * dictation only borrows it.
 *
 * dictationService() is the part that must run even with no keyboard on
 * screen (a keyboard closed mid-take still has a sampler to put back, a jack
 * message to deliver, a cap to enforce): the keyboard's owner calls it every
 * tick. It makes no host call when nothing is owed.
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

export const MAX_TALK_MS = 30000;      /* every take, any keyboard: a name or a sung line (stt_core.h STT_MAX_TAKE_S) */
export const MIN_HOLD_MS = 300;        /* a shorter press is a tap: show the hint */
const START_TIMEOUT_MS = 600;          /* sampler must report recording by then */
const FINALIZE_TIMEOUT_MS = 3000;      /* WAV closed by then */
const RESULT_TIMEOUT_MS = 20000;       /* helper answered by then, plus the take's own length (decoding grows with it) */
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
/* What the Move must be told about its line-in jack, until it has been:
 * null = nothing owed, 'mic' = empty (record the mic), 'truth' = whatever the
 * hardware reports now. The inject ring can be full; a message that did not
 * go in is tried again every service tick rather than lost (a lost 'truth'
 * would leave the Move recording the mic with a cable in, until re-plugged). */
let jackOwed = null;
function sendJack() {
    if (jackOwed === null) return true;
    const plugged = jackOwed === 'truth' ? !!host_line_in_connected() : false;
    let sent = false;
    try { sent = move_midi_inject_to_move([0x0B, 0xB0, CC_MIC_IN_DETECT, plugged ? 127 : 0]) !== false; }
    catch (e) { sent = false; }
    if (sent) jackOwed = null;
    return sent;
}

let st = null;          /* the live dictation, or null */
let notice = null;      /* { text, until } */
let seq = 0;
let draining = [];      /* cancelled takes whose sampler is still stopping */
let queued = null;      /* { at, released } — Rec pressed while a take was still stopping */

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
    if (d.forcedMic) { jackOwed = 'truth'; sendJack(); }   /* the hardware's answer, now */
    hook('end');
}

function writeCancel(d) {
    if (d && d.spawned) host_write_file(d.base + '.cancel', '1');
}

/* The single exit. `why` = a notice to show, or null. The helper is told to
 * stop at once; the sampler is put back once it has actually stopped. */
function finish(why) {
    const d = st;
    st = null;
    if (!d) { if (why) showNotice(why); return; }
    if (d.state === 'starting' || d.state === 'listening') { host_sampler_stop(); d.stopAt = now(); }
    if (d.state !== 'done') writeCancel(d);
    if (!d.restored) {
        if (!d.stopAt) d.stopAt = now();
        draining.push(d);
        dictationService();
    }
    if (why) showNotice(why);
}

/* Must run every tick, keyboard or not (see the header). */
export function dictationService() {
    if (jackOwed !== null) sendJack();
    if (draining.length) {
        const t = now();
        const rec = recording();
        draining = draining.filter((d) => {
            if (rec && t - d.stopAt <= FINALIZE_TIMEOUT_MS) return true;
            restoreSampler(d);
            return false;
        });
        if (!draining.length && queued) {
            const q = queued;
            queued = null;
            if (!q.released) startTake(q.at);
            else if (now() - q.at < MIN_HOLD_MS) showNotice('HOLD REC TO TALK');
        }
    }
    /* The cap, even if the keyboard has stopped being ticked. */
    if (st && st.state === 'listening' && now() - st.listenAt >= MAX_TALK_MS) stopTake();
}

/* ---- public ------------------------------------------------------------- */

/* { state, seconds, notice, level, elapsed }: level 0..1 is the mic's peak
 * (-48..0 dBFS) while listening; elapsed 0..1 is the take against its cap. */
export function dictationState() {
    const n = (notice && notice.until > now()) ? notice.text : '';
    if (!st && queued) return { state: 'starting', seconds: 0, notice: '', level: 0, elapsed: 0 };
    if (!st) return { state: n ? 'notice' : 'idle', seconds: 0, notice: n, level: 0, elapsed: 0 };
    const ms = (st.state === 'listening') ? now() - st.listenAt : 0;
    return {
        state: st.state, seconds: Math.floor(ms / 1000), notice: '',
        level: st.state === 'listening' ? st.level : 0,
        elapsed: Math.max(0, Math.min(1, ms / MAX_TALK_MS)),
    };
}

/* The sampler's own peak (shadow_sampler.c sampler_update_vu: runs while it
 * records, with its own hold and fall) on a -48..0 dBFS scale. */
function levelOf(peak) {
    const p = peak | 0;
    if (p <= 0) return 0;
    return Math.max(0, Math.min(1, 1 + (20 * Math.log10(p / 32767)) / 48));
}

/* True while a dictation owns the input (Rec held / sampler busy for us). */
export function dictationListening() {
    return !!queued || (!!st && (st.state === 'starting' || st.state === 'listening' || st.state === 'finalizing'));
}
export function dictationActive() { return !!st || !!queued; }

/* True while the card is up: a dictation, or its notice. */
export function dictationCardUp() {
    return dictationActive() || (!!notice && notice.until > now());
}
/* Back on a notice: take it down now. */
export function dictationDismissNotice() {
    if (!notice) return false;
    notice = null;
    return true;
}

/* Rec down. */
export function dictationPress() {
    if (st && st.state === 'transcribing') finish(null);   /* talking again replaces it */
    if (st || queued) return;
    notice = null;
    const no = hook('refuse');
    if (no) { showNotice(String(no)); return; }
    dictationService();
    if (draining.length) { queued = { at: now(), released: false }; return; }   /* our own take still stopping */
    startTake(now());
}

function startTake(pressAt) {
    const no = hook('refuse');
    if (no) { showNotice(String(no)); return; }
    const ov = samplerOverlay();
    if ((ov.samplerState | 0) !== 0 || recording()) { showNotice('MIC BUSY'); return; }
    const id = 'd' + now().toString(36) + (seq++).toString(36);
    const base = WORK_DIR + '/' + id;
    st = {
        id, base, state: 'starting', pressAt, listenAt: 0, stopAt: 0, lastPoll: 0,
        prevSource: (ov.samplerSource | 0), restored: false, spawned: false, released: false, level: 0,
        forcedMic: !!host_line_in_connected(),
    };
    hook('begin');
    if (st.forcedMic) { jackOwed = 'mic'; sendJack(); }
    host_sampler_set_silent(1);
    host_sampler_set_source(SOURCE_MOVE_INPUT);
    host_sampler_start(base + '.wav');
    host_system_cmd("sh '" + STT_DIR + "/stt-run.sh' '" + WORK_DIR + "' " + id + ' ' + (MAX_TALK_MS / 1000)
                    + " >/dev/null 2>&1 &");
    st.spawned = true;
}

/* Rec up. */
export function dictationRelease() {
    if (queued) { queued.released = true; return; }
    if (!st) return;
    if (st.state === 'starting' || st.state === 'listening') {
        if (now() - st.pressAt < MIN_HOLD_MS) { finish('HOLD REC TO TALK'); return; }
        if (st.state === 'starting') { st.released = true; return; }
        stopTake();
    }
}

/* Back: cancel the dictation (the keyboard stays). True if there was one. */
export function dictationCancel() {
    if (queued) { queued = null; return true; }
    if (!st) return false;
    finish(null);
    return true;
}

/* Tear everything down (keyboard closing). What is still stopping is finished
 * by dictationService(). */
export function dictationAbort() {
    queued = null;
    finish(null);
    notice = null;
}

/* A session that ends mid-take needs nothing from here: every host start
 * re-sends the Move the saved line-in state (shim_worker.c, from the
 * hardware's own reports, which our message never touches); a warm restart
 * keeps this module's state, so dictationService() still finishes the take. */

function stopTake() {
    host_sampler_stop();
    st.state = 'finalizing';
    st.stopAt = now();
}

/* Advance. Returns { changed, text } — text is the transcript once, then null. */
export function dictationTick() {
    dictationService();
    if (!st) {
        if (notice && notice.until <= now()) { notice = null; return { changed: true, text: null }; }
        return { changed: false, text: null };
    }
    const d = st;
    const t = now();
    const sig = () => { const v = dictationState(); return v.state + ':' + v.seconds + ':' + Math.round(v.level * 64) + ':' + Math.round(v.elapsed * 64); };
    const before = sig();
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
        d.level = levelOf(samplerOverlay().samplerVuPeak);
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
            if (t - d.goAt > RESULT_TIMEOUT_MS + (d.stopAt - d.listenAt)) {
                finish('STT FAILED');
                return { changed: true, text: null };
            }
        }
    }
    return { changed: sig() !== before, text };
}

/* Turn a transcript into something the keyboard could have typed: trimmed,
 * single-spaced, only characters in `allowed` (plus space), at most `maxLen`
 * long. The same for every keyboard: commas are dropped (the model scatters
 * them; type one if you want one), and so is the sentence punctuation it puts
 * at the end of nearly everything. */
export function sanitizeTranscript(text, allowed, maxLen) {
    const s = String(text || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
    let out = '';
    for (const ch of s) if (ch === ' ' || allowed.indexOf(ch) >= 0) out += ch;
    out = out.replace(/ +/g, ' ').trim();
    return out.slice(0, maxLen);
}
