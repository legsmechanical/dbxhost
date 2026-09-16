#!/usr/bin/env bash
# Claims this repo makes about itself, asserted instead of written down.
#
# WHY THIS EXISTS. Facts embedded in prose cannot notice they have rotted. An
# audit on 2026-09-16 found, in CLAUDE.md and the workflows: a test count ~3x
# low, a worktree count stale, a "verified on <date>: ZERO of these" invariant
# that had been violated 26 days later, and a release workflow pinning a Go
# older than go.mod requires while CI's comment said that breaks the build.
# Every one of those is checkable. None was checked.
#
# So: a number worth stating is worth asserting. Prefer deleting a count from
# the prose and pinning it here over writing it down twice.
set -uo pipefail
cd "$(dirname "$0")/../.."

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

echo "test_repo_claims"

# ---- 1. the Go pin agrees with go.mod everywhere ---------------------------
# go.mod's directive is the authority. setup-go pins below it, and the golang
# image used by scripts/build.sh and the pre-commit hook, must not fall behind.
want="$(awk '/^go [0-9]/{print $2; exit}' schwung-manager/go.mod)"
if [ -z "$want" ]; then
    bad "go.mod declares no go directive"
else
    ok "go.mod declares go $want"
    pin_bad=0
    while IFS= read -r line; do
        f="${line%%:*}"; v="$(printf '%s' "$line" | grep -oE "[0-9]+\.[0-9]+" | tail -1)"
        [ -n "$v" ] || continue
        # numeric compare on major.minor
        if [ "$(printf '%s\n%s\n' "$want" "$v" | sort -V | head -1)" != "$want" ]; then
            echo "    $f pins Go $v, below go.mod's $want" >&2; pin_bad=1
        fi
    done <<EOF
$(grep -rn "go-version:" .github/workflows/ 2>/dev/null; grep -rn "golang:[0-9]" scripts/ 2>/dev/null)
EOF
    [ "$pin_bad" = 0 ] && ok "every Go pin (workflows + scripts) is >= go.mod's $want" \
                       || bad "a Go pin is below go.mod's $want"
fi

# ---- 2. every doc the index names actually exists ---------------------------
miss=0
for d in $(grep -oE '`docs/[A-Za-z0-9_.-]+\.md`' CLAUDE.md | tr -d '`' | sort -u); do
    [ -f "$d" ] || { echo "    CLAUDE.md names a missing doc: $d" >&2; miss=1; }
done
[ "$miss" = 0 ] && ok "every docs/ file named in CLAUDE.md exists" \
                || bad "CLAUDE.md names a doc that does not exist"

# ---- 3. capability gates in davebox/ui do not GROW --------------------------
# CLAUDE.md's rule is "no capability probing - if the code is in the tree, the
# feature exists", recorded as "Verified 2026-08-14: ZERO in davebox/ui/". Two
# appeared on 2026-09-09 and nothing noticed for a week. Removing them is a
# behaviour change that needs its own decision, so this is a RATCHET, not a
# wall: the count may fall to 0, never rise. A third gate fails here.
GATE_MAX=2
n="$(grep -rho "typeof \(host_\|shadow_\|engine\)" davebox/ui/ 2>/dev/null | wc -l | tr -d ' ')"
if [ "$n" -le "$GATE_MAX" ]; then
    if [ "$n" -lt "$GATE_MAX" ]; then
        ok "capability gates in davebox/ui/: $n (below the $GATE_MAX ratchet - lower GATE_MAX)"
    else
        ok "capability gates in davebox/ui/: $n, not growing (ratchet $GATE_MAX)"
    fi
else
    echo "    a NEW capability gate was added. If the code is in the tree, the" >&2
    echo "    feature exists - call the binding directly instead of probing it." >&2
    grep -rn "typeof \(host_\|shadow_\|engine\)" davebox/ui/ >&2
    bad "capability gates in davebox/ui/ grew to $n (ratchet $GATE_MAX)"
fi

# ---- 4. the parity harness stays wired to the same env CI uses -------------
[ -f scripts/test-linux.sh ] && [ -f tests/Dockerfile.linux ] \
    && ok "the Linux parity harness is present" \
    || bad "scripts/test-linux.sh / tests/Dockerfile.linux is missing"
grep -q "ripgrep" tests/Dockerfile.linux && grep -q "nodejs" tests/Dockerfile.linux \
    && ok "the parity image carries what the host job needs (ripgrep, node)" \
    || bad "the parity image no longer matches the host-tests job"

[ "$fails" = 0 ] && echo "PASS: repo_claims" || { echo "FAIL: repo_claims" >&2; exit 1; }
