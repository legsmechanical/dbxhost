/* tests/js/test_arp_loop_led_mirror.mjs — THE ARP's LOOP-LED BLINK READS THE
 * BANK MIRROR, NOT THE ENGINE.
 *
 * With ARP IN on and latched, the Loop LED blinks in the track colour at the
 * arp's step rate. It used to ask the engine for tN_tarp_on and tN_tarp_latch
 * every tick, which put a bulk round trip (~2.9 ms, one SPI frame) into every
 * idle tick for an LED. The ARP IN bank already mirrors both: Style (0 = off,
 * which is how the engine derives tarp_on) and Latch.
 *
 * Driven through the REAL tick. Cases: (1) Style + Latch set → the Loop LED
 * shows the track colour on an even fire count and goes dark on an odd one;
 * (2) no tick asked the engine for tarp_on/tarp_latch; (3) CONTROL: Latch off
 * → the ambient dim colour, and the fire count is never read. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sent = [];
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'stipple_rect', 'draw_line', 'print', 'clear_screen', 'fill_rect', 'draw_rect',
    'set_pixel', 'flush_display', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi', 'host_module_set_param', 'pixel_print',
    'move_midi_external_send'])
    globalThis[fn] = () => 0;
globalThis.move_midi_internal_send = (b) => { sent.push(Array.from(b)); return true; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

const reads = [];
let fc = 0;
globalThis.host_module_get_param = (k) => {
    k = String(k);
    reads.push(k);
    if (/^t\d+_tarp_fc$/.test(k)) return String(fc);
    if (/^t\d+_tarp_(on|latch)$/.test(k)) return '1';
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, MoveLoop, TRACK_COLORS } = await import('../../ui/ui_constants.mjs');
const { invalidateLEDCache } = await import('../../ui/ui_leds.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.activeTrack = 0; S.sessionView = false;
S.tickCount = 1000;

const loopLed = () => {
    for (let i = sent.length - 1; i >= 0; i--)
        if (sent[i][1] === 0xB0 && sent[i][2] === MoveLoop) return sent[i][3];
    return undefined;
};
const tickAt = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };

step('⭐ (1) Style + Latch on → the Loop LED blinks the track colour with the fire count', () => {
    S.bankParams[0][5][0] = 3; S.bankParams[0][5][7] = 1;
    fc = 0; sent.length = 0; invalidateLEDCache(); tickAt(8);
    const on = loopLed();
    assert(on === TRACK_COLORS[0], 'even fire count: expected the track colour ' + TRACK_COLORS[0] + ', got ' + on);
    fc = 1; tickAt(8);
    assert(loopLed() === 0, 'odd fire count: expected dark, got ' + loopLed());
});

step('⭐ (2) no tick asked the engine for tarp_on or tarp_latch', () => {
    const asked = reads.filter((k) => /_tarp_(on|latch)$/.test(k));
    assert(asked.length === 0, 'asked ' + asked.length + ' times: ' + asked.slice(0, 3).join(', '));
    assert(reads.some((k) => /_tarp_fc$/.test(k)), 'POSITIVE: the fire count was read while latched');
});

step('CONTROL (3) Latch off → the ambient colour, and the fire count is not read', () => {
    S.bankParams[0][5][7] = 0;
    reads.length = 0; sent.length = 0; invalidateLEDCache(); tickAt(8);
    assert(loopLed() === 60, 'expected the ambient 60, got ' + loopLed());
    assert(!reads.some((k) => /_tarp_fc$/.test(k)), 'the fire count was read with latch off');
});

if (failed) { console.error('FAIL: test_arp_loop_led_mirror'); process.exit(1); }
console.log('PASS: test_arp_loop_led_mirror');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
