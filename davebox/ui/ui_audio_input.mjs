/* ui_audio_input.mjs — the INPUT bank: an Audio track's input (Josh,
 * 2026-11-12: "can we create a green pad map bank above "sample" on audio
 * tracks that has input settings (per-track) including monitoring on/off (and
 * any others we may want to include)" -> the layout below, "Build as proposed").
 *
 *   K1 Monitor  Off · Rec (heard while a take runs) · On (always: a live input
 *               through the track)
 *   K2 Input    Stereo · Mono L · Mono R
 *   K3 Gain     -24 .. +24 dB
 *   K4 Length   an empty clip's take: Free (until Rec again) · 1 · 2 · 4 · 8 bars
 *   K5 Overdub  a clip with a sample: Layer (over what it plays) · Replace
 *   and a meter of the input on the screen (the track overview's foot).
 *
 * Monitor, Input and Gain are the DEVICE's (Josh, 2026-11-12: "i still want
 * the monitoring and input settings on the global menu ... the audio track
 * bank would just set those directly"): the bank sets the same values as the
 * global menu (ui_prefs inputPrefs). Monitor On with no take is heard straight
 * at the output ("Straight to the output"); during a take, through its track.
 * Length and Overdub are the track's, saved with the project (t%d_ain).
 * The Move picks the source itself: line-in with a cable in, else the mic. */

import { S } from './ui_state.mjs';
import { dspAnswer } from './ui_audio.mjs';
import { forceRedraw } from './ui_leds.mjs';
import { confirmLineInput } from '/data/UserData/schwung/shared/feedback_gate.mjs';
import { inputPrefs, setInputPref, INPUT_GAIN_MIN, INPUT_GAIN_MAX } from './ui_prefs.mjs';

export const IN_MON = ['Rec', 'Off', 'On'];             /* the engine's in_mon order (0 = Rec, the default) */
const IN_MON_SHOWN = [1, 0, 2];                          /* the knob's order: Off · Rec · On */
export const IN_MODE = ['Stereo', 'Mono L', 'Mono R'];
export const IN_LEN = ['Free', '1 bar', '2 bars', '4 bars', '8 bars'];
export const IN_OVR = ['Layer', 'Replace'];
const GAIN_MIN = INPUT_GAIN_MIN, GAIN_MAX = INPUT_GAIN_MAX;

/* Track t's INPUT bank: the device's Monitor / Input / Gain (ui_prefs) and
 * the track's Length / Overdub as the engine has them: { mon, mode, gain, len, ovr }. */
export function auIn(t) {
    if (!S.auIn) S.auIn = {};
    if (!S.auIn[t]) {
        const v = dspAnswer('t' + t + '_au_in');
        const a = v ? v.split(' ').map((x) => parseInt(x, 10) | 0) : [0, 0, 0, 0, 0];
        S.auIn[t] = { len: a[3], ovr: a[4] };
    }
    const p = inputPrefs();
    return { mon: p.mon, mode: p.mode, gain: p.gain, len: S.auIn[t].len, ovr: S.auIn[t].ovr };
}
/* Read again (a project load, a track that changed kind). */
export function auInStale(t) { if (S.auIn) { if (t == null) S.auIn = {}; else delete S.auIn[t]; } }

function enumCell(label, name, opts, sel) {
    return { kind: 'enumsq', label, name, text: opts[sel], options: opts, sel };
}

/* The bank's cells. */
export function inputBankCells(t) {
    const r = auIn(t), B = { kind: 'blank', label: '' };
    const monSel = IN_MON_SHOWN.indexOf(r.mon);
    const g = r.gain | 0;
    return [
        enumCell('Mon', 'Monitor', IN_MON_SHOWN.map((i) => IN_MON[i]), monSel < 0 ? 1 : monSel),
        enumCell('Input', 'Input', IN_MODE, r.mode | 0),
        { kind: 'valsq', label: 'Gain', name: 'Gain', text: (g > 0 ? '+' : '') + g + 'dB',
          ringNorm: (g - GAIN_MIN) / (GAIN_MAX - GAIN_MIN) },
        enumCell('Len', 'Length', IN_LEN, r.len | 0),
        enumCell('Ovrdb', 'Overdub', IN_OVR, r.ovr | 0),
        B, B, B,
    ];
}

function send(t, key, v) { host_module_set_param('t' + t + '_au_' + key, String(v)); }

/* A knob moved by `steps` (detents for the choices, dB for Gain). True when
 * it changed. */
