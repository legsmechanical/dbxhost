#!/usr/bin/env bash
# Build and deploy the dAVEBOx host — the other half of the dev loop.
#
# This does the HOST half only. For the whole deliverable in one command, use
# `install-sa.sh`, which runs this and then `davebox/scripts/install_sound.sh`
# with the restart semantics reconciled — prefer that unless you are iterating
# on the host alone.
#
# Before this script existed, a host change meant hand-assembling the deploy:
# scp the binaries, work around ETXTBSY on the mapped ones, remember to prime
# the shim, remember the launcher. That is a tax on every iteration and it fails
# quietly — a partial copy leaves a truncated .so that only breaks at the next
# launch.
#
# ⚠ This is a DEVELOPER UPDATE script, not a first-time installer. It refuses if
# $DBX_DIR does not already look like an install, because a fresh install needs the
# one-time privileged step (bless.sh, as root) which cannot be done from here. The
# eventual user-facing install is a separate problem.
#
# Usage:
#   ./standalone/scripts/install-host.sh                 build + deploy everything
#   ./standalone/scripts/install-host.sh --no-build      deploy what is in build/
#   ./standalone/scripts/install-host.sh --no-module     skip the launcher module
#   ./standalone/scripts/install-host.sh --force         deploy over a LIVE session
#   MOVE_HOST=172.16.254.1 ./standalone/scripts/install-host.sh    (tether)

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
. "$HERE/config.sh"

MOVE_HOST="${MOVE_HOST:-move.local}"
MOVE_USER="${MOVE_USER:-ableton}"
DO_BUILD=1; DO_MODULE=1; FORCE=0

while [ $# -gt 0 ]; do
    case "$1" in
        --no-build)  DO_BUILD=0; shift ;;
        --no-module) DO_MODULE=0; shift ;;
        --force)     FORCE=1; shift ;;
        -h|--help)   sed -n '2,25p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 1 ;;
    esac
done

SSH="ssh -o ConnectTimeout=10 ${MOVE_USER}@${MOVE_HOST}"
say() { printf '%s\n' "$*"; }

"$HERE/scripts/check-config.sh"
say ""
say "=== dAVEBOx host deploy -> ${MOVE_USER}@${MOVE_HOST}:${DBX_DIR} ==="

# --- preflight -------------------------------------------------------------
$SSH true 2>/dev/null || { echo "cannot reach ${MOVE_HOST}" >&2; exit 1; }

$SSH "test -x '$DBX_DIR/schwung' && test -d '$DBX_DIR/shadow'" 2>/dev/null || {
    echo "ERROR: $DBX_DIR does not look like an existing install." >&2
    echo "       This script updates an install; it cannot create one — a first" >&2
    echo "       install needs the one-time root step ($DBX_DIR/bless.sh)." >&2
    exit 1
}

# ⚠ Never swap a running host's binaries by default. The live process keeps its old
# inode (so it survives), but the on-disk tree ends up half-new while the session
# continues on the old code — and the next launch runs a combination nobody built.
# Liveness, not a marker (P4b): the launcher holds a flock on the /dev/shm lock
# file with the supervisor PID as payload; a session is live iff that PID is
# alive. A reboot or crash clears/releases it by construction, so a deploy can
# never be blocked by a session that already ended. Unreadable/garbled payload
# counts as live (permissive, matching the host's own reader).
if $SSH "p=\$(cat /dev/shm/.dbxhost-session.lock 2>/dev/null) || exit 1; \
         case \"\$p\" in (*[!0-9]*|'') exit 0;; esac; \
         [ -d \"/proc/\$p\" ]" 2>/dev/null; then
    if [ "$FORCE" != "1" ]; then
        echo "" >&2
        echo "REFUSING: a standalone session is running right now." >&2
        echo "  Leave it first (Shift+Back, or Quit in the Settings menu), then re-run." >&2
        echo "  --force deploys anyway; the running session keeps the old code and the" >&2
        echo "  new code takes effect at the next launch." >&2
        exit 1
    fi
    say "WARNING: --force with a live session; new code applies at next launch."
