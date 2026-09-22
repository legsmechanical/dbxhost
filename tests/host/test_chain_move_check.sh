#!/usr/bin/env bash
set -euo pipefail
# The dispatcher's answer to "fx:move" (src/host/chain_move_check.h), RUN: the
# chain's set_param cannot refuse with an answer, so this is where a bad move
# is turned away and dAVEBOx learns it (the set returns false).
cd "$(dirname "$0")/../.."
echo "test_chain_move_check"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cat > "$work/t.c" <<'C'
#include "chain_move_check.h"
#include <string.h>
static int fails = 0;
static void check(int c, const char *m) { printf("  %s %s\n", c ? "ok  " : "FAIL", m); if (!c) fails++; }
static int occ(void *ctx, int pos) { const char *l = ctx; return l[pos - 1] != '-'; }
int main(void) {
    char full[] = "ABCD", holey[] = "A-C-";
    check(chain_fx_move_check("1>3", 4, 0, occ, full) == CHAIN_MOVE_OK,      "control: 1>3 on a full chain is allowed");
    check(chain_fx_move_check("4>1", 4, 0, occ, full) == CHAIN_MOVE_OK,      "a move upward is allowed");
    check(chain_fx_move_check("1>3", 4, 1, occ, full) == CHAIN_MOVE_BUSY,    "a chain still being rendered answers BUSY");
    check(chain_fx_move_check("1>3", 4, 0, occ, holey) == CHAIN_MOVE_REFUSED, "a move ACROSS a hole is refused");
    check(chain_fx_move_check("3>4", 4, 0, occ, holey) == CHAIN_MOVE_REFUSED, "a move INTO a hole is refused");
    check(chain_fx_move_check("2>2", 4, 0, occ, full) == CHAIN_MOVE_REFUSED, "a move to the same position is refused");
    check(chain_fx_move_check("0>2", 4, 0, occ, full) == CHAIN_MOVE_REFUSED && chain_fx_move_check("1>5", 4, 0, occ, full) == CHAIN_MOVE_REFUSED,
          "out of range is refused");
    check(chain_fx_move_check("12", 4, 0, occ, full) == CHAIN_MOVE_REFUSED && chain_fx_move_check(NULL, 4, 0, occ, full) == CHAIN_MOVE_REFUSED,
          "a malformed or missing value is refused");
    check(chain_fx_move_check("2>2", 4, 1, occ, full) == CHAIN_MOVE_REFUSED, "a malformed move is REFUSED even while busy (retrying would not help)");
    if (fails) { printf("FAIL: %d\n", fails); return 1; }
    return 0;
}
C
cc -std=gnu11 -Wall -Wextra -Isrc/host "$work/t.c" -o "$work/t"
"$work/t"
# The dispatcher really calls it — for the slot verb, ahead of the chain.
grep -q 'chain_fx_move_check(value, 4, busy, slot_fx_occupied, &slot)' src/host/shadow_chain_mgmt.c \
  && echo "  ok   the dispatcher's fx:move arm calls chain_fx_move_check" \
  || { echo "  FAIL the dispatcher does not call chain_fx_move_check"; exit 1; }
echo "PASS: test_chain_move_check"
