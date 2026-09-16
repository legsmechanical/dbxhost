#!/usr/bin/env bash
# The param LANE is wired end to end, and wired in the ONE order that works.
#
# The lane (src/host/shadow_param_lane.h) is a second wire for parameter SETs
# alongside the mailbox. Everything about it that can silently break is
# POSITIONAL, and none of it shows up as a compile error or a failing unit:
#
#   - the drain must run BEFORE the mailbox is serviced. A write pushed to the
#     lane before a mailbox GET was issued must be applied before that GET is
#     answered; move the call below shadow_inprocess_handle_param_request and
#     the ordering silently reverses. Nothing in a unit test can see this.
#   - the handshake is one-directional: the SHIM stamps `version` once at
#     creation, shadow_ui NEVER writes it. A producer that stamps its own lane
#     tells itself a consumer exists and pushes into a ring nobody drains.
#   - the producer gate needs all THREE conditions. Without the queue-empty
#     test a lane write overtakes writes already queued for the mailbox — two
#     wires, interleaved, out of order.
#   - the drain must not grow a dispatcher of its own. That is the 09-05 bug
#     in its exact original form: a second wire whose apply function was a
#     copy of the routing, missing the `overtake_dsp:load` case, so a module's
#     DSP never loaded and a fresh project came up dead. See the sibling pin
#     test_param_apply_set_dispatch.sh.
#   - the decoded record is ~4.2 KB and must be static, never an SPI stack
#     frame (cf. tests/host/test_param_buffers_not_on_stack.sh).
#
# ⚠ It reads CODE WITH COMMENTS STRIPPED, and every window is a BRACE-MATCHED
# function body bounded by that function's own end — never a byte slice and
# never "the next N lines". A comment naming a call must not satisfy the pin,
# and a check must not be satisfied by code in the NEXT function.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$PWD"

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

# --- comment stripper (block + line), string literals kept -------------------
strip_comments() {
    awk '
    BEGIN { inc = 0 }
    {
        line = $0; out = ""; i = 1
        while (i <= length(line)) {
            two = substr(line, i, 2)
            if (inc) { if (two == "*/") { inc = 0; i += 2 } else i++ ; continue }
            if (two == "/*") { inc = 1; i += 2; continue }
            if (two == "//") break
            out = out substr(line, i, 1); i++
        }
        print out
    }' "$1"
}

# Braces counted OUTSIDE string and character literals — the sources carry
# strchr(x, '{') and JSON literals, which unbalance a naive count.
BRACE_AWK='
function scan(s,   i, ch, st) {
    G_O = 0; G_C = 0; st = 0
    for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (st == 0) {
            if (ch == "\"") st = 1
            else if (ch == SQ) st = 2
            else if (ch == "{") G_O++
            else if (ch == "}") G_C++
        } else {
            if (ch == "\\") { i++; continue }
            if (st == 1 && ch == "\"") st = 0
            else if (st == 2 && ch == SQ) st = 0
        }
    }
}
BEGIN { SQ = sprintf("%c", 39) }
'

# $1 = comment-stripped file, $2 = regex matching the definition's first line
extract_fn() {
    awk -v pat="$2" "$BRACE_AWK"'
    !started && $0 ~ pat { started = 1; buf = "" }
    started {
        buf = buf $0 "\n"
        scan($0)
        if (G_O > 0) opened = 1
        depth += G_O - G_C
        if (!opened && $0 ~ /;[ \t]*$/) { started = 0; buf = ""; next }
        if (opened && depth <= 0) { printf "%s", buf; exit }
    }' "$1"
}