fi

# ⚠ heal must already be setuid-root, or the shim cannot be mirrored into /usr/lib
# and the launcher will correctly refuse to start.
if ! $SSH "test -u '$DBX_DIR/bin/$DBX_HEAL_NAME'" 2>/dev/null; then
    echo "ERROR: $DBX_DIR/bin/$DBX_HEAL_NAME is not setuid-root." >&2
    echo "       Run the one-time root step:  ssh root@${MOVE_HOST} 'sh $DBX_DIR/bless.sh'" >&2
    exit 1
fi

# --- build -----------------------------------------------------------------
if [ "$DO_BUILD" = "1" ]; then
    say ""; say "--- building host"
    "$HERE/scripts/build-host.sh"
    say ""; say "--- building $DBX_HEAL_NAME"
    "$HERE/scripts/build-heal.sh"
fi

# ⚠ build.sh exits 0 even when a sub-build fails (observed: the Go step died on a
# full Docker disk and the script still reported success with no artifacts). Check
# for the artifacts themselves, never the exit status.
for a in build/schwung build/schwung-shim.so build/shadow/shadow_ui build/schwung-manager build/display-server; do
    [ -f "$REPO_ROOT/$a" ] || { echo "ERROR: missing $a — build did not produce it" >&2; exit 1; }
done
[ -f "$HERE/build/$DBX_HEAL_NAME" ] || {
    echo "ERROR: missing standalone/build/$DBX_HEAL_NAME — run without --no-build" >&2; exit 1; }

# ⚠ Existence is not enough: the payload must be built for THIS host's shared
# memory namespace. SCHWUNG_CFLAGS bakes the prefix into every binary, and a
# binary carrying the stock prefix looks entirely healthy — right size, right
# symbols, deploys without complaint — then cannot find its shared memory at
# runtime and exits before writing a single log line. The symptom is a dead UI
# with no error anywhere, which is about the most expensive way to learn this.
#
# build.sh now wipes build/ when the flags change, so this should never fire.
# It stays because it is the check that actually looks at what is about to be
# SHIPPED, and it costs one `strings` call. Verify the artifact, not the recipe.
say ""; say "--- verifying the payload targets $DBX_SHM_PREFIX"
# schwung-manager is Go: the prefix arrives as an -ldflags -X stamp, but -s -w
# strips symbols only, not string data, so `strings` still sees it.
for a in build/schwung build/schwung-shim.so build/shadow/shadow_ui build/schwung-manager build/display-server; do
    bin="$REPO_ROOT/$a"
    # SUBSTRING, not whole-line: only shadow_ui keeps the bare prefix as its own
    # string. The others embed it already concatenated with the segment name
    # ("/dbxhost-control"), because the compiler folds the macro at compile time.
    # An exact-line match therefore rejected two correctly-built binaries.
    #
    # The positive test alone is sufficient: a stock-built binary contains no
    # "dbxhost" string at all. A negative test for "/schwung-" would be wrong —
    # the shim legitimately names stock paths (/schwung-link-in is the shared
    # Link Audio sidecar, /usr/lib/schwung-shim.so is the stock shim).
    # ⚠ Count into a variable rather than `| grep -q`. This script runs under
    # `set -euo pipefail`, and grep -q exits at the FIRST match, closing the
    # pipe — `strings` then dies of SIGPIPE and pipefail turns that into a
    # failed pipeline. The guard therefore rejected correctly-built binaries,
    # and did so most reliably when the match came early with lots of output
    # still to write. grep -c consumes the whole stream, so nothing is killed;
    # `|| true` absorbs grep's exit 1 on zero matches, which -e would abort on.
    hits="$(strings "$bin" 2>/dev/null | grep -cF -- "$DBX_SHM_PREFIX" || true)"
    if [ "${hits:-0}" -eq 0 ]; then
        echo "" >&2
        echo "ERROR: $a was NOT built for this host." >&2
        echo "       Expected the SHM prefix '$DBX_SHM_PREFIX' to be compiled in; it is absent." >&2
        found="$(strings "$bin" 2>/dev/null | grep -E '^/[a-z]+-$' | sort -u | tr '\n' ' ')"
        [ -n "$found" ] && echo "       Found instead: $found" >&2
        echo "" >&2
        echo "       This happens when build/ still holds objects from a different" >&2
        echo "       flavour (e.g. a plain ./scripts/build.sh run in between)." >&2
        echo "       Fix:  rm -rf build && standalone/scripts/install-host.sh" >&2
        exit 1
    fi
