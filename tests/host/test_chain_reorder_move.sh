#!/usr/bin/env bash
set -euo pipefail
# chain_reorder_move on a REAL chain_instance_t — this fork's rules, not the
# permute header's: four fixed positions, a move never crosses a hole, the
# high-water mark follows the modules, and every "fxN" reference (knob maps,
# LFOs, modulation targets) follows the module it named. The header's own
# behaviour is test_chain_permute.sh; the field list is pinned there too.
cd "$(dirname "$0")/../.."
echo "test_chain_reorder_move"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
printf '#include <stdlib.h>\n' > "$work/malloc.h"
cat > "$work/t.c" <<'C'
#include "chain_internal.h"
#include <stdio.h>
#include <string.h>
static int fails = 0;
static void check(int c, const char *m) { printf("  %s %s\n", c ? "ok  " : "FAIL", m); if (!c) fails++; }
static chain_instance_t *fresh(const char *layout) {   /* e.g. "AB-C": '-' = empty */
    chain_instance_t *inst = calloc(1, sizeof(*inst));
    chain_alloc_position_storage(inst);
    static char dummy[4];
    for (int i = 0; i < 4; i++) {
        if (layout[i] == '-') continue;
        inst->fx_instances[i] = &dummy[i];
        inst->fx_handles[i] = &dummy[i];
        snprintf(inst->current_fx_modules[i], MAX_NAME_LEN, "%c", layout[i]);
        snprintf(inst->fx_params[i][0].key, sizeof(inst->fx_params[i][0].key), "p%c", layout[i]);
        inst->fx_param_counts[i] = 1;
        inst->fx_bypassed[i] = (layout[i] == 'B');
        inst->fx_count = i + 1;
    }
    return inst;
}
static void order(chain_instance_t *inst, char *out) {
    for (int i = 0; i < 4; i++) out[i] = inst->current_fx_modules[i][0] ? inst->current_fx_modules[i][0] : '-';
    out[4] = 0;
}
int main(void) {
    char o[5];
    chain_instance_t *inst = fresh("ABC-");
    /* references naming fx1 (A) and fx3 (C) */
    inst->knob_mapping_count = 1; snprintf(inst->knob_mappings[0].target, 16, "fx1");
    snprintf(inst->lfos[0].target, 16, "fx3");
    inst->mod_target_count = 1; inst->mod_targets[0].active = 1; snprintf(inst->mod_targets[0].target, 16, "fx1");
    snprintf(inst->lfos[1].target, 16, "synth");

    check(chain_reorder_set_param(inst, "fx:move", "1>3") == 1, "\"fx:move\" is claimed by the reorder door");
    order(inst, o); check(strcmp(o, "BCA-") == 0, "1>3 rotates A to the third position: BCA-");
    check(strcmp(inst->fx_params[2][0].key, "pA") == 0, "A's param table moved WITH it (owned buffer rotated)");
    check(inst->fx_bypassed[0] == 1 && inst->fx_bypassed[2] == 0, "the bypass flag followed its module (B, now fx1)");
    check(strcmp(inst->knob_mappings[0].target, "fx3") == 0, "a knob map on A now names fx3");
    check(strcmp(inst->mod_targets[0].target, "fx3") == 0, "a modulation target on A now names fx3");
    check(strcmp(inst->lfos[0].target, "fx2") == 0, "an LFO on C (was fx3) now names fx2");
    check(strcmp(inst->lfos[1].target, "synth") == 0, "a target outside the FX section is untouched");
    check(inst->fx_count == 3, "the high-water mark is still 3");
    check(inst->dirty == 1, "a move marks the chain modified");

    inst->dirty = 0;
    check(chain_reorder_set_param(inst, "fx:move", "3>4") == 1 && inst->dirty == 0, "moving INTO the empty fx4 is refused");
    check(chain_reorder_move(inst, 1, 1) == 0, "a move to the same position is refused");
    check(chain_reorder_move(inst, -1, 0) == 0 && chain_reorder_move(inst, 0, 4) == 0, "out of range is refused");
    check(chain_reorder_set_param(inst, "fx:move", "garbage") == 1 && inst->dirty == 0, "a malformed value is claimed and changes nothing");
    check(chain_reorder_set_param(inst, "fx1:move", "1>2") == 0, "a module's own \"move\" param (fx1:move) is NOT claimed");
    order(inst, o); check(strcmp(o, "BCA-") == 0, "…and after all the refusals the order is unchanged");

    chain_instance_t *h = fresh("A-C-");
    check(chain_reorder_move(h, 0, 2) == 0, "a move ACROSS a hole is refused (the save would compact it)");
    order(h, o); check(strcmp(o, "A-C-") == 0, "…and leaves A-C- as it was");
    chain_instance_t *d = fresh("AB--");
    check(chain_reorder_move(d, 1, 0) == 1, "control: a move between two occupied positions goes through");
    order(d, o); check(strcmp(o, "BA--") == 0 && d->fx_count == 2, "…BA-- with the mark at 2");

    if (fails) { printf("FAIL: %d\n", fails); return 1; }
    puts("PASS"); return 0;
}
C
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function \
  -I"$work" -Isrc -Isrc/host -Isrc/modules/chain/dsp \
  "$work/t.c" src/modules/chain/dsp/chain_reorder.c -o "$work/t"
"$work/t"
echo "PASS: test_chain_reorder_move"