# =============================================================================
# run_checks <root> [quiet] -> 0 all good, 1 something failed
# =============================================================================
run_checks() {
    local root="$1" quiet="${2:-loud}" bad=0
    local shim="$root/src/schwung_shim.c"
    local ui="$root/src/shadow/shadow_ui.c"
    local w="$TMPROOT/w.$$"; rm -rf "$w"; mkdir -p "$w"

    say() { [ "$quiet" = loud ] && echo "  FAIL: $*"; bad=1; }

    strip_comments "$shim" > "$w/shim.c"
    strip_comments "$ui"   > "$w/ui.c"

    # -------------------------------------------------------------------------
    # A. the segment exists and only the shim creates + stamps it
    # -------------------------------------------------------------------------
    grep -q 'SHM_SHADOW_PARAM_LANE' "$root/src/host/shadow_constants.h" \
        || say "SHM_SHADOW_PARAM_LANE is not declared in shadow_constants.h"

    extract_fn "$w/shim.c" '^static void init_shadow_shm' > "$w/init.c"
    [ -s "$w/init.c" ] || say "init_shadow_shm not found in schwung_shim.c"
    grep -q 'SHM_SHADOW_PARAM_LANE' "$w/init.c" \
        || say "the shim must map the lane in init_shadow_shm"
    # create=1: the shim is the creator, like the web set ring beside it.
    # The call is wrapped across lines, so flatten before matching.
    tr '\n' ' ' < "$w/init.c" | grep -qE 'shadow_shm_map\(SHM_SHADOW_PARAM_LANE,[^;]*, *1, *1\)' \
        || say "the shim must CREATE and zero the lane segment (create=1, zero=1), as it does the web set ring"
    grep -q 'spl_stamp_ready' "$w/init.c" \
        || say "the shim must call spl_stamp_ready once, at segment creation"

    # shadow_ui attaches (create=0) and must NEVER stamp
    tr '\n' ' ' < "$w/ui.c" | grep -qE 'shadow_shm_map\(SHM_SHADOW_PARAM_LANE,[^;]*, *0, *0\)' \
        || say "shadow_ui must ATTACH to the lane (create=0), not create it"
    grep -q 'spl_stamp_ready' "$w/ui.c" \
        && say "shadow_ui must NEVER stamp the lane's version — that is the consumer's handshake"
    grep -qE '(->|\.)version *=' "$w/ui.c" \
        && say "shadow_ui must never write a lane version field directly either"

    # -------------------------------------------------------------------------
    # B. the drain runs BEFORE the mailbox, inside shim_pre_transfer
    # -------------------------------------------------------------------------
    extract_fn "$w/shim.c" '^static void shim_pre_transfer' > "$w/pre.c"
    [ -s "$w/pre.c" ] || say "shim_pre_transfer not found in schwung_shim.c"
    local ln_lane ln_mbox ln_web
    ln_lane="$(grep -n 'shadow_drain_param_lane()' "$w/pre.c" | sed -n 1p | cut -d: -f1 || true)"
    ln_mbox="$(grep -n 'shadow_inprocess_handle_param_request()' "$w/pre.c" | sed -n 1p | cut -d: -f1 || true)"
    ln_web="$(grep -n 'shadow_drain_web_param_set()' "$w/pre.c" | sed -n 1p | cut -d: -f1 || true)"
    if [ -z "$ln_lane" ]; then
        say "shim_pre_transfer must call shadow_drain_param_lane()"
    elif [ -z "$ln_mbox" ]; then
        say "shim_pre_transfer must still call shadow_inprocess_handle_param_request()"
    else
        [ "$ln_lane" -lt "$ln_mbox" ] \
            || say "the lane drain must run BEFORE the mailbox is serviced (it is at line $ln_lane, the mailbox at $ln_mbox)"
        [ -n "$ln_web" ] && { [ "$ln_lane" -lt "$ln_web" ] \
            || say "the lane drain must also run before the web ring drain"; }
    fi

    # -------------------------------------------------------------------------
    # C. the drain applies through the shared paths and dispatches nothing itself
    # -------------------------------------------------------------------------
    extract_fn "$w/shim.c" '^static void shadow_drain_param_lane' > "$w/drain.c"
    [ -s "$w/drain.c" ] || say "shadow_drain_param_lane not found"
    grep -q 'shadow_param_apply_set(' "$w/drain.c" \
        || say "the lane drain must apply single SETs via shadow_param_apply_set (THE one dispatcher)"
    grep -q 'shim_apply_param_bulk_chain_pairs(' "$w/drain.c" \
        || say "the lane drain must apply chain: bulk via the shared by-value applier"
    grep -q 'spl_first_tail' "$w/drain.c" \
        || say "the lane drain must seed its private tail from spl_first_tail, never from head"
    grep -qE '(->|\.)set_param\(' "$w/drain.c" \
        && say "the lane drain calls ->set_param directly — it must not carry a dispatcher of its own"
    grep -q 'shadow_direct_set_param(' "$w/drain.c" \
        && say "the lane drain must not call shadow_direct_set_param directly (the bulk applier owns that)"
    grep -qE 'unified_log|fprintf|fopen|printf' "$w/drain.c" \
        && say "the lane drain runs in the SPI callback — no logging or file I/O"
    grep -qE 'PARAM_LANE_MAX_RECORDS_PER_FRAME|PARAM_LANE_BUDGET_US' "$w/drain.c" \
        || say "the lane drain must be bounded by a record count AND a time budget"

    # the ~4.2 KB decoded record is a file-scope static, never an SPI stack frame
    grep -qE '^static +spl_record_t +s_lane_rec;' "$w/shim.c" \
        || say "the decoded lane record must be a file-scope static (it is ~4.2 KB)"
    grep -qE '^[[:space:]]+spl_record_t [a-z_]+;' "$w/drain.c" \
        && say "a spl_record_t is declared on the stack inside the drain"

    # the by-value bulk applier is SHARED — the mailbox arm calls it too, so
    # there is exactly one per-pair loop
    extract_fn "$w/shim.c" '^static void shim_handle_param_bulk_chain[(]void[)]' > "$w/mbulk.c"
    [ -s "$w/mbulk.c" ] || say "shim_handle_param_bulk_chain not found"
    grep -q 'shim_apply_param_bulk_chain_pairs(' "$w/mbulk.c" \
        || say "the mailbox chain: bulk arm must call the same by-value applier the lane calls"
    grep -q 'shadow_direct_set_param(' "$w/mbulk.c" \
        && say "the mailbox chain: bulk arm still carries its own per-pair loop"

    # -------------------------------------------------------------------------
    # D. the producer gate: all three conditions, inside the fire-and-forget arm
    # -------------------------------------------------------------------------
    extract_fn "$w/ui.c" '^static int shadow_set_param_common' > "$w/set.c"
    [ -s "$w/set.c" ] || say "shadow_set_param_common not found in shadow_ui.c"
    grep -q 'spl_push(' "$w/set.c" \
        || say "shadow_set_param_common must offer eligible writes to the lane"
    # the gate is ONE expression carrying all three conditions
    local gate
    gate="$(tr '\n' ' ' < "$w/set.c" | grep -o 'if (spl_key_eligible(key)[^{]*{' | sed -n 1p || true)"
    [ -n "$gate" ] || say "the lane gate must start with spl_key_eligible(key)"
    case "$gate" in
        *'spq_count(&g_param_pending) == 0'*) ;;
        *) say "the lane gate is MISSING the queue-empty condition — a lane write would overtake queued mailbox writes" ;;
    esac
    case "$gate" in
        *'shadow_param_mailbox_idle()'*) ;;
        *) say "the lane gate is MISSING the mailbox-idle condition - a lane write would overtake a request still SITTING in the mailbox (queue empty after SPQ_COMMIT_NOW)" ;;
    esac
    case "$gate" in
        *'spl_push('*) ;;
        *) say "the lane gate must take the lane only when spl_push actually succeeded" ;;
    esac

    # the BULK gate (shadow_param_bulk_js): transient only, same ordering conditions
    extract_fn "$w/ui.c" '^static JSValue shadow_param_bulk_js' > "$w/bulk.c"
    [ -s "$w/bulk.c" ] || say "shadow_param_bulk_js not found in shadow_ui.c"
    local bgate
    bgate="$(tr '\n' ' ' < "$w/bulk.c" | grep -o 'if (req_type == 4[^{]*spl_push([^{]*{' | sed -n 1p || true)"
    [ -n "$bgate" ] || say "shadow_param_bulk_js must carry a lane gate ending in spl_push"
    case "$bgate" in
        *'transient &&'*|*'&& transient'*) ;;
        *) say "the BULK lane gate must be TRANSIENT-only - a non-transient bulk is an edit/recall whose callers rely on it having LANDED on return" ;;
    esac
    case "$bgate" in
        *'shadow_param_mailbox_idle()'*) ;;
        *) say "the BULK lane gate is missing the mailbox-idle condition" ;;
    esac
    case "$bgate" in
        *'spq_count(&g_param_pending) == 0'*) ;;
        *) say "the BULK lane gate is missing the queue-empty condition" ;;
    esac

    # the drain's time budget is checked after EVERY record, not every Nth
    grep -qE '\(n & 7u\) == 0|n % 8|n & 7' "$w/drain.c" \
        && say "the drain checks its time budget only every Nth record - one slow apply can be followed by N-1 more unchecked"
    local nclk
    nclk="$(grep -c 'clock_gettime(' "$w/drain.c" || true)"
    [ "${nclk:-0}" -ge 2 ] \
        || say "the drain must read the clock at entry AND per record (found $nclk clock_gettime calls)"
    # ...and it must sit INSIDE the fire-and-forget branch, before spq_offer
    local ln_ff ln_gate ln_offer
    ln_ff="$(grep -n 'if (overtake_fire_and_forget)' "$w/set.c" | sed -n 1p | cut -d: -f1 || true)"
    ln_gate="$(grep -n 'spl_push(' "$w/set.c" | sed -n 1p | cut -d: -f1 || true)"
    ln_offer="$(grep -n 'spq_offer(' "$w/set.c" | sed -n 1p | cut -d: -f1 || true)"
    if [ -n "$ln_ff" ] && [ -n "$ln_gate" ] && [ -n "$ln_offer" ]; then
        [ "$ln_ff" -lt "$ln_gate" ] \
            || say "the lane gate must sit INSIDE the overtake fire-and-forget branch, not ahead of it"
        [ "$ln_gate" -lt "$ln_offer" ] \
            || say "the lane gate must be tried BEFORE spq_offer"
    else
        say "could not locate the fire-and-forget branch / gate / spq_offer in shadow_set_param_common"
    fi
    # the dirty marking stays above the branch, untouched
    local ln_dirty
    ln_dirty="$(grep -n 'shadow_mark_slot_dirty(slot, key);' "$w/set.c" | sed -n 1p | cut -d: -f1 || true)"
    if [ -n "$ln_dirty" ] && [ -n "$ln_ff" ]; then
        [ "$ln_dirty" -lt "$ln_ff" ] \
            || say "the autosave dirty marking must still happen for EVERY write, above the fire-and-forget branch"
    else
        say "shadow_set_param_common no longer marks the slot dirty"
    fi

    return $bad
}

