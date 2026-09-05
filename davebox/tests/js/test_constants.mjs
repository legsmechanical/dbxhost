/* tests/js/test_constants.mjs — behavior pins for the pure helpers in
 * ui_constants.mjs, ahead of the Phase 1 ui_pure.mjs move. */
import { parseActionRaw, col4, col5, fmtNote, fmtArpOct, fmtRoute,
         fmtRes, fmtPct, fmtBool, fmtGateMod, fmtDiq, fmtStretch, fmtLen,
         fmtInstr, instrOptions, INSTR_SCHWUNG, INSTR_MIDI_CH, INSTR_TRACK, INSTR_NONE,
         NOTE_KEYS } from '../../ui/ui_constants.mjs';

let failed = 0;
function eq(got, want, label) {
    if (got !== want) { console.error(`FAIL: ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); failed = 1; }
}

/* parseActionRaw: '1x'/empty -> 0; 'xN' -> pow2 index; '/N' -> negative index */
eq(parseActionRaw('1x', 0), 0, 'parseActionRaw 1x');
eq(parseActionRaw('', 0), 0, 'parseActionRaw empty');
eq(parseActionRaw('x4', 0), 2, 'parseActionRaw x4');
eq(parseActionRaw('/8', 0), -3, 'parseActionRaw /8');
eq(parseActionRaw('x3', 7), 7, 'parseActionRaw non-pow2 falls to def');

/* col4/col5: pad/truncate, null -> "-" */
eq(col4('ab'), 'ab  ', 'col4 pad');
eq(col4('abcdef'), 'abcd', 'col4 truncate');
eq(col4(null), '-   ', 'col4 null');
eq(col5('abc'), 'abc  ', 'col5 pad');

/* fmtNote: wraps mod 12, negative-safe */
eq(fmtNote(13), NOTE_KEYS[1], 'fmtNote 13');
eq(fmtNote(-1), NOTE_KEYS[11], 'fmtNote -1');

/* fmtArpOct sign display; fmtRoute enum */
eq(fmtArpOct(0), 'Off', 'fmtArpOct 0');
eq(fmtArpOct(2), '+2', 'fmtArpOct +');
eq(fmtRoute(1), 'Move', 'fmtRoute move');

/* Instrument selector (a track owns its instrument) — ONE row carrying every
 * destination, so the value bands must not overlap or a track plays the wrong
 * thing with nothing on screen to show it. */
eq(fmtInstr(0), 'Move 1', 'fmtInstr first Move is 1-based');
eq(fmtInstr(3), 'Move 4', 'fmtInstr last Move');
eq(fmtInstr(INSTR_SCHWUNG), 'Schwung', 'fmtInstr schwung');
eq(fmtInstr(INSTR_MIDI_CH), 'MIDI Ch 1', 'fmtInstr first MIDI channel');
eq(fmtInstr(INSTR_MIDI_CH + 15), 'MIDI Ch 16', 'fmtInstr last MIDI channel');
eq(fmtInstr(INSTR_TRACK), 'Track 1', 'fmtInstr first track target');
eq(fmtInstr(INSTR_TRACK + 7), 'Track 8', 'fmtInstr last track target');
eq(fmtInstr(INSTR_NONE), 'None', 'fmtInstr NONE (2026-09-05) — a word, never the unseeded --');
eq(fmtInstr(INSTR_NONE - 1), '?', 'the value below NONE is still a gap');
eq(fmtInstr(INSTR_NONE + 1), '?', 'the value above NONE is still a gap');
/* The bands are separated by gaps ON PURPOSE — a stray value must land in a gap
 * and read as unknown, never as a valid different destination. */
eq(fmtInstr(5), '?', 'a value in the gap is not silently a destination');
eq(fmtInstr(26), '?', 'past the last MIDI channel is not a track');

/* Eligible destinations: Move 1-4 + Schwung + all 16 channels always; track
 * targets only for OTHER tracks that are Move(1) or Schwung(0) — never a MIDI
 * track (2), which is what makes routing cycles unrepresentable. */
{
    const routes = [1, 0, 2, 0, 2, 1, 0, 2];   /* tracks 3,5,8 are MIDI */
    const o = instrOptions(routes, 0);
    eq(o.slice(0, 5).join(','), '0,1,2,3,4', 'Move 1-4 and Schwung always offered');
    eq(o.filter(v => v >= INSTR_MIDI_CH && v < INSTR_TRACK).length, 16,
       'all 16 MIDI channels offered');
    eq(o.filter(v => v >= INSTR_TRACK).map(v => v - INSTR_TRACK + 1).join(','), '2,4,6,7',
       'only Move/Schwung tracks are targets, and never itself');
    eq(instrOptions(routes, 1).filter(v => v >= INSTR_TRACK)
        .map(v => v - INSTR_TRACK + 1).join(','), '1,4,6,7',
       'excludes the track being edited, and only it');
    eq(instrOptions([2, 2, 2], 0).filter(v => v >= INSTR_TRACK).length, 0,
       'a set of MIDI tracks offers no track targets at all');
}

/* fmtRes: ['1/32','1/16','1/8','1/4','1/2','1bar'][v] || '1/16' (ui_constants.mjs:95) */
eq(fmtRes(0), '1/32', 'fmtRes 0');
eq(fmtRes(5), '1bar', 'fmtRes 5');
eq(fmtRes(9), '1/16', 'fmtRes out-of-range falls to 1/16');

/* fmtPct: v + '%' (ui_constants.mjs:96) */
eq(fmtPct(50), '50%', 'fmtPct 50');

/* fmtBool: v ? 'ON' : 'OFF' (ui_constants.mjs:100) */
eq(fmtBool(1), 'ON', 'fmtBool 1');
eq(fmtBool(0), 'OFF', 'fmtBool 0');

/* fmtGateMod: GATE_LABELS[v] || 'Off' (ui_constants.mjs:102-103) */
eq(fmtGateMod(0), 'Off', 'fmtGateMod 0');
eq(fmtGateMod(10), '1bar', 'fmtGateMod 10');
eq(fmtGateMod(99), 'Off', 'fmtGateMod out-of-range falls to Off');

/* fmtDiq: fixed label array, index-or-fallback (ui_constants.mjs:112).
 *
 * Triplet suffixes are LOWERCASE `t`, deliberately — 2add2e1 (2026-07-21) "real
 * lowercase d/t for triplet and dotted suffixes". This pin was written before that
 * and kept asserting '1/4T', so it failed from that day on. Fixed 2026-08-03.
 *
 * All three triplet labels are checked, not just one: a pin on a single index is
 * what let the convention change out from under this test in the first place, and
 * a half-applied casing change would still pass. */
eq(fmtDiq(4), '1/16t', 'fmtDiq 4 — lowercase triplet');
eq(fmtDiq(6), '1/8t',  'fmtDiq 6 — lowercase triplet');
eq(fmtDiq(8), '1/4t',  'fmtDiq 8 — lowercase triplet');
eq(fmtDiq(0), 'Off', 'fmtDiq 0');
eq(fmtDiq(99), 'Off', 'fmtDiq out-of-range falls to Off');

/* fmtStretch: 0 -> '1x'; >0 -> 'x'+2^exp; <0 -> '/'+2^-exp (ui_constants.mjs:82-86) */
eq(fmtStretch(0), '1x', 'fmtStretch 0');
eq(fmtStretch(3), 'x8', 'fmtStretch +3');
eq(fmtStretch(-2), '/4', 'fmtStretch -2');

/* fmtLen: LEN_LABELS[v|0] || '--' (ui_constants.mjs:90-91) */
eq(fmtLen(5), '2', 'fmtLen 5');
eq(fmtLen(20), '--', 'fmtLen out-of-range falls to --');

if (failed) process.exit(1);
console.log('PASS: ui_constants pure helpers');
