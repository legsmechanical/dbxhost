#!/usr/bin/env bash
# The "Move's set" module API (upstream #573), as this fork answers it.
#
#   - native: the shim EXPORTS schwung_move_info() — always, or a module's
#     reader, finding no symbol, maps the fixed-name /schwung-move-info
#     segment: stock Schwung's, stale, on a device that runs both. It answers
#     from the store the overtake DSP publishes into (set_move_info), and 0
#     ("not provided") while nothing is published. The store itself is pinned
#     by test_move_info_store.sh;
#   - the extension carries set_move_info, it reaches that store, and both
#     unload paths WITHDRAW it, or the next session inherits a key;
#   - nothing was added inside the frozen host_api_v1_t;
#   - the header the modules read is upstream's, unmodified in both copies;
#   - JS: host_get_move_info() exists and returns null (the shim's store
#     lives in MoveOriginal, not in shadow_ui's process), instead of a
#     ReferenceError that retires the calling module's page hooks.
set -euo pipefail
# ⚠ Never `producer | grep -q` here: -q quits on its first match, the producer
# can then die of SIGPIPE writing the rest, and pipefail reports that as a
# failure — on Linux it did, once the extension struct grew past
# set_move_info. `grep >/dev/null` reads everything and exits the same way.
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
S=src/schwung_shim.c; H=src/host/plugin_api_v1.h

grep -B1 '^int schwung_move_info(void \*out, size_t cap)' "$S" \
    | grep >/dev/null 'visibility("default")' || fail "the shim does not EXPORT schwung_move_info (default visibility)"
grep -q '^int schwung_move_info(void \*out, size_t cap) { return move_info_store_get(&g_move_info, out, cap); }' "$S" \
    || fail "schwung_move_info does not answer from the published store"

awk '/typedef struct move_host_ext_v1/,/} move_host_ext_v1_t;/' "$H" | grep >/dev/null 'void (\*set_move_info)(const void \*info, size_t size);' \
    || fail "the extension struct has no set_move_info"
awk '/typedef struct host_api_v1/,/} host_api_v1_t;/' "$H" | grep >/dev/null 'move_info' \
    && fail "move_info was added INSIDE host_api_v1_t (frozen geometry)"
grep -q '\.set_move_info = overtake_set_move_info' "$S" || fail "the host's extension does not carry set_move_info"
awk '/^static void overtake_set_move_info\(/,/^}/' "$S" | grep >/dev/null 'move_info_store_put(&g_move_info' \
    || fail "overtake_set_move_info does not reach the store"
awk '/^static void shadow_overtake_dsp_unload\(void\) \{/,/^}/' "$S" | grep >/dev/null 'move_info_store_put(&g_move_info, NULL, 0)' \
    || fail "unloading the overtake DSP does not withdraw what it published"
grep -A2 'unloading previous before loading new' "$S" | grep >/dev/null 'move_info_store_put(&g_move_info, NULL, 0)' \
    || fail "replacing the overtake DSP does not withdraw what the old one published"

cmp -s src/host/move_info.h davebox/dsp/host/move_info.h || fail "the two copies of move_info.h differ"
cmp -s "$H" davebox/dsp/host/plugin_api_v1.h || fail "the two copies of plugin_api_v1.h differ"

grep -q 'JS_SetPropertyStr(ctx, global_obj, "host_get_move_info"' src/shadow/shadow_ui.c \
    || fail "host_get_move_info is not registered as a JS global"
awk '/^static JSValue js_host_get_move_info\(/,/^}/' src/shadow/shadow_ui.c | grep >/dev/null 'return JS_NULL;' \
    || fail "host_get_move_info must return null"
echo "PASS: schwung_move_info answers what the overtake DSP publishes, withdrawn at unload"
