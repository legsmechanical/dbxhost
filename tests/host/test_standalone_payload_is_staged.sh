#!/usr/bin/env bash
set -euo pipefail

# The standalone runtime scripts must be staged into the install payload.
#
# A standalone session resolves these by ABSOLUTE path inside the install tree,
# so if the build does not stage them the failure lands at the worst moment and
# looks like a device fault:
#
#   scripts/quiesce-stock.sh   standalone/scripts/launch.sh -- without it the
#                              launcher cannot stand the stock stack down, so the
#                              session never comes up at all
#   scripts/exit-to-stock.sh   src/shadow/shadow_ui.js Shift+Back AND the hosted
#                              module's Quit -- without it BOTH exits are dead
#                              ends and the only way back to stock is a reboot
#   bless.sh                   the one-time root step (standalone/README.md)
#
# This regressed once by omission: the scripts lived in a different repo from the
# host build and were placed on the device by hand, so every install worked until
# somebody did a clean one.

if [ ! -d standalone ]; then
  echo "SKIP: no standalone/ in this tree (ordinary upstream-shaped build)"
  exit 0
fi

fail=0
for want in \
  "cp ./standalone/scripts/quiesce-stock.sh ./build/scripts/" \
  "cp ./standalone/scripts/exit-to-stock.sh ./build/scripts/" \
  "cp ./standalone/scripts/install-privileged.sh ./build/bless.sh"
do
  if ! grep -qF -- "$want" scripts/build.sh; then
    echo "FAIL: scripts/build.sh does not stage: $want" >&2
    fail=1
  fi
done

# The callers, pinned so a rename on either side is caught rather than shipped.
if ! grep -q 'scripts/quiesce-stock.sh' standalone/scripts/launch.sh; then
  echo "FAIL: launch.sh no longer calls scripts/quiesce-stock.sh -- update this test" >&2
  fail=1
fi
if ! grep -q 'scripts/exit-to-stock.sh' src/shadow/shadow_ui.js; then
  echo "FAIL: shadow_ui.js no longer calls scripts/exit-to-stock.sh -- update this test" >&2
  fail=1
fi

# Every helper a STAGED script imports must be staged too: project-cmd.sh's
# list once imported a new project_template.py the build did not copy, which
# would have killed every project verb on the device while every test here,
# run from the source tree, passed.
missing="$(python3 - <<'PY'
import os, re
build = open("scripts/build.sh").read()
staged = set(re.findall(r"cp \./standalone/scripts/(\S+) \./build/scripts/", build))
helpers = {f[:-3] for f in os.listdir("standalone/scripts") if f.endswith(".py")}
out = []
for f in sorted(staged):
    src = open(os.path.join("standalone/scripts", f), errors="replace").read()
    for m in re.finditer(r"^\s*(?:import\s+([\w, ]+?)(?:\s+as\s+\w+)?|from\s+(\w+)\s+import)\b", src, re.M):
        for name in re.split(r"\s*,\s*", (m.group(1) or m.group(2) or "").strip()):
            name = name.split(" as ")[0].strip()
            if name in helpers and name + ".py" not in staged:
                out.append("%s imports %s.py, which the build does not stage" % (f, name))
print("\n".join(sorted(set(out))))
PY
)"
if [ -n "$missing" ]; then
  echo "FAIL: $missing" >&2
  fail=1
fi

if [ "$fail" != "0" ]; then
  exit 1
fi

echo "PASS: standalone runtime payload is staged by the build"
exit 0
