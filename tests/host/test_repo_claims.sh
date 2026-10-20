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
        if [ "$(printf '%s\n%s\n' "$want" "$v" | sort -V | sed -n 1p)" != "$want" ]; then
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

# ---- 4. no `| head` inside a pipefail script (SIGPIPE flake) ---------------
# `set -o pipefail` + `grep ... | head -N` is a RACE: head exits after N lines
# and closes the pipe, grep gets SIGPIPE and returns 141, pipefail propagates it
# and set -e kills the script - with NO message, so it reads as an unexplained
# flake. Measured 2026-09-16: test_launch_project_workspace.sh failed 1 run in
# 60 under CPU load, exit 141. It passed 25/25 unloaded, which is why it looked
# like "flaky, suspect temp dirs" for a week. 95 sites across 37 files were
# exposed. `sed -n 1p` reads to EOF, so nothing closes the pipe early.
# ⚠ Scanned with awk, not `grep -v ... | grep -q ...`: grep -q exits on its first
# match and would SIGPIPE its own upstream - the very bug being checked for.
# awk reads to EOF. Comment lines are skipped so this file may DESCRIBE the bug.
hp=0
for t in tests/*/*.sh davebox/tests/*.sh; do
    [ -f "$t" ] || continue
    grep -q 'pipefail' "$t" || continue
    hits=$(awk '!/^[[:space:]]*#/ && /\|[[:space:]]*head /' "$t")
    if [ -n "$hits" ]; then
        echo "    $t pipes into head under pipefail - use 'sed -n 1p'" >&2
        hp=1
    fi
done
[ "$hp" = 0 ] && ok "no '| head' inside a pipefail script (SIGPIPE flake)" \
               || bad "a pipefail script pipes into head - that is a 1-in-N silent flake"

# ---- 5. the parity harness stays wired to the same env CI uses -------------
[ -f scripts/test-linux.sh ] && [ -f tests/Dockerfile.linux ] \
    && ok "the Linux parity harness is present" \
    || bad "scripts/test-linux.sh / tests/Dockerfile.linux is missing"
grep -q "ripgrep" tests/Dockerfile.linux && grep -q "nodejs" tests/Dockerfile.linux \
    && ok "the parity image carries what the host job needs (ripgrep, node)" \
    || bad "the parity image no longer matches the host-tests job"

# ---- 6. every repo script CLAUDE.md tells you to run exists ----------------
# CLAUDE.md named scripts/restart_move.sh for months — a script this repo never
# had — as the way to restart after a deploy (found 2026-10-14).
miss=0; seen=0
# Repo-relative paths only (a device path like /data/.../scripts/x.sh is not
# one), and not on a line that records the script's removal.
for f in $(grep -v 'removed' CLAUDE.md | perl -ne 'print "$1\n" while m{(?<![\w/.])(?:\./)?((?:scripts|standalone/scripts|davebox/scripts|tools)/[\w./-]+\.(?:sh|py|mjs))}g' | sort -u); do
    seen=$((seen+1))
    [ -e "$f" ] || { bad "CLAUDE.md names $f, which does not exist"; miss=1; }
done
[ "$seen" -gt 0 ] || bad "found no script paths in CLAUDE.md (the pattern broke)"
[ "$miss" = 0 ] && [ "$seen" -gt 0 ] && ok "every repo script CLAUDE.md names exists ($seen)"

# ---- 7. the pre-rename install folder is spelled only by the migration ----
# dAVEBOx SA's folder on the device was renamed (pre-rename: dbx-host). A path
# that kept the OLD name is not an error anywhere: it writes into a folder the
# launcher has just moved away, and quietly makes it again as a second, partial
# tree. So the old name may appear only on a line that NAMES it as the legacy
# — the migration sites (DBX_DIR_LEGACY / DBX_DIR_OLD), the MIDI browser's
# hidden list, or a comment saying "pre-rename"/"legacy". Docs and HTML are
# history and are not scanned.
LEGACY_OK='DBX_DIR_LEGACY|DBX_DIR_OLD|HIDDEN_TOP|pre-rename|legacy'
legacy_all="$(git grep -nI 'dbx-host' -- ':!*.md' ':!*.html' ':!work' 2>/dev/null)"
# Positive control: the legacy constant itself must be found, or git grep saw
# nothing (no git, or a worktree whose git dir is not mounted) and an empty
# result would read as clean.
if ! printf '%s\n' "$legacy_all" | grep -q '^standalone/config.sh:[0-9]*:DBX_DIR_LEGACY='; then
    bad "the legacy-name sweep cannot see standalone/config.sh's DBX_DIR_LEGACY (git grep found nothing?)"
else
    stray="$(printf '%s\n' "$legacy_all" | grep -viE "$LEGACY_OK" || true)"
    if [ -n "$stray" ]; then
        printf '%s\n' "$stray" | sed 's/^/    /' >&2
        bad "the pre-rename folder name (dbx-host) is spelled outside the migration sites (above)"
    else
        ok "the pre-rename folder name appears only where it is named as the legacy ($(printf '%s\n' "$legacy_all" | grep -c .) lines)"
    fi
fi

[ "$fails" = 0 ] && echo "PASS: repo_claims" || { echo "FAIL: repo_claims" >&2; exit 1; }
