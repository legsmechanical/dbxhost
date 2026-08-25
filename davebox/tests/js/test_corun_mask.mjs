/* tests/js/test_corun_mask.mjs — the co-run keep-mask declares the RULED
 * split (CORUN_PASSTHROUGH.md, Josh 2026-08-24), with the real group bits.
 *
 * The trap this pins: bit 3 is the RETIRED single-bit TRANSPORT — the host
 * classifier never returns it, so "keeping" it keeps nothing. davebox
 * carried it from the mask's birth until 2026-08-24, and Play/Rec/Loop were
 * silently ceded to Move during co-run while the mask READ as if transport
 * was kept. A mask is a contract with a header file; test the bits, not the
 * names. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

let opened = null;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = (id, opts) => { opened = { id, opts }; return true; };
globalThis.host_close_service = () => true;
globalThis.move_midi_inject_to_move = () => {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

/* shadow_constants.h — the authority. Values copied, then PINNED against the
 * header text below so a drift fails here instead of on the device. */
const GRP = { PADS: 1 << 1, STEPS: 1 << 2, DEAD_TRANSPORT: 1 << 3, JOG: 1 << 4,
    TRACK: 1 << 5, KNOBS: 1 << 6, MASTER: 1 << 7, SHIFT: 1 << 8, BACK: 1 << 9,
    MENU: 1 << 10, TOUCH: 1 << 11, MUTE: 1 << 12, PLAY: 1 << 13, REC: 1 << 14,
    KEEP_BACK: 1 << 15, SAMPLE: 1 << 16, LOOP: 1 << 17, COPY: 1 << 18, DELETE: 1 << 19 };

