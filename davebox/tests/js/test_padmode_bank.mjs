/* tests/js/test_padmode_bank.mjs — THE PADMODE BANK (Josh, 2026-10-22):
 * "Change "chord" bank to "PadMode" bank and make it available for every
 * track type in melodic mode."
 *
 * Performs the gesture through the real input path (onMidiMessageInternal):
 * hold the jog, tap the bank's pad on the map, let go — then asserts what is
 * ON SCREEN (the bank's header, K1 Mode and its value) and what the K1 turn
 * does (the mode changes, the pad map is pushed again). On a Schwung, a Move
 * and a MIDI track alike; a drum track has no such bank; a Conductor's
 * Shift + Step 8 stays on Scale / Chrom.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === (phase & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

globalThis.host_write_file = () => true;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sentParams = [];
globalThis.host_module_set_param = (k, v) => { sentParams.push([String(k), String(v)]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.host_module_get_params = () => null;
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
const led = {};
globalThis.move_midi_internal_send = (pkt) => { if ((pkt[1] & 0xF0) === 0x90) led[pkt[2]] = pkt[3]; return true; };
globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_restore_knob_leds = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const pure = await import('../../ui/ui_pure.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const PM = await import('../../ui/ui_pad_mode.mjs');
const ccm = await import('../../ui/ui_input_cc.mjs');
globalThis.__dm = await import('../../ui/ui_drummodel.mjs');
globalThis.__cp = await import('../../ui/ui_chord_pads.mjs');
globalThis.__leds = await import('../../ui/ui_leds.mjs');

const T = 2;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
S.dspInboundEnabled = true; S.touchHoldMs = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 17 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const tap = (note) => { midi(0x90, note, 100); midi(0x80, note, 0); };
S.clockFollowTicks = true; S.tickCount = 1000;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
/* Hold the jog, tap the bank's map pad, let go. */
const pickOnMap = (bank) => {
    midi(0xB0, 3, 127); S.tickCount += 2; globalThis.tick();
    const p = pure.bankPadMapForMode(S.trackPadMode[T], T);
    let note = -1;
    p.forEach((col, c) => col.cells.forEach((cell, r) => { if (cell && cell.bank === bank) note = pure.bankMapPadForCell(c, r); }));
    if (note >= 0) tap(note);
    midi(0xB0, 3, 0); ticks(2);
    return note;
};
/* One detent of K1, touched for the turn (the touch peeks the page). */
const kn = (k, d) => { midi(0x90, k, 127); midi(0xB0, 71 + k, d > 0 ? 20 : 108); midi(0x80, k, 0); ticks(1); };
const k1 = (d) => { midi(0x90, 0, 127); midi(0xB0, 71, d > 0 ? 20 : 108); ticks(1); };
const k1Up = () => { midi(0x80, 0, 0); ticks(1); };
const screen = () => {
    const out = [];
    fonts.setKitTextTrace((t) => out.push(String(t)));
    try { fb.fill(0); render.drawUI(); } finally { fonts.setKitTextTrace(null); }
    return out;
};
const lastPadmap = () => { for (let i = sentParams.length - 1; i >= 0; i--) if (sentParams[i][0] === 't' + T + '_padmap') return sentParams[i][1]; return null; };
const home = () => { ccm.bankMapEnd(); S.activeBank = 0; S.trackActiveBank[T] = 0; S.bankCardLatched = false; S.bankSelectTick = -1; };

const ROUTES = [['Schwung', 0], ['Move', 1], ['MIDI', 2]];
for (const [name, route] of ROUTES) {
    step('⭐ a melodic ' + name + ' track: the map opens PADMODE, the screen names it, K1 reads Scale and turns to Chrom', () => {
        home();
        S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; S.trackRoute[T] = route;
        PM.setPadMode(T, PM.PM_SCALE); ticks(2);
        const note = pickOnMap(C.BANK_PADMODE);
        assert(note >= 0, 'no PADMODE pad on the map');
        assert(S.activeBank === C.BANK_PADMODE && S.trackActiveBank[T] === C.BANK_PADMODE, 'the tap did not land on PADMODE: ' + S.activeBank);
        S.bankCardLatched = true;          /* the page is up, as after a click on the overview */
        let txt = screen();
        assert(txt.some((x) => x === 'PAD MODE'), 'no PAD MODE header: ' + txt.slice(0, 8).join('|'));
        assert(txt.includes('Mode') || txt.includes('MODE'), 'no Mode cell: ' + txt.join('|'));
        assert(txt.join('').toUpperCase().includes('SCALE'), 'Mode does not read Scale: ' + txt.join('|'));
        const before = lastPadmap();
        k1(+1); k1Up();
        assert(PM.padModeOf(T) === PM.PM_CHROM, 'K1 did not move the track to Chrom: ' + PM.padModeOf(T));
        ticks(2);
        txt = screen();
        /* The box shows the short form, on one line (CHROM wrapped to "CHR" / "OM"). */
        assert(txt.includes('CHRM') && !txt.includes('OM'), 'the screen does not read Chrm on one line: ' + txt.join('|'));
        assert(lastPadmap() !== before, 'the pad map was not pushed again');
        k1(-1); k1Up();
        assert(PM.padModeOf(T) === PM.PM_SCALE, 'K1 back did not return to Scale');
    });
}

