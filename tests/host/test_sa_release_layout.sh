#!/usr/bin/env bash
# tests/host/test_sa_release_layout.sh — the catalog tarball's LAYOUT (2026-09-05).
# Fed fixtures for the three build products, asserts what a first launch needs
# is there, what must never be there is not, and that release.json names the
# same version as module.json (the manager pins module.json to release.json's).
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
command -v rsync >/dev/null || { echo "SKIP: rsync missing"; exit 0; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
B="$T/build"; mkdir -p "$B/shadow" "$B/scripts" "$B/bin" "$B/modules/chain" "$B/modules/audio_fx/verb" "$B/presets" "$B/patches" "$B/help"
printf x > "$B/schwung"; printf x > "$B/shadow/shadow_ui"; printf x > "$B/bin/schwung-heal"
cp standalone/scripts/layout-install.sh standalone/scripts/bootstrap.sh "$B/scripts/"; cp standalone/config.sh "$B/scripts/config.sh"
cp standalone/scripts/install-privileged.sh "$B/bless.sh"
printf x > "$B/modules/chain/dsp.so"; printf x > "$B/modules/audio_fx/verb/x"; printf x > "$B/presets/p"; printf x > "$B/help/a.md"
mkdir -p "$B/tests/host"; printf x > "$B/tests/host/t.sh"; for i in 0 1 2; do printf x > "$B/splash-$i.hex"; done
D="$T/dist"; mkdir -p "$D"; printf '{"id":"davebox-sound","version":"9.9"}' > "$D/module.json"; printf x > "$D/dsp.so"; printf x > "$D/ui.js"
printf 'HEAL' > "$T/heal"
echo "build-sa-release.sh:"
BUILD_DIR="$B" HEAL_BIN="$T/heal" DAVEBOX_DIST="$D" SA_VERSION=1.2.3 bash standalone/scripts/build-sa-release.sh "$T/out" > "$T/log" 2>&1 || { bad "exit $?: $(cat "$T/log")"; }
tb="$T/out/davebox-sa-module.tar.gz"
[ -f "$tb" ] && ok "tarball built" || bad "no tarball"
L="$(tar -tzf "$tb")"
has(){ printf '%s\n' "$L" | grep -qx "$1"; }
has "davebox-sa/module.json" && ok "one top-level dir named after the module id, with module.json" || bad "module.json not at davebox-sa/"
has "davebox-sa/standalone" && ok "the standalone executable (launch.sh)" || bad "no standalone"
has "davebox-sa/payload/bin/heal" && ok "the helper travels UNBLESSED in payload/bin/" || bad "payload/bin/heal missing"
has "davebox-sa/bin/heal" && bad "a pre-blessed bin/heal in the module dir (the manager would chown it anyway)" || ok "no bin/heal in the module dir itself"
has "davebox-sa/payload/scripts/bootstrap.sh" && has "davebox-sa/payload/scripts/layout-install.sh" && has "davebox-sa/payload/scripts/config.sh" && ok "bootstrap, layout and config ride along" || bad "bootstrap/layout/config missing"
has "davebox-sa/payload/sa-version.txt" && ok "sa-version.txt present" || bad "no sa-version"
tar -xzf "$tb" -C "$T" davebox-sa/payload/sa-version.txt && [ "$(cat "$T/davebox-sa/payload/sa-version.txt")" = "1.2.3" ] && ok "...and carries the release version" || bad "wrong version"
has "davebox-sa/payload/modules/chain/dsp.so" && ok "the owned chain host ships" || bad "no chain"
has "davebox-sa/payload/modules/tools/davebox-sound/ui.js" && has "davebox-sa/payload/modules/tools/davebox-sound/dsp.so" && ok "the sequencer module ships from davebox/dist" || bad "davebox-sound missing"
has "davebox-sa/payload/bless.sh" && ok "bless.sh rides along for a pre-#419 stock host" || bad "no bless.sh"
printf '%s\n' "$L" | grep -q "payload/presets/" && bad "presets shipped (shared content — a link, never a copy)" || ok "no presets in the payload"
printf '%s\n' "$L" | grep -q "payload/patches/" && bad "patches shipped" || ok "no patches in the payload"
printf '%s\n' "$L" | grep -q "payload/modules/audio_fx" && bad "a stock module category shipped" || ok "no stock module categories"
printf '%s\n' "$L" | grep -q "payload/tests/" && bad "the developer test suite shipped (Josh, 2026-09-05: drop tests)" || ok "no tests/ in the payload"
has "davebox-sa/payload/splash-2.hex" && ok "the splash pool (the daves) still ships (Josh: keep the daves)" || bad "a splash hex is missing"
echo "release.json:"
rv="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' release.json | head -1)"; mv="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' standalone/module/module.json | head -1)"
[ -n "$rv" ] && [ "$rv" = "$mv" ] && ok "release.json version ($rv) == module.json version" || bad "release.json ($rv) vs module.json ($mv)"
grep -q "releases/download/v$rv/davebox-sa-module.tar.gz" release.json && ok "download_url names the tag and the asset" || bad "download_url wrong: $(grep download_url release.json)"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