export function inputBankKnob(t, k, steps) {
    const r = auIn(t);
    if (k === 0) return inputMonitorTurn(steps);
    if (k === 1) {
        const v = Math.max(0, Math.min(2, r.mode + steps));
        if (v === r.mode) return false;
        setInputPref('mode', v); forceRedraw(); return true;
    }
    if (k === 2) {
        const v = Math.max(GAIN_MIN, Math.min(GAIN_MAX, r.gain + steps));
        if (v === r.gain) return false;
        setInputPref('gain', v); forceRedraw(); return true;
    }
    const own = (field, key, n) => {
        const v = Math.max(0, Math.min(n - 1, (r[field] | 0) + steps));
        if (v === r[field]) return false;
        S.auIn[t] = Object.assign({}, S.auIn[t], { [field]: v });
        send(t, key, v); forceRedraw();
        return true;
    };
    if (k === 3) return own('len', 'in_len', 5);
    if (k === 4) return own('ovr', 'in_ovr', 2);
    return false;
}

/* Monitor moved `steps` along Off · Rec · On (the global menu and the bank):
 * On is heard through the speakers too — with the mic and no headphones that
 * is feedback, so the Move asks first. */
export function inputMonitorTurn(steps) {
    const cur = inputPrefs().mon;
    const v = IN_MON_SHOWN[Math.max(0, Math.min(2, IN_MON_SHOWN.indexOf(cur) + steps))];
    return setInputMonitor(v);
}
export function setInputMonitor(v) {
    if (v === inputPrefs().mon) return false;
    if (v === 2) {
        confirmLineInput('Monitor', (ok) => { if (ok) setInputPref('mon', 2); forceRedraw(); });
        forceRedraw();
        return true;
    }
    setInputPref('mon', v); forceRedraw();
    return true;
}
export const IN_MON_ORDER = IN_MON_SHOWN;

/* THE METER: the input's peaks since the last read, held for the bars' fall,
 * with the track's Gain on them (what the take would get); `clip` holds a
 * second after a sample reaches full scale. Read every tick while the bank is
 * up (inputMeterPoll). */
const METER_MS = 50, CLIP_HOLD_MS = 1000, FALL = 0.85;
export function inputMeterPoll(t, now) {
    if (!S.auInMeter) S.auInMeter = { l: 0, r: 0, clipUntil: 0, at: 0 };
    const m = S.auInMeter;
    if (now - m.at < METER_MS) return;
    m.at = now;
    const v = dspAnswer('t' + t + '_au_in_meter');
    if (!v) return;
    const [pl, pr] = v.split(' ').map((x) => parseInt(x, 10) | 0);
    const r = inputPrefs();
    let gl = pl, gr = pr;
    const ch = r.mode;                 /* Input: 1 Mono L, 2 Mono R */
    if (ch === 1) gr = gl; else if (ch === 2) gl = gr;
    const g = Math.pow(10, (r.gain | 0) / 20);
    gl = Math.min(32767, gl * g); gr = Math.min(32767, gr * g);
    if (gl >= 32767 || gr >= 32767) m.clipUntil = now + CLIP_HOLD_MS;
    const lvl = (x) => (x <= 0 ? 0 : Math.max(0, Math.min(1, 1 + (20 * Math.log10(x / 32767)) / 48)));   /* -48..0 dBFS */
    m.l = Math.max(lvl(gl), m.l * FALL);
    m.r = Math.max(lvl(gr), m.r * FALL);
    S.screenDirty = true;
}

/* Draw the meter in (x, y, w, h): two bars, L over R, full scale at the right
 * edge; CLIP at the right while it holds. */
export function drawInputMeter(x, y, w, h, now) {
    const m = S.auInMeter || { l: 0, r: 0, clipUntil: 0 };
    const clip = now < m.clipUntil;
    const bw = clip ? w - 24 : w;
    const bh = Math.max(1, Math.floor((h - 1) / 2));
    draw_rect(x, y, bw, bh, 1); draw_rect(x, y + bh + 1, bw, bh, 1);
    const fl = Math.round((bw - 2) * m.l), fr = Math.round((bw - 2) * m.r);
    if (fl > 0) fill_rect(x + 1, y + 1, fl, Math.max(1, bh - 2), 1);
    if (fr > 0) fill_rect(x + 1, y + bh + 2, fr, Math.max(1, bh - 2), 1);
    if (clip) print(x + bw + 2, y + Math.max(0, Math.floor((h - 8) / 2)), 'CLIP', 1);
}
