#!/usr/bin/env bash
# The render POOL is wired into the shim's slot render in the ONE shape that
# is safe, and the shape's load-bearing parts are pinned here because none of
# them is a compile error or a failing unit:
#
#   - the per-slot task body (shadow_render_slot_task) owns PER-SLOT state
#     only. The two things the old loop shared — the fallback path's mix into
#     shadow_deferred_dsp_buffer, and the probe-burst counter — must not be
#     inside it: two lanes doing a read-modify-write on one accumulator is a
#     data race that shows up as an occasional wrong sample, never as a crash.
#   - the fallback mix runs AFTER render_pool_run() returns (the join), in
#     shadow_inprocess_render_to_buffer, in slot order.
#   - the Link-in shm is read ONCE per frame, before dispatch, not per slot.
#   - helpers come from shim_pthread_create (the host's SIGTERM must never
#     land on a helper — docs/… shim_thread.h), never core 3, and each sets
#     flush-to-zero on its own FPCR (per-thread on aarch64: without it a
#     helper is slower than serial on a decaying tail, and pooled output
#     differs from serial bit for bit).
#   - `slot:parallel` is handled in BOTH the slot get and the slot set, and
#     `master_fx:render_lanes` in both the by-value SET and the mailbox GET —
#     a key that reads but does not write is the class of bug MODULES.md warns
#     about (edits "appear to do nothing").
#
# ⚠ It reads CODE WITH COMMENTS STRIPPED, and every window is a BRACE-MATCHED
# function body. A comment naming a call must not satisfy the pin.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$PWD"

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

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

