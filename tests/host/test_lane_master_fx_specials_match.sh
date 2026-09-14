#!/usr/bin/env bash
# S6: the master_fx: shim-special names EXCLUDED from the param lane
# (shadow_param_lane_policy.h's spl_key_eligible) must be exactly the names
# the dispatcher itself delegates to host.apply_set_special in its
# `!has_slot_prefix` arm (src/host/shadow_chain_mgmt.c, near :3413-3420).
#
# If the two lists drift apart:
#   - a name in the dispatcher but NOT the lane policy would let that SET take
#     the fire-and-forget lane, so the caller's read of the result never sees
#     it land (the exact "side effect the caller reads back" hazard the other
#     exclusions in this file exist to prevent);
#   - a name in the lane policy but NOT the dispatcher is dead exclusion code
#     that quietly forces an ordinary key onto the slower mailbox path.
#
# Reads both lists from SOURCE, comments stripped, so a renamed/added/removed
# dispatcher key is caught without hand-maintaining a duplicate list here.
set -euo pipefail
cd "$(dirname "$0")/../.."

POLICY=src/host/shadow_param_lane_policy.h
DISPATCH=src/host/shadow_chain_mgmt.c
fail=0

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

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip_comments "$POLICY"   > "$TMP/policy.h"
strip_comments "$DISPATCH" > "$TMP/dispatch.c"

# --- the lane policy's master_fx: exact-match exclusions --------------------
# Lines of the form: strcmp(key, "master_fx:<name>") == 0 ||  /  ) return 0;
policy_names="$(grep -oE 'strcmp\(key, "master_fx:[A-Za-z_]+"\) == 0' "$TMP/policy.h" \
    | sed -E 's/^strcmp\(key, "master_fx:([A-Za-z_]+)"\) == 0$/\1/' | sort -u)"

if [ -z "$policy_names" ]; then
    echo "FAIL: found no master_fx: exact-match exclusions in $POLICY — did S6 regress or get renamed?" >&2
    fail=1
fi

# --- the dispatcher's delegated-specials block -------------------------------
# Bounded by the comment anchor (now stripped, so match the code shape: the
# `if (!has_slot_prefix && host.apply_set_special)` guard) through its closing
# `}`. Extract with a brace-matched scan so a reordering inside the block
# cannot silently drop a line from a fixed byte range.
block="$(awk '
    /if \(!has_slot_prefix && host\.apply_set_special\)/ { started = 1 }
    started {
        print
        n = gsub(/{/, "{"); c = gsub(/}/, "}")
        depth += n - c
        if (started == 1 && n > 0) started = 2
        if (started == 2 && depth <= 0) exit
    }
' "$TMP/dispatch.c")"

if [ -z "$block" ]; then
    echo "FAIL: could not find the master_fx: delegated-specials block in $DISPATCH" >&2
    fail=1
fi

dispatch_names="$(printf '%s\n' "$block" \
    | grep -oE 'strcmp\(param_key, "[A-Za-z_]+"\) == 0' \
    | sed -E 's/^strcmp\(param_key, "([A-Za-z_]+)"\) == 0$/\1/' \
    | grep -v '^jack$\|^suspend_overtake$' | sort -u)"
# (jack:/suspend_overtake are matched by strncmp/strcmp on a DIFFERENT
# variable shape in that block and are already covered by the lane policy's
# separate bare jack:/suspend_overtake exclusions — not master_fx:-namespaced.)

if [ -z "$dispatch_names" ]; then
    echo "FAIL: found no delegated special names in the dispatcher block" >&2
    fail=1
fi

echo "policy   : $(echo "$policy_names" | tr '\n' ' ')"
echo "dispatch : $(echo "$dispatch_names" | tr '\n' ' ')"

if [ "$policy_names" != "$dispatch_names" ]; then
    echo "FAIL: the lane policy's master_fx: exclusions do not match the dispatcher's delegated list" >&2
    echo "  only in policy  : $(comm -23 <(echo "$policy_names") <(echo "$dispatch_names") | tr '\n' ' ')" >&2
    echo "  only in dispatch: $(comm -13 <(echo "$policy_names") <(echo "$dispatch_names") | tr '\n' ' ')" >&2
    fail=1
fi

# --- control: prove the extraction is actually discriminating ---------------
# A deliberately WRONG expected set must NOT match — otherwise this whole pin
# could be comparing two empty strings and reporting green for the wrong
# reason.
wrong="$(printf '%s\nbogus_name' "$policy_names" | sort -u)"
if [ "$wrong" = "$dispatch_names" ]; then
    echo "FAIL: control — a deliberately wrong set matched dispatch_names; the comparison is not discriminating" >&2
    fail=1
else
    echo "  ok — control: a perturbed set does NOT match (the comparison discriminates)"
fi

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
