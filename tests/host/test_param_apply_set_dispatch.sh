#!/usr/bin/env bash
# ONE dispatcher for parameter SETs.
#
# There used to be two. The shadow_param mailbox arm routed a SET by key prefix
# (shim specials, master_fx: incl. lfoN:, send_fx:, move_fx:, overtake_dsp:,
# slot keys, the chain plugin), and the web set-ring drain re-implemented that
# routing against the NARROWER shadow_direct_set_param. A branch that copied the
# second dispatcher shipped with no `overtake_dsp:load` case, so a module's DSP
# never loaded and a fresh project came up dead. Two dispatchers for one wire
# means the second is always missing a case.
#
# This pin asserts: (a) every key-prefix family the OLD mailbox SET arm handled
# is reachable from shadow_param_apply_set; (b) the mailbox arm and the web
# drain both go through it, and no other .c dispatches an `overtake_dsp:` SET to
# a module's set_param; (c) its own controls — a copy with a prefix case deleted
# and a copy whose drain calls shadow_direct_set_param — actually FAIL.
#
# ⚠ It reads CODE WITH COMMENTS STRIPPED. A comment naming a prefix must not
# satisfy the pin — that is exactly how a removed case hides.
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

# --- extract one function body by brace matching -----------------------------
# Braces are counted OUTSIDE string and character literals — src carries
# strchr(ui_hier + 14, '{') and the ui_hierarchy JSON, and counting those
# unbalances every window by two.
# $1 = comment-stripped file, $2 = regex matching the definition's first line
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

# =============================================================================
# The prefix families, derived by reading the OLD SET arm:
#   git show main:src/host/shadow_chain_mgmt.c   (shadow_inprocess_handle_param_request)
#   git show main:src/schwung_shim.c             (shim_handle_param_special)
# Each entry is a literal the dispatcher must still contain.
# =============================================================================
FAMILIES=(
    # --- shim specials, reached before any prefix parse ---
    '"jack:"'
    '"jack:display"'
    '"jack:restore_leds"'
    '"suspend_overtake"'
    '"passthrough"'
    # --- master FX rack ---
    '"master_fx:"'
    '"lfo1:"'
    '"lfo2:"'
    '"target_param"'          # the LFO field whose SET re-snapshots the base
    '"module"'
    '"param"'
    '"bypassed"'
    # --- master FX shim specials (no slot prefix) ---
    '"resample_bridge"'
    '"link_audio_routing"'
    '"link_audio_publish"'
    '"latency_comp_enabled"'
    '"system_link_enabled"'
    # --- send FX buses ---
    '"send_fx:"'
    '"return_level"'
    '"to_b"'
    # --- Move FX buses ---
    '"move_fx:"'
    '"lfo"'
    '"retrigger"'
    '"volume"'
    '"pan"'
    '"send_a"'
    '"send_b"'
    '"muted"'
    '"soloed"'
    # --- overtake DSP + the chain bulk marker ---
    '"overtake_dsp:"'
    '"load"'
    '"unload"'
    '"chain:"'
    # --- chain slot component keys ---
    '"synth:module"'
    '"fx1:module"'
    '"fx2:module"'
    '"midi_fx1:module"'
    '"midi_fx2:module"'
    '"load_file"'
    '"load_patch"'
    '"patch"'
    '"fx1:"'
    '"fx2:"'
    '"fx3:"'
    '"fx4:"'
)

# Side effects that must survive inside the dispatcher, not just the prefixes.
SIDE_EFFECTS=(
    'mfx_lfo_base_valid'                    # master LFO re-snapshot on target change
    'mfx_lfo_update_base_from_set_param'    # master LFO base follows a knob turn
    'move_lfo_base_valid'                   # per-bus LFO re-snapshot
    'move_lfo_update_base_from_set_param'   # per-bus LFO base follows a knob turn
    'shadow_master_fx_slot_load'
    'shadow_send_fx_slot_load'
    'shadow_move_fx_slot_load'
    'shadow_move_fx_apply_mute'
    'shadow_move_fx_set_solo'
    'shadow_handle_slot_param_set'
    'shadow_slot_load_capture'
    'shadow_ui_state_update_slot'
    'capture_clear'
    'shadow_overtake_dsp_load'
    'shadow_overtake_dsp_unload'
)

