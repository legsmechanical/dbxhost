/* ui_audio_kit.mjs — CONVERT TO KIT: a Slice clip's chops as a native Move
 * drum rack preset.
 *
 * Josh, 2026-10-30: "slice menu option: convert to kit. creates a move drum
 * rack kit with 32 pad max (so loadable in dr32 - only first 16 will be
 * available when loaded as move kit) based on the slices, and carrying over
 * slice pitch, decay, gain, etc." · on how the slices are written: "shared
 * copy" · "we're not creating dr32 kits. we're creating native move drum
 * racks. dr32 is implicated only because it is able to load those native
 * drum racks."
 *
 * The SLICE menu › Convert to kit. The Slicer's sample is BAKED by the engine
 * (tN_au_kit, seq8_audio.c au_kit_bake: Josh, 2026-11-14, "an offline
 * resample of the entire sample of its sample-wide settings before
 * exporting? ... resample at current tempo") into the library
 * (Samples/dAVEBOx/Exported kits/<name>.wav) as it sounds sample-wide: the
 * range only, stretched to the tempo under Sync Warp, retuned by Sync Pitch
 * and the sample's Pitch / Detune, at its Gain. The changes are uniform, so a
 * slice keeps its fraction of the range and every pad plays its slice of the
 * file — start and length as fractions, as Ableton's own Sliced Loops
 * presets do (CoreLibrary "Track Presets/Sliced Loops": one loop, sixteen
 * pads, choke group 1). A slice that plays backwards points into a second
 * file, the bake reversed (<name> rev.wav: "at most 2 samples — one reversed
 * and one not"). The preset (Track Presets/dBx-slice/, `<project> <track>`)
 * has a pad per slice the range holds — a slice crossing Start or End
 * clipped to it, one wholly outside left out, as they play — up to 32 on
 * notes 36-67, at least 16 (the rest empty, as native kits leave a pad).
 * A native drum rack preset holds 32 pad chains: Move loads one and keeps all
 * 32 through its own save (its re-saves of a 32-chain preset, "DR32WB 1"-"4"
 * in the library, 2026-07-25), though a native track reaches only 16;
 * anything that loads native presets with more pads (DR32) gets them all.
 *
 * Each pad carries the SLICE's own values (the sample's are in the file):
 *   Pitch -> Voice_Transpose · Detune -> Voice_Detune · Gain -> Voice_Gain
 *   (plus whatever of the sample's Gain the bake could not take: it holds
 *   the file to a 0 dBFS peak) · Attk -> Voice_Envelope_Attack · Decay ->
 *   Hold 0 + Voice_Envelope_Decay (none: Hold "inf", it plays to the region's
 *   end) · Play One and Thru -> Trigger (A-H-D; Thru's region runs on to the
 *   range's End, backwards down to Start), Gate -> Gate (A-S-R) · Revrs ->
 *   the reversed file, the region mirrored.
 * Every pad is in choke group 1: a Slicer plays one slice at a time.
 * Velocity does nothing to a slice, so Vel>Vol is 0.
 *
 * The bake runs on the engine's loader for a moment (seconds, for a long
 * sample under Warp): auConvertToKit starts it, auKitTick waits for it and
 * then writes the preset.
 *
 * The file is a native preset as Move writes one (schema 1.8.3, its own
 * re-save above): the drum rack, its reverb return and the rack-wide
 * saturator, at Move's defaults. The pads' other values are a stock Sliced
 * Loops pad's. Move signs what it saves (lockId / lockSeal); this file is
 * unsigned. */
import * as os from 'os';
import { S } from './ui_state.mjs';
import { SCENE_LETTERS } from './ui_constants.mjs';
import { auInfo, auRead, auMarks, auReadSliceNow, dspAnswer, AU_ERR_TEXT } from './ui_audio.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { prefetchKeys, releaseTrackDigests } from './ui_dsp_get.mjs';
import { sanitizeName } from './ui_export.mjs';
import { auIsSlice } from './ui_pure.mjs';

