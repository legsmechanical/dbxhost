/* tests/js/test_link_audio_warning.mjs — dAVEBOx's own counterpart of the
 * host's warnIfLinkDisabled (src/shadow/shadow_ui.js:2063-2085), which lives on
 * a host screen dAVEBOx never opens. syncLinkAudioRoutingFromRoutes
 * (ui_engine.mjs) writes master_fx:link_audio_routing=1 whenever a track is
 * routed to Move, but nothing in davebox/ui used to read back Move's system
 * Link setting (master_fx:system_link_enabled) to tell the user the rebuild
 * they just created is silent until they flip that switch.
 *
 * warnIfLinkAudioSystemDisabled() (ui_dsp_bridge.mjs) fires right after every
 * syncLinkAudioRoutingFromRoutes() call, gated on
 * linkAudioRoutingJustEnabled() (ui_engine.mjs) so it pops once per 0->1
 * transition — never once per tick while routing stays on, and never on a
 * 1->0 transition.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
/* Mutable answer for Move's system Link setting — the shim's own way of
 * reporting it (checkSystemLinkEnabled() in shadow_ui.js reads the same key). */
let sysLinkAnswer = '0';
globalThis.shadow_get_param = (slot, k) =>
    (k === 'master_fx:system_link_enabled') ? sysLinkAnswer : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');

function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
});

step('CONTROL: routing to Schwung (no transition to Move) raises no popup', () => {
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
    B.applyTrackConfig(0, 'route', 0 /* ROUTE_SCHWUNG */);
    if (S.actionPopupLines.length) throw new Error('unexpected popup: ' + JSON.stringify(S.actionPopupLines));
});

step('⭑ routing to Move while system Link is OFF pops the warning once', () => {
    sysLinkAnswer = '0';
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
    B.applyTrackConfig(0, 'route', 1 /* ROUTE_MOVE */);
    if (!S.actionPopupLines.length) throw new Error('no popup on the 0->1 transition with Link off');
    const text = S.actionPopupLines.join(' ');
    if (!/Link/.test(text)) throw new Error('popup text does not mention Link: ' + JSON.stringify(S.actionPopupLines));
    if (!/System Settings/.test(text)) throw new Error('popup text does not name System Settings: ' + JSON.stringify(S.actionPopupLines));
});

step('⚠ staying routed to Move does not re-pop on the next call (not per tick)', () => {
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
    B.applyTrackConfig(0, 'route', 1 /* ROUTE_MOVE, already on */);
    if (S.actionPopupLines.length) throw new Error('re-popped without a transition: ' + JSON.stringify(S.actionPopupLines));
});

step('turning routing back off raises no popup either', () => {
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
    B.applyTrackConfig(0, 'route', 0 /* ROUTE_SCHWUNG */);
    if (S.actionPopupLines.length) throw new Error('popup on the 1->0 transition: ' + JSON.stringify(S.actionPopupLines));
});

step('⭑ routing to Move with system Link ON raises no popup', () => {
    sysLinkAnswer = '1';
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
    B.applyTrackConfig(0, 'route', 1 /* ROUTE_MOVE */);
    if (S.actionPopupLines.length) throw new Error('popup fired although Link is enabled: ' + JSON.stringify(S.actionPopupLines));
});

step('⭐⭐ a project-load resync (invalidate + sync) with an already-Move-routed track and Link off raises NO popup', () => {
    /* _syncClipsFromDspInner invalidates the routing cache before re-deriving
     * it from S.trackRoute, which reads as a null->1 "just enabled" transition
     * to syncLinkAudioRoutingFromRoutes() even though nothing actually changed
     * -- the track was already routed to Move before this project loaded. The
     * warning must not fire from that path; only a real user route change
     * (applyTrackConfig) may trigger it. */
    sysLinkAnswer = '0';
    S.trackRoute[0] = 1 /* ROUTE_MOVE, already set from the prior step */;
    S.actionPopupLines = []; S.actionPopupEndTick = -1;
    B.syncClipsFromDsp();
    if (S.actionPopupLines.length) throw new Error('resync popped the Link warning: ' + JSON.stringify(S.actionPopupLines));
});

process.exit(failed);
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
