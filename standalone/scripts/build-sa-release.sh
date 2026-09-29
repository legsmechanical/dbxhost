#!/usr/bin/env bash
# standalone/scripts/build-sa-release.sh — assemble the CATALOG TARBALL for the
# launcher module (2026-09-05, the zero-SSH install). schwung-manager extracts a
# module tarball into modules/tools/ and expects one top-level dir named after
# the module id (noisemaker's build.sh ships `$ID/`); ours carries the WHOLE
# deliverable so the first launch can install it with no SSH:
#
#   davebox-sa/
#     module.json                 the launcher (standalone: true)
#     standalone                  = standalone/scripts/launch.sh
#     boot-entry.sh               = standalone/boot-target/entry.sh — the boot
#                                 selector's exec. module.json's boot_target block
#                                 names it, and stock's manager registers the row
#                                 (owned by this module, removed with it; the
#                                 boot DEFAULT is never touched).
#     payload/                    the dbx-host tree, laid by layout-install.sh
#       schwung, shadow/, scripts/, lib/, help/, sets/template, splash*, bless.sh …
#       help/manual.html          the full HTML manual — the manager's Help page
#                                 (built by davebox/scripts/build_manual_html.sh)
#       bin/heal                  the privileged helper — STAGED by bootstrap.sh as
#                                 bin/heal.new for stock heal to bless. ⚠ NEVER a
#                                 pre-blessed bin/heal in the module dir: the manager
#                                 chowns the tree to ableton on install, stripping setuid.
#       modules/chain/            the owned chain host
#       modules/tools/davebox-sound/  the sequencer module — from davebox/dist, the
#                                 bundle install_sound.sh ships (not dist/davebox/)
#       sa-version.txt            what bootstrap.sh compares sa-build.json against
#
# NOT shipped: build/presets, build/patches (shared with stock — links, never
# copies), every stock module category (linked on the device by the layout).
#
#   ./standalone/scripts/build-sa-release.sh [out-dir]
# Env for tests: BUILD_DIR, HEAL_BIN, DAVEBOX_DIST, SA_VERSION, MANUAL_HTML.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
. "$HERE/config.sh"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/build}"
HEAL_BIN="${HEAL_BIN:-$HERE/build/$DBX_HEAL_NAME}"
DAVEBOX_DIST="${DAVEBOX_DIST:-$REPO_ROOT/davebox/dist/davebox-sound}"
MANUAL_HTML="${MANUAL_HTML:-$REPO_ROOT/davebox/dist/manual/dAVEBOx-SA-manual.html}"
OUT="${1:-$REPO_ROOT}"
ID="$DBX_LAUNCHER_ID"
SA_VERSION="${SA_VERSION:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$HERE/module/module.json" | head -1)}"

for f in "$BUILD_DIR/schwung" "$BUILD_DIR/shadow/shadow_ui" "$BUILD_DIR/scripts/layout-install.sh" \
         "$BUILD_DIR/scripts/bootstrap.sh" "$BUILD_DIR/scripts/config.sh" "$HEAL_BIN" \
         "$DAVEBOX_DIST/module.json" "$DAVEBOX_DIST/dsp.so" "$DAVEBOX_DIST/ui.js"; do
    [ -e "$f" ] || { echo "ERROR: missing $f — build the host (build-host.sh), heal (build-heal.sh) and davebox (davebox/scripts/build_sound.sh) first" >&2; exit 1; }
done
# The Help page IS the manual (Josh, 2026-09-28): a release without it would
# show testers an empty Help page, so it is required, never skipped.
[ -s "$MANUAL_HTML" ] || { echo "ERROR: missing $MANUAL_HTML — the HTML manual (davebox/scripts/build_manual_html.sh) is the Help page" >&2; exit 1; }
[ -d "$BUILD_DIR/modules/chain" ] || { echo "ERROR: $BUILD_DIR/modules/chain missing (the owned chain host)" >&2; exit 1; }

stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
M="$stage/$ID"; P="$M/payload"
mkdir -p "$P/bin" "$P/modules/tools"
cp "$HERE/module/module.json" "$M/module.json"
cp "$HERE/scripts/launch.sh" "$M/standalone"; chmod +x "$M/standalone"
cp "$HERE/boot-target/entry.sh" "$M/boot-entry.sh"; chmod +x "$M/boot-entry.sh"
# the host tree, minus what is shared or linked on the device
# tests/ is the developer suite; it never runs on a user's device (and MUST not —
# its fixtures resolve real paths). Dropped from the catalog tarball (Josh, 2026-09-05).
rsync -a --exclude='/modules' --exclude='/presets' --exclude='/patches' --exclude='/.deploy-stage' --exclude='/tests' \
    --exclude='*.o' --exclude='/.build-*' \
      "$BUILD_DIR/" "$P/"
cp -R "$BUILD_DIR/modules/chain" "$P/modules/chain"
cp -R "$DAVEBOX_DIST" "$P/modules/tools/davebox-sound"
cp "$HEAL_BIN" "$P/bin/heal"; chmod 755 "$P/bin/heal"
mkdir -p "$P/help"; cp "$MANUAL_HTML" "$P/help/manual.html"
# Licences come from the REPO, not the build dir, so no stale or partial build
# can drop them: schwung-shim.so links libespeak-ng (GPL-3.0-or-later) and
# link-subscriber is GPL-2.0-or-later, so a tarball without these texts is
# non-compliant while looking identical to a good one. set -e makes a missing
# file fatal. See THIRD_PARTY_LICENSES.md.
mkdir -p "$P/licenses"
cp "$REPO_ROOT/LICENSE" "$REPO_ROOT/THIRD_PARTY_LICENSES.md" "$P/"
cp "$REPO_ROOT/licenses/GPL-2.0.txt" "$REPO_ROOT/licenses/GPL-3.0.txt" "$P/licenses/"
printf '%s\n' "$SA_VERSION" > "$P/sa-version.txt"
# A TEST build (0.0.x) ships with the debug log ON (Josh, 2026-09-28: "some
# reasonable logging always on (even for testers)"). The log is capped
# (src/host/unified_log.c), so this cannot fill a user's disk.
case "$SA_VERSION" in 0.0.*) : > "$P/debug_log_on"; echo "test build $SA_VERSION: debug log on by default" ;; esac
chmod +x "$P/scripts/"*.sh "$P/bless.sh" 2>/dev/null || true

mkdir -p "$OUT"
tarball="$OUT/$ID-module.tar.gz"
tar -C "$stage" -czf "$tarball" "$ID/"
echo "built $tarball ($(du -h "$tarball" | cut -f1)) — sa-version $SA_VERSION"