export const USER_LIBRARY = '/data/UserData/UserLibrary';
export const KIT_PRESETS  = USER_LIBRARY + '/Track Presets/dBx-slice';   /* Josh: "a subfolder of the user preset library called dBx-slice" */
export const KIT_SAMPLES  = '/data/UserData/UserLibrary/Samples/dAVEBOx/Exported kits';   /* in full: a library folder, not a state dir */
export const KIT_PADS = 32;
const KIT_MIN = 16;
const HOLD_INF = 60.0;                 /* a drum cell's "inf" hold */
/* Decay: a slice decays on a drum cell's own curve, 83.87 dB over its Decay
 * (seq8_audio.c au_decay_k; DR32's reconstruction of Move's, dr32_voice.h
 * DR32_DECAY_DB_PER_TIME), so a pad takes the slice's milliseconds as they are.
 * (It used to fade in a straight line and a pad's Decay was scaled up 3.8x to
 * sound as long — Josh, 2026-10-30: "converted kit decays are shorter on the
 * kits than on the slices"; the slice went exponential on 2026-11-12.) */
export const DECAY_SCALE = 1;
const DECAY_MAX = 60.0;
const ATTACK_MIN = 1e-4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* `ableton:/user-library/...` for a library path, each segment encoded */
export function kitUri(path) {
    if (!path || !path.startsWith(USER_LIBRARY + '/')) return null;
    return 'ableton:/user-library' + path.slice(USER_LIBRARY.length).split('/').map(encodeURIComponent).join('/');
}

/* A drum cell's parameters as a stock Sliced Loops pad has them (its effect
 * Stretch at 1.0, which leaves the sound alone). */
function cellDefaults() {
    return {
        Effect_EightBitFilterDecay: 5.0, Effect_EightBitResamplingRate: 14080.0,
        Effect_FmAmount: 0.0, Effect_FmFrequency: 1000.0,
        Effect_LoopLength: 0.3, Effect_LoopOffset: 0.0,
        Effect_NoiseAmount: 0.0, Effect_NoiseFrequency: 10000.0,
        Effect_On: true,
        Effect_PitchEnvelopeAmount: 0.0, Effect_PitchEnvelopeDecay: 0.3,
        Effect_PunchAmount: 0.0, Effect_PunchTime: 0.12016,
        Effect_RingModAmount: 0.0, Effect_RingModFrequency: 1000.0,
        Effect_StretchFactor: 1.0, Effect_StretchGrainSize: 0.1,
        Effect_SubOscAmount: 0.0, Effect_SubOscFrequency: 60.0,
        Effect_Type: 'Stretch',
        Enabled: true, NotePitchBend: true, Pan: 0.0,
        Voice_Detune: 0.0,
        Voice_Envelope_Attack: ATTACK_MIN, Voice_Envelope_Decay: 0.9076, Voice_Envelope_Hold: 0.6,
        Voice_Envelope_Mode: 'A-H-D',
        Voice_Filter_Frequency: 22000.0, Voice_Filter_On: true, Voice_Filter_PeakGain: 1.0,
        Voice_Filter_Resonance: 0.0, Voice_Filter_Type: 'Lowpass',
        Voice_Gain: 1.0,
        Voice_ModulationAmount: 0.0, Voice_ModulationSource: 'Velocity', Voice_ModulationTarget: 'Filter',
        Voice_PitchToEnvelopeModulation: false,
        Voice_PlaybackLength: 1.0, Voice_PlaybackStart: 0.0,
        Voice_Transpose: 0, Voice_VelocityToVolume: 0.0,
        Volume: 0.0,
    };
}

/* One slice's cell: its region of the file as fractions (start, length);
 * `sl` the slice's own fields (au_sl: pitch gain rev play atk dec detune);
 * `remDb` the sample's Gain the bake left over (0 almost always). */
