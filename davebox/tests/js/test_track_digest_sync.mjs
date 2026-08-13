/* tests/js/test_track_digest_sync.mjs — the project readback must come out of
 * the batched digest, and must land the same values it would have read one at a
 * time.
 *
 * Why this exists: every param read costs a full SPI frame (~2.9 ms measured),
 * because requests go through a single-slot mailbox served once per audio
 * frame. A project resync did ~1,468 of them — a 4.3 s tick with the UI frozen.
 * The DSP now serves a whole track's readback as one `tN_digest` blob.
 *
 * Two properties, and the test is worthless without both:
 *   1. The round trips actually collapse. A digest that is fetched and then
 *      ignored looks identical from the outside, just slow.
 *   2. The values still arrive. A fast resync that mirrors the wrong project is
 *      worse than a slow correct one.
 * It also pins the fallback: a key the digest does not carry must still be
 * asked for individually, because that is what makes DSP/UI key drift cost a
 * frame instead of correctness.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, extra) { console.error(`  FAIL — ${label}${extra ? ': ' + extra : ''}`); failed = 1; }

const NUM_TRACKS = 8, NUM_CLIPS = 16, SEQ_STEPS = 256;  /* DSP array size */

/* A digest shaped exactly like the DSP's: `<full key>=<value>` per line, and
 * carrying the SAME key set (see TRACK_KEYS / CLIP_KEYS in seq8.c's
 * `tN_digest`). Mirroring the real list is the point — if the two drift, the
 * read counts below rise and this test says so, which is exactly the signal we
 * want, since drift is a silent slowdown rather than a failure on hardware.
 * Track 0 clip 1 carries distinctive values so we can prove they land. */
const TRACK_KEYS = {
    active_clip: (t) => (t === 0 ? 1 : 0),
    pad_octave: (t) => (t === 0 ? 3 : 2),
    channel: (t) => t + 1,
    diq: () => 0,
    midi_to: () => 0,
    pad_mode: (t) => (t === 1 ? 1 : 0),   /* track 1 is a DRUM track */
    route: () => 'schwung',
    track_looper: () => 0,
    track_vel_override: () => 0,
    tarp_si: () => 0,
    tarp_sll: () => 0,
    tarp_sv: () => 100,
    drum_r2rt: () => 24,
    cc_assigns: () => '1 2 3 4 5 6 7 8',
    cc_types: () => '0 0 0 0 0 0 0 0',
    delay_clock_fb: () => 0,
    drum_meta: () => new Array(32).fill('0 16 0 24').join('|'),
    'lgto_apply_factor': () => 0,
    'noteFX_octave': () => 0,
    'noteFX_offset': () => 0,
    'noteFX_velocity': () => 0,
    'quantize': () => 0,
    'noteFX_length_mode': () => 0,
    'noteFX_gate': () => 0,
    'noteFX_random': () => 0,
    'harm_octaver': () => 0,
    'harm_interval1': () => 0,
    'harm_interval2': () => 0,
    'harm_interval3': () => 0,
    'delay_time': () => 0,
    'delay_level': () => 0,
    'delay_repeats': () => 0,
    'delay_vel_fb': () => 0,
    'delay_pitch_fb': () => 0,
    'delay_gate_fb': () => 0,
    'delay_retrig': () => 0,
    'delay_pitch_random': () => 0,
    'tarp_style': () => 0,
    'tarp_rate': () => 0,
    'tarp_octaves': () => 0,
    'tarp_gate': () => 0,
    'tarp_steps_mode': () => 0,
    'tarp_retrigger': () => 0,
    'tarp_sync': () => 0,
    'tarp_latch': () => 0,
};
const CLIP_KEYS = {
    steps: (t, c) => ((t === 0 && c === 1)
        ? '1' + '0'.repeat(SEQ_STEPS - 1)
        : '0'.repeat(SEQ_STEPS)),
    length: (t, c) => ((t === 0 && c === 1) ? 12 : 16),
    loop_start: (t, c) => ((t === 0 && c === 1) ? 4 : 0),
    tps: () => 24,
    cc_lane_loops: () => new Array(32).fill(0).join(' '),
    pfx_snapshot: () => new Array(24).fill(0).join(' '),
    cc_auto_bits: () => 0,
    at_has: () => 0,
    cc_rest: () => new Array(8).fill(255).join(' '),
    drum_has_content: () => 0,
};

function digestFor(t) {
    const lines = [];
    for (const [k, f] of Object.entries(TRACK_KEYS)) lines.push(`t${t}_${k}=${f(t)}`);
    for (let c = 0; c < NUM_CLIPS; c++)
        for (const [k, f] of Object.entries(CLIP_KEYS)) lines.push(`t${t}_c${c}_${k}=${f(t, c)}`);
    return lines.join('\n') + '\n';
}

