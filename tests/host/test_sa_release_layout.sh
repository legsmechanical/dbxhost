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
printf '<!DOCTYPE html><title>manual</title>' > "$T/manual.html"
echo "build-sa-release.sh:"
BUILD_DIR="$B" HEAL_BIN="$T/heal" DAVEBOX_DIST="$D" MANUAL_HTML="$T/manual.html" SA_VERSION=1.2.3 bash standalone/scripts/build-sa-release.sh "$T/out" > "$T/log" 2>&1 || { bad "exit $?: $(cat "$T/log")"; }
tb="$T/out/davebox-sa-module.tar.gz"
[ -f "$tb" ] && ok "tarball built" || bad "no tarball"
L="$(tar -tzf "$tb")"
has(){ printf '%s\n' "$L" | grep -qx "$1"; }
has "davebox-sa/module.json" && ok "one top-level dir named after the module id, with module.json" || bad "module.json not at davebox-sa/"
has "davebox-sa/standalone" && ok "the standalone executable (launch.sh)" || bad "no standalone"
has "davebox-sa/boot-entry.sh" && ok "boot-entry.sh ships in the module dir (module.json's boot_target exec)" || bad "no boot-entry.sh"
tar -xzf "$tb" -C "$T" davebox-sa/boot-entry.sh davebox-sa/module.json 2>/dev/null
[ -x "$T/davebox-sa/boot-entry.sh" ] && cmp -s "$T/davebox-sa/boot-entry.sh" standalone/boot-target/entry.sh \
    && ok "...executable, and the repo's entry.sh" || bad "boot-entry.sh not executable or not entry.sh"
grep -q '"exec": "boot-entry.sh"' "$T/davebox-sa/module.json" && ok "the shipped module.json declares that exec" || bad "module.json boot_target exec"
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
has "davebox-sa/payload/help/manual.html" && tar -xzf "$tb" -C "$T" davebox-sa/payload/help/manual.html \
    && cmp -s "$T/davebox-sa/payload/help/manual.html" "$T/manual.html" \
    && ok "the HTML manual ships as help/manual.html (the Help page)" || bad "no help/manual.html in the payload"
BUILD_DIR="$B" HEAL_BIN="$T/heal" DAVEBOX_DIST="$D" MANUAL_HTML="$T/no-such.html" SA_VERSION=1.2.3 bash \
    standalone/scripts/build-sa-release.sh "$T/out2" > "$T/log2" 2>&1
[ $? -ne 0 ] && grep -q "is the Help page" "$T/log2" && ok "...and a release WITHOUT the manual refuses to build" \
    || bad "built without the manual: $(cat "$T/log2")"
for f in LICENSE THIRD_PARTY_LICENSES.md licenses/GPL-2.0.txt licenses/GPL-3.0.txt; do
    has "davebox-sa/payload/$f" && ok "payload/$f ships (the shim is GPL-3.0-or-later as conveyed)" || bad "payload/$f missing — a GPL binary shipped without its licence"
done
has "davebox-sa/payload/splash-2.hex" && ok "the splash pool (the daves) still ships (Josh: keep the daves)" || bad "a splash hex is missing"
echo "release.json:"
rv="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' release.json | head -1)"; mv="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' standalone/module/module.json | head -1)"
[ -n "$rv" ] && [ "$rv" = "$mv" ] && ok "release.json version ($rv) == module.json version" || bad "release.json ($rv) vs module.json ($mv)"
grep -q "releases/download/v$rv/davebox-sa-module.tar.gz" release.json && ok "download_url names the tag and the asset" || bad "download_url wrong: $(grep download_url release.json)"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
