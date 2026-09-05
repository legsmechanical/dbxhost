#!/bin/sh
# standalone/scripts/layout-install.sh — lay a dAVEBOx SA payload into its
# install dir, ON THE DEVICE. The one home for the layout rules that used to be
# inline ssh bodies in install-host.sh (2026-09-05), so the developer deploy and
# the zero-SSH first-launch bootstrap (bootstrap.sh) are the SAME code.
#
#   sh layout-install.sh <payload-dir> <dbx-dir> <stock-dir>
#
# Rules (see config.sh for the lists and the regressions behind them):
#   1. MERGE, never replace: files land beside their target and rename over it
#      (a mapped binary hits ETXTBSY on a plain copy); anything the payload does
#      not ship is left alone. help/ is the one dir MIRRORED (generated docs).
#      Top-level names in DBX_SHARED_LINKS and modules/ are never copied.
#   2. Workspace separation: shared content is a SYMLINK into the stock tree;
#      private state is REAL (a leftover link is removed).
#   3. modules/ is a REAL dir: stock categories linked, split where an owned
#      module lives inside, owned categories real — a stock update once replaced
#      the chain DSP under a bare symlink with no error anywhere.
#   4. Owned module payloads present in <payload-dir>/modules/<own>/ are copied
#      in whole (the dev loop rsyncs its own build instead).
set -eu
SRC="${1:?payload dir}"; DBX_DIR="${2:?dbx dir}"; STOCK="${3:?stock dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# The LISTS come from the payload's own config.sh (shipped beside this script),
# so the layout matches the build being installed, not the installer's copy.
# ⚠ config.sh also sets DBX_DIR (the device default) — the ARGUMENTS win, or a
# test fixture (and a relocated install) lays the tree into /data/UserData.
if [ -f "$HERE/config.sh" ]; then . "$HERE/config.sh"; elif [ -f "$SRC/scripts/config.sh" ]; then . "$SRC/scripts/config.sh"; fi
SRC="$1"; DBX_DIR="$2"; STOCK="$3"
: "${DBX_SHARED_LINKS:=presets patches}"
: "${DBX_PRIVATE_STATE:=slot_state active_set.txt shadow_chain_config.json shadow_config.json}"
: "${DBX_OWNED_MODULE_DIRS:=chain tools/davebox-sound}"

echo "layout: $SRC -> $DBX_DIR (stock: $STOCK)"
mkdir -p "$DBX_DIR"
cd "$SRC"

# ---- 1. merge the payload ---------------------------------------------------
skip_top() {   # a top-level name the payload must never write
    case "$1" in modules) return 0 ;; esac
    for l in $DBX_SHARED_LINKS; do [ "$1" = "$l" ] && return 0; done
    return 1
}
if [ -d ./help ]; then rm -f "$DBX_DIR"/help/*.md 2>/dev/null || true; fi
find . -mindepth 1 -type d | while read -r d; do
    top="${d#./}"; top="${top%%/*}"
    skip_top "$top" && continue
    mkdir -p "$DBX_DIR/${d#./}"
done
find . -type f | while read -r f; do
    rel="${f#./}"; top="${rel%%/*}"
    skip_top "$top" && continue
    dst="$DBX_DIR/$rel"
    cp -f "$f" "$dst.deploying"
    chmod --reference="$f" "$dst.deploying" 2>/dev/null || chmod 755 "$dst.deploying"
    mv -f "$dst.deploying" "$dst"
done
chmod +x "$DBX_DIR/schwung" "$DBX_DIR/shadow/shadow_ui" 2>/dev/null || true
chmod +x "$DBX_DIR"/scripts/*.sh "$DBX_DIR/bless.sh" 2>/dev/null || true
echo "      payload in place"
# The privileged helper moved into the launcher module dir (2026-09-05, the
# zero-SSH install); an install laid by the old layout still carries the old
# setuid binary here, blessed once by bless.sh and now referenced by nothing.
# A root 04755 file nothing runs is not something to leave lying around.
for stale in davebox-heal davebox-heal.new; do
    if [ -e "$DBX_DIR/bin/$stale" ]; then rm -f "$DBX_DIR/bin/$stale"; echo "      retired: bin/$stale (the helper lives in the launcher module dir now)"; fi
done

# ---- 2. workspace separation ------------------------------------------------
cd "$DBX_DIR"
TS=$(date +%Y%m%d)
for name in $DBX_SHARED_LINKS; do
    target="$STOCK/$name"
    if [ -L "$name" ]; then
        [ "$(readlink "$name")" = "$target" ] && { echo "      ok (shared): $name"; continue; }
        rm "$name"
    elif [ -e "$name" ]; then
        mv "$name" "$name.unshared-$TS"
        echo "      moved aside: $name -> $name.unshared-$TS (was a real copy)"
    fi
    ln -s "$target" "$name"
    echo "      linked (shared): $name"
done
for name in $DBX_PRIVATE_STATE; do
    if [ -L "$name" ]; then rm "$name"; echo "      un-linked (private): $name"; fi
    case "$name" in *.*) : ;; *) mkdir -p "$name" ;; esac
done

# ---- 3. modules/ mirror -----------------------------------------------------
if [ -L modules ]; then rm modules; echo "      un-linked: modules (was a bare symlink into stock)"; fi
mkdir -p modules
for cat in $(cd "$STOCK/modules" 2>/dev/null && ls -1); do
    whole=0; split=0
    for own in $DBX_OWNED_MODULE_DIRS; do
        [ "$cat" = "$own" ] && whole=1
        case "$own" in "$cat"/*) split=1 ;; esac
    done
    if [ "$whole" = 1 ]; then
        [ -L "modules/$cat" ] && rm "modules/$cat"
        mkdir -p "modules/$cat"; echo "      ours (whole): modules/$cat"; continue
    fi
    if [ "$split" = 1 ]; then
        [ -L "modules/$cat" ] && rm "modules/$cat"
        mkdir -p "modules/$cat"
        for ent in $(cd "$STOCK/modules/$cat" 2>/dev/null && ls -1); do
            isown=0
            for own in $DBX_OWNED_MODULE_DIRS; do [ "$cat/$ent" = "$own" ] && isown=1; done
            [ "$isown" = 1 ] && continue
            t="$STOCK/modules/$cat/$ent"
            if [ -L "modules/$cat/$ent" ] && [ "$(readlink "modules/$cat/$ent")" = "$t" ]; then continue; fi
            rm -rf "modules/$cat/$ent"; ln -s "$t" "modules/$cat/$ent"
        done
        echo "      split (stock linked, ours real): modules/$cat"; continue
    fi
    target="$STOCK/modules/$cat"
    if [ -L "modules/$cat" ] && [ "$(readlink "modules/$cat")" = "$target" ]; then continue; fi
    rm -rf "modules/$cat"; ln -s "$target" "modules/$cat"
    echo "      linked (shared): modules/$cat"
done
for own in $DBX_OWNED_MODULE_DIRS; do
    if [ -L "modules/$own" ]; then rm "modules/$own"; fi
    mkdir -p "modules/$own"; echo "      ours (pinned): modules/$own"
done

# ---- 4. owned module payloads shipped with this payload ---------------------
for own in $DBX_OWNED_MODULE_DIRS; do
    [ -d "$SRC/modules/$own" ] || continue
    rm -rf "modules/$own"; mkdir -p "modules/$own"
    cp -R "$SRC/modules/$own/." "modules/$own/"
    echo "      deployed: modules/$own (from the payload)"
done
echo "layout: done"