async function main() {
const { readFileSync } = await import('fs');
const { S } = await import('../../ui/ui_state.mjs');
const corun = await import('../../ui/ui_corun.mjs');

step('header pin: the copied group values match src/host/shadow_constants.h', () => {
    const h = readFileSync('../src/host/shadow_constants.h', 'utf8');
    for (const [name, val, macro] of [
        ['SHIFT', GRP.SHIFT, 'CORUN_GRP_SHIFT'], ['PLAY', GRP.PLAY, 'CORUN_GRP_PLAY'],
        ['REC', GRP.REC, 'CORUN_GRP_REC'], ['SAMPLE', GRP.SAMPLE, 'CORUN_GRP_SAMPLE'],
        ['LOOP', GRP.LOOP, 'CORUN_GRP_LOOP'], ['COPY', GRP.COPY, 'CORUN_GRP_COPY'],
        ['DELETE', GRP.DELETE, 'CORUN_GRP_DELETE'], ['MUTE', GRP.MUTE, 'CORUN_GRP_MUTE'],
    ]) {
        const m = h.match(new RegExp(macro + '\\s+\\(1u << (\\d+)\\)'));
        if (!m) throw new Error(macro + ' not found in the header');
        if ((1 << parseInt(m[1], 10)) !== val)
            throw new Error(name + ': header says bit ' + m[1]);
    }
});

step('move-native declares the ruled split', () => {
    S.sessionView = false; S.moveCoRunTrack = -1;
    S.trackChannel[2] = 1; S.trackRoute[2] = 1;
    corun.enterMoveNativeCoRun(2, 'track');
    if (!opened || opened.id !== 'move_native') throw new Error('service not opened');
    const m = opened.opts.keep_mask;
    /* RE-RULED by Josh 2026-08-24, after living with the first cut: cede exactly
     * the instrument-editing controls, keep everything else "fully as it is
     * outside of co-run in track view". TRACK moved KEEP-side with that — they
     * are the clip buttons, and selecting clips is what they do everywhere
     * else. Shift stayed ours (no recalled use for it in Move's editor). */
    const mustKeep = ['PADS', 'STEPS', 'MENU', 'SHIFT', 'TRACK',
                      'PLAY', 'REC', 'SAMPLE', 'LOOP'];
    const mustCede = ['JOG', 'KNOBS', 'MASTER', 'BACK', 'TOUCH', 'MUTE', 'COPY', 'DELETE'];
    for (const g of mustKeep) if (!(m & GRP[g])) throw new Error('does not keep ' + g);
    for (const g of mustCede) if (m & GRP[g]) throw new Error('keeps ' + g + ' (must cede)');
    if (m & GRP.DEAD_TRANSPORT)
        throw new Error('the RETIRED transport bit is back in the mask');
    if (!(m & GRP.KEEP_BACK)) throw new Error('lost the framework Back-exit opt-out');
});

step('the LED mask matches the keep mask — no lights/input split any more', () => {
    /* There used to be one: we owned CC 40-43's LIGHTS to blink a paired-track
     * indicator while their PRESSES ceded to Move. Both halves are ours now, so
     * a divergence here would mean a surface we light but cannot operate. */
    const m = opened.opts.led_keep_mask;
    if (m !== (opened.opts.keep_mask | GRP.TRACK))
        throw new Error('led mask drifted: ' + m + ' vs ' + (opened.opts.keep_mask | GRP.TRACK));
    if (!(opened.opts.keep_mask & GRP.TRACK))
        throw new Error('TRACK is lit but its presses cede — lights without input');
});

/* ── the LIT pad keeps its track colour in co-run ──────────────────────────
 *
 * Josh's other half of the same ruling: the inverted co-run pad scheme stays,
 * but "the last pressed pad" must still read as this track. Added because a
 * mutation proved it uncovered — flipping the lit pad back to White passed
 * every other test in the suite. Captured at the wire, the way the bank-jog
 * test does it: setLED emits [0x09, 0x90, note, color]. */
step('⭑ a sounding pad wears the TRACK colour in co-run, not white', async () => {
    const ledsMod = await import('../../ui/ui_leds.mjs');
    const constsMod = await import('../../ui/ui_constants.mjs');
    const ifMod = await import('/data/UserData/schwung/shared/input_filter.mjs');
    const { updateTrackLEDs, invalidateLEDCache, trackColor } = ledsMod;
    const { TRACK_PAD_BASE, PAD_MODE_MELODIC_SCALE } = constsMod;

    S.sessionView = false;
    S.activeTrack = 2;
    S.trackPadMode[2] = PAD_MODE_MELODIC_SCALE;
    S.activeBank = 0;                       /* not AUTO — that greys everything */
    S.ledInitComplete = true;

    const colorsOfSounding = () => {
        const seen = {};
        ifMod.clearAllLEDs();
        globalThis.move_midi_internal_send = (b) => {
            if (b && b[1] === 0x90 && b[2] >= TRACK_PAD_BASE && b[2] < TRACK_PAD_BASE + 32)
                seen[b[2]] = b[3];
        };
        invalidateLEDCache();
        updateTrackLEDs();
        globalThis.move_midi_internal_send = () => {};
        return seen;
    };

    /* Sound ONE pad, so exactly one LED can carry the lit colour. */
    const pitch = S.padNoteMap[0] + S.trackOctave[2] * 12;
    if (!(pitch >= 0 && pitch <= 127)) throw new Error('pad 0 has no usable pitch');
    S.liveActiveNotes = new Set([pitch]);

    S.moveCoRunTrack = -1;
    const outside = colorsOfSounding()[TRACK_PAD_BASE];
    S.moveCoRunTrack = 2;
    const inside = colorsOfSounding()[TRACK_PAD_BASE];
    S.moveCoRunTrack = -1;
    S.liveActiveNotes = new Set();

    const tc = trackColor(2);
    if (inside !== tc)
        throw new Error('lit pad in co-run is ' + inside + ', expected track colour ' + tc +
                        (inside === outside ? ' (it is still painting the non-co-run white)' : ''));
    if (outside === inside)
        throw new Error('control failed: co-run and normal look identical, so this proves nothing');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
