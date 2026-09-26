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

/* ── the engine, as a fixture ───────────────────────────────────────────────
 * ENGINE answers host_module_get_param (the dAVEBOx DSP); SLOT[n] answers
 * shadow_get_param for chain slot n (the Schwung chains). Only what a screen
 * READS is here — the values a real session would report for the demo set. */
const ENGINE = { bpm: '120' };
globalThis.host_module_get_param = (k) => (ENGINE[k] !== undefined ? ENGINE[k] : '');
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
const SLOT = Array.from({ length: 8 }, () => ({}));   /* one chain slot per track (CHAIN_SLOTS) */
globalThis.shadow_get_param = (slot, k) => {
    const m = SLOT[slot | 0] || {};
    return m[k] !== undefined ? m[k] : '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.shadow_save_state_now = () => true;
for (const fn of ['host_system_cmd', 'host_vol_block', 'host_edit_cc_block', 'move_midi_internal_send', 'set_led',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_autosave_hold', 'host_autosave_kick', 'shadow_restore_knob_leds',
                  'host_trace_begin', 'host_trace_end', 'host_send_midi', 'move_midi_inject_to_move', 'host_set_led'])
    globalThis[fn] = () => 0;
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
const R = await import('../ui/ui_render.mjs');
const T = await import('../ui/ui_tick.mjs');
const C = await import('../ui/ui_constants.mjs');
const SND = await import('../ui/ui_sound.mjs');
const { computePadNoteMap } = await import('../ui/ui_drummodel.mjs');
const PURE = await import('../ui/ui_pure.mjs');
const MI = await import('../ui/ui_midi_import.mjs');
const AUTO = await import('../ui/ui_automation.mjs');
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
/* Walk the jog to a bank from the track overview (the real walk), then click
 * to open the bank view. */
function toBank(b, open = true) {
    const cyc = PURE.bankCycleForMode(S.trackPadMode[S.activeTrack], S.activeTrack);
    const dir = cyc.indexOf(b) < cyc.indexOf(S.activeBank) ? -1 : 1;
    for (let g = 0; g < 24 && S.activeBank !== b; g++) { jog(dir); ticks(1); }
    if (S.activeBank !== b) throw new Error('jog never reached bank ' + b + ' (at ' + S.activeBank + ')');
    if (open) { click(); ticks(2); }
}
function selectTrack(t) {
    /* Shift + bottom-row pad (1-8) — Track View's track select. */
    press(MoveShift); noteOn(PAD(t), 100); noteOff(PAD(t)); release(MoveShift); ticks(3);
    if (S.activeTrack !== t) throw new Error('Shift+pad did not select track ' + (t + 1));
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
    try {
        setup();
        if (opts.align !== false) alignBlink();
        resetFb(); globalThis.clear_screen();
        R.refreshInstrAbbrev();
        R.drawUI();
        shots.push({ slug, section, title, caption, fb: currentFb().slice() });
        letGo();
    } catch (e) {
        try { letGo(); } catch (e2) { /* the screen already failed */ }
        failures.push({ slug, error: String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) });
    }
}

/* 5 / 6 — Track View */
screen('track-melodic-playing', '5. Track View', 'Track View — melodic track playing',
    'The header names the bank; the bar along the foot shows the clip\'s pages and the playhead.',
    () => {});
