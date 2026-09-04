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
assert(Array.isArray(m.sends) && m.sends.length === 2,
       'the default mixer now carries TWO send entries — one per return track');
assert(m.sends.every(x => x.amount === -70),
       '…both silent, so a default export sends nothing anywhere');

/* ---- the two return tracks, and the sends that depend on them ----------- */
/* ⭑ Josh's ruling: an export carries two EMPTY return tracks so the two sends
 * populate. Live asserts sends().size() == numReturnTracks, so these two
 * numbers are a CONTRACT — if they ever disagree, Live refuses the whole set
 * and the export is dead on arrival, with no partial failure to notice. */
const R = xp.exportReturnsForTest();
assert(R.names.length === 2, 'exactly TWO return tracks — davebox has Send A and Send B');
assert(R.tracks.length === R.sends.length,
       '⭑⭑ the return count and the per-track send count MATCH — Live refuses the set otherwise');
assert(R.tracks.every(t => Array.isArray(t.devices) && t.devices.length === 0),
       '⭑ the returns are EMPTY (Josh) — verified by probe that Live accepts a return with no device, ' +
       'unlike an ordinary track');
assert(R.tracks.every(t => t.mixer && t.mixer.volume === 0.0 && Array.isArray(t.mixer.sends)),
       'a return track has its own mixer at unity, and sends of its own');
assert(R.tracks[0].name === 'A Reverb' && R.tracks[1].name === 'B Delay', 'named A and B');

/* A send amount is dB on the SAME scale as volume — measured twice: P10a wrote
 * 0.0/0.5/1.0/50.0 and Live read all four as MAXIMUM (everything >= 0 clamps),
 * then P11 wrote -70/-12/-6/0 and they read off / low / half / full. */
assert(R.sends.every(s2 => s2.isEnabled === true), 'both sends are enabled');
assert(R.sends.every(s2 => s2.amount === -70), 'and silent by default (-70 dB, not 0 which is FULL send)');
const sf = R.sendsFor([1.0, 0.5]);
assert(near(sf[0].amount, 0.0) && near(sf[1].amount, -6.021),
       '⭑ a send level converts through the SAME dB curve as volume, got ' + JSON.stringify(sf.map(x => x.amount)));
/* ⚠ The trap this pins: 0 dB is FULL send, not silence. Writing davebox's
 * default send level (gain 0) as a raw 0 would open every send wide. */
assert(R.sendsFor([0, 0])[0].amount === -70,
       '⚠ a gain of ZERO is -70 dB (silent) — NOT 0.0, which would be a full send');

/* ---- reading davebox's automation dump ---------------------------------- */
/* ⚠ SLOT_LEVEL_MAX must be IMPORTED here, not just mentioned in a comment —
 * `node --check` passes either way and the failure is a runtime ReferenceError
 * inside the export, i.e. an export that silently produces nothing. */
const PA = xp.exportPaForTest();
assert(PA.PA_VAL_MAX === 16383, 'values are 14-bit normalized, matching dsp/seq8_param_auto.h');
assert(PA.PA_TICKS_PER_BEAT === 96, 'and ticks are 96 to the beat, matching the note render');

/* the parser */
const dump = [
  '2 0 2:slot:volume 1 0 0|0:16383 192:8192 384:0 ',
  '2 0 2:slot:pan 1 0 0|0:0 384:16383 ',
  '3 1 at 1 0 0|0:0 96:16383 ',
  '3 1 pb 1 0 0|0:8192 96:0 ',
  '2 0 2:synth:cutoff 1 0 0|0:100 ',      /* a chain param — must be DROPPED */
  '2 0 cc:11 1 0 0|0:100 ',               /* a CC — must be DROPPED */
  '2 0 seq:2:noteFX_gate 1 0 0|0:100 ',   /* a bank param — must be DROPPED */
  'this line is torn and has no bar',
].join('\n');
const lanes = PA.parsePaDump(dump);
assert(lanes.length === 7, 'parsed every well-formed lane and dropped the torn one, got ' + lanes.length);
assert(lanes[0].track === 2 && lanes[0].clip === 0 && lanes[0].target === '2:slot:volume', 'lane header parsed');
assert(lanes[0].points.length === 3 && lanes[0].points[1].tick === 192 && lanes[0].points[1].val === 8192,
       'points parsed as {tick, val}');

