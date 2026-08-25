/* The overview indicator rows are set in the PROPORTIONAL movy font, and this
 * pins the arithmetic that has to change with it.
 *
 * ⚠ The old 5x5 face was FIXED-PITCH, so every position and every rule width on
 * these rows was written as `length * 6`. That is invisible once the font is
 * proportional: the text still draws, so nothing looks broken in a code review
 * — the scale-aware underline is just the wrong length, `Fix` and `Adap` stop
 * sharing a right edge, and the Arp chip is cut to fit a width its text no
 * longer has. Each of those is a silent 1-4px lie that only hardware shows.
 *
 * So this renders the REAL screen into a framebuffer and measures the ink.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const W = 128, H = 64;
let fb = new Uint8Array(W * H);
const px = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.set_pixel = px;
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, v); };
globalThis.draw_rect = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = () => {};          /* host 5x7: not used by these rows */
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file','host_read_file','host_file_exists','host_ensure_dir',
    'host_remove_dir','host_system_cmd','host_module_set_param','host_module_get_param',
    'shadow_set_param','shadow_get_param','host_send_midi','move_midi_inject_to_move',
    'shadow_send_midi_to_dsp','set_led','move_midi_internal_send','host_vol_block',
    'host_edit_cc_block','host_ext_midi_remap_clear','host_ext_midi_remap_set',
    'host_ext_midi_remap_enable','host_register_primary','flush_display','host_exit_module'])
    globalThis[fn] = () => 0;
globalThis.host_module_get_param = () => '';
globalThis.host_read_file = () => '';

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
const render = await import('../../ui/ui_render.mjs');

S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
S.ledInitComplete = true; S.activeTrack = 3; S.tickCount = 100;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.sessionView = false; S.activeBank = 0; S.bankSelectTick = -1; S.jogTouched = false;
S.scaleAware = true;

/* Ink extent of one row band, as [firstX, lastX] or null. */
function inkSpan(y0, y1, x0 = 0, x1 = W - 1) {
    let lo = -1, hi = -1;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
            if (fb[y * W + x]) { if (lo < 0 || x < lo) lo = x; if (x > hi) hi = x; }
    return lo < 0 ? null : [lo, hi];
}
const draw = () => { globalThis.clear_screen(); render.drawUI(); };

step('control: the info row draws something at all', () => {
    draw();
    if (!inkSpan(12, 16)) throw new Error('nothing on the info row — the rest of this file is blind');
});

step('⭑ the scale-aware underline is exactly as wide as the key/scale text', () => {
    /* The text sits on rows 12-16 and its rule on row 17, both right-aligned to
     * x=124. A fixed-pitch width would overhang or fall short of the glyphs. */
    draw();
    const text = inkSpan(12, 16, 70, 127);
    const rule = inkSpan(17, 17, 70, 127);
    if (!text) throw new Error('no key/scale text');
    if (!rule) throw new Error('no underline — scaleAware is on, it must draw');
    if (Math.abs(rule[0] - text[0]) > 1 || Math.abs(rule[1] - text[1]) > 1)
        throw new Error('underline ' + JSON.stringify(rule) + ' does not match text ' +
                        JSON.stringify(text) + ' — the width is still fixed-pitch arithmetic');
});

step('⭑ Fix and Adap share a right edge (both are right-ALIGNED, not placed)', () => {
    /* The two tags alternate in the same slot, so a reader compares them across
     * time; a ragged right edge reads as the value having moved. */
    S.clipNonEmpty[3][S.trackActiveClip[3]] = true;
    S.clipLengthManuallySet[3][S.trackActiveClip[3]] = true;
    draw();
    const fix = inkSpan(22, 26, 90, 127);
    S.clipNonEmpty[3][S.trackActiveClip[3]] = false;
    S.clipLengthManuallySet[3][S.trackActiveClip[3]] = false;
    draw();
    const adap = inkSpan(22, 26, 90, 127);
    if (!fix || !adap) throw new Error('one of the tags did not draw: ' +
                                       JSON.stringify({ fix, adap }));
    if (fix[1] !== adap[1])
        throw new Error('right edges differ: Fix ends at ' + fix[1] + ', Adap at ' + adap[1]);
    if (fix[0] === adap[0])
        throw new Error('control: both tags start at the same x, so this cannot ' +
                        'tell alignment from a coincidence — they have different widths');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