step('⭐ K1 onto Chord (no explainer) stays on Pad Mode; off again, the settings of each mode survive', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; S.trackRoute[T] = 0;
    PM.setPadMode(T, PM.PM_PIANO); ticks(2);
    pickOnMap(C.BANK_PADMODE); S.bankCardLatched = true;
    k1(+1); k1Up();
    assert(PM.padModeOf(T) === PM.PM_CHORD, 'not on Chord');
    assert(S.activeBank === C.BANK_PADMODE, 'Chord took the knobs off PADMODE');
    const txt = screen();
    assert(txt.includes('Map') || txt.includes('MAP'), 'Chord page has no Map: ' + txt.join('|'));
    k1(+1); k1Up();
    assert(PM.padModeOf(T) === PM.PM_CUSTOM && S.activeBank === C.BANK_PADMODE, 'Custom: ' + PM.padModeOf(T) + ' bank ' + S.activeBank);
    k1(+1); k1Up();
    assert(PM.padModeOf(T) === PM.PM_CUSTOM, 'K1 ran past the last mode');
    PM.setPadMode(T, PM.PM_SCALE); ticks(2);
});

/* C major, pad octave from the engine default: the pitch every pad plays,
 * before the track octave (S.padNoteMap). */
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const sc = (root, deg) => root + Math.floor(deg / 7) * 12 + MAJ[((deg % 7) + 7) % 7];
const map = () => Array.from(S.padNoteMap).slice(0, 32);
const onBank = (m) => {
    home(); S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; S.trackRoute[T] = 0;
    S.padKey = 0; S.padScale = 0; S.padModeCfg[T] = null;
    PM.setPadMode(T, m); ticks(2);
    pickOnMap(C.BANK_PADMODE); S.bankCardLatched = true;
};

step('⭐ Scale, no split: K3 Oct / K4 Step move the whole grid; a step keeps every pad in key', () => {
    onBank(PM.PM_SCALE);
    const root = (S.padOctave[T] | 0) * 12;
    const plain = map();
    for (let i = 0; i < 32; i++) assert(plain[i] === sc(root, (i % 8) + Math.floor(i / 8) * 3), 'plain pad ' + i);
    const txt = screen().join('|');
    assert(/SPLIT/i.test(txt) && /NONE/i.test(txt) && /OCT/i.test(txt) && /TRANS/i.test(txt), 'the page: ' + txt);
    kn(2, +1);                                       /* Oct +1 */
    kn(3, +1); kn(3, +1);                            /* Step +2: starts on E */
    const m = map();
    for (let i = 0; i < 32; i++) {
        assert(m[i] === 12 + sc(root, (i % 8) + Math.floor(i / 8) * 3 + 2), 'pad ' + i + ': ' + m[i]);
        assert(MAJ.indexOf(m[i] % 12) >= 0, 'pad ' + i + ' left the key: ' + m[i]);
    }
    kn(4, +1);                                       /* no split: K5 does nothing */
    assert(PM.padModeCfg(T).grid.octB === 0, 'K5 turned with no split');
});

step('⭐⭐ Scale, Vertical: the left 4x4 and the right 4x4 are two grids, each with its own octave and start', () => {
    onBank(PM.PM_SCALE);
    const root = (S.padOctave[T] | 0) * 12;
    kn(1, +1);                                       /* Split: Vert */
    assert(PM.padModeCfg(T).grid.split === PM.SPLIT_VERT, 'not Vert: ' + PM.padModeCfg(T).grid.split);
    kn(4, +1);                                       /* Oct B +1 */
    kn(5, +1);                                       /* Step B +1 */
    const m = map();
    for (let i = 0; i < 32; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        const want = c < 4 ? sc(root, c + r * 3) : 12 + sc(root, (c - 4) + r * 3 + 1);
        assert(m[i] === want, 'pad ' + i + ' (col ' + c + ' row ' + r + '): ' + m[i] + ' want ' + want);
    }
    const txt = screen().join('|');
    assert(/\|OCT A\|/.test(txt) && /\|TRANS A\|/.test(txt) && /\|OCT B\|/.test(txt) && /\|TRANS B\|/.test(txt),
           'zones not named A / B in full: ' + txt);
});

step('⭐⭐ Chrom, Horizontal: zone A is the BOTTOM two rows, B the top two (Josh: "A is always bottom/left"); Transpose moves by semitones', () => {
    onBank(PM.PM_CHROM);
    const root = (S.padOctave[T] | 0) * 12;
    kn(1, +1); kn(1, +1);                            /* Split: Horz */
    assert(PM.padModeCfg(T).grid.split === PM.SPLIT_HORZ, 'not Horz');
    kn(3, +1); kn(3, +1); kn(3, +1);                 /* Transpose A +3: the bottom half starts on E♭ */
    const m = map();
    for (let i = 0; i < 32; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        const want = r < 2 ? root + 3 + c + r * 8 : root + c + (r - 2) * 8;
        assert(m[i] === want, 'pad ' + i + ': ' + m[i] + ' want ' + want);
    }
});