screen('track-melodic-chord-held', '6.1 Playing and placing notes', 'Track View — naming a held chord',
    'Holding three pads: the chord you are playing is named in brackets at the right of the key/scale row.',
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
screen('track-empty-clip', '5.1 Switching clips', 'Track View — an empty clip',
    'Track 4 on an empty clip: nothing on the steps, a single page in the bar.',
    () => { selectTrack(3); });
screen('track-drum', '7. Drum Clips', 'Track View — drum track',
    'The lane bank and the selected lane\'s note.',
    () => { selectTrack(1); });
screen('track-conductor', '8. The Conductor', 'Track View — the Conductor',
    'The Conductor track (T8): its banks are headed C-, and its header names it [CNDT].',
    () => { selectTrack(7); });

/* 12 — Session View */
screen('session-overview', '12. Arranging', 'Session View',
    'The mixer page the jog is on, and each track\'s playing clip.',
    () => { tap(MoveNoteSession); ticks(3); if (!S.sessionView) throw new Error('Note/Session did not switch view'); });

/* 3.5 / 9 / 10 — the banks (melodic) */
const MEL_BANKS = [
    [0, 'bank-clip', '9.1 CLIP bank', 'CLIP bank', 'Each cell is the knob above it.'],
    [1, 'bank-notefx', '10.1 NOTE FX', 'NOTE FX bank', 'NOTE FX: octave, offset, velocity, quantize, length, gate and random.'],
    [2, 'bank-harmony', '10.2 HARMONY', 'HARMONY bank', 'HARMONY: an octave voice and three harmony intervals.'],
    [3, 'bank-delay', '10.3 DELAY', 'DELAY bank', 'DELAY: rate, level, repeats, velocity and pitch feedback, gate, retrigger and random.'],
    [4, 'bank-seqarp', '10.4 SEQ ARP', 'SEQ ARP bank', 'SEQ ARP: style, rate, octave, gate, steps mode, retrigger and sync.'],
    [5, 'bank-livearp', 'LIVE ARP', 'LIVE ARP bank', 'LIVE ARP: the SEQ ARP controls plus Latch, for what you play live.'],
];
for (const [b, slug, section, title, caption] of MEL_BANKS)
    screen(slug, section, title, caption, () => { toBank(b); });

screen('bank-overview-walk', '3.5 Parameter banks', 'Walking the banks from the overview',
    'Turning the jog on the track overview moves through the banks underneath it — the header names the bank (here DELAY) and nothing opens.',
    () => { toBank(3, false); });
screen('bank-clip-alt', '9.1 CLIP bank', 'CLIP bank — alternate parameters',
    'Clicking the jog on the CLIP bank swaps in the alternates: Zoom, Nudge and Reverse Style.',
    () => { toBank(0); click(); ticks(2); if (!S.altMode) throw new Error('click did not enter alt'); });
screen('bank-knob-touched', '3.5 Parameter banks', 'Touching a knob',
    'Touching knob 1 on NOTE FX: the header spells out the parameter it controls.',
    () => { toBank(1); knobTouch(0); ticks(2); });
screen('bank-value-popup', '3.5 Parameter banks', 'Turning a list parameter',
    'Turning SEQ ARP\'s Style knob opens its list over the page; the highlight follows the knob (here moved from Off to Down).',
    () => { toBank(4); knobTouch(0); knobTurn(0, 20); ticks(2); });
screen('bank-seqarp-steps', '10.4 SEQ ARP', 'SEQ ARP — per-step pitch editor',
    'Clicking the jog on SEQ ARP opens the per-step editor: knobs 1–8 set each step\'s pitch offset.',
    () => {
        toBank(4);
        knobTurn(1, 0);
        click(); ticks(2);
        if (!S.stepIntervalMode) throw new Error('click did not open the steps editor');
        knobTouch(2); knobTurn(2, 5); knobRelease(2);
        knobTouch(4); knobTurn(4, -3); knobRelease(4);
        ticks(2);
    });
screen('bank-seqarp-steps-vel', '10.4 SEQ ARP', 'SEQ ARP — per-step velocity',
    'Holding Shift in the per-step editor shows each step\'s velocity instead (Thru passes the played velocity).',
    () => {
        toBank(4); click(); ticks(2);
        if (!S.stepIntervalMode) throw new Error('click did not open the steps editor');
        press(MoveShift); ticks(2);
    });
screen('bank-step-idle', '6.3 Editing notes', 'STEP bank — no step held',
    'The STEP bank with nothing held: it asks you to hold a step.',
    () => { toBank(C.BANK_STEP); });
screen('step-editor-melodic', '6.3 Editing notes', 'Editing a held note',
    'Hold a step: the note, then length, velocity, nudge and the per-step conditions.',
    () => {
        toBank(C.BANK_STEP);
        ENGINE['t0_c0_step_20_iter'] = String((2) | (3 << 4));
        ENGINE['t0_c0_step_20_rand'] = '75';
        ENGINE['t0_c0_step_20_ratch'] = '2';
        noteOn(STEP(4), 127); ticks(HOLD_TICKS);
        if (S.heldStep < 0 || !S.heldStepNotes.length) throw new Error('hold did not load the step');
    });
screen('step-editor-reveal', '6.3 Editing notes', 'Revealing the held step from another bank',
    'Hold a step on any bank and turn the jog right: the STEP page for that note appears over the current screen.',
    () => {
        toBank(1);
        noteOn(STEP(4), 127); ticks(HOLD_TICKS);
        jog(1); ticks(2);
        if (!S.stepReveal) throw new Error('jog right did not reveal');
    });
screen('step-editor-chord', '6.2 Chords', 'A held step holding a chord',
    'A step with three notes: the note box names the lowest and counts the rest (+2).',
    () => {
        selectTrack(2);
        toBank(C.BANK_STEP);
        noteOn(STEP(0), 127); ticks(HOLD_TICKS);
        if (S.heldStepNotes.length < 2) throw new Error('chord step not loaded: ' + S.heldStepNotes);
    });
screen('loop-view', '6.6 Clip length & the loop', 'Loop view',
    'Holding Loop shows the clip length; the step buttons stand for pages and the jog changes the length by a step.',
    () => { press(MoveLoop); ticks(2); });
screen('track-recording', '6.4 Recording', 'Recording',
    'Record pressed while playing: the header adds REC while the take runs.',
    () => { tap(MoveRec); ticks(2); if (!S.recordArmed) throw new Error('Rec did not arm'); });
screen('record-blocked', '6.4 Recording', 'Recording needs Forward',
    'Record on a clip set to another direction offers to bake it to Forward first.',
    () => {
        toBank(0); knobTouch(6); knobTurn(6, 12); knobRelease(6); ticks(2);
        tap(MoveBack); ticks(2);
        if (!(S.clipPlaybackDir[0][0] | 0)) throw new Error('Dir knob did not change direction');
        tap(MoveRec); ticks(2);
        if (!S.recordBlockedDialog) throw new Error('Rec did not raise the dialog');
    });
screen('notice-undo', '6.7 Undo', 'Undo feedback',
    'Pressing Undo names what it took back.',
    () => {
        press(MoveDelete); noteOn(STEP(3), 127); noteOff(STEP(3)); release(MoveDelete); ticks(2);
        if (!S.undoAvailable) throw new Error('Delete + step did not raise an undo unit');
        tap(MoveUndo); ticks(2);
    }, { align: false });

/* 7 — drum banks */
const DRUM_BANKS = [
    [0, 'bank-drumlane', '9.2 DRUM LANE bank', 'DRUM LANE bank', 'The selected lane\'s grid: resolution, stretch, shift, legato, euclid, direction and follow.'],
    [1, 'bank-drum-notefx', '10.1 NOTE FX', 'NOTE FX on a drum track', 'On a drum track knobs 1 and 2 set the lane\'s MIDI note; knobs 3–6 shape that lane.'],
    [3, 'bank-drum-delay', '10.3 DELAY', 'DELAY on a drum track', 'DELAY on a drum track: knobs 5–7 become gate, clock feedback and retrigger.'],
];
for (const [b, slug, section, title, caption] of DRUM_BANKS)
    screen(slug, section, title, caption, () => { selectTrack(1); toBank(b); });
screen('bank-allanes-confirm', '9.3 ALL LANES bank', 'ALL LANES — confirm',
    'ALL LANES opens on a confirm, because its knobs rewrite every lane; click the jog to proceed.',
    () => { selectTrack(1); toBank(7); });
screen('bank-allanes', '9.3 ALL LANES bank', 'ALL LANES bank',
    'Confirmed: one setting for all 32 lanes — resolution, stretch, shift, quantize, velocity input, input quantize, direction and repeat sync.',
    () => { selectTrack(1); toBank(7); click(); ticks(2); if (!S.allLanesConfirmed) throw new Error('not confirmed'); });
screen('note-repeat-modes', '7.3 Note Repeat', 'Choosing the right-pad mode',
    'Shift + Step 8 on a drum track cycles the right pads between velocity zones and the two repeat modes; the card shows which is on.',
    () => {
        selectTrack(1);
        press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2);
        if (!S.drumPerformMode[1]) throw new Error('Shift+Step 8 did not change the right-pad mode');
    }, { align: false });
