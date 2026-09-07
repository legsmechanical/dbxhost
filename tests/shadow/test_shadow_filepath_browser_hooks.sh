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

# ---- the mechanism, where it lives now ------------------------------------
need "$shared_file" "export function buildFilepathBrowserHooks(meta, prefix) {" \
     "the filepath browser hooks builder is missing"
need "$shared_file" "onOpen: normalizeFilepathHookActions(hooksRaw.on_open, prefix)" \
     "on_open hooks are not wired"
need "$shared_file" "onPreview: normalizeFilepathHookActions(hooksRaw.on_preview, prefix)" \
     "on_preview hooks are not wired"
need "$shared_file" "onCancel: normalizeFilepathHookActions(hooksRaw.on_cancel, prefix)" \
     "on_cancel hooks are not wired"
need "$shared_file" "onCommit: normalizeFilepathHookActions(hooksRaw.on_commit, prefix)" \
     "on_commit hooks are not wired"
need "$shared_file" "applyFilepathHookActions(state, state.hooksOnOpen, { path: currentValue }, io);" \
     "on_open hooks are never executed"
need "$shared_file" "state, state.hooksOnCommit," \
     "on_commit hooks are never executed"
need "$shared_file" "state, state.hooksOnCancel," \
     "on_cancel hooks are never executed"

# ---- the host still REACHES it -------------------------------------------
need "$shadow_file" "initFilepathPreview(filepathBrowserState, effectiveMeta, fullKey, currentVal," \
     "the host never builds the hooks, so no module hook can ever fire"
need "$shadow_file" "finishFilepathPreview(filepathBrowserState, FILEPATH_BROWSER_PARAM_IO);" \
     "the host never runs the commit/cancel hooks when the browser closes"

need "$docs_file" '- `browser_hooks` (optional): Event hooks to run additional parameter writes at browser lifecycle points. Supported keys: `on_open`, `on_preview`, `on_cancel`, `on_commit`.' \
     "docs/MODULES.md does not document the browser_hooks field"

echo "PASS: filepath browser hooks wiring present (shared mechanism + host call sites)"
exit 0
