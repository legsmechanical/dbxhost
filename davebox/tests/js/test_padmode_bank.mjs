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
        assert(txt.some((x) => /PADMODE/i.test(x)), 'no PADMODE header: ' + txt.slice(0, 8).join('|'));
        assert(txt.includes('Mode') || txt.includes('MODE'), 'no Mode cell: ' + txt.join('|'));
        assert(txt.join('').toUpperCase().includes('SCALE'), 'Mode does not read Scale: ' + txt.join('|'));
        const before = lastPadmap();
        k1(+1); k1Up();
        assert(PM.padModeOf(T) === PM.PM_CHROM, 'K1 did not move the track to Chrom: ' + PM.padModeOf(T));
        ticks(2);
        txt = screen();
        /* The enum square wraps a long value ("CHR" / "OM"): read it joined. */
        assert(txt.join('').toUpperCase().includes('CHROM'), 'the screen does not read Chrom: ' + txt.join('|'));
        assert(lastPadmap() !== before, 'the pad map was not pushed again');
        k1(-1); k1Up();
        assert(PM.padModeOf(T) === PM.PM_SCALE, 'K1 back did not return to Scale');
    });
}

step('⭐ K1 onto Chord raises its explainer and stays on PADMODE; off again, the settings of each mode survive', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; S.trackRoute[T] = 0;
    PM.setPadMode(T, PM.PM_PIANO); ticks(2);
    pickOnMap(C.BANK_PADMODE); S.bankCardLatched = true;
    k1(+1); k1Up();
    assert(PM.padModeOf(T) === PM.PM_CHORD && S.chordPopupOpen, 'not on Chord with its explainer');
    assert(S.activeBank === C.BANK_PADMODE, 'Chord took the knobs off PADMODE');
    midi(0xB0, 3, 127); midi(0xB0, 3, 0); ticks(2);       /* OK */
    assert(!S.chordPopupOpen, 'OK did not close the explainer');
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
    assert(/SPLIT/i.test(txt) && /NONE/i.test(txt) && /OCT/i.test(txt) && /STEP/i.test(txt), 'the page: ' + txt);
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
    assert(/OCTA/i.test(txt) && /OCTB/i.test(txt), 'halves not named A / B: ' + txt);
});

step('⭐⭐ Chrom, Horizontal: the top two rows and the bottom two are two grids; Semi moves by semitones', () => {
    onBank(PM.PM_CHROM);
    const root = (S.padOctave[T] | 0) * 12;
    kn(1, +1); kn(1, +1);                            /* Split: Horz */
    assert(PM.padModeCfg(T).grid.split === PM.SPLIT_HORZ, 'not Horz');
    kn(3, +1); kn(3, +1); kn(3, +1);                 /* Semi A +3: the top half starts on E♭ */
    const m = map();
    for (let i = 0; i < 32; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        const want = r >= 2 ? root + 3 + c + (r - 2) * 8 : root + c + r * 8;
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
step('⭐⭐ Piano: Oct / Semi Top move the top two rows, Oct / Semi Bot the bottom two; gaps stay silent', () => {
    onBank(PM.PM_PIANO);
    const base = (S.padOctave[T] | 0) * 12;
    const txt = screen().join('|');
    assert(/INSTR/i.test(txt) && /PIANO/i.test(txt) && /OCTT/i.test(txt) && /SEMIB/i.test(txt), 'the page: ' + txt);
    kn(2, +1);                                       /* Oct Top +1 */
    kn(5, -1); kn(5, -1);                            /* Semi Bot -2 */
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
    kn(2, +1);                                       /* Piano: Oct Top +1, to be kept */
    kn(1, +1);                                       /* Instrument: Bass */
    assert(PM.padModeCfg(T).piano.instr === PM.INSTR_BASS, 'not Bass');
    const e = (S.padOctave[T] | 0) * 12 - 8;
    let m = map();
    for (let i = 0; i < 32; i++) assert(m[i] === e + Math.floor(i / 8) * 5 + (i % 8), 'bass pad ' + i + ': ' + m[i]);
    assert(m[0] % 12 === 4 && m[8] % 12 === 9 && m[16] % 12 === 2 && m[24] % 12 === 7, 'strings not E A D G');
    const cells = PM.padModeBankCells(T);
    assert(cells[2].label === 'Oct' && cells[3].label === 'Semi' && cells[4].kind === 'blank' && cells[5].kind === 'blank',
           'Bass page: ' + cells.map((c) => c.label).join(','));
    kn(3, +1); kn(4, +1);                            /* Semi +1; K5 does nothing on Bass */
    m = map();
    assert(m[0] === e + 1, 'Bass Semi did not move the neck: ' + m[0]);
    kn(1, -1);                                       /* back to Piano */
    assert(PM.padModeCfg(T).piano.octT === 1 && PM.padModeCfg(T).piano.octB === 0, 'Piano lost its own: ' + JSON.stringify(PM.padModeCfg(T).piano));
    PM.restorePadModeSidecar(PM.padModeSidecar());
    assert(PM.padModeCfg(T).piano.bassSemi === 1 && PM.padModeCfg(T).piano.octT === 1, 'Piano / Bass not saved');
});

step('⭐ a drum track has no PADMODE: no pad on its map, and the bank is not on its walk', () => {
    home(); S.trackPadMode[T] = C.PAD_MODE_DRUM; ticks(2);
    assert(pure.bankCycleForMode(C.PAD_MODE_DRUM, T).indexOf(C.BANK_PADMODE) < 0, 'PADMODE on the drum walk');
    const note = pickOnMap(C.BANK_PADMODE);
    assert(note < 0 && S.activeBank !== C.BANK_PADMODE, 'a drum track reached PADMODE');
    S.trackPadMode[T] = C.PAD_MODE_MELODIC_SCALE; ticks(2);
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