# =============================================================================
# run_checks <root> -> 0 all good, 1 something failed. Prints failures.
# =============================================================================
run_checks() {
    local root="$1" quiet="${2:-loud}" bad=0
    local cm="$root/src/host/shadow_chain_mgmt.c"
    local shim="$root/src/schwung_shim.c"
    local w="$TMPROOT/w.$$"; mkdir -p "$w"

    say() { [ "$quiet" = loud ] && echo "  FAIL: $*"; bad=1; }

    strip_comments "$cm"   > "$w/cm.c"
    strip_comments "$shim" > "$w/shim.c"

    # --- the dispatcher's reachable window: its own body + the shim SET
    #     specials it calls through host.apply_set_special ------------------
    extract_fn "$w/cm.c"   '^int shadow_param_apply_set_ex'        > "$w/apply.c"
    extract_fn "$w/shim.c" '^static int shim_apply_set_special'    > "$w/special.c"
    [ -s "$w/apply.c" ]   || say "shadow_param_apply_set_ex not found in shadow_chain_mgmt.c"
    [ -s "$w/special.c" ] || say "shim_apply_set_special not found in schwung_shim.c"
    grep -q 'host\.apply_set_special' "$w/apply.c" \
        || say "the dispatcher must reach the shim specials via host.apply_set_special"
    grep -q 'apply_set_special = shim_apply_set_special' "$w/shim.c" \
        || say "the shim must install shim_apply_set_special as host.apply_set_special"
    cat "$w/apply.c" "$w/special.c" > "$w/window.c"

    # (a) every prefix family the old SET arm handled is still in the window
    local f
    for f in "${FAMILIES[@]}"; do
        grep -qF -- "$f" "$w/window.c" \
            || say "prefix family $f is not reachable from shadow_param_apply_set"
    done
    for f in "${SIDE_EFFECTS[@]}"; do
        grep -qF -- "$f" "$w/window.c" \
            || say "side effect $f is missing from shadow_param_apply_set"
    done

    # (b) both wires go through it
    extract_fn "$w/cm.c"   '^void shadow_inprocess_handle_param_request'   > "$w/mailbox.c"
    extract_fn "$w/shim.c" '^static void shadow_drain_web_param_set'       > "$w/drain.c"
    [ -s "$w/mailbox.c" ] || say "shadow_inprocess_handle_param_request not found"
    [ -s "$w/drain.c" ]   || say "shadow_drain_web_param_set not found"
    grep -q 'shadow_param_apply_set' "$w/mailbox.c" \
        || say "the mailbox SET arm must call shadow_param_apply_set"
    grep -q 'shadow_param_apply_set' "$w/drain.c" \
        || say "the web ring drain must call shadow_param_apply_set"
    grep -q 'shadow_direct_set_param' "$w/drain.c" \
        && say "the web ring drain must NOT still call shadow_direct_set_param"
    # the mailbox arm must no longer carry its own SET routing
    grep -q 'shadow_master_fx_slot_load' "$w/mailbox.c" \
        && say "the mailbox arm still carries a master_fx module-load SET of its own"
    grep -q 'shadow_handle_slot_param_set' "$w/mailbox.c" \
        && say "the mailbox arm still carries its own slot-param SET"

    # the `chain:` bulk SET deliberately stays on the narrower call (its pairs
    # are automation writes that must not activate slots or load modules)
    grep -q 'shadow_direct_set_param(slot, keybuf, s_bulk_val)' "$w/shim.c" \
        || say "the chain: bulk SET must still land each pair via shadow_direct_set_param"

    # (b cont.) no other .c dispatches an overtake_dsp: SET to a module set_param.
    # Bounded structural window: every top-level function body, not a byte slice.
    local c blocks
    while IFS= read -r c; do
        blocks="$(strip_comments "$c" | awk "$BRACE_AWK"'
            /^[A-Za-z_].*\(/ && depth == 0 { name = $0 }
            {
                buf = buf $0 "\n"
                scan($0)
                if (G_O > 0) opened = 1
                depth += G_O - G_C
                if (opened && depth <= 0) {
                    if (buf ~ /overtake_dsp:/ && buf ~ /->set_param\(/) print name
                    buf = ""; opened = 0; name = ""; depth = 0
                }
            }')"
        while IFS= read -r b; do
            [ -z "$b" ] && continue
            case "$b" in
                *shim_apply_set_special*) ;;              # the shim's SET specials: the one place
                *shadow_param_apply_set_ex*) ;;           # the dispatcher itself (routes, does not dispatch)
                *) say "$(basename "$c"): '$b' dispatches an overtake_dsp: SET via ->set_param outside the one dispatcher" ;;
            esac
        done <<< "$blocks"
    done < <(find "$root/src" -name '*.c' -not -path '*/lib/*')

    return $bad
}

