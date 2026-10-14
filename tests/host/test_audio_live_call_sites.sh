#!/usr/bin/env bash
# The mirror's sound is only the device's sound if the shim taps the mix at
# the one place it is the CAPTURE view: right after unity_view is snapshotted
# for Skipback and the sampler, before master volume and the speaker EQ. Move
# the push and the page still plays and records -- a different signal, at a
# level that follows the volume knob, and nothing else in the suite would
# notice. So this is a source pin, plus the realtime rule: the push runs on
# SCHED_FIFO 90 and must stay a plain copy, written only while a mirror wants it.
set -u
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c
HDR=src/host/audio_live_shm.h
for f in "$SHIM" "$HDR"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}
code() { grep -vE '^\s*(/\*|\*|//)' "$1"; }
SHIM_CODE=$(code "$SHIM")
line_of() { printf '%s\n' "$SHIM_CODE" | grep -nF "$1" | sed -n 1p | cut -d: -f1; }

echo "audio_live call sites:"
SNAP=$(line_of 'native_capture_total_mix_snapshot_from_buffer(unity_view);')
PUSH=$(line_of 'audio_live_push(audio_live_shm, unity_view, FRAMES_PER_BLOCK, 1.0f);')
VOL=$(line_of 'float scaled = (float)mailbox_audio[i] * mv_ramp[i >> 1];')
check "the capture snapshot was found" test -n "$SNAP"
check "the full-mix push was found" test -n "$PUSH"
check "the master-volume scaling was found" test -n "$VOL"
after_snapshot() { [ -n "$SNAP" ] && [ -n "$PUSH" ] && [ "$PUSH" -gt "$SNAP" ] && [ $((PUSH - SNAP)) -le 3 ]; }
check "the full-mix push follows the capture snapshot directly (unity, pre-volume)" after_snapshot
before_volume() { [ -n "$PUSH" ] && [ -n "$VOL" ] && [ "$PUSH" -lt "$VOL" ]; }
check "the full-mix push comes before master volume is applied" before_volume

every_push_is_gated() {
    local n g
    n=$(printf '%s\n' "$SHIM_CODE" | grep -c 'audio_live_push(')
    g=$(printf '%s\n' "$SHIM_CODE" | grep -B6 'audio_live_push(' | grep -c 'if (audio_live_wanted())')
    [ "$n" -eq 3 ] && [ "$g" -eq 2 ]
}
check "both pushes (full mix, fast path) run only while a mirror wants sound" every_push_is_gated

# The microphone. The third push is the hardware input, and four things about
# it are invisible to every other test: it reads `hw` (the shadow's copy is
# overwritten with the mix by the resample bridge -- the page would record the
# device twice and no voice); it is not inside the sampler-source branch; its
# gate needs the byte only the DEVICE can set (/mirror takes no login); and
# the shim clears that byte at start, so it never outlives a session.
MIC='audio_live_push(audio_mic_shm, (const int16_t *)(hw + AUDIO_IN_OFFSET), FRAMES_PER_BLOCK, 1.0f);'
MICL=$(line_of "$MIC")
POST=$(line_of 'static void shim_post_transfer(')
SAMP=$(line_of 'if (sampler_source == SAMPLER_SOURCE_MOVE_INPUT) {')
check "the microphone push reads this frame's HARDWARE input" test -n "$MICL"
mic_gated() { [ -n "$MICL" ] && printf '%s\n' "$SHIM_CODE" | sed -n "$((MICL - 1))p" | grep -q 'if (audio_mic_wanted())'; }
check "it runs only while the microphone is wanted" mic_gated
mic_placed() { [ -n "$MICL" ] && [ -n "$POST" ] && [ -n "$SAMP" ] && [ "$MICL" -gt "$POST" ] && [ "$MICL" -lt "$SAMP" ]; }
check "it sits in post-transfer, outside the sampler-source branch" mic_placed
MIC_GATE=$(printf '%s\n' "$SHIM_CODE" | grep -A3 'static inline int audio_mic_wanted(void)')
mic_gate_mirror() { printf '%s\n' "$MIC_GATE" | grep -q 'shadow_control->display_mirror'; }
mic_gate_device() { printf '%s\n' "$MIC_GATE" | grep -q 'shadow_control->mirror_mic'; }
check "the microphone gate needs the mirror on" mic_gate_mirror
check "the microphone gate needs the DEVICE's switch" mic_gate_device
cleared_at_start() { printf '%s\n' "$SHIM_CODE" | grep -q 'shadow_control->mirror_mic = 0;'; }
check "the shim clears the device's switch at start" cleared_at_start
one_setter() {
    local n
    n=$(grep -rhE 'mirror_mic *= ' src --include='*.c' --include='*.h' | grep -vE '^\s*(/\*|\*|//)' | grep -c .)
    [ "$n" -eq 2 ] && grep -q 'shadow_control->mirror_mic = val ? 1 : 0;' src/shadow/shadow_ui.c
}
check "the only other writer is the device-side binding" one_setter
no_manager_setter() { ! grep -rqiE 'mirror_?mic' schwung-manager --include='*.go'; }
check "the manager (no login) has no handle on the switch" no_manager_setter
mic_name() { grep -q 'define AUDIO_MIC_SHM_NAME *SCHWUNG_SHM_PREFIX "audio-mic"' "$HDR"; }
check "the microphone ring has its own name, composed from SCHWUNG_SHM_PREFIX" mic_name
gate_reads_mirror_flag() {
    printf '%s\n' "$SHIM_CODE" | grep -A2 'static inline int audio_live_wanted(void)' | grep -q 'shadow_control->display_mirror'
}
check "the gate is the session's Mirror Display flag" gate_reads_mirror_flag
name_from_prefix() { grep -q 'define AUDIO_LIVE_SHM_NAME *SCHWUNG_SHM_PREFIX "audio-live"' "$HDR"; }
check "the ring's name is composed from SCHWUNG_SHM_PREFIX" name_from_prefix

# Realtime: nothing in the header that the SPI callback must never do.
HDR_CODE=$(code "$HDR")
for bad in malloc calloc free\( fopen fprintf printf\( unified_log LOG_ pthread_mutex open\( write\( ; do
    clean() { ! printf '%s\n' "$HDR_CODE" | grep -qF "$bad"; }
    check "audio_live_shm.h has no $bad" clean
done

[ "$fails" -eq 0 ] && echo "PASSED" || { echo "FAILED" >&2; exit 1; }
