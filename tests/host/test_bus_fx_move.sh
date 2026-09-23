#!/usr/bin/env bash
set -euo pipefail
# A BUS reorder (master / send / Move FX), RUN: src/host/bus_fx_move.h is the
# code the dispatcher's "<bus>:fx:move" arms call. Each slot struct moves as
# one element — instance, module ids, bypass, and its out-of-line
# chain_params_cache pointer — the bus's LFO targets follow, and a move into or
# across an empty position is refused (same rule as the slot chain).
cd "$(dirname "$0")/../.."
echo "test_bus_fx_move"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cat > "$work/t.c" <<'C'
#include "bus_fx_move.h"
#include <string.h>
#include <stdlib.h>
static int fails = 0;
static void check(int c, const char *m) { printf("  %s %s\n", c ? "ok  " : "FAIL", m); if (!c) fails++; }
static master_fx_slot_t bus[4];
static lfo_state_t lfos[2];
static char caches[4][16];
static int inst[4];
static void fill(const char *layout) {
    memset(bus, 0, sizeof(bus));
    for (int i = 0; i < 4; i++) {
        bus[i].chain_params_cache = caches[i];
        if (layout[i] == '-') continue;
        bus[i].instance = &inst[i];
        snprintf(bus[i].module_id, sizeof(bus[i].module_id), "%c", layout[i]);
        snprintf(caches[i], sizeof(caches[i]), "params-%c", layout[i]);
        bus[i].bypassed = (layout[i] == 'B');
    }
}
static void order(char *o) { for (int i = 0; i < 4; i++) o[i] = bus[i].module_id[0] ? bus[i].module_id[0] : '-'; o[4] = 0; }
int main(void) {
    char o[5];
    int rc_cached[4] = { 1, 1, 1, 1 };
    fill("ABCD");
    snprintf(lfos[0].target, 16, "fx1"); snprintf(lfos[1].target, 16, "fx4");
    check(shadow_bus_fx_move(bus, 4, lfos, 2, rc_cached, "1>3") == CHAIN_MOVE_OK, "1>3 on a full bus is accepted");
    order(o); check(strcmp(o, "BCAD") == 0, "the bus reads BCAD");
    check(strcmp(bus[2].chain_params_cache, "params-A") == 0, "A's chain_params cache moved WITH it (pointer in the slot)");
    check(bus[0].bypassed == 1, "B's bypass flag moved with B");
    check(strcmp(lfos[0].target, "fx3") == 0, "an LFO on A now targets fx3");
    check(strcmp(lfos[1].target, "fx4") == 0, "an LFO on D (not moved) still targets fx4");
    check(rc_cached[0] == 0 && rc_cached[1] == 0 && rc_cached[2] == 0 && rc_cached[3] == 1,
          "the runtime cache is marked stale for the moved range only");
    fill("A-C-");
    check(shadow_bus_fx_move(bus, 4, NULL, 0, NULL, "1>3") == CHAIN_MOVE_REFUSED, "a move ACROSS an empty position is refused");
    check(shadow_bus_fx_move(bus, 4, NULL, 0, NULL, "3>4") == CHAIN_MOVE_REFUSED, "a move INTO an empty position is refused");
    order(o); check(strcmp(o, "A-C-") == 0, "…and the bus is unchanged");
    fill("AB--");
    check(shadow_bus_fx_move(bus, 4, NULL, 0, NULL, "2>1") == CHAIN_MOVE_OK, "control: a move between two modules goes through");
    order(o); check(strcmp(o, "BA--") == 0, "…BA--");
    check(sizeof(master_fx_slot_t) < 1024, "a bus slot is small now (the 64 KB cache is out of line)");
    if (fails) { printf("FAIL: %d\n", fails); return 1; }
    return 0;
}
C
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function -Isrc/host -Isrc "$work/t.c" -o "$work/t"
"$work/t"
for arm in 'shadow_bus_fx_move(shadow_master_fx_slots, MASTER_FX_SLOTS' \
           'shadow_bus_fx_move(shadow_send_fx_slots[bus], SEND_FX_SLOTS' \
           'shadow_bus_fx_move(shadow_move_fx_slots[sl], MOVE_FX_BLOCKS'; do
  if grep -qF "$arm" src/host/shadow_chain_mgmt.c; then echo "  ok   the dispatcher calls: $arm"; else echo "  FAIL missing arm: $arm"; exit 1; fi
done
hits=$(grep -rnE 'sizeof\s*\(?\s*[a-z_>.-]*chain_params_cache\b' src/ || true)
[ -z "$hits" ] && echo "  ok   no sizeof() on the out-of-line bus chain_params_cache" || { echo "  FAIL sizeof on a pointer field:"; echo "$hits"; exit 1; }
grep -qF 'char *cache = shadow_master_fx_slots[i].chain_params_cache;' src/host/shadow_chain_mgmt.c \
  && echo "  ok   the master-bus reset keeps the cache pointer (memset would null it)" \
  || { echo "  FAIL the master-bus reset no longer preserves the cache pointer"; exit 1; }
echo "PASS: test_bus_fx_move"