# =============================================================================
# 1. The real tree must pass.
# =============================================================================
echo "== checking the working tree =="
if ! run_checks "$REPO"; then
    echo "FAIL: the one-dispatcher invariant is broken (see above)"
    exit 1
fi
echo "   ok"

# =============================================================================
# 2. CONTROLS — each mutation must make the checks FAIL. A control that PASSES
#    means the pin does not actually test what it claims, so we exit non-zero.
# =============================================================================
make_copy() {
    local dst="$TMPROOT/$1"
    rm -rf "$dst"; mkdir -p "$dst"
    cp -R "$REPO/src" "$dst/src"
    echo "$dst"
}

echo "== control 1: delete the send_fx: prefix case from the dispatcher =="
C1="$(make_copy c1)"
python3 - "$C1/src/host/shadow_chain_mgmt.c" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()
i = s.index('int shadow_param_apply_set_ex(')
# drop only the send_fx: dispatch line inside the dispatcher
j = s.index('if (strncmp(key, "send_fx:", 8) == 0) {', i)
k = s.index('\n', j)
s = s[:j] + 'if (0) {' + s[k:]
open(p, 'w').write(s)
PY
if run_checks "$C1" quiet; then
    echo "FAIL: control 1 PASSED — the pin does not notice a deleted prefix case"
    exit 1
fi
echo "   ok (control 1 failed as required)"

echo "== control 2: web drain calls shadow_direct_set_param again =="
C2="$(make_copy c2)"
python3 - "$C2/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('int rc = shadow_param_apply_set((int)e.slot, e.key, e.value);',
              'int rc = 0; shadow_direct_set_param(e.slot, e.key, e.value);', 1)
open(p, 'w').write(s)
PY
if run_checks "$C2" quiet; then
    echo "FAIL: control 2 PASSED — the pin does not notice the drain re-forking"
    exit 1
fi
echo "   ok (control 2 failed as required)"

echo "== control 3: a COMMENT naming a deleted prefix must not satisfy the pin =="
C3="$(make_copy c3)"
python3 - "$C3/src/schwung_shim.c" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
i = s.index('static int shim_apply_set_special(')
j = s.index('if (strcmp(key, "jack:display") == 0) {', i)
k = s.index('\n', j)
s = s[:j] + '/* handles "jack:display" here */ if (0) {' + s[k:]
open(p, 'w').write(s)
PY
if run_checks "$C3" quiet; then
    echo "FAIL: control 3 PASSED — a comment satisfied the pin"
    exit 1
fi
echo "   ok (control 3 failed as required)"

echo "PASS: one dispatcher for parameter SETs; every prefix family reachable; controls fire"
