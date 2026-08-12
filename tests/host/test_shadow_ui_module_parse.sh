#!/usr/bin/env bash
# QuickJS-loaded JS must parse as a MODULE, not just as a script.
#
# ⚠⚠ `node --check` is NOT this check and never was. It parses a .js file as
# CommonJS, wrapping it in a function — which makes constructs legal that
# QuickJS, loading the same file as a module, rejects outright. Two classes have
# reached the device this way:
#
#   - top-level `return` left behind by an unwrap (legal inside CommonJS's
#     wrapper, `SyntaxError: return not in a function` under QuickJS)
#   - a stray closing brace from a deletion — 2026-08-12, when the copy-detection
#     arm was removed from processSetChangedFlag and the else's `}` stayed. Braces
#     still balanced, `node --check` passed, the davebox JS suite passed (it never
#     evaluates the host's shadow_ui.js), and the build shipped. On device
#     shadow_ui died during eval: zombie process, black OLED, and NOTHING logged,
#     because the failure preceded any code that could log it. It cost a hardware
#     bisect to find a one-character fault.
#
# A module parse catches both, off-device, in under a second.
#
# ⚠ What it still cannot catch: a reference to a deleted symbol from code that
# runs AT LOAD (populateCtx, top-level blocks) — that is a runtime ReferenceError,
# and no parser sees it. After any symbol deletion, sweep the file for the removed
# identifier by name, and remember the on-device gate that prints the real error:
#   cd /data/UserData/dbx-host/shadow && timeout 5 ./shadow_ui
# (with a live session's SHM present; without it, it exits before eval and proves
# nothing). See [[schwung-node-check-wrong-gate-for-shadow-ui-js]].
set -u
cd "$(dirname "$0")/../.."

command -v node >/dev/null 2>&1 || { echo "SKIP: shadow_ui module parse (no node)"; exit 0; }

fail=0
echo "QuickJS-loaded JS parses as a module:"
for f in src/shadow/shadow_ui.js; do
    [ -f "$f" ] || { echo "  FAIL — $f missing"; fail=1; continue; }
    msg=$(node --experimental-vm-modules -e "
const vm = require('vm'), fs = require('fs');
try { new vm.SourceTextModule(fs.readFileSync(process.argv[1], 'utf8')); }
catch (e) { console.log(e.message.split('\n')[0]); process.exitCode = 1; }
" "$f" 2>/dev/null)
    if [ -n "$msg" ]; then
        echo "  FAIL — $f: $msg"
        echo "         ⚠ node --check will NOT reproduce this. QuickJS loads it as a module."
        fail=1
    else
        echo "  ok   — $f"
    fi
done

[ "$fail" = 0 ] && echo "PASS: shadow_ui module parse" || echo "FAIL: shadow_ui module parse" >&2
exit "$fail"
