#!/bin/sh
# tests/host/test_splash_assets.sh — the boot splash payload is what it claims.
#
# A dAVEBOx session shows two screens before the module is up, and since
# 2026-08-24 they say different things (Josh):
#   1. artwork, painted instantly into the stock display, ROTATING per launch
#   2. text — the wordmark over "Schwung base: <version>"
#
# Screen 2 is pre-rendered at build time (standalone/scripts/make-splashes.mjs)
# because the fonts it needs live in the module and the host half has only its
# single 6px print. Pre-rendered means it can go STALE — bump version.txt and
# the committed bitmap still says the old number, silently, forever. That is the
# failure this file exists for.
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

A=standalone/assets

# --- 1. the payload is present and well-formed -----------------------------
n=$(ls $A/splash-*.hex 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -ge 2 ] && ok "$n artwork frames committed (rotation has something to pick from)" \
               || bad "only $n artwork frame(s) — nothing to rotate through"
[ -f "$A/splash2.hex" ] && ok "the text screen is committed" \
                        || bad "no splash2.hex — the host falls back to artwork + caption"
# 2048 hex chars = 128x64 1bpp. A short file renders as garbage, not an error.
for f in $A/splash-*.hex $A/splash2.hex $A/splash.hex; do
    [ -f "$f" ] || continue
    len=$(tr -d '[:space:]' < "$f" | wc -c | tr -d ' ')
    [ "$len" = "2048" ] || bad "$(basename "$f") is $len hex chars, expected 2048"
done
ok "every splash payload is exactly 128x64 1bpp"

# --- 2. frame 0 and splash.hex agree ---------------------------------------
# splash.hex is kept for a launcher too old to know the numbered set; if it
# drifted from frame 0 the two screens would disagree about the same artwork.
if [ -f "$A/splash.hex" ] && [ -f "$A/splash-0.hex" ]; then
    [ "$(tr -d '[:space:]' < "$A/splash.hex")" = "$(tr -d '[:space:]' < "$A/splash-0.hex")" ] \
        && ok "splash.hex still matches frame 0" \
        || bad "splash.hex has drifted from splash-0.hex"
fi

# --- 3. THE ONE THAT MATTERS: the text screen is not stale -----------------
# Re-render and compare. Needs node (the generator imports the module's fonts);
# skips honestly without it rather than passing vacuously — CI's runner has it.
if command -v node >/dev/null 2>&1; then
    T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
    if node standalone/scripts/make-splashes.mjs "$T" >/dev/null 2>&1; then
        if [ "$(tr -d '[:space:]' < "$T/splash2.hex")" = "$(tr -d '[:space:]' < "$A/splash2.hex")" ]; then
            ok "the text screen matches version.txt ($(cat src/host/version.txt))"
        else
            bad "splash2.hex is STALE — run: node standalone/scripts/make-splashes.mjs standalone/assets"
        fi
        i=0; drift=0
        for f in "$T"/splash-*.hex; do
            b=$(basename "$f")
            [ "$(tr -d '[:space:]' < "$f")" = "$(tr -d '[:space:]' < "$A/$b")" ] || drift=1
            i=$((i+1))
        done
        [ "$drift" = "0" ] && ok "all $i artwork frames match ui_splash.mjs" \
                           || bad "committed artwork has drifted from ui_splash.mjs"
    else
        bad "the splash generator failed to run"
    fi
else
    printf '  skip — staleness check needs node\n'
fi

# --- 4. build.sh actually ships them ---------------------------------------
# ⭑ Generating the right bytes into a directory nobody deploys is the quiet way
# for this whole feature to do nothing.
grep -q 'splash-\*\.hex' scripts/build.sh \
    && ok "build.sh ships the artwork frames" \
    || bad "build.sh does not copy splash-*.hex — rotation never reaches the device"
grep -q 'splash2\.hex' scripts/build.sh \
    && ok "build.sh ships the text screen" \
    || bad "build.sh does not copy splash2.hex"
# The rotation moved into pick-splash.py (the Dave Box dealer, 2026-08-31):
# quiesce must call it, and the dealer itself must do the weighted pool pick
# and record the deal. Pinning both ends — quiesce calling a dealer that no
# longer rotates would pass a quiesce-only grep.
grep -q 'pick-splash\.py' standalone/scripts/quiesce-stock.sh \
    && ok "the instant splash is dealt by pick-splash.py" \
    || bad "quiesce-stock no longer calls the dealer — no rotation"
grep -q 'splash-pool\.tsv' standalone/scripts/pick-splash.py \
    && grep -q 'daves-seen\.txt\|SEEN' standalone/scripts/pick-splash.py \
    && ok "...and the dealer reads the weighted pool and records the deal" \
    || bad "pick-splash.py lost the pool read or the collection record"
