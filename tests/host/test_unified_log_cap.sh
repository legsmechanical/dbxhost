#!/usr/bin/env bash
# The unified log is CAPPED (Josh, 2026-09-28: "some reasonable logging always
# on (even for testers). just need to make sure it doesn't balloon to a massive
# size"). Compiles the REAL src/host/unified_log.c against a temp install dir
# with a small cap, then:
#   - one writer logs well past the cap: debug.log rotated to debug.log.1,
#     both stay near the cap, and the newest line is in debug.log;
#   - a SECOND writer that opened the file before a rotation follows it to the
#     new debug.log instead of writing on into debug.log.1 forever.
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fail=1; }

T=$(mktemp -d "${TMPDIR:-/tmp}/ulogcap.XXXXXX"); trap 'rm -rf "$T"' EXIT
CAP=65536
cat > "$T/w.c" <<'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include "unified_log.h"
/* argv[1] = lines to write, argv[2] = tag, argv[3] = seconds to wait between
 * a first line and the rest (lets another writer rotate underneath us). */
int main(int argc, char **argv) {
    int n = atoi(argv[1]); int pause_s = argc > 3 ? atoi(argv[3]) : 0;
    unified_log_init();
    unified_log_important("t", LOG_LEVEL_INFO, "%s first", argv[2]);
    if (pause_s) sleep(pause_s);
    for (int i = 0; i < n; i++)
        unified_log_important("t", LOG_LEVEL_INFO, "%s line %06d padding-padding-padding-padding-padding", argv[2], i);
    unified_log_important("t", LOG_LEVEL_INFO, "%s LAST", argv[2]);
    return 0;
}
EOF
if ! ${CC:-cc} -O0 -I src/host -I src -DSCHWUNG_INSTALL_DIR="\"$T\"" -DUNIFIED_LOG_MAX_BYTES=$CAP \
        -o "$T/w" "$T/w.c" src/host/unified_log.c -lpthread 2>"$T/cc.err"; then
    echo "FAIL: could not compile the log writer"; cat "$T/cc.err"; exit 1
fi
touch "$T/debug_log_on"

echo "one writer, well past the cap:"
"$T/w" 5000 A >/dev/null
sz=$(wc -c < "$T/debug.log"); sz1=$(wc -c < "$T/debug.log.1" 2>/dev/null || echo 0)
[ -f "$T/debug.log.1" ] && ok "rotated to debug.log.1" || bad "no rotation (debug.log is $sz bytes)"
[ "$sz" -le $((CAP + 65536)) ] && ok "debug.log stays near the cap ($sz bytes)" || bad "debug.log grew to $sz"
[ "$sz1" -le $((CAP + 65536)) ] && ok "debug.log.1 stays near the cap ($sz1 bytes)" || bad "debug.log.1 is $sz1"
grep -q "A LAST" "$T/debug.log" && ok "the newest line is in debug.log" || bad "A LAST is not in debug.log"

echo "a second writer follows a rotation made by another:"
rm -f "$T/debug.log" "$T/debug.log.1"
"$T/w" 3000 B 2 >/dev/null &      # opens the file, then waits
sleep 1
"$T/w" 5000 C >/dev/null          # rotates underneath B
wait
grep -q "B LAST" "$T/debug.log" && ok "B's last line landed in the NEW debug.log" \
    || bad "B kept writing into the rotated file (B LAST not in debug.log)"
total=$(( $(wc -c < "$T/debug.log") + $(wc -c < "$T/debug.log.1" 2>/dev/null || echo 0) ))
[ "$total" -le $((3 * CAP)) ] && ok "both files together stay bounded ($total bytes)" || bad "total $total"

[ $fail = 0 ] && echo "PASS: the unified log is capped, and every writer follows a rotation"
exit $fail