run_checks() {
    local root="$1" quiet="${2:-loud}" bad=0
    local shim="$root/src/schwung_shim.c"
    local pool="$root/src/host/render_pool.h"
    local mgmt="$root/src/host/shadow_chain_mgmt.c"
    local w="$TMPROOT/w.$$"; rm -rf "$w"; mkdir -p "$w"
    say() { [ "$quiet" = loud ] && echo "  FAIL: $*"; bad=1; }

    strip_comments "$shim" > "$w/shim.c"
    strip_comments "$pool" > "$w/pool.h"
    strip_comments "$mgmt" > "$w/mgmt.c"

    # A. the render runs THROUGH the pool, and only there
    extract_fn "$w/shim.c" '^static void shadow_inprocess_render_to_buffer' > "$w/rtb.c"
    [ -s "$w/rtb.c" ] || say "shadow_inprocess_render_to_buffer not found"
    grep -q 'render_pool_run(' "$w/rtb.c" \
        || say "shadow_inprocess_render_to_buffer must call render_pool_run()"
    grep -q 'shadow_plugin_v2->render_block(' "$w/rtb.c" \
        && say "render_to_buffer must not call a slot's render_block itself — the task fn does"

    # B. the task body owns per-slot state only
    extract_fn "$w/shim.c" '^static void shadow_render_slot_task' > "$w/task.c"
    [ -s "$w/task.c" ] || say "shadow_render_slot_task not found"
    grep -q 'shadow_deferred_dsp_buffer' "$w/task.c" \
        && say "the task body touches shadow_deferred_dsp_buffer (a SHARED accumulator) — the fallback mix belongs after the join"
    grep -q 'probe_burst_this_frame' "$w/task.c" \
        && say "the task body uses the shared probe_burst counter — count per lane"
    grep -q 'shadow_render_probe_burst\[lane\]' "$w/task.c" \
        || say "the task body must count probes per LANE (shadow_render_probe_burst[lane])"
    grep -q 'shadow_in_audio_shm' "$w/task.c" \
        && say "the task body reads the Link-in shm — decide skip_deferred_fx once per frame, before dispatch"
    grep -q 'shadow_plugin_v2->render_block(' "$w/task.c" \
        || say "the task body must be the one calling render_block"

    # C. the fallback mix comes AFTER the join, in render_to_buffer
    local ln_run ln_mix
    ln_run="$(grep -n 'render_pool_run(' "$w/rtb.c" | head -1 | cut -d: -f1 || true)"
    ln_mix="$(grep -n 'if (!shadow_slot_fallback_rendered\[s\]) continue;' "$w/rtb.c" | head -1 | cut -d: -f1 || true)"
    if [ -z "$ln_mix" ]; then
        say "render_to_buffer must sum the rendered fallback slots (shadow_slot_fallback_rendered) after the join"
    elif [ -n "$ln_run" ] && [ "$ln_mix" -lt "$ln_run" ]; then
        say "the fallback mix runs BEFORE the pool round — it must follow the join"
    fi
    grep -q 'shadow_deferred_dsp_buffer\[i\] = (int16_t)mixed' "$w/rtb.c" \
        || say "the fallback mix into shadow_deferred_dsp_buffer must live in render_to_buffer"

    # D. the pool's helpers: shim_pthread_create, never core 3, FTZ per helper
    extract_fn "$w/pool.h" '^static inline int render_pool_start_helpers' > "$w/start.c"
    [ -s "$w/start.c" ] || say "render_pool_start_helpers not found"
    grep -q 'shim_pthread_create(' "$w/start.c" \
        || say "helpers must be created with shim_pthread_create (host signals blocked)"
    grep -qE '(^|[^_a-z])pthread_create\(' "$w/start.c" \
        && say "a bare pthread_create in the pool — the helper would be eligible for the host's SIGTERM"
    grep -q 'CPU_SET(3' "$w/pool.h" \
        && say "a helper is pinned to core 3 — that core is the SPI IRQ's (docs/REALTIME_SAFETY.md)"
    extract_fn "$w/pool.h" 'static inline void .render_pool_helper_main' > "$w/helper.c"
    [ -s "$w/helper.c" ] || say "render_pool_helper_main not found"
    grep -q 'render_pool_set_ftz()' "$w/helper.c" \
        || say "each helper must set flush-to-zero on its own FPCR (render_pool_set_ftz)"
    grep -q 'CPU_SET(0' "$w/helper.c" && grep -q 'CPU_SET(2' "$w/helper.c" \
        || say "helpers must be masked to cores 0-2"

    # E. slot:parallel in BOTH directions; render_lanes in SET and GET
    extract_fn "$w/mgmt.c" '^int shadow_handle_slot_param_set' > "$w/sset.c"
    extract_fn "$w/mgmt.c" '^int shadow_handle_slot_param_get' > "$w/sget.c"
    grep -q '"slot:parallel"' "$w/sset.c" || say "slot:parallel missing from shadow_handle_slot_param_set"
    grep -q '"slot:parallel"' "$w/sget.c" || say "slot:parallel missing from shadow_handle_slot_param_get"
    extract_fn "$w/shim.c" '^static int shim_apply_set_special' > "$w/aset.c"
    extract_fn "$w/shim.c" '^static int shim_handle_param_special' > "$w/hps.c"
    grep -q '"render_lanes"' "$w/aset.c" || say "master_fx:render_lanes missing from shim_apply_set_special (the by-value SET)"
    grep -q '"render_lanes"' "$w/hps.c"  || say "master_fx:render_lanes missing from shim_handle_param_special (the GET)"
    # ⚠ Both shim handlers are reachable ONLY through chain mgmt's explicit
    # allow-lists of shim specials (one in the by-value dispatcher, one in the
    # mailbox request handler) — a key missing there goes to master-FX slot 0's
    # plugin and vanishes. Found on the device 2026-09-15: the first lane flip
    # did nothing while both handlers above were present.
    extract_fn "$w/mgmt.c" '^int shadow_param_apply_set_ex' > "$w/apply.c"
    [ -s "$w/apply.c" ] || extract_fn "$w/mgmt.c" '^int shadow_param_apply_set' > "$w/apply.c"
    [ -s "$w/apply.c" ] || say "shadow_param_apply_set not found"
    grep -q '"render_lanes"' "$w/apply.c" || say "render_lanes is not on the dispatcher's delegate list — the shim SET handler is unreachable"
    extract_fn "$w/mgmt.c" '^void shadow_inprocess_handle_param_request' > "$w/req.c"
    [ -s "$w/req.c" ] || say "shadow_inprocess_handle_param_request not found"
    grep -q '"render_lanes"' "$w/req.c" || say "render_lanes is not on the mailbox handler's delegate list — the shim GET handler is unreachable"

    # F. the pin mask comes from the slot's render_pinned
    grep -q 'render_pinned' "$w/rtb.c" \
        || say "render_to_buffer must build the pinned mask from shadow_chain_slots[s].render_pinned"

    return $bad
}