export function kitCell(start, length, sl, remDb) {
    const p = cellDefaults();
    p.Voice_PlaybackStart  = clamp(start, 0, 1);
    p.Voice_PlaybackLength = clamp(length, 0, 1 - p.Voice_PlaybackStart);
    p.Voice_Transpose = clamp(Math.round(sl.pitch | 0), -48, 48);
    p.Voice_Detune    = clamp(sl.detune | 0, -50, 50);
    p.Voice_Gain      = Math.pow(10, clamp((sl.gain | 0) + (+remDb || 0), -70, 24) / 20);
    p.Voice_Envelope_Attack = Math.max(ATTACK_MIN, (sl.atk | 0) / 1000);
    if (sl.dec | 0) { p.Voice_Envelope_Hold = 0.0; p.Voice_Envelope_Decay = Math.min(DECAY_MAX, (sl.dec | 0) / 1000 * DECAY_SCALE); }
    else            { p.Voice_Envelope_Hold = HOLD_INF; }
    p.Voice_Envelope_Mode = (sl.play | 0) === 1 ? 'A-S-R' : 'A-H-D';
    p.Voice_VelocityToVolume = 0.0;
    return p;
}

/* A slice's region of the bake: [a, b] frames of the sample clipped to the
 * range rs..re (null: wholly outside, not heard), Thru on to the range's
 * end (backwards: down to its start), as fractions of the range — of the
 * reversed file, mirrored, for a slice that plays backwards. */
export function kitRegion(a, b, sl, rs, re) {
    const L = re - rs;
    if (!(L > 0)) return null;
    let x = Math.max(a, rs), y = Math.min(b, re);
    if (!(y > x)) return null;
    const rev = !!(sl.rev | 0);
    if ((sl.play | 0) === 2) { if (rev) x = rs; else y = re; }
    const fa = (x - rs) / L, fb = (y - rs) / L;
    return { start: rev ? 1 - fb : fa, length: fb - fa, rev };
}

function padChain(note, params, uri) {
    return {
        name: '', color: 10,
        mixer: { pan: 0.0, 'solo-cue': false, speakerOn: true, volume: 0.0,
                 sends: [{ isEnabled: true, amount: -70.0 }] },
        drumZoneSettings: { receivingNote: note, sendingNote: 60, chokeGroup: uri ? 1 : null },
        devices: [{ presetUri: null, kind: 'drumCell', name: '',
                    parameters: params, deviceData: { sampleUri: uri } }],
    };
}

const MACROS = { Enabled: true, Macro0: 0.0, Macro1: 0.0, Macro2: 0.0, Macro3: 0.0,
                 Macro4: 0.0, Macro5: 0.0, Macro6: 0.0, Macro7: 0.0 };

/* The rack around the pads as Move writes a new drum rack: the reverb
 * return and the rack-wide saturator, at Move's defaults (named as Move
 * names them). */
const SWAP_FX = 'Swap for other Move/Note-compatible FX';
function rackReturn() {
    return [{ name: '', color: 10, devices: [{ presetUri: null, kind: 'reverb', name: SWAP_FX, parameters: {
        AllPassGain: 0.6, AllPassSize: 0.4, BandFreq: 830.0, BandHighOn: false, BandLowOn: true,
        BandWidth: 5.85, ChorusOn: true, CutOn: true, DecayTime: 1200.0, DiffuseDelay: 0.5,
        EarlyReflectModDepth: 17.5, EarlyReflectModFreq: 0.2977, Enabled: true, FlatOn: true,
        FreezeOn: false, HighFilterType: 'Shelf', MixDiffuse: 1.0, MixDirect: 0.55, MixReflect: 1.0,
        PreDelay: 2.5, RoomSize: 100.0, RoomType: 'SuperEco', ShelfHiFreq: 4500.0, ShelfHiGain: 0.7,
        ShelfHighOn: true, ShelfLoFreq: 90.0, ShelfLoGain: 1.0, ShelfLowOn: true,
        SizeModDepth: 0.02, SizeModFreq: 0.02, SizeSmoothing: 'Fast', SpinOn: true, StereoSeparation: 100.0 },
        deviceData: {} }],
        mixer: { pan: 0.0, 'solo-cue': false, speakerOn: true, volume: 0.0, sends: [{ isEnabled: false, amount: -70.0 }] } }];
}
function rackSaturator() {
    return { presetUri: null, kind: 'saturator', name: SWAP_FX, parameters: {
        BaseDrive: 0.0, BassShaperThreshold: -50.0, ColorDepth: 0.0, ColorFrequency: 1000.0, ColorOn: true,
        ColorWidth: 0.3, DryWet: 1.0, Enabled: true, Oversampling: false, PostClip: 'off', PostDrive: 0.0,
        PreDcFilter: false, PreDrive: 0.0, Type: 'Analog Clip', WsCurve: 0.05, WsDamp: 0.0, WsDepth: 0.0,
        WsDrive: 1.0, WsLin: 0.5, WsPeriod: 0.0 }, deviceData: {} };
}