step('⭐ each mode keeps its settings: Scale and Chrom share the split and octaves, each keeps its own start; Chord leaves them alone', () => {
    onBank(PM.PM_SCALE);
    kn(1, +1); kn(2, -1); kn(3, +1);                 /* Vert, Oct A -1, Step A +1 */
    k1(+1); k1Up();                                  /* → Chrom */
    const g = PM.padModeCfg(T).grid;
    assert(PM.padModeOf(T) === PM.PM_CHROM && g.split === PM.SPLIT_VERT && g.octA === -1, 'Chrom lost the split/octave');
    assert(g.semiA === 0 && g.stepA === 1, 'Chrom start not its own: ' + JSON.stringify(g));
    PM.setPadMode(T, PM.PM_CHORD); midi(0xB0, 3, 127); midi(0xB0, 3, 0); ticks(2);
    PM.setPadMode(T, PM.PM_SCALE); ticks(2);
    const g2 = PM.padModeCfg(T).grid;
    assert(g2.split === PM.SPLIT_VERT && g2.octA === -1 && g2.stepA === 1, 'back on Scale the split is gone: ' + JSON.stringify(g2));
});

step('⭐ the settings are saved per track, a damaged record is cleaned, and a project without them restores plain', () => {
    const saved = PM.padModeSidecar();
    assert(saved[T] && saved[T].grid.split === PM.SPLIT_VERT, 'not in the sidecar: ' + JSON.stringify(saved[T]));
    PM.restorePadModeSidecar(JSON.parse(JSON.stringify(saved)));
    assert(PM.padModeCfg(T).grid.stepA === 1 && PM.padModeCfg(T).grid.octA === -1, 'round trip');
    const bad = saved.slice(); bad[T] = { grid: { split: 9, octA: 'x', stepA: 99 } };
    PM.restorePadModeSidecar(bad);
    const g = PM.padModeCfg(T).grid;
    assert(g.split === 0 && g.octA === 0 && g.stepA === 0, 'a bad record was kept: ' + JSON.stringify(g));
    PM.restorePadModeSidecar(undefined);
    assert(S.padModeCfg.every((c) => c === null), 'an absent field left settings behind');
});

step('⭐ a Conductor plays one plain grid, whatever split it had as a melodic track', () => {
    onBank(PM.PM_SCALE);
    kn(1, +1); kn(4, +1);                            /* Vert, Oct B +1 */
    S.trackPadMode[T] = C.PAD_MODE_CONDUCT; S.activeBank = 0; S.trackActiveBank[T] = 0;
    globalThis.__dm.computePadNoteMap();
    const root = (S.padOctave[T] | 0) * 12;
    const m = map();
    for (let i = 0; i < 32; i++) assert(m[i] === sc(root, (i % 8) + Math.floor(i / 8) * 3), 'conductor pad ' + i + ': ' + m[i]);
    S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; S.padModeCfg[T] = null; ticks(2);
});

const W_ = [0, 2, 4, 5, 7, 9, 11, 12], B_ = [-1, 1, 3, -1, 6, 8, 10, -1];
step('⭐⭐ Piano: Oct / Trans A move the bottom two rows (zone A), Oct / Trans B the top two (B); gaps stay silent', () => {
    onBank(PM.PM_PIANO);
    const base = (S.padOctave[T] | 0) * 12;
    const txt = screen().join('|');
    assert(/INSTR/i.test(txt) && /PIANO/i.test(txt) && /\|OCT A\|/.test(txt) && /\|TRANS B\|/.test(txt), 'the page: ' + txt);
    kn(4, +1);                                       /* Oct B (top) +1 */
    kn(3, -1); kn(3, -1);                            /* Trans A (bottom) -2 */
    const m = map();
    for (let i = 0; i < 32; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        const st = (r & 1) ? B_[c] : W_[c];
        const want = st < 0 ? 0xFF : base + st + (r >= 2 ? 24 : -2);
        assert(m[i] === want, 'pad ' + i + ': ' + m[i] + ' want ' + want);
    }
});

step('⭐⭐ Piano → Instrument Bass: four strings E A D G, open + seven frets; one Oct / Semi; Piano keeps its own', () => {
    onBank(PM.PM_PIANO);
    kn(2, +1);                                       /* Piano: Oct A +1, to be kept */
    kn(1, +1);                                       /* Instrument: Bass */
    assert(PM.padModeCfg(T).piano.instr === PM.INSTR_BASS, 'not Bass');
    const e = (S.padOctave[T] | 0) * 12 - 8;
    let m = map();
    for (let i = 0; i < 32; i++) assert(m[i] === e + Math.floor(i / 8) * 5 + (i % 8), 'bass pad ' + i + ': ' + m[i]);
    assert(m[0] % 12 === 4 && m[8] % 12 === 9 && m[16] % 12 === 2 && m[24] % 12 === 7, 'strings not E A D G');
    const cells = PM.padModeBankCells(T);
    assert(cells[2].label === 'Oct' && cells[3].label === 'Trans' && cells[4].kind === 'blank' && cells[5].kind === 'blank',
           'Bass page: ' + cells.map((c) => c.label).join(','));
    kn(3, +1); kn(4, +1);                            /* Semi +1; K5 does nothing on Bass */
    m = map();
    assert(m[0] === e + 1, 'Bass Semi did not move the neck: ' + m[0]);
    kn(1, -1);                                       /* back to Piano */
    assert(PM.padModeCfg(T).piano.octA === 1 && PM.padModeCfg(T).piano.octB === 0, 'Piano lost its own: ' + JSON.stringify(PM.padModeCfg(T).piano));
    PM.restorePadModeSidecar(PM.padModeSidecar());
    assert(PM.padModeCfg(T).piano.bassSemi === 1 && PM.padModeCfg(T).piano.octA === 1, 'Piano / Bass not saved');
});