/* ⭑ classification IS the export's scope ruling, in code */
const cls = (t) => PA.classifyPaTarget(t);
assert(cls('2:slot:volume').kind === 'mixer' && cls('2:slot:volume').field === 'volume', 'a slot level is a mixer envelope');
assert(cls('2:move_fx:3:pan').field === 'pan', '…and so is a Move bus level');
assert(cls('at').kind === 'note' && cls('at').key === 'Pressure', 'aftertouch is per-note Pressure');
assert(cls('pb').kind === 'note' && cls('pb').key === 'PitchBend', 'pitch bend is per-note PitchBend');
assert(cls('cc:11') === null, '⭑ a CC is DROPPED — the format has no clip-level MIDI target');
assert(cls('2:synth:cutoff') === null, '⭑ a chain param is DROPPED — no Schwung module exists in Live');
assert(cls('seq:2:noteFX_gate') === null, '⭑ a bank param is DROPPED — nothing in Live receives it');

/* value conversion, against the measured constants */
const vol = cls('2:slot:volume'), pan = cls('2:slot:pan'), snd = cls('2:slot:send_a');
assert(near(PA.paValueFor(vol, 16383), 6.0, 0.03), 'a full-scale volume point is +6 dB (davebox gain 2.0)');
assert(near(PA.paValueFor(vol, 8192), 0.0, 0.01), '⭑ HALF-scale is UNITY — davebox gain 1.0 is 0 dB, not half a dB');
assert(PA.paValueFor(vol, 0) === -70, 'a zero point is silence');
assert(near(PA.paValueFor(pan, 0), -50) && near(PA.paValueFor(pan, 16383), 50), 'pan spans ±50');
assert(near(PA.paValueFor(pan, 8192), 0, 0.01), 'and centres at 0');
assert(near(PA.paValueFor(snd, 16383), 0.0), 'a full send is 0 dB');
assert(PA.paValueFor(snd, 0) === -70, 'a zero send is -70, not 0 (which would be FULL)');
assert(PA.paValueFor(cls('at'), 16383) === 127 && PA.paValueFor(cls('at'), 0) === 0, 'aftertouch is 0..127, 1:1');
assert(near(PA.paValueFor(cls('pb'), 8192), 0, 1),
       '⭑ pitch bend CENTRES at 0 — davebox stores 8192 centre, Live wants signed');
assert(near(PA.paValueFor(cls('pb'), 0), -8192, 1) && near(PA.paValueFor(cls('pb'), 16383), 8191, 1),
       '…and spans ±8192 signed, which probe P8a confirmed and P8b (unsigned) disproved');

/* ---- the emitters: envelopes and per-note ------------------------------- */
/* ⭑ Ids are DOCUMENT-WIDE and sequential from 2 — grooveId takes 1, and real
 * Move files run 2 upward straight ACROSS track boundaries. A per-track counter
 * would collide and Live would resolve the wrong parameter, silently. */
const volLane = { track: 2, clip: 0, target: '2:slot:volume',
                  points: [{tick:0,val:16383},{tick:192,val:8192},{tick:384,val:0}] };
const bps = PA.paBreakpoints(volLane, cls('2:slot:volume'));
assert(bps.length === 3, 'one breakpoint per stored point');
assert(near(bps[0].time, 0) && near(bps[1].time, 2) && near(bps[2].time, 4),
       '⭑ times are CLIP-RELATIVE BEATS — tick 192 is beat 2 at 96 ticks/beat, got ' +
       JSON.stringify(bps.map(b2 => b2.time)));
assert(near(bps[0].value, 6, 0.03) && near(bps[1].value, 0, 0.01) && bps[2].value === -70,
       'and values run +6 dB -> unity -> silence');

