#!/usr/bin/env bash
# tests/host/test_license_consistency.sh — the licence statements agree with
# what is actually built and shipped.
#   - LICENSE is MIT, and no document claims CC BY-NC-SA any more (the old
#     THIRD_PARTY_LICENSES.md did, beside an MIT LICENSE; NC is incompatible
#     with every GPL component shipped here).
#   - ONE third-party document: an extensionless THIRD_PARTY_LICENSES copy had
#     diverged (it listed external modules this repo does not ship).
#   - the shim links libespeak-ng, so the doc must say the shim is conveyed
#     under GPL-3.0-or-later, and the GPL texts must exist and be shipped.
#   - JackShadowDriver.cpp is GPL-2.0-or-later, not MIT.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }

head -1 LICENSE | grep -q "MIT License" && ok "LICENSE is MIT" || bad "LICENSE is not MIT"
[ ! -e THIRD_PARTY_LICENSES ] && ok "no extensionless THIRD_PARTY_LICENSES duplicate" || bad "THIRD_PARTY_LICENSES (no extension) is back"
hits=$(git grep -l -i "CC BY-NC-SA\|BY-NC-SA" -- ':!tests/host/test_license_consistency.sh' ':!*.png' 2>/dev/null)
[ -z "$hits" ] && ok "no CC BY-NC-SA claim anywhere" || bad "CC BY-NC-SA claimed in: $hits"

grep -q -- "-lespeak-ng" scripts/build.sh \
  && { grep -q "schwung-shim.so.*GPL-3.0-or-later" THIRD_PARTY_LICENSES.md \
         && ok "shim links eSpeak NG and the doc conveys it as GPL-3.0-or-later" \
         || bad "shim links -lespeak-ng but THIRD_PARTY_LICENSES.md does not say it is GPL-3.0-or-later"; } \
  || ok "shim does not link eSpeak NG"
grep -q "^## eSpeak NG" THIRD_PARTY_LICENSES.md && ok "eSpeak NG section" || bad "no eSpeak NG section"
grep -q "^## Ableton Link" THIRD_PARTY_LICENSES.md && ok "Ableton Link section" || bad "no Ableton Link section"

for f in licenses/GPL-2.0.txt licenses/GPL-3.0.txt; do
    [ -s "$f" ] && ok "$f present" || bad "$f missing"
done
grep -q 'cp licenses/GPL-2.0.txt licenses/GPL-3.0.txt ./build/licenses/' scripts/build.sh \
  && ok "build.sh stages the GPL texts" || bad "build.sh does not stage the GPL texts"
grep -q 'cp "$REPO_ROOT/LICENSE" "$REPO_ROOT/THIRD_PARTY_LICENSES.md" "$P/"' standalone/scripts/build-sa-release.sh \
  && ok "the release tarball carries LICENSE + THIRD_PARTY_LICENSES.md" || bad "build-sa-release.sh does not ship the licence files"
grep -E '^cp (LICENSE|licenses/GPL)' scripts/build.sh | grep -q '|| true' \
  && bad "a licence copy in build.sh is allowed to fail silently" || ok "licence staging cannot fail silently"

sed -n 1,30p src/lib/jack2/shadow/JackShadowDriver.cpp | grep -q "License: MIT" \
  && bad "JackShadowDriver.cpp claims MIT (it is GPL-2.0-or-later)" \
  || ok "JackShadowDriver.cpp does not claim MIT"
sed -n 1,30p src/lib/jack2/shadow/JackShadowDriver.cpp | grep -q "GNU General Public License" \
  && ok "JackShadowDriver.cpp carries the GPL header" || bad "JackShadowDriver.cpp has no GPL header"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