/* Count what the module asks for, and answer. */
let reads = [];
function installHost() {
    reads = [];
    globalThis.host_module_get_param = (key) => {
        reads.push(key);
        const m = /^t(\d)_digest$/.exec(key);
        if (m) return digestFor(parseInt(m[1], 10));
        return '';   /* anything not in the digest: answered live, cheaply */
    };
}

globalThis.host_module_set_param = () => {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
/* Host bindings the sync touches on its way through (Link Audio routing is
 * re-derived once every track's route is known). */
globalThis.shadow_set_param = () => 0;
globalThis.shadow_get_param = () => '';
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
installHost();

async function main() {
    const { S } = await import('../../ui/ui_state.mjs');
    const bridge = await import('../../ui/ui_dsp_bridge.mjs');

    /* ui.js builds bankParams at init from the BANKS table; readTrackConfig
     * writes into bank 7, so a bare S would throw before reaching anything this
     * test is about. Shape only — the values are irrelevant here. */
    S.bankParams = Array.from({ length: NUM_TRACKS }, () =>
        Array.from({ length: 8 }, () => new Array(7).fill(0)));

    installHost();
    try {
        bridge.syncClipsFromDsp();
    } catch (e) {
        bad('syncClipsFromDsp threw', e && e.stack ? e.stack : e);
        return;
    }

    /* 1. the round trips collapsed */
    const digestReads = reads.filter((k) => /_digest$/.test(k)).length;
    const clipReads = reads.filter((k) => /^t\d_c\d+_/.test(k)).length;
    digestReads === NUM_TRACKS
        ? ok(`fetched one digest per track (${digestReads})`)
        : bad(`expected ${NUM_TRACKS} digest reads, saw ${digestReads}`);
    clipReads === 0
        ? ok('no per-clip round trips at all — every clip field came from the digest')
        : bad(`${clipReads} per-clip reads still went to the DSP`, reads.filter((k) => /^t\d_c\d+_/.test(k)).slice(0, 3).join(', '));
    if (process.env.DIGEST_MISSES) {
        const misses = {};
        for (const k of reads) {
            if (/_digest$/.test(k)) continue;
            misses[k.replace(/^t\d+_c\d+_/, 'cN_').replace(/^t\d+_/, 'tN_')] = (misses[k.replace(/^t\d+_c\d+_/, 'cN_').replace(/^t\d+_/, 'tN_')] || 0) + 1;
        }
        console.log('  live reads by key shape:', JSON.stringify(misses));
    }
    reads.length < 200
        ? ok(`total reads ${reads.length} (was ~1,468 before batching)`)
        : bad(`still ${reads.length} reads — the digest is not being consulted`);

    /* 2. the values landed */
    S.clipLength[0][1] === 12
        ? ok('an edited clip length came through the digest')
        : bad(`clipLength[0][1] = ${S.clipLength[0][1]}, want 12`);
    S.clipLoopStart[0][1] === 4
        ? ok('loop start came through')
        : bad(`clipLoopStart[0][1] = ${S.clipLoopStart[0][1]}, want 4`);
    S.clipSteps[0][1][0] === 1 && S.clipSteps[0][1][5] === 0
        ? ok('the step map came through')
        : bad(`clipSteps[0][1] = ${S.clipSteps[0][1].slice(0, 6)}`);
    S.trackActiveClip[0] === 1
        ? ok('track-level values came through')
        : bad(`trackActiveClip[0] = ${S.trackActiveClip[0]}, want 1`);
    S.clipLength[3][2] === 16
        ? ok('other tracks got their own digest, not track 0\'s')
        : bad(`clipLength[3][2] = ${S.clipLength[3][2]}, want 16`);

    /* 3. the fallback — a key the digest omits must still be asked for. This is
     *    what keeps DSP/UI key drift a performance question, not a correctness
     *    one. `key`/`scale` are global (never in a track digest). */
    reads.includes('key') && reads.includes('scale')
        ? ok('keys outside the digest still fall through to a live read')
        : bad('global keys were not read at all — the fallback is gone');

    /* 4. the map must not outlive the call: a stale digest would answer for a
     *    project that is no longer loaded. */
    installHost();
    bridge.readBankParams(0, 2);
    reads.some((k) => /^t0_/.test(k) && !/_digest$/.test(k))
        ? ok('after the sync, reads go live again (the digest was released)')
        : bad('a later read was still served from the digest — it outlived the sync');

    if (failed) process.exit(1);
    console.log('PASS: the project readback is batched, correct, and released');
}

main();
