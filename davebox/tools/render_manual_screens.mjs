// tools/render_manual_screens.mjs — the OLED screens for the dAVEBOx SA manual,
// rendered off-device from the REAL render code.
//
//   cd davebox && node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs <outdir>
//
// Writes <outdir>/<slug>.png (a 4x preview per screen) and <outdir>/screens.json:
//   [{ slug, title, caption, section, fb }]   fb = base64 of the 1024-byte frame,
//   row-major, 8 px per byte, MSB = leftmost pixel.
//
// ⭑ HOW IT DIFFERS FROM THE OTHER TWO RENDERERS HERE.
//   render_screens.mjs  REPLICATES draw blocks (a copy drifts — it documented
//                       gestures the device no longer offers, four times).
//   audit_screens.mjs   calls the real exported draw functions directly.
//   THIS                boots the real UI (ui.js init()), puts a plausible demo
//                       project into the state the way the engine would report
//                       it, drives the real GESTURES (jog, click, knob touch,
//                       step hold, Shift chords — the same MIDI the hardware
//                       sends) and then draws through the ONE top-level entry,
//                       ui_render.drawUI(). Nothing is drawn here but by the UI.
//
// ⚠ An EMPTY or near-empty frame means the rig threw or drew the wrong screen,
//   never "this screen draws nothing" — the ink count is printed per screen and
//   a low one is flagged. A screen whose setup THROWS is reported and skipped,
//   not written.
// ⚠ The clock is FROZEN (wall clock steps only per knob/jog detent; the UI
//   clock follows the tick count), and Math.random is seeded, so a blink always
//   lands on the same phase and re-runs are byte-identical.
import { W, H, resetFb, currentFb, writePng } from './render_fb.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

/* ── the host draw primitives render_fb does not carry ───────────────────── */
globalThis.draw_rect = (x, y, w, h, v) => {
    globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v);
};
/* The REAL semantics (removes half the ink), as audit_screens has it. */
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, v);
};
/* draw_line / fill_circle / draw_circle / draw_arc: line-for-line ports of
 * src/host/js_display.c, which the module editor's knob widgets call. A guess
 * here would make every module page wrong for the wrong reason. */
globalThis.draw_line = (x0, y0, x1, y1, v) => {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    let dx = x1 - x0, dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    dx = Math.abs(dx); dy = Math.abs(dy);
    if (dx === 0) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) globalThis.set_pixel(x0, y, v); return; }
    if (dy === 0) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) globalThis.set_pixel(x, y0, v); return; }
    let err = dx - dy;
    for (;;) {
        globalThis.set_pixel(x0, y0, v);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
};
globalThis.fill_circle = (cx, cy, r, v) => {
    cx |= 0; cy |= 0; r |= 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) globalThis.set_pixel(cx + dx, cy + dy, v);
};
function plotArcPixel(cx, cy, dx, dy, start, sweep, v) {
    if (sweep < 360) {
        let a = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (a < 0) a += 360;
        let delta = a - start;
        if (delta < 0) delta += 360;
        if (delta > sweep) return;
    }
    globalThis.set_pixel(cx + dx, cy + dy, v);
}
globalThis.draw_arc = (cx, cy, r, startDeg, sweepDeg, v) => {
    cx |= 0; cy |= 0; r |= 0; startDeg |= 0; sweepDeg |= 0;
    if (r < 0) return;
    if (r === 0) { globalThis.set_pixel(cx, cy, v); return; }
    if (sweepDeg >= 360) sweepDeg = 360;
    if (sweepDeg <= 0) return;
    const start = ((startDeg % 360) + 360) % 360;
    for (let dy = -r; dy <= r; dy++) {
        const dx = Math.trunc(Math.sqrt(r * r - dy * dy) + 0.5);
        plotArcPixel(cx, cy, dx, dy, start, sweepDeg, v);
        if (dx !== 0) plotArcPixel(cx, cy, -dx, dy, start, sweepDeg, v);
    }
    for (let dx = -r; dx <= r; dx++) {
        const dy = Math.trunc(Math.sqrt(r * r - dx * dx) + 0.5);
        plotArcPixel(cx, cy, dx, dy, start, sweepDeg, v);
        if (dy !== 0) plotArcPixel(cx, cy, dx, -dy, start, sweepDeg, v);
    }
};
globalThis.draw_circle = (cx, cy, r, v) => globalThis.draw_arc(cx, cy, r, 0, 360, v);
globalThis.flush_display = () => {};
globalThis.host_flush_display = () => {};
/* The Screen view (HUD_OUT=<dir>): play a connected viewer and keep each
 * screen's published description beside its PNG — the browser's fixtures. */
const HUD_OUT = process.env.HUD_OUT || '';
let hudLast = null;
/* Always "a viewer is watching": a pad map reads its labels from the published description. */
globalThis.host_ui_publish = (json) => { if (json) hudLast = json; return true; };

/* ── the engine, as a fixture ───────────────────────────────────────────────
 * ENGINE answers host_module_get_param (the dAVEBOx DSP); SLOT[n] answers
 * shadow_get_param for chain slot n (the Schwung chains). Only what a screen
 * READS is here — the values a real session would report for the demo set. */
const ENGINE = { bpm: '120' };
/* The demo sample's waveform, at any zoom: a drum break — a hit every 1/16
 * (6000 frames), kick / hat / snare / hat with ghosts, each decaying — so a
 * zoomed window (tN_au_wave_C_A_B, which the editors ask for) and the
 * whole-file peaks (tN_au_peaks_C) are one sound, as the engine's are. The
 * engine's format: 128 columns, each a signed min and max byte in hex. */
const BREAK_HIT = 6000, BREAK_TAU = 1700;
const BREAK_LVL = [1.0, 0.3, 0.55, 0.25, 0.85, 0.3, 0.45, 0.35, 0.95, 0.3, 0.6, 0.5, 0.85, 0.25, 0.4, 0.7];
function breakAmp(a, b) {
    /* the loudest point of frames [a, b): a hit inside, else the last one's tail */
    let m = 0;
    for (let h = Math.floor(a / BREAK_HIT) * BREAK_HIT; h < b; h += BREAK_HIT) {
        const lvl = BREAK_LVL[(h / BREAK_HIT) % 16];
        m = Math.max(m, h >= a ? lvl : lvl * Math.exp(-(a - h) / BREAK_TAU));
    }
    return m;
}
function breakCols(A, B) {
    let s = '';
    for (let k = 0; k < 128; k++) {
        const a = A + (B - A) * k / 128, b = Math.max(a + 1, A + (B - A) * (k + 1) / 128);
        const v = Math.round(breakAmp(a, b) * 120);
        s += ((256 - v) & 255).toString(16).padStart(2, '0') + v.toString(16).padStart(2, '0');
    }
    return s;
}
globalThis.host_module_get_param = (k) => {
    if (ENGINE[k] !== undefined) return ENGINE[k];
    const w = ENGINE.breakTrack !== undefined && new RegExp('^t' + ENGINE.breakTrack + '_au_wave_\\d+_(\\d+)_(\\d+)$').exec(k);
    return w ? breakCols(+w[1], +w[2]) : '';
};
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
const SLOT = Array.from({ length: 8 }, () => ({}));   /* one chain slot per track (CHAIN_SLOTS) */
globalThis.shadow_get_param = (slot, k) => {
    const m = SLOT[slot | 0] || {};
    return m[k] !== undefined ? m[k] : '';
};
globalThis.shadow_set_param = () => 1;
/* a channel strip as the host answers its bulk `strip` read, and the comp's reduction */
const STRIP_KEYS = ['eq_low', 'eq_mid', 'eq_mid_freq', 'eq_high', 'comp'];
const stripOn = (t, strip, gr) => {
    SLOT[t]['slot:strip'] = strip; SLOT[t]['slot:comp_gr'] = gr;
    strip.split(' ').forEach((v, k) => { SLOT[t]['slot:' + STRIP_KEYS[k]] = v; });   /* the Session mixer reads each key */
};
const stripsOff = () => { for (const m of SLOT) for (const k of Object.keys(m)) if (/strip|eq_|comp/.test(k)) delete m[k]; };
const busStripOn = (b, strip) => {
    SLOT[0]['move_fx:' + b + ':strip'] = strip;
    strip.split(' ').forEach((v, k) => { SLOT[0]['move_fx:' + b + ':' + STRIP_KEYS[k]] = v; });
};
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.shadow_save_state_now = () => true;
for (const fn of ['host_system_cmd', 'host_vol_block', 'host_edit_cc_block', 'set_led',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_autosave_hold', 'host_autosave_kick', 'shadow_restore_knob_leds',
                  'host_trace_begin', 'host_trace_end', 'host_send_midi', 'move_midi_inject_to_move', 'host_set_led'])
    globalThis[fn] = () => 0;
/* The LEDs, as the hardware would show them: every pad, step and button write the UI sends, and
 * any palette entry it rewrites. A pad map in the manual is drawn from this, so its colours are
 * the real UI's, not a hand-picked copy. Pads are notes 68-99 (bottom-left first), steps 16-31. */
const LED = { note: new Array(128).fill(0), anim: new Array(128).fill(0), from: new Array(128).fill(0), cc: new Array(128).fill(0), pal: {} };
let sysex = [];
globalThis.move_midi_internal_send = (p) => {
    if (!p || p.length < 4) return 1;
    for (let i = 0; i + 3 < p.length; i += 4) {
        const cin = p[i] & 0x0F, st = p[i + 1] & 0xF0, ch = p[i + 1] & 0x0F;
        if (cin >= 4 && cin <= 7) {                     /* SysEx: start/continue, then the end */
            sysex.push(...p.slice(i + 1, i + 1 + (cin === 5 ? 1 : cin === 6 ? 2 : 3)));
            if (cin !== 4) {
                const b = sysex; sysex = [];
                if (b[0] === 0xF0 && b[6] === 0x03 && b.length >= 14) {
                    const v = (lo, hi) => lo | (hi << 7);
                    LED.pal[b[7]] = [v(b[8], b[9]), v(b[10], b[11]), v(b[12], b[13])];
                }
            }
        } else if (st === 0x90) {
            const n = p[i + 2];
            LED.from[n] = ch ? LED.note[n] : 0;   /* a pulse or blink runs from the colour set just before it */
            LED.note[n] = p[i + 3]; LED.anim[n] = ch;
        }
        else if (st === 0xB0) LED.cc[p[i + 2]] = p[i + 3];
    }
    return 1;
};
const ledShot = () => ({
    pads: LED.note.slice(68, 100), padAnim: LED.anim.slice(68, 100), padFrom: LED.from.slice(68, 100),
    steps: LED.note.slice(16, 32), stepAnim: LED.anim.slice(16, 32), pal: { ...LED.pal },
});
/* Files the UI reads, by path suffix (projects.json, a project's name tag, the
 * snapshot manifest...). */
const FILES = {};
globalThis.host_read_file = (path) => {
    const p = String(path);
    for (const k of Object.keys(FILES)) if (p.endsWith(k)) return FILES[k];
    return '';
};
globalThis.host_file_exists = (path) => { const p = String(path); return Object.keys(FILES).some((k) => p.endsWith(k)); };
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
/* The host's own view of the Shift key — the tick HEALS a Shift it thinks was
 * released, so it must agree with the rig's presses. */
let SHIFT_DOWN = 0;
globalThis.shadow_get_shift_held = () => SHIFT_DOWN;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.param_view_get_mode = () => 1;
globalThis.tts_get_enabled = () => false;
globalThis.host_seed_module_defaults = () => [0, 0];

/* ── the filesystem the scans read: installed modules, and a user folder with
 * two MIDI files (bytes built below), served through audit_loader's os/std
 * hooks. ─────────────────────────────────────────────────────────────────── */
const MODULES = {
    sound_generators: [['dx7', 'DX7'], ['jv880', 'JV-880'], ['nusaw', 'NuSaw'], ['obxd', 'OB-Xd']],
    audio_fx: [['freeverb', 'Freeverb'], ['rrverb10', 'RRVerb-10'], ['tapedelay', 'Tape Delay'], ['chorus', 'Chorus']],
    midi_fx: [],
};
for (const [dir, list] of Object.entries(MODULES))
    for (const [id, name] of list)
        FILES['/modules/' + dir + '/' + id + '/module.json'] = JSON.stringify({
            id, name, component_type: dir === 'sound_generators' ? 'sound_generator' : dir.replace(/s$/, '') });
/* Two Standard MIDI Files, as bytes: a two-part piece (a tempo track, right
 * and left hands, 12 bars) and a drum groove (one note no pad plays). The same
 * construction tools/preview_midi_import.mjs uses. */