/* sampling between points, which is what a per-note slice depends on */
assert(PA.paSampleAt(volLane.points, 96) === 12287.5, 'a lane samples linearly between its points');
assert(PA.paSampleAt(volLane.points, -50) === 16383, 'before the first point it holds the first value');
assert(PA.paSampleAt(volLane.points, 9999) === 0, 'and after the last, the last');

/* ⭑⭑ THE CHANNEL-CURVE-ON-EVERY-NOTE TRICK (Josh): AT and PB are channel-level
 * on davebox, so one curve is stamped on EVERY note. A note starting mid-sweep
 * must START AT THE RIGHT VALUE — that is the whole point of re-basing, and
 * the thing a naive "write the lane from 0" would get wrong. */
const notes = [{ noteNumber: 60, startTime: 0, duration: 1 },
               { noteNumber: 64, startTime: 2, duration: 1 }];
const atLane = { track: 3, clip: 0, target: 'at',
                 points: [{tick:0,val:0},{tick:384,val:16383}] };   /* 0 -> 127 over 4 beats */
PA.paAttachPerNote(notes, atLane, cls('at'), 2);
assert(notes[0].automations && notes[0].automations.Pressure, 'note 1 got Pressure');
assert(notes[1].automations && notes[1].automations.Pressure, 'note 2 got it too — EVERY note carries the channel curve');
const n2 = notes[1].automations.Pressure;
assert(near(n2[0].time, 0), 'note 2\'s automation is re-based to its OWN start');
assert(n2[0].value > 50,
       '⭑ …and starts at the value the channel curve HAD THERE (~64), not at 0 — got ' + n2[0].value);
assert(notes[0].automations.Pressure[0].value === 0, 'while note 1, at the start, does begin at 0');

/* pitch bend scales into Live's fixed ±48 span; ±2 semis is a 24th of it */
const pbNotes = [{ noteNumber: 60, startTime: 0, duration: 4 }];
PA.paAttachPerNote(pbNotes, { track: 1, clip: 0, target: 'pb',
                              points: [{tick:0,val:16383}] }, cls('pb'), 2);
const pbv = pbNotes[0].automations.PitchBend[0].value;
assert(near(pbv, 8191 * 2 / 48, 1),
       '⭑ a full bend at ±2 semitones is ~341, not 8191 — Live\'s span is a fixed ±48 (probe P9a)');

/* ---- WHERE the id goes, which is the whole ballgame --------------------- */
/* ⭑⭑ The id belongs on THE THING THAT HOLDS THE VALUE, never the container.
 * ⚠ Getting this wrong on ONE field kills the ENTIRE document — Live answers
 * "Error loading document: Unknown id", refuses the whole set, and logs
 * nothing. There is no partial load and no clue which field did it. */
const stamped = xp.exportStampForTest(
    { pan: 0.0, 'solo-cue': false, speakerOn: true, volume: -3.0,
      sends: [{ isEnabled: true, amount: -70 }, { isEnabled: true, amount: -12 }] },
    { volume: 2, pan: 3, send_a: 4, send_b: 5 });
assert(stamped.volume && stamped.volume.value === -3.0 && stamped.volume.id === 2,
       'volume becomes {value, id}, KEEPING its resting value');
assert(stamped.pan && stamped.pan.value === 0.0 && stamped.pan.id === 3, 'pan likewise');
assert(stamped.sends[0].amount && typeof stamped.sends[0].amount === 'object',
       '⭑ a send stamps its AMOUNT, not the send entry — the entry keeps {isEnabled, amount}');
assert(stamped.sends[0].amount.value === -70 && stamped.sends[0].amount.id === 4,
       '…as {value, id}, keeping the resting amount, got ' + JSON.stringify(stamped.sends[0]));
assert(stamped.sends[1].amount.value === -12 && stamped.sends[1].amount.id === 5, 'and send B');
assert(stamped.sends[0].id === undefined,
       '⚠ the id is NOT on the send entry — that shape loaded as "Unknown id" and killed the set');
