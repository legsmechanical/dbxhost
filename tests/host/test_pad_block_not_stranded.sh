#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# pad_block must never outlive the thing that raised it.
#
# A module (or this host's own text-entry keyboard, which uses padSelect) takes
# the pads with host_pad_block(1) and lowers them on the way out. The shim
# enforces the flag INSIDE the shadow_display_mode branch, so a stranded flag
# reads as "pads dead in the Schwung UI, fine on a Move track" -- which does not
# look like an input filter, and is why upstream's went unreported for hours.
#
# Worse, /dev/shm OUTLIVES the process: the control segment is deliberately not
# zeroed at init, so a stranded flag survives restart_move.sh and every reboot
# of the stack. Upstream's device log carried exactly one "pad_block ON" and no
# OFF, stuck for thirteen hours across two shim inits.
#
# Three guards, each covering exits the others do not. All three are pinned
# because any one alone leaves a reachable way to strand it.

fail() { echo "FAIL: $1" >&2; exit 1; }
shim="src/schwung_shim.c"
ui="src/shadow/shadow_ui.js"

# --- guard 1: the shim clears it at init (the stale segment) --------------
init=$(awk '/Create\/open control shared memory/,/boot_tool\.json/' "$shim")
[ -n "$init" ] || fail "the shim's control-shm init block is gone from $shim"
command grep -q "shadow_control->pad_block = 0;" <<<"$init" || \
  fail "the shim does not clear pad_block at init -- a stranded flag survives every restart, since /dev/shm outlives the process"

# --- guard 2: the shim drops it on the display-close edge -----------------
edge=$(awk '/static int prev_display_mode = 0;/,/^        }$/' "$shim")
[ -n "$edge" ] || fail "the display-close edge block is gone from $shim"
command grep -q "shadow_control->pad_block = 0;" <<<"$edge" || \
  fail "the shim does not drop pad_block when the shadow display closes -- that edge covers every exit the module itself does not take"

# The claim latch must NOT be cleared on the same edge: a withheld BUTTON owes
# Move a release, and dropping the latch mid-hold hands Move a lone button-up
# for a key it never saw pressed (Delete acts destructively on it). A withheld
# PAD owes nothing worse than an unmatched note-off. If someone ever "tidies"
# the two into one memset, this is what says no.
command grep -q "memset((void \*)shadow_control->claim_cc_bits, 0" <<<"$edge" || \
  fail "the claim-bit clear vanished from the display-close edge"
if command grep -q "memset((void \*)shadow_control->claim_latch" <<<"$edge"; then
  fail "the claim LATCH is being cleared on the display-close edge -- that is the stuck-button bug (upstream #435), and pad_block is not the same case"
fi

# --- guard 3: unloadModuleUi lowers it (exits that keep the display up) ---
unload=$(awk '/^function unloadModuleUi\(\)/,/^}$/' "$ui")
[ -n "$unload" ] || fail "unloadModuleUi is gone from $ui"
command grep -q "host_pad_block(0)" <<<"$unload" || \
  fail "unloadModuleUi does not lower pad_block -- moving to another slot, Tools or Global Settings keeps the display up, so the shim edge never fires"

echo "  ok  cleared at shim init, so a stranded flag cannot survive a restart"
echo "  ok  dropped when the shadow display closes, and the claim latch is NOT"
echo "  ok  lowered by unloadModuleUi, for the exits that keep the display up"
echo "PASS: pad_block cannot outlive the UI that raised it"