function smf() {
    const vlq = (n) => { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; };
    const ascii = (x) => [...x].map((c) => c.charCodeAt(0));
    const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const chunk = (id, b) => [...ascii(id), ...be32(b.length), ...b];
    const trackOf = (notes, name, ch) => {
        const ev = []; for (const n of notes) ev.push([n.t, 0x90 | ch, n.p, n.v], [n.t + n.g, 0x80 | ch, n.p, 0]);
        ev.sort((a, b) => a[0] - b[0]);
        const b = [0, 0xff, 0x03, name.length, ...ascii(name)]; let last = 0;
        for (const [t, ...x] of ev) { b.push(...vlq(t - last), ...x); last = t; }
        b.push(0, 0xff, 0x2f, 0); return chunk('MTrk', b);
    };
    const walk = (seed, bars, lo, hi, density, step) => {
        let q = seed; const rnd = () => ((q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        const out = []; let pp = (lo + hi) >> 1;
        for (let t = 0; t < bars * 384; t += step) if (rnd() < density) {
            pp = Math.max(lo, Math.min(hi, pp + Math.round((rnd() - 0.5) * 7)));
            out.push({ t, g: step * (1 + (rnd() * 2 | 0)), p: pp, v: 90 + (rnd() * 30 | 0) });
        }
        return out;
    };
    const song = Uint8Array.from([...chunk('MThd', [0, 1, 0, 3, 0, 96]),
        ...chunk('MTrk', [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0]),
        ...trackOf(walk(7, 12, 60, 79, 0.7, 48), 'Right Hand', 0),
        ...trackOf(walk(3, 12, 36, 48, 0.5, 96), 'Left Hand', 1)]);
    const D = [];
    for (let b = 0; b < 4; b++) {
        for (let q = 0; q < 4; q++) D.push({ t: b * 384 + q * 96, g: 24, p: 36, v: 110 });
        D.push({ t: b * 384 + 96, g: 24, p: 38, v: 100 }, { t: b * 384 + 288, g: 24, p: 38, v: 100 });
        for (let e = 0; e < 8; e++) D.push({ t: b * 384 + e * 48, g: 24, p: 42, v: 80 });
    }
    D.push({ t: 0, g: 24, p: 20, v: 90 }, { t: 768, g: 24, p: 20, v: 90 });
    const beat = Uint8Array.from([...chunk('MThd', [0, 0, 0, 1, 0, 96]), ...trackOf(D, 'Groove', 9)]);
    return { song, beat };
}
const MIDI_FILES = { '/data/UserData/Bach Invention 8.mid': smf().song, '/data/UserData/Groove 3.mid': smf().beat };
const USER_DIRS = new Set(['/data/UserData/Downloads', '/data/UserData/UserLibrary']);
globalThis.__auditReaddir = (p) => {
    const m = p.match(/\/modules\/([a-z_]+)$/);
    if (m) return (MODULES[m[1]] || []).map(([id]) => id);
    if (p === '/data/UserData') return ['Downloads', 'UserLibrary', 'Bach Invention 8.mid', 'Groove 3.mid', 'readme.txt'];
    return [];
};
globalThis.__auditStat = (p) => USER_DIRS.has(p) ? { mode: 0o040000, size: 0 }
    : MIDI_FILES[p] ? { mode: 0o100000, size: MIDI_FILES[p].length }
    : p.endsWith('.txt') ? { mode: 0o100000, size: 90 } : null;
globalThis.__auditOpen = (p) => {
    const b = MIDI_FILES[p]; if (!b) return null; let pos = 0;
    return { read(buf, off, len) { const n = Math.min(len, b.length - pos);
                 new Uint8Array(buf, off, n).set(b.subarray(pos, pos + n)); pos += n; return n; },
             close() {}, seek() { return 0; }, tell() { return pos; } };
};

/* Wall-clock time is FROZEN, and moves only when a knob or the jog turns — by
 * the gap between detents of a steady hand — because the knob feel measures
 * the time between detents (ui_input_cc ccKnobDelta) and a clock that never
 * moves reads as one impossibly fast detent. Still deterministic. */
let WALL = 1756400000000;
Date.now = () => WALL;
const detentGap = () => { WALL += 40; };
/* ...and chance: a Dave is DEALT at random (pickSplashIdx), so the rig seeds
 * Math.random — the same run always deals the same Dave. */
{ let a = 0x2545F491; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* The bulk read the tick's prefetch uses, answered key-by-key from ENGINE —
 * the tests' own scaffold, so the rig and the suite share one idea of it. It
 * also puts the UI clock on the tick count (S.clockFollowTicks). */
await import('../tests/js/_bulk_get_stub.mjs');
await import('../ui/ui.js');
const { S } = await import('../ui/ui_state.mjs');
/* The gestures here are scripted, touch and release in one breath: no hold on
 * a release, or the next touch of the same knob reads as a flicker. */
S.touchHoldMs = 0;
const R = await import('../ui/ui_render.mjs');
const T = await import('../ui/ui_tick.mjs');
const C = await import('../ui/ui_constants.mjs');
const SND = await import('../ui/ui_sound.mjs');
const { computePadNoteMap } = await import('../ui/ui_drummodel.mjs');
const PURE = await import('../ui/ui_pure.mjs');
const MI = await import('../ui/ui_midi_import.mjs');
const AUTO = await import('../ui/ui_automation.mjs');
const AUD = await import('../ui/ui_audio.mjs');
const AED = await import('../ui/ui_audio_editor.mjs');
const PADMODE = await import('../ui/ui_pad_mode.mjs');
const SESS_EQ_MID = (await import('../ui/ui_engine.mjs')).SESS_EQ_MODE0 + 1;
const { MoveShift, MoveBack, MoveMute, MoveDelete, MoveLoop, MoveCapture, MoveUndo, MoveCopy, MovePlay, MoveRec }
    = await import('/data/UserData/schwung/shared/constants.mjs');
const { MoveNoteSession } = C;

/* ── gestures: the MIDI the hardware sends ───────────────────────────────── */
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
/* Everything a screen leaves held (a button, a knob touch, a pad) is let go
 * after its frame is taken, so no module's own state carries a press into the
 * next screen — S is restored between screens, but ui_sound / ui_midi_import
 * keep state of their own. */
const HELD_CC = new Set(), HELD_NOTE = new Set();
const press = (d1) => { if (d1 === 49) SHIFT_DOWN = 1; HELD_CC.add(d1); cc(d1, 127); };
const release = (d1) => { if (d1 === 49) SHIFT_DOWN = 0; HELD_CC.delete(d1); cc(d1, 0); };
const tap = (d1) => { press(d1); release(d1); };
const noteOn = (n, v = 100) => { HELD_NOTE.add(n); midi(0x90, n, v); };
/* ⚠ A knob-TOUCH release is a note-on at velocity 0-63 (the capacitive
 * sensors, notes 0-9); the UI ignores a 0x80 there, so a 0x80 would leave the
 * touch — and the automation gesture it opened — held forever. */
const noteOff = (n) => { HELD_NOTE.delete(n); if (n <= 9) midi(0x90, n, 0); else midi(0x80, n, 0); };
function letGo() {
    for (const n of [...HELD_NOTE]) noteOff(n);
    for (const d1 of [...HELD_CC]) release(d1);
}
const jog = (d) => { const n = Math.abs(d); for (let i = 0; i < n; i++) { detentGap(); cc(14, d > 0 ? 1 : 127); } };
const click = () => tap(3);
const knobTouch = (k) => noteOn(k, 127);
const knobRelease = (k) => noteOff(k);
const knobTurn = (k, d) => { const n = Math.abs(d); for (let i = 0; i < n; i++) { detentGap(); cc(71 + k, d > 0 ? 1 : 127); } };
const STEP = (i) => 16 + i;      /* step button i (0-based) */
const PAD = (i) => 68 + i;       /* pad i (0 = bottom-left) */
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; T._tickImpl(); } }
const HOLD_TICKS = 40;           /* comfortably past the tap/hold threshold at the rig's clock */

/* ── the demo project ────────────────────────────────────────────────────── */
const PROJECT_UUIDS = ['6f1c2a90-4d1e-4b7a-9c3e-0a1b2c3d4e01', '8a2d3b41-5e2f-4c8b-8d4f-1b2c3d4e5f02',
                       '9b3e4c52-6f30-4d9c-9e50-2c3d4e5f6a03', 'ac4f5d63-7041-4ead-af61-3d4e5f6a7b04'];
const DRUM = C.PAD_MODE_DRUM, COND = C.PAD_MODE_CONDUCT;
function setClipNotes(t, c, steps, notes, vel = 100, gate = 12) {
    for (const s of steps) {
        S.clipSteps[t][c][s] = 1;
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_notes'] = notes.join(' ');
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_vel'] = String(vel);
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_gate'] = String(gate);
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_nudge'] = '0';
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_iter'] = '0';
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_rand'] = '0';
        ENGINE['t' + t + '_c' + c + '_step_' + s + '_ratch'] = '0';
    }
    S.clipNonEmpty[t][c] = true;
}
function buildProject() {
    /* Every per-track bank parameter reads back at the DSP's default (the bank
     * definitions carry it), then a few are moved so the pages show a set that
     * has been worked on rather than a factory page. */
    for (let t = 0; t < 8; t++)
        for (const bank of C.BANKS) for (const k of bank.knobs)
            if (k && k.dspKey && k.scope === 'track') ENGINE['t' + t + '_' + k.dspKey] = String(k.def);
    /* The project's own settings, as the DSP reports them (syncClipsFromDsp
     * re-reads these; an unanswered read would zero them). */
    Object.assign(ENGINE, { key: '9', scale: '1', scale_aware: '1', launch_quant: '0', inp_quant: '0',
        midi_in_channel: '0', metro_on: '1', metro_vol: '100', swing_amt: '0', swing_res: '0',
        mute_state: '00000000', solo_state: '00000000' });
    Object.assign(ENGINE, {
        t0_noteFX_octave: '1', t0_noteFX_gate: '80', t0_noteFX_velocity: '-12',
        t0_harm_interval1: '2', t0_harm_interval2: '4',
        t0_delay_repeats: '3', t0_delay_level: '96', t0_delay_vel_fb: '-20',
        t0_tarp_style: '1',
    });
    S.currentSetName = 'Night Drive';
    S.currentSetUuid = PROJECT_UUIDS[0];
    /* The host's word on which project is open (hostIdentity). */
    SLOT[0].active_set_state = 'open\n\n0';
    SLOT[0].active_set = PROJECT_UUIDS[0] + '\nMove-Set-6f1c2a90';
    FILES['/dAVEBOx/name.txt'] = 'Night Drive';
    /* Track 5 has three saved track snapshots (hold Capture in Track View). */
    for (const n of [0, 1, 3]) FILES['/snapshots/t4/' + n + '/davebox.json'] = '{}';
    FILES['/projects.json'] = JSON.stringify({ projects: [
        { index: 0, uuid: PROJECT_UUIDS[0], name: 'Night Drive', color: 0 },
        { index: 1, uuid: PROJECT_UUIDS[1], name: 'Sketchbook', color: 1 },
        { index: 2, uuid: PROJECT_UUIDS[2], name: 'Live Set A', color: 2 },
        { index: 5, uuid: PROJECT_UUIDS[3], name: 'Drums Only', color: 3 },
    ] });
    S.padKey = 9; S.padScale = 1;            /* A minor */
    /* Routing as the manual's default: 1-4 Move, 5-8 Schwung. */
    /* T2 drums, T8 the Conductor, the rest melodic — in the engine (init's
     * track-config read) and in the mirror. */
    const MODES = [0, DRUM, 0, 0, 0, 0, 0, COND];
    for (let t = 0; t < 8; t++) {
        S.trackRoute[t] = t < 4 ? 1 : 0;
        S.trackChannel[t] = t + 1;
        S.trackPadMode[t] = MODES[t];
        Object.assign(ENGINE, { ['t' + t + '_route']: t < 4 ? 'move' : 'schwung', ['t' + t + '_channel']: String(t + 1),
                                ['t' + t + '_pad_mode']: String(MODES[t]), ['t' + t + '_midi_to']: '0' });
    }
    S.conductorTrack = 7;
    /* Chains: a track owns its slot (slot t = track t+1). T5-T7 carry a synth
     * and a reverb; the Move tracks' levels are their Move bus faders. */
    const chains = { 4: ['nusaw', 'NuSaw'], 5: ['obxd', 'OB-Xd'], 6: ['dx7', 'DX7'] };
    const lv = [1.0, 0.8, 0.6, 1.0, 0.9, 0.7, 1.2, 1.0], pan = [0.5, 0.5, 0.35, 0.5, 0.65, 0.5, 0.4, 0.5];
    const sa = [0.3, 0, 0.5, 0, 0.25, 0.6, 0.1, 0], sb = [0, 0.2, 0, 0, 0.4, 0, 0.3, 0];
    for (let t = 0; t < 8; t++) {
        /* This host has four insert blocks per chain (the fork's fx3/fx4). */
        for (const fx of ['fx1', 'fx2', 'fx3', 'fx4']) SLOT[t][fx + ':bypassed'] = '0';
        if (t < 4) Object.assign(SLOT[0], { ['move_fx:' + (t + 1) + ':volume']: String(lv[t]),
            ['move_fx:' + (t + 1) + ':pan']: String(pan[t]), ['move_fx:' + (t + 1) + ':send_a']: String(sa[t]),
            ['move_fx:' + (t + 1) + ':send_b']: String(sb[t]) });
        else Object.assign(SLOT[t], { 'slot:volume': String(lv[t]), 'slot:pan': String(pan[t]),
            'slot:send_a': String(sa[t]), 'slot:send_b': String(sb[t]) });
        if (chains[t]) Object.assign(SLOT[t], {
            'synth:module': chains[t][0], 'synth:name': chains[t][1],
            'fx1:module': 'freeverb', 'fx1:name': 'Freeverb',
            /* What a loaded module reports about itself: its parameters, and
             * the page layout the editor draws. */
            'synth:chain_params': JSON.stringify([
                { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
                { key: 'reso', name: 'Resonance', type: 'float', min: 0, max: 1, step: 0.01 },
                { key: 'attack', name: 'Attack', type: 'float', min: 0, max: 1, step: 0.01 },
                { key: 'release', name: 'Release', type: 'float', min: 0, max: 1, step: 0.01 },
                { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
                { key: 'detune', name: 'Detune', type: 'float', min: 0, max: 1, step: 0.01 },
                { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 },
                { key: 'level', name: 'Level', type: 'float', min: 0, max: 1, step: 0.01 },
            ]),
            'synth:cutoff': '0.62', 'synth:reso': '0.3', 'synth:attack': '0.05', 'synth:release': '0.4',
            'synth:shape': 'Saw', 'synth:detune': '0.25', 'synth:voices': '6', 'synth:level': '0.8',
            'fx1:chain_params': JSON.stringify([
                { key: 'room_size', name: 'Room Size', type: 'float', min: 0, max: 1, step: 0.01 },
                { key: 'mix', name: 'Mix', type: 'float', min: 0, max: 1, step: 0.01 },
            ]),
            'fx1:room_size': '0.7', 'fx1:mix': '0.3',
        });
    }
    /* Track 5's MACROS: a filter pair, the reverb mix, the track level, a NOTE
     * FX bank knob, and K6 driving two parameters at once (its own ranges). */
    S.trackMacros[4] = [
        { v: 0.62, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] },
        { v: 0.3, legs: [{ kind: 'chain', comp: 'synth', key: 'reso', lo: 0, hi: 1 }] },
        { v: 0.3, legs: [{ kind: 'chain', comp: 'fx1', key: 'mix', lo: 0, hi: 1 }] },
        { v: 0.9, legs: [{ kind: 'level', key: 'volume', lo: 0, hi: 1 }] },
        { v: 0.25, legs: [{ kind: 'bank', bank: 1, k: 5, lo: 0, hi: 1 }] },
        { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.9 },
                         { kind: 'chain', comp: 'fx1', key: 'room_size', lo: 0.8, hi: 0.3 }] },
        null, null,
    ];
    /* Clips. T1: a 2-page bass line in A; T3: chords; T5/T6: leads; T8: a progression. */
    setClipNotes(0, 0, [0, 3, 6, 8, 10, 16, 19, 22, 24, 28], [45]);
    setClipNotes(0, 0, [4, 20], [52]);
    S.clipLength[0][0] = 32;
    setClipNotes(0, 1, [0, 4, 8, 12], [45]);
    setClipNotes(0, 2, [0, 8], [48]);
    setClipNotes(2, 0, [0, 8], [57, 60, 64]);
    setClipNotes(2, 1, [0], [53, 57, 60]);
    setClipNotes(4, 0, [0, 2, 4, 7, 9, 12, 14], [69]);
    setClipNotes(5, 0, [0, 6, 12], [64]);
    setClipNotes(5, 1, [0], [60]);
    setClipNotes(7, 0, [0, 16], [57]);
    S.clipLength[7][0] = 32;
    /* T2 drums: kick / snare / hats on lanes 0 / 1 / 2, as the DSP reports
     * them — a track switch RE-READS all of this (resyncDrumTrack), so the
     * fixture has to live in the engine, not just in the JS mirror. */
    const lanes = { 0: [0, 4, 8, 12], 1: [4, 12], 2: [0, 2, 4, 6, 8, 10, 12, 14], 3: [14] };
    const meta = [];
    for (let l = 0; l < 32; l++) {
        const hits = lanes[l] || [];
        let str = '';
        for (let st = 0; st < 256; st++) str += hits.includes(st) ? '1' : '0';
        ENGINE['t1_l' + l + '_steps'] = str;
        ENGINE['t1_l' + l + '_pfx_snapshot'] = '100 0 0 10 127 0 0 0 0 1 0';
        ENGINE['t1_l' + l + '_playback_dir'] = '0';
        meta.push(String(36 + l), hits.length ? '1' : '0');
        for (let i = 0; i < 256; i++) S.drumLaneSteps[1][l][i] = str[i];
        S.drumLaneHasNotes[1][l] = hits.length > 0;
        for (const st of hits) Object.assign(ENGINE, {
            ['t1_l' + l + '_step_' + st + '_vel']: '110', ['t1_l' + l + '_step_' + st + '_gate']: '12',
            ['t1_l' + l + '_step_' + st + '_nudge']: '0', ['t1_l' + l + '_step_' + st + '_iter']: '0',
            ['t1_l' + l + '_step_' + st + '_rand']: '0', ['t1_l' + l + '_step_' + st + '_ratch']: '0',
        });
    }
    meta.push('0', '0');
    ENGINE.t1_drum_meta = meta.join(' ');
    Object.assign(ENGINE, { t1_l0_length: '16', t1_l0_loop_start: '0', t1_l0_tps: '24',
                            t1_c0_drum_has_content: '1', t1_c1_drum_has_content: '1',
                            /* the lane's repeat groove: gate mask, 8 velocities (255 = Thru), 8 nudges, length */
                            t1_l0_repeat_state: '255 127 60 100 45 127 60 110 255 0 0 0 0 0 0 0 0 8' });
    S.drumClipNonEmpty[1][0] = true; S.drumClipNonEmpty[1][1] = true;
    /* Playing, 120 BPM, clip A everywhere, step 21 of track 1's 32. */
    S.playing = true;
    for (const t of [0, 1, 2, 4, 5, 7]) S.trackClipPlaying[t] = true;
    for (let t = 0; t < 8; t++) { S.trackCurrentStep[t] = 21 % S.clipLength[t][0]; }
    S.trackCurrentPage[0] = 1; S.drumCurrentStep[1] = 5;
    S.overviewCache = Array.from({ length: 8 }, (_, t) =>
        Array.from({ length: 16 }, (_, c) => !!(S.clipNonEmpty[t][c] || S.drumClipNonEmpty[t][c])));
    S.activeTrack = 0;
    S.activeBank = 0;
    S.sessionView = false;
    computePadNoteMap();
}

