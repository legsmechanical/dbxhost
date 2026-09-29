#!/usr/bin/env bash
# P6: get_param("<comp>:module") answers with the loaded module id, mirroring
# the set_param intercept — one key shape for read and write. Before this, the
# colon read fell through to the loaded plugin (no plugin implements "module",
# and an empty component returned -1 instead of ""), so every caller had to
# know reads use the "<comp>_module" underscore alias.
set -euo pipefail

file="src/modules/chain/dsp/chain_host.c"

# One intercept per routed component: synth, fx1..fx4, midi_fx1, midi_fx2.
count=$(rg -c 'Symmetric readback \(P6\)' "$file" || true)
if [ "${count:-0}" -ne 7 ]; then
  echo "FAIL: expected 7 symmetric-readback intercepts in get_param, found ${count:-0}" >&2
  exit 1
fi

# Each intercept must answer from the host-side loaded-module cache — the same
# source of truth the legacy underscore keys read — not from the plugin.
for field in 'current_synth_module' 'current_fx_modules\[0\]' 'current_fx_modules\[1\]' \
             'current_fx_modules\[2\]' 'current_fx_modules\[3\]' \
             'current_midi_fx_modules\[0\]' 'current_midi_fx_modules\[1\]'; do
  if ! rg -Uq 'strcmp\(subkey, "module"\) == 0\) \{\n            return snprintf\(buf, buf_len, "%s", inst->'"$field" "$file"; then
    echo "FAIL: no module-readback intercept returning inst->$field" >&2
    exit 1
  fi
done

# The legacy underscore aliases must survive — older callers still read them.
for key in synth_module fx1_module fx2_module fx3_module fx4_module midi_fx1_module midi_fx2_module; do
  if ! rg -Fq "\"$key\"" "$file"; then
    echo "FAIL: legacy underscore alias $key removed" >&2
    exit 1
  fi
done

echo "PASS: <comp>:module readback is symmetric across all 7 components (aliases intact)"
