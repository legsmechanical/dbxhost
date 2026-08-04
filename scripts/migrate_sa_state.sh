#!/usr/bin/env bash
# Rename SA state files from the old `seq8sm` prefix to `seq8sa` on a device.
#
# `seq8sm` meant "sound-mode TEST build". SA is now the successor rather than a
# scratch build, so its state namespace got a deliberate name (2026-08-03). This
# moves any sessions already saved under the old prefix so they are not orphaned.
#
# ⚠ This does NOT touch legacy `seq8-*` files, and must never be made to. SA and
# legacy sessions are deliberately incompatible: legacy exists so old sessions stay
# openable, not so they migrate. A `seq8-` file matched by this script would mean
# the pattern is wrong.
#
# ⚠ The prefix keys five things, and one of them uses an UNDERSCORE
# (`<prefix>_name_index.json`) while the rest use a hyphen. A rename that only
# handles `<prefix>-*` silently leaves the name index behind, which is what drives
# set-duplicate inheritance — so a set would lose its family lineage while
# everything else looked fine.
#
# Idempotent: re-running finds nothing to do. Run with --dry-run first.
set -euo pipefail

MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
OLD="${OLD_PREFIX:-seq8sm}"
NEW="${NEW_PREFIX:-seq8sa}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

case "$NEW" in
    seq8|seq8-*) echo "refusing: NEW_PREFIX '$NEW' would collide with legacy state" >&2; exit 1 ;;
esac
[ "$OLD" = "$NEW" ] && { echo "OLD and NEW prefix are identical — nothing to do"; exit 0; }

echo "Migrating SA state on $MOVE_USER@$MOVE_HOST: $OLD -> $NEW  (dry-run=$DRY)"

ssh "$MOVE_USER@$MOVE_HOST" "OLD='$OLD' NEW='$NEW' DRY='$DRY' sh -s" <<'REMOTE'
set -eu
ROOT=/data/UserData/schwung
n=0
# Everything the prefix keys: per-set state/ui-state and snapshots (hyphen), the
# no-set fallback, the log, and the name index (underscore).
# ⚠ -prune the dot-dirs first. A backup tarball named after the old prefix and
# parked under this tree (which is the obvious place to park it) matches
# "${OLD}-*" and gets renamed along with the real state — so the safety copy ends
# up carrying the NEW prefix and reads as live data. Observed on the first run.
for f in $(find "$ROOT" -name '.*' -prune -o \
                \( -name "${OLD}-*" -o -name "${OLD}.log*" -o -name "${OLD}_*" \) -print \
                2>/dev/null | sort); do
    base=$(basename "$f"); dir=$(dirname "$f")
    # Replace only the leading prefix, so a name containing the prefix later is safe.
    newbase=$(printf '%s' "$base" | sed "s|^${OLD}|${NEW}|")
    [ "$base" = "$newbase" ] && continue
    if [ -e "$dir/$newbase" ]; then
        echo "  SKIP  $f  (destination already exists)"
        continue
    fi
    if [ "$DRY" = "1" ]; then
        echo "  would move  ${f#$ROOT/}  ->  $newbase"
    else
        mv "$f" "$dir/$newbase"
        echo "  moved  ${f#$ROOT/}  ->  $newbase"
    fi
    n=$((n+1))
done
echo "  $n file(s)"
# Guard: legacy state must be untouched by construction, but say so out loud.
echo "  legacy seq8-* files left alone: $(find "$ROOT" -name 'seq8-*' 2>/dev/null | wc -l | tr -d ' ')"
REMOTE

echo "Done."
