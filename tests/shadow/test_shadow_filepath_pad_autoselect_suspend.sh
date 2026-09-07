#!/usr/bin/env bash
# ⚠ RETARGETED 2026-09-07: the browser's live preview and its browser_hooks
# moved OUT of shadow_ui.js and into src/shared/filepath_browser.mjs, so a
# second consumer (dAVEBOx, which draws its own browser) inherits the behaviour
# instead of silently having none. The mechanism is pinned where it now lives;
# the HOST is pinned at its CALL SITES, because a mechanism that is still
# present and no longer reached is the failure this pair has to be able to see.
set -euo pipefail

shadow_file="src/shadow/shadow_ui.js"
shared_file="src/shared/filepath_browser.mjs"
docs_file="docs/MODULES.md"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

need() {
  if ! rg -F -q -- "$2" "$1"; then
    echo "FAIL: $3" >&2
    exit 1
  fi
}

# The old bespoke alias is gone; a module suspends pad auto-select with an
# ordinary borrowing hook instead.
for f in "$shadow_file" "$shared_file"; do
  if rg -F -q "suspend_auto_select" "$f"; then
    echo "FAIL: $f still contains suspend_auto_select alias behavior" >&2
    exit 1
  fi
done

if rg -F -q -- '- `suspend_auto_select` (optional):' "$docs_file"; then
  echo "FAIL: docs/MODULES.md still documents suspend_auto_select alias field" >&2
  exit 1
fi

need "$shared_file" "normalizeFilepathHookActions(hooksRaw.on_open, prefix)" \
     "the on_open hook is not wired"
need "$shared_file" "applyFilepathHookActions(state, state.hooksOnOpen, { path: currentValue }, io);" \
     "on_open hook actions are never applied"
need "$shared_file" "restoreFilepathHookActions(state, io);" \
     "hook-managed params are not put back when the browser closes"

# ⭑ What makes `restore: true` work at all: the borrow happens ONCE, on the
# first pass, or a second pass through the same hook would record the value
# this browser itself wrote and "restore" to it.
need "$shared_file" "!Object.prototype.hasOwnProperty.call(state.hookRestoreValues, action.key)" \
     "a borrowed value can be overwritten by a later pass — restore would put back the wrong value"

need "$shadow_file" "finishFilepathPreview(filepathBrowserState, FILEPATH_BROWSER_PARAM_IO);" \
     "the host never reaches the restore, so a suspended pad auto-select would stay suspended"

need "$docs_file" '- For pad samplers, you can suspend auto-pad switching while browsing by adding `{"key":"ui_auto_select_pad","value":"off","restore":true}` to `browser_hooks.on_open`.' \
     "docs/MODULES.md missing browser_hooks-based pad auto-select suspend guidance"

echo "PASS: filepath browser uses browser_hooks for pad auto-select suspension"
exit 0