step('⭐⭐ Chord Map → Function: the slots regroup by job (I vi iii | IV ii | V vii° | I up), an edited chord moves with its degree, the pads play it', () => {
    onBank(PM.PM_CHORD);
    midi(0xB0, 3, 127); midi(0xB0, 3, 0); ticks(2);           /* OK the explainer */
    const degs = () => S.chordPalette[T].map((x) => x.deg);
    assert(JSON.stringify(degs()) === '[0,1,2,3,4,5,6,7]', 'Diatonic: ' + degs());
    S.chordPalette[T][5].stack = 1;                            /* vi made a seventh */
    S.chordSettings[T].anchor = 5;
    kn(1, +1); ticks(2);                                       /* Map: Function */
    assert(S.chordSettings[T].map === 1, 'not Function');
    assert(JSON.stringify(degs()) === '[0,5,2,3,1,4,6,7]', 'Function: ' + degs());
    assert(S.chordPalette[T][1].stack === 1, 'the vi7 did not move with vi to pad 2');
    assert(S.chordSettings[T].anchor === 1, 'the anchor did not follow its chord: ' + S.chordSettings[T].anchor);
    const pm = lastPadmap().split(' ');
    const pcs = pm[1].split('+').map((x) => Number(x) % 12).sort((a, b) => a - b);
    assert(JSON.stringify(pcs) === '[0,4,7,9]', 'pad 2 does not play Amin7: ' + pm[1]);
    const txt = screen().join('|');
    assert(/FUNC/i.test(txt), 'the screen does not read Function: ' + txt);
    S.chordPalette[T][4].deg = 6;                              /* pad 5 (ii) re-rooted ... */
    globalThis.__cp.chordSlotReset(T, 4);                      /* ... Reset puts ii back, Function's degree there */
    assert(S.chordPalette[T][4].deg === 1, 'Reset on Function: ' + degs());
    globalThis.__cp.chordSlotReset(T, 1);
    assert(S.chordPalette[T][1].deg === 5 && S.chordPalette[T][1].stack === 0, 'Reset pad 2 is not vi');
    kn(1, -1); ticks(2);                                       /* back to Diatonic */
    assert(JSON.stringify(degs()) === '[0,1,2,3,4,5,6,7]' && S.chordSettings[T].anchor === 5, 'Diatonic again: ' + degs());
    kn(1, +1);
    PM.restorePadModeSidecar(PM.padModeSidecar());
    const saved = globalThis.__cp.chordSidecar();
    globalThis.__cp.restoreChordSidecar(JSON.parse(JSON.stringify(saved)));
    assert(S.chordSettings[T].map === 1 && JSON.stringify(degs()) === '[0,5,2,3,1,4,6,7]', 'Function not saved');
    PM.setPadMode(T, PM.PM_SCALE); ticks(2);
});

const padN = (i) => C.TRACK_PAD_BASE + i;
const padOn = (i) => midi(0x90, padN(i), 100), padOff = (i) => midi(0x80, padN(i), 0);
const onCustom = () => {
    onBank(PM.PM_CUSTOM);
    S.customChords[T] = Array.from({ length: 8 }, () => []); S.customChordOctave[T] = 0;
    S.trackOctave[T] = C.DEFAULT_TRACK_OCTAVE; ticks(2);
};

step('⭐ Custom: the page is Hold, Chd Oct, Pad Oct, Trans — and the two octaves ARE the ones the Octave buttons move', () => {
    onCustom();
    const lab = PM.padModeBankCells(T).map((c) => c.label);
    assert(JSON.stringify(lab.slice(0, 5)) === JSON.stringify(['Mode', 'Hold', 'Chd Oct', 'Pad Oct', 'Trans']), 'page: ' + lab);
    assert(PM.padModeBankCells(T)[1].text === 'Assign', 'Hold does not start on Assign');
    const scr = screen().join('|');
    assert(/\|CHD OCT\|/.test(scr) && /\|PAD OCT\|/.test(scr), 'labels trimmed on screen: ' + scr);
    kn(3, +1);
    assert(S.trackOctave[T] === C.DEFAULT_TRACK_OCTAVE + 1, 'Pad Oct did not move the scale rows\' octave');
    kn(2, -1);
    assert(S.customChordOctave[T] === -1, 'Chd Oct did not move the chord row\'s octave');
    midi(0xB0, 55, 127); midi(0xB0, 55, 0); ticks(1);           /* Octave up: both */
    assert(PM.padModeBankCells(T)[3].text === '+2' && PM.padModeBankCells(T)[2].text === '0',
           'the knobs do not read the buttons\' octaves: ' + PM.padModeBankCells(T)[3].text + ' / ' + PM.padModeBankCells(T)[2].text);
});