echo "== checking the working tree =="
if ! run_checks "$REPO"; then
    echo "FAIL: the param lane is not wired as specified (see above)"
    exit 1
fi
echo "   ok"

# =============================================================================
# CONTROLS — each mutation MUST make the checks fail. A control that passes
# means the pin does not test what it claims.
# =============================================================================
make_copy() {
    local dst="$TMPROOT/$1"
    rm -rf "$dst"; mkdir -p "$dst"
    cp -R "$REPO/src" "$dst/src"
    echo "$dst"
}

expect_fail() {   # $1 = dir, $2 = label
    if run_checks "$1" quiet; then
        echo "FAIL: $2 PASSED — the pin does not notice it"
        exit 1
    fi
    echo "   ok ($2 failed as required)"
}

echo "== control 1: drain AFTER the mailbox =="
C1="$(make_copy c1)"
python3 - "$C1/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("    shadow_drain_param_lane();\n", "", 1)
s = s.replace("    shadow_inprocess_handle_param_request();\n    shadow_drain_web_param_set();",
              "    shadow_inprocess_handle_param_request();\n    shadow_drain_param_lane();\n    shadow_drain_web_param_set();", 1)
open(p, 'w').write(s)
PY
expect_fail "$C1" "control 1 (drain moved below the mailbox)"

