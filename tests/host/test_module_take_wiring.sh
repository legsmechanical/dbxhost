#!/usr/bin/env bash
# A MODULE take (move_host_ext_v1_t.capture_start) stays the module's.
#
# The sampler it rides on was built for a user at the Sample button, and three
# of its reflexes would each break a module's loop without a sound:
#   - a bare Sample press while RECORDING means "stop" — the take ends part-way
#     and the press never reaches the module;
#   - the dot / "saved" overlay draws over a screen the module owns;
#   - capture follows the MENU's source, so a user who last recorded Move Input
#     would get the line-in, or nothing, instead of the mix.
# The length arithmetic is run in test_sampler_take.c; these are SOURCE pins on
# the wiring around it, because each failure is silent by construction.
set -u
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c
SAMP=src/host/shadow_sampler.c
API=src/host/plugin_api_v1.h
for f in "$SHIM" "$SAMP" "$API"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}
code() { grep -vE "^\s*(/\*|\*|//)" "$1"; }   # drop comment-only lines

echo "module take wiring:"

# The struct grows only at its end (a module reads a member only inside `size`).
ext_tail() {
    awk '/typedef struct move_host_ext_v1 \{/,/\} move_host_ext_v1_t;/' "$API" \
        | grep -E '^\s+[a-z].*\(\*' | tail -2 | tr -d ' \n' \
        | grep -q 'int(\*capture_start)(constchar\*path,uint32_tframes);void(\*capture_stop)(void);'
}
check "capture_start / capture_stop are the LAST two members of the extension" ext_tail

filled() { code "$SHIM" | grep -q '\.capture_start = overtake_capture_start' &&
           code "$SHIM" | grep -q '\.capture_stop = sampler_request_stop_module'; }
check "the shim fills both members" filled

button_guard() { code "$SHIM" | grep -q 'if (d1 == CC_RECORD && d2 > 0 && !sampler_module_take)'; }
check "the Sample-button intercept stands aside during a module take" button_guard

dots_guarded() {
    # Every place that draws the recording dot must exclude a module take.
    local all guarded
    all=$(code "$SHIM" | grep -c 'sampler_state == SAMPLER_RECORDING && .*rec_dot_visible()\|recording_dot_on = (sampler_state')
    guarded=$(code "$SHIM" | grep 'rec_dot_visible()\|recording_dot_on = (sampler_state' \
        | grep -c 'sampler_state == SAMPLER_RECORDING && !sampler_module_take')
    [ "$all" -ge 4 ] && [ "$all" = "$guarded" ]
}
check "every recording-dot site excludes a module take" dots_guarded

unity_always() { code "$SHIM" | grep -A2 '} else if (sampler_module_take) {' \
                     | grep -q 'sampler_capture_audio_from_buffer(unity_view)'; }
check "a module take captures unity_view whatever the menu's source" unity_always

input_skips() { code "$SAMP" | grep -A6 '^void sampler_capture_audio(void)' \
                    | grep -q 'if (sampler_module_take) return;'; }
check "...and never the input path as well" input_skips

midi_stop() { code "$SAMP" | grep -B2 -A2 'sampler_external_stop_only) {' | grep -q 'sampler_module_take'; }
check "Move's MIDI Stop does not end a module take" midi_stop

quiet() { code "$SAMP" | grep -A3 'if (was_module_take) {' | grep -q 'return;'; }
check "finalize returns before the announcement and overlay for a module take" quiet

flag_order() {
    # The take flag is cleared BEFORE the state goes IDLE in finalize.
    code "$SAMP" | awk '/int was_module_take = sampler_module_take;/ {on=1}
                        on && /sampler_module_take = 0;/ {a=NR}
                        on && /sampler_state = SAMPLER_IDLE;/ {b=NR; exit}
                        END {exit !(a && b && a < b)}'
}
check "finalize clears the take flag before the sampler goes IDLE" flag_order

[ "$fails" = 0 ] && echo "PASS" || { echo "FAIL" >&2; exit 1; }
