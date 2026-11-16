#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# THE CHANNEL STRIP — comp, then 3-band EQ — on every mixer strip (mix_strip.h).
#
#   RUN   the DSP itself (tests/host/test_mix_strip.c): band gains, the comp's
#         voicing, stereo link, bypass, stability, keys.
#   PIN   that EVERY mix site runs it, in the right place. Four slot sites (the
#         Move->Schwung rebuild, deferred FX, the legacy inline path, and the
#         no-FX-hook fallback task) plus the Move FX bus. A site left out is a
#         strip that works in one audio mode only. The FX-at-unity capture tap
#         must stay BEFORE the strip (a bounce that plays on through the same
#         strip would get it twice); the sends, which are post-fader, after it.

bin="build/tests/test_mix_strip"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-parameter -Isrc/host tests/host/test_mix_strip.c -o "$bin" -lm
"$bin"

fail() { echo "FAIL: $*"; exit 1; }
shim=src/schwung_shim.c
cnt() { grep -cF -- "$1" "$2" || true; }

n=$(cnt 'shadow_strip_run(&shadow_chain_slots[s].strip, fx_buf, strip_buf);' "$shim")
[ "$n" -eq 3 ] || fail "$n slot FX mix sites run the strip, want 3 (rebuild, deferred, legacy)"
n=$(cnt 'shadow_strip_run(&shadow_chain_slots[s].strip, render_buffer, strip_buf);' "$shim")
[ "$n" -eq 1 ] || fail "the no-FX-hook fallback does not run the strip"
n=$(cnt 'shadow_strip_run(&shadow_move_fx_strip[s].strip, msrc, mstrip_buf);' "$shim")
[ "$n" -eq 1 ] || fail "the Move FX bus does not run the strip"

# After the strip: the mix, the sends, the publish
n=$(cnt 'int32_t contrib = (int32_t)lroundf((float)sx[i] * vol);' "$shim")
[ "$n" -eq 3 ] || fail "$n slot mix loops read the strip output, want 3"
if grep -qF 'int32_t contrib = (int32_t)lroundf((float)fx_buf[i] * vol);' "$shim"; then fail "a slot mix loop reads fx_buf (pre-strip)"; fi
n=$(cnt 'accumulate_sends(s, sx, send_accum);' "$shim")
[ "$n" -eq 3 ] || fail "$n slot send taps read the strip output, want 3"
grep -qF 'accumulate_sends_ex(mstr, mvol,' "$shim" || fail "the Move FX bus sends do not read the strip output"
grep -qF 'int32_t scaled = (int32_t)lroundf((float)mstr[i] * mix_glide_gain(bg, i));' "$shim" || fail "the Move FX bus mix does not read the strip output"
n=$(cnt '(int16_t)lroundf((float)sx[i] * cap_vol)' "$shim")
[ "$n" -eq 3 ] || fail "$n Link Audio publishes read the strip output, want 3"

# Before the strip: the FX-at-unity take
n=$(cnt 'tap_unity ? (int32_t)lroundf((float)fx_buf[i] * shadow_chain_slots[s].fade.gain)' "$shim")
[ "$n" -eq 3 ] || fail "$n slot FX-at-unity takes read fx_buf (pre-strip), want 3"
grep -qF 'mtap_unity ? (int32_t)msrc[i]' "$shim" || fail "the Move FX bus FX-at-unity take no longer reads msrc (pre-strip)"

# Once per block
grep -qF 'shadow_strip_block++;' "$shim" || fail "nothing advances the strip's block counter"

# Keys: the slot handler and all FOUR Move-bus sites (direct get, direct set,
# apply_set_ex, mailbox get) — one missed is a key that works one way only
mg=src/host/shadow_chain_mgmt.c
n=$(cnt 'shadow_move_fx_strip[sl].strip' "$mg")
[ "$n" -eq 4 ] || fail "$n Move-bus key sites know the strip, want 4"
grep -qF 'mix_strip_set_key(&shadow_chain_slots[slot].strip, key + 5, value)' "$mg" || fail "slot: strip keys are not set"
grep -qF 'mix_strip_get_key(&shadow_chain_slots[slot].strip, key + 5, buf, buf_len)' "$mg" || fail "slot: strip keys are not read"
grep -qF 'mix_strip_init(&shadow_chain_slots[i].strip);' "$mg" || fail "slot defaults do not init the strip"

# The shim rebuilds when the header changes (or a deploy is a silent no-op)
awk '/needs_rebuild build\/schwung-shim.so/,/then/' scripts/build.sh | grep -q 'src/host/mix_strip.h' \
    || fail "scripts/build.sh's shim rebuild list lacks mix_strip.h"

# Persistence: both writers of shadow_chain_config.json carry it
grep -qF '"slot:strip",' src/shadow/shadow_ui.js || fail "the shadow UI's slot config does not read slot:strip"
grep -qF '\"comp\": %.4f' src/host/shadow_set_pages.c || fail "the C config writer does not write the strip"
grep -qF '"move_fx:" + (sl + 1) + ":strip"' src/shadow/shadow_ui.js || fail "the Move FX bus restore does not write the strip"

echo "PASS: the channel strip runs at every mix site, after the FX-at-unity tap and before the sends"