assert(stamped.sends[0].isEnabled === true, 'isEnabled survives the stamp');
/* stamping twice must be idempotent — a re-export must not nest {value:{value:…}} */
const twice = xp.exportStampForTest(stamped, { volume: 9, send_a: 8 });
assert(twice.volume.value === -3.0 && twice.volume.id === 9, 're-stamping keeps the value, not a nested object');
assert(twice.sends[0].amount.value === -70 && twice.sends[0].amount.id === 8, '…and the same for a send');

/* ---- what an exported Schwung track is CALLED --------------------------- */
/* Josh: put the instrument module and preset in the title. A Schwung track
 * exports as a Drift placeholder, so the NAME is the only surviving record of
 * what the track actually was — and the old `SCH-<patch name>` was usually just
 * `SCH-`, because the chain config carries only {name, channel,
 * forward_channel} and that name is empty unless somebody set one. */
const nm = xp.exportSchwungNameForTest;   /* (mod, internal, rec, patchName, dbName) */
assert(nm('nusaw', 'Big Lead', null, '', 'dB 3') === 'SCH-nusaw - Big Lead',
       '⭑ the MODULE\'S OWN patch name is what Josh expected to see');
assert(nm('nusaw', '', { name: 'Saved Thing', mod: 'nusaw' }, '', 'dB 3') === 'SCH-nusaw - Saved Thing',
       '…and a davebox user-preset file is the fallback when the module exposes none');
assert(nm('nusaw', 'Internal', { name: 'Saved', mod: 'nusaw' }, '', 'dB 3') === 'SCH-nusaw - Internal',
       'with both, the module\'s own patch wins');
assert(nm('nusaw', '', null, '', 'dB 3') === 'SCH-nusaw',
       '⚠ module alone is the COMMON case — only ~4 of 30 modules expose a preset bank at all');
assert(nm('nusaw', '   ', null, '', 'dB 3') === 'SCH-nusaw', 'a blank patch name is not a name');
assert(nm('', '', null, 'Patch7', 'dB 3') === 'SCH-Patch7', 'no module: the old chain-patch fallback survives');
assert(nm('', '', null, '', 'dB 3') === 'dB 3', 'and with nothing at all, the dB N placeholder');
/* ⚠ THE GUARD: a preset record made against a DIFFERENT module must not label
 * this one — the same rule ui_sound's presetRecord() applies. */
assert(nm('obxd', '', { name: 'Big Lead', mod: 'nusaw' }, '', 'dB 3') === 'SCH-obxd',
       '⭑ a STALE preset record is dropped — the module is shown alone, not mislabelled');
assert(nm('obxd', '', { name: 'Sub', mod: 'obxd' }, '', 'dB 3') === 'SCH-obxd - Sub', '…while a matching one is used');
/* ⭑ And the hook must BE the function the export calls, not a copy of it. */
const src = (await import('node:fs')).readFileSync('ui/ui_export.mjs', 'utf8');
assert(/return schwungTrackName\(mod, internal, rec, patchName, dbName\);/.test(src),
       'the test hook delegates to the real function');
assert(/const name = schwungTrackName\(/.test(src) && /'preset_name'/.test(src),
       '…and resolveTrack calls it, reading the module\'s preset_name');

/* ---- the placeholder rack is DEACTIVATED -------------------------------- */
/* Josh: a dummy stands in for an instrument that could not come across, so it
 * must not PLAY. An enabled Drift pad sounds plausible while being no part of
 * the music, which is worse than silence. */
assert(/dev\.parameters\.Enabled = false;/.test(src),
       '⭑ every placeholder rack is written with its device activator OFF');
assert(/function dummy\(name, color\)[\s\S]{0,400}?Enabled = false/.test(src),
       '…and it happens in dummy(), so it covers Schwung, Move-unmatched, Ext AND Conductor');

if (failed) { console.log('FAIL: export mixer value space'); process.exit(1); }
console.log('PASS: the export\'s mixer value space — dB volume, ±50 pan, unity default');
}
main().catch(e => { console.error(e); process.exit(1); });