/* The kit file's text: `cells` the slices' parameters (up to 32), `uri` the
 * bake (`uris[k]`, where given, pad k's own: the reversed file). Pads past
 * the slices are empty, up to 16. */
export function kitJson(name, uri, cells, uris) {
    const n = Math.min(KIT_PADS, cells.length);
    const pads = [];
    for (let k = 0; k < Math.max(KIT_MIN, n); k++)
        pads.push(k < n ? padChain(36 + k, cells[k], (uris && uris[k]) || uri) : padChain(36 + k, cellDefaults(), null));
    const kit = {
        $schema: 'http://tech.ableton.com/schema/song/1.8.3/devicePreset.json',
        kind: 'instrumentRack', name,
        parameters: Object.assign({}, MACROS),
        chains: [{ name: '', color: 10,
                   devices: [{ presetUri: null, kind: 'drumRack', name: '',
                               parameters: Object.assign({}, MACROS),
                               chains: pads, returnChains: rackReturn() },
                             rackSaturator()],
                   mixer: { pan: 0.0, 'solo-cue': false, speakerOn: true, volume: 0.0, sends: [] } }],
    };
    return asAbleton(JSON.stringify(kit, null, 1));
}

/* Numbers as Ableton writes them: a whole number keeps its ".0" (JSON.stringify
 * drops it) except in the fields Move writes as integers (its own saves). */
const INT_KEYS = new Set(['color', 'receivingNote', 'sendingNote', 'chokeGroup', 'Voice_Transpose', 'lockId', 'lockSeal']);
export function asAbleton(text) {
    return text.replace(/"([^"]+)": (-?\d+)(?=,?\n|,?$)/g, (m, k, v) => (INT_KEYS.has(k) ? m : '"' + k + '": ' + v + '.0'));
}

const exists = (p) => { const [st] = os.stat(p); return !!st; };

/* A free base name: the base, then " 2" … " 99" — its preset, its bake and
 * the bake's reverse all unused. */
function freeName(base) {
    for (let n = 1; n <= 99; n++) {
        const nm = base + (n > 1 ? ' ' + n : '');
        if (!exists(KIT_PRESETS + '/' + nm + '.ablpreset') && !exists(KIT_SAMPLES + '/' + nm + '.wav') &&
            !exists(KIT_SAMPLES + '/' + nm + ' rev.wav')) return nm;
    }
    return null;
}

const KIT_POLL = 8;                    /* ticks between reads of the bake (a read is a frame) */
const KIT_TIMEOUT = 94 * 180;          /* 3 minutes: a bake past it is reported, not waited for */
let _kit = null;                       /* the bake in flight */
let _kitSeq = Date.now() % 1000000;    /* its number (the engine echoes it: a read can overtake the write) */

/* Tick context: reads the range and the slices, asks the engine for the
 * bake. Returns the kit's name, or null (it said why); the preset is
 * written once the bake is in (auKitTick). */
