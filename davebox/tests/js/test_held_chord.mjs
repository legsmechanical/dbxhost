/* tests/js/test_held_chord.mjs — the held-note / chord indicator on the melodic
 * Track View.
 *
 * Two halves:
 *   1. NAMING. Every chord type on all 12 roots, in every inversion, spread and
 *      doubled across octaves — the label must be the expected name. Then a
 *      PROPERTY over thousands of random note sets: whatever the label says,
 *      it must spell EXACTLY the held pitch classes with the held bass. A
 *      wrong name cannot pass that, whichever table entry produced it.
 *      (Cross-checked once against music21 when written: no wrong names; the
 *      only disagreements were sets with two correct names, like C6 = Am7/C.)
 *   2. THE SCREEN. Pads pressed and external MIDI played through the real
 *      handlers; what the overview then DRAWS is read back off the kit text
 *      trace. Released, the indicator must be gone.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
let afterStep = () => {};
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } finally { afterStep(); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_write_file', 'host_ensure_dir', 'host_remove_dir',
    'host_module_set_param', 'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line',
    'set_pixel', 'flush_display', 'move_midi_internal_send', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi'])
    globalThis[fn] = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { chordLabel, keyUsesFlats } = await import('../../ui/ui_chord.mjs');

/* ---------------- 1. naming ---------------- */
const SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FL = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
/* Written out independently of the module's table. `inv: false` marks the
 * types whose inversions have a DIFFERENT correct name (C6 over E is also
 * Am7/E; Csus2 over G is Gsus4; diminished 7ths and augmented triads are
 * symmetric) — the property check below still covers those. */
const TYPES = [
    ['', [0, 4, 7]], ['MIN', [0, 3, 7]], ['DIM', [0, 3, 6]],
    ['7', [0, 4, 7, 10]], ['MAJ7', [0, 4, 7, 11]], ['MIN(MAJ7)', [0, 3, 7, 11]],
    ['7', [0, 4, 10]], ['MAJ7', [0, 4, 11]], ['MIN7', [0, 3, 10]],
    ['9', [0, 4, 7, 10, 14]], ['MAJ9', [0, 4, 7, 11, 14]], ['MIN9', [0, 3, 7, 10, 14]],
    ['ADD9', [0, 4, 7, 14]], ['MIN(ADD9)', [0, 3, 7, 14]], ['5', [0, 7]],
    ['MIN7', [0, 3, 7, 10], [1]], ['MIN7(♭5)', [0, 3, 6, 10], [1]],
    ['7SUS4', [0, 5, 7, 10]], ['AUG7', [0, 4, 8, 10]],
    ['6', [0, 4, 7, 9], false], ['MIN6', [0, 3, 7, 9], false], ['SUS2', [0, 2, 7], false],
    ['SUS4', [0, 5, 7], false], ['AUG', [0, 4, 8], false], ['DIM7', [0, 3, 6, 9], false],
];
step('every chord type, 12 roots, every inversion, spread and doubled', () => {
    let n = 0; const errs = [];
    for (const [q, iv, invs] of TYPES) for (let r = 0; r < 12; r++) for (let inv = 0; inv < iv.length; inv++) {
        if (inv > 0 && invs === false) continue;
        if (Array.isArray(invs) && invs.includes(inv)) continue;       /* the two-name inversion */
        const base = iv.map((i) => 48 + r + i);
        for (let k = 0; k < inv; k++) base[k] += 12;
        /* Spread: every other note up an octave, the bass doubled two octaves
         * up and the top note doubled — the lowest note stays the bass. */
        const lo = Math.min(...base);
        const spread = base.map((p) => (p === lo ? p : p + 12)).concat([lo + 24, base[base.length - 1] + 12]);
        for (const ps of [base, spread]) {
            const bass = Math.min(...ps) % 12;
            const exp = SH[r] + q + (bass === r ? '' : '/' + SH[bass]);
            n++;
            const got = chordLabel(ps, false);
            if (got !== exp && errs.length < 8) errs.push(JSON.stringify(ps) + ' → ' + got + ', expected ' + exp);
        }
    }
    assert(errs.length === 0, errs.join('; '));
    assert(n > 1000, 'only ' + n + ' voicings checked');
});
step('the two-name inversions take the reading built on the bass: C E G A → C6, not Am7/C', () => {
    assert(chordLabel([48, 52, 55, 57], false) === 'C6', chordLabel([48, 52, 55, 57], false));
    assert(chordLabel([51, 55, 58, 60], false) === 'D#6', chordLabel([51, 55, 58, 60], false));
});

