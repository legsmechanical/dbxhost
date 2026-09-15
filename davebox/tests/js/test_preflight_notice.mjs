/* tests/js/test_preflight_notice.mjs — standalone/scripts/preflight.sh writes
 * DAVEBOX_HOST_DIR + '/preflight_failed' (content "1") when a stock-tree seam
 * is broken at launch, and clears it when clean — but nothing read it. This
 * pins the two halves:
 *   1. init() reads the flag via host_file_exists (a bare stat — an empty
 *      file counts as existing) into S.preflightFailed.
 *   2. the project picker's resting screen shows a one-line footer notice
 *      when the flag is set, and nothing extra when it is not.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

let fileExistsAnswers = {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = (p) => !!fileExistsAnswers[p];
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
const printCalls = [];
globalThis.print = (x, y, t, c) => { printCalls.push(String(t)); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
let setPixelCount = 0;
globalThis.set_pixel = () => { setPixelCount++; };
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
const { DAVEBOX_HOST_DIR } = await import('../../ui/ui_engine.mjs');
const { drawProjectPadPicker } = await import('../../ui/ui_dialogs.mjs');

const FLAG = DAVEBOX_HOST_DIR + '/preflight_failed';

function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

function restingPicker() {
    return { projects: [], byIndex: {}, current: -1,
             touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1,
             menu: null, colorPick: null, confirmNew: null,
             renameActive: false, restarting: false };
}

step('preflight.sh clean (no flag file): init() leaves S.preflightFailed false', () => {
    fileExistsAnswers = {};
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    if (S.preflightFailed !== false) throw new Error('preflightFailed=' + S.preflightFailed);
});

step('the resting picker screen prints nothing extra when preflight is clean', () => {
    printCalls.length = 0;
    S.projectPadPicker = restingPicker();
    drawProjectPadPicker();
    if (printCalls.some((t) => /Preflight/i.test(t)))
        throw new Error('unexpected preflight notice: ' + JSON.stringify(printCalls));
});

step('⭑ preflight.sh failed (flag file present): init() sets S.preflightFailed true', () => {
    fileExistsAnswers = {}; fileExistsAnswers[FLAG] = true;
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    if (S.preflightFailed !== true) throw new Error('preflightFailed=' + S.preflightFailed);
});

step('⭑ the resting picker screen shows a one-line notice, without losing the picker', () => {
    printCalls.length = 0; setPixelCount = 0;
    S.projectPadPicker = restingPicker();
    drawProjectPadPicker();
    const notice = printCalls.find((t) => /Preflight/i.test(t));
    if (!notice) throw new Error('no preflight notice printed: ' + JSON.stringify(printCalls));
    /* fits the 128px width at 6px/char with the caller's own margin */
    if (notice.length * 6 > 124) throw new Error('notice too wide for the panel: ' + JSON.stringify(notice));
    /* the ordinary resting-screen content (brand header + "Select project",
     * both drawn via set_pixel by the kit chassis, not the global print())
     * still drew — the notice did not replace the picker, it sits beside it. */
    if (setPixelCount === 0)
        throw new Error('the notice replaced the picker content — nothing else drew a pixel');
});

process.exit(failed);
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
