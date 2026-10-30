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
 * SLICES › click › Convert to kit. The clip's sample is copied ONCE into the
 * library (Samples/dAVEBOx/Exported kits/) and every pad plays its chop of it — start
 * and length as fractions of the file, as Ableton's own Sliced Loops presets
 * do (CoreLibrary "Track Presets/Sliced Loops": one loop, sixteen pads, choke
 * group 1). The preset (Track Presets/dBx-slice/, `<project> <track><clip>`)
 * has a pad per chop as it plays — the hand set, Even or Transient — up to
 * 32 on notes 36-67, at least 16 (the rest empty, as native kits leave a pad).
 * A native drum rack preset holds 32 pad chains: Move loads one and keeps all
 * 32 through its own save (its re-saves of a 32-chain preset, "DR32WB 1"-"4"
 * in the library, 2026-07-25), though a native track reaches only 16;
 * anything that loads native presets with more pads (DR32) gets them all.
 *
 * Each pad carries what a drum cell can hold, the clip's own values under
 * the slice's (SAMPLE's are the base, as ALL SLICES sets them):
 *   Pitch -> Voice_Transpose · Detune -> Voice_Detune · Gain -> Voice_Gain
 *   Attk -> Voice_Envelope_Attack · Decay -> Hold 0 + Voice_Envelope_Decay
 *   (Full: Hold "inf", it plays to the chop's end) · Play One -> Trigger
 *   (A-H-D), Gate and Loop -> Gate (A-S-R; a cell has no loop over its region)
 * Revrs has no place in a drum cell and is dropped (the shared copy's cost).
 * Every pad is in choke group 1: a Slice clip plays one chop at a time.
 * Velocity does nothing to a slice, so Vel>Vol is 0.
 *
 * The file is a native preset as Move writes one (schema 1.8.3, its own
 * re-save above): the drum rack, its reverb return and the rack-wide
 * saturator, at Move's defaults. The pads' other values are a stock Sliced
 * Loops pad's. Move signs what it saves (lockId / lockSeal); this file is
 * unsigned. */
import * as os from 'os';
import { S } from './ui_state.mjs';
import { SCENE_LETTERS } from './ui_constants.mjs';
import { auInfo, auMarks, auReadSliceNow } from './ui_audio.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { sanitizeName } from './ui_export.mjs';

export const USER_LIBRARY = '/data/UserData/UserLibrary';
export const KIT_PRESETS  = USER_LIBRARY + '/Track Presets/dBx-slice';   /* Josh: "a subfolder of the user preset library called dBx-slice" */
export const KIT_SAMPLES  = '/data/UserData/UserLibrary/Samples/dAVEBOx/Exported kits';   /* in full: a library folder, not a state dir */
export const KIT_PADS = 32;
const KIT_MIN = 16;
const HOLD_INF = 60.0;                 /* a drum cell's "inf" hold */
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

/* One chop's cell. `ch` = [a, b] in frames; `sl` the slice's own fields
 * (au_sl: pitch gain rev play atk dec detune); `clip` the clip's (auInfo). */
export function kitCell(ch, sl, clip, frames) {
    const p = cellDefaults();
    const a = Math.max(0, ch[0] | 0), b = Math.max(a, ch[1] | 0);
    p.Voice_PlaybackStart  = frames > 0 ? a / frames : 0;
    p.Voice_PlaybackLength = frames > 0 ? (b - a) / frames : 1;
    p.Voice_Transpose = clamp(Math.round((clip.pitch | 0) + (sl.pitch | 0)), -48, 48);
    p.Voice_Detune    = clamp((clip.detune | 0) + (sl.detune | 0), -50, 50);
    p.Voice_Gain      = Math.pow(10, clamp((clip.gain | 0) + (sl.gain | 0), -70, 24) / 20);
    p.Voice_Envelope_Attack = Math.max(ATTACK_MIN, (sl.atk | 0) / 1000);
    if (sl.dec | 0) { p.Voice_Envelope_Hold = 0.0; p.Voice_Envelope_Decay = (sl.dec | 0) / 1000; }
    else            { p.Voice_Envelope_Hold = HOLD_INF; }
    p.Voice_Envelope_Mode = (sl.play | 0) === 0 ? 'A-H-D' : 'A-S-R';
    p.Voice_VelocityToVolume = 0.0;
    return p;
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

/* The kit file's text: `cells` the chops' parameters (up to 32), `uri` the
 * shared sample. Pads past the chops are empty, up to 16. */
export function kitJson(name, uri, cells) {
    const n = Math.min(KIT_PADS, cells.length);
    const pads = [];
    for (let k = 0; k < Math.max(KIT_MIN, n); k++)
        pads.push(k < n ? padChain(36 + k, cells[k], uri) : padChain(36 + k, cellDefaults(), null));
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
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

/* A free base name in both folders: the base, then " 2" … " 99". */
function freeName(base, ext) {
    for (let n = 1; n <= 99; n++) {
        const nm = base + (n > 1 ? ' ' + n : '');
        if (!exists(KIT_PRESETS + '/' + nm + '.ablpreset') && !exists(KIT_SAMPLES + '/' + nm + ext)) return nm;
    }
    return null;
}

/* Tick context: reads the chops and slices, copies the sample, writes the
 * kit. Returns the kit's name, or null (it said why). */
export function auConvertToKit(t, c) {
    const info = auInfo(t, c);
    if (info.state !== 2 || !info.name) { showActionPopupFor(2500, 'NO KIT', 'No sample'); return null; }
    const chops = auMarks(t, c).slice(0, KIT_PADS);
    if (!chops.length) { showActionPopupFor(2500, 'NO KIT', 'No chops'); return null; }
    const dir = String(host_module_get_param('t' + t + '_au_dir') || '');
    if (!dir) { showActionPopupFor(2500, 'NO KIT', 'No project'); return null; }
    const src = dir + '/' + info.name;
    const dot = info.name.lastIndexOf('.');
    const ext = dot > 0 ? info.name.slice(dot) : '.wav';
    const name = freeName(sanitizeName(S.currentSetName || 'Project') + ' ' + (t + 1) + SCENE_LETTERS[c], ext);
    if (!name) { showActionPopupFor(2500, 'NO KIT', 'No free name'); return null; }
    host_ensure_dir(KIT_PRESETS);
    host_ensure_dir(KIT_SAMPLES);
    const dst = KIT_SAMPLES + '/' + name + ext;
    try { host_system_cmd('cp ' + shq(src) + ' ' + shq(dst)); } catch (e) { /* checked below */ }
    if (!exists(dst)) { showActionPopupFor(2500, 'NO KIT', 'Could not copy'); return null; }
    const cells = chops.map((ch, k) => kitCell(ch, auReadSliceNow(t, c, k) || {}, info, info.nframes));
    if (!host_write_file(KIT_PRESETS + '/' + name + '.ablpreset', kitJson(name, kitUri(dst), cells))) {
        try { os.remove(dst); } catch (e) { /* never written */ }
        showActionPopupFor(2500, 'NO KIT', 'Could not save');
        return null;
    }
    showActionPopupFor(3000, 'KIT SAVED', name, chops.length + ' pad' + (chops.length === 1 ? '' : 's'));
    return name;
}
