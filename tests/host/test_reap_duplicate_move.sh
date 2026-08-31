#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../.."

# reap-duplicate-move.sh force-kills Move processes. A force-killed Move READS
# AS A CRASH — Ableton files a report and the next boot tells the user Move
# crashed — so this script's idea of "duplicate" has to be exactly right.
#
# ⚠⚠ THE BUG THIS EXISTS FOR, and it shipped. It counted every MoveOriginal pid
# as an instance. On device a HEALTHY stack shows two: the application (21
# threads) and a forked helper of its own (2 threads, the parent's fds inherited).
# Both sit in move-launcher.service's cgroup, so the supervised() test could not
# separate them — whichever `pidof` listed first was kept and the other killed.
# When that was the application, the supervisor restarted it, the loop saw two
# again and killed again: 6819 -> 6906 -> 6964 -> 7048 -> 7201 in thirteen
# seconds, escalating to SIGKILL each time. Reported as "move native crashes
# shortly after reloading from davebox exit".
#
# ⭑ The logic is exercised with parentage INJECTED. ppid_of reads /proc, which
# does not exist on the machine this suite usually runs on — a test that shelled
# out to real processes silently measured nothing (it returned ppid 0 for every
# pid and "passed" the cases that wanted no relationship).

src=standalone/scripts/reap-duplicate-move.sh
[ -f "$src" ] || { echo "FAIL: $src missing"; exit 1; }

eval "$(awk '/^instances\(\)/,/^}/' "$src")"
if ! type instances >/dev/null 2>&1; then
    echo "FAIL: instances() not found in $src — was it renamed? This pin is now blind."
    exit 1
fi

# Injected process table: pid -> parent.
declare -A PPID_TABLE=()
ppid_of() { echo "${PPID_TABLE[$1]:-0}"; }

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }
run() { echo $(instances "$1") ; }

# A Move and its own forked helper — the real device shape.
PPID_TABLE=([1397]=1254 [1634]=1397)
got=$(run "1397 1634")
[ "$got" = "1397" ] && ok "a Move's own child is NOT a second instance" \
  || bad "child counted as an instance: got '$got', wanted '1397'"

# ...and the order pidof reports them in must not change the answer.
got=$(run "1634 1397")
[ "$got" = "1397" ] && ok "the answer does not depend on pidof's ordering" \
  || bad "order changed the answer: got '$got'"

# ⚠ THE CONTROL. A genuine duplicate launch — two Moves with unrelated parents —
# must still be reaped, or this fix would quietly disable the whole script.
PPID_TABLE=([100]=1 [200]=2)
got=$(run "100 200")
[ "$(echo "$got" | wc -w | tr -d ' ')" = "2" ] && ok "two unrelated Moves are still two instances" \
  || bad "a real duplicate stopped being detected: got '$got'"

# A grandchild belongs to the instance above it too.
PPID_TABLE=([10]=1 [11]=10 [12]=11)
got=$(run "10 11 12")
[ "$got" = "10" ] && ok "a whole descendant chain collapses to one instance" \
  || bad "grandchild not excluded: got '$got'"

# Degenerate inputs must not produce a kill list.
PPID_TABLE=([5]=1)
[ "$(run "5")" = "5" ] && ok "a lone Move is an instance" || bad "lone Move lost"
[ -z "$(run "")" ] && ok "no Moves = no instances" || bad "empty input produced a candidate"

[ "$fail" = 0 ] && echo "PASS: only true duplicate INSTANCES are reaped" || echo "FAIL"
exit $fail
