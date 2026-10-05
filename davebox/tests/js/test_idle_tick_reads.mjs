/* tests/js/test_idle_tick_reads.mjs — A STOPPED, QUIET SESSION READS ONLY ON
 * THE POLL.
 *
 * A read of the sound engine is a full SPI round trip (~2.9 ms against a
 * ~10.6 ms tick) whatever it carries. Measured on the Move (OTLP, 2026-10-05,
 * main fddcfde12): at idle the tick made a bulk read EVERY tick — for the arp
 * Loop-LED's on/latch and the metronome's beat count, neither of which can
 * change there — plus a `state_chunk_0` every poll that only ever answered
 * "nothing to save". 34% of wall time was spent waiting on reads.
 *
 * Driven through the REAL tick against a DSP stub. Counts are READS, not ms.
 * Cases: (1) stopped, clean, metronome on, nothing latched: one bulk read per
 * poll tick and no single reads; (3) the same with automation in the project
 * (its warning flags used to make a second bulk read every poll); (2) CONTROL: a record count-in puts the beat
 * count back into every tick — the same rig CAN see a per-tick read. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'stipple_rect', 'draw_line', 'print', 'clear_screen', 'fill_rect', 'draw_rect',
    'set_pixel', 'flush_display', 'move_midi_inject_to_move', 'set_led', 'move_midi_internal_send',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi', 'host_module_set_param', 'pixel_print',
    'move_midi_external_send'])
    globalThis[fn] = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

const UUID = 'idle-uuid';
const single = [];
const DSP = (k) => {
    if (k === 'state_uuid') return UUID;
    if (k === 'state_dirty') return '0';
    if (k === 'state_snapshot') return new Array(64).fill('0').join(' ');
    return '';
};
let inBulk = false;
globalThis.host_module_get_param = (k) => { k = String(k); if (!inBulk) single.push(k); return DSP(k); };

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
/* Count bulk reads; keys inside one are not single reads. */
const realBulk = globalThis.host_module_get_params;
let bulks = 0;
globalThis.host_module_get_params = (b) => { bulks++; inBulk = true; try { return realBulk(b); } finally { inBulk = false; } };
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, POLL_INTERVAL } = await import('../../ui/ui_constants.mjs');
const AUTO = await import('../../ui/ui_automation.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID; S.activeTrack = 0; S.sessionView = false;
S.metronomeOn = 1; S.playing = false;
S.tickCount = 1000;
/* The real tick advances S.tickCount itself. */
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
ticks(200);                                   /* settle: past the quiet window */

const N = POLL_INTERVAL * 25;
step('⭐ (1) stopped + clean + metronome on: one bulk read per poll tick, no single reads', () => {
    bulks = 0; single.length = 0;
    ticks(N);
    console.log(`    ${N} ticks: ${bulks} bulk reads, ${single.length} single reads` +
                (single.length ? ' (' + [...new Set(single)].slice(0, 6).join(', ') + ')' : ''));
    assert(bulks === N / POLL_INTERVAL, 'expected ' + (N / POLL_INTERVAL) + ' bulk reads, got ' + bulks);
    assert(single.length === 0, single.length + ' single reads: ' + [...new Set(single)].join(', '));
});

step('⭐ (3) a project WITH automation: its warning flags ride the same poll read', () => {
    const auto = AUTO;
    auto.automationNoteWrite();
    assert(auto.automationWantsFlags(), 'setup: the warning flags are wanted');
    bulks = 0; single.length = 0;
    ticks(N);
    console.log(`    ${N} ticks with automation: ${bulks} bulk reads, ${single.length} single reads`);
    assert(bulks === N / POLL_INTERVAL, 'expected ' + (N / POLL_INTERVAL) + ' bulk reads, got ' + bulks);
    assert(single.length === 0, single.length + ' single reads: ' + [...new Set(single)].join(', '));
});

step('CONTROL (2) a record count-in reads the beat every tick — the rig sees per-tick reads', () => {
    S.recordCountingIn = true;
    bulks = 0; single.length = 0;
    ticks(N);
    S.recordCountingIn = false;
    assert(bulks === N, 'expected a bulk read every tick during count-in, got ' + bulks + '/' + N);
});

if (failed) { console.error('FAIL: test_idle_tick_reads'); process.exit(1); }
console.log('PASS: test_idle_tick_reads');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
