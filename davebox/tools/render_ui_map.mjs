// tools/render_ui_map.mjs — every bank page, bank map and Audio screen, per
// track type, rendered from the REAL UI, plus the layout tables behind them —
// the data for the UI-map tool (the bank layout explorer).
//
//   cd davebox && node --import ./tools/audit_loader.mjs tools/render_ui_map.mjs <out.json>
//
// The rig (engine fixture, gestures, demo project) is render_manual_screens.mjs's
// own, copied at build time up to its first screen, with T7 made an Audio track.
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
    const MODES = [0, DRUM, 0, 0, 0, 0, C.PAD_MODE_AUDIO, COND];   /* (the map renderer: T7 is Audio) */
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
        shots.push({ slug, section, title, caption, fb: currentFb().slice() });
        letGo();
    } catch (e) {
        try { letGo(); } catch (e2) { /* the screen already failed */ }
        failures.push({ slug, error: String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) });
    }
}


/* ── the Audio track (T7): a 2 s sample, Slice mode, 8 even slices ───────── */
const AU_T = 6;
const PEAKS = Array.from({ length: 128 }, (_, i) => {
    const env = Math.max(0.08, Math.exp(-((i % 16) / 5)));        /* a hit every 16 columns */
    const v = Math.round(env * 110 * (0.7 + 0.3 * Math.abs(Math.sin(i * 1.7))));
    return ((256 - v) & 255).toString(16).padStart(2, '0') + v.toString(16).padStart(2, '0');
}).join('');
const MARKS8 = Array.from({ length: 8 }, (_, k) => (k * 11025) + ' ' + ((k + 1) * 11025)).join(' ');
function audioEngine(mode) {
    /* "state err mode even hand jump rstart rend pitch gain frames rate ch revrs nudge jmpq n|name" */
    ENGINE['t' + AU_T + '_au_info_0'] = '2 0 ' + mode + ' 8 1 16 0 88200 0 0 88200 44100 2 0 0 0 8|Break 120bpm.wav';
    ENGINE['t' + AU_T + '_au_peaks_0'] = PEAKS;
    ENGINE['t' + AU_T + '_au_marks_0'] = MARKS8;
    ENGINE['t' + AU_T + '_au_pos'] = '0 0 -1';
    ENGINE['t' + AU_T + '_au_lazy'] = '0 0 0';
    ENGINE['t' + AU_T + '_au_all_0'] = '0 0 0 0 0 0';
    for (let l = 0; l < 8; l++) ENGINE['t' + AU_T + '_au_sl_0_' + l] = (l * 11025) + ' ' + ((l + 1) * 11025) + ' 0 0 0 0 0 0 0';
    ENGINE['t' + AU_T + '_au_dir'] = '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples';
}
async function audioReady(mode) {
    audioEngine(mode);
    const AU = await import('../ui/ui_audio.mjs');
    AU.auMarkStale(AU_T, 0);
    AU.auReadTrack(AU_T);
    ticks(10);
    computePadNoteMap();
}

