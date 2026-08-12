#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# An FX bus is a mixer position like a chain slot, so it carries its own mute
# and joins the one solo group. The unit below pins the gating RULE; the source
# pins after it check the rule is actually reached — a correct helper nothing
# calls silences nothing.

bin="build/tests/test_move_bus_mute_solo"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Isrc -Isrc/host -Isrc/lib \
  tests/host/test_move_bus_mute_solo.c -o "$bin"
"$bin"

# 1. The mix loop must gate the bus, not read the raw fader. This is the line
#    that makes mute audible; without it every check above is theory.
busblock=$(awk '/The bus.s OWN mixer state/,/accumulate_sends_ex/' src/schwung_shim.c)
if [ -z "$busblock" ]; then
  echo "FAIL: could not find the Move bus mix block in src/schwung_shim.c" >&2
  exit 1
fi
if ! grep -q 'shadow_move_fx_effective_volume(s)' <<<"$busblock"; then
  echo "FAIL: the Move bus mix does not use shadow_move_fx_effective_volume — mute/solo are inert" >&2
  exit 1
fi
if grep -q 'shadow_move_fx_strip\[s\]\.volume' <<<"$busblock"; then
  echo "FAIL: the Move bus mix still reads the raw strip volume, bypassing mute/solo" >&2
  exit 1
fi
# The sends ride the same gated gain, or a muted bus keeps feeding the reverb.
if ! grep -q 'accumulate_sends_ex(msrc, mvol' <<<"$busblock"; then
  echo "FAIL: the bus sends do not use the gated volume — a muted bus would still feed the send buses" >&2
  exit 1
fi

# 2. Solo exclusivity has ONE writer per family, and each clears the other.
#    The bug this prevents is two things soloed at once.
for fn in shadow_chain_set_solo shadow_move_fx_set_solo; do
  body=$(awk "/^void ${fn}\(/,/^}/" src/host/shadow_chain_mgmt.c)
  if [ -z "$body" ]; then
    echo "FAIL: $fn missing" >&2
    exit 1
  fi
  if ! grep -q 'shadow_chain_slots\[i\]\.soloed = 0' <<<"$body"; then
    echo "FAIL: $fn does not clear chain-slot solos — two things could be soloed at once" >&2
    exit 1
  fi
  if ! grep -q 'shadow_move_fx_strip\[i\]\.soloed = 0' <<<"$body"; then
    echo "FAIL: $fn does not clear FX-bus solos — two things could be soloed at once" >&2
    exit 1
  fi
  if ! grep -q 'shadow_recount_solo()' <<<"$body"; then
    echo "FAIL: $fn assigns the shared solo count instead of recomputing it" >&2
    exit 1
  fi
done

# The slot:soloed param must go through the setter rather than keeping its own
# copy of the exclusivity rule (it used to, and that copy knew only one family).
handler=$(grep -A 8 '"slot:soloed"' src/host/shadow_chain_mgmt.c)
if ! grep -q 'shadow_chain_set_solo(' <<<"$handler"; then
  echo "FAIL: the slot:soloed param handler does not route through shadow_chain_set_solo" >&2
  exit 1
fi

# 3. Per-set persistence. The values are only per-project if they are in the
#    set's meta file on BOTH sides.
save=$(awk '/Per-slot strip state/,/move_fx_meta.json/' src/shadow/shadow_ui.js)
for k in muted soloed; do
  if ! grep -q "\"move_fx:\" + (sl + 1) + \":$k\"" <<<"$save"; then
    echo "FAIL: saveMoveFxChainConfig does not persist :$k — it would not survive a project switch" >&2
    exit 1
  fi
done
restore=$(awk '/function restoreMoveFxFromFiles/,/^}/' src/shadow/shadow_ui.js)
if ! grep -q '":muted",' <<<"$restore"; then
  echo "FAIL: restoreMoveFxFromFiles does not restore :muted" >&2
  exit 1
fi
# Mute must be written for EVERY bus, not only when the set says so — otherwise
# a set with no meta inherits the previous project's mutes.
if ! grep -q '(st && st.muted) ? "1" : "0"' <<<"$restore"; then
  echo "FAIL: restore does not reset :muted for a set without meta (previous project's mute leaks in)" >&2
  exit 1
fi
# Solo especially: a stale bus solo silences every chain slot in the new set,
# so it must be CLEARED on restore, not merely set when the incoming set has one.
if ! grep -q '(st && st.soloed) ? "1" : "0"' <<<"$restore"; then
  echo "FAIL: restore only sets :soloed when present — a stale bus solo would survive into the next project" >&2
  exit 1
fi

echo "PASS: FX buses carry their own mute and share the solo group"
