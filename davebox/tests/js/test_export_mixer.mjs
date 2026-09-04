/* tests/js/test_export_mixer.mjs — the Ableton export's MIXER VALUE SPACE.
 *
 * These are MEASURED constants, not conventions, and every one of them fails
 * SILENTLY if it drifts: a wrong curve or a flipped sign produces an export
 * that opens fine and plays back at the wrong level or in the wrong speaker.
 * Nothing in the suite can see that, and Live reports nothing — so the
 * arithmetic is pinned here, against the numbers that came off the device.
 *
 * Provenance (docs/working/export-automation-schema.md §5e.3, §5f):
 *   volume : DECIBELS, -70 … +6, 0.0 unity. Josh set track 1 to minimum and
 *            track 2 to maximum in Set 23 on the Move; its Song.abl read
 *            -70.0 and +6.0, with untouched tracks at 0.0.
 *   pan    : -50 … +50, left negative. Confirmed by probe — ±50 read hard
 *            over, ±1 read nearly centred.
 *
 * 🐞 And the regression this file exists to prevent: the default volume was
 * `0.6137250661849976` — a normalised fader position written into a decibel
 * field, so every export was +0.61 dB. Unity is 0.0.
 */
let failed = 0;
const ok  = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e}`); failed = 1; };
function assert(c, l) { if (c) ok(l); else bad(l, 'assertion failed'); }
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

for (const fn of ['host_system_cmd','host_read_file','host_file_exists','host_write_file',
                  'host_ensure_dir','host_remove_dir','host_module_set_param','host_module_get_param',
                  'shadow_get_param','shadow_set_param','host_vol_block','host_edit_cc_block',
                  'clear_screen','print','fill_rect','stipple_rect','set_pixel','text_width',
                  'move_midi_internal_send','set_led','host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set','host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 || fn.indexOf('width') >= 0 ? '' : 0);

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const { SLOT_LEVEL_MAX } = await import('../../ui/ui_engine.mjs');
const { gainToDb, panToAbl, ABL_VOL_MIN_DB, ABL_VOL_MAX_DB, ABL_PAN_FULL } = xp.exportMixerConvForTest();

/* ---- the constants themselves ------------------------------------------ */
assert(ABL_VOL_MIN_DB === -70 && ABL_VOL_MAX_DB === 6, 'the dB range is -70 … +6, as the Move wrote it');
assert(ABL_PAN_FULL === 50, 'pan runs to ±50');

/* ---- volume: the three measured anchors -------------------------------- */
assert(near(gainToDb(1.0), 0.0), '⭑ UNITY gain is 0.0 dB — the value every untouched track carries');
assert(near(gainToDb(0.0), -70.0), 'silence is -70, not -Infinity (the format has no -inf)');
assert(near(gainToDb(SLOT_LEVEL_MAX), 6.0, 0.03),
       '⭑ davebox\'s MAXIMUM gain lands on Move\'s maximum: ' + gainToDb(SLOT_LEVEL_MAX) + ' vs +6');
assert(near(gainToDb(0.5), -6.021), 'half gain is -6.02 dB (the curve is logarithmic, not linear)');
assert(near(gainToDb(0.25), -12.041), 'quarter gain is -12.04 dB');
/* ⚠ The discriminator against a LINEAR mapping, which is the plausible wrong
 * answer: linear would put half gain at half the range, nowhere near -6. */
assert(gainToDb(0.5) < -5 && gainToDb(0.5) > -7,
       '⚠ …and NOT a linear mapping, which would put 0.5 around -32');
assert(gainToDb(99) === 6.0 && gainToDb(-1) === -70.0, 'out-of-range gains clamp to the ends');

/* ---- pan: centre, both extremes, and the SIGN -------------------------- */
assert(near(panToAbl(0.5), 0.0), 'centre pan (0.5) is 0.0');
assert(near(panToAbl(0.0), -50.0), '⭑ full LEFT is NEGATIVE fifty — the sign is not obvious by ear');
assert(near(panToAbl(1.0), 50.0), 'full right is +50');
assert(near(panToAbl(0.75), 25.0), 'three-quarters right is +25 (pan IS linear, unlike volume)');
assert(panToAbl(9) === 50 && panToAbl(-9) === -50, 'out-of-range pans clamp');

/* ---- the default mixer, i.e. the bug that started this ------------------ */
const m = xp.exportDefaultMixerForTest();
assert(m.volume === 0.0,
       '🐞 the default track volume is UNITY (0.0 dB), not the old normalised 0.6137250661849976');
assert(m.volume !== 0.6137250661849976, '…and specifically not that value again');
assert(m.pan === 0.0, 'the default pan is centre');
assert(Array.isArray(m.sends), 'sends is an array (empty until the return tracks exist)');

if (failed) { console.log('FAIL: export mixer value space'); process.exit(1); }
console.log('PASS: the export\'s mixer value space — dB volume, ±50 pan, unity default');
}
main().catch(e => { console.error(e); process.exit(1); });
