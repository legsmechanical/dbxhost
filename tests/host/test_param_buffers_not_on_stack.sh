#!/usr/bin/env bash
# A SHADOW_PARAM_VALUE_LEN buffer must never be a local, and neither must a
# chain_param_info_t array.
#
# chain_mod_refresh_target_param_cache declared both: 128KB plus ~1.05MB
# (chain_param_info_t is ~4.3KB, of which options[128][32] is 4KB, times
# MAX_CHAIN_PARAMS). That is a ~1.2MB stack frame on a function reachable from
# a plugin entry point -- which IS the SPI callback -- every 250ms. It survived
# because it never crashed on a default 8MB pthread stack; it would not survive
# a smaller one, and the constant it is sized from grows.
#
# ⚠ FORK DIVERGENCE, deliberate. Upstream (#444) made both buffers file-scope
# `static`. This fork had already fixed the same frame in b96b5d0f by putting
# them on the INSTANCE (inst->param_refresh_buf / ->param_refresh_scratch),
# which is strictly stronger: one chain instance per slot, so a static would be
# shared across all 8 and is a latent aliasing bug the moment anything reaches
# it off the callback thread. So we keep ours and this check exempts the struct
# members in chain_internal.h -- a member is per-instance HEAP (the instance is
# calloc'd), never a stack frame, which is the property being defended.
#
# ⭑ WHY THE EXEMPTION IS SAFE, and how that is enforced rather than asserted.
# chain_internal.h is NOT declaration-only: it carries static inline function
# BODIES, so a file-wide exemption could hide a genuine stack frame in one of
# them. The distinction that actually matters is STRUCT REGION vs FUNCTION
# BODY, not the file and not the member's name -- several legitimate members
# there are chain_param_info_t arrays (synth_params, fx_params, midi_fx_params)
# and all of them are per-instance heap. So the file is exempt from the scans
# above, and the region from its first function body onward is scanned
# SEPARATELY below.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail=0

# A declaration of this buffer that is not static and not a parameter.
while IFS= read -r hit; do
    case "$hit" in
        *static*|*"const char"*|*"char *"*) continue ;;
        *shadow_constants.h*) continue ;;   # shadow_param_t's own member
        *chain_internal.h*) continue ;;     # struct members; bodies scanned separately below
    esac
    echo "FAIL: SHADOW_PARAM_VALUE_LEN buffer on the stack: $hit"
    fail=1
done < <(grep -rn "^[[:space:]]*[a-z_]* *char [a-z_]*\[SHADOW_PARAM_VALUE_LEN\]" src/ || true)

while IFS= read -r hit; do
    case "$hit" in
        *static*) continue ;;
        *chain_internal.h*) continue ;;   # struct members; bodies scanned separately below
    esac
    echo "FAIL: chain_param_info_t array on the stack: $hit"
    fail=1
done < <(grep -rn "^[[:space:]]*chain_param_info_t [a-z_]*\[" src/ || true)

# chain_internal.h is exempt above because its matches are struct members. That
# holds only for the declaration region, so scan its FUNCTION BODIES on their
# own -- everything from the first one to the end of the file.
hdr=src/modules/chain/dsp/chain_internal.h
first_body=$(grep -nE "^(static |static inline |[a-zA-Z_]).*\)[[:space:]]*\{" "$hdr" | head -1 | cut -d: -f1 || true)
if [ -n "${first_body:-}" ]; then
    if tail -n "+$first_body" "$hdr" | grep -qE "^[[:space:]]+(chain_param_info_t [a-z_]*\[|[a-z_]* *char [a-z_]*\[SHADOW_PARAM_VALUE_LEN\])"; then
        echo "FAIL: a big param buffer is declared inside a function body in $hdr"
        echo "      (the file-wide exemption above covers STRUCT MEMBERS only)"
        fail=1
    fi
else
    # No function bodies at all is fine, and means the exemption is trivially
    # safe -- but say so, because silence here would look like a passing scan.
    echo "  note: $hdr has no function bodies; exemption covers declarations only"
fi

# The two members the 1.2MB frame was moved into must still BE members. If one
# is renamed or removed the exemption stops defending anything, silently.
for member in "chain_param_info_t param_refresh_scratch\[MAX_CHAIN_PARAMS\];" \
              "char param_refresh_buf\[SHADOW_PARAM_VALUE_LEN\];"; do
    if ! grep -qE "^[[:space:]]+$member" "$hdr"; then
        echo "FAIL: exempted member missing from chain_internal.h: $member"
        echo "      (b96b5d0f put these on the instance; if that was undone, say so here)"
        fail=1
    fi
done

# The segment must be able to hold the struct; the compile-time check in
# shadow_constants.h enforces it, this says so where a reader will look.
value_len=$(grep -oE '^#define SHADOW_PARAM_VALUE_LEN +[0-9]+' src/host/shadow_constants.h | grep -oE '[0-9]+$')
buffer=$(grep -oE '^#define SHADOW_PARAM_BUFFER_SIZE +[0-9]+' src/host/shadow_constants.h | grep -oE '[0-9]+$')
if [ "$buffer" -le "$value_len" ]; then
    echo "FAIL: SHADOW_PARAM_BUFFER_SIZE ($buffer) must exceed SHADOW_PARAM_VALUE_LEN ($value_len)"
    fail=1
fi

[ "$fail" -eq 0 ] && echo "PASS: param buffers are off the stack, and the segment holds the struct ($value_len in $buffer)"
exit "$fail"
