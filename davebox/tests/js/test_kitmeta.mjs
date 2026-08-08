/* tests/js/test_kitmeta.mjs — pins for adopting a canvaskit bank's LAYOUT
 * without adopting its wire domain as if it were engineering units.
 *
 * The bug these exist for: canvaskit's uni()/bip()/fader() declare
 * `min: 0, max: KIT_PARAM_MAX (=255)` and hide the real range inside a
 * parse/format codec the generated canvas.js never exposes. davebox read those
 * numbers as engineering units, so a -48..48 semitone transpose presented as
 * 0..255 — displayed wrong, and a knob turn stepped from the wrong base and
 * WROTE it back. Wrong per-param in a way that looks random: only plin/plog
 * cells carry a codec, so pint/penum were always correct and the rest were not.
 *
 * Fixtures below are the REAL shapes: kit cells as canvaskit's prelude emits
 * them, hierarchy as DR32's module.json declares them. */
import { authoritativeMeta, inferGuessedMeta, adoptKitStructure } from '../../ui/ui_discover.mjs';

let failed = 0;
function eq(got, want, label) {
    if (got !== want) { console.error(`FAIL: ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); failed = 1; }
}

/* DR32's hierarchy, trimmed to what matters. chain_params publishes only
 * kit/master/editor — the pad params live ONLY on the child level, which is
 * exactly why the alias lookup has to work. */
const LEVELS = {
    root: { name: 'Drum Rack 32', params: [
        { key: 'master', name: 'Master', type: 'float', min: 0, max: 2, step: 0.02 },
        { level: 'pads', label: 'Pads' },
    ] },
    pads: {
        name: 'Pads', child_prefix: 'pad', child_count: 32, child_label: 'Pad',
        params: [
            { key: 'transpose', name: 'Transpose', type: 'int', min: -48, max: 48, unit: 'st' },
            { key: 'cutoff', name: 'Filter Freq', type: 'float', min: 30, max: 22000, step: 50, unit: 'Hz' },
            { key: 'filter_type', name: 'Filter Type', type: 'enum',
              options: ['Lowpass 12dB', 'Lowpass', 'Highpass', 'Peak'] },
        ],
    },
};
const CP = { master: { key: 'master', name: 'Master', type: 'float', min: 0, max: 2, step: 0.02 } };

/* -- authoritativeMeta: all three key shapes -------------------------------- */

eq(authoritativeMeta('master', CP, LEVELS).max, 2, 'chain_params wins for a published key');
eq(authoritativeMeta('transpose', CP, LEVELS).min, -48, 'plain level param resolves');
/* The CONCRETE repeated key. */
eq(authoritativeMeta('pad12_transpose', CP, LEVELS).min, -48, 'concrete child key resolves');
eq(authoritativeMeta('pad12_transpose', CP, LEVELS).max, 48, 'concrete child key range');
/* The ALIAS — no index. This is the one DR32's canvas actually binds, and the
 * one that was silently unresolvable before. */
eq(authoritativeMeta('pad_transpose', CP, LEVELS).min, -48, 'ALIAS child key resolves');
eq(authoritativeMeta('pad_cutoff', CP, LEVELS).max, 22000, 'alias resolves a float range too');
eq(authoritativeMeta('pad31_cutoff', CP, LEVELS).unit, 'Hz', 'unit carried across');

/* Non-matches must not resolve to something plausible-but-wrong. */
eq(authoritativeMeta('pad_nonesuch', CP, LEVELS), null, 'unknown suffix does not resolve');
eq(authoritativeMeta('padtranspose', CP, LEVELS), null, 'prefix without separator is not a child key');
eq(authoritativeMeta('', CP, LEVELS), null, 'empty key');
eq(authoritativeMeta('transpose', null, null), null, 'no metadata at all');
/* A level ENTRY is a nav row, not a param — it must never supply a range. */
eq(authoritativeMeta('pads', CP, LEVELS), null, 'a nav row is not a param');

/* -- adoption uses the module's range, not the kit's wire domain ------------ */

/* Exactly what canvaskit's prelude emits: bip()/uni() carry the 0..255 wire
 * domain, and plin's real range exists only inside the (unexported) codec. */
const KIT = { banks: [{ label: 'Pad Amp', knobs: [
    { key: 'pad_transpose', label: 'Trns', kind: 'bipolar', min: 0, max: 255, step: 1 },
    { key: 'pad_cutoff', label: 'Cut', kind: 'unipolar', min: 0, max: 255, step: 1 },
    { key: 'pad_filter_type', label: 'FTyp', kind: 'enum', min: 0, max: 3, step: 1,
      options: ['Lowpass 12dB', 'Lowpass', 'Highpass', 'Peak'] },
    { key: 'pad_mystery', label: 'Mys', kind: 'unipolar', min: 0, max: 255, step: 1 },
] }] };

const adopted = adoptKitStructure(KIT, (k) => authoritativeMeta(k, CP, LEVELS));
const cells = adopted.banks[0].cells;
const byKey = (k) => cells.find(c => c && c.key === k);

eq(byKey('pad_transpose').min, -48, 'adopted transpose takes the MODULE range, not 0');
eq(byKey('pad_transpose').max, 48, 'adopted transpose max is 48, not 255');
eq(byKey('pad_transpose').type, 'int', 'adopted transpose keeps its declared type');
eq(byKey('pad_cutoff').max, 22000, 'adopted cutoff range is engineering units');
eq(byKey('pad_cutoff').type, 'float', 'a float param is NOT flattened to int');

/* The kit still owns presentation. */
eq(byKey('pad_transpose').label, 'Trns', 'kit label survives');
eq(byKey('pad_transpose').kind, 'bip', 'kit widget choice survives for continuous cells');
/* ...but must not override a kind the TYPE decides, or the picker draws empty. */
eq(byKey('pad_filter_type').type, 'enum', 'enum stays an enum');
eq(byKey('pad_filter_type').options.length, 4, 'enum options come from the module');

/* A param nothing declares: flagged rather than presented as fact. */
eq(byKey('pad_mystery').metaGuessed, true, 'undeclared param is marked guessed');
eq(byKey('pad_transpose').metaGuessed, undefined, 'a resolved param is not marked guessed');

/* -- inferGuessedMeta: the guess learns from the first real read ------------ */

const guessed = () => ({ metaGuessed: true, type: 'int', min: 0, max: 100, step: 1 });
let c = guessed();
eq(inferGuessedMeta(c, '-12'), true, 'negative int is inferred');
eq(c.min, -12, 'negative mirrors to a symmetric range (bipolar controls)');
eq(c.max, 12, 'negative mirrors: max');
eq(c.metaGuessed, false, 'flag cleared once learned');

c = guessed();
inferGuessedMeta(c, '300');
eq(c.max, 512, 'positive takes the smallest power of two that contains it');
eq(c.min, 0, 'positive keeps 0 as the floor');

/* Values that teach us nothing must leave the guess alone. */
c = guessed(); eq(inferGuessedMeta(c, '0.5'), false, 'a real fraction leaves the guess');
c = guessed(); eq(inferGuessedMeta(c, ''), false, 'empty read leaves the guess');
c = guessed(); eq(inferGuessedMeta(c, 'Lowpass'), false, 'unparseable leaves the guess');
c = guessed(); eq(inferGuessedMeta(c, '1'), false, 'magnitude <= 1 leaves the guess');
/* And a cell that was never guessed is never rewritten by a value. */
const solid = { metaGuessed: false, type: 'int', min: -48, max: 48, step: 1 };
eq(inferGuessedMeta(solid, '-12'), false, 'a resolved cell is never re-inferred');
eq(solid.max, 48, 'resolved range untouched');

if (failed) process.exit(1);
console.log('PASS: kit adoption takes value metadata from the module, not the wire domain');
