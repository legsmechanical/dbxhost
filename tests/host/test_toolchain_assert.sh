#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

BS=davebox/scripts/build_sound.sh
HB=scripts/build.sh

# ---- which compiler actually made the artifact -------------------------------
# gcc writes its version into .comment for free, so this is READ, not added: no
# change to how anything is built, and byte-identity is unaffected. A hash
# proves two artifacts match; it cannot say they were made the same way.
# ⓘ Deleting the EXPECT_GCC assignment is NOT pinned here, deliberately: the
# variable then compares empty against a real version, so EVERY build fails
# loudly. Verified, not assumed. A mutant that cannot ship silently needs no
# guard; pinning it would only add a line that can rot.
#
# ⚠ Assert the COMPARISON and the EXIT, not the variable name: a first version
# of this check grepped for `EXPECT_GCC` and stayed green when the assignment
# was removed, because the name survives in the comment and the comparison.
grep -q "grep -m1 -oE '\^GCC:" "$BS" \
  && grep -q 'if \[ "$_got_gcc" != "$EXPECT_GCC" \]' "$BS" \
  && grep -A3 'if \[ "$_got_gcc" != "$EXPECT_GCC" \]' "$BS" | grep -q 'exit 1' \
  && ok "the module build reads the gcc version out of the artifact and EXITS on a mismatch" \
  || bad "$BS no longer fails the build when the toolchain is not the expected one"

# ⚠⚠ THE HALF THAT WAS FAKE. build_sound.sh RE-RUNS ITSELF inside Docker and the
# outer pass exits straight after `docker run`, so the assertion executes in the
# CONTAINER. An EXPECT_GCC that is not on that command line never arrives, and
# the check then compares the default against itself — it passed while demanding
# a compiler that does not exist. Verified by control on 2026-09-09: without the
# forward the negative control exits 0; with it, exit 1 and "built with gcc
# 12.2.0, expected 9.9.9".
grep -E 'docker run .*build_sound\.sh|bash -c "SKIP_BUNDLE=1' "$BS" | grep -q 'EXPECT_GCC' \
  && ok "...and the override is forwarded INTO the container, so the check can fail" \
  || bad "EXPECT_GCC is not forwarded on the docker run line — the assertion would compare the default with itself and can never fail"

# ---- never use `docker image inspect` as a presence test ----------------------
# Proven 2026-09-09, five attempts out of five: it reports a PRESENT, listed,
# runnable image as missing while `docker run` on that same image succeeds. In
# the DR32 repo that false negative fell through to a different builder image
# and silently switched compiler for three shipped commits, tolerated for months
# as a "full disk" flake with 20 GB free. Running the image tests presence AND
# capability at once and cannot lie the same way.
if grep -vE '^\s*#' "$HB" | grep -q 'docker image inspect'; then
  bad "$HB gates on \`docker image inspect\` — a false negative forces a surprise rebuild, which re-pulls the base"
else
  ok "the host build does not gate on \`docker image inspect\` (comments aside)"
fi
grep -q 'docker run --rm "\$IMAGE_NAME" true' "$HB" \
  && ok "...it starts the image instead, which tests presence and capability together" \
  || bad "$HB no longer probes the image by running it"

[ "$fail" = 0 ] && echo "PASS: the build says which toolchain made the artifact, and can fail" \
                || echo "FAIL: toolchain assertions"
exit "$fail"
