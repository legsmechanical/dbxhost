#!/usr/bin/env bash
# The "Move's set" module API (upstream #573) answers "not provided" here —
# and it must ANSWER, in both forms:
#
#   - native: the shim exports schwung_move_info() returning 0. A module's
#     reader looks the symbol up first and only when it is ABSENT maps the
#     fixed-name /schwung-move-info segment — stock Schwung's, stale, on a
#     device that runs both.
#   - JS: host_get_move_info() exists and returns null, instead of a
#     ReferenceError that retires the calling module's page hooks.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }

grep -B1 '^int schwung_move_info(void \*out, size_t cap)' src/schwung_shim.c \
    | grep -q 'visibility("default")' || fail "the shim does not EXPORT schwung_move_info (default visibility)"
grep -q '^int schwung_move_info(void \*out, size_t cap) { (void)out; (void)cap; return 0; }' src/schwung_shim.c \
    || fail "schwung_move_info must return 0 (not provided) and touch nothing"
grep -q 'JS_SetPropertyStr(ctx, global_obj, "host_get_move_info"' src/shadow/shadow_ui.c \
    || fail "host_get_move_info is not registered as a JS global"
awk '/^static JSValue js_host_get_move_info\(/,/^}/' src/shadow/shadow_ui.c | grep -q 'return JS_NULL;' \
    || fail "host_get_move_info must return null"
echo "PASS: the Move-set module API answers 'not provided' in C and in JS"
