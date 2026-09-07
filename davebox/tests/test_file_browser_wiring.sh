#!/usr/bin/env bash
# The file browser's audition is REACHED — three call sites the JS rig cannot
# drive, pinned in source.
#
# ⚠⚠ WHY THESE THREE AND NOT THE MECHANISM. tests/js/test_file_browser_behaviour.mjs
# drives the browser through production's own io and proves the behaviour is
# correct. What it cannot see is whether davebox ever CALLS it: the arm lives
# inside the CC handler, the debounce inside soundTick, and the retarget's close
# depends on ORDER rather than on any value. A mechanism that is perfect and
# never reached is exactly what moving code between files risks.
set -euo pipefail
cd "$(dirname "$0")/.."

f=ui/ui_sound.mjs
fail=0
need() {  # <literal> <what breaks without it>
  if ! grep -Fq -- "$1" "$f"; then
    echo "FAIL: $2"
    echo "      missing from $f: $1"
    fail=1
  else
    echo "  ok   — $2"
  fi
}

need "            armFilepathPreview(S.fileState);" \
     "the jog arms an audition — without it nothing is ever queued and the browser is silent"
need "    if (S.view === VIEW_FILE) tickFilepathPreview(S.fileState, FILE_BROWSER_PARAM_IO);" \
     "the tick fires a rested audition — without it the debounce never elapses"
need "    else if (S.fileState) leaveFileBrowser();" \
     "leaving the browser by ANY door closes it — five doors, and the count is not stable"

# ---- and the ORDER that makes the retarget safe ---------------------------
# ⚠ A live preview writes the real parameter. If the restore is issued after
# `S.slot` moves it lands on a track the user never opened — the same failure
# `wavEditCloseIfOpen` exists to prevent, which is why it goes in the same place.
#
# ⚠ Read INSIDE soundRetarget, bounded by the next top-level function. A file-wide
# line comparison answers with whichever `S.slot = slot` it met first, in some
# other function entirely — which is how the first version of this pin failed a
# correct tree.
body=$(awk '/^export function soundRetarget\(track, slot\) \{/{f=1} f{print} f && /^\}$/{exit}' "$f")
if [ -z "$body" ]; then
  echo "FAIL: soundRetarget not found — this pin is reading the wrong shape"
  fail=1
else
  close_at=$(printf '%s\n' "$body" | grep -n "wavEditCloseIfOpen();" | head -1 | cut -d: -f1)
  slot_at=$(printf '%s\n' "$body" | grep -n "^    S.slot = slot;" | head -1 | cut -d: -f1)
  drop_at=$(printf '%s\n' "$body" | grep -n "^    S.fileState = null;" | head -1 | cut -d: -f1)
  if [ -z "$close_at" ] || [ -z "$slot_at" ] || [ -z "$drop_at" ]; then
    echo "FAIL: inside soundRetarget, could not find close=$close_at slot=$slot_at drop=$drop_at"
    fail=1
  elif [ "$close_at" -ge "$slot_at" ]; then
    echo "FAIL: the browser is closed after S.slot moves — the audition would be"
    echo "      put back on the wrong track (close line $close_at, slot line $slot_at)"
    fail=1
  elif [ "$drop_at" -le "$slot_at" ]; then
    echo "FAIL: the hard drop of S.fileState sits BEFORE the slot moves; it is the"
    echo "      late drop, and the close is what belongs above the move"
    fail=1
  else
    echo "  ok   — soundRetarget closes the browser before the slot moves, and drops after"
  fi
fi

# And the close itself must live inside that early call, not be gated on the
# wave-editor errand: davebox's own browse auditions too.
if ! grep -Fq "    if (S.view === VIEW_FILE) leaveFileBrowser();" "$f"; then
  echo "FAIL: wavEditCloseIfOpen no longer closes an open file browser"
  fail=1
else
  echo "  ok   — and it closes davebox's own browse, not only a wave-editor errand"
fi
if grep -Fq "if (hadErrand && S.view === VIEW_FILE) leaveFileBrowser();" "$f"; then
  echo "FAIL: the retarget close is gated on the wave-editor errand —"
  echo "      davebox's own browse would keep the auditioned sample"
  fail=1
fi

[ "$fail" -eq 0 ] && echo "PASS: the file browser's audition is armed, fired and closed" || exit 1