/* ── a restorable baseline ───────────────────────────────────────────────── */
function cloneVal(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Set) return new Set([...v].map(cloneVal));
    if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, cloneVal(x)]));
    if (ArrayBuffer.isView(v)) return v.slice();
    if (Array.isArray(v)) return v.map(cloneVal);
    const p = Object.getPrototypeOf(v);
    if (p !== Object.prototype && p !== null) return v;
    const o = Object.create(p);
    for (const k of Object.keys(v)) o[k] = cloneVal(v[k]);
    return o;
}
const SK = Object.keys(S);
let BASE = null, BASE_ENGINE = null;
function restore() {
    SHIFT_DOWN = 0;
    if (SND.soundOpen()) SND.soundExit();
    for (const k of Object.keys(S)) if (!SK.includes(k)) delete S[k];
    for (const k of SK) S[k] = cloneVal(BASE[k]);
    for (const k of Object.keys(ENGINE)) delete ENGINE[k];
    Object.assign(ENGINE, BASE_ENGINE);
}

/* The engine holds the project BEFORE the UI starts, so init()'s own reads
 * (key, scale, Scale Aware, metronome, mute state...) find it — then the JS
 * mirrors are asserted again, because init's clip sync re-reads per-step keys
 * this fixture only answers for the steps that hold notes. */
buildProject();
globalThis.init();
S.awaitingProjectSelect = false; S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
ticks(3);
buildProject();
ticks(3);
buildProject();          /* a tick may have re-derived a mirror; the project is re-asserted */
BASE = cloneVal(Object.fromEntries(SK.map((k) => [k, S[k]])));
BASE_ENGINE = { ...ENGINE };

/* ── gesture helpers built on the above ──────────────────────────────────── */
/* Reach a bank with the bank map (the real gesture since 2026-10-04: the jog
 * walk retired) — hold the jog, tap its pad, let go — and, with `open`, hold
 * its page up for the shot (no click locks a page now; Shift + hold Step 11
 * and the editors are what hold one on the device). A DOOR (CONFIG,
 * AUTOMATION) is reached the way a restored bank is: recorded, then the tick
 * opens it. */
function mapPadFor(b) {
    const pm = S.trackPadMode[S.activeTrack];
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        if (PURE.bankPadMapCellAt(pm, S.activeTrack, c, r) === b) return PURE.bankMapPadForCell(c, r);
    return -1;
}
function mapTap(pad) {
    midi(0xB0, 3, 127); midi(0x90, pad, 100); midi(0x80, pad, 0); midi(0xB0, 3, 0); ticks(2);
}
function toBank(b, open = true) {
    if (PURE.bankIsDoor(S.trackPadMode[S.activeTrack], b)) {
        S.activeBank = b; S.trackActiveBank[S.activeTrack] = b; ticks(4);
        if (open) { S.bankCardLatched = true; ticks(2); }
        return;
    }
    if (S.activeBank !== b) {
        const pad = mapPadFor(b);
        if (pad < 0) throw new Error('bank ' + b + ' is not on the map');
        mapTap(pad);
    }
    if (S.activeBank !== b) throw new Error('the map never reached bank ' + b + ' (at ' + S.activeBank + ')');
    if (open) { S.bankCardLatched = true; ticks(2); }
}
function selectTrack(t) {
    /* The bank map's track buttons (Steps 1-8 while the jog is held) —
     * Track View's track select. The active track's own step does nothing,
     * and the pick's "TRACK n" card is ticked away so it is not in the shot. */
    if (S.activeTrack === t) return;
    mapTap(16 + t);
    if (S.activeTrack !== t) throw new Error('the map\'s track button did not select track ' + (t + 1));
    for (let i = 0; i < 200 && S.tickCount <= S.actionPopupEndTick; i++) ticks(1);
    ticks(3);
}

/* ── the screens ─────────────────────────────────────────────────────────── */
const shots = [];
const failures = [];
/* Blinks (a muted track number, the ALL of ALL LANES, the Conductor's C-)
 * are drawn off the UI clock; tick forward until the clock sits in the ON
 * half of every period the screens use (220 / 440 ms), so a blinking element
 * is photographed lit. `{ align: false }` for a screen holding a timed notice
 * that the extra ticks could expire. */
function alignBlink() {
    for (let g = 0; g < 100 && (S.clockMs % 880) >= 200; g++) ticks(1);
}
function screen(slug, section, title, caption, setup, opts = {}) {
    restore();
    /* Import MIDI keeps its own module state (it is modal over the card), so
     * the baseline restore cannot reach it: close it, or it swallows the next
     * screen's gestures. */
    MI.miClose();
    try {
        setup();
        if (opts.align !== false) alignBlink();
        resetFb(); globalThis.clear_screen();
        R.refreshInstrAbbrev();
        R.drawUI();
        const _hud = hudLast ? JSON.parse(hudLast) : null;
        if (_hud) _hud.oled = { fmt: 'rows', data: pack(currentFb()) };   /* the preview's stand-in for the live frame */
        const po = opts.pads || (process.env.PADS_ALL ? {} : null);
        const fbNow = currentFb().slice();
        if (po) ticks(po.settle ?? 8);   /* the LED painter runs from tick: let it catch up */
        const pads = po ? { ...ledShot(), labels: typeof po.labels === 'function' ? po.labels(_hud) : (po.labels || null),
                            stepLabels: po.stepLabels || null, noPads: !!po.noPads } : null;
        if (pads && po.steps === false) { pads.steps = null; pads.stepAnim = null; }
        shots.push({ slug, section, title, caption, fb: fbNow, hud: _hud, pads });
        letGo();
        /* state restore() cannot reach (a module's own, the engine's slots):
         * a screen that changes it puts it back */
        if (opts.after) opts.after();
    } catch (e) {
        try { letGo(); } catch (e2) { /* the screen already failed */ }
        failures.push({ slug, error: String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) });
    }
}

/* 5 / 6 — Track View */
screen('track-melodic-playing', '3.4 Reading the Screen', 'Track View — melodic track playing',
    'The Track View overview shows the bank and the instrument, the key, each track\'s clip, the page bar and what the controls do.',
    () => {});
screen('track-audio', '16.1 How It Plays', 'Track View — an Audio track',
    'An Audio track\'s overview shows its clip\'s sample and the knobs of the bank it is on.',
    () => {
        /* as the project fixture sets the others: the engine and the mirror */
        S.trackPadMode[4] = C.PAD_MODE_AUDIO; ENGINE.t4_pad_mode = String(C.PAD_MODE_AUDIO);
        selectTrack(4); ticks(2);
        if (S.activeTrack !== 4 || S.trackPadMode[4] !== C.PAD_MODE_AUDIO) throw new Error('T5 is not the active Audio track');
    });
/* An Audio (mode 0, Loop) or Slicer (mode 1) T5 with a sample loaded and
 * playing at frame 24000 — the engine's answers, as the audio tests give them */
function sampledTrack(slicer) {
    const PEAKS = breakCols(0, 96000);
    /* a Slicer's range sits inside the file (Start 1/16 in, End 1/16 short),
     * cut Even into 8 — so the audio outside it shows dotted, as it does on
     * the device */
    const RS = slicer ? 6000 : 0, RE = slicer ? 90000 : 96000;
    const info = '2 0 ' + (slicer ? 1 : 0) + ' 8 1 16 ' + RS + ' ' + RE + ' 0 0 96000 48000 2 0 0 0 8 0 0 96000 840 8 50 0 0|Break Phenom 84 bpm.wav';
    const marks = Array.from({ length: 8 }, (_, k) => (RS + k * (RE - RS) / 8) + ' ' + (RS + (k + 1) * (RE - RS) / 8)).join(' ');
    const pm = slicer ? C.PAD_MODE_SLICER : C.PAD_MODE_AUDIO;
    S.trackPadMode[4] = pm;
    Object.assign(ENGINE, { breakTrack: 4, t4_pad_mode: String(pm), t4_au_dir: '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples',
        t4_au_info_0: info, t4_au_info_16: info, t4_au_peaks_0: PEAKS, t4_au_peaks_16: PEAKS,
        t4_au_marks_0: marks, t4_au_marks_16: marks, t4_au_pos: '1 24000 2', t4_au_lazy: '0 0 0',
        t4_au_all_0: '0 x 0 0 0 0', t4_au_all_16: '0 x 0 0 0 0' });
    selectTrack(4); AUD.auMarkStale(4, slicer ? 16 : 0); AUD.auMarkStale(4, 0);
    S.playing = true; ticks(12);
}
screen('track-audio-playing', '16.1 How It Plays', 'Track View — an Audio track playing',
    'While an Audio track plays, its overview shows the clip\'s Mode and its sample\'s Tempo and name.',
    () => { sampledTrack(false); if (!AUD.auPos().on) throw new Error('no playhead read'); });
/* SAMPLE (an Audio clip's editor) and the SLICER editor, opened as the
 * instrument shortcut opens them, their pages reached with the jog */
function openSample() { sampledTrack(false); AED.openWave(4, 'sample'); ticks(4); if (!S.auEditor) throw new Error('SAMPLE did not open'); }
function openSlicer() { sampledTrack(true); AED.openWave(4); ticks(4); if (!S.auEditor || S.auEditor.ed !== 'slicer') throw new Error('the SLICER editor did not open'); }
function toPage(p) {
    const pg = () => S.auEditor.page | 0;          /* SAMPLE opens with no page set: page 1 */
    for (let g = 0; g < 4 && pg() !== p; g++) { jog(pg() < p ? 1 : -1); ticks(2); }
    if (pg() !== p) throw new Error('the jog never reached page ' + (p + 1));
}
screen('sample-loop', '16.2 The SAMPLE Editor', 'SAMPLE — an Audio clip',
    'SAMPLE on an Audio clip shows the waveform with the playhead on it, and Start and End over it.',
    () => { openSample(); });
screen('sample-loop-p2', '16.2 The SAMPLE Editor', 'SAMPLE — TIME (page 2)',
    'SAMPLE\'s TIME page has Sync, Warp, Nudge and Offset on top. The sample\'s own Tempo and Bars are framed together below.',
    () => { openSample(); toPage(1); });
screen('sample-loop-p3', '16.2 The SAMPLE Editor', 'SAMPLE — SOUND (page 3)',
    'SAMPLE\'s SOUND page has Pitch, Detune, Revrs and Gain, on the knobs that page 1 gives Pitch, Detune and Gain.',
    () => { openSample(); toPage(2); });
screen('slices-slicer', '17.2 The SLICER Editor', 'The SLICER editor — page 1, SLICES',
    'Page 1 shows the slices on the waveform, with the picked one bracketed and the audio outside the range dotted. The corner brackets mean that clicking the jog enters the slice editor.',
    () => { openSlicer(); });
screen('slicer-sample', '17.2 The SLICER Editor', 'The SLICER editor — page 3, SAMPLE',
    'Page 3 shows a strip of the whole file with the range on it, over the sample\'s knobs: Sync, Pitch, Detune, Tempo and Gain.',
    () => { openSlicer(); toPage(2); });
screen('slicer-inside', '17.3 Making Slices', 'The SLICER editor — inside the slice editor',
    'Click the jog on page 1 to enter the slice editor. Turn the jog to move the cursor through the range, and click it to add a slice where the cursor stands.',
    () => {
        openSlicer(); click(); ticks(2);
        if (!AED.slcInside(S.auEditor)) throw new Error('the click did not enter the slice editor');
        jog(40); ticks(2);
    });