/* The property: parse the label back into notes and compare with what was held. */
const QUAL = new Map(TYPES.map(([q, iv]) => [q, iv]));
QUAL.set('7', [0, 4, 7, 10]); QUAL.set('MAJ7', [0, 4, 7, 11]); QUAL.set('MIN7', [0, 3, 7, 10]);
const pcOf = (name, names) => names.indexOf(name);
function spells(label, ps, names) {
    const pcs = new Set(ps.map((p) => p % 12)), bass = Math.min(...ps) % 12;
    const m = /^([A-G][#♭]?)(.*?)(?:\/([A-G][#♭]?))?$/.exec(label);
    if (!m) return 'unparseable';
    const root = pcOf(m[1], names), q = m[2];
    const lb = m[3] ? pcOf(m[3], names) : root;
    if (lb !== bass) return 'bass ' + names[lb] + ' but ' + names[bass] + ' is lowest';
    if (!QUAL.has(q)) return 'unknown quality ' + q;
    const full = new Set(QUAL.get(q).map((i) => (root + i) % 12));
    /* A no-fifth shell spells its chord with the fifth absent. */
    const shell = new Set([...full].filter((pc) => pc !== (root + 7) % 12));
    const eq = (a) => a.size === pcs.size && [...a].every((x) => pcs.has(x));
    return eq(full) || (['7', 'MAJ7', 'MIN7'].includes(q) && eq(shell)) ? '' : 'names ' + [...full] + ', held ' + [...pcs];
}
step('⭐ property: a named chord spells EXACTLY the held notes and bass (20,000 random sets)', () => {
    let seed = 7, named = 0; const errs = [];
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 20000; i++) {
        const ps = []; const n = 2 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) ps.push(36 + Math.floor(rnd() * 36));
        const flats = rnd() < 0.5, names = flats ? FL : SH;
        const lab = chordLabel(ps, flats);
        const pcs = [...new Set(ps.map((p) => p % 12))];
        if (pcs.length === 1) { if (lab !== names[Math.min(...ps) % 12] + (Math.floor(Math.min(...ps) / 12) - 2)) errs.push(ps + ' → ' + lab); continue; }
        if (lab.indexOf(' ') >= 0) {                          /* the fallback: note names, lowest first */
            const want = [...ps].sort((a, b) => a - b).map((p) => names[p % 12]).filter((s, j, a) => a.indexOf(s) === j).join(' ');
            if (lab !== want) errs.push(ps + ' → ' + lab + ', fallback should be ' + want);
            continue;
        }
        named++;
        const why = spells(lab, ps, names);
        if (why && errs.length < 8) errs.push(JSON.stringify(ps) + ' → ' + lab + ': ' + why);
    }
    assert(errs.length === 0, errs.join('; '));
    assert(named > 1000, 'only ' + named + ' sets were named — the property checked too little');
});
step('one note shows its octave, Move\'s way (60 = C3); octaves of one note stay one note', () => {
    assert(chordLabel([66], false) === 'F#3', chordLabel([66], false));
    assert(chordLabel([54, 66], false) === 'F#2', chordLabel([54, 66], false));
    assert(chordLabel([], false) === '', 'nothing held is empty');
});
step('flat keys spell with ♭; sharp and keyless scales with #', () => {
    assert(chordLabel([58, 62, 65], true) === 'B♭', chordLabel([58, 62, 65], true));
    assert(chordLabel([61, 64, 67, 71], false) === 'C#MIN7(♭5)', chordLabel([61, 64, 67, 71], false));
    assert(keyUsesFlats(5, 0) && keyUsesFlats(10, 0) && keyUsesFlats(2, 1) && keyUsesFlats(0, 1),
           'F / B♭ major and D / C minor are flat keys');
    assert(!keyUsesFlats(7, 0) && !keyUsesFlats(9, 1) && !keyUsesFlats(4, 1) && !keyUsesFlats(6, 0),
           'G major, A minor, E minor and F# major are not');
    assert(keyUsesFlats(7, 2) && !keyUsesFlats(2, 2), 'G dorian (parent F) is flat, D dorian (parent C) is not');
    assert(!keyUsesFlats(5, 12), 'whole-tone has no key signature: sharps');
});

/* ---------------- 2. the screen ---------------- */
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, TRACK_PAD_BASE } = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.bankParams[2][5][0] = 1;                                  /* Arp on: its label is what steps aside */
S.midiInChannel = 0; S.padKey = 0; S.padScale = 0;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
ticks(3);

function screenText() {
    const out = [];
    fonts.setKitTextTrace((t) => out.push(t));
    try { globalThis.clear_screen(); render.drawUI(); } finally { fonts.setKitTextTrace(null); }
    return out;
}
/* The header draws its own bracket — the instrument, "[--]" when none is
 * loaded; the indicator is every OTHER bracketed string on the screen. */