step('⭐ Custom Trans moves the scale rows along the scale (still in key); the chord row stays', () => {
    onCustom();
    S.customChords[T][0] = [60, 64, 67]; ticks(2);
    const before = map();
    kn(4, +1); kn(4, +1); ticks(2);                  /* Trans +2 (scale notes) */
    const m = map();
    assert(m[0] === before[0], 'the chord row moved');
    const root = (S.padOctave[T] | 0) * 12;
    for (let i = 8; i < 32; i++)
        assert(m[i] === sc(root, (i % 8) + (Math.floor(i / 8) - 1) * 3 + 2), 'scale pad ' + i + ': ' + m[i]);
});

step('⭐ the long values the device wrapped (CHROM, CUSTOM, ASSIGN) show one-line short forms; the option list keeps the names', () => {
    onCustom();
    const txt = screen();
    assert(txt.includes('CUST') && txt.includes('ASGN') && !txt.includes('IGN') && !txt.includes('TOM'), 'Custom page: ' + txt.join('|'));
    const c = PM.padModeBankCells(T);
    assert(c[0].options.includes('Custom') && c[1].options.includes('Assign'), 'the list lost the names');
    S.activeBank = C.BANK_PADMODE; S.customChords[T][5] = []; padOn(5);
    const pop = (S.actionPopupLines || []).join(' / ');
    assert(/TURN A KNOB/.test(pop), 'an empty chord pad on PADMODE does not mention the knobs: ' + pop);
    padOff(5); ticks(60);
});

step('⭐⭐ Custom Hold: Play — a held chord pad + a scale pad PLAYS both and edits nothing; held notes never fill an empty pad', () => {
    onCustom();
    S.customChords[T][0] = [60, 64, 67]; ticks(2);
    kn(1, +1);                                        /* Hold: Play */
    assert(PM.padModeCfg(T).custom.play === 1, 'not Play');
    S.activeBank = 0;
    padOn(0); padOn(10);
    assert(JSON.stringify(S.customChords[T][0]) === '[60,64,67]', 'Play edited the chord: ' + S.customChords[T][0]);
    const heard = S.padNoteMap[10] + S.trackOctave[T] * 12;
    assert(S.liveActiveNotes.has(heard), 'the scale pad did not sound with the chord held');
    padOff(10); padOff(0); ticks(1);
    padOn(12); padOn(3); padOff(3); padOff(12); ticks(1);
    assert(S.customChords[T][3].length === 0, 'held notes filled an empty pad in Play: ' + S.customChords[T][3]);
    S.activeBank = C.BANK_PADMODE; kn(1, -1);           /* Assign again: the same gesture edits */
    S.activeBank = 0;
    padOn(0); padOn(10); padOff(10); padOff(0); ticks(1);
    assert(S.customChords[T][0].length === 4, 'Assign did not edit: ' + S.customChords[T][0]);
});

step('⭐⭐ the assign card: hold a chord pad on PADMODE — Root, Qual … on screen; a turn builds the chord by name; one Undo per hold', () => {
    onCustom();
    padOn(2); ticks(1);
    let txt = screen().join('|');
    assert(/ROOT/i.test(txt) && /STACK/i.test(txt) && /RESET/i.test(txt) && /EMPTY/i.test(txt), 'no card (Chord card\'s labels) on an empty pad: ' + txt);
    kn(1, +1); ticks(1);                              /* Qual: Maj → Min */
    const base = ((S.padOctave[T] | 0) + C.DEFAULT_TRACK_OCTAVE) * 12;
    assert(JSON.stringify(S.customChords[T][2]) === JSON.stringify([base, base + 3, base + 7]), 'C minor: ' + S.customChords[T][2]);
    kn(0, +1); kn(0, +1); ticks(1);                   /* Root: D */
    assert(JSON.stringify(S.customChords[T][2]) === JSON.stringify([base + 2, base + 5, base + 9]), 'D minor: ' + S.customChords[T][2]);
    txt = screen().join('|');
    assert(/DMIN/i.test(txt), 'the card title does not name D minor: ' + txt);
    kn(3, +1); ticks(1);                              /* first inversion */
    assert(S.customChords[T][2][0] === base + 5, 'inversion: ' + S.customChords[T][2]);
    padOff(2); ticks(1);
    S.undoJs.undo();
    assert(S.customChords[T][2].length === 0, 'Undo did not bring back the empty pad: ' + S.customChords[T][2]);
});

