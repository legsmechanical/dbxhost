/* tests/js/test_int_knob_bands.mjs — A MACRO AND THE MODULE EDITOR STEP AN INT
 * THE SAME WAY.
 *
 * dAVEBOx's macros and bank cells count detents with pageIntDetents
 * (ui_engine.mjs); the module editor counts them with the shared engine's
 * detentsPerStep. They are two functions over one rule, and the day they
 * differ a parameter feels one way on its own page and another on the macro
 * that points at it. The rule itself (which ranges take the list's gate) is
 * pinned on the host side, tests/host/test_int_knob_bands.sh. */
import { pageIntDetents } from '../../ui/ui_engine.mjs';
import { detentsPerStep, ENUM_DELTA_DIV } from '/data/UserData/schwung/shared/knob_engine.mjs';

let bad = 0;
const diffs = [];
for (let min = -30; min <= 2; min++)
    for (let span = 0; span <= 140; span++) {
        const max = min + span;
        const a = pageIntDetents(min, max), b = detentsPerStep({ type: 'int', min, max });
        if (a !== b && diffs.length < 5) diffs.push('[' + min + '..' + max + '] macro ' + a + ', editor ' + b);
        if (a !== b) bad++;
    }
if (bad) { console.log('  FAIL — ' + bad + ' ranges step differently on a macro and in the editor: ' + diffs.join('; ')); process.exit(1); }
console.log('  ok   — every int range from 1 to 141 values steps the same on a macro and in the editor');
if (pageIntDetents(-12, 12) !== ENUM_DELTA_DIV || pageIntDetents(-24, 24) !== ENUM_DELTA_DIV) {
    console.log('  FAIL — a ±12 / ±24 transpose is not on the list gate'); process.exit(1);
}
if (pageIntDetents(0, 127) !== 1) { console.log('  FAIL — 0..127 is gated'); process.exit(1); }
console.log('  ok   — ±12 and ±24 take four detents a value; 0..127 is one a detent');
console.log('test_int_knob_bands: all ok');
