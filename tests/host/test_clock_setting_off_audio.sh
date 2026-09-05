#!/bin/bash
# test_clock_setting_off_audio.sh — Move's MIDI Clock Out preference is read
# from Settings.json ONLY on the shim worker; the audio path reads a word.
#
# ⚠ THE BUG THIS PINS (2026-09-05): chain_midi.c fopen'd Settings.json from
# chain_get_clock_status(), which sub-plugins call from render — the SPI
# callback. Throttled to once a second, it was rare, not safe
# (docs/REALTIME_SAFETY.md §1: file I/O there can spike to 78 ms).
set -e
cd "$(dirname "$0")/../.."
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }

# 1. the chain never opens the settings file
! grep -rq 'MOVE_SETTINGS_JSON_PATH' src/modules/chain/dsp/*.c \
    && say "ok   — no chain source uses MOVE_SETTINGS_JSON_PATH" || bad "the chain still opens the settings path"
refresh=$(awk '/^static void chain_refresh_clock_output_enabled\(/{f=1} f{print} f&&/^}/{exit}' src/modules/chain/dsp/chain_midi.c)
[ -n "$refresh" ] && ! echo "$refresh" | grep -q 'fopen\|fread\|malloc' \
    && say "ok   — the clock-status refresh does no file I/O and no allocation" || bad "the refresh still does I/O"
grep -q 'clock_output_enabled()' src/modules/chain/dsp/chain_midi.c \
    && say "ok   — the chain takes the flag from host_api_v1.clock_output_enabled" || bad "chain does not read the host word"

# 2. the ONLY reader of the file is the worker (allowed readers listed here)
readers=$(grep -rl 'move_clock_output_enabled_read(' src --include='*.c' | sort | tr '\n' ' ')
[ "$readers" = "src/host/shim_worker.c " ] \
    && say "ok   — move_clock_output_enabled_read is called from shim_worker.c only" || bad "unexpected readers: $readers"
grep -q 'move_clock_output_enabled_read(MOVE_SETTINGS_JSON_PATH)' src/host/shim_worker.c \
    && say "ok   — ...at the worker's 1 Hz poll" || bad "worker does not refresh the flag"

# 3. the word is published and registered in both host apis
grep -q 'int (\*clock_output_enabled)(void);' src/host/plugin_api_v1.h && say "ok   — host_api_v1 carries clock_output_enabled" || bad "api field missing"
grep -q 'shadow_host_api.clock_output_enabled = shim_clock_output_enabled_get' src/host/shadow_chain_mgmt.c && say "ok   — chain slots get the worker's word" || bad "chain api not registered"
grep -q 'overtake_host_api.clock_output_enabled = shim_clock_output_enabled_get' src/schwung_shim.c && say "ok   — the overtake DSP gets it too" || bad "overtake api not registered"
grep -q '__ATOMIC_RELEASE' src/host/shim_worker.c && grep -q '__ATOMIC_ACQUIRE' src/host/shim_worker.c \
    && say "ok   — release-store / acquire-load across the threads" || bad "publication is not atomic"

# 4. the audio path's default without a host word is ENABLED (old unreadable-file semantics)
grep -q 'h->clock_output_enabled() : 1' src/modules/chain/dsp/chain_midi.c && say "ok   — no callback = enabled, as an unreadable file was" || bad "default changed"

# control: the pin can fail
echo 'FILE *f = fopen(MOVE_SETTINGS_JSON_PATH, "r");' | grep -q 'fopen(' && say "ok   — control: the old line would fail the fopen pin" || bad "control broken"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