step('⭐⭐ the card starts from the chord your notes spell, and a card-built pad reopens where it was', () => {
    onCustom();
    const base = ((S.padOctave[T] | 0) + C.DEFAULT_TRACK_OCTAVE) * 12;
    S.customChords[T][1] = [base + 4, base + 7, base + 12];  /* C major, first inversion (E G C) */
    ticks(2);
    padOn(1); ticks(1);
    const cells = PM.customCardCells(T, 1).cells;
    assert(cells[0].text === 'C' && cells[1].text === 'Maj' && cells[3].text === '+1', 'recognised: ' + cells.map((c) => c.text));
    kn(1, +1); kn(1, +1); kn(1, +1); kn(1, +1); kn(1, +1); kn(1, +1); kn(1, +1); kn(1, +1); ticks(1);  /* → Min7 */
    assert(PM.customCardCells(T, 1).cells[1].text === 'Min7', 'not Min7');
    const notes = S.customChords[T][1].slice();
    assert(JSON.stringify(notes.map((p) => (p - base + 120) % 12).sort((a, b) => a - b)) === '[0,3,7,10]', 'Cmin7: ' + notes);
    padOff(1); ticks(1);
    const saved = PM.padModeSidecar(); PM.restorePadModeSidecar(JSON.parse(JSON.stringify(saved)));
    padOn(1); ticks(1);
    const c2 = PM.customCardCells(T, 1).cells;
    assert(c2[1].text === 'Min7' && c2[3].text === '+1', 'the card did not reopen where it was: ' + c2.map((c) => c.text));
    padOff(1); ticks(1);
});

const LEDS = globalThis.__leds;
const padLeds = () => { LEDS.invalidateLEDCache(); for (let k = 0; k < 4; k++) LEDS.updateTrackLEDs(); const o = []; for (let i = 0; i < 32; i++) o.push(led[padN(i)] | 0); return o; };
const shiftOct = (d) => { midi(0xB0, 49, 127); midi(0xB0, d > 0 ? 55 : 54, 127); midi(0xB0, d > 0 ? 55 : 54, 0); midi(0xB0, 49, 0); ticks(1); };
const octBtn = (d) => { midi(0xB0, d > 0 ? 55 : 54, 127); midi(0xB0, d > 0 ? 55 : 54, 0); ticks(1); };
const popupNow = () => (S.actionPopupLines || []).join(' / ');

step('⭐⭐ a split shows its zones apart on the pads: A keeps root = track colour, B swaps them (root in A\'s dim non-root colour, the rest the track colour)', () => {
    onBank(PM.PM_SCALE);
    const plain = padLeds();
    const trackC = LEDS.trackColor(T);
    kn(1, +1); ticks(2);                              /* Vert */
    const L = padLeds();
    /* C major from C: pad 0 (A) and pad 4 (B) are both C. */
    assert(L[0] === trackC && L[0] === plain[0], 'zone A root changed: ' + L[0]);
    assert(L[1] === plain[1] && L[1] !== trackC, 'zone A other notes changed: ' + L[1]);
    assert(L[4] === plain[1] && L[4] !== 120, 'zone B root is not zone A\'s dim non-root colour: ' + L[4] + ' (A non-root ' + plain[1] + ')');
    assert(L[5] === trackC, 'zone B other notes are not the track colour: ' + L[5]);
    kn(1, -1); ticks(2);                              /* no split: no zone B */
    const N = padLeds();
    assert(N[4] === plain[4] && N[5] === plain[5], 'unsplit pads kept the inverted look');
});

step('⭐⭐ Shift + Octave moves ZONE B only: the B split, Piano\'s top; plain Octave still moves the whole surface; no split → whole surface', () => {
    onBank(PM.PM_SCALE);
    kn(1, +1); ticks(2);                              /* Vert */
    const to = S.trackOctave[T];
    const a0 = map()[0], b0 = map()[4];
    shiftOct(+1); ticks(2);
    assert(PM.padModeCfg(T).grid.octB === 1 && S.trackOctave[T] === to, 'Shift + Octave: ' + JSON.stringify(PM.padModeCfg(T).grid));
    assert(map()[0] === a0 && map()[4] === b0 + 12, 'zone pitches: ' + map()[0] + ' / ' + map()[4]);
    assert(popupNow() === 'OCTAVE B / +1', 'notice: ' + popupNow());
    octBtn(-1);
    assert(S.trackOctave[T] === to - 1 && PM.padModeCfg(T).grid.octB === 1, 'plain Octave did not move the whole surface');
    octBtn(+1);
    kn(1, -1); ticks(2);                              /* no split */
    shiftOct(+1);
    assert(S.trackOctave[T] === to + 1, 'no split: Shift + Octave did not fall through to the whole surface');
    octBtn(-1);
    PM.setPadMode(T, PM.PM_PIANO); ticks(2);
    const top0 = map()[16], bot0 = map()[0];
    shiftOct(-1); ticks(2);
    assert(map()[16] === top0 - 12 && map()[0] === bot0, 'Piano: Shift + Octave did not move the top octave alone');
    assert(PM.padModeCfg(T).piano.octB === -1, 'Piano octB ' + PM.padModeCfg(T).piano.octB);
    PM.setPadMode(T, PM.PM_SCALE); ticks(2);
});

