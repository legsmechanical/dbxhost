/* tests/js/test_hints_shift_followthrough.mjs — A FOOTER SAYS WHAT THE
 * GESTURE DOES NOW (Josh, 2026-11-16: "in track config landing on a loaded
 * instrument says "shift:change" but when you hold shift, there's no hint to
 * click to change" → the hints audit). Pinned here:
 *   · a held step: the Shift tap's POINT/PUNCH leads (it was cut by the fit
 *     rule behind JOG STEP + BACK on every bank card), JOG STEP where it
 *     reveals, no BACK; the track overview the same, and never JOG TRACK
 *     under a hold (heldStepJog declines Shift + jog)
 *   · Shift held on a bank card: no CLK pair (every click needs Shift up)
 *   · the snapshot layer: Shift → STEP STORE, Delete → STEP CLEAR, plain
 *     STEP RECALL · SHFT STORE (SHFT, the canon key)
 *   · the Session mixer: no BACK OUT (a Back tap there does nothing)
 *   · every footer key / Back word drawn here is in MV_FOOTER_CANON */
let failed = 0;
const step = (l, fn) => { try { fn(); console.log(`  ok   — ${l}`); } catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const J = JSON.stringify;
for (const fn of ['set_pixel', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line', 'print']) globalThis[fn] = () => {};
globalThis.clear_screen = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'flush_display', 'move_midi_internal_send', 'set_led', 'host_open_service',
    'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable',
    'host_send_midi', 'move_midi_inject_to_move', 'host_preview_stop', 'host_preview_play'])
    globalThis[fn] = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_ui_publish = () => false;
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
let SHIFT = 0;
globalThis.shadow_get_shift_held = () => SHIFT;   /* the host's Shift, as the real button sets it */
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
/* the engine: track 5 with a sample, as the audio tests give it */
const ENGINE = {};
globalThis.host_module_get_param = (k) => (ENGINE[k] !== undefined ? ENGINE[k] : '');
import './_bulk_get_stub.mjs';

async function main() {
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const C = await import('../../ui/ui_constants.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const DS = await import('../../ui/ui_devsnap.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const { MV_FOOTER_CANON } = await import('../../ui/ui_movy.mjs');
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    step('setup', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
        ticks(2);
        S.sessionView = false; S.activeTrack = 0; S.activeBank = 0;
    });
    const hold = (on, withNote = true) => {
        S.heldStep = on ? 3 : -1; S.heldStepBtn = -1;
        S.heldStepNotes = on && withNote ? [60] : []; S.stepWasEmpty = !withNote;
    };
    const keyOk = (h) => MV_FOOTER_CANON.keys.indexOf(String(h[0]).toUpperCase()) >= 0;

    step('⭐⭐ a held step on a bank card: SHFT POINT/PUNCH first, then JOG STEP, no BACK', () => {
        hold(true); S.shiftHeld = false; S.knobTouched = -1; S.heldWrite = { type: 1 };
        const h = render.bankPageHints(1);
        assert(J(h) === J([['SHFT', 'POINT'], ['JOG', 'STEP']]), 'bank 2 held: ' + J(h));
        S.heldWrite = { type: 0 };
        assert(J(render.bankPageHints(1)) === J([['SHFT', 'PUNCH'], ['JOG', 'STEP']]), 'after a tap: ' + J(render.bankPageHints(1)));
        hold(true, false);
        assert(J(render.bankPageHints(1)) === J([['SHFT', 'PUNCH']]), 'an empty step: no JOG STEP: ' + J(render.bankPageHints(1)));
        hold(false); S.heldWrite = { type: 1 };
        const rest = render.bankPageHints(1);
        assert(rest.length && rest[rest.length - 1][0] === 'BACK', 'control — no hold, BACK OUT ends the row: ' + J(rest));
    });
    step('⭐⭐ Shift held on a bank card: no CLK pair (the clicks need Shift up); under a hold, the release is the tap', () => {
        hold(false); S.knobTouched = 1; S.shiftHeld = true;
        const h = render.bankPageHints(0);
        assert(!h.some((x) => x[0] === 'CLK' || x[0] === 'KNB+CLK'), 'Shift held names a click: ' + J(h));
        hold(true); S.knobTouched = -1;
        assert(J(render.bankPageHints(1)) === J([['SHFT', 'POINT']]), 'Shift held under a hold: ' + J(render.bankPageHints(1)));
        S.shiftHeld = false; hold(false);
        assert(J(render.bankPageHints(0)) !== J([]), 'control — Shift up, the card has hints');
    });
    step('⭐⭐ the track overview under a hold: never JOG TRACK; the tap and JOG STEP', () => {
        hold(true); S.shiftHeld = true;
        let h = render.overviewHints();
        assert(!h.some((x) => x[0] === 'JOG' && x[1] === 'TRACK'), 'JOG TRACK under a hold: ' + J(h));
        assert(J(h) === J([['SHFT', 'POINT']]), 'Shift under a hold: ' + J(h));
        S.shiftHeld = false;
        h = render.overviewHints();
        assert(J(h) === J([['SHFT', 'POINT'], ['JOG', 'STEP']]), 'held, no Shift: ' + J(h));
        hold(false); S.shiftHeld = true;
        assert(J(render.overviewHints()) === J([['JOG', 'TRACK']]), 'control — no hold, Shift: JOG TRACK');
        S.shiftHeld = false;
    });
    step('⭐⭐ the snapshot layer: Shift → STEP STORE, Delete → STEP CLEAR, plain STEP RECALL · SHFT STORE', () => {
        S.devSnap = Object.assign(S.devSnap || {}, { open: true, recalling: -1 });
        assert(DS.devSnapOpen(), 'the layer did not open');
        S.shiftHeld = false; S.deleteHeld = false;
        assert(J(render.overviewHints()) === J([['STEP', 'RECALL'], ['SHFT', 'STORE']]), 'plain: ' + J(render.overviewHints()));
        S.shiftHeld = true;
        assert(J(render.overviewHints()) === J([['STEP', 'STORE']]), 'Shift: ' + J(render.overviewHints()));
        S.shiftHeld = false; S.deleteHeld = true;
        assert(J(render.overviewHints()) === J([['STEP', 'CLEAR']]), 'Delete: ' + J(render.overviewHints()));
        S.deleteHeld = false; S.devSnap.open = false;
    });
    step('⭐ a Delete press redraws (the footer may name its gesture)', () => {
        S.screenDirty = false;
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 119, 127]));
        const d = S.screenDirty;
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 119, 0]));
        assert(d, 'Delete down left the screen clean');
    });
    step('every key drawn by these footers is a canon key', () => {
        const seen = [];
        for (const [held, sh] of [[false, false], [true, false], [true, true]]) {
            hold(held); S.shiftHeld = sh;
            for (let b = 0; b < 8; b++) seen.push(...render.bankPageHints(b));
            seen.push(...render.overviewHints());
        }
        hold(false); S.shiftHeld = false;
        const bad = seen.filter((h) => !keyOk(h));
        assert(!bad.length, 'off-canon keys: ' + J(bad));
    });

    if (failed) { console.log('FAIL: hints shift follow-through'); process.exit(1); }
    console.log('PASS: footers say what the gesture does now');
}
main().catch((e) => { console.error(e); process.exit(1); });