screen('bank-repeat-groove', 'RPT GROOVE', 'RPT GROOVE bank',
    'A velocity per gate step; a dotted bar is Thru (the pad\'s own velocity).',
    () => {
        selectTrack(1);
        press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift);
        ticks(300);                                   /* let the mode card time out */
        toBank(5);
    });
screen('step-editor-drum', '7.1 Placing hits', 'Editing a held drum hit',
    'Holding a hit on a drum lane: the same controls as a melodic note, minus the two pitch knobs.',
    () => {
        selectTrack(1);
        toBank(C.BANK_STEP);
        ENGINE['t1_l0_step_4_vel'] = '110'; ENGINE['t1_l0_step_4_gate'] = '12';
        noteOn(STEP(4), 127); ticks(HOLD_TICKS);
        if (S.heldStep < 0) throw new Error('no hold');
    });

/* 8 — Conductor banks */
const COND_BANKS = [
    [0, 'bank-cond-conduct', 'C-CONDUCT', 'The Conductor\'s own timing and direction, plus Cond Lock (CDLK) on knob 6.'],
    [1, 'bank-cond-notefx', 'C-NOTE FX', 'Shapes the Conductor\'s note before the shift: octave, offset and random.'],
    [C.BANK_RESPONDER, 'bank-cond-responder', 'C-RESPONDER', 'On = the track follows the Conductor.'],
    [C.BANK_OCTAVE, 'bank-cond-octave', 'C-OCTAVE', 'An extra octave per track.'],
    [C.BANK_WHEN, 'bank-cond-when', 'C-WHEN', 'Per track: Next (at its next note) or Now (retriggered at once).'],
];
for (const [b, slug, title, caption] of COND_BANKS)
    screen(slug, '8.3 The Conductor\'s banks', title + ' bank', caption, () => {
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

/* 12 — Session View: the mixer pages */
screen('session-mixer-volume', '12.5 Volume', 'Session mixer — Volume',
    'A fader per track.',
    () => { toSession(); click(); ticks(2); if (!S.sessMixerLatched) throw new Error('click did not open the mixer'); });
screen('session-mixer-touched', '12.5 Volume', 'Session mixer — turning a fader',
    'Turning a knob on the mixer page: the header names the track and its level, and the value replaces its number.',
    () => { toSession(); click(); ticks(2); knobTouch(2); knobTurn(2, -3); ticks(2); });
screen('session-mixer-pan', '3.5 Parameter banks', 'Session mixer — Pan',
    'One jog step on: the Pan page, a bipolar dial per track.',
    () => { toSession(); jog(1); ticks(2); click(); ticks(2); if (S.sessKnobMode !== 1) throw new Error('not on Pan: ' + S.sessKnobMode); });
screen('session-mixer-senda', '3.5 Parameter banks', 'Session mixer — Send A',
    'The Send A page: how much of each track feeds the first send bus.',
    () => { toSession(); jog(2); ticks(2); click(); ticks(2); });
screen('session-fx-door', '14.8 Master FX and the sends', 'Session mixer — Master & Send FX door',
    'In Session View the jog past Send B reaches the SESSION FX card; click it for the Master and Send FX buses.',
    () => { toSession(); jog(4); ticks(2); click(); ticks(2); });

/* 12.3 — mute & solo, seen on the track row */
screen('session-muted', '12.3 Mute & solo', 'A muted track',
    'Track 3 muted (in Session View, hold Mute and touch knob 3): its number blinks in the track row — caught here on the off beat.',
    () => {
        toSession();
        /* Mute + KNOB TOUCH: in Session View knob k stands for track k (ui.js,
         * the knob-touch branch). */
        press(MoveMute); knobTouch(2); knobRelease(2); release(MoveMute); ticks(2);
        if (!S.trackMuted[2]) throw new Error('Mute + knob touch did not mute track 3');
        /* the blink's OFF half, so the mute shows */
        for (let g = 0; g < 60 && Math.floor(S.clockMs / 220) % 2 === 0; g++) ticks(1);
    }, { align: false });
screen('session-soloed', '12.3 Mute & solo', 'A soloed track',
    'Track 5 soloed (in Session View, hold Shift + Mute and touch knob 5): its number shows filled in.',
    () => {
        toSession();
        press(MoveShift); press(MoveMute); knobTouch(4); knobRelease(4); release(MoveMute); release(MoveShift); ticks(2);
        if (!S.trackSoloed[4] || !S.sessionView) throw new Error('Shift + Mute + knob touch did not solo track 5');
    });

/* 13 — Performance Mode */
screen('perf-mode', '13. Performance Mode', 'Performance Mode',
    'Loop tapped in Session View: Performance Mode, nothing engaged yet — the footer shows the Hold, Sync and Latch states.',
    () => { toSession(); tap(MoveLoop); ticks(2); if (!S.perfViewLocked) throw new Error('Loop tap did not lock Performance Mode'); });
screen('perf-mode-mods', '13.2 The grid', 'Performance Mode — mods engaged',
    'The engaged mods, and the loop length.',
    () => {
        toSession(); tap(MoveLoop); ticks(2);
        noteOn(PAD(2), 100);                        /* bottom row: a 1/8 capture length, held */
        for (const i of [8 + 3, 16 + 0, 24 + 5]) { noteOn(PAD(i), 100); noteOff(PAD(i)); }
        ticks(120);                                   /* past the engage flash */
        if (!(S.perfModsToggled | S.perfModsHeld)) throw new Error('no mods engaged');
    });
screen('perf-mode-preset', '13.4 Presets', 'Performance Mode — a preset recalled',
    'Step 1 tapped in Performance Mode recalls the Float preset: the title names it.',
    () => { toSession(); tap(MoveLoop); ticks(2); noteOn(STEP(0), 127); noteOff(STEP(0)); ticks(120);
            if (S.perfRecalledSlot !== 0) throw new Error('step 1 did not recall preset 1'); });

/* 6.5 — Capture */
screen('capture-nothing', '6.5 Capture', 'Capture with nothing buffered',
    'Tapping Capture when nothing has been played says so.',
    () => { tap(MoveCapture); ticks(2); }, { align: false });
screen('capture-tempo', '6.5 Capture', 'Capture — the tempo chooser',
    'Turn the jog through the detected tempos; your take is drawn against the bars.',
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
screen('capture-length', '6.5 Capture', 'Capture — fitting the take to bars',
    'Capture in a stopped set that already has clips: the take is fitted to the current tempo and the jog picks how many bars it fills.',
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
screen('capture-place', '6.5 Capture', 'Capture — choosing where the take goes',
    'Capture while stopped on a clip that already has notes: tap one of the blinking empty clips to keep the take there.',
    () => {
        stopTransport();
        ENGINE.capture_pending = '9 0 0'; ticks(8);
        tap(MoveCapture); ticks(2);
        if (S.capturePlaceTrack < 0) throw new Error('no destination prompt');
    });

/* 15.2 — Live Merge */
screen('merge-notice-session', '16.2 Live Merge', 'Live Merge — armed from Session View',
    'Shift + Sample with the transport stopped: the notice says the merge will capture all 8 tracks; Record starts it.',
    () => { stopTransport(); toSession(); press(MoveShift); tap(C.MoveSample); release(MoveShift); ticks(2);
            if (!S.mergeNoticePending) throw new Error('no merge notice'); });
screen('merge-notice-track', '16.2 Live Merge', 'Live Merge — armed from Track View',
    'The same gesture in Track View captures the active track alone.',
    () => { stopTransport(); press(MoveShift); tap(C.MoveSample); release(MoveShift); ticks(2);
            if (!S.mergeNoticePending) throw new Error('no merge notice'); });
screen('merge-place-scene', '16.2 Live Merge', 'Live Merge — placing the take',
    'After a Session View merge: tap a row or a scene step to receive the eight clips.',
    () => {
        toSession();
        engineSnapshot({ merge: 1 }); ticks(8);
        engineSnapshot({ merge: 4 }); ticks(8);
        if (!S.pendingMergePlacement) throw new Error('the poll did not raise the placement prompt');
    });
screen('merge-place-track', '16.2 Live Merge', 'Live Merge — keeping a single-track take',
    'After a Track View merge: the empty clips on that track blink; tap one to keep the take.',
    () => {
        engineSnapshot({ merge: 1, solo: 0 }); ticks(8);
        engineSnapshot({ merge: 4, solo: 0 }); ticks(8);
        if (S.mergeSoloPlacement < 0) throw new Error('the poll did not raise the solo placement prompt');
    });

/* 15.1 — Bake */
screen('bake-clip', '16.1 Bake', 'Bake a clip',
    'Sample tapped in Track View: choose how many loops to render into plain notes.',
    () => { press(C.MoveSample); release(C.MoveSample); ticks(2); if (!S.confirmBake) throw new Error('no bake confirm'); });
screen('bake-drum', '16.1 Bake', 'Bake a drum clip',
    'On a drum track the bake first asks: the whole clip, or just the selected lane.',
    () => { selectTrack(1); press(C.MoveSample); release(C.MoveSample); ticks(2); if (!S.confirmBake) throw new Error('no bake confirm'); });
screen('bake-scene-pick', '16.1 Bake', 'Bake a scene — pick the row',
    'Sample tapped in Session View: tap a row or a scene step to choose what to bake.',
    () => { toSession(); press(C.MoveSample); release(C.MoveSample); ticks(2); if (!S.pendingSceneBakePicker) throw new Error('no picker'); });
screen('bake-scene-confirm', '16.1 Bake', 'Bake a scene — loops',
    'Row chosen: the same loop-count choice, for every clip in the scene.',
    () => { toSession(); press(C.MoveSample); release(C.MoveSample); ticks(2);
            noteOn(STEP(0), 127); noteOff(STEP(0)); ticks(2);
            if (!S.confirmBakeScene) throw new Error('no scene bake confirm'); });

/* 3.6 / 16 — Project Settings (Shift + Step 2) */
const openSettings = () => {
    press(MoveShift); noteOn(STEP(1), 127); noteOff(STEP(1)); release(MoveShift); ticks(2);
    if (!S.globalMenuOpen) throw new Error('Shift + Step 2 did not open Project Settings');
};
/* Jog the menu cursor onto the row with this label. */
function menuTo(label) {
    const idx = S.globalMenuItems.findIndex((it) => it && it.label === label);
    if (idx < 0) throw new Error('no menu row ' + label);
    for (let g = 0; g < 60 && S.globalMenuState.selectedIndex !== idx; g++)
        { jog(S.globalMenuState.selectedIndex < idx ? 1 : -1); ticks(1); }
    if (S.globalMenuState.selectedIndex !== idx) throw new Error('jog never reached ' + label);
}
screen('menu-project-settings', '3.6 Project Settings', 'Project Settings',
    'Shift + Step 2. Every list in dAVEBOx looks like this.',
    () => { openSettings(); });
screen('menu-clock', '15.3 Clock Follow', 'Project Settings — Clock Follow and Clock Out',
    'Scrolled to the clock rows: Clock Follow (Off or Move) and Clock Out.',
    () => { openSettings(); menuTo('Clock Follow'); });
screen('menu-key-scale', '17.2 Key & Scale', 'Project Settings — Key and Scale',
    'Scrolled to Key, Scale and Scale Aware.',
    () => { openSettings(); menuTo('Scale'); });
screen('menu-scale-picker', '17.2 Key & Scale', 'Choosing a scale',
    'Clicking Scale opens its list over the menu; the jog moves through it and previews on the pads.',
    () => { openSettings(); menuTo('Scale'); click(); ticks(2); jog(2); ticks(2);
            if (!S.globalEnumPick) throw new Error('no scale list'); });
screen('xpose-confirm', '17.2 Key & Scale', 'Transpose clips?',
    'Committing a new key with notes in the melodic clips asks whether to move the notes with it.',
    () => { openSettings(); menuTo('Key'); click(); ticks(2); jog(3); ticks(2); click(); ticks(2);
            if (!S.confirmXpose) throw new Error('no transpose confirm'); });
screen('menu-foot', '17.1 Project settings', 'Project Settings — the foot of the list',
    'Near the foot of the list: Suspend session, Quit and Host Settings (Projects, Save and Load state, Clear Sess and Export sit just above; the Daves rows below).',
    () => { openSettings(); menuTo('Quit'); });
screen('tap-tempo', '17.1 Project settings', 'Tap Tempo',
    'Shift + Step 5: tap any pad in time and the tempo follows; the jog fine-tunes it.',
    () => { press(MoveShift); noteOn(STEP(4), 127); noteOff(STEP(4)); release(MoveShift); ticks(2);
            if (!S.tapTempoOpen) throw new Error('Shift + Step 5 did not open tap tempo');
            for (let i = 0; i < 4; i++) { noteOn(PAD(9), 100); noteOff(PAD(9)); ticks(47); } });
screen('save-state-confirm', '17.3 Snapshots', 'Save state',
    'Project Settings → Save state asks first, and says how many of the 16 snapshots are used.',
    () => { openSettings(); menuTo('Save state'); click(); ticks(2); if (!S.confirmSaveState) throw new Error('no confirm'); });
screen('snapshot-picker', '17.3 Snapshots', 'Load state',
    'Project Settings → Load state lists the saved snapshots, newest first, by date and time.',
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
screen('clear-session-confirm', '17.1 Project settings', 'Clear Session',
    'Clear Session confirms first — it cannot be undone.',
    () => { openSettings(); menuTo('Clear Sess'); click(); ticks(2); if (!S.confirmClearSession) throw new Error('no confirm'); });
screen('export-confirm', '16.3 Export to Live', 'Export to Ableton',
    'Project Settings → Export to Ableton (with the transport stopped) confirms before writing the bundle.',
    () => { stopTransport(); openSettings(); menuTo('Export to Ableton'); click(); ticks(4);
            if (!S.confirmExport) throw new Error('no export confirm'); });
screen('export-conductor', '16.3 Export to Live', 'Export — Apply Conductor?',
    'With a Conductor in the set, the export asks whether to fold its transposition into the responding clips.',
    () => { stopTransport(); openSettings(); menuTo('Export to Ableton'); click(); ticks(4);
            jog(-1); ticks(1); click(); ticks(2);
            if (!S.confirmExportCondPhase) throw new Error('no Apply Conductor step'); });
screen('quit-confirm', '3.7 Saving, suspending & exiting', 'Quit',
    'Project Settings → Quit: save and leave the session.',
    () => { openSettings(); menuTo('Quit'); click(); ticks(2); if (S.confirmExit !== 'quit') throw new Error('no quit confirm'); });
screen('suspend-confirm', '3.7 Saving, suspending & exiting', 'Suspend session',
    'Project Settings → Suspend session: park dAVEBOx in the background.',
    () => { openSettings(); menuTo('Suspend session'); click(); ticks(2); if (S.confirmExit !== 'suspend') throw new Error('no suspend confirm'); });
screen('exiting', '3.7 Saving, suspending & exiting', 'Exiting',
    'The last frame before the device is handed back.',
    () => { openSettings(); menuTo('Quit'); click(); ticks(2); jog(-1); ticks(1); click(); ticks(12);
            if (!S.exitFarewell) throw new Error('no farewell screen'); });

/* 2 — Projects (Shift + Step 1) */
const openProjects = () => {
    press(MoveShift); noteOn(STEP(0), 127); noteOff(STEP(0)); release(MoveShift); ticks(2);
    if (!S.projectPadPicker) throw new Error('Shift + Step 1 did not open the project picker');
};
screen('projects-current', 'Projects — dAVEBOx has its own workspace', 'Project picker — the open project',
    'Shift + Step 1: the picker opens on the project you are in — marked Current, with Resume to go back to it.',
    () => { openProjects(); });
screen('projects-other', 'Projects — dAVEBOx has its own workspace', 'Project picker — another project',
    'The selected project and what you can do with it.',
    () => { openProjects(); noteOn(PAD(1), 100); noteOff(PAD(1)); ticks(2); });
screen('projects-color', 'Projects — dAVEBOx has its own workspace', 'Project picker — Color',
    'Color lists the palette; the pad previews each colour as the jog moves.',
    () => { openProjects(); noteOn(PAD(1), 100); noteOff(PAD(1)); ticks(2);
            for (let g = 0; g < 3; g++) { jog(1); ticks(1); } click(); ticks(2); jog(2); ticks(2);
            if (!S.projectPadPicker.colorPick) throw new Error('Color did not open'); });
screen('projects-new', 'Projects — dAVEBOx has its own workspace', 'Project picker — a new project',
    'Tapping an empty pad asks before creating a project there.',
    () => { openProjects(); noteOn(PAD(9), 100); noteOff(PAD(9)); ticks(2);
            if (!S.projectPadPicker.confirmNew) throw new Error('no new-project confirm'); });
screen('projects-delete', 'Projects — dAVEBOx has its own workspace', 'Project picker — delete',
    'Hold Delete and tap a project: tap it again to confirm.',
    () => { openProjects(); press(MoveDelete); noteOn(PAD(2), 100); noteOff(PAD(2)); ticks(2);
            if (S.projectPadPicker.deleteIdx !== 2) throw new Error('delete not armed'); });
screen('projects-copy', 'Projects — dAVEBOx has its own workspace', 'Project picker — copy',
    'Hold Copy and tap a project, then tap an empty pad to copy it there.',
    () => { openProjects(); press(MoveCopy); noteOn(PAD(2), 100); noteOff(PAD(2)); ticks(2);
            if (S.projectPadPicker.copySrcIdx !== 2) throw new Error('copy not armed'); });
screen('projects-loading', 'Open dAVEBOx', 'Loading a project',
    'Load chosen: the project\'s name over a Dave while it opens.',
    () => { openProjects(); noteOn(PAD(1), 100); noteOff(PAD(1)); ticks(2); click();
            if (!S.switchLoading) throw new Error('no loading screen'); }, { align: false });

/* Dialogs raised by the chord layout / type changes */
screen('chord-layout-card', '6.1 Playing and placing notes', 'The Chord layout card',
    'Switching a track to the Chord layout (Shift + Step 8, twice from Scale) explains the rows until you click OK.',
    () => { for (let i = 0; i < 2; i++) { press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2); }
            if (!S.chordPopupOpen) throw new Error('no chord card'); });
screen('bank-chord', '6.1 Playing and placing notes', 'CHORD bank',
    'On a Chord-layout track the CHORD bank follows LIVE ARP: voicing, smoothing, bass, strum and slot mode.',
    () => { for (let i = 0; i < 2; i++) { press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2); }
            click(); ticks(2); toBank(C.BANK_CHORD); });
screen('bank-chord-slot', '6.1 Playing and placing notes', 'CHORD bank — editing a chord',
    'Hold a chord pad on the CHORD bank to edit that chord.',
    () => { for (let i = 0; i < 2; i++) { press(MoveShift); noteOn(STEP(7), 127); noteOff(STEP(7)); release(MoveShift); ticks(2); }
            click(); ticks(2); toBank(C.BANK_CHORD); noteOn(PAD(5), 100); ticks(4); });

screen('loading-sequencer', 'Open dAVEBOx', 'Starting the sequencer',
    'The last stage of opening a project: the sequencer starting up.',
    () => { S.stateLoading = true; }, { align: false });

/* 14.3 — the track's sound editor (Shift + Note/Session) */
const openTrackConfig = () => {
    press(MoveShift); tap(MoveNoteSession); release(MoveShift); ticks(6);
    if (!SND.soundOpen()) throw new Error('Shift + Note/Session did not open the sound editor');
};
function soundRowTo(kind) {
    const st = SND.soundPickStateForTest();
    const target = st.kinds.indexOf(kind);
    if (target < 0) throw new Error('no sound row of kind ' + kind + ' in ' + st.kinds.join(','));
    for (let g = 0; g < 80 && SND.soundPickStateForTest().row !== target; g++)
        { jog(SND.soundPickStateForTest().row < target ? 1 : -1); ticks(1); }
    if (SND.soundPickStateForTest().row !== target) throw new Error('jog never reached ' + kind);
}
/* Jog a file browser (Import MIDI) onto the row with this label. */
function jogToLabel(label) {
    const b = MI.miStateForTest().browser;
    const want = b.items.findIndex((i) => i.label === label);
    if (want < 0) throw new Error('no browser row ' + label + ' in ' + b.items.map((i) => i.label).join(','));
    for (let g = 0; g < 40 && b.selectedIndex !== want; g++) { jog(b.selectedIndex < want ? 1 : -1); ticks(1); }
    if (b.selectedIndex !== want) throw new Error('jog never reached ' + label);
}
screen('track-config', '14.2 The menu', 'TRACK CONFIG — a Schwung track',
    'The track\'s chain first: instrument, MIDI FX, effects.',
    () => { selectTrack(4); openTrackConfig(); });
screen('track-config-levels', '14.2 The menu', 'TRACK CONFIG — levels and presets',
    'Further down the same menu, below a line: the track\'s levels — Volume, Pan, Send A and Send B.',
    () => { selectTrack(4); openTrackConfig(); for (let g = 0; g < 7; g++) { jog(1); ticks(1); } });
screen('track-config-foot', '17.4 Track settings', 'TRACK CONFIG — the track\'s own settings',
    'The foot of the menu: the track\'s own settings end with Looper, then Import MIDI and Parallel, each group behind a line.',
    () => { selectTrack(4); openTrackConfig(); for (let g = 0; g < 40; g++) { jog(1); ticks(1); }});
screen('track-config-move', '14.2 The menu', 'TRACK CONFIG — a Move track',
    'On a track playing a Move instrument the chain row names it (Move 1); the rest of the menu is the Move bus\'s effects and levels.',
    () => { openTrackConfig(); });
screen('instrument-picker', '14.3 Choosing an instrument', 'The Instmt/Dest picker',
    'Everything a track can play, in one list; the loaded one is in brackets.',
    () => {
        selectTrack(4); openTrackConfig();
        press(MoveShift); click(); release(MoveShift); ticks(4);
        if (!SND.soundEnumPickForTest()) throw new Error('Shift+click did not open the picker');
    });
screen('block-editor', '14.4 Editing a module', 'Editing an instrument',
    'The knobs edit its parameters; the jog turns the pages.',
    () => { selectTrack(4); openTrackConfig(); click(); ticks(8); });

screen('fx-browser', '14.2 The menu', 'Adding an effect',
    'Clicking an empty effect block opens the module list — the installed effects, by name.',
    () => { selectTrack(4); openTrackConfig(); soundRowTo('block'); jog(2); ticks(1);
            if (SND.soundPickStateForTest().labels[SND.soundPickStateForTest().row] !== 'FX 2') throw new Error('not on FX 2');
            click(); ticks(6); });
screen('sound-card', '14.1 Opening TRACK CONFIG', 'The SOUND + CONFIG card',
    'The knobs are the track\'s levels; click to open TRACK CONFIG.',
    () => { selectTrack(4); toBank(C.BANK_SOUND, false); knobTouch(0); ticks(4); });
screen('macros-card', '14.6 The MACROS bank', 'The MACROS bank',
    'Each knob shows its target; a knob driving several (MAC1) shows its own position.',
    () => { selectTrack(4); toBank(C.BANK_MACROS); ticks(8); });
const openMacroList = () => {
    selectTrack(4); toBank(C.BANK_MACROS); ticks(8); click(); ticks(4);
};
screen('macros-list', '14.6 The MACROS bank', 'MACROS — the assignment list',
    'Clicking the jog on MACROS lists K1–K8 with each knob\'s mapping written compactly; an unassigned knob reads --.',
    () => { openMacroList(); });
screen('macros-multi', 'One knob, several parameters', 'One knob, several targets',
    'Everything one knob drives, each with its own range.',
    () => { openMacroList(); for (let g = 0; g < 5; g++) { jog(1); ticks(1); } click(); ticks(4); });
screen('macros-targets', '14.6 The MACROS bank', 'MACROS — choosing a target',
    'Clicking an unassigned knob goes straight to choosing: a block, a bank, Levels, MIDI — or SnapMorph, last.',
    () => { openMacroList(); for (let g = 0; g < 6; g++) { jog(1); ticks(1); } click(); ticks(4); for (let g = 0; g < 20; g++) { jog(1); ticks(1); } });

/* 14.3 — a MIDI track (route: a MIDI channel) */
screen('midi-track-card', '14.1 Opening TRACK CONFIG', 'SOUND + CONFIG on a MIDI track',
    'On a track sending MIDI, the SOUND + CONFIG card is a standard controller: Expression (touched here), Pan, Mod wheel and Sustain, then the clip\'s Program and Bank.',
    () => {
        selectTrack(3);
        S.trackRoute[3] = 2; S.trackChannel[3] = 10; ENGINE.t3_route = 'external'; ENGINE.t3_channel = '10';
        toBank(C.BANK_SOUND, false); knobTouch(0); ticks(4);
    });

/* 14.3 — the global effect buses, from Session View */
screen('fx-buses', '14.8 Master FX and the sends', 'MASTER and SEND FX',
    'Shift + Note/Session in Session View: the MASTER FX bus and the two sends, each with four effect blocks.',
    () => { toSession(); press(MoveShift); tap(MoveNoteSession); release(MoveShift); ticks(6);
            if (!SND.soundOpen()) throw new Error('no bus list'); });

/* 15.4 — Import MIDI, from the track's Sound menu */
const openImport = (t) => {
    selectTrack(t); openTrackConfig(); soundRowTo('midiimport'); click(); ticks(4);
};
screen('import-files', '16.4 Import a MIDI file', 'Import MIDI — pick the file',
    'Sound menu → Import MIDI: a browser showing folders and MIDI files only.',
    () => { stopTransport(); openImport(3); });
screen('import-parts', '16.4 Import a MIDI file', 'Import MIDI — pick a part',
    'A file with several parts: each with its note count and a miniature of its notes.',
    () => { stopTransport(); openImport(3); jogToLabel('Bach Invention 8.mid'); click(); ticks(4); });
screen('import-options', '16.4 Import a MIDI file', 'Import MIDI — the knobs',
    'The brackets mark what will land in the clip.',
    () => { stopTransport(); openImport(3); jogToLabel('Bach Invention 8.mid'); click(); ticks(4); click(); ticks(4); });
screen('import-options-cut', '16.4 Import a MIDI file', 'Import MIDI — notes that will be cut',
    'Moving the start and length: the footer warns when notes would be cut.',
    () => { stopTransport(); openImport(3); jogToLabel('Bach Invention 8.mid'); click(); ticks(4); click(); ticks(4);
            knobTouch(0); knobTurn(0, 12); knobRelease(0); knobTouch(1); knobTurn(1, -24); knobRelease(1); ticks(2); });

screen('snapmorph-slots', '14.7 Sound snapshots & SnapMorph', 'SnapMorph — choosing snapshots',
    'Click snapshots in the order the knob travels: [1] is the bottom of the turn.',
    () => { openMacroList(); for (let g = 0; g < 6; g++) { jog(1); ticks(1); } click(); ticks(4);
            for (let g = 0; g < 20; g++) { jog(1); ticks(1); } click(); ticks(4);
            jog(2); ticks(1); click(); ticks(2); jog(-2); ticks(1); click(); ticks(2); });

/* 11 — the AUTOMATION bank, on track 5 */
function withAutomation() {
    ENGINE.pa_list = ['4 0 1 8 4:synth:cutoff 0', '4 0 3 12 4:synth:reso 48', '4 0 1 4 4:slot:volume 0',
                      '4 0 0 3 4:fx1:mix 0', ''].join('\n');
    ENGINE.t4_c0_at_has = '1'; S.clipAtHas[4][0] = true;
    AUTO.automationNoteListChangedElsewhere();
}
screen('bank-automation', '11.2 The AUTOMATION bank', 'AUTOMATION bank',
    'Everything automated in the clip, with its state.',
    () => { selectTrack(4); withAutomation(); ticks(8);
            toBank(C.BANK_AUTOMATION); ticks(8);});
screen('automation-menu', '11.2 The AUTOMATION bank', 'AUTOMATION — the menu',
    'Click the jog for the menu; turn to a row and click for its operations.',
    () => { selectTrack(4); withAutomation(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(1); ticks(2); });
screen('automation-ops', '11.2 The AUTOMATION bank', 'AUTOMATION — a parameter\'s operations',
    'A row\'s operations: Delete, Mute, Mode, Smooth, Wrap, Link, Loop and Rate.',
    () => { selectTrack(4); withAutomation(); ticks(8); toBank(C.BANK_AUTOMATION); ticks(8); click(); ticks(4); jog(1); ticks(2); click(); ticks(4); });

/* 16.3 / SnapMorph — the snapshot layer (hold Capture) */
screen('snapshot-layer-track', '14.7 Sound snapshots & SnapMorph', 'The track snapshot layer',
    'Holding Capture in Track View opens the track\'s snapshot layer: the band names it, and the step buttons are its slots.',
    () => { press(MoveCapture); ticks(90); if (!S.devSnap || !S.devSnap.open) throw new Error('no snapshot layer'); });
screen('snapshot-layer-session', '14.7 Sound snapshots & SnapMorph', 'The device snapshot layer',
    'Holding Capture in Session View opens the snapshot layer for the whole device.',
    () => { toSession(); press(MoveCapture); ticks(90); if (!S.devSnap || !S.devSnap.open) throw new Error('no snapshot layer'); });

/* 12.5 — Shift + Volume */
screen('track-volume-card', '12.5 Volume', 'Shift + Volume',
    'Shift + Volume adjusts the active track\'s level from anywhere; a card shows it over the current screen.',
    () => { press(MoveShift); cc(79, 127); cc(79, 127); ticks(2); }, { align: false });

/* 7.4 — a muted drum lane */
screen('drum-lane-muted', '7.4 Copying, clearing & muting lanes', 'A muted drum lane',
    'Mute + a lane pad mutes that lane: the drum overview says MUTED beside the selected lane.',
    () => { selectTrack(1); press(MoveMute); noteOn(PAD(0), 100); noteOff(PAD(0)); release(MoveMute); ticks(2);
            if (!(S.drumLaneMute[1] & 1)) throw new Error('lane 1 not muted'); });

/* 4.1 / 8.1 — type changes */
screen('conductor-exists', '8.1 Creating one', 'Only one Conductor',
    'Choosing Conductor for a second track: the set already has one, so the info dialog says so.',
    () => { stopTransport(); selectTrack(3); openTrackConfig(); press(MoveShift); click(); release(MoveShift); ticks(4);
            const p = SND.soundEnumPickForTest(); const want = p.options.indexOf('Conductor');
            for (let g = 0; g < 40 && SND.soundEnumPickForTest().sel !== want; g++) { jog(SND.soundEnumPickForTest().sel < want ? 1 : -1); ticks(1); }
            click(); ticks(4);
            if (!S.menuInfoLines.length) throw new Error('no info dialog'); });
screen('convert-drums', '4.2 Changing type', 'Changing Keys to Drums',
    'Mode → Drums on a track that holds notes asks first.',
    () => { stopTransport(); openTrackConfig();
            const st = SND.soundPickStateForTest(); const want = st.labels.indexOf('Mode');
            for (let g = 0; g < 60 && SND.soundPickStateForTest().row !== want; g++) { jog(1); ticks(1); }
            click(); ticks(2); jog(1); ticks(2); click(); ticks(4);
            if (!S.confirmConvertToDrum) throw new Error('no convert confirm'); });

/* 12.4 — mute snapshots */
screen('mute-snapshot-saved', '12.4 Mute snapshots', 'Saving a mute snapshot',
    'In Session View, hold Mute and press Shift + a step button: the current mute/solo state is saved to that slot.',
    () => { toSession(); press(MoveMute); press(MoveShift); noteOn(STEP(2), 127); noteOff(STEP(2)); ticks(2); }, { align: false });

/* 9 — Delete + jog click on MACROS asks first */
screen('macros-clear-confirm', '9. Clip Timing & Grid', 'Clearing all macros',
    'Delete + jog click on MACROS unassigns all eight knobs — it asks first.',
    () => { selectTrack(4); toBank(C.BANK_MACROS); ticks(8); press(MoveDelete); click(); ticks(2);
            if (!S.confirmMacroClear) throw new Error('no macro clear confirm'); });

/* 16.5 — a set from an older dAVEBOx */
screen('state-mismatch', '17.5 Projects & compatibility', 'A set from another version',
    'Opening a project saved by a different dAVEBOx version: No (the default) leaves it untouched, Yes erases it and starts clean.',
    () => { ENGINE.state_version_mismatch = '1'; globalThis.init(); ticks(2);
            if (!S.confirmStateWipe) throw new Error('the load decision did not ask'); });

/* 15.3 — the export's DONE dialog is not rendered: the run needs the device's
 * export templates (drift-dummy.json is not in this tree) and pack.py's status
 * file, and supplying those would be staging the result, not reaching it. */

/* 15.4 — importing over a clip that has notes */
screen('import-replace', '16.4 Import a MIDI file', 'Import MIDI — replacing a clip',
    'Importing into a clip that already holds notes asks first.',
    () => { stopTransport(); openImport(0); jogToLabel('Bach Invention 8.mid'); click(); ticks(4); click(); ticks(4);
            /* K4 To: back to the clip we are on, which holds notes */
            knobTouch(3);
            for (let g = 0; g < 30 && MI.miStateForTest().choices[MI.miStateForTest().toIdx] !== 0; g++) { knobTurn(3, -1); ticks(1); }
            knobRelease(3);
            if (MI.miStateForTest().choices[MI.miStateForTest().toIdx] !== 0) throw new Error('To never reached clip A');
            click(); ticks(4); });

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
    json.push({ slug: s.slug, title: s.title, caption: s.caption, section: s.section, fb: pack(s.fb) });
    console.log(`${String(ink).padStart(5)} px  ${s.section.padEnd(40).slice(0, 40)}  ${s.slug}`);
}
writeFileSync(out + '/screens.json', JSON.stringify(json, null, 1));
/* ⚠ A skipped screen is NAMED, and it makes the run fail: a count of what was
 * written says nothing about what was meant to be. */
for (const f of failures) console.log('SKIPPED ' + f.slug + ': ' + f.error);
for (const p of problems) console.log('PROBLEM ' + p);
console.log('\n' + shots.length + ' screens -> ' + out + ', ' + failures.length + ' skipped, ' + problems.length + ' problems');
if (failures.length || problems.length) process.exitCode = 1;