/* ── capture ─────────────────────────────────────────────────────────────── */
const SCREENS = {};
function packFb(fb) {
    const bytes = Buffer.alloc(W * H / 8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (fb[y * W + x]) bytes[(y * W + x) >> 3] |= 0x80 >> (x & 7);
    return bytes.toString('base64');
}
function grab(slug) {
    resetFb(); globalThis.clear_screen();
    R.refreshInstrAbbrev();
    R.drawUI();
    const fb = currentFb().slice();
    const ink = fb.reduce((a, b) => a + b, 0);
    SCREENS[slug] = packFb(fb);
    console.log(String(ink).padStart(5) + ' px  ' + slug + (ink < 150 ? '   <-- LOW INK' : ''));
    return ink;
}
const mapFailures = [];
async function shot(slug, setup) {
    restore();
    MI.miClose();
    try {
        await setup();
        alignBlink();
        grab(slug);
        letGo();
    } catch (e) {
        try { letGo(); } catch (e2) { /* already failed */ }
        mapFailures.push(slug + ': ' + String(e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e));
    }
}

const FAMILIES = [
    { id: 'melodic', label: 'Melodic', t: 0 },
    { id: 'drum', label: 'Drum', t: 1 },
    { id: 'conduct', label: 'Conductor', t: 7 },
    { id: 'audio', label: 'Audio', t: AU_T, audio: 1 },
];
const DATA = { families: {}, session: PURE.SESS_PAD_MAP, modulePads: PURE.BANK_MAP_MODULE_PADS, banks: {} };
for (const b in C.BANKS) DATA.banks[b] = { name: C.BANKS[b].name, short: C.BANK_SHORT[b] || null,
    knobs: (C.BANKS[b].knobs || []).map((k) => (k ? { label: k.label || '', name: k.name || k.fullName || '' } : null)) };

for (const f of FAMILIES) {
    restore();
    const pm = S.trackPadMode[f.t];
    const list = PURE.bankListForMode(pm, f.t);
    const walk = PURE.bankCycleForMode(pm, f.t);
    const fam = {
        label: f.label, padMode: pm, track: f.t + 1,
        list, walk, doors: list.filter((b) => PURE.bankIsDoor(pm, b)),
        categories: PURE.bankCategoriesForMode ? PURE.bankCategoriesForMode(pm, f.t) : null,
        map: PURE.bankPadMapForMode(pm, f.t),
        modules: [],
        names: {},
    };
    for (const b of list) fam.names[b] = PURE.bankDisplayName(pm, b);
    for (let col = 4; col < 8; col++) for (let row = 0; row < 4; row++) {
        const m = PURE.bankMapModuleAt(S.trackRoute[f.t], pm, col, row);
        if (m) fam.modules.push({ col, row, label: m.label, comp: m.comp });
    }
    DATA.families[f.id] = fam;

    const prep = async () => { if (f.audio) await audioReady(1); selectTrack(f.t); if (f.audio) await audioReady(1); };
    await shot(f.id + '-rest', async () => { await prep(); });
    await shot(f.id + '-map', async () => { await prep(); press(3); ticks(3); });
    for (const b of list) await shot(f.id + '-bank-' + b, async () => { await prep(); toBank(b, true); });
}

/* Audio: Loop mode's own CLIP bank and rest screen */
await shot('audio-loop-rest', async () => { await audioReady(0); selectTrack(AU_T); await audioReady(0); });
await shot('audio-loop-bank-0', async () => { await audioReady(0); selectTrack(AU_T); await audioReady(0); toBank(0, true); });

/* Audio: the AUDIO editor (the map's AUDIO pad) and its pages, both modes */
async function openAudioEditor(mode) {
    await audioReady(mode); selectTrack(AU_T); await audioReady(mode);
    mapTap(PURE.bankMapPadForCell(2, 3));
    ticks(3);
    if (!S.auPanel) throw new Error('the AUDIO editor did not open');
}
await shot('audio-ed-slice-clip', async () => { await openAudioEditor(1); });
await shot('audio-ed-slice-slice', async () => { await openAudioEditor(1); jog(1); ticks(2); });
await shot('audio-ed-loop-clip', async () => { await openAudioEditor(0); });
/* Audio: WAVE (the map's WAVE pad) in each of its states, its picker, Lazy */
async function openWaveEd(mode) {
    await audioReady(mode); selectTrack(AU_T); await audioReady(mode);
    mapTap(PURE.bankMapPadForCell(2, 2));
    ticks(3);
    if (!S.auEditor) throw new Error('WAVE did not open');
}
const shiftClick = () => { press(MoveShift); click(); release(MoveShift); ticks(2); };
await shot('audio-wave-chop', async () => { await openWaveEd(1); });
await shot('audio-wave-loop', async () => { await openWaveEd(0); });
await shot('audio-wave-empty', async () => {
    await openWaveEd(1);
    ENGINE['t' + AU_T + '_au_info_0'] = '0 0 1 8 1 16 0 0 0 0 0 0 0 0 0 0 8|';
    const AU = await import('../ui/ui_audio.mjs'); AU.auMarkStale(AU_T, 0); AU.auReadTrack(AU_T); ticks(3);
});
await shot('audio-wave-pick1', async () => { await openWaveEd(1); shiftClick(); });
await shot('audio-wave-pick2', async () => { await openWaveEd(1); shiftClick(); jog(1); click(); ticks(2); });
await shot('audio-wave-lazy', async () => { await openWaveEd(1); shiftClick(); jog(1); click(); click(); ticks(3); });

/* Session View and its map */
const toSession = () => { tap(MoveNoteSession); ticks(3); if (!S.sessionView) throw new Error('no session view'); };
await shot('session-rest', async () => { toSession(); });
await shot('session-map', async () => { toSession(); press(3); ticks(3); });

const out = process.argv[2] || '/tmp/davebox-ui-map.json';
writeFileSync(out, JSON.stringify({ generated: new Date(WALL).toISOString(), data: DATA, screens: SCREENS }));
for (const f of mapFailures) console.log('SKIPPED ' + f);
console.log(Object.keys(SCREENS).length + ' screens -> ' + out + ', ' + mapFailures.length + ' skipped');
if (mapFailures.length) process.exitCode = 1;