echo "== control 2: gate without the queue-empty test =="
C2="$(make_copy c2)"
python3 - "$C2/src/shadow/shadow_ui.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("spl_key_eligible(key) && spq_count(&g_param_pending) == 0 &&",
              "spl_key_eligible(key) &&", 1)
open(p, 'w').write(s)
PY
expect_fail "$C2" "control 2 (queue-empty condition deleted)"

echo "== control 3: the drain grows its own ->set_param dispatch =="
C3="$(make_copy c3)"
python3 - "$C3/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("            int rc = shadow_param_apply_set((int)s_lane_rec.slot, s_lane_rec.key, s_lane_rec.value);",
              "            int rc = 0;\n            if (overtake_dsp_gen && overtake_dsp_gen_inst)\n"
              "                overtake_dsp_gen->set_param(overtake_dsp_gen_inst, s_lane_rec.key, s_lane_rec.value);", 1)
open(p, 'w').write(s)
PY
expect_fail "$C3" "control 3 (a second dispatcher inside the drain)"

echo "== control 4: shadow_ui stamps the handshake itself =="
C4="$(make_copy c4)"
python3 - "$C4/src/shadow/shadow_ui.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("    param_lane_trace_init();",
              "    if (shadow_param_lane) spl_stamp_ready(shadow_param_lane);\n    param_lane_trace_init();", 1)
