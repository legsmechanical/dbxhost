/* tests/js/test_export_tile.mjs — AN AUTOMATION LANE'S CYCLE, LAID ACROSS THE
 * EXPORTED CLIP.
 *
 * A lane with its own cycle — every drum lane now (Josh, 2026-09-24: "drum
 * lanes can be any length, not just mulitiples of a bar"), and a melodic lane
 * with its own Loop — was exported ONCE: Live then held its last value for the
 * rest of the clip, so a 13-step hat sweep under a 4-bar clip played once and
 * went flat. The dump now carries the lane's clock (window, where it is at the
 * export's first tick, rate) and the export tiles the cycle across the clip.
 *
 * Pinned on the real export helpers: the dump parse, the tiling (13 steps over
 * 4 bars, a melodic 8-step Loop over 16, Rate x2, a lane that starts mid-cycle),
 * the curve's values at both clip edges, and the old dump shape untouched.
 */
let failed = 0;
const ok  = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e}`); failed = 1; };
function assert(c, l, why) { if (c) ok(l); else bad(l, why || 'assertion failed'); }

for (const fn of ['host_system_cmd','host_read_file','host_file_exists','host_write_file',
                  'host_ensure_dir','host_remove_dir','host_module_set_param','host_module_get_param',
                  'shadow_get_param','shadow_set_param','host_vol_block','host_edit_cc_block',
                  'clear_screen','print','fill_rect','stipple_rect','set_pixel','text_width',
                  'move_midi_internal_send','set_led','host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set','host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 || fn.indexOf('width') >= 0 ? '' : 0);

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const PA = xp.exportPaForTest();
const ticks = (pts) => pts.map(p => Math.round(p.tick * 1000) / 1000);

/* A 13-step drum cycle (156 ticks at 1/32... here 13 x 24 = 312), from 0: a
 * point at 0 (value 100) and one at 156 (value 900), closed by the trail at
 * 312 carrying the lead's value. */
const lane13 = PA.parsePaDump('0 0 0:slot:pan 3 312 0 100 0 312 0 1 1|0:100 156:900 312:100 \n')[0];
assert(lane13 && lane13.clock && lane13.clock.wl === 312 && lane13.clock.p0 === 0,
       'the dump\'s clock is parsed: window 0+312, starting at 0, x1', JSON.stringify(lane13));
const t13 = PA.paTile(lane13, 1536);
const want13 = [0, 156, 312, 468, 624, 780, 936, 1092, 1248, 1404, 1536];
assert(JSON.stringify(ticks(t13)) === JSON.stringify(want13),
       '⭐ the 13-step cycle repeats at 312, 624, 936, 1248 across a 4-bar (1536) clip, then stops at its end',
       JSON.stringify(ticks(t13)));
const at = (pts, t) => PA.paSampleAt(pts, t);
assert(t13[t13.length - 1].val === at(t13, 1536) && Math.abs(t13[t13.length - 1].val - (100 + 800 * (156 - (1536 - 1404)) / 156)) < 1e-6,
       'the last breakpoint is the curve\'s own value at the clip end (mid-ramp), not a held value',
       JSON.stringify(t13.slice(-2)));
const bp = PA.paBreakpoints({ points: t13 }, { field: 'pan' });
assert(bp.length === t13.length && bp[1].time === 156 / 96, 'and reaches Live in beats');

/* A melodic lane with its own 8-step Loop, over a 16-step clip: twice. */
const mel = PA.parsePaDump('1 0 1:slot:volume 3 192 0 100 0 192 0 1 1|0:0 96:16383 192:0 \n')[0];
assert(JSON.stringify(ticks(PA.paTile(mel, 384))) === JSON.stringify([0, 96, 192, 288, 384]),
       '⭐ a melodic 8-step Loop tiles twice over its 16-step clip', JSON.stringify(ticks(PA.paTile(mel, 384))));

/* Rate x2: the 312-tick cycle passes every 156 export ticks. */
const fast = PA.parsePaDump('0 0 0:slot:pan 3 312 6 100 0 312 0 2 1|0:100 156:900 312:100 \n')[0];
assert(JSON.stringify(ticks(PA.paTile(fast, 312))) === JSON.stringify([0, 78, 156, 234, 312]),
       'Rate x2 halves the period', JSON.stringify(ticks(PA.paTile(fast, 312))));

/* A lane that starts MID-cycle (p0 = 100 of a 0..312 window): its first
 * breakpoint is where it really is at tick 0. */
const mid = PA.parsePaDump('0 0 0:slot:pan 3 312 0 100 0 312 100 1 1|0:100 156:900 312:100 \n')[0];
const tm = PA.paTile(mid, 312);
assert(Math.abs(tm[0].val - (100 + 800 * 100 / 156)) < 1e-6 && Math.abs(tm[1].tick - 56) < 1e-9,
       'a lane starting at lane tick 100: tick 0 carries its value there, and its 156 point lands at export 56',
       JSON.stringify(tm.slice(0, 3)));

/* ⭐ THE PATH: the clip decorator — what buildClip calls — hangs the TILED
 * breakpoints on the envelope, not the one-pass points. */
{
    const ctx = { paLanes: [lane13], paMixerIds: [{ pan: 7 }], paBendSemis: [] };
    PA.paDecorateClip(0, 0, [], ctx, 1536);
    const env = ctx.paEnvelopes[0];
    assert(env && env.parameterId === 7 && env.breakpoints.length === want13.length
           && env.breakpoints[2].time === 312 / 96,
           '⭐ the exported envelope carries the tiled cycle (11 breakpoints, the second pass at beat 3.25)',
           JSON.stringify(env));
}

/* ⭐ WRAP: RESET — the lane HOLDS its last value to the loop end, then JUMPS
 * back to rest (playback: "reset means reset"). The dump (pa_export_points)
 * carries the held trail and, Smooth off, the rest held up to the first
 * point; the tiling must keep both halves of each jump, not merge them into a
 * slide. An 8-step lane (192) over 16 steps: rest 50, first point 96 = 100,
 * 144 = 200, trail 192 = 200. */
{
    const rs = PA.parsePaDump('1 0 1:slot:volume 9 192 0 100 0 192 0 1 1|0:50 96:50 96:100 144:200 192:200 \n')[0];
    const tr = PA.paTile(rs, 384);
    const got = tr.map(p => p.tick + ':' + p.val).join(' ');
    const want = '0:50 96:50 96:100 144:200 192:200 192:50 288:50 288:100 336:200 384:200';
    assert(got === want, '⭐ Reset: each pass holds 200 to its end and the next starts at rest 50 — a jump at 192, kept', got);
    assert(PA.paSampleAt(tr, 191) === 200 && PA.paSampleAt(tr, 193) === 50,
           'Reset: just before the loop end it plays 200, just after it 50 (no slide from 144 down to the next lead)');
    assert(tr[0].val === 50, 'Reset: the clip starts at rest, not on the previous pass\'s held value', JSON.stringify(tr.slice(0, 2)));
    const bp = PA.paBreakpoints({ points: tr }, { field: 'volume' });
    const times = bp.map(b => b.time);
    assert(times.every((t, i) => i === 0 || t > times[i - 1]),
           'Reset: every breakpoint time is distinct (the first of a jump is written a hair earlier)', JSON.stringify(times));
    assert(Math.abs(times[4] - 2) < 1e-4 && times[5] === 2 && bp[4].value !== bp[5].value,
           'Reset: the jump at beat 2 stays vertical', JSON.stringify(bp.slice(3, 7)));
    /* Aftertouch rides the notes: a note across the jump samples both sides. */
    const notes = [{ startTime: 0, duration: 4 }];
    PA.paAttachPerNote(notes, { points: tr }, { kind: 'note', key: 'Pressure', max: 127 }, 2);
    const au = notes[0].automations.Pressure;
    const i2 = au.findIndex(a => a.time === 2);
    assert(i2 >= 0 && au[i2 + 1] && au[i2 + 1].time < 2.001 && au[i2].value > au[i2 + 1].value,
           'Reset: a note across the jump drops right after beat 2, not ramping to beat 3', JSON.stringify(au));
}
/* CONTROL: Carry's trail and the next lead carry the SAME value — one breakpoint. */
{
    const cr = PA.parsePaDump('1 0 1:slot:volume 1 192 0 100 0 192 0 1 1|0:200 96:100 144:200 192:200 \n')[0];
    const tc = PA.paTile(cr, 384).map(p => p.tick);
    assert(tc.filter(t => t === 192).length === 1, 'CONTROL: Carry\'s seam is one breakpoint', JSON.stringify(tc));
}

/* The old dump shape (no clock): the raw points, as before. */
const old = PA.parsePaDump('0 0 0:slot:pan 3 0 0 100|0:100 156:900 \n')[0];
assert(old && old.clock === null && PA.paTile(old, 1536) === old.points, 'CONTROL: a lane with no clock keeps its raw points');

if (failed) { console.error('FAIL: test_export_tile'); process.exit(1); }
console.log('PASS: test_export_tile');
}
main().catch(e => { console.error(e); process.exit(1); });
