#!/bin/bash
# The handoff scripts mute the whole mix through shadow_control_t byte 49
# (mute_move_audio) before asking the UI to exit (quiesce-stock.sh) and before
# the SIGTERM (exit-to-stock.sh). The offset is compiled from this fork's
# header; stock v1.4.0's header gives the same 49 (checked 2026-09-15 by
# compiling git show v1.4.0:src/host/shadow_constants.h from schwung-current).
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

# 1. the fork's offset really is 49, and should_exit really is 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/off.c" <<'C'
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include "host/shadow_constants.h"
int main(void){ printf("%zu %zu\n", offsetof(shadow_control_t, mute_move_audio), offsetof(shadow_control_t, should_exit)); return 0; }
C
if cc -I src -I . -o "$tmp/off" "$tmp/off.c" 2>/dev/null && [ "$("$tmp/off")" = "49 2" ]; then
    ok "shadow_control_t: mute_move_audio at 49, should_exit at 2"
else
    bad "shadow_control_t offsets moved — update BOTH handoff scripts and this pin (got: $("$tmp/off" 2>/dev/null))"
fi

Q=standalone/scripts/quiesce-stock.sh
X=standalone/scripts/exit-to-stock.sh

# 2. quiesce: mute (49) is written BEFORE should_exit (2), in the same block
m=$(grep -n 'mm\[49\] = 1' "$Q" | head -1 | cut -d: -f1)
e=$(grep -n 'mm\[2\] = 1'  "$Q" | head -1 | cut -d: -f1)
if [ -n "$m" ] && [ -n "$e" ] && [ "$m" -lt "$e" ]; then
    ok "quiesce-stock.sh mutes (byte 49) before should_exit (byte 2)"
else
    bad "quiesce-stock.sh: mute must precede should_exit (mute line=$m, exit line=$e)"
fi

# 3. quiesce maps the whole control segment, not the stale 84 bytes
if grep -q 'mmap.mmap(f.fileno(), 84)' "$Q"; then
    bad "quiesce-stock.sh still maps 84 bytes of the 256-byte control segment"
else
    ok "quiesce-stock.sh maps the full control segment"
fi

# 4. exit-to-stock: mute our own control segment before the kill
m=$(grep -n 'mm\[49\] = 1' "$X" | head -1 | cut -d: -f1)
k=$(grep -n 'pkill -x MoveOriginal' "$X" | head -1 | cut -d: -f1)
if [ -n "$m" ] && [ -n "$k" ] && [ "$m" -lt "$k" ] && grep -q '/dev/shm/dbxhost-control' "$X"; then
    ok "exit-to-stock.sh mutes /dev/shm/dbxhost-control byte 49 before pkill"
else
    bad "exit-to-stock.sh: mute must precede the pkill (mute line=$m, kill line=$k)"
fi

# 5. both scripts still parse
sh -n "$Q" && sh -n "$X" && ok "both scripts parse" || bad "a handoff script does not parse"

# Control: reverting either script's mute line makes step 2 or 4 fail (the
# grep for 'mm[49] = 1' returns nothing).
[ "$fail" = 0 ] && echo "PASS: handoff mute precedes exit on both directions" || { echo "FAIL: handoff mute"; exit 1; }
