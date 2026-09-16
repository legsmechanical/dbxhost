#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# A REQUEST MUST NOT OUTLIVE ITS REQUEST.
#
# This test's concern is unchanged since it was written; only the mechanism it
# guards has been replaced, and by a stronger one (2026-09-16).
#
# It used to pin a boolean: move_intended_index.txt was left on disk by
# launch.sh, so the host had to stop consulting it after the first verdict of
# the process — otherwise every later in-process switch (the select actuator,
# no relaunch) was judged against a pad nobody was asking for any more, and
# raised PROJECT DID NOT OPEN for nothing.
#
# A flag saying "I already used that" is a promise. Now the record is
# CONSUMED: the shim unlinks intended_set.txt the moment it reads it, so a
# stale request is not merely ignored, it does not exist. This is the exact
# failure an adversarial review found in an earlier attempt at this design,
# where a standing request file was re-judged against later, unrelated loads.
#
# What must hold:
#   1. the request is unlinked in the reader itself, BEFORE parsing — a
#      malformed record must not survive to be re-read on every tick forever;
#   2. arming records the reader's counter (n0), because "Move loaded something
#      SINCE I asked" is the whole question and a uuid cannot answer it;
#   3. a settled request stops being one, so a later spontaneous move by Move
#      is judged on its own terms;
#   4. nothing anywhere still reads the retired index-only request file.

f="src/host/shadow_set_pages.c"
fail=0
note() { echo "  FAIL $1" >&2; fail=1; }
ok()   { echo "  ok   $1"; }

echo "a request does not outlive its request:"

reader=$(awk '/^static int identity_read_and_consume_request/,/^}/' "$f")
[ -n "$reader" ] || note "identity_read_and_consume_request() is gone"

# 1. unlink happens in the reader, and BEFORE the parse.
if grep -q 'unlink(MOVE_INTENDED_SET_PATH)' <<<"$reader"; then
    ok "the request file is unlinked by the reader itself"
else
    note "the request file is not consumed — a stale request can be re-judged"
fi
# the unlink must precede the first parse step, or a malformed record persists
unlink_line=$(grep -n 'unlink(MOVE_INTENDED_SET_PATH)' <<<"$reader" | head -1 | cut -d: -f1)
parse_line=$(grep -n "strchr(buf" <<<"$reader" | head -1 | cut -d: -f1)
if [ -n "$unlink_line" ] && [ -n "$parse_line" ] && [ "$unlink_line" -lt "$parse_line" ]; then
    ok "...before parsing, so a malformed record cannot be re-read every tick"
else
    note "the unlink does not precede the parse (unlink=$unlink_line parse=$parse_line)"
fi

# 2. arming records the counter.
arm=$(awk '/^void shadow_set_identity_arm\(void\)/,/^}/' "$f")
if grep -q 'identity_req_n0 = line.n;' <<<"$arm"; then
    ok "arming records the reader's counter (n0)"
else
    note "arming does not record n0 — a line older than the request could confirm it"
fi
if grep -q 'if (!identity_read_and_consume_request(&r)) return;' <<<"$arm"; then
    ok "no request record, no arming (a bare file touch cannot arm a wait)"
else
    note "arming proceeds without a request record"
fi

# 3. a settled request stops being one.
tick=$(awk '/^static void identity_tick/,/^}/' "$f")
if grep -q 'if (rec.state != LOADED_SET_PENDING) identity_have_request = 0;' <<<"$tick"; then
    ok "a settled request is cleared, so a later move by Move is judged on its own"
else
    note "a settled request stays armed — the retired 'judged against a stale pad' bug"
fi

# 4. the retired index-only file is no longer USED anywhere.
#    ⚠ Match CODE, not the word. The header legitimately names the retired
#    file in prose, explaining what replaced it — and an earlier cut of this
#    check counted that comment and failed against a correct tree. Its sibling
#    test_provisional_set_uuid.sh records the same lesson for the same reason:
#    a source pin must read code. So: the C macro, or the filename followed by
#    a quote (its shell use was "$DBX_DIR/move_intended_index.txt").
used=$(grep -rnE 'MOVE_INTENDED_INDEX|move_intended_index\.txt"' src/ standalone/ davebox/ 2>/dev/null | grep -v '^Binary' || true)
if [ -n "$used" ]; then
    echo "    still used:" >&2; printf '%s\n' "$used" | head -5 >&2
    note "the retired index-only request file is still used somewhere"
else
    ok "nothing reads the retired index-only request file"
fi
#    ⚠ CONTROL: that pattern must be capable of finding a real use.
if printf 'x = MOVE_INTENDED_INDEX_PATH;\n' | grep -qE 'MOVE_INTENDED_INDEX|move_intended_index\.txt"'; then
    ok "control: the pattern does match a real use when one exists"
else
    note "control: the pattern matches nothing at all — the check above is vacuous"
fi

# ⚠ CONTROL: the checks above must be reading live code, not comments. Every
# pattern is matched inside an awk-extracted function body, but that is only
# true while those functions exist under these names.
for fn in identity_read_and_consume_request shadow_set_identity_arm identity_tick; do
    if grep -q "$fn" "$f"; then ok "control: $fn is present to be read"
    else note "control: $fn not found — the checks above matched nothing"; fi
done

if [ "$fail" = 0 ]; then echo "PASS: a request is consumed, never merely ignored"; fi
exit "$fail"
