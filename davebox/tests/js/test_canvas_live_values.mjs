import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_canvas_live_values.mjs — a fullscreen module canvas gets its
 * live values (upstream #530, stock 1.5): a canvas param declaring `extra_keys`
 * and `fullscreen_live_ms` has those keys re-read on the interval and handed to
 * its onValues as { values, nowMs }. Stock 1.5 tells canvas authors to take
 * meters and playheads from here instead of reading on the draw path, so such
 * a canvas froze in dAVEBOx until this existed.
 *
 * Through the REAL door: the canvas screen's own io (the component read, the
 * UI clock) and the real overlay loader, with only the module's script file
 * stubbed. Pinned: one read per tick (a read costs ~2.8 ms), delivery once
 * every key has answered, the interval (floor 50 ms), no reads without the
 * declaration or without an onValues hook.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function step(l, fn) { try { fn(); console.log(`  ok   — ${l}`); } catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display', 'clear_screen',
    'print', 'fill_rect', 'draw_rect', 'set_pixel', 'move_midi_internal_send', 'set_led', 'host_open_service',
    'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable',
    'host_send_midi', 'move_midi_inject_to_move'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => String(t).length * 6;
/* the module's folder is found by its module.json id */
globalThis.host_read_file = (p) => (/\/meterfx\/module\.json$/.test(String(p)) ? '{"id":"meterfx"}' : '');
globalThis.host_file_exists = () => true;
globalThis.host_write_file = () => true;
const reads = [];
let meter = '0.25';
globalThis.shadow_get_param = (slot, k) => {
    if (/(^|:)(synth_module|module)$/.test(k) || k === 'synth_module') return 'meterfx';
    if (/:meter$|:playhead$|:peak$/.test(k)) { reads.push(k); return k.endsWith('meter') ? meter : '7'; }
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;

/* The module's canvas.js, as the loader evaluates it: it sets canvas_overlay. */
let overlay = null;
globalThis.shadow_load_ui_module = () => { globalThis.canvas_overlay = overlay; return true; };

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const snd = await import('../../ui/ui_sound.mjs');
    const await_canvas = await import('../../ui/ui_canvas.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
    const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
    S.clockFollowTicks = true;
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

    const got = [];
    const mkOverlay = (withValues) => ({
        ...(withValues ? { onValues: (ctx, p) => { got.push({ values: { ...p.values }, nowMs: p.nowMs }); } } : {}),
        draw: () => {},
    });
    const META = { key: 'scope', type: 'canvas', canvas_script: 'canvas.js',
                   extra_keys: ['meter', 'playhead', 'peak', 'meter2x', 'fifth'], fullscreen_live_ms: 100 };
    let n = 0;
    const open = (meta, withValues = true) => {
        overlay = mkOverlay(withValues);
        /* a distinct script per open: the loader keeps one evaluation per script */
        return snd.soundOpenCanvasScreenForTest('synth:' + meta.key, { ...meta, canvas_script: 'c' + (++n) + '.js' });
    };

    step('setup: sound mode open on a Schwung track', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.activeTrack = 4;
        openTrackConfigViaMap();
        ticks(6);
    });

    step('⭐⭐ onValues gets the declared keys (at most four), ONE read per tick', () => {
        reads.length = 0; got.length = 0;
        assert(open(META), 'canvas did not open');
        const cv = await_canvas.canvasEditState();
        assert(cv && cv.hasOverlay && !cv.error, 'control: the overlay did not load: ' + JSON.stringify(cv));
        const perTick = [];
        for (let i = 0; i < 4; i++) { const b = reads.length; ticks(1); perTick.push(reads.length - b); }
        assert(perTick.every((x) => x <= 1), 'more than one read in a tick: ' + JSON.stringify(perTick));
        assert(got.length === 1, 'want ONE delivery after four reads, got ' + got.length);
        const v = got[0].values;
        assert(JSON.stringify(Object.keys(v)) === JSON.stringify(['meter', 'playhead', 'peak', 'meter2x']),
               'keys: ' + JSON.stringify(Object.keys(v)) + ' (the fifth must be dropped)');
        assert(v.meter === '0.25' && v.playhead === '7', 'values: ' + JSON.stringify(v));
        assert(typeof got[0].nowMs === 'number', 'no nowMs');
    });
    step('the next cycle waits out the interval, then carries the NEW value', () => {
        got.length = 0; meter = '0.9';
        ticks(3);                               /* ~32 ms of a 100 ms interval */
        assert(got.length === 0, 'delivered before the interval: ' + got.length);
        ticks(30);
        assert(got.length >= 2, 'no fresh deliveries: ' + got.length);
        assert(got.every((g) => g.values.meter === '0.9'), 'a stale value: ' + JSON.stringify(got.map((g) => g.values.meter)));
        for (let i = 1; i < got.length; i++)
            assert(got[i].nowMs - got[i - 1].nowMs >= 100, 'cycles closer than the interval: ' + got.map((g) => g.nowMs));
    });
    /* (No redraw-on-delivery check: measured here, a static canvas in sound
     * mode already redraws on most ticks for other reasons — 10 of 16 with no
     * delivery — so such a check passes with or without the redraw and proves
     * nothing. The tick's `_fresh` redraw mirrors stock and is not pinned.) */
    step('the interval has a floor of 50 ms', () => {
        reads.length = 0; got.length = 0;
        assert(open({ ...META, extra_keys: ['meter'], fullscreen_live_ms: 1 }), 'reopen');
        ticks(40);
        assert(got.length >= 3, 'too few deliveries to judge: ' + got.length);
        for (let i = 1; i < got.length; i++)
            assert(got[i].nowMs - got[i - 1].nowMs >= 50, 'closer than 50 ms: ' + got.map((g) => g.nowMs));
    });
    step('⚠ CONTROL: without fullscreen_live_ms nothing is read', () => {
        reads.length = 0; got.length = 0;
        assert(open({ key: 'scope', type: 'canvas', extra_keys: ['meter'] }), 'reopen');
        assert(await_canvas.canvasEditState().hasOverlay, 'control: the overlay did not load');
        ticks(20);
        assert(reads.length === 0 && got.length === 0, 'read ' + reads.length + ', delivered ' + got.length);
    });
    step('⚠ CONTROL: an overlay with no onValues hook is not read for', () => {
        reads.length = 0;
        assert(open(META, false), 'reopen');
        assert(await_canvas.canvasEditState().hasOverlay, 'control: the overlay did not load');
        ticks(20);
        assert(reads.length === 0, 'read ' + reads.length + ' keys for an overlay that cannot receive them');
    });

    if (failed) { console.error('test_canvas_live_values: FAIL'); process.exit(1); }
    console.log('test_canvas_live_values: PASS');
}
main().catch(e => { console.error(e); process.exit(1); });
