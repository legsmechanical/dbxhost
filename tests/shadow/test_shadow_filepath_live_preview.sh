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

need() {  # need <file> <literal> <failure message>
  if ! rg -F -q -- "$2" "$1"; then
    echo "FAIL: $3" >&2
    exit 1
  fi
}

# ---- the mechanism, where it lives now ------------------------------------
need "$shared_file" "state.livePreviewEnabled = parseMetaBool(effectiveMeta.live_preview);" \
     "live_preview metadata is not read when the browser opens"
need "$shared_file" "export function applyLivePreview(state, selected, io) {" \
     "live preview helper function is missing"
need "$shared_file" "state.previewOriginalValue = currentValue;" \
     "the browser does not snapshot the original value for the live-preview cancel"
need "$shared_file" "state.previewPendingPath = selected.path;" \
     "the browser does not queue a pending live-preview path when the highlight moves"
need "$shared_file" "state.previewPendingTime = Date.now();" \
     "the browser does not timestamp pending live-preview updates"
need "$shared_file" "if (at - state.previewPendingTime < FILEPATH_PREVIEW_DEBOUNCE_MS) return;" \
     "the browser is missing the debounce threshold on a pending live preview"
need "$shared_file" "export const FILEPATH_PREVIEW_DEBOUNCE_MS = 150;" \
     "the debounce interval changed or is no longer named"
need "$shared_file" "state.previewCommitted = true;" \
     "the browser does not mark the preview committed on select"
need "$shared_file" "state.previewCurrentValue !== state.previewOriginalValue" \
     "the cancel path does not compare the preview value against the original"
need "$shared_file" "io.setParam(state.previewParamFullKey, state.previewOriginalValue || '');" \
     "the cancel path does not restore the original value"

# ---- the host still REACHES it -------------------------------------------
# ⚠ Without these the mechanism above can be perfect and never run: that is
# exactly what a move like this risks, and a mechanism-only pin cannot see it.
need "$shadow_file" "initFilepathPreview(filepathBrowserState, effectiveMeta, fullKey, currentVal," \
     "the host does not arm the preview when it opens the browser"
need "$shadow_file" "armFilepathPreview(filepathBrowserState);" \
     "the host does not arm an audition when the highlight moves"
need "$shadow_file" "tickFilepathPreview(filepathBrowserState, FILEPATH_BROWSER_PARAM_IO);" \
     "the host never fires an armed audition — the debounce would hang forever"
need "$shadow_file" "commitFilepathSelection(filepathBrowserState, result.value);" \
     "the host does not record the pick, so closing would revert it"
need "$shadow_file" "finishFilepathPreview(filepathBrowserState, FILEPATH_BROWSER_PARAM_IO);" \
     "the host does not commit-or-restore when the browser closes"

# ---- and the io it hands over is the real one ----------------------------
need "$shadow_file" "return getSlotParam(hierEditorSlot, key);" \
     "the host io does not read the parameter through the slot"
need "$shadow_file" "return setSlotParam(hierEditorSlot, key, value);" \
     "the host io does not write the parameter through the slot, or drops its RESULT"

need "$docs_file" "- \`live_preview\` (optional): When true, moving the file-browser cursor over files temporarily sets the parameter to that file until the user confirms or cancels." \
     "docs/MODULES.md does not document the filepath live_preview field"

echo "PASS: filepath browser live preview wiring present (shared mechanism + host call sites)"
exit 0
