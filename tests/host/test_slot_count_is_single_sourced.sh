#!/usr/bin/env bash
set -euo pipefail

# The chain-slot count is declared in four places that MUST agree, and nothing
# used to check them. This pin exists because every disagreement in this set
# fails silently rather than loudly:
#
#   - C  SHADOW_CHAIN_INSTANCES      (src/host/shadow_constants.h) — the render
#         loop, MIDI dispatch bounds, per-slot buffers.
#   - C  SHADOW_UI_SLOTS             (src/host/shadow_constants.h) — sizes the
#         shadow_ui_state_t SHM arrays.
#   - C  LINK_AUDIO_SHADOW_CHANNELS  (src/host/link_audio.h) — per-slot Link
#         Audio publish; the pub segment's SIZE derives from it.
#   - JS SHADOW_UI_SLOTS             (src/shadow/shadow_ui.js) — hand-mirrored.
#
# Why silence is the failure mode: the Master FX pseudo-slot is addressed as
# `ui_slot === SHADOW_UI_SLOTS`, so a C/JS divergence does not error — it lands
# Master FX on a real chain slot. A LINK_AUDIO_SHADOW_CHANNELS divergence
# changes the published segment size while the subscriber checks only `magic`.
#
# This is P8 groundwork: the count is intended to become configurable, and a
# four-way hand-mirrored constant with no pin is exactly the shape that makes
# such a change unsafe.

c_consts="src/host/shadow_constants.h"
c_link="src/host/link_audio.h"
host_js="src/shadow/shadow_ui.js"

read_define() {  # file, name
  grep -oE "^#define $2 +[0-9]+" "$1" | grep -oE '[0-9]+$' || true
}

chain_instances="$(read_define "$c_consts" SHADOW_CHAIN_INSTANCES)"
ui_slots_c="$(read_define "$c_consts" SHADOW_UI_SLOTS)"
link_channels="$(read_define "$c_link" LINK_AUDIO_SHADOW_CHANNELS)"
ui_slots_js="$(grep -oE 'const SHADOW_UI_SLOTS = [0-9]+' "$host_js" | grep -oE '[0-9]+$' || true)"

fail=0
for pair in "SHADOW_CHAIN_INSTANCES:$chain_instances" \
            "SHADOW_UI_SLOTS(C):$ui_slots_c" \
            "LINK_AUDIO_SHADOW_CHANNELS:$link_channels" \
            "SHADOW_UI_SLOTS(JS):$ui_slots_js"; do
  name="${pair%%:*}"; val="${pair##*:}"
  if [ -z "$val" ]; then
    echo "FAIL: could not read $name — the declaration moved or changed shape" >&2
    fail=1
  fi
done
[ "$fail" -eq 0 ] || exit 1

if [ "$chain_instances" != "$ui_slots_c" ] || \
   [ "$chain_instances" != "$link_channels" ] || \
   [ "$chain_instances" != "$ui_slots_js" ]; then
  echo "FAIL: the slot count disagrees across its four declarations:" >&2
  echo "      SHADOW_CHAIN_INSTANCES      = $chain_instances  ($c_consts)" >&2
  echo "      SHADOW_UI_SLOTS (C)         = $ui_slots_c  ($c_consts)" >&2
  echo "      LINK_AUDIO_SHADOW_CHANNELS  = $link_channels  ($c_link)" >&2
  echo "      SHADOW_UI_SLOTS (JS)        = $ui_slots_js  ($host_js)" >&2
  echo "      Master FX would alias onto a real slot, or the Link Audio pub" >&2
  echo "      segment would be sized differently from its reader." >&2
  exit 1
fi

# The shim must NOT carry its own fallback definition: an include-order change
# would silently size the per-slot timing arrays differently from the build.
if grep -qE '^#define SHADOW_CHAIN_INSTANCES' src/schwung_shim.c; then
  echo "FAIL: src/schwung_shim.c redefines SHADOW_CHAIN_INSTANCES" >&2
  echo "      shadow_constants.h is the single declaration." >&2
  exit 1
fi

# The idle-probe stagger must derive its per-slot offset from the count. A
# literal stride collides the moment the count is not the one it was tuned for
# (the old `s * 43 % 172` was 172/4: at 8 slots, s=4..7 land on s=0..3's probe
# frames — four pairs probing together, the exact spike it prevents).
if ! grep -q 'SLOT_PROBE_STRIDE_FRAMES (SLOT_PROBE_WINDOW_FRAMES / SHADOW_CHAIN_INSTANCES)' \
        src/schwung_shim.c; then
  echo "FAIL: the idle-probe stride is not derived from SHADOW_CHAIN_INSTANCES" >&2
  exit 1
fi

# The module declares the same count three more times — its UI, its DSP, and
# its remote UI. A module/host disagreement is the worst case of all: the host
# renders N slots, the module addresses M, and the tracks pointing at the
# difference play into the wrong chain silently.
db_ui="davebox/ui/ui_engine.mjs"
db_dsp="davebox/dsp/seq8.c"
db_web="davebox/web_ui_core.js"   # the remote UI's transport/state half (was inline in web_ui.html)

db_ui_count="$(grep -oE 'export const CHAIN_SLOTS = [0-9]+' "$db_ui" | grep -oE '[0-9]+$' || true)"
db_dsp_count="$(grep -oE '^#define SEQ8_CHAIN_SLOTS +[0-9]+' "$db_dsp" | grep -oE '[0-9]+$' || true)"
db_web_count="$(grep -oE 'window\.CHAIN_SLOTS = [0-9]+' "$db_web" | grep -oE '[0-9]+$' || true)"

for pair in "CHAIN_SLOTS(ui_engine):$db_ui_count" \
            "SEQ8_CHAIN_SLOTS(dsp):$db_dsp_count" \
            "CHAIN_SLOTS(web_ui):$db_web_count"; do
  name="${pair%%:*}"; val="${pair##*:}"
  if [ -z "$val" ]; then
    echo "FAIL: could not read davebox $name — the declaration moved or changed shape" >&2
    exit 1
  fi
done

if [ "$db_ui_count" != "$chain_instances" ] || \
   [ "$db_dsp_count" != "$chain_instances" ] || \
   [ "$db_web_count" != "$chain_instances" ]; then
  echo "FAIL: davebox's slot count disagrees with the host's:" >&2
  echo "      host SHADOW_CHAIN_INSTANCES = $chain_instances" >&2
  echo "      $db_ui  CHAIN_SLOTS      = $db_ui_count" >&2
  echo "      $db_dsp SEQ8_CHAIN_SLOTS = $db_dsp_count" >&2
  echo "      $db_web CHAIN_SLOTS      = $db_web_count" >&2
  echo "      Tracks addressing the difference would play into the wrong chain." >&2
  exit 1
fi

# `& 3` is not a bounds check — it aliases. Nothing in the slot paths may use
# it: slot 4 silently becoming slot 0 is indistinguishable from a correct 0.
if grep -rnE '(slot|Slot)[A-Za-z]*[^&|]*& *3\b' davebox/ui/*.mjs 2>/dev/null | grep -v '^\S*: *\*' | grep -v 'not a bounds check'; then
  echo "FAIL: a slot path still masks with & 3 — use slotIndex() (ui_engine.mjs)" >&2
  exit 1
fi

echo "PASS: slot count single-sourced at $chain_instances across host C/JS/link-audio + davebox ui/dsp/web; no shim redefine; probe stride derived; no & 3 slot masks"
exit 0