export function auConvertToKit(t, c) {
    if (_kit) { showActionPopupFor(2500, 'NO KIT', 'Still baking'); return null; }
    const info = auRead(t, c) || auInfo(t, c);
    if (info.state !== 2 || !info.name) { showActionPopupFor(2500, 'NO KIT', 'No sample'); return null; }
    /* a Slicer's slices only (the menu offers it nowhere else; this says so
     * too, rather than kit an Audio clip's unseen Even chops — found by test) */
    if (!auIsSlice(info)) { showActionPopupFor(2500, 'NO KIT', 'Not a Slicer'); return null; }
    const marks = auMarks(t, c);
    if (!marks.length) { showActionPopupFor(2500, 'NO KIT', 'No slices'); return null; }
    const rs = info.rstart | 0, re = info.rend | 0;
    /* every slice's sound in ONE round trip (32 reads were ~90 ms: review) */
    prefetchKeys(marks.map((ch, k) => 't' + t + '_au_sl_' + c + '_' + k));
    const pads = [];
    try {
        marks.forEach((ch, k) => {
            const sl = auReadSliceNow(t, c, k) || {};
            const a = sl.b > sl.a ? sl.a : ch[0] | 0, b = sl.b > sl.a ? sl.b : ch[1] | 0;
            const r = kitRegion(a, b, sl, rs, re);
            if (r) pads.push({ r, sl });
        });
    } finally { releaseTrackDigests(); }
    if (!pads.length) { showActionPopupFor(2500, 'NO KIT', 'No slices in range'); return null; }
    const kept = pads.slice(0, KIT_PADS);
    const name = freeName(sanitizeName(S.currentSetName || 'Project') + ' ' + (t + 1) + (SCENE_LETTERS[c] || ''));   /* a Slicer's slot has no letter: the track's */
    if (!name) { showActionPopupFor(2500, 'NO KIT', 'No free name'); return null; }
    host_ensure_dir(KIT_PRESETS);
    host_ensure_dir(KIT_SAMPLES);
    const rev = kept.some((p) => p.r.rev);
    const dst = KIT_SAMPLES + '/' + name + '.wav', revDst = KIT_SAMPLES + '/' + name + ' rev.wav';
    const seq = _kitSeq = (_kitSeq + 1) % 1000000;
    host_module_set_param('t' + t + '_au_kit', (rev ? '1 ' : '0 ') + seq + '|' + dst);
    _kit = { t, name, dst, revDst, rev, seq, pads: kept, total: pads.length, at: S.tickCount | 0 };
    showActionPopupFor(KIT_TIMEOUT, 'CONVERT TO KIT', 'Baking', name);   /* (the name on its own line: "Baking <name>" ran off the card) */
    return name;
}

function kitDrop(k) {
    for (const p of [k.dst, k.revDst]) { try { if (exists(p)) os.remove(p); } catch (e) { /* not there */ } }
}

/* Each tick: the bake in flight, read every KIT_POLL ticks; once it is in,
 * the preset written beside it. */
export function auKitTick() {
    const k = _kit;
    if (!k) return;
    const age = (S.tickCount | 0) - k.at;
    if (age % KIT_POLL) return;
    const v = String(dspAnswer('t' + k.t + '_au_kit') || '').trim().split(/\s+/);
    /* "state err rem seq": rem the dB of the sample's Gain past a 0 dBFS peak, the pads' */
    const st = parseInt(v[0], 10), err = parseInt(v[1], 10), db = parseFloat(v[2]), seq = parseInt(v[3], 10);
    if (seq !== k.seq || st === 1 || isNaN(st)) {
        if (age > KIT_TIMEOUT) { _kit = null; kitDrop(k); showActionPopupFor(2500, 'NO KIT', 'Timed out'); }
        return;
    }
    _kit = null;
    if (st !== 2) { kitDrop(k); showActionPopupFor(2500, 'NO KIT', AU_ERR_TEXT[err] || 'Could not bake'); return; }
    const rem = isNaN(db) ? 0 : db;                         /* the sample's Gain the bake could not take */
    const uri = kitUri(k.dst), ruri = kitUri(k.revDst);
    const cells = k.pads.map((p) => kitCell(p.r.start, p.r.length, p.sl, Math.abs(rem) < 0.01 ? 0 : rem));
    const uris = k.pads.map((p) => (p.r.rev ? ruri : uri));
    if (!host_write_file(KIT_PRESETS + '/' + k.name + '.ablpreset', kitJson(k.name, uri, cells, uris))) {
        kitDrop(k);
        showActionPopupFor(2500, 'NO KIT', 'Could not save');
        return;
    }
    /* past 32 slices the kit holds the first 32: say how many were left out */
    const n = k.pads.length;
    showActionPopupFor(3000, 'KIT SAVED', k.name, n + ' pad' + (n === 1 ? '' : 's') +
                       (k.total > n ? ' (' + (k.total - n) + ' left out)' : ''));
}

/* (tests) the bake in flight, or null */
export function kitPendingForTest() { return _kit; }
