/* tests/js/test_loop_double.mjs — Shift+Step15 double-and-fill, end to end
 * through the real dispatch (2026-08-24, chasing Josh's "loop double not
 * working" report).
 *
 * What the chase established: the everyday melodic and drum paths DO dispatch
 * (steps arrive as NOTES 16-31, not CCs — a first probe sent CCs and
 * "reproduced" a break that wasn't there). The real defect was the GUARD:
 * the DSP refuses `loop_start + len*2 > 256` silently, while JS only checked
 * `len*2 > 256` — with a loop window set near capacity, the UI popped LOOP
 * DOUBLED and doubled its local length while the engine kept the old one. A
 * desynced clip is exactly what "not working" looks like on hardware. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
function fire() { cc(49, 127); note(30, 127); note(30, 0); cc(49, 0); globalThis.tick(); }
const dbl = () => sets.filter(([k]) => /double/.test(k));

step('melodic: Shift+Step15 fires t2_loop_double_fill and doubles the length', () => {
    sets.length = 0; S.clipLength[2][0] = 16; S.clipLoopStart[2][0] = 0;
    fire();
    if (dbl().length !== 1 || dbl()[0][0] !== 't2_loop_double_fill')
        throw new Error(JSON.stringify(dbl()));
    if (S.clipLength[2][0] !== 32) throw new Error('length ' + S.clipLength[2][0]);
});

step('drum: same gesture fires the per-lane key', () => {
    sets.length = 0; S.trackPadMode[2] = 1; S.activeBank = 0;
    S.activeDrumLane[2] = 3; S.drumLaneLength[2] = 16; S.drumLaneLoopStart[2] = 0;
    fire();
    if (dbl().length !== 1 || dbl()[0][0] !== 't2_l3_loop_double_fill')
        throw new Error(JSON.stringify(dbl()));
    if (S.drumLaneLength[2] !== 32) throw new Error('lane length ' + S.drumLaneLength[2]);
    S.trackPadMode[2] = 0;
});

step('⭑ a loop WINDOW near capacity refuses HONESTLY — no lying popup, no desync', () => {
    /* ls=16, len=128: the old JS check (len*2 <= 256) passed, the DSP refused
     * (16+256 > 256) — the UI doubled alone. Both sides must refuse now. */
    sets.length = 0; S.clipLength[2][0] = 128; S.clipLoopStart[2][0] = 16;
    fire();
    if (dbl().length) throw new Error('sent a double the DSP will refuse: ' + JSON.stringify(dbl()));
    if (S.clipLength[2][0] !== 128) throw new Error('UI doubled alone: ' + S.clipLength[2][0]);
    if (!S.actionPopupLines.some(l => /CLIP FULL/.test(l)))
        throw new Error('no CLIP FULL popup: ' + JSON.stringify(S.actionPopupLines));
    S.clipLoopStart[2][0] = 0;
});

step('⭑ drum flavour of the same guard', () => {
    sets.length = 0; S.trackPadMode[2] = 1; S.activeBank = 0;
    S.drumLaneLength[2] = 128; S.drumLaneLoopStart[2] = 16;
    fire();
    if (dbl().length) throw new Error('sent: ' + JSON.stringify(dbl()));
    if (S.drumLaneLength[2] !== 128) throw new Error('UI doubled alone: ' + S.drumLaneLength[2]);
    S.trackPadMode[2] = 0; S.drumLaneLoopStart[2] = 0;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