echo "== the real tree =="
if ! run_checks "$REPO"; then echo "FAIL: render pool wiring"; exit 1; fi
echo "   ok"

make_copy() {
    local dst="$TMPROOT/$1"
    rm -rf "$dst"; mkdir -p "$dst"
    cp -R "$REPO/src" "$dst/src"
    echo "$dst"
}
expect_fail() {
    if run_checks "$1" quiet; then echo "FAIL: $2 PASSED — the pin does not notice it"; exit 1; fi
    echo "   ok ($2 failed as required)"
}

echo "== control 1: the fallback mix moves back INTO the task =="
C1="$(make_copy c1)"
python3 - "$C1/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("        shadow_slot_fallback_rendered[s] = 1;\n",
              "        shadow_slot_fallback_rendered[s] = 1;\n        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) shadow_deferred_dsp_buffer[i] += render_buffer[i];\n", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C1" "control 1 (accumulator written inside the task)"

echo "== control 2: the probe counter goes shared again =="
C2="$(make_copy c2)"
python3 - "$C2/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("            shadow_render_probe_burst[lane]++;", "            shadow_render_probe_burst[0]++;", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C2" "control 2 (probe counter not per lane)"

echo "== control 3: a bare pthread_create in the pool =="
C3="$(make_copy c3)"
python3 - "$C3/src/host/render_pool.h" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("if (shim_pthread_create(&p->tid[h], NULL, render_pool_helper_main, &p->helper_arg[h]) != 0) {",
              "if (pthread_create(&p->tid[h], NULL, render_pool_helper_main, &p->helper_arg[h]) != 0) {", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C3" "control 3 (bare pthread_create)"

echo "== control 4: a helper on core 3 =="
C4="$(make_copy c4)"
python3 - "$C4/src/host/render_pool.h" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("CPU_SET(0, &mask); CPU_SET(1, &mask); CPU_SET(2, &mask);",
              "CPU_SET(0, &mask); CPU_SET(1, &mask); CPU_SET(2, &mask); CPU_SET(3, &mask);", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C4" "control 4 (core 3 in the helper mask)"

echo "== control 5: the pool call commented out =="
C5="$(make_copy c5)"
python3 - "$C5/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("            render_pool_run(&shadow_render_pool, active_mask, pinned_mask,\n                            shadow_render_slot_task, &ctx);",
              "            /* render_pool_run(&shadow_render_pool, active_mask, pinned_mask,\n                            shadow_render_slot_task, &ctx); */", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C5" "control 5 (pool call commented out — a comment must not satisfy the pin)"

echo "== control 6: slot:parallel readable but not writable =="
C6="$(make_copy c6)"
python3 - "$C6/src/host/shadow_chain_mgmt.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace('if (strcmp(key, "slot:parallel") == 0) {\n        /* Takes effect',
              'if (strcmp(key, "slot:parallel_x") == 0) {\n        /* Takes effect', 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C6" "control 6 (slot:parallel dropped from the SET handler)"

echo "== control 7: a helper without flush-to-zero =="
C7="$(make_copy c7)"
python3 - "$C7/src/host/render_pool.h" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("    if (deg) atomic_store_explicit(&p->degraded, 1, memory_order_release);\n    render_pool_set_ftz();",
              "    if (deg) atomic_store_explicit(&p->degraded, 1, memory_order_release);", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C7" "control 7 (no FTZ on the helper)"

echo "== control 8: the task reads the Link-in shm per slot =="
C8="$(make_copy c8)"
python3 - "$C8/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace("    if (ctx->skip_deferred_fx) {",
              "    if (ctx->skip_deferred_fx || (shadow_in_audio_shm && 0)) {", 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C8" "control 8 (Link-in shm read inside the task)"

echo "== control 9: render_lanes dropped from the dispatcher's delegate list =="
C9="$(make_copy c9)"
python3 - "$C9/src/host/shadow_chain_mgmt.c" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read(); s0 = s
s = s.replace('                strcmp(param_key, "render_lanes") == 0 ||   /* the render pool\'s lane count */\n', '', 1)
assert s != s0, 'mutation matched nothing'
open(p, 'w').write(s)
PY
expect_fail "$C9" "control 9 (render_lanes unreachable through the dispatcher)"

echo "PASS: the render pool is wired in the one safe shape; 9 controls fire"
