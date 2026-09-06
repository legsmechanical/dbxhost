#!/usr/bin/env bash
# tests/host/test_bootstrap.sh — the zero-SSH first install (2026-09-05): BLESS
# FIRST via stock's heal, then the payload, then the restore unit, then the
# stamp — and a stock host that cannot bless leaves the device untouched.
# Stock heal and our heal are stubs: the stock stub "blesses" by chmod u+s on the
# staged file (a non-root owner may set the bit on its own file, which is what
# `test -u` reads); ours logs its verb.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mk() {  # a fresh fixture: stock tree with (or without) a blessing heal, module dir with payload
    rm -rf "$T/f"; mkdir -p "$T/f/stock/bin" "$T/f/stock/modules/tools" "$T/f/mod/payload/scripts" "$T/f/mod/payload/bin" "$T/f/mod/payload/shadow"
    cp standalone/scripts/bootstrap.sh standalone/scripts/layout-install.sh "$T/f/mod/payload/scripts/"
    cp standalone/config.sh "$T/f/mod/payload/scripts/config.sh"
    printf 'host\n' > "$T/f/mod/payload/schwung"; printf 'ui\n' > "$T/f/mod/payload/shadow/shadow_ui"
    printf 'v-test\n' > "$T/f/mod/payload/sa-version.txt"
    # our heal: a stub that logs its verb (it is what gets blessed and then called)
    cat > "$T/f/mod/payload/bin/heal" <<'H'
#!/bin/sh
echo "$*" >> "$(dirname "$0")/heal.log"
H
    chmod 755 "$T/f/mod/payload/bin/heal"
    if [ "$1" = blesses ]; then
        cat > "$T/f/stock/bin/schwung-heal" <<'S'
#!/bin/sh
d="$(dirname "$0")/../modules/tools"
for id in "$d"/*/; do [ -f "$id/bin/heal.new" ] && mv -f "$id/bin/heal.new" "$id/bin/heal" && chmod 4755 "$id/bin/heal"; done
exit 0
S
    else
        printf '#!/bin/sh\nexit 0\n' > "$T/f/stock/bin/schwung-heal"     # pre-#419: does nothing
    fi
    chmod 755 "$T/f/stock/bin/schwung-heal"
    ln -s "$T/f/mod" "$T/f/stock/modules/tools/davebox-sa"
}
run() { MOD_DIR="$T/f/mod" DBX_DIR="$T/f/dbx" STOCK_DIR="$T/f/stock" STOCK_HEAL="$T/f/stock/bin/schwung-heal" \
        sh "$T/f/mod/payload/scripts/bootstrap.sh" > "$T/out" 2>&1; echo $?; }

echo "a stock heal that blesses (schwung#419):"
mk blesses
rc=$(run)
[ "$rc" = 0 ] && ok "bootstrap exits 0" || { bad "rc=$rc"; cat "$T/out"; }
[ -u "$T/f/mod/bin/heal" ] && ok "the helper is blessed (setuid), staged from the payload" || bad "not blessed"
[ ! -f "$T/f/mod/bin/heal.new" ] && ok "the stage is consumed" || bad "heal.new left behind"
[ -x "$T/f/dbx/schwung" ] && ok "the payload is laid into DBX_DIR" || bad "no install"
grep -qx -- "--install-restore-unit" "$T/f/mod/bin/heal.log" 2>/dev/null && ok "heal --install-restore-unit ran" || bad "restore unit not installed: $(cat "$T/f/mod/bin/heal.log" 2>/dev/null)"
grep -q '"version":"v-test"' "$T/f/dbx/sa-build.json" && ok "sa-build.json stamped with the payload version" || bad "no stamp"
echo "  order:"; grep -n "blessed\|installing payload\|done" "$T/out" | cut -c1-80
b=$(grep -n "blessed:" "$T/out" | cut -d: -f1); p=$(grep -n "installing payload" "$T/out" | cut -d: -f1)
[ -n "$b" ] && [ -n "$p" ] && [ "$b" -lt "$p" ] && ok "BLESS happens before the payload" || bad "order wrong"
echo "second launch:"
: > "$T/f/mod/bin/heal.log"
rc=$(run)
[ "$rc" = 0 ] && grep -q "install present (v-test)" "$T/out" && ok "install present → payload not re-laid" || bad "re-laid or failed: $(cat "$T/out")"
echo "a DEV install is never replaced (device, 2026-09-06):"
printf '{"version":"3b281910","host":1,"davebox":1,"installed":"x","by":"install-sa"}\n' > "$T/f/dbx/sa-build.json"
printf 'dev-host\n' > "$T/f/dbx/schwung"; chmod 755 "$T/f/dbx/schwung"
rc=$(run)
[ "$rc" = 0 ] && [ "$(cat "$T/f/dbx/schwung")" = "dev-host" ] && grep -q '"version":"3b281910"' "$T/f/dbx/sa-build.json" && ok "a sha-stamped install stays, stamp untouched" || bad "the dev install was replaced: $(cat "$T/out")"
echo "a NEWER release is never downgraded; an OLDER one is upgraded:"
printf '{"version":"9.9.9","host":1,"davebox":1,"installed":"x","by":"bootstrap"}\n' > "$T/f/dbx/sa-build.json"; printf 'newer\n' > "$T/f/dbx/schwung"
printf '0.2.0\n' > "$T/f/mod/payload/sa-version.txt"
rc=$(run)
[ "$rc" = 0 ] && [ "$(cat "$T/f/dbx/schwung")" = "newer" ] && ok "9.9.9 kept against a 0.2.0 payload" || bad "downgraded: $(cat "$T/out")"
printf '{"version":"0.1.0","host":1,"davebox":1,"installed":"x","by":"bootstrap"}\n' > "$T/f/dbx/sa-build.json"
rc=$(run)
[ "$rc" = 0 ] && [ "$(cat "$T/f/dbx/schwung")" = "host" ] && grep -q '"version":"0.2.0"' "$T/f/dbx/sa-build.json" && ok "0.1.0 upgraded to the 0.2.0 payload" || bad "not upgraded: $(cat "$T/out")"
echo "the LAUNCHER re-blesses an existing install in place, and calls bootstrap only with no install:"
L=standalone/scripts/launch.sh
grep -q 're-blessing in place (no payload)' "$L" && ok "launch.sh re-blesses without the payload" || bad "no in-place re-bless"
awk '/no install at \$DBX_DIR -- bootstrap/{f=1} f&&/bootstrap.sh/{print; exit}' "$L" | grep -q 'bootstrap.sh' && ok "bootstrap.sh is reached only on the no-install branch" || bad "bootstrap reachable with an install present"
echo "a stock heal that cannot bless (pre-#419):"
mk cannot
rc=$(run)
[ "$rc" = 1 ] && ok "bootstrap REFUSES" || bad "rc=$rc"
[ ! -e "$T/f/dbx" ] && ok "...and touched nothing: no DBX_DIR was created" || bad "a half-install was created"
grep -q "bless.sh" "$T/out" && ok "...and names the manual root step" || bad "no manual instruction: $(cat "$T/out")"
[ -f "$T/f/mod/bin/heal.new" ] && ok "...the stage is left for the manual bless" || bad "stage gone"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
