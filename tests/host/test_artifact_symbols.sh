#!/usr/bin/env bash
# The build must READ ITS OWN ARTIFACT, and the reader must be able to fail.
#
# ⭐ In one night this pair of repos produced FOUR build-vs-artifact
# divergences, every one of which printed success: a stale tracked object linked
# in; `docker image inspect` false-negativing into a different compiler; a build
# enumerating sources by hand while its tests globbed them; and a shipped .so
# calling two functions that do not exist. One failure, four doors: THE BUILD
# REPORTED SUCCESS WITHOUT LOOKING AT WHAT IT PRODUCED.
#
# This pins the reader (behaviourally, against crafted inputs — no build
# needed) and its wiring into both builds.
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

CHK=scripts/check-artifact.sh
ALLOW=scripts/artifact-allowlist.txt

[ -x "$CHK" ] || { echo "FAIL: $CHK missing or not executable"; exit 1; }

# ---- the reader, driven with a fake nm so no build is required --------------
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
touch "$tmp/artifact.so"

fake_nm() {                      # $1 = symbols, one per line
    printf '#!/bin/sh\nprintf "%%s\\n" %s\n' "$1" > "$tmp/nm"
    chmod +x "$tmp/nm"
}

# 1. an artifact carrying only allowlisted names passes
fake_nm "'         U __gmon_start__' '         U espeak_Synth' '         U malloc@GLIBC_2.17'"
if "$CHK" "$tmp/artifact.so" "$tmp/nm" >/dev/null 2>&1; then
    ok "an artifact with only allowlisted + versioned symbols passes"
else
    bad "the reader rejects an artifact it should accept"
fi

# 2. ...and one carrying an unknown name FAILS, naming it
fake_nm "'         U __gmon_start__' '         U totally_made_up_symbol'"
out=$("$CHK" "$tmp/artifact.so" "$tmp/nm" 2>&1) && rc=0 || rc=1
if [ "$rc" = 1 ] && printf '%s' "$out" | grep -q totally_made_up_symbol; then
    ok "an unexpected undefined symbol FAILS the build, and is named"
else
    bad "the reader did not fail on an unknown undefined symbol"
fi

# 3. ⚠ VERSIONED symbols are never flagged — they name the library that owns
#    them. Flagging them would make the check unusable and it would be switched
#    off, which is how a guard dies.
fake_nm "'         U some_random_libc_thing@GLIBC_2.17'"
if "$CHK" "$tmp/artifact.so" "$tmp/nm" >/dev/null 2>&1; then
    ok "versioned symbols are not flagged"
else
    bad "a versioned symbol was flagged — the check would be turned off"
fi

# 4. ⚠⚠ THE BLANK-LINE TRAP, and the flag that actually prevents it.
#    `grep -f` with an empty line in the pattern file matches EVERY line, which
#    would turn this into an unconditional pass — a guard that cannot fail.
#    The allowlist has comments and blank lines by design.
#
#    ⭑ What protects it is `-x` (whole-line match), NOT the comment-stripping:
#    with -x a blank pattern matches only a blank symbol name. Verified by
#    mutation — removing the strip leaves the check working, removing -x does
#    not. So -x is what is pinned; the strip stays as belt-and-braces.
fake_nm "'         U definitely_not_allowlisted'"
if "$CHK" "$tmp/artifact.so" "$tmp/nm" >/dev/null 2>&1; then
    bad "an unknown symbol passed — the allowlist is matching everything"
else
    ok "an allowlist full of comments still rejects an unknown symbol"
fi
grep -q 'grep -v -x -F -f' "$CHK" \
  && ok "the allowlist is matched WHOLE-LINE (-x) — without it a blank line matches everything" \
  || bad "the allowlist match lost -x: a blank or comment line now matches every symbol, and the check can never fail"

# ---- the allowlist says WHO provides each name ------------------------------
if grep -q "say who provides it" "$CHK" && grep -q "espeak-ng and flite" "$ALLOW"; then
    ok "the allowlist explains who resolves each entry at runtime"
else
    bad "the allowlist has lost its rationale — entries become decoration"
fi

# ---- both builds actually call it -------------------------------------------
grep -q 'check-artifact.sh" build/schwung-shim.so' scripts/build.sh \
  && ok "the host build reads the shim it just linked" \
  || bad "scripts/build.sh does not check the shim — the gate is not wired"
grep -q 'check-artifact.sh" "dist/\${MODULE_ID}/dsp.so"' davebox/scripts/build_sound.sh \
  && ok "the module build reads the dsp.so it just linked" \
  || bad "davebox/scripts/build_sound.sh does not check its artifact"

# ---- the two defects this found must not come back --------------------------
# Both were shipped for months. LONG_PRESS_ACTIVE was a macro deleted in
# 40d223b4 while a call to it survived; tts_save_config was a copy-paste slip
# for flite_save_config that would have crashed on a TTS speed change.
# ⚠ CODE LINES ONLY. Both fixes carry comments that QUOTE the old call, so a
# bare grep matches its own explanation and fails on a healthy tree — a check
# that cries wolf, which is worse than none. Comment lines are stripped first.
code_only() { grep -vE '^[[:space:]]*(\*|/\*|//)' "$1"; }
code_only src/schwung_shim.c | grep -q 'LONG_PRESS_ACTIVE()' \
  && bad "a call to LONG_PRESS_ACTIVE() is back — the macro does not exist" \
  || ok "no call to the deleted LONG_PRESS_ACTIVE macro"
code_only src/host/tts_engine_flite.c | grep -q 'tts_save_config' \
  && bad "tts_save_config() is back in the flite engine — it does not exist; flite_save_config does" \
  || ok "the flite engine saves through flite_save_config"

[ "$fail" = 0 ] && echo "PASS: the build reads its own artifact, and the reader can fail" \
                || echo "FAIL: artifact symbol gate"
exit "$fail"
