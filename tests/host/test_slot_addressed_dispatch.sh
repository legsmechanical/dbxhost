#!/usr/bin/env bash
# Slot-addressed MIDI dispatch seam: a chain slot can be addressed by index,
# bypassing receive-channel matching, from both the plugin host API and the
# shadow-UI SHM ring (frame byte 3 = slot tag).
set -euo pipefail

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. The dispatch twin exists and both entry points share the per-slot body.
rg -q 'void shadow_chain_dispatch_midi_to_slot\(int slot' src/host/shadow_midi.c \
  || fail "shadow_midi.c missing shadow_chain_dispatch_midi_to_slot"
rg -q 'shadow_chain_dispatch_to_one_slot' src/host/shadow_midi.c \
  || fail "per-slot dispatch body not shared (shadow_chain_dispatch_to_one_slot)"
rg -q 'shadow_chain_dispatch_midi_to_slot\(int slot' src/host/shadow_midi.h \
  || fail "shadow_midi.h missing slot-addressed declaration"

# 2. The UI-drain honors the frame's slot tag (byte 3; 0 = legacy channel match).
rg -q 'slot_tag' src/host/shadow_midi.c \
  || fail "shadow_drain_ui_midi_dsp does not read the slot tag"

# 3. The JS binding writes the slot tag ((slot, msg) form).
rg -q 'slot_tag' src/shadow/shadow_ui.c \
  || fail "js_shadow_send_midi_to_dsp does not write the slot tag"

# 4. The host API exposes the slot-addressed send and the shim wires it.
rg -q 'midi_send_internal_slot\)\(int slot' src/host/plugin_api_v1.h \
  || fail "plugin_api_v1.h missing midi_send_internal_slot"
rg -q 'overtake_host_api.midi_send_internal_slot = overtake_midi_send_internal_slot' src/schwung_shim.c \
  || fail "shim does not register midi_send_internal_slot"

# 5. The davebox copy of the plugin API header must be byte-identical to the
#    host's — it drifted once (missing two appended callbacks) and a stale
#    copy silently changes the ABI the DSP is compiled against.
diff -q src/host/plugin_api_v1.h davebox/dsp/host/plugin_api_v1.h >/dev/null \
  || fail "davebox/dsp/host/plugin_api_v1.h is out of sync with src/host/plugin_api_v1.h"

echo "PASS: slot-addressed dispatch seam present (dispatch twin, drain tag, JS tag, host API, header sync)"
