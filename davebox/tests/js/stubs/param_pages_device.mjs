/* The device bindings the VENDORED module editor reaches for, as an OPT-IN stub.
 *
 * ⚠⚠ WHY THIS IS OPT-IN AND NOT INJECTED INTO EVERY BUNDLE. tests/js/build.mjs
 * states the policy and the reason: a MISSING host binding throws inside tick(),
 * which swallows it, so every later stage of the tick silently never runs and
 * the rig passes against a tick that stopped on line one. Blanket-stubbing the
 * host surface would make that failure mode invisible everywhere. So rigs
 * declare what they need — and importing this by name IS declaring it.
 *
 * WHY IT EXISTS AT ALL. davebox's module editor is the host's own binding
 * (davebox/ui/vendor/, see scripts/bundle_ui.sh), so it calls host bindings
 * davebox itself never did. Those exist on device; in node they do not, and
 * three rigs that merely drive sound mode in and out of the editor started
 * failing with `shadow_restore_knob_leds is not defined` — an exit path, not
 * anything the rig was testing.
 *
 * ⭑ Each stub is GUARDED, so a rig that wants to observe one of these can
 * define its own first and keep it. Nothing here asserts; they are inert.
 */
export function stubParamPagesDevice() {
    const def = (name, fn) => {
        if (typeof globalThis[name] === 'undefined') globalThis[name] = fn;
    };
    /* Knob-ring LEDs. The editor's EXIT hands these back — which is exactly the
     * teardown a missed call would strand lit, so it is not optional on device. */
    def('shadow_restore_knob_leds', () => {});
    /* Precision mode: the binding asks the host whether Shift is held. */
    def('shadow_get_shift_held', () => false);
    /* Param View (grid vs list). 1 = knobs, matching PARAM_VIEW_KNOBS. */
    def('param_view_get_mode', () => 1);
    /* Screen reader. Off, so announce() stays silent in a rig. */
    def('tts_get_enabled', () => false);
    /* Tracing spans around the page draw. */
    def('host_trace_begin', () => {});
    def('host_trace_end', () => {});
    /* Shape bindings the movy renderer prefers when present — one native call
     * instead of a JS pixel walk. Inert here; the rigs that measure pixels
     * define their own set_pixel/fill_rect and are unaffected. */
    def('draw_line', () => {});
    def('draw_circle', () => {});
    def('draw_arc', () => {});
    def('fill_circle', () => {});
    def('text_width', (s) => String(s == null ? '' : s).length * 4);
}
