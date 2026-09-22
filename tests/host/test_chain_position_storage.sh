#!/usr/bin/env bash
set -euo pipefail
# Per-position FX storage is OUT OF LINE, one block per position, never NULL.
#
# fx_params / fx_ui_hierarchy used to be inline in chain_instance_t — ~1.1 MB +
# 64 KB per position — so reordering the chain (swapping two positions) would
# have copied megabytes on the SPI callback. As pointers a move rotates them.
# Two things can undo that silently:
#   - a position left NULL (a hand-built instance, a failed alloc not handled)
#     crashes on the first parse into it;
#   - sizeof(inst->fx_ui_hierarchy[x]) on a POINTER is 8, and the hierarchy
#     cache would quietly truncate to 7 bytes. Size with CHAIN_UI_HIERARCHY_LEN.
cd "$(dirname "$0")/../.."
echo "test_chain_position_storage"
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

# 1. No sizeof on the pointer fields anywhere in the chain DSP.
hits=$(grep -rnE 'sizeof\s*\(?\s*inst->(fx_params|fx_ui_hierarchy)' src/modules/chain/dsp/ || true)
[ -z "$hits" ] && ok "no sizeof() on the out-of-line position fields" || { bad "sizeof on a pointer field:"; echo "$hits" >&2; }
# control: the pattern does catch the old spelling
ctl=$(printf 'x = sizeof(inst->fx_ui_hierarchy[slot]);\n' | grep -E 'sizeof\s*\(?\s*inst->(fx_params|fx_ui_hierarchy)' || true)
[ -n "$ctl" ] && ok "⚠ control: the pattern catches the old sizeof spelling" || bad "control: pattern does not match the old spelling"

# 2. The real helpers: every position allocated, full size, freed.
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
printf '#include <stdlib.h>\n' > "$work/malloc.h"
cat > "$work/t.c" <<'C'
#include "chain_internal.h"
#include <stdio.h>
#include <string.h>
int main(void) {
    chain_instance_t *inst = calloc(1, sizeof(*inst));
    if (chain_alloc_position_storage(inst) != 0) { puts("FAIL alloc"); return 1; }
    for (int i = 0; i < MAX_AUDIO_FX; i++) {
        if (!inst->fx_params[i] || !inst->fx_ui_hierarchy[i]) { puts("FAIL null position"); return 1; }
        memset(inst->fx_ui_hierarchy[i], 'x', CHAIN_UI_HIERARCHY_LEN - 1);          /* whole block writable */
        inst->fx_params[i][MAX_CHAIN_PARAMS - 1].key[0] = 'k';                        /* last param reachable */
        if (inst->fx_ui_hierarchy[i][0] != 'x' || inst->fx_ui_hierarchy[i][1] == 0) { puts("FAIL hierarchy not zeroed/usable"); return 1; }
    }
    if (sizeof(inst->fx_ui_hierarchy[0]) != sizeof(char *)) { puts("FAIL field is not a pointer"); return 1; }
    chain_free_position_storage(inst);
    for (int i = 0; i < MAX_AUDIO_FX; i++)
        if (inst->fx_params[i] || inst->fx_ui_hierarchy[i]) { puts("FAIL not cleared on free"); return 1; }
    printf("struct size now %zu bytes\n", sizeof(chain_instance_t));
    free(inst); puts("OK"); return 0;
}
C
if cc -std=gnu11 -I"$work" -Isrc -Isrc/host -Isrc/modules/chain/dsp "$work/t.c" -o "$work/t" 2>"$work/err"; then
    out="$("$work/t")"; echo "       ${out%%$'\n'*}"
    case "$out" in *$'\n'OK) ok "every position allocated, usable to its full size, and freed" ;; *) bad "helpers: $out" ;; esac
else
    bad "the helpers did not compile: $(head -3 "$work/err")"
fi
[ "$fails" = 0 ] && echo "PASS: test_chain_position_storage" || { echo "FAIL: test_chain_position_storage"; exit 1; }