step('⭐⭐ Shift + Octave in Chord moves the pads ABOVE the chords (Pad Oct); in Custom the scale pads, not the chord row', () => {
    onBank(PM.PM_CHORD);
    const slots0 = lastPadmap().split(' ').slice(0, 8).join(' '), scale0 = map()[24];
    shiftOct(+1); ticks(2);
    assert(S.chordSettings[T].strum === 1, 'Pad Oct: ' + S.chordSettings[T].strum);
    assert(lastPadmap().split(' ').slice(0, 8).join(' ') === slots0, 'the chord pads moved');
    assert(map()[24] === scale0 + 12, 'the scale row did not move: ' + map()[24] + ' was ' + scale0);
    assert(popupNow() === 'PAD OCTAVE / +1', 'notice: ' + popupNow());
    assert(PM.padModeBankCells(T)[6].label === 'Pad Oct', 'Chord page label: ' + PM.padModeBankCells(T)[6].label);
    shiftOct(-1); ticks(2);
    onCustom();
    S.customChords[T][0] = [60, 64, 67]; ticks(2);
    const cho = S.customChordOctave[T], to = S.trackOctave[T];
    shiftOct(+1);
    assert(S.trackOctave[T] === to + 1 && S.customChordOctave[T] === cho, 'Custom Shift + Octave: ' + S.trackOctave[T] + ' / ' + S.customChordOctave[T]);
});

step('⭐ the Custom card has Reset on K8 like the Chord card: touch K8 + click empties the pad; Undo brings it back', () => {
    onCustom();
    S.customChords[T][2] = [60, 64, 67]; ticks(2);
    padOn(2); ticks(1);
    const c = PM.customCardCells(T, 2).cells;
    assert(JSON.stringify(c.map((x) => x.label)) === JSON.stringify(globalThis.__cp.chordSlotCells(T, 0).cells.map((x) => x.label)),
           'the cards differ: ' + c.map((x) => x.label) + ' vs ' + globalThis.__cp.chordSlotCells(T, 0).cells.map((x) => x.label));
    midi(0x90, 7, 127); ticks(1);
    midi(0xB0, 3, 127); midi(0xB0, 3, 0); ticks(1);
    midi(0x80, 7, 0); padOff(2); ticks(1);
    assert(S.customChords[T][2].length === 0, 'Reset did not empty the pad: ' + S.customChords[T][2]);
    S.undoJs.undo();
    assert(JSON.stringify(S.customChords[T][2]) === '[60,64,67]', 'Undo: ' + S.customChords[T][2]);
});

step('⭐ the option lists use whole words (Josh: "pickers can use the full value name"); the value box keeps the short ones', () => {
    onBank(PM.PM_SCALE);
    let c = PM.padModeBankCells(T);
    assert(c[0].options.includes('Chromatic') && JSON.stringify(c[1].options) === '["None","Vertical","Horizontal"]', 'Mode / Split lists: ' + c[0].options + ' | ' + c[1].options);
    kn(1, +1);
    c = PM.padModeBankCells(T);
    assert(c[1].text === 'Vert', 'the box lost its short form: ' + c[1].text);
    kn(1, -1);
    PM.setPadMode(T, PM.PM_CHORD); ticks(2);
    assert(PM.padModeBankCells(T)[5].options.includes('1 Octave Down'), 'Chord Bass list: ' + PM.padModeBankCells(T)[5].options);
    onCustom(); S.customChords[T][2] = [60, 64, 67]; ticks(2); padOn(2); ticks(1);
    const q = PM.customCardCells(T, 2).cells[1];
    assert(q.options[0] === 'Major' && q.options.includes('Diminished 7') && q.text === 'Maj', 'Stack list / box: ' + q.options.slice(0, 3) + ' / ' + q.text);
    padOff(2); ticks(1);
});

step('⭐ the bank is "Pad Mode": the map cell reads PAD MODE, and no PADMODE anywhere', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; PM.setPadMode(T, PM.PM_SCALE); ticks(2);
    assert(C.BANKS[C.BANK_PADMODE].name === 'PAD MODE', 'bank name ' + C.BANKS[C.BANK_PADMODE].name);
    const m = pure.bankPadMapForMode(C.PAD_MODE_MELODIC_SCALE, T);
    const cell = m[0].cells[0];
    assert(cell && cell.bank === C.BANK_PADMODE && /PAD MODE/.test(String(cell.name).replace('\n', ' ')), 'map cell: ' + JSON.stringify(cell));
});

step('⭐ a drum track has no PADMODE: no pad on its map, and the bank is not on its walk', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_DRUM; ticks(2);
    assert(pure.bankCycleForMode(C.PAD_MODE_DRUM, T).indexOf(C.BANK_PADMODE) < 0, 'PADMODE on the drum walk');
    const note = pickOnMap(C.BANK_PADMODE);
    assert(note < 0 && S.activeBank !== C.BANK_PADMODE, 'a drum track reached PADMODE');
    S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; ticks(2);
});

