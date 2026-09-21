#!/usr/bin/env bash
# Every place the tree turns a Move set uuid into a filesystem path.
#
# WHY THIS EXISTS. The project store is being re-rooted: a project stops being
# `Sets/<uuid>/` (a directory Move owns) and becomes a directory of ours that
# Move is shown a window into. That migration is only safe if the set of places
# building a path from a set uuid is KNOWN AND COMPLETE. It is not a list
# anybody can hold in their head:
#
#   - a hand-written list missed `perSetStateDir` (shadow_ui.js), which is the
#     host-side writer that actually stores slot/FX/chain state — i.e. the one
#     the whole question was about;
#   - an adversarial review of that list missed two more, found only by deriving
#     the set mechanically: song-mode's `directPath` and scanSetsForPicker's
#     per-uuid readdir.
#
# So the inventory is DERIVED, never written down, and this test fails when it
# changes. A new site is not a bug — failing to NOTICE one is.
#
# ⚠ The comment filter is LANGUAGE-AWARE on purpose. '#' begins a comment in
# sh but a PREPROCESSOR DIRECTIVE in C, and the first cut of this extractor
# silently ate every `#define SETS_DIR ...` — four declarations, including the
# DSP's and the setuid helper's. Under-collection here reads exactly like
# "the surface is small", which is the failure this test exists to prevent.
#
# Shell scripts are pinned at FILE level only (below), not line level: they
# carry `SETS_DIR` as an ordinary parameterised variable and line-pinning them
# would fail on every unrelated edit — a check that cries wolf.
#
# PROVEN TO FIRE, 2026-09-21 — each provocation was confirmed to PRODUCE its
# condition before the result was believed:
#   · a new builder added to an existing source file  -> assertion 1 FAILs, diff named
#   · a builder silently losing its B tag (8 -> 7)    -> assertion 3 FAILs
#   · a new shell script reaching the set library     -> assertion 2 FAILs
# ⚠ One provocation initially "passed" because `sed -i '0,/re/'` is a GNU-ism
# that BSD/macOS sed ignores — the condition never existed. Verify the
# provocation landed before trusting a negative.
#
# ⚠ KNOWN BLIND SPOT: `git grep` reads TRACKED content, so a brand-new
# UNTRACKED file is invisible to a manual run. `git add` closes it, and
# pre-commit only ever sees staged content — so the gate is sound where it
# gates. A manual run on an unstaged new file is not.
#
# TO UPDATE after a deliberate change:  bash tests/host/test_set_path_sites.sh --write
set -uo pipefail
cd "$(dirname "$0")/../.."

INVENTORY=tests/host/set_path_sites.txt
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

echo "test_set_path_sites"

SYMS='UserLibrary/Sets|SEQ8_SET_STATE_ROOT|SEQ8_SETS_DIR|SAMPLER_SETS_DIR|SETS_LIBRARY_DIR|EXPORT_SETS_BASE_DIR|SET_LIBRARY_DIR|SETS_DIR'

extract() {
    git grep -n -E "$SYMS" -- \
        ':!*.md' ':!davebox/tests' ':!tests' ':!tools' ':!work' ':!docs' \
    | while IFS= read -r line; do
        f=${line%%:*}; rest=${line#*:}; text=${rest#*:}
        t=$(printf '%s' "$text" | sed -E 's/^[[:space:]]+//')
        case "$t" in
            '*'*|'//'*|'/*'*) continue ;;                 # C / JS comment
        esac
        case "$f" in
            *.sh) continue ;;                             # file-level only
        esac
        printf '%s|%s\n' "$f" "$t"
    done | sort -u
}

# The inventory is `<tag> <file>|<line>`. DERIVATION is mechanical (extract);
# CLASSIFICATION is human — `B` marks a line that turns a uuid into a path, and
# no regex decides that, because the two the regex missed
# (`S.currentSetUuid`, an inline `Sets/" + uuid`) are exactly the ones a future
# regex would miss too. --write re-derives the lines and CARRIES THE TAGS OVER
# by content, so a re-derivation never silently downgrades a builder to noise.
if [ "${1:-}" = "--write" ]; then
    tmp=$(mktemp)
    extract > "$tmp"
    : > "$INVENTORY.new"
    while IFS= read -r l; do
        tag='-'
        if [ -f "$INVENTORY" ]; then
            old=$(grep -F -- " $l" "$INVENTORY" 2>/dev/null | sed -n 1p)
            case "$old" in B\ *) tag='B' ;; esac
        fi
        printf '%s %s\n' "$tag" "$l" >> "$INVENTORY.new"
    done < "$tmp"
    mv "$INVENTORY.new" "$INVENTORY"
    rm -f "$tmp"
    echo "  wrote $INVENTORY ($(wc -l < "$INVENTORY" | tr -d ' ') lines, \
$(grep -c '^B ' "$INVENTORY" | tr -d ' ') tagged as builders)"
    exit 0
fi

# ---- 1. the derived inventory still matches what is pinned -----------------
if [ ! -f "$INVENTORY" ]; then
    bad "$INVENTORY is missing — run with --write to create it"
else
    got=$(extract)
    n=$(printf '%s\n' "$got" | grep -c . )
    if [ "$n" -eq 0 ]; then
        # Zero collected is not green: an over-narrowed grep or a moved file
        # would otherwise report a clean run.
        bad "extractor collected ZERO lines — the pattern or paths are wrong"
    elif diff -u <(sed -E 's/^[B-] //' "$INVENTORY") <(printf '%s\n' "$got") > /tmp/spp.$$ 2>&1; then
        ok "$n set-path sites, all pinned"
    else
        bad "the set-path surface CHANGED — review every line, then --write"
        sed 's/^/    /' /tmp/spp.$$ >&2
    fi
    rm -f /tmp/spp.$$
fi

# ---- 2. shell scripts that reach the set library, pinned at file level -----
want_sh="standalone/scripts/project-cmd.sh
standalone/scripts/select-hook.sh
standalone/scripts/select-list.sh
standalone/scripts/set-swap.sh"
got_sh=$(git grep -l -E "$SYMS" -- 'standalone/scripts/*.sh' 'scripts/*.sh' | sort)
if [ "$got_sh" = "$want_sh" ]; then
    ok "4 shell scripts reach the set library, all known"
else
    bad "the set of SHELL scripts touching the set library changed"
    diff -u <(printf '%s\n' "$want_sh") <(printf '%s\n' "$got_sh") | sed 's/^/    /' >&2
fi

# ---- 3. the per-project BUILDERS specifically ------------------------------
# These turn a uuid into a path. Each must be routed through the resolver seam
# when the store is re-rooted; each is a silent wrong-project write if missed.
builders=$(grep -c '^B ' "$INVENTORY" 2>/dev/null | tr -d ' ')
if [ "${builders:-0}" -eq 8 ]; then
    ok "8 per-project path builders (uuid -> path), each tagged B"
else
    bad "per-project builder count is ${builders:-0}, pinned at 8 — one was added, removed, or lost its B tag"
    grep '^B ' "$INVENTORY" 2>/dev/null | sed 's/^/    /' >&2
fi

exit $fails