screen('slicer-even', '17.3 Making Slices', 'The SLICER editor — chopping Even',
    'In the SLICE menu, choose Even and turn the jog to set the count. The range is cut into that many equal slices as you turn.',
    () => {
        openSlicer();
        press(MoveShift); click(); release(MoveShift); ticks(2);
        const ed = S.auEditor;
        if (!ed.pick || ed.pick.menu !== 'slices') throw new Error('[Shift] + click did not open the SLICE menu');
        const want = AED.auPickRows(ed).findIndex((r) => r.id === 'even');
        if (want < 0) throw new Error('the SLICE menu has no Even');
        for (let g = 0; g < 10 && ed.pick && ed.pick.sel !== want; g++) { jog(ed.pick.sel < want ? 1 : -1); ticks(1); }
        click(); ticks(4);
        if (S.auEditor.pick || !S.auEditor.chop || S.auEditor.chop.kind !== 'even') throw new Error('Even did not open');
    });
/* REMIX on the Slicer: its bank card, and the pop-up a turn brings up. The
 * engine's answers are its own — tN_remix_orders and tN_remix_map dumped from
 * the DSP (tests' harness) for Chop 2+4+4+4+2 (type 3), the RS7000's
 * Reverse 9 (setting 24), Revrs 40 %, Stutr 30 %, Gaps 15 %, Pitch +5. */
const RMX_DEMO = [1, 3, 24, 1, 100, 40, 30, 15, 5, 0, 100];
const RMX_ENGINE = {
    t4_remix_orders: '39 42 1.6.0 26.8.0 32.10.0 48.10.0 64.10.0 27.10.0 58.10.0 6.12.0 10.12.0 68.12.0 60.14.0 18.14.0 2.14.0 3.14.0 56.14.0 4.14.0 71.14.0 5.14.0 57.14.0 17.14.0 21.14.0 19.14.0 23.14.0 54.14.0 22.14.0 55.14.0 0.14.0 16.14.0 36.14.0 13.16.0 40.16.0 14.16.0 8.16.0 15.16.0 59.16.0 7.16.0 12.16.0 9.16.0 11.16.0 24.16.0 74.16.0 31.16.0',
    t4_remix_map: '4.16.3 5.0.3 -1.24.0 -1.8.0 0.1.3 1.1.3 4.16.3 5.0.3 2.3.3 7.0.-5 0.17.3 1.1.3 7.2.-5 3.1.3 4.18.3 5.0.3',
};
function remixBank(rev = 40) {
    sampledTrack(true);
    Object.assign(ENGINE, RMX_ENGINE);
    S.rmxSet[4] = RMX_DEMO.slice(); S.rmxSet[4][5] = rev; S.rmxMapDirty = true; S.rmxOrders = null;
    toBank(C.BANK_REMIX); ticks(4);
}
screen('remix-card', '18.1 The REMIX Bank', 'REMIX bank',
    'The REMIX bank shows whether it is on or off, the Chop, the Order and the five amounts.',
    () => { remixBank(); if (AUD.rmxOrderText(4) !== '40') throw new Error('the Order did not read: ' + AUD.rmxOrderText(4)); });
screen('remix-popup', '18.2 Reading the Pop-up', 'REMIX — turning a knob',
    'Turning Revrs draws a bar with a column per 1/16. A column is hollow when reversed, dotted when stuttered, has a caret when pitched and is empty when silent.',
    () => {
        remixBank(39); S.playing = false;   /* Revrs one short: the turn makes it the 40 */
        knobTouch(4); knobTurn(4, 1); ticks(3);
        if ((S.rmxSet[4][5] | 0) !== 40) throw new Error('Revrs is ' + S.rmxSet[4][5] + ', not the 40 the map was dumped at');
        if (!S.rmxCard || !S.rmxMap) throw new Error('no REMIX pop-up');
    });
screen('track-melodic-chord-held', '8.1 Playing and Placing Notes', 'Track View — naming a held chord',
    'When you hold three pads, the chord you are playing is named in brackets at the right of the key/scale row.',
    () => {
        /* An A-minor triad from whichever octave the pads offer. */
        const pitch = (i) => S.padNoteMap[i] + S.trackOctave[S.activeTrack] * 12;
        const at = (n) => S.padNoteMap.findIndex((_, i) => S.padNoteMap[i] !== 0xFF && pitch(i) === n);
        let root = -1;
        for (let i = 0; i < 32 && root < 0; i++)
            if (S.padNoteMap[i] !== 0xFF && pitch(i) % 12 === 9 && at(pitch(i) + 3) >= 0 && at(pitch(i) + 7) >= 0) root = i;
        if (root < 0) throw new Error('no pads make an A minor triad');
        for (const n of [pitch(root), pitch(root) + 3, pitch(root) + 7]) noteOn(PAD(at(n)), 100);
        ticks(2);
    });
screen('track-empty-clip', '7.3 Switching Clips', 'Track View — an empty clip',
    'Track 4 on an empty clip shows nothing on the steps and a single page in the bar.',
    () => { selectTrack(3); });
screen('track-drum', '9.1 The Drum Pads', 'Track View — drum track',
    'A drum track shows the lane bank and the selected lane\'s note.',
    () => { selectTrack(1); });
screen('track-conductor', '25. The Conductor', 'Track View — the Conductor',
    'On the Conductor track (T8), the banks are headed C- and the header names it [CNDT].',
    () => { selectTrack(7); });

/* 12 — Session View */
screen('session-overview', '22. Session View', 'Session View',
    'Session View shows the mixer page the jog is on and each track\'s playing clip.',
    () => { tap(MoveNoteSession); ticks(3); if (!S.sessionView) throw new Error('[Note/Session] did not switch view'); });

/* 3.5 / 9 / 10 — the banks (melodic) */
const MEL_BANKS = [
    [0, 'bank-clip', '12.1 The CLIP Bank', 'CLIP bank', 'Each cell shows the knob above it.'],
    [1, 'bank-notefx', '13.1 NOTE FX', 'NOTE FX bank', 'NOTE FX sets octave, offset, velocity, quantize, length, gate and random.'],
    [2, 'bank-harmony', '13.2 HARMONY', 'HARMONY bank', 'HARMONY adds an octave voice and three harmony intervals.'],
    [3, 'bank-delay', '13.3 DELAY', 'DELAY bank', 'DELAY sets rate, level, repeats, velocity and pitch feedback, gate, retrigger and random.'],
    [4, 'bank-seqarp', '13.4 SEQ ARP', 'SEQ ARP bank', 'SEQ ARP sets style, rate, octave, gate, steps mode, retrigger and sync.'],
    [5, 'bank-livearp', '13.5.1 LIVE ARP', 'LIVE ARP bank', 'LIVE ARP has the SEQ ARP controls plus Latch, for what you play live.'],
];
for (const [b, slug, section, title, caption] of MEL_BANKS)
    screen(slug, section, title, caption, () => { toBank(b); });

screen('bank-overview-walk', '4.1 The Bank Map', 'The bank pad map',
    'Hold the jog and the left 4×4 pads become the track\'s banks, one column per group. The screen draws the same map, with the current bank filled. Let go of the jog and the pads play again.',
    () => { toBank(3, false); press(3); ticks(2); if (!S.bankMapUp) throw new Error('holding the jog did not show the map'); });
screen('bank-overview-drum', '4.1 The Bank Map', 'The bank pad map on a drum track',
    'On a drum track, DRUM LANE and ALL LANES share one box because they are two views of the same lanes.',
    () => { selectTrack(1); toBank(0, false); press(3); ticks(2); if (!S.bankMapUp) throw new Error('holding the jog did not show the map'); });
screen('bank-clip-alt', '4.3 Touch and Click', 'CLIP bank — alternate parameters',
    'To switch a knob to its alternate parameter, touch it and click the jog. Here Res is Zoom, Shift is Nudge and Dir is Reverse Style.',
    () => { toBank(0); for (const k of [0, 2, 6]) { knobTouch(k); click(); knobRelease(k); } ticks(2);
            if (S.knobAlt !== (1 | 4 | 64)) throw new Error('touch + click did not flip: ' + S.knobAlt); });
screen('bank-knob-touched', '4.2 Playing a Bank', 'Touching a knob',
    'When you touch knob 1 on NOTE FX, the header spells out the parameter it controls.',
    () => { toBank(1); knobTouch(0); ticks(2); });
screen('bank-crop-touched', '4.3 Touch and Click', 'Touching a knob that takes a click',
    'The cells that take a click wear corner brackets. Touching CLIP\'s Crop knob names the action at the top, and the footer shows CLK and what clicking the jog will do.',
    () => { toBank(0); knobTouch(5); ticks(2); });
screen('bank-value-popup', '4.2 Playing a Bank', 'Turning a list parameter',
    'Turning SEQ ARP\'s Style knob opens its list over the page. The highlight follows the knob, here moved from Off to Down.',
    () => { toBank(4); knobTouch(0); knobTurn(0, 20); ticks(2); });
screen('bank-seqarp-steps', '13.4 SEQ ARP', 'SEQ ARP — per-step pitch editor',
    'Touch knob 5 (Steps) on SEQ ARP and click the jog to open the per-step editor. Knobs 1–8 set each step\'s pitch offset.',
    () => {
        toBank(4);
        knobTurn(1, 0);
        knobTouch(4); click(); knobRelease(4); ticks(2);
        if (!S.stepIntervalMode) throw new Error('touch K5 + click did not open the steps editor');
        knobTouch(2); knobTurn(2, 5); knobRelease(2);
        knobTouch(4); knobTurn(4, -3); knobRelease(4);
        ticks(2);
    });
screen('bank-seqarp-steps-vel', '13.4 SEQ ARP', 'SEQ ARP — per-step velocity',
    'Hold [Shift] in the per-step editor to show each step\'s velocity instead. Thru passes the played velocity.',
    () => {
        toBank(4); knobTouch(4); click(); knobRelease(4); ticks(2);
        if (!S.stepIntervalMode) throw new Error('touch K5 + click did not open the steps editor');
        press(MoveShift); ticks(2);
    });
screen('bank-step-idle', '8.6 Editing Notes', 'STEP bank — no step held',
    'With no step held, the STEP bank asks you to hold a step.',
    () => { toBank(C.BANK_STEP); });
screen('step-editor-melodic', '8.6 Editing Notes', 'Editing a held note',
    'Hold a step to see its note, then length, velocity, nudge and the per-step conditions.',
    () => {
        toBank(C.BANK_STEP);
        ENGINE['t0_c0_step_20_iter'] = String((2) | (3 << 4));
        ENGINE['t0_c0_step_20_rand'] = '75';
        ENGINE['t0_c0_step_20_ratch'] = '2';
        noteOn(STEP(4), 127); ticks(HOLD_TICKS);
        if (S.heldStep < 0 || !S.heldStepNotes.length) throw new Error('hold did not load the step');
    });
screen('step-editor-reveal', '8.6.1 Reaching the Note Settings From Any Bank', 'Revealing the held step from another bank',
    'Hold a step on any bank and turn the jog right. The STEP page for that note appears over the current screen.',
    () => {
        toBank(1);
        noteOn(STEP(4), 127); ticks(HOLD_TICKS);
        jog(1); ticks(2);
        if (!S.stepReveal) throw new Error('jog right did not reveal');
    });
screen('step-editor-chord', '8.5 Several Notes on One Step', 'A held step holding a chord',
    'On a step with three notes, the note box names the lowest and counts the rest (+2).',
    () => {
        selectTrack(2);
        toBank(C.BANK_STEP);
        noteOn(STEP(0), 127); ticks(HOLD_TICKS);
        if (S.heldStepNotes.length < 2) throw new Error('chord step not loaded: ' + S.heldStepNotes);
    });
screen('loop-view', '7.4.2 The Loop View', 'Loop view',
    'Hold [Loop] to show the clip length. The step buttons stand for pages, and turning the jog changes the length by a step.',
    () => { press(MoveLoop); ticks(2); });
screen('track-recording', '10.1 Recording', 'Recording',
    'Press [Record] while playing, and the header adds REC while the take runs.',
    () => { tap(MoveRec); ticks(2); if (!S.recordArmed) throw new Error('Rec did not arm'); });
screen('record-blocked', '10.1 Recording', 'Recording needs Forward',
    'Pressing [Record] on a clip set to another direction offers to bake it to Forward first.',
    () => {
        toBank(0); knobTouch(6); knobTurn(6, 12); knobRelease(6); ticks(2);
        tap(MoveBack); ticks(2);
        if (!(S.clipPlaybackDir[0][0] | 0)) throw new Error('Dir knob did not change direction');
        tap(MoveRec); ticks(2);
        if (!S.recordBlockedDialog) throw new Error('Rec did not raise the dialog');
    });
screen('notice-undo', '3.7 Copy, Delete and Undo', 'Undo feedback',
    'Pressing [Undo] names what it took back.',
    () => {
        press(MoveDelete); noteOn(STEP(3), 127); noteOff(STEP(3)); release(MoveDelete); ticks(2);
        if (!S.undoAvailable) throw new Error('[Delete] + step did not raise an undo unit');
        tap(MoveUndo); ticks(2);
    }, { align: false });

/* 7 — drum banks */
const DRUM_BANKS = [
    [0, 'bank-drumlane', '12.2 The DRUM LANE Bank', 'DRUM LANE bank', 'DRUM LANE sets the selected lane\'s grid: resolution, stretch, shift, legato, euclid, crop, direction and follow.'],
    [1, 'bank-drum-notefx', '13.1 NOTE FX', 'NOTE FX on a drum track', 'On a drum track, knobs 1 and 2 set the lane\'s MIDI note and knobs 3–6 shape that lane.'],
    [3, 'bank-drum-delay', '13.3 DELAY', 'DELAY on a drum track', 'On a drum track, DELAY\'s knobs 5–7 become gate, clock feedback and retrigger.'],
];
for (const [b, slug, section, title, caption] of DRUM_BANKS)
    screen(slug, section, title, caption, () => { selectTrack(1); toBank(b); });
screen('bank-allanes', '12.3 The ALL LANES Bank', 'ALL LANES bank',
    'ALL LANES sets resolution, stretch, shift, quantize, crop, input quantize, direction and repeat sync for all 32 lanes at once.',
    () => { selectTrack(1); toBank(7); });
screen('note-repeat-modes', '9.4 Note Repeat', 'Choosing the right-pad mode',
    'On a drum track, hold [Shift] and press [Step 8] to cycle the right pads between velocity zones and the two repeat modes. The card shows which is on.',
    () => {
        selectTrack(1);
        press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2);
        if (!S.drumPerformMode[1]) throw new Error('[Shift]+[Step 8] did not change the right-pad mode');
    }, { align: false });
screen('bank-repeat-groove', '13.5.2 RPT GROOVE', 'RPT GROOVE bank',
    'RPT GROOVE sets a velocity per gate step. A dotted bar is Thru, which uses the pad\'s own velocity.',
    () => {
        selectTrack(1);
        press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift);
        ticks(300);                                   /* let the mode card time out */
        toBank(5);
    });
