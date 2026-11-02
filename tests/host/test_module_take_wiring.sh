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
        | grep -E '^\s+[a-z].*\(\*' | tail -11 | tr -d ' \n' \
        | grep -q 'int(\*capture_start)(constchar\*path,uint32_tframes);void(\*capture_stop)(void);int(\*capture_start_src)(constchar\*path,uint32_tframes,intkind,intindex);int(\*slot_audio_feed)(intslot,constint16_t\*lr,uint32_tframes);int(\*stems_start)(intn,constint\*slots,constchar\*const\*paths,uint32_tframes);void(\*stems_limit)(uint32_tframes);void(\*stems_stop)(void);int(\*stems_state)(uint16_t\*peaks,intcap);int(\*offline_take_begin)(conststructmove_offline_take\*take);int(\*offline_take_state)(uint32_t\*done,uint32_t\*total);void(\*offline_take_cancel)(void);'
}
check "capture_start / capture_stop / capture_start_src, slot_audio_feed, the stems_*, then the offline_take_* end the extension" ext_tail

# THE STEM TAKE (stem_take.c): several slots' instruments at once. Its arithmetic
# and files are run in test_stem_take.c; these pin the shim around it.
stems_filled() { code "$SHIM" | grep -q '\.stems_start = overtake_stems_start' &&
                 code "$SHIM" | grep -q '\.stems_limit = stem_take_limit' &&
                 code "$SHIM" | grep -q '\.stems_stop = stem_take_stop' &&
                 code "$SHIM" | grep -q '\.stems_state = stem_take_state'; }
check "the shim fills the four stems_* members" stems_filled
# Each stem is read where the PRE take is: the frame's pre-FX buffer at its
# synth level (a tap in the render task misses the first block), else the
# fallback render, else silence -- and the block is counted after all of them.
stems_read() {
    local blk; blk=$(code "$SHIM" | awk '/if \(stem_take_slot\(0\) >= 0\) \{/,/stem_take_block_end\(\);/')
    [ -n "$blk" ] &&
    printf '%s\n' "$blk" | grep -q 'memcpy(stem_buf, shadow_slot_deferred\[ps\], sizeof(stem_buf));' &&
    printf '%s\n' "$blk" | grep -q 'shadow_apply_synth_level(ps, stem_buf);' &&
    printf '%s\n' "$blk" | grep -q 'stem_take_capture(si, shadow_slot_fallback\[ps\]);' &&
    printf '%s\n' "$blk" | grep -q 'stem_take_capture(si, NULL);' &&
    printf '%s\n' "$blk" | tail -1 | grep -q 'stem_take_block_end();' &&
    code "$SHIM" | awk '/if \(stem_take_slot\(0\) >= 0\) \{/{a=NR} /const int16_t \*take_src = unity_view;/{b=NR} END{exit !(a && b && a < b)}'
}
check "the shim reads each stem's slot before its FX, at the PRE take's point" stems_read
stems_worker() { code "$SHIM" | grep -q '\.stems_prepare          = stem_take_worker_prepare' &&
                 code "$SHIM" | grep -q '\.stems_finalize         = stem_take_worker_finalize' &&
                 code "$SHIM" | grep -q 'stem_take_init(&stem_host);' &&
                 code src/host/shim_worker.c | grep -q 'worker_hooks.stems_prepare()' &&
                 code src/host/shim_worker.c | grep -q 'worker_hooks.stems_finalize()'; }
check "the stem take's file work runs on the worker, and its rings are made at init" stems_worker
stems_built() { grep -q 'src/host/stem_take.c \\' scripts/build.sh &&
                grep -q 'src/host/shim_worker.c src/host/stem_take.c' scripts/build.sh; }
check "the shim build compiles stem_take.c (and rebuilds on it)" stems_built

filled() { code "$SHIM" | grep -q '\.capture_start = overtake_capture_start' &&
           code "$SHIM" | grep -q '\.capture_stop = sampler_request_stop_module' &&
           code "$SHIM" | grep -q '\.capture_start_src = overtake_capture_start_src'; }
check "the shim fills all three members" filled

# The dry stem: every slot mix loop keeps the tapped slot's contribution. A site
# without it records SILENCE for that path (rebuild / deferred / inline), and the
# path a session takes depends on Link Audio and the chain's FX mode.
# A muted or soloed-out slot's take keeps the slot as set (sampler_take_tap.h),
# at every site too.
taps() {
    [ "$(code "$SHIM" | grep -c 'if (tap) shadow_take_tap\[i\] = sampler_take_tap_sample($')" = 3 ] &&
    [ "$(code "$SHIM" | grep -c 'tap_unity ? (int32_t)lroundf((float)fx_buf\[i\] \* shadow_chain_slots\[s\].fade.gain)')" = 3 ] &&
    [ "$(code "$SHIM" | grep -c ': !tap_silenced ? contrib$')" = 3 ] &&
    [ "$(code "$SHIM" | grep -c 'const int tap_unity = tap && sampler_take_tap_unity(sampler_take_src_kind);')" = 3 ] &&
    [ "$(code "$SHIM" | grep -c 'const int tap_silenced = tap && sampler_take_tap_silenced(')" = 3 ] &&
    [ "$(code "$SHIM" | grep -c 'sampler_take_tap_as_set(shadow_chain_slots\[s\].volume, tap_pl, tap_pr, i)')" = 3 ] &&
    [ "$(code "$SHIM" | grep -c 'me_unity\[i\] += contrib;')" = 3 ]
}
check "all three slot mix loops keep the tapped slot's contribution" taps

# A Move track's take (MOVE_CAPTURE_MOVE*) is kept by its bus's block: before the
# inserts (PRE), after them at unity (FX) or at its fader (MOVE, as set when muted).
move_tap() {
    code "$SHIM" | grep -q 'const int mtap = sampler_take_tap_wants_move(' &&
    code "$SHIM" | grep -q 'memcpy(shadow_take_tap, move_track, sizeof(shadow_take_tap));' &&
    code "$SHIM" | grep -q 'mtap_unity ? (int32_t)msrc\[i\]' &&
    code "$SHIM" | grep -q 'sampler_take_tap_as_set(mtap_set_vol, mtap_pl, mtap_pr, i)' &&
    code "$SHIM" | grep -q 'if (mtap_post) shadow_take_tap_valid = 1;'
}
check "a Move bus keeps its track's take, before or after its inserts" move_tap

tail_src() { code "$SHIM" | grep -q 'take_src = shadow_take_tap_valid ? shadow_take_tap : take_silence;' &&
             [ "$(code "$SHIM" | grep -c 'sampler_capture_audio_from_buffer(take_src);')" = 2 ] &&
             ! code "$SHIM" | grep -q 'sampler_capture_audio_from_buffer(unity_view);'; }
check "the take's capture reads its source (tap or mix) on both branches, never unity_view directly" tail_src

void_drop() { code "$SAMP" | grep -A8 'sampler_ring_available_write() < samples_to_write' \
                  | grep -q 'sampler_take_failed = 1;' &&
              code "$SAMP" | grep -A3 'if (sampler_module_take && sampler_take_failed)' | grep -q 'unlink(sampler_current_recording);'; }
check "a dropped block VOIDS a module take and its file is removed" void_drop

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

unity_always() { code "$SHIM" | grep -q 'const int16_t \*take_src = unity_view;' &&
                 code "$SHIM" | grep -A1 '} else if (sampler_module_take) {' \
                     | grep -q 'sampler_capture_audio_from_buffer(take_src)'; }
check "a module take captures its source (unity_view by default) whatever the menu's source" unity_always

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
