#!/usr/bin/env bash
set -euo pipefail

file="src/host/shadow_chain_mgmt.c"

if ! rg -q 'static int mfx_chain_params_lookup_default_value\(' "$file"; then
  echo "FAIL: missing chain_params default-value lookup helper" >&2
  exit 1
fi

if ! rg -q 'float fallback_base = \(p_min \+ p_max\) \* 0.5f;' "$file"; then
  echo "FAIL: MFX LFO tick missing fallback base for modules without get_param" >&2
  exit 1
fi

if ! rg -q 'mfx_chain_params_lookup_default_value\(' "$file"; then
  echo "FAIL: MFX LFO tick does not try default from chain_params metadata" >&2
  exit 1
fi

if ! rg -q 'static void mfx_lfo_update_base_from_set_param\(' "$file"; then
  echo "FAIL: missing base-sync helper for manual parameter sets" >&2
  exit 1
fi

# The SET arms moved out of the shadow_param mailbox handler into the ONE
# dispatcher, shadow_param_apply_set_ex, so these read `value` /
# `s_set_value_copy` rather than `shadow_param->value`. Same two call sites,
# same behaviour — see tests/host/test_param_apply_set_dispatch.sh.
if ! rg -q 'mfx_lfo_update_base_from_set_param\(mfx_slot, param_key, value\);' "$file"; then
  echo "FAIL: direct MFX param set path does not refresh LFO base snapshot" >&2
  exit 1
fi

if ! rg -q 'mfx_lfo_update_base_from_set_param\(mfx_slot, s_set_value_copy, eq \+ 1\);' "$file"; then
  echo "FAIL: key=value MFX param set path does not refresh LFO base snapshot" >&2
  exit 1
fi

echo "PASS: master FX LFO has fallback base snapshot and base-sync on set_param"