screen('step-editor-drum', '9.2 Placing Hits', 'Editing a held drum hit',
    'Holding a hit on a drum lane shows the same controls as a melodic note, without the two pitch knobs.',
    () => {
        selectTrack(1);
        toBank(C.BANK_STEP);
        ENGINE['t1_l0_step_4_vel'] = '110'; ENGINE['t1_l0_step_4_gate'] = '12';
        noteOn(STEP(4), 127); ticks(HOLD_TICKS);
        if (S.heldStep < 0) throw new Error('no hold');
    });

/* 8 — Conductor banks */
const COND_BANKS = [
    [0, 'bank-cond-conduct', 'CLIP', 'CLIP sets the Conductor\'s own timing and direction, plus Cond Lock (CDLK) on knob 6.'],
    [1, 'bank-cond-notefx', 'NOTE FX', 'NOTE FX shapes the Conductor\'s note before the shift, with octave, offset and random.'],
    [C.BANK_RESPONDER, 'bank-cond-responder', 'ON/OFF', 'When a track is On, it follows the Conductor.'],
    [C.BANK_OCTAVE, 'bank-cond-octave', 'OCTAVE', 'OCTAVE adds an extra octave per track.'],
    [C.BANK_WHEN, 'bank-cond-when', 'TIMING', 'For each track, choose Next to follow at its next note, or Now to retrigger at once.'],
];
for (const [b, slug, title, caption] of COND_BANKS)
    screen(slug, '25.3 The Conductor\'s Banks', title + ' bank', caption, () => {
        selectTrack(7);
        if (b === C.BANK_OCTAVE) { S.condOct[0][0] = 1; S.condOct[0][3] = -1; S.condOct[0][5] = 2; }
        if (b === C.BANK_RESPONDER) { S.condResp[0][2] = 0; }
        if (b === C.BANK_WHEN) { S.condWhen[0][0] = 1; }
        toBank(b);
    });

/* ── the transport snapshot the poll reads, for the flows whose screens the
 * ENGINE drives (Live Merge's placement). Mirrors the fixture's own state. */
function engineSnapshot(o = {}) {
    const v = [S.playing ? '1' : '0'];
    for (let t = 0; t < 8; t++) v.push(String(S.trackCurrentStep[t]));
    for (let t = 0; t < 8; t++) v.push(String(S.trackActiveClip[t]));
    for (let t = 0; t < 8; t++) v.push(String(S.trackQueuedClip[t]));
    v.push('0');
    for (let t = 0; t < 8; t++) v.push(S.trackClipPlaying[t] ? '1' : '0');
    for (let t = 0; t < 8; t++) v.push('0');
    for (let t = 0; t < 8; t++) v.push('0');
    v.push('1', '1', '0', '0', '0', String(o.merge | 0), String(o.solo === undefined ? 255 : o.solo));
    ENGINE.state_snapshot = v.join(' ');
}
function stopTransport() {
    /* Play: the transport stops (the DSP's word, then the mirror). */
    S.playing = false;
    for (let t = 0; t < 8; t++) { S.trackClipPlaying[t] = false; S.trackCurrentStep[t] = -1; }
    S.drumCurrentStep[1] = -1;
}
const toSession = () => { tap(MoveNoteSession); ticks(3); if (!S.sessionView) throw new Error('no session view'); };
/* A mixer mode from the Session map's MIXER column (hold the jog, tap, let
 * go), then the page as a jog touch shows it. */
const toMixer = (mode) => {
    if (S.sessKnobMode !== mode) mapTap(PURE.bankMapPadForCell(0, mode));
    if (S.sessKnobMode !== mode) throw new Error('the Session map did not pick mode ' + mode + ' (at ' + S.sessKnobMode + ')');
    noteOn(9, 127); ticks(2);
};

/* 12 — Session View: the mixer pages */
screen('session-mixer-volume', '21.3 The Session Mixer', 'Session mixer — Volume',
    'The Volume page has a fader per track.',
    () => { toSession(); toMixer(0); if (!R.sessMixerShown()) throw new Error('the mixer page is not shown'); });
screen('session-mixer-touched', '21.3 The Session Mixer', 'Session mixer — turning a fader',
    'When you turn a knob on the mixer page, the header names the track and its level, and the value replaces its number.',
    () => { toSession(); toMixer(0); noteOff(9); knobTouch(2); knobTurn(2, -3); ticks(2); });
screen('session-mixer-touch-only', '21.3 The Session Mixer', 'Session mixer — touching a fader',
    'When you touch a knob on the mixer page, the header names the track and its level, and its strip is marked.',
    () => { toSession(); toMixer(0); noteOff(9); knobTouch(4); ticks(2); });
screen('session-mixer-pan', '21.3 The Session Mixer', 'Session mixer — Pan',
    'The Pan page, the Session map\'s second mixer pad, has a bipolar dial per track.',
    () => { toSession(); toMixer(1); if (S.sessKnobMode !== 1) throw new Error('not on Pan: ' + S.sessKnobMode); });
screen('session-mixer-senda', '21.3 The Session Mixer', 'Session mixer — Send A',
    'The Send A page sets how much of each track feeds the first send bus.',
    () => { toSession(); toMixer(2); });
screen('session-mixer-eq', '21.3 The Session Mixer', 'Session mixer — EQ',
    'The EQ pad on the Session map shows one band of every track\'s EQ at once. Turn the jog to go to the next band (2/4 is Mid).',
    () => {
        const strips = ['3.00 -4.50 0.6200 2.00 0.5500', '0 6.00 0.3000 0 0', '-2.50 2.00 0.8000 4.00 0.3000', '0 -6.00 0.5000 0 0'];
        for (let t = 0; t < 8; t++) stripOn(t, strips[t % 4], '0');
        for (let b = 1; b <= 4; b++) busStripOn(b, strips[b - 1]);
        toSession();
        S.sessKnobMode = SESS_EQ_MID; S.sessVolLevel.fill(-1); ticks(8);   /* a mode change re-reads, as the map's does */
        noteOn(9, 127); ticks(4);
        if (!R.sessMixerShown()) throw new Error('the EQ page is not shown');
    }, { after: stripsOff });
screen('session-bank-map', '21.5 Master FX and the Sends', 'The Session map',
    'In Session View, hold the jog to show the mixer modes down the left and the MASTER, SEND A and SEND B effects a column over. Tap one and let go to open it.',
    () => { toSession(); press(3); ticks(2); if (!S.bankMapUp) throw new Error('holding the jog did not show the Session map'); });

/* 12.3 — mute & solo, seen on the track row */
screen('session-muted', '23.2 Muting in Session View', 'A muted track',
    'To mute track 3 in Session View, hold [Mute] and touch knob 3. Its number blinks in the track row, caught here on the off beat.',
    () => {
        toSession();
        /* Mute + KNOB TOUCH: in Session View knob k stands for track k (ui.js,
         * the knob-touch branch). */
        press(MoveMute); knobTouch(2); knobRelease(2); release(MoveMute); ticks(2);
        if (!S.trackMuted[2]) throw new Error('[Mute] + knob touch did not mute track 3');
        /* the blink's OFF half, so the mute shows */
        for (let g = 0; g < 60 && Math.floor(S.clockMs / 220) % 2 === 0; g++) ticks(1);
    }, { align: false });
screen('session-soloed', '23.2 Muting in Session View', 'A soloed track',
    'To solo track 5 in Session View, hold [Shift] and [Mute] and touch knob 5. Its number shows filled in.',
    () => {
        toSession();
        press(MoveShift); press(MoveMute); knobTouch(4); knobRelease(4); release(MoveMute); release(MoveShift); ticks(2);
        if (!S.trackSoloed[4] || !S.sessionView) throw new Error('[Shift] + [Mute] + knob touch did not solo track 5');
    });

/* 13 — Performance Mode */
screen('perf-mode', '26. Performance Mode', 'Performance Mode',
    'Press [Loop] in Session View to enter Performance Mode. Nothing is engaged yet, and the footer shows the Hold, Sync and Latch states.',
    () => { toSession(); tap(MoveLoop); ticks(2); if (!S.perfViewLocked) throw new Error('[Loop] tap did not lock Performance Mode'); });
screen('perf-mode-mods', '26.2.2 The Mods', 'Performance Mode — mods engaged',
    'The screen shows the engaged mods and the loop length.',
    () => {
        toSession(); tap(MoveLoop); ticks(2);
        noteOn(PAD(2), 100);                        /* bottom row: a 1/8 capture length, held */
        for (const i of [8 + 3, 16 + 0, 24 + 5]) { noteOn(PAD(i), 100); noteOff(PAD(i)); }
        ticks(120);                                   /* past the engage flash */
        if (!(S.perfModsToggled | S.perfModsHeld)) throw new Error('no mods engaged');
    });
screen('perf-mode-preset', '26.4 Presets', 'Performance Mode — a preset recalled',
    'Pressing [Step 1] in Performance Mode recalls the Float preset, and the title names it.',
    () => { toSession(); tap(MoveLoop); ticks(2); noteOn(STEP(0), 127); noteOff(STEP(0)); ticks(120);
            if (S.perfRecalledSlot !== 0) throw new Error('step 1 did not recall preset 1'); });

/* 6.5 — Capture */
screen('capture-nothing', '10.3 Capture', '[Capture] with nothing buffered',
    'If you press [Capture] when nothing has been played, the screen says so.',
    () => { tap(MoveCapture); ticks(2); }, { align: false });
screen('capture-tempo', '10.3.1 What Capture Does', '[Capture] — the tempo chooser',
    'Turn the jog through the detected tempos. Your take is drawn against the bars.',
    () => {
        stopTransport();
        for (let t = 0; t < 8; t++) for (let c = 0; c < 16; c++) {
            S.clipNonEmpty[t][c] = false; S.drumClipNonEmpty[t][c] = false; S.clipSteps[t][c].fill(0);
            ENGINE['t' + t + '_c' + c + '_drum_has_content'] = '0';
        }
        ENGINE.capture_pending = '14 0 0'; ticks(8);
        if (!(S.capturePending > 0)) throw new Error('the buffer did not register');
        tap(MoveCapture); ticks(2);
        /* The DSP commits the take and opens its chooser. */
        for (const st of [0, 3, 6, 8, 10, 16, 19, 22, 24, 28]) S.clipSteps[0][0][st] = 1;
        S.clipLength[0][0] = 32; S.clipNonEmpty[0][0] = true;
        ENGINE.capture_pending = '0 0 0';
        ENGINE.capture_info = '1 1 32 1 1 3 0 56 112 224';
        ticks(8);
        if (!S.tempoSelectActive) throw new Error('the chooser did not open');
    });
screen('capture-length', '10.3.1 What Capture Does', '[Capture] — fitting the take to bars',
    'In a stopped set that already has clips, [Capture] fits the take to the current tempo. Turn the jog to pick how many bars it fills.',
    () => {
        stopTransport(); selectTrack(3);
        ENGINE.capture_pending = '9 0 0'; ticks(8);
        tap(MoveCapture); ticks(2);
        for (const st of [0, 4, 7, 12, 16, 20, 23, 28]) S.clipSteps[3][0][st] = 1;
        S.clipLength[3][0] = 32; S.clipNonEmpty[3][0] = true;
        ENGINE.capture_pending = '0 0 0';
        ENGINE.capture_info = '1 1 32 1 1 3 1 1 2 4';
        ticks(8);
        if (!S.tempoSelectActive || !S.tempoSelectWarp) throw new Error('the length chooser did not open');
    });
screen('capture-place', '10.3.1 What Capture Does', '[Capture] — choosing where the take goes',
    'If you capture while stopped on a clip that already has notes, tap one of the blinking empty clips to keep the take there.',
    () => {
        stopTransport();
        ENGINE.capture_pending = '9 0 0'; ticks(8);
        tap(MoveCapture); ticks(2);
        if (S.capturePlaceTrack < 0) throw new Error('no destination prompt');
    });

/* 16 — the Sample menu (Josh, 2026-10-25) */
const sampleMenu = (id) => {
    tap(C.MoveSample); ticks(2);
    if (!S.sampleMenu) throw new Error('[Sample] did not open its menu');
    for (let n = 0; n < 4 && S.sampleMenu.items[S.sampleMenu.sel].id !== id; n++) jog(1);
    if (S.sampleMenu.items[S.sampleMenu.sel].id !== id) throw new Error('the menu has no ' + id);
};
screen('sample-menu-session', '15.1 The Sample Menu', 'The [Sample] menu — Session View',
    'Press [Sample] in Session View to bake or resample a scene, or to start a Live Merge of all 8 tracks.',
    () => { stopTransport(); toSession(); sampleMenu('bake'); });
screen('sample-menu-track', '15.1 The Sample Menu', 'The [Sample] menu — Track View',
    'Press [Sample] in Track View to bake the clip or Live Merge the track.',
    () => { stopTransport(); sampleMenu('bake'); });

/* 15.2 — Live Merge */
screen('merge-notice-session', '15.3 Live Merge', 'Live Merge — armed from Session View',
    'Choose Live merge from the [Sample] menu with the transport stopped. The notice says the merge will capture all 8 tracks, and [Record] starts it.',
    () => { stopTransport(); toSession(); sampleMenu('merge'); click(); ticks(2);
            if (!S.mergeNoticePending) throw new Error('no merge notice'); });
screen('merge-notice-track', '15.3 Live Merge', 'Live Merge — armed from Track View',
    'In Track View, Live merge track captures the active track alone.',
    () => { stopTransport(); sampleMenu('merge'); click(); ticks(2);
            if (!S.mergeNoticePending) throw new Error('no merge notice'); });
screen('merge-place-scene', '15.3 Live Merge', 'Live Merge — placing the take',
    'After a merge in Session View, tap a row or a scene step to receive the eight clips.',
    () => {
        toSession();
        engineSnapshot({ merge: 1 }); ticks(8);
        engineSnapshot({ merge: 4 }); ticks(8);
        if (!S.pendingMergePlacement) throw new Error('the poll did not raise the placement prompt');
    });
screen('merge-place-track', '15.3 Live Merge', 'Live Merge — keeping a single-track take',
    'After a merge in Track View, the empty clips on that track blink. Tap one to keep the take.',
    () => {
        engineSnapshot({ merge: 1, solo: 0 }); ticks(8);
        engineSnapshot({ merge: 4, solo: 0 }); ticks(8);
        if (S.mergeSoloPlacement < 0) throw new Error('the poll did not raise the solo placement prompt');
    });