done
say "      ok — all five binaries carry $DBX_SHM_PREFIX"

# --- Link Audio sidecar present? -------------------------------------------
# The shim resolves the subscriber at SCHWUNG_INSTALL_DIR/link-subscriber, i.e.
# $DBX_DIR/link-subscriber for this build. It is only compiled when the Link SDK
# submodule is checked out, so an uninitialised libs/link produces a payload that
# looks complete and silently has no Link Audio at all — no routing, no Move FX
# buses, no Move-track processing. That exact chain shipped once: quiet build
# warning -> nothing to copy -> a runtime retry loop that never named the cause.
# Warn rather than fail: a host-only iteration on unrelated code is still valid.
if [ ! -x "$REPO_ROOT/build/link-subscriber" ]; then
    echo "" >&2
    echo "WARNING: build/link-subscriber is missing — Link Audio will NOT work." >&2
    echo "         The Move FX buses and all Move-track processing depend on it." >&2
    echo "         Cause: the Link SDK submodule is not checked out." >&2
    echo "         Fix:   git submodule update --init --recursive libs/link" >&2
    echo "                then re-run this script." >&2
    echo "" >&2
else
    say "      ok — link-subscriber present (Link Audio can start)"
fi

# --- work out what NOT to touch --------------------------------------------
# ⚠ $DBX_DIR shares user content with the stock install through symlinks —
# modules, presets, patches, slot_state, plus two back-compat links. Copying
# build/ over them replaces each symlink with a real directory, which silently
# un-shares the user's work: edits made under one host stop appearing under the
# other, and nothing errors. So skip anything that is CURRENTLY a symlink on the
# device (read live, so this adapts if the shared set changes) and never assume.
say ""; say "--- reading the device's symlinks (shared with stock — never overwritten)"
# Newline-delimited string rather than `mapfile`: that is a bash-4 builtin and
# macOS still ships bash 3.2 at /bin/bash, so a sibling script invoked as
# `/bin/bash install-host.sh` (or with a minimal PATH) would silently get an EMPTY
# list — which here means "no symlinks to protect" and would flatten every shared
# directory. Too dangerous to depend on the interpreter being modern.
LINKS="$($SSH "find '$DBX_DIR' -maxdepth 1 -type l -printf '%f\n'" 2>/dev/null || true)"
if [ -z "$LINKS" ]; then
    echo "ERROR: found no symlinks in $DBX_DIR — expected at least modules/presets/patches." >&2
    echo "       Refusing rather than risk flattening shared directories." >&2
    exit 1
fi
printf '      keep symlink: %s\n' $LINKS

# Exact whole-line match, so a name that merely contains another is not confused
# (e.g. `move-anything-shim.so` vs `move-anything`).
is_link() {
    printf '%s\n' "$LINKS" | grep -qxF -- "$1"
}

# --- deploy ----------------------------------------------------------------
# Atomic per entry: land beside the target then mv -f. A plain scp over a mapped
# binary fails with ETXTBSY (or worse, truncates it), and shadow_ui/schwung are
# exactly the files that may be mapped.
say ""; say "--- deploying payload (rsync, drop-tolerant)"
STAGE="$DBX_DIR/.deploy-stage"
$SSH "mkdir -p '$STAGE'"

