#!/usr/bin/env bash
# The "chain:" bulk SET (shadow_set_params(slot, "chain:", blob)) must reach the
# shim's special handler. The chain manager's request loop delegates only the
# keys it names; a marker it does not name falls through to the generic slot
# path, is ignored, and is still ANSWERED — so the JS caller sees `true` for a
# write that never landed. That is how automation playback shipped silent once.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
grep -q 'strcmp(shadow_param->key, "chain:") == 0' src/host/shadow_chain_mgmt.c \
    || fail 'shadow_chain_mgmt.c must delegate the "chain:" marker to handle_param_special'
grep -q 'req_type == 4 && strcmp(key, "chain:") == 0' src/schwung_shim.c \
    || fail 'schwung_shim.c must handle the "chain:" BULK_SET in shim_handle_param_special'
grep -q 'shadow_direct_set_param(slot, keybuf, s_bulk_val)' src/schwung_shim.c \
    || fail 'the chain bulk handler must land each pair through shadow_direct_set_param'
echo "PASS: the chain: bulk SET is delegated to the shim and lands per pair"