/* 15.1 — Bake */
screen('bake-clip', '15.2 Bake', 'Bake a clip',
    'Choose Bake clip from the [Sample] menu in Track View, then choose how many loops to render into plain notes.',
    () => { sampleMenu('bake'); click(); ticks(2); if (!S.confirmBake) throw new Error('no bake confirm'); });
screen('bake-drum', '15.2 Bake', 'Bake a drum clip',
    'On a drum track, the bake first asks whether to bake the whole clip or just the selected lane.',
    () => { selectTrack(1); sampleMenu('bake'); click(); ticks(2); if (!S.confirmBake) throw new Error('no bake confirm'); });
screen('bake-scene-pick', '15.2 Bake', 'Bake a scene — pick the row',
    'Choose Bake scene from the [Sample] menu, then tap a row or a scene step to choose what to bake.',
    () => { toSession(); sampleMenu('bake'); click(); ticks(2); if (!S.pendingSceneBakePicker) throw new Error('no picker'); });
screen('bake-scene-confirm', '15.2 Bake', 'Bake a scene — loops',
    'Once you choose a row, you get the same loop-count choice for every clip in the scene.',
    () => { toSession(); sampleMenu('bake'); click(); ticks(2);
            noteOn(STEP(0), 127); noteOff(STEP(0)); ticks(2);
            if (!S.confirmBakeScene) throw new Error('no scene bake confirm'); });

/* 16.6 — Resample a clip (Track View: the current clip) */
screen('resample-clip-options', '19.2 Resampling a Scene or Clip', 'Resample a clip',
    'Choose Resample clip from the [Sample] menu in Track View to record the current clip alone, Wet (as you hear it) or Dry (just its own chain).',
    () => { stopTransport(); selectTrack(4); ENGINE.resample_bars_t4_c0 = '1';
            for (let s = 0; s < 4; s++) { S.clipSteps[4][0][s * 4] = 1; } S.clipNonEmpty[4][0] = true;
            sampleMenu('resample_clip'); click(); ticks(2);
            if (!S.confirmResample) throw new Error('no clip resample options'); });

/* 16.6 — Resample a scene */
screen('resample-options', '19.2 Resampling a Scene or Clip', 'Resample a scene',
    'Choose Resample scene from the [Sample] menu, then a row. The length starts where the clips line up, and Warm-up and Tail start off.',
    () => { stopTransport(); toSession(); ENGINE.resample_bars_0 = '4';
            sampleMenu('resample'); click(); ticks(2);
            noteOn(STEP(0), 127); noteOff(STEP(0)); ticks(2);
            if (!S.confirmResample) throw new Error('no resample options'); });

/* 3.6 / 16 — Project Settings (Shift + Step 2) */
const openSettings = () => {
    press(MoveShift); noteOn(STEP(1), 127); noteOff(STEP(1)); release(MoveShift); ticks(2);
    if (!S.globalMenuOpen) throw new Error('[Shift] + [Step 2] did not open Project Settings');
};
/* Jog the menu cursor onto the row with this label. */
function menuTo(label) {
    const idx = S.globalMenuItems.findIndex((it) => it && it.label === label);
    if (idx < 0) throw new Error('no menu row ' + label);
    for (let g = 0; g < 60 && S.globalMenuState.selectedIndex !== idx; g++)
        { jog(S.globalMenuState.selectedIndex < idx ? 1 : -1); ticks(1); }
    if (S.globalMenuState.selectedIndex !== idx) throw new Error('jog never reached ' + label);
}
screen('menu-project-settings', '3.6 Menus, Lists and Typing', 'Project Settings',
    'Hold [Shift] and press [Step 2] to open Project Settings. Every list in dAVEBOx looks like this.',
    () => { openSettings(); });
screen('menu-clock', '28.2 Clock Follow', 'Project Settings — Clock Follow and Clock Out',
    'Scroll down to the clock rows: Clock Follow (Off or Move) and Clock Out.',
    () => { openSettings(); menuTo('Clock Follow'); });
screen('menu-key-scale', '6.2 Key and Scale', 'Project Settings — Key and Scale',
    'Scroll down to Key, Scale and Scale Aware.',
    () => { openSettings(); menuTo('Scale'); });
screen('menu-scale-picker', '6.2 Key and Scale', 'Choosing a scale',
    'Clicking the jog on Scale opens its list over the menu. Turn the jog to move through it, and the pads preview each scale.',
    () => { openSettings(); menuTo('Scale'); click(); ticks(2); jog(2); ticks(2);
            if (!S.globalEnumPick) throw new Error('no scale list'); });
screen('xpose-confirm', '6.2 Key and Scale', 'Transpose clips?',
    'If the melodic clips hold notes, committing a new key asks whether to move the notes with it.',
    () => { openSettings(); menuTo('Key'); click(); ticks(2); jog(3); ticks(2); click(); ticks(2);
            if (!S.confirmXpose) throw new Error('no transpose confirm'); });
screen('menu-foot', '30.1 Project Settings', 'Project Settings — the foot of the list',
    'Near the foot of the list are Suspend session, Quit and Host Settings. Projects, Save and Load state, Clear Sess and Export sit just above them.',
    () => { openSettings(); menuTo('Quit'); });
screen('tap-tempo', '30.1 Project Settings', 'Tap Tempo',
    'Hold [Shift] and press [Step 5], then tap any pad in time and the tempo follows. Turn the jog to fine-tune it.',
    () => { press(MoveShift); noteOn(STEP(4), 127); noteOff(STEP(4)); release(MoveShift); ticks(2);
            if (!S.tapTempoOpen) throw new Error('[Shift] + [Step 5] did not open tap tempo');
            for (let i = 0; i < 4; i++) { noteOn(PAD(9), 100); noteOff(PAD(9)); ticks(47); } });
screen('save-state-confirm', '5.3 Save States', 'Save state',
    'Save state in Project Settings asks first, and says how many of the 16 snapshots are used.',
    () => { openSettings(); menuTo('Save state'); click(); ticks(2); if (!S.confirmSaveState) throw new Error('no confirm'); });
screen('snapshot-picker', '5.3 Save States', 'Load state',
    'Load state in Project Settings lists the saved snapshots by date and time, newest first.',
    () => {
        FILES['-snap-index.json'] = JSON.stringify({ v: 1, snaps: [
            { id: 1, label: '09-24 21:12', sv: C.STATE_VERSION, ts: 5 },
            { id: 2, label: '09-24 22:40', sv: C.STATE_VERSION, ts: 6 },
            { id: 3, label: '09-25 19:03', sv: C.STATE_VERSION, ts: 7 },
            { id: 4, label: '09-26 10:31', sv: C.STATE_VERSION, ts: 8 },
        ] });
        openSettings(); menuTo('Load state'); click(); ticks(2);
        if (!S.snapshotPicker) throw new Error('no snapshot picker');
    });
screen('clear-session-confirm', '30.1 Project Settings', 'Clear Session',
    'Clear Session asks you to confirm first, because it cannot be undone.',
    () => { openSettings(); menuTo('Clear Sess'); click(); ticks(2); if (!S.confirmClearSession) throw new Error('no confirm'); });
screen('export-confirm', '27.1 Export to Ableton', 'Export to Ableton',
    'With the transport stopped, Export to Ableton in Project Settings asks you to confirm before it writes the bundle.',
    () => { stopTransport(); openSettings(); menuTo('Export to Ableton'); click(); ticks(4);
            if (!S.confirmExport) throw new Error('no export confirm'); });
screen('export-conductor', '27.1 Export to Ableton', 'Export — Apply Conductor?',
    'With a Conductor in the set, the export asks whether to fold its transposition into the responding clips.',
    () => { stopTransport(); openSettings(); menuTo('Export to Ableton'); click(); ticks(4);
            jog(-1); ticks(1); click(); ticks(2);
            if (!S.confirmExportCondPhase) throw new Error('no Apply Conductor step'); });
screen('quit-confirm', '5.2 Saving, Suspending and Leaving', 'Quit',
    'Quit in Project Settings saves and leaves the session.',
    () => { openSettings(); menuTo('Quit'); click(); ticks(2); if (S.confirmExit !== 'quit') throw new Error('no quit confirm'); });
screen('suspend-confirm', '5.2 Saving, Suspending and Leaving', 'Suspend session',
    'Suspend session in Project Settings parks dAVEBOx in the background.',
    () => { openSettings(); menuTo('Suspend session'); click(); ticks(2); if (S.confirmExit !== 'suspend') throw new Error('no suspend confirm'); });
screen('exiting', '5.2 Saving, Suspending and Leaving', 'Exiting',
    'This is the last frame before the device is handed back.',
    () => { openSettings(); menuTo('Quit'); click(); ticks(2); jog(-1); ticks(1); click(); ticks(12);
            if (!S.exitFarewell) throw new Error('no farewell screen'); });

/* 2 — Projects (Shift + Step 1) */
const openProjects = () => {
    press(MoveShift); noteOn(STEP(0), 127); noteOff(STEP(0)); release(MoveShift); ticks(2);
    if (!S.projectPadPicker) throw new Error('[Shift] + [Step 1] did not open the project picker');
};
screen('projects-current', '5.1 The Project Picker', 'Project picker — the open project',
    'Hold [Shift] and press [Step 1] to open the picker on the project you are in. It is marked Current, with Resume to go back to it.',
    () => { openProjects(); });
screen('projects-other', '5.1.1 Opening a Project', 'Project picker — another project',
    'The picker shows the selected project and what you can do with it.',
    () => { openProjects(); noteOn(PAD(1), 100); noteOff(PAD(1)); ticks(2); });
screen('projects-color', '5.1.3 Renaming and Coloring', 'Project picker — Color',
    'Color lists the palette. As you turn the jog, the pad previews each color.',
    () => { openProjects(); noteOn(PAD(1), 100); noteOff(PAD(1)); ticks(2);
            for (let g = 0; g < 3; g++) { jog(1); ticks(1); } click(); ticks(2); jog(2); ticks(2);
            if (!S.projectPadPicker.colorPick) throw new Error('Color did not open'); });
screen('projects-new', '5.1.2 Creating a Project', 'Project picker — a new project',
    'Tapping an empty pad asks before creating a project there.',
    () => { openProjects(); noteOn(PAD(9), 100); noteOff(PAD(9)); ticks(2);
            if (!S.projectPadPicker.confirmNew) throw new Error('no new-project confirm'); });
screen('projects-delete', '5.1.4 Copying and Deleting', 'Project picker — delete',
    'To delete a project, hold [Delete] and tap it, then tap it again to confirm.',
    () => { openProjects(); press(MoveDelete); noteOn(PAD(2), 100); noteOff(PAD(2)); ticks(2);
            if (S.projectPadPicker.deleteIdx !== 2) throw new Error('delete not armed'); });
screen('projects-copy', '5.1.4 Copying and Deleting', 'Project picker — copy',
    'To copy a project, hold [Copy] and tap it, then tap an empty pad to copy it there.',
    () => { openProjects(); press(MoveCopy); noteOn(PAD(2), 100); noteOff(PAD(2)); ticks(2);
            if (S.projectPadPicker.copySrcIdx !== 2) throw new Error('copy not armed'); });
screen('projects-loading', '2.2 Open dAVEBOx', 'Loading a project',
    'When you choose Load, the project opens.',
    () => { openProjects(); noteOn(PAD(1), 100); noteOff(PAD(1)); ticks(2); click();
            if (!S.switchLoading) throw new Error('no loading screen'); }, { align: false });

/* Dialogs raised by the chord layout / type changes */
screen('bank-chord', '8.3.1 The Chord Layout\'s Settings', 'Pad Mode bank — the Chord layout',
    'On the Pad Mode bank, a Chord-layout track shows Mode, then Map, voicing, smoothing, bass, pad octave and slot mode.',
    () => { for (let i = 0; i < 3; i++) { press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2); }
            toBank(C.BANK_CHORD); });
screen('bank-chord-slot', '8.3.2 Editing a Chord', 'Pad Mode bank — editing a chord',
    'Hold a chord pad on the Pad Mode bank to edit that chord.',
    () => { for (let i = 0; i < 3; i++) { press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2); }
            toBank(C.BANK_CHORD); noteOn(PAD(5), 100); ticks(4); });

screen('loading-sequencer', '2.2 Open dAVEBOx', 'Starting the sequencer',
    'In the last stage of opening a project, the sequencer starts up.',
    () => { S.stateLoading = true; }, { align: false });

/* 14.3 — the track's sound editor: the CONFIG pad on the bank map (Shift +
 * Note/Session, which opened it, retired 2026-10-04). A held tap: the menu
 * opens on the jog's release. */
const openTrackConfig = () => {
    mapTap(PURE.bankMapPadForCell(0, 3)); ticks(4);
    if (!SND.soundOpen()) throw new Error('the CONFIG pad did not open TRACK CONFIG');
};
/* Jog the sound menu's cursor onto the row with this label. */
function soundRowToLabel(label) {
    const target = SND.soundPickStateForTest().labels.indexOf(label);
    if (target < 0) throw new Error('no sound row ' + label);
    for (let g = 0; g < 80 && SND.soundPickStateForTest().row !== target; g++)
        { jog(SND.soundPickStateForTest().row < target ? 1 : -1); ticks(1); }
    if (SND.soundPickStateForTest().row !== target) throw new Error('jog never reached ' + label);
}
/* Jog the MIDI browser onto the row with this label (then rest, so it is read). */
function jogToLabel(label) {
    const st = () => MI.miStateForTest();
    const want = st().items.findIndex((i) => i.label === label);
    if (want < 0) throw new Error('no browser row ' + label + ' in ' + st().items.map((i) => i.label).join(','));
    for (let g = 0; g < 40 && st().idx !== want; g++) { jog(st().idx < want ? 1 : -1); ticks(1); }
    if (st().idx !== want) throw new Error('jog never reached ' + label);
    ticks(20);
}
screen('track-config', '20.3 The Menu', 'TRACK CONFIG — a Schwung track',
    'The menu starts with the track\'s chain: instrument, MIDI FX and effects.',
    () => { selectTrack(4); openTrackConfig(); });
screen('track-config-levels', '20.3 The Menu', 'TRACK CONFIG — levels and presets',
    'Further down the same menu, below a line, are the track\'s levels: Volume, Pan, Send A and Send B.',
    () => { selectTrack(4); openTrackConfig(); for (let g = 0; g < 7; g++) { jog(1); ticks(1); } });
screen('track-config-foot', '20.7 Track Settings', 'TRACK CONFIG — the track\'s own settings',
    'At the foot of the menu, the track\'s own settings end with Looper, then Parallel, each group behind a line.',
    () => { selectTrack(4); openTrackConfig(); for (let g = 0; g < 40; g++) { jog(1); ticks(1); }});