# rsync with a retry loop, not scp: the USB tether drops under sustained
# transfer and scp dies with the whole batch (observed twice on 2026-08-16,
# ⚠ the tether may be the ONLY link — the Move does not always have WiFi up).
# rsync resumes: --partial keeps half-sent files across drops, per-file
# temp+rename keeps every staged file whole, and --delete makes the stage an
# exact mirror of build/ so a stale entry from an OLDER build can never ride
# a resumed stage into the swap below. Symlinked names are excluded exactly
# as the old loop skipped them.
RSYNC_EXCLUDES=()
for l in $LINKS; do RSYNC_EXCLUDES+=("--exclude=/$l"); done
tries=0
until rsync -r --partial --delete --timeout=30 "${RSYNC_EXCLUDES[@]}" \
        "$REPO_ROOT/build/" "${MOVE_USER}@${MOVE_HOST}:$STAGE/"; do
    tries=$((tries+1))
    if [ "$tries" -ge 20 ]; then
        echo "ERROR: staging failed after $tries rsync attempts" >&2; exit 1
    fi
    say "      link dropped — resuming (attempt $((tries+1)))"
    sleep 2
done

# ⚠⚠ Directories must be MERGED, not replaced. This originally mv'd each top-level
# entry wholesale, which destroyed `bin/`: the build's bin/ has curl, filebrowser,
# schwung-heal and friends but NOT davebox-heal, because heal is built separately.
# Replacing the directory therefore deleted the setuid-root davebox-heal — and
# restoring THAT needs root, which is the one thing this script cannot do. The
# launcher would have refused to start at the next launch, long after the deploy
# "succeeded". (It also ate the bin/<heal>.new staged just above.)
#
# So: copy file-by-file into existing directories, replacing files atomically and
# leaving anything the build does not ship untouched.
$SSH "set -eu
  cd '$STAGE'
  # Directories first: merge their CONTENTS recursively.
  find . -type d -mindepth 1 | while read -r d; do mkdir -p '$DBX_DIR/'\"\${d#./}\"; done
  find . -type f | while read -r f; do
    rel=\"\${f#./}\"
    dst='$DBX_DIR/'\"\$rel\"
    # Atomic per file: land beside the target, then rename over it. A plain copy
    # onto a mapped binary hits ETXTBSY or truncates it.
    cp -f \"\$f\" \"\$dst.deploying\"
    chmod --reference=\"\$f\" \"\$dst.deploying\" 2>/dev/null || chmod 755 \"\$dst.deploying\"
    mv -f \"\$dst.deploying\" \"\$dst\"
  done
  cd '$DBX_DIR' && rm -rf '$STAGE'
  chmod +x '$DBX_DIR/schwung' '$DBX_DIR/shadow/shadow_ui' 2>/dev/null || true
  chmod +x '$DBX_DIR'/scripts/*.sh '$DBX_DIR/bless.sh' 2>/dev/null || true
"
say "      payload in place"

# --- workspace separation ---------------------------------------------------
# dAVEBOx SA is a SEPARATE WORKSPACE from stock Schwung: host state never
# crosses installs, while installed content (modules/presets/patches) is shared.
# See the DBX_SHARED_LINKS / DBX_PRIVATE_STATE comment in config.sh. This step
# enforces both shapes on every deploy — a name in the private list that is a
# symlink would silently fuse the two hosts' workspaces again (the JS and C
# halves both resolve it into the stock tree), and a shared name that became a
# real directory silently un-shares the user's content.
say ""; say "--- enforcing workspace separation (state private, content shared)"
$SSH "set -eu
  cd '$DBX_DIR'
  STOCK=/data/UserData/schwung
  TS=\$(date +%Y%m%d)
  # Shared content: must be a link into the stock tree.
  for name in $DBX_SHARED_LINKS; do
    target=\"\$STOCK/\$name\"
    if [ -L \"\$name\" ]; then
      [ \"\$(readlink \"\$name\")\" = \"\$target\" ] && { echo \"      ok (shared): \$name\"; continue; }
      rm \"\$name\"
    elif [ -e \"\$name\" ]; then
      mv \"\$name\" \"\$name.unshared-\$TS\"
      echo \"      moved aside: \$name -> \$name.unshared-\$TS (was a real copy)\"
    fi
    ln -s \"\$target\" \"\$name\"
    echo \"      linked (shared): \$name\"
  done
  # Private state: must be REAL. A leftover symlink is removed; if it resolved
  # somewhere, that content is left untouched where it lives — this install
  # starts its own copy rather than adopting the other workspace's state.
  for name in $DBX_PRIVATE_STATE; do
    if [ -L \"\$name\" ]; then
      rm \"\$name\"
      echo \"      un-linked (private): \$name\"
    fi
    case \"\$name\" in
      *.*) : ;;                    # files appear on first write
      *)   mkdir -p \"\$name\" ;;  # dirs must exist for the C side's loaders
    esac
  done
"

# ⚠ Prove the payload did not eat the setuid helper before relying on it. An
# earlier version of this script replaced bin/ wholesale and deleted
# davebox-heal; the failure then surfaced as a confusing "No such file" from the
# line below, AFTER the deploy had reported progress, and recovering needed root.
# Fail here with something actionable instead.
if ! $SSH "test -u '$DBX_DIR/bin/$DBX_HEAL_NAME'" 2>/dev/null; then
    echo "" >&2
    echo "ERROR: $DBX_HEAL_NAME is missing or no longer setuid AFTER the payload deploy." >&2
    echo "       The payload must never replace bin/ wholesale — the build's bin/ does" >&2
    echo "       not contain $DBX_HEAL_NAME (it is built separately)." >&2
    echo "  Recover:  scp standalone/build/$DBX_HEAL_NAME ableton@<host>:$DBX_DIR/bin/" >&2
    echo "            ssh root@<host> 'sh $DBX_DIR/bless.sh'" >&2
    exit 1
fi

# heal is root-owned and setuid, so ableton cannot overwrite it directly. Stage it
# as <name>.new and let the CURRENT heal install its own replacement — heal's own
# self-update path, which needs no root.
#
# ⚠ Staged AFTER the payload deploy, on purpose. Staging it before meant the
# payload swap deleted the .new file along with the rest of bin/.
scp -q "$HERE/build/$DBX_HEAL_NAME" \
    "${MOVE_USER}@${MOVE_HOST}:$DBX_DIR/bin/${DBX_HEAL_NAME}.new"

# --- heal: self-update, then mirror the shim into /usr/lib -----------------
say ""; say "--- heal self-update + shim mirror (no root needed)"
$SSH "'$DBX_DIR/bin/$DBX_HEAL_NAME'" || {
    echo "ERROR: $DBX_HEAL_NAME failed — the launcher will refuse to start." >&2
    echo "       Restore from a backup or re-run the root step." >&2
    exit 1; }
$SSH "ls -l '/usr/lib/$DBX_SHIM_SONAME' | awk '{print \"      /usr/lib shim: \" \$5 \" bytes\"}'"

# --- launcher module ------------------------------------------------------
if [ "$DO_MODULE" = "1" ]; then
    say ""; say "--- installing the launcher into stock's tools dir"
    MOVE_HOST="${MOVE_USER}@${MOVE_HOST}" "$HERE/scripts/install-module.sh"
fi

say ""
say "=== done ==="
say "The host is on disk. It takes effect the next time you launch dAVEBOx SA"
say "from stock Schwung's Tools menu — no restart needed here, because launching"
say "the session is what starts this build."
