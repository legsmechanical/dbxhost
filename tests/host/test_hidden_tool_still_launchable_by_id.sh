#!/usr/bin/env bash
set -euo pipefail

# `hidden: true` in module.json suppresses a tool from the BROWSABLE Tools menu.
# It must NOT make the tool unlaunchable by an explicit id.
#
# Both id-resolving call sites (host_open_file_in_tool and the open_tool_cmd
# handler) must therefore resolve against a hidden-INCLUSIVE scan, i.e.
# scanForToolModules(true) — never the cached `toolModules`, which is the
# filtered browsable list.
#
# This regressed silently before it was caught: a tool kept off the menu and
# booted into by id simply "was not found", logging one debug line and dropping
# the user at the host menu with no error. Pinning the call shape is the cheap
# guard, because the failure has no louder symptom.

cd "$(dirname "$0")/../.."

file="src/shadow/shadow_ui.js"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

# Both resolvers must ask for hidden tools explicitly.
n_inclusive=$(rg -c 'scanForToolModules\(true\)' "$file" || true)
if [ "${n_inclusive:-0}" -lt 2 ]; then
  echo "FAIL: expected both id-resolvers in $file to call scanForToolModules(true);" >&2
  echo "      found ${n_inclusive:-0}. A hidden tool would become unlaunchable by id." >&2
  exit 1
fi

# And neither may resolve an id against the filtered/cached browsable list.
if rg -n 'toolModules\.find\(t => t\.id ===' "$file" >/dev/null 2>&1; then
  echo "FAIL: $file resolves a tool id against the cached toolModules list," >&2
  echo "      which excludes hidden tools. Use scanForToolModules(true)." >&2
  exit 1
fi

# The scanner must actually honour the parameter.
tools="src/shadow/shadow_ui_tools.mjs"
if ! rg -n 'includeHidden \|\| !json\.hidden' "$tools" >/dev/null 2>&1; then
  echo "FAIL: $tools no longer gates the hidden filter on includeHidden." >&2
  exit 1
fi

echo "PASS: hidden tools stay off the menu but remain launchable by explicit id"
exit 0
