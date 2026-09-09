#!/usr/bin/env bash
# The build must REGENERATE dist/, not accumulate into it — and must not wipe
# it twice.
#
# ⭐ WHY: install_sound.sh ships `dist/<id>/*` WHOLESALE, so anything the
# directory has ever held reaches the device under a manifest that counts it as
# ours. Nothing warns. Prompted 2026-09-08 by the DR32 session hitting the same
# class one door over: a tracked `build/obj/*.o` outlived its deleted source and
# was LINKED into the shipped dsp.so, silently, because a shared-library link
# need not resolve undefined symbols.
#
# ⚠⚠ AND THE FIX HAD ITS OWN TRAP, which is the real reason this file exists.
# Both build scripts RE-RUN THEMSELVES inside Docker with SKIP_BUNDLE=1 on the
# same mounted volume. An unguarded `rm -rf dist/<id>` therefore runs TWICE, and
# the second pass deletes the ui.js the host just bundled — shipping a module
# with NO UI from a build that exits 0 and prints its usual success line. That
# was caught by dropping a decoy file into dist/ and looking afterwards, not by
# reading the script. → [[explaining-is-not-checking]]
#
# This is a SOURCE pin (fast, runs in CI). The functional check needs a real
# ~90 s Docker build, so it is run by hand; the invariant it protects is that
# the wipe exists AND is guarded.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

for f in scripts/build.sh scripts/build_sound.sh; do
    [ -f "$f" ] || { bad "$f is missing"; continue; }

    if grep -q 'rm -rf "dist/${MODULE_ID}"' "$f"; then
        ok "$f wipes dist/\$MODULE_ID rather than accumulating into it"
    else
        bad "$f never wipes dist/\$MODULE_ID — stale artifacts would ship"
        continue
    fi

    # The wipe must sit inside a SKIP_BUNDLE guard: the inner Docker pass must
    # not delete what the outer pass bundled.
    if grep -B4 'rm -rf "dist/${MODULE_ID}"' "$f" | grep -q 'if \[ -z "\$SKIP_BUNDLE" \]'; then
        ok "$f guards the wipe on the OUTER pass (SKIP_BUNDLE empty)"
    else
        bad "$f wipes dist UNGUARDED — the Docker re-run would delete the bundle"
    fi

    # ...and the re-entry this is all about must still be the shape we assumed.
    if grep -q 'SKIP_BUNDLE=1' "$f"; then
        ok "$f still re-runs itself with SKIP_BUNDLE=1 (the guard has a subject)"
    else
        bad "$f no longer re-runs itself — re-check whether the guard still fits"
    fi
done

[ "$fail" = 0 ] && echo "PASS: dist is regenerated once, by the outer pass only" \
                || echo "FAIL: dist wipe invariants"
exit "$fail"