const bracketed = () => screenText().filter((t) => /^\[.*\]$/.test(t) && t !== '[--]');
/* A failed step must not leave notes held for the next one to trip over. */
afterStep = () => {
    for (let n = 0; n < 128; n++) globalThis.onMidiMessageExternal(new Uint8Array([0x80, n, 0]));
    for (let i = 0; i < 32; i++) globalThis.onMidiMessageInternal(new Uint8Array([0x80, TRACK_PAD_BASE + i, 0]));
    S.padKey = 0; S.trackRoute[2] = 0; S.seqActiveNotes.clear(); ticks(1);
};
const pad = (i, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, TRACK_PAD_BASE + i, on ? 100 : 0]));
const ext = (n, on) => globalThis.onMidiMessageExternal(new Uint8Array([on ? 0x90 : 0x80, n, on ? 100 : 0]));

step('control: nothing held — no indicator, the Arp label is there', () => {
    const t = screenText();
    assert(bracketed().length === 0, 'drew ' + JSON.stringify(bracketed()));
    assert(t.includes('ARP'), 'no Arp label: ' + JSON.stringify(t.slice(0, 8)));
});
step('⭐ a pad held: its note, in brackets, where the Arp label was', () => {
    const p = S.padNoteMap[0] + S.trackOctave[2] * 12;
    pad(0, true); ticks(1);
    const want = '[' + SH[p % 12] + (Math.floor(p / 12) - 2) + ']';
    assert(JSON.stringify(bracketed()) === JSON.stringify([want]), 'drew ' + JSON.stringify(bracketed()) + ', wanted ' + want);
    assert(!screenText().includes('ARP'), 'the Arp label drew over it');
    pad(0, false); ticks(1);
});
step('⭐ released: the indicator is gone and the Arp label is back', () => {
    assert(bracketed().length === 0, 'still drew ' + JSON.stringify(bracketed()));
    assert(screenText().includes('ARP'), 'Arp label did not come back');
});
step('⭐ external MIDI C E♭ G B♭ held: [CMIN7]; one released: [CMIN]... then gone', () => {
    for (const n of [60, 63, 67, 70]) ext(n, true);
    ticks(1);
    assert(JSON.stringify(bracketed()) === '["[CMIN7]"]', 'drew ' + JSON.stringify(bracketed()));
    ext(70, false); ticks(1);
    assert(JSON.stringify(bracketed()) === '["[CMIN]"]', 'after release drew ' + JSON.stringify(bracketed()));
    for (const n of [60, 63, 67]) ext(n, false);
    ticks(1);
    assert(bracketed().length === 0, 'still drew ' + JSON.stringify(bracketed()));
});
step('the same chord in F major spells with flats', () => {
    S.padKey = 5; ticks(1);
    for (const n of [58, 62, 65]) ext(n, true);
    ticks(1);
    assert(JSON.stringify(bracketed()) === '["[B♭]"]', 'drew ' + JSON.stringify(bracketed()));
    for (const n of [58, 62, 65]) ext(n, false);
    S.padKey = 0; ticks(1);
});
step('a sequencer echo on a Move-routed track is not input', () => {
    /* Tick once after re-routing: the route change releases any external
     * notes held across it (flushHeldMoveExtNotes), by design. */
    S.trackRoute[2] = 1; ticks(2);
    /* CONTROL first: a real keypress on the same Move-routed track DOES show —
     * without it, "the echo drew nothing" passes on a screen that never draws. */
    ext(65, true); ticks(1);
    assert(JSON.stringify(bracketed()) === '["[F3]"]', 'control: a keypress on a Move-routed track drew ' + JSON.stringify(bracketed()));
    ext(65, false); ticks(1);
    S.seqActiveNotes.add(64);
    ext(64, true); ticks(1);
    assert(bracketed().length === 0, 'the echo drew ' + JSON.stringify(bracketed()));
    ext(64, false); S.seqActiveNotes.delete(64); S.trackRoute[2] = 0; ticks(1);
});
step('⭐ the TICK redraws on a press by itself — nothing else asks it to', () => {
    ticks(3); S.screenDirty = false;
    const drawn = [];
    ext(62, true);
    fonts.setKitTextTrace((t) => drawn.push(t));
    try { ticks(1); } finally { fonts.setKitTextTrace(null); }
    ext(62, false); ticks(1);
    assert(drawn.includes('[D3]'), 'the tick did not draw the note: ' + JSON.stringify(drawn.slice(0, 10)));
});

if (failed) process.exit(1);
console.log('test_held_chord: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