step('⭐⭐ Delete + jog click on Pad Mode resets the current mode\'s settings (Josh: "it should reset the current banks params"); Mode, Instrument and the chords stay; one Undo brings them back', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; S.trackRoute[T] = 0;
    PM.setPadMode(T, PM.PM_SCALE); ticks(2);
    pickOnMap(C.BANK_PADMODE); S.bankCardLatched = true;
    const cfg = () => JSON.stringify(PM.padModeCfg(T));
    const delJog = () => { midi(0xB0, 119, 127); midi(0xB0, 3, 127); midi(0xB0, 3, 0); midi(0xB0, 119, 0); ticks(1); };

    /* Scale: Split, both octaves and Scale's own Transpose; Chrom's stays. */
    PM.padModeBankKnob(T, 1, 2); PM.padModeBankKnob(T, 2, 1); PM.padModeBankKnob(T, 3, 2);
    PM.padModeBankKnob(T, 4, -1); PM.padModeBankKnob(T, 5, 3);
    PM.padModeCfg(T).grid.semiA = 5;
    const before = cfg(), g = PM.padModeCfg(T).grid;
    assert(g.split === 2 && g.octA === 1 && g.stepA === 2 && g.octB === -1 && g.stepB === 3, 'setup: ' + before);
    delJog();
    const g2 = PM.padModeCfg(T).grid;
    assert(g2.split === 0 && g2.octA === 0 && g2.octB === 0 && g2.stepA === 0 && g2.stepB === 0, 'Scale not reset: ' + cfg());
    assert(g2.semiA === 5, 'Chrom\'s Transpose was reset from Scale');
    assert(PM.padModeOf(T) === PM.PM_SCALE, 'Mode changed: ' + PM.padModeOf(T));
    assert((S.actionPopupLines || []).join(' ') === 'PAD MODE RESET', 'popup: ' + S.actionPopupLines);
    S.undoJs.undo();
    assert(cfg() === before, 'Undo did not bring Scale back: ' + cfg());

    /* Custom: Hold, both octaves, Transpose — never the chords. */
    PM.setPadMode(T, PM.PM_CUSTOM); ticks(2);
    PM.padModeBankKnob(T, 1, 1); PM.padModeBankKnob(T, 2, 1); PM.padModeBankKnob(T, 3, 1); PM.padModeBankKnob(T, 4, 2);
    S.customChords[T][0] = [60, 64, 67];
    delJog();
    const u = PM.padModeCfg(T).custom;
    assert(u.play === 0 && u.scaleStep === 0 && S.customChordOctave[T] === 0 && S.trackOctave[T] === C.DEFAULT_TRACK_OCTAVE,
        'Custom not reset: ' + JSON.stringify([u.play, u.scaleStep, S.customChordOctave[T], S.trackOctave[T]]));
    assert(S.customChords[T][0].length === 3, 'the reset cleared a chord');
    assert(PM.padModeOf(T) === PM.PM_CUSTOM, 'Mode changed from Custom');
    S.undoJs.undo();
    assert(PM.padModeCfg(T).custom.play === 1 && S.customChordOctave[T] === 1, 'Undo did not bring Custom back');

    /* Chord: Map back to Diatonic (the chords follow), Pad Oct to 0. */
    PM.setPadMode(T, PM.PM_CHORD); ticks(2);
    PM.padModeBankKnob(T, 1, 1); PM.padModeBankKnob(T, 6, 1);
    assert(S.chordSettings[T].map === 1 && S.chordSettings[T].strum === 1, 'Chord setup');
    delJog();
    assert(S.chordSettings[T].map === 0 && S.chordSettings[T].strum === 0, 'Chord not reset: ' + JSON.stringify(S.chordSettings[T]));
    S.undoJs.undo();
    assert(S.chordSettings[T].map === 1 && S.chordSettings[T].strum === 1, 'Undo did not bring Chord back');

    /* Piano on Bass: the neck's shifts reset, the Instrument stays Bass. */
    PM.setPadMode(T, PM.PM_PIANO); ticks(2);
    PM.padModeBankKnob(T, 1, 1); PM.padModeBankKnob(T, 2, 2);
    delJog();
    const p = PM.padModeCfg(T).piano;
    assert(p.instr === PM.INSTR_BASS && p.bassOct === 0, 'Piano: ' + JSON.stringify(p));

    PM.setPadMode(T, PM.PM_SCALE); S.padModeCfg[T] = null; S.chordSettings[T] = undefined;
    S.trackOctave[T] = C.DEFAULT_TRACK_OCTAVE; S.customChordOctave[T] = 0; S.customChords[T][0] = [];
    home(); ticks(2);
});

step('⭐ a Conductor: no PADMODE, and Shift + Step 8 only flips Scale / Chrom', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_CONDUCT; ticks(2);
    assert(pure.bankCycleForMode(C.PAD_MODE_CONDUCT, T).indexOf(C.BANK_PADMODE) < 0, 'PADMODE on the Conductor walk');
    const seen = [];
    for (let i = 0; i < 3; i++) {
        midi(0xB0, 49, 127); tap(16 + 7); midi(0xB0, 49, 0); ticks(1);
        seen.push(PM.padModeOf(T));
    }
    assert(JSON.stringify(seen) === JSON.stringify([PM.PM_CHROM, PM.PM_SCALE, PM.PM_CHROM]), 'Conductor walk: ' + seen);
    assert(!S.padLayoutPiano[T] && !S.padLayoutChord[T] && !S.padLayoutCustom[T], 'a Conductor took a melodic-only layout');
    PM.setPadMode(T, PM.PM_SCALE);
    S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; ticks(2);
});

if (failed) { console.error('FAIL: padmode bank'); process.exit(1); }
console.log('PASS: padmode bank');
}
main().catch((e) => { console.error(e); process.exit(1); });
