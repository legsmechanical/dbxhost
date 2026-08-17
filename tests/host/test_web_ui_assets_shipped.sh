#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# davebox's remote UI used to be one self-contained web_ui.html. It is now a
# shell plus sibling classic scripts (web_ui_core.js, web_ui_seq.js), and BOTH
# halves of that arrangement fail silently:
#
#   - a file the build does not copy simply isn't on the device; the page loads,
#     the <script src> 404s, and the UI is a blank/dead grid with no error the
#     user can see (the manager serves the module dir, so there is no build step
#     left to notice the omission);
#   - a file that ships but is never referenced by a <script src=> is dead code
#     that looks live in the tree — the classic-script split means load ORDER is
#     the contract, and an unreferenced half is indistinguishable from a working
#     one until the feature it holds is used.
#
# So pin both directions: every davebox/web_ui_*.js must be matched by a copy in
# scripts/build_sound.sh AND referenced by web_ui.html.

ui_dir="davebox"
html="$ui_dir/web_ui.html"
# EVERY script that copies web_ui.html must copy the siblings too — build.sh
# (Legacy module id) and bundle_ui.sh each shipped a shell-only UI once.
builds=("$ui_dir/scripts/build_sound.sh" "$ui_dir/scripts/build.sh" "$ui_dir/scripts/bundle_ui.sh")

for f in "$html" "${builds[@]}"; do
  [ -f "$f" ] || { echo "FAIL: $f is missing" >&2; exit 1; }
done

shopt -s nullglob
assets=("$ui_dir"/web_ui_*.js)
if [ ${#assets[@]} -eq 0 ]; then
  echo "FAIL: no davebox/web_ui_*.js found — the remote UI split was reverted or renamed" >&2
  echo "      (if that is intentional, retire this test rather than leaving it vacuous)" >&2
  exit 1
fi

fail=0
for build in "${builds[@]}"; do
  # The cp targets, as shell glob patterns (basenames only). Read into an
  # array: an unquoted expansion here would GLOB the patterns against the cwd,
  # and with nullglob on, `web_ui_*.js` (no match at the repo root) would
  # vanish — the test would then fail for exactly the tree it is meant to pass.
  patterns=()
  while IFS= read -r pat; do
    [ -n "$pat" ] && patterns+=("$(basename "$pat")")
  done < <(grep -E '^[[:space:]]*cp[[:space:]]' "$build" | awk '{print $2}')

  for a in "${assets[@]}"; do
    base="$(basename "$a")"
    shipped=0
    for pat in "${patterns[@]}"; do
      # shellcheck disable=SC2053  — the RHS is deliberately a glob pattern
      if [[ "$base" == $pat ]]; then shipped=1; break; fi
    done
    if [ "$shipped" -eq 1 ]; then
      echo "  ok   — $base is copied by $(basename "$build")"
    else
      echo "  FAIL — $base is not copied by $(basename "$build") (it would be absent on device)" >&2
      fail=1
    fi
  done
done

for a in "${assets[@]}"; do
  base="$(basename "$a")"
  if grep -qF "<script src=\"$base\"" "$html"; then
    echo "  ok   — $base is loaded by $(basename "$html")"
  else
    echo "  FAIL — $base has no <script src=\"$base\"> in $(basename "$html") (dead file)" >&2
    fail=1
  fi
done

# The shell itself must carry no inline JS any more: the split only pays off if
# the code lives in the .js files, and a re-inlined block would drift from them.
if grep -qE '<script>[[:space:]]*$' "$html"; then
  echo "FAIL: $html has an inline <script> block again — the UI code belongs in web_ui_*.js" >&2
  fail=1
fi

[ $fail -eq 0 ] && echo "PASS: every davebox/web_ui_*.js ships (build_sound.sh) and loads (web_ui.html)"
exit $fail