screen('track-config-move', '20.3 The Menu', 'TRACK CONFIG — a Move track',
    'On a track playing a Move instrument, the chain row names it (Move 1). The rest of the menu is the Move bus\'s effects and levels.',
    () => { openTrackConfig(); });
screen('instrument-picker', '20.4 Choosing an Instrument', 'The Instmt/Dest picker',
    'The picker starts with the list filter, None, then Move\'s instruments. An instrument another track already plays shows that track and is skipped. The Conductor, Schwung instruments, MIDI channels and other tracks follow.',
    () => {
        selectTrack(4); openTrackConfig();
        press(MoveShift); click(); release(MoveShift); ticks(4);
        if (!SND.soundEnumPickForTest()) throw new Error('[Shift]+click did not open the picker');
        jog(-12); ticks(2);   /* the top of the list: its first groups */
    });
screen('block-editor', '20.5 Editing a Module', 'Editing an instrument',
    'The knobs edit its parameters, and turning the jog moves through the pages.',
    () => { stopTransport(); selectTrack(4); openTrackConfig(); click(); ticks(8); });
/* A module's list page (Josh, 2026-11-09: the Screen view drew these as empty
 * knobs): the editor jogged to its trailing My Presets page. */
screen('block-editor-my-presets', '20.5.4 My Presets and Module', 'A module\'s My Presets page',
    'After the parameter pages, My Presets saves and loads the module\'s own presets. Click the jog to go in, and turn it to pick a row.',
    () => {
        stopTransport(); selectTrack(4); openTrackConfig(); click(); ticks(8);
        for (let i = 0; i < 40; i++) {
            const vm = SND.soundParamPageModel();
            if (vm && vm.page && vm.page.name === 'My Presets') break;
            jog(1); ticks(2);
        }
        const vm = SND.soundParamPageModel();
        if (!vm || !vm.page || vm.page.name !== 'My Presets') throw new Error('never reached My Presets: ' + (vm && vm.page && vm.page.name));
    });
/* The same editor with the transport running: the footer is the track's page
 * bar. A 4-bar clip, viewing page 2 while page 3 plays, so every part of the
 * bar shows (solid, outlined, underlined, the playhead). */
screen('block-editor-playing', '20.5.1 The Sequencer\'s Page', 'The page bar in an editor',
    'While the transport runs, the bottom row is the track\'s page bar. Page 2 of 4 is on screen (solid) and page 3 is playing (outlined).',
    () => {
        selectTrack(4); openTrackConfig(); click(); ticks(8);
        S.clipLoopStart[4][0] = 0; S.clipLength[4][0] = 64;
        S.trackClipPlaying[4] = true; S.trackCurrentStep[4] = 37; S.trackCurrentPage[4] = 1;
        S.followPaused = true;
        ticks(2);
    });

screen('fx-browser', '20.3 The Menu', 'Adding an effect',
    'Clicking the jog on an empty effect block opens the module list, which shows the installed effects by name.',
    () => { selectTrack(4); openTrackConfig(); soundRowToLabel('FX 2'); ticks(1);
            if (SND.soundPickStateForTest().labels[SND.soundPickStateForTest().row] !== 'FX 2') throw new Error('not on FX 2');
            click(); ticks(6); });
screen('config-card', '20.2 TRACK CONFIG', 'The CONFIG bank',
    'The first bank on every walk shows the TRACK CONFIG menu at rest, inside the corner brackets. Click the jog to use it.',
    () => { selectTrack(4); toBank(C.BANK_CONFIG); ticks(8); });
screen('sound-card', '21.1 Track Levels', 'The MIX card',
    'On the last bank, the knobs are the track\'s levels.',
    () => { selectTrack(4); toBank(C.BANK_SOUND, false); knobTouch(0); ticks(4); });
/* THE CHANNEL STRIP (MIX page 2): some EQ, and the comp working */
screen('mix-strip', '21.2 The Channel Strip', 'MIX 2 — the channel strip',
    'Turn the jog on MIX to show Low, Mid, Freq, High and Comp. The dot on Comp shows how far it is turning the sound down now.',
    () => { stripOn(4, '3.00 -4.50 0.6200 2.00 0.5500', '-4.20');
            selectTrack(4); toBank(C.BANK_SOUND, false); jog(1); ticks(2); knobTouch(4); ticks(4); },
    { after: () => { knobRelease(4); jog(-1); ticks(2); stripsOff(); if (SND.soundMixPageForTest() !== 0) throw new Error('MIX stayed on page 2'); } });
screen('mix-strip-eq-curve', '21.2 The Channel Strip', 'The EQ curve',
    'Touch or turn an EQ knob to show the curve over the page, with the band you are adjusting marked.',
    () => { stripOn(4, '3.00 -4.50 0.6200 2.00 0.5500', '-4.20');
            selectTrack(4); toBank(C.BANK_SOUND, false); jog(1); ticks(2); knobTouch(1); ticks(4); },
    { after: () => { knobRelease(1); jog(-1); ticks(2); stripsOff(); if (SND.soundMixPageForTest() !== 0) throw new Error('MIX stayed on page 2'); } });
screen('macros-card', '24.1 The MACROS Bank', 'The MACROS bank',
    'Each knob shows its target. A knob that drives several (MAC1) shows its own position.',
    () => { selectTrack(4); toBank(C.BANK_MACROS); ticks(8); });
screen('macros-unassigned-touched', '24.1 The MACROS Bank', 'Touching an unassigned macro',
    'When you touch knob 7, which drives nothing yet, the footer says that clicking the jog assigns it.',
    () => { selectTrack(4); toBank(C.BANK_MACROS); ticks(8); knobTouch(6); ticks(2); });
/* A macro's editor: touch its knob on the MACROS card and click the jog. */
const openMacro = (k) => {
    selectTrack(4); toBank(C.BANK_MACROS); ticks(8);
    knobTouch(k); click(); knobRelease(k); ticks(4);
};
screen('macros-multi', '24.1.1 One Knob, Several Parameters', 'One knob, several targets',
    'Touch a macro and click the jog to see everything that knob drives, each with its own range.',
    () => { openMacro(5); });
screen('macros-targets', '24.1 The MACROS Bank', 'MACROS — choosing a target',
    'Touch an unassigned macro and click the jog to go straight to choosing a block, a bank, Levels, MIDI or, last, SnapMorph.',
    () => { openMacro(6); for (let g = 0; g < 20; g++) { jog(1); ticks(1); } });

/* 14.3 — a MIDI track (route: a MIDI channel) */
screen('midi-track-card', '21.1 Track Levels', 'MIX on a MIDI track',
    'On a track sending MIDI, the MIX card is a standard controller with Expression (touched here), Pan, Mod jog and Sustain, then the clip\'s Program and Bank.',
    () => {
        selectTrack(3);
        S.trackRoute[3] = 2; S.trackChannel[3] = 10; ENGINE.t3_route = 'external'; ENGINE.t3_channel = '10';
        toBank(C.BANK_SOUND, false); knobTouch(0); ticks(4);
    });

/* 14.3 — the global effect buses, from Session View */
screen('fx-buses', '21.5 Master FX and the Sends', 'MASTER FX',
    'The MASTER pad on the Session map opens Master FX and its four effect blocks. SEND A and SEND B open the same way.',
    () => { toSession(); mapTap(PURE.bankMapPadForCell(PURE.SESS_PAD_MAP.fx.col, 0)); ticks(6);
            const b = SND.soundBusForTest();
            if (!b || b.id !== 'master') throw new Error('the MASTER pad did not open Master FX'); });

/* 15.4 — Import MIDI: touch K8 on the CLIP / DRUM LANE card and click. Each
 * screen starts from nothing remembered (the first open). */
const openImport = (t) => {
    MI.miResetForTest(); S.midiMuted = false; S.midiMap = 'gm';
    selectTrack(t); toBank(0, false);
    knobTouch(7); ticks(1); click(); knobRelease(7); ticks(4);
    if (!MI.miStateForTest()) throw new Error('touch K8 + click did not open Import MIDI');
};
/* The card for one part of the Bach file: in the multi-part file, pick its first part. */
const importPage = (t) => {
    openImport(t); jogToLabel('Bach Invention 8'); click(); ticks(4);   /* into the file */
    ticks(20); click(); ticks(4);                                         /* pick its first part */
    if (!MI.miStateForTest() || MI.miStateForTest().layer !== 'card') throw new Error('no MIDI browser card');
};
screen('import-files', '11.1 The List', 'Import MIDI — the list',
    'Touch knob 8 on the CLIP bank and click the jog. On a track\'s first visit, the list shows your user data folder, with its folders and MIDI files.',
    () => { stopTransport(); openImport(3); });
screen('import-parts', '11.1 The List', 'Import MIDI — a file with several parts',
    'A file with several parts opens like a folder: its parts are laid out like files, and each plays as you land on it.',
    () => { stopTransport(); openImport(3); jogToLabel('Bach Invention 8'); click(); ticks(4); });
screen('import-options', '11.2 The Card', 'Import MIDI — the knobs',
    'The card has Start, Bars, Res and Stretch on top, then the notes on one line, with brackets marking what will land. Oct, Semi, Scale and the file\'s BPM are underneath.',
    () => { stopTransport(); importPage(3); });
screen('import-options-cut', '11.2 The Card', 'Import MIDI — notes that will be cut',
    'When you move the start and length, the top right says how many notes won\'t land.',
    () => { stopTransport(); importPage(3);
            knobTouch(0); knobTurn(0, 12); knobRelease(0); knobTouch(1); knobTurn(1, -24); knobRelease(1); ticks(2); });

screen('snapmorph-slots', '24.3 SnapMorph', 'SnapMorph — choosing snapshots',
    'Click the jog on snapshots in the order the knob travels. [1] is the bottom of the turn.',
    () => { openMacro(6);
            for (let g = 0; g < 20; g++) { jog(1); ticks(1); } click(); ticks(4);
            jog(2); ticks(1); click(); ticks(2); jog(-2); ticks(1); click(); ticks(2); });

/* 11 — the AUTOMATION bank, on track 5 */
function withAutomation() {
    ENGINE.pa_list = ['4 0 1 8 4:synth:cutoff 0', '4 0 3 12 4:synth:reso 48', '4 0 1 4 4:slot:volume 0',
                      '4 0 0 3 4:fx1:mix 0', ''].join('\n');
    ENGINE.t4_c0_at_has = '1'; S.clipAtHas[4][0] = true;
    AUTO.automationNoteListChangedElsewhere();
}
screen('bank-automation', '14.2 The AUTOMATION Screen', 'AUTOMATION bank',
    'The AUTOMATION bank lists everything automated in the clip, with its state.',
    () => { selectTrack(4); withAutomation(); ticks(8);
            toBank(C.BANK_AUTOMATION); ticks(8);});