open(p, 'w').write(s)
PY
expect_fail "$C4" "control 4 (producer stamps version)"

echo "== control 5: the decoded record moves onto the SPI stack =="
C5="$(make_copy c5)"
python3 - "$C5/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("static spl_record_t s_lane_rec;", "/* moved */", 1)
s = s.replace("static void shadow_drain_param_lane(void) {",
              "static void shadow_drain_param_lane(void) {\n    spl_record_t s_lane_rec;", 1)
open(p, 'w').write(s)
PY
expect_fail "$C5" "control 5 (4.2 KB record on the SPI stack)"

echo "== control 6: a COMMENT naming the drain must not satisfy the pin =="
C6="$(make_copy c6)"
python3 - "$C6/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("    shadow_drain_param_lane();\n",
              "    /* shadow_drain_param_lane(); */\n", 1)
open(p, 'w').write(s)
PY
expect_fail "$C6" "control 6 (drain call commented out)"

echo "== control 7: gate without the mailbox-idle test =="
C7="$(make_copy c7)"
python3 - "$C7/src/shadow/shadow_ui.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("spl_key_eligible(key) && spq_count(&g_param_pending) == 0 &&\n                shadow_param_mailbox_idle() &&",
              "spl_key_eligible(key) && spq_count(&g_param_pending) == 0 &&", 1)
open(p, 'w').write(s)
PY
expect_fail "$C7" "control 7 (mailbox-idle condition deleted from the single gate)"

echo "== control 8: bulk gate takes non-transient bulks =="
C8="$(make_copy c8)"
python3 - "$C8/src/shadow/shadow_ui.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace('if (req_type == 4 && transient && strcmp(key, "chain:") == 0 &&',
              'if (req_type == 4 && strcmp(key, "chain:") == 0 &&', 1)
open(p, 'w').write(s)
PY
expect_fail "$C8" "control 8 (transient-only dropped from the bulk gate)"

echo "== control 9: the drain checks its clock every 8th record only =="
C9="$(make_copy c9)"
python3 - "$C9/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("        {\n            struct timespec t1;\n            clock_gettime(CLOCK_MONOTONIC, &t1);",
              "        if ((n & 7u) == 0) {\n            struct timespec t1;\n            clock_gettime(CLOCK_MONOTONIC, &t1);", 1)
open(p, 'w').write(s)
PY
expect_fail "$C9" "control 9 (budget checked every 8th record)"

echo "PASS: the param lane is wired end to end, in the one order that works; controls fire"