grep -q 'pick-splash\.py' scripts/build.sh \
    && ok "...and build.sh ships the dealer" \
    || bad "pick-splash.py never reaches the device — quiesce would fall back forever"
grep -q 'splash-pool\.tsv' scripts/build.sh \
    && ok "...and build.sh ships the pool manifest" \
    || bad "splash-pool.tsv never reaches the device — both dealers fall back, nothing records"
# The pool manifest: one row per frame, weights sane, DAVE DAVIES rarest.
pool=standalone/assets/splash-pool.tsv
frames=$(ls standalone/assets/splash-[0-9]*.hex | wc -l | tr -d ' ')
rows=$(wc -l < "$pool" | tr -d ' ')
[ "$rows" = "$frames" ] \
    && ok "splash-pool.tsv covers all $frames frames" \
    || bad "splash-pool.tsv has $rows rows for $frames frames"
# Tier law: weights are exactly the three tier values; DAVE DAVIES holds rare.
awk -F'\t' '{ if ($3!=1 && $3!=0.5 && $3!=0.3) exit 1 }' "$pool" \
    && ok "every weight is a known tier (1 / 0.5 / 0.3)" \
    || bad "a weight outside the tier set leaked into splash-pool.tsv"
awk -F'\t' '$4=="DAVE DAVIES"{d=$3} END{exit !(d==0.3)}' "$pool" \
    && ok "DAVE DAVIES holds the rare tier" \
    || bad "DAVE DAVIES is not at the rare weight in splash-pool.tsv"
# The host-side dealer (pre-kill branch) reads the same pool — the old
# for-i<10 literal capped a 31-frame pool at ten and must not return.
grep -q 'splash-pool\.tsv' src/shadow/shadow_ui.js \
    && ok "ensureCustomSplash reads the pool manifest" \
    || bad "shadow_ui.js no longer reads splash-pool.tsv"
grep -q 'i < 10; i++' src/shadow/shadow_ui.js \
    && bad "the 10-frame scan cap is back in shadow_ui.js" \
    || ok "...and the 10-frame scan cap is gone"
# ⚠⚠ ONE frame per LAUNCH, not one per CALL. paint_splash runs TWICE on every
# route (directly, then again inside freeze_move to re-assert after the save).
# The first version picked inside the python each time, so the second paint
# showed a DIFFERENT face and the user watched it change mid-launch — Josh saw
# it immediately. The pick has to be cached across the two calls.
grep -q 'SPLASH_PICK' standalone/scripts/quiesce-stock.sh \
    && ok "the frame is chosen once per launch and reused" \
    || bad "no cached pick — the second paint would roll a different splash"
# The PAINTING step must be deterministic given the cached pick: it reads
# SPLASH_PICK and never chooses. If the roll lives in the paint heredoc, the
# cache is decoration and the second call changes the face again.
awk "/python3 - <<'PY'/,/^PY\$/" standalone/scripts/quiesce-stock.sh \
    | grep -q 'random' \
    && bad "the PAINT step still rolls its own frame — the cache is decoration" \
    || ok "...and the paint step only reads the cached pick, never re-rolls"

# --- 5. no third screen between the splash and the app ---------------------
# Josh, 2026-08-24: "is there any way to skip the Loading.... after the schwung
# base screen?" A bare "Loading..." carried no more information than the splash
# it replaced, for the sake of ~500 ms of LED clearing. The overtake init now
# HOLDS the splash instead — the work is unchanged, only the picture is.
# ⚠ The richer label ("Loading <project>", set by the select gate) DOES carry
# information and must still win; that is the second grep.
ov=$(sed -n '/else if (overtakeInitPending)/,/const ledsCleared = clearLedBatch/p' src/shadow/shadow_ui.js)
printf '%s' "$ov" | grep -q 'drawCustomSplash()' \
    && ok "overtake init holds the splash instead of a bare Loading..." \
    || bad "the Loading... screen is back between the splash and the app"
printf '%s' "$ov" | grep -q 'overtakeLoadingLabel === "Loading\.\.\."' \
    && ok "...only for the DEFAULT label — a named project still shows its name" \
    || bad "the splash would hide 'Loading <project>', which is real information"
printf '%s' "$ov" | grep -q 'overtakeLoadingLabel, 21' \
    && ok "...and the label path still exists for that case" \
    || bad "the labelled loading screen was removed entirely"

[ "$fail" = "0" ] && printf 'PASS: splash payload is complete and current\n'
exit $fail