screen('automation-menu', '14.2 The AUTOMATION Screen', 'AUTOMATION — the menu',
    'Click the jog for the menu. Turn it to a row and press it again for that row\'s operations.',
    () => { selectTrack(4); withAutomation(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(1); ticks(2); });
screen('automation-ops', '14.4 Lane Operations', 'AUTOMATION — a parameter\'s operations',
    'A lane\'s operations are Mute, Wrap, Link, Loop, Rate, Scale, Clear and Delete.',
    () => { selectTrack(4); withAutomation(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(1); ticks(2); click(); ticks(4); });

/* The lanes with curves and positions, as the engine answers them (the
 * Screen view's AUTOMATION screen): every lane's shape over its window, every
 * lane's place while playing, the points on the steps and the page's values. */
function withAutomationCurves() {
    withAutomation();
    /* Volume at Rate x2 (code 6): its playhead runs twice the clip's speed */
    ENGINE.pa_list = ENGINE.pa_list.replace('4 0 1 4 4:slot:volume 0', '4 0 1 4 4:slot:volume 0 6'); AUTO.automationNoteListChangedElsewhere();
    const hx2 = (v) => Math.max(0, Math.min(254, Math.round(v * 254))).toString(16).padStart(2, '0');
    const shape = (f) => Array.from({ length: 126 }, (_, c) => hx2(f(c / 126))).join('');
    ENGINE.t4_c0_pa_shape_126 = [
        '4:synth:cutoff ' + shape((x) => 0.5 + 0.42 * Math.sin(x * Math.PI * 2 - 1.2)),
        '4:synth:reso ' + shape((x) => [0.2, 0.75, 0.45, 0.9][Math.floor(x * 4)]),
        '4:slot:volume ' + shape((x) => x < 0.6 ? 0.8 : 0.8 - (x - 0.6) * 1.5),
        '4:fx1:mix ' + shape((x) => 0.3 + 0.4 * x), ''].join('\n');
    ENGINE.t4_c0_pa_pos = ['4:synth:cutoff 150 0 384', '4:synth:reso 30 0 48', '4:slot:volume 150 0 384', '4:fx1:mix 150 0 384', ''].join('\n');
    ENGINE.t4_c0_pa_steps = ['4:synth:cutoff 1000100010001', '4:synth:reso 11', '4:slot:volume 1000000000100001', ''].join('\n');
    const v14 = (f) => Array.from({ length: 16 }, (_, s) => Math.round(f(s / 16) * 16383).toString(16).padStart(4, '0')).join('');
    ENGINE.t4_c0_pa_vals_0_24 = ['4:synth:cutoff ' + v14((x) => 0.5 + 0.42 * Math.sin(x * Math.PI * 2 - 1.2)),
                                 '4:slot:volume ' + v14((x) => x < 0.6 ? 0.8 : 0.8 - (x - 0.6) * 1.5), ''].join('\n');
    S.playing = true; S.bpm = 120; S.trackClipPlaying[4] = true;
}
screen('automation-lanes', '14.2 The AUTOMATION Screen', 'AUTOMATION — the lanes, playing',
    'Every lane of the clip is shown with its cycle. While the transport runs, each moves at its own rate.',
    () => { selectTrack(4); withAutomationCurves(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); });
screen('automation-lane-detail', '14.2 The AUTOMATION Screen', 'AUTOMATION — a lane selected',
    'With the cursor on a lane, the step buttons show its current page as brightness, its points blinking.',
    () => { selectTrack(4); withAutomationCurves(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(2); ticks(4);
            if (!S.autoCycle || S.autoCycle.target !== '4:synth:cutoff') throw new Error('the cursor is not on Syn>Cutoff'); });
screen('automation-lane-ops', '14.4 Lane Operations', 'AUTOMATION — a lane\'s operations, playing',
    'A lane\'s operations appear over the list, with the lane itself below and its playhead running.',
    () => { selectTrack(4); withAutomationCurves(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(2); ticks(4); click(); ticks(4); });

screen('automation-hold-jump', '14.3 Editing a Lane on the Steps', 'Holding a lane\'s step',
    'Hold a step with a point on the selected lane to show its parameter\'s page, with the lane\'s page over the other half. The knob shows that step\'s value.',
    () => { selectTrack(4); withAutomationCurves(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(1); ticks(4);
            noteOn(STEP(0), 127); ticks(40); });

screen('block-editor-automated', '14.3 Editing a Lane on the Steps', 'An automated parameter in its editor',
    'In a module\'s editor, a parameter with a lane in this clip wears the automation mark; a muted lane\'s is hollow.',
    () => { stopTransport(); selectTrack(4); withAutomation();
            /* Resonance's lane muted: its mark is the hollow one */
            ENGINE.pa_list = ENGINE.pa_list.replace('4 0 3 12 4:synth:reso', '4 0 0 12 4:synth:reso'); AUTO.automationNoteListChangedElsewhere();
            ticks(8); openTrackConfig(); soundRowToLabel('Instmt/Dest'); click(); ticks(8); });

/* 16.3 / SnapMorph — the snapshot layer (hold Capture) */
screen('snapshot-layer-track', '24.2 Sound Snapshots', 'The track snapshot layer',
    'Holding [Capture] in Track View opens the track\'s snapshot layer. The band names it, and the step buttons are its slots.',
    () => { press(MoveCapture); ticks(90); if (!S.devSnap || !S.devSnap.open) throw new Error('no snapshot layer'); });
screen('snapshot-layer-session', '24.2 Sound Snapshots', 'The device snapshot layer',
    'Holding [Capture] in Session View opens the snapshot layer for the whole device.',
    () => { toSession(); press(MoveCapture); ticks(90); if (!S.devSnap || !S.devSnap.open) throw new Error('no snapshot layer'); });

/* 12.5 — Shift + Volume */
screen('track-volume-card', '21.4 Volume', 'Shift + Volume',
    'Hold [Shift] and turn the Volume knob to adjust the active track\'s level from anywhere. A card shows it over the current screen.',
    () => { press(MoveShift); cc(79, 127); cc(79, 127); ticks(2); }, { align: false });

/* Pop-ups over their page (the Screen view draws each as a card over it) */
screen('sound-level-card', '20.3 The Menu', 'The level card in TRACK CONFIG',
    'Hold [Shift] and turn the Volume knob in TRACK CONFIG to show the track\'s level in a card over the menu.',
    () => { selectTrack(4); openTrackConfig(); press(MoveShift); cc(79, 1); cc(79, 1); ticks(2); }, { align: false });

screen('bank-picker', '4.1 The Bank Map', 'The bank picker',
    'The banks in a list over the screen you are on (used by the HUD tests, not shown in the manual).',
    () => { S.bankPickerSel = 2; ticks(1); }, { align: false });

/* 7.4 — a muted drum lane */
screen('drum-lane-muted', '9.5 Copying, Clearing and Muting Lanes', 'A muted drum lane',
    'To mute a lane, hold [Mute] and tap its pad. The drum overview says MUTED beside the selected lane.',
    () => { selectTrack(1); press(MoveMute); noteOn(PAD(0), 100); noteOff(PAD(0)); release(MoveMute); ticks(2);
            if (!(S.drumLaneMute[1] & 1)) throw new Error('lane 1 not muted'); });

/* 4.1 / 8.1 — type changes */
screen('conductor-exists', '25.1 Creating a Conductor', 'Only one Conductor',
    'If you choose Conductor for a second track, the info dialog says the set already has one.',
    () => { stopTransport(); selectTrack(3); openTrackConfig(); press(MoveShift); click(); release(MoveShift); ticks(4);
            const p = SND.soundEnumPickForTest(); const want = p.options.indexOf('Conductor');
            for (let g = 0; g < 40 && SND.soundEnumPickForTest().sel !== want; g++) { jog(SND.soundEnumPickForTest().sel < want ? 1 : -1); ticks(1); }
            click(); ticks(4);
            if (!S.menuInfoLines.length) throw new Error('no info dialog'); });
screen('convert-drums', '7.2 Changing Type', 'Changing Keys to Drums',
    'Setting Mode to Drums on a track that holds notes asks first.',
    () => { stopTransport(); openTrackConfig();
            const st = SND.soundPickStateForTest(); const want = st.labels.indexOf('Mode');
            for (let g = 0; g < 60 && SND.soundPickStateForTest().row !== want; g++) { jog(1); ticks(1); }
            click(); ticks(2); jog(1); ticks(2); click(); ticks(4);
            if (!S.confirmConvertToDrum) throw new Error('no convert confirm'); });

/* 12.4 — mute snapshots */
screen('mute-snapshot-saved', '23.3 Mute Snapshots', 'Saving a mute snapshot',
    'In Session View, hold [Mute] and [Shift] and press a step button. The current mute and solo state is saved to that slot.',
    () => { toSession(); press(MoveMute); press(MoveShift); noteOn(STEP(2), 127); noteOff(STEP(2)); ticks(2); }, { align: false });

/* 9 — Delete + jog click on MACROS asks first */
screen('macros-clear-confirm', '24.1 The MACROS Bank', 'Clearing all macros',
    'On MACROS, hold [Delete] and click the jog to unassign all eight knobs. It asks first.',
    () => { selectTrack(4); toBank(C.BANK_MACROS); ticks(8); press(MoveDelete); click(); ticks(2);
            if (!S.confirmMacroClear) throw new Error('no macro clear confirm'); });

/* 16.5 — a set from an older dAVEBOx */
screen('state-mismatch', '5.6 Compatibility and What\'s Saved', 'A set from another version',
    'When you open a project saved by a different dAVEBOx version, No (the default) leaves it untouched and Yes erases it and starts clean.',
    () => { ENGINE.state_version_mismatch = '1'; globalThis.init(); ticks(2);
            if (!S.confirmStateWipe) throw new Error('the load decision did not ask'); });

/* 15.3 — the export's DONE dialog is not rendered: the run needs the device's
 * export templates (drift-dummy.json is not in this tree) and pack.py's status
 * file, and supplying those would be staging the result, not reaching it. */

/* 15.4 — importing over a clip that has notes */
screen('import-replace', '11.3 Loading', 'Import MIDI — replacing a clip',
    'If the clip you are on already holds notes, REPLACES shows at the top right. Clicking the jog asks before it loads.',
    () => { stopTransport(); importPage(0);
            if (MI.miStateForTest() && !/REPLACES/.test(JSON.stringify(MI.miHintsForTest(false))))
                throw new Error('the clip is not one with notes'); });

screen('import-confirm', '11. Importing MIDI', 'Import MIDI — loading asks first',
    'Clicking the jog on the card opens dAVEBOx\'s Yes/No with No selected. [Back] is No.',
    () => { stopTransport(); importPage(0); click(); ticks(2);
            if (MI.miStateForTest().layer !== 'confirm') throw new Error('no confirm'); });

/* ── output ──────────────────────────────────────────────────────────────── */
/* Every `section` must be a heading of the manual draft, and the output is put
 * in the manual's own order — so a renamed chapter shows up here as a warning
 * rather than as an image quietly filed under a heading that no longer exists. */
const MANUAL = readFileSync(new URL('../docs/working/MANUAL-SA.draft.md', import.meta.url), 'utf8');
const HEADINGS = MANUAL.split('\n').filter((l) => /^#{1,4} /.test(l)).map((l) => l.replace(/^#+\s*/, '').trim());
const problems = [];
const seen = new Set();
for (const s of shots) {
    if (seen.has(s.slug)) problems.push('duplicate slug ' + s.slug);
    seen.add(s.slug);
    s.order = HEADINGS.indexOf(s.section);
    if (s.order < 0) problems.push(s.slug + ': section "' + s.section + '" is not a heading of the manual');
}
/* ── pad maps: the pads (and steps) as the real UI lights them, drawn as a diagram in the manual.
 * Colours come from the LEDs the UI sent; the labels are either the UI's own (the published bank
 * map, the pads' note map) or the names the manual's tables use for the same pads. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => (n == null || n > 127) ? '' : NOTE_NAMES[n % 12];
const padNoteLabels = () => Array.from({ length: 32 }, (_, i) => noteName(S.padNoteMap[i]));
const hudPadLabels = (h) => {
    if (!h || !h.pads || !h.pads.cells) throw new Error('no published pad description');
    return h.pads.cells.map((c) => (c && c.label ? c.label.replace(' ', '\n') : ''));
};
screen('pads-bank-map', '4.1 The Bank Map', 'The pads while the jog is held',
    'The left 4×4 is the bank map, one column per group, with the bank you are on in white. On the right, MIDI FX and the instrument sit in the third column, and FX 1–4 run down the fourth.',
    () => { toBank(3, false); press(3); ticks(2); if (!S.bankMapUp) throw new Error('holding the jog did not show the map'); },
    { pads: { labels: hudPadLabels, steps: false } });
/* at the default pad octave (an earlier screen may have moved it; restore() does not reach it) */
const pianoLayout = () => { S.padOctave[S.activeTrack] = 3; for (let i = 0; i < 2; i++) { press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2); } };
screen('pads-piano', '8.2.1 Piano and Bass', 'The Piano layout',
    'Two octaves from C: the white keys on the bottom row of each, the black keys above them. The root is in the track color.',
    () => { pianoLayout(); },
    { pads: { labels: padNoteLabels, steps: false } });
screen('pads-bass', '8.2.1 Piano and Bass', 'The Bass layout',
    'Four strings, E A D G from the bottom row up, with the open string on the left and seven frets across.',
    () => {
        pianoLayout(); toBank(C.BANK_CHORD);
        const PM = PADMODE;
        for (let g = 0; g < 6 && PM.padModeCfg(S.activeTrack).piano.instr !== PM.INSTR_BASS; g++) { knobTurn(1, 6); ticks(2); }
        if (PM.padModeCfg(S.activeTrack).piano.instr !== PM.INSTR_BASS) throw new Error('Instr never reached Bass');
    },
    { pads: { labels: padNoteLabels, steps: false } });
screen('pads-audio', '16.1.1 What the Pads and Steps Show', 'An Audio clip on the pads',
    'The clip is cut into 32 sections, one per pad. The sections played this time round are bright, the one playing pulses (drawn split), and the rest are dim. The grey pads are past the end of the sample.',
    () => { sampledTrack(false); },
    { pads: { steps: true } });
screen('pads-slicer', '17.1.3 The Pads', 'A Slicer\'s pads',
    'In 4 Rows, the slices run from the bottom-left, 8 to a row. Slice 3 is playing, so it is white, and slice 1 is the picked slice. This sample has 8 slices, so the pads past them are dark.',
    () => { sampledTrack(true); },
    { pads: { labels: Array.from({ length: 32 }, (_, i) => (i < 8 ? String(i + 1) : '')), steps: false } });
const PERF_LABELS = [
    '1/32', '1/16', '1/8', '1/4', '1/2', 'Hold', 'Sync', 'Latch',
    'Oct\nUp', 'Oct\nDown', 'Scale\nUp', 'Scale\nDown', 'Fifth', 'Tritone', 'Drift', 'Storm',
    'Decresc-\nendo', 'Swell', 'Cresc-\nendo', 'Pulse', 'Side-\nchain', 'Staccato', 'Legato', 'Ramp\nGate',
    'Half\nTime', '3 Skip', 'Phantom', 'Sparse', 'Glitch', 'Stagger', 'Shuffle', 'Back-\nwards',
];
screen('pads-perf', '26.2 The Grid', 'The Performance Mode grid',
    'From the bottom: capture length and mode, then the pitch mods, the velocity and gate mods, and the wild mods. A mod turns white while it is on.',
    () => { toSession(); tap(MoveLoop); ticks(4); if (!(S.loopHeld || S.perfViewLocked)) throw new Error('Performance Mode is not up'); },
    { pads: { labels: PERF_LABELS, steps: false } });
screen('steps-shift', '31.8 Shift and Step Shortcuts', 'The step buttons while [Shift] is held',
    'The steps that have a [Shift] shortcut are lit.',
    () => { press(MoveShift); ticks(4); },
    { pads: { noPads: true, stepLabels: ['Projects', 'Settings', '', '', 'Tap', 'Metro', 'Groove', 'Layout', 'Scale', 'VelIn', 'LIVE\nARP', '', 'Resume', '', 'Double', 'Quant'] } });

const ordered = shots.map((s, i) => ({ s, i })).sort((a, b) =>
    ((a.s.order < 0 ? 1e9 : a.s.order) - (b.s.order < 0 ? 1e9 : b.s.order)) || (a.i - b.i)).map((x) => x.s);

const out = process.argv[2] || '/tmp/davebox-manual-screens';
mkdirSync(out, { recursive: true });
function pack(fb) {
    const bytes = Buffer.alloc(W * H / 8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (fb[y * W + x]) bytes[(y * W + x) >> 3] |= 0x80 >> (x & 7);
    return bytes.toString('base64');
}
const LOW_INK = 150;
const json = [];
for (const s of ordered) {
    writePng(s.fb, out + '/' + s.slug + '.png');
    const ink = s.fb.reduce((a, b) => a + b, 0);
    if (ink < LOW_INK) problems.push(s.slug + ': only ' + ink + ' px of ink — the rig probably drew the wrong screen');
    json.push({ slug: s.slug, title: s.title, caption: s.caption, section: s.section, fb: pack(s.fb), ...(s.pads ? { pads: s.pads } : {}) });
    console.log(`${String(ink).padStart(5)} px  ${s.section.padEnd(40).slice(0, 40)}  ${s.slug}`);
}
writeFileSync(out + '/screens.json', JSON.stringify(json, null, 1));
if (HUD_OUT) {
    mkdirSync(HUD_OUT, { recursive: true });
    const idx = [];
    for (const s of ordered) {
        if (!s.hud) { problems.push(s.slug + ': no Screen-view document was published'); continue; }
        if (s.hud.where && s.hud.where.screen === 'unknown') problems.push(s.slug + ': screen id unknown (a dispatcher branch without hudScreen)');
        writeFileSync(HUD_OUT + '/' + s.slug + '.json', JSON.stringify(s.hud));
        idx.push({ slug: s.slug, title: s.title, screen: s.hud.where && s.hud.where.screen });
    }
    writeFileSync(HUD_OUT + '/index.json', JSON.stringify(idx, null, 1));
    console.log('Screen-view documents: ' + idx.length + ' -> ' + HUD_OUT);
}
/* ⚠ A skipped screen is NAMED, and it makes the run fail: a count of what was
 * written says nothing about what was meant to be. */
for (const f of failures) console.log('SKIPPED ' + f.slug + ': ' + f.error);
for (const p of problems) console.log('PROBLEM ' + p);
console.log('\n' + shots.length + ' screens -> ' + out + ', ' + failures.length + ' skipped, ' + problems.length + ' problems');
if (failures.length || problems.length) process.exitCode = 1;
