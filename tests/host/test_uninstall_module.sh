#!/usr/bin/env bash
# tests/host/test_uninstall_module.sh — the "Uninstall dAVEBOx" module's
# uninstall.sh (2026-09-27), against a fake device in a temp dir.
#
# The two heals are stubs. Stock's "blesses" by moving heal.new to heal and
# setting u+s (a non-root owner may set the bit on its own file, which is what
# `test -u` reads). Ours logs its verb and does what the real one does to the
# fixture: --umount-sets turns a Sets/ symlink (our "bind mount": `-ef` follows
# it) back into a real dir, --uninstall-root removes the shim and unit files.
#
# Run under dash as well as sh when dash exists — the device's /bin/sh is dash.
set -u
cd "$(dirname "$0")/../.." || exit 2
SCRIPT="$PWD/standalone/uninstall/uninstall.sh"
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

SHELLS="sh"; command -v dash >/dev/null 2>&1 && SHELLS="sh dash"

mk() {  # a fresh device. $1 = heal: blessable | none | stuck (cannot unbind)
    F="$T/f"; rm -rf "$F"
    mkdir -p "$F/stock/bin" "$F/stock/modules/tools/other-tool" "$F/stock/modules/audio_fx/x" \
             "$F/stock/presets/p" "$F/stock/cache/davebox-presetnames" "$F/stock/cache/stock-own" \
             "$F/stock/modules/tools/davebox-sa/bin" "$F/stock/modules/tools/davebox-uninstall/bin" \
             "$F/UserLibrary/Sets" "$F/boot/davebox" "$F/boot/schwung" "$F/shm" "$F/proc" "$F/root"
    echo keep > "$F/stock/modules/tools/other-tool/module.json"
    echo keep > "$F/stock/presets/p/a.json"
    echo keep > "$F/stock/cache/stock-own/x"
    echo '{"id":"davebox-sa"}' > "$F/stock/modules/tools/davebox-sa/module.json"
    echo "their set" > "$F/UserLibrary/Sets/theirs.txt"
    printf 'davebox\n' > "$F/boot/default"
    echo '{}' > "$F/boot/davebox/boot.json"
    echo '{}' > "$F/boot/schwung/boot.json"
    echo ring > "$F/shm/dbxhost-display"; echo ring > "$F/shm/schwung-display"
    echo shim > "$F/root/davebox-shim.so"; echo unit > "$F/root/davebox-restore.service"
    printf '{"tool_id": "davebox-sound"}\n' > "$F/stock/open_tool_cmd.json"

    D="$F/dbx"
    mkdir -p "$D/projects/p1/Move-Set-p1" "$D/davebox-exports" "$D/config" "$D/sets/library" \
             "$D/sets/template/t" "$D/scripts" "$D/modules/chain" "$D/shadow" "$D/__pycache__"
    echo "song" > "$D/projects/p1/Move-Set-p1/Song.abl"
    echo '[]' > "$D/projects.json"; echo bundle > "$D/davebox-exports/a.ablbundle"
    for f in daves-seen.txt daves-window.txt bank-view-map.txt phrase-map.txt parallel-modules.txt active_set.txt \
             sa_master_volume shadow_config.json; do echo "mine $f" > "$D/$f"; done
    echo tts > "$D/config/tts.json"; echo 1 > "$D/sets/sa_song_index"; echo none > "$D/sets/swap_state"
    mkdir -p "$D/quarantine" "$D/sets/quarantine/20260921/orphan"
    echo parked > "$D/quarantine/seq8sa-1-2.json"; echo orphan > "$D/sets/quarantine/20260921/orphan/Song.abl"
    ln -s "$D/projects/p1" "$D/sets/library/slot1"
    echo host > "$D/schwung"; echo log > "$D/debug.log"; echo x > "$D/with space.txt"
    echo x > "$D/.build-cache-key"; echo x > "$D/shadow/shadow_ui"
    ln -s "$F/stock/presets" "$D/presets"
    ln -s "$F/stock/modules/audio_fx" "$D/modules/audio_fx"
    # set-swap stub: logs the helper it was handed
    printf '#!/bin/sh\necho "recover HEAL_BIN=$HEAL_BIN" >> "%s/setswap.log"\n' "$F" > "$D/scripts/set-swap.sh"

    M="$F/stock/modules/tools/davebox-uninstall"
    cp "$SCRIPT" "$M/uninstall.sh"
    cat > "$M/bin/heal.new" <<H
#!/bin/sh
echo "\$*" >> "$F/heal.log"
case "\$1" in
  --umount-sets) [ -L "$F/UserLibrary/Sets" ] || exit 0
                 [ -f "$F/stuck" ] && exit 2
                 rm "$F/UserLibrary/Sets"; mkdir "$F/UserLibrary/Sets"; echo "their set" > "$F/UserLibrary/Sets/theirs.txt" ;;
  --uninstall-root) rm -f "$F/root/davebox-shim.so" "$F/root/davebox-restore.service" ;;
esac
H
    chmod 755 "$M/bin/heal.new"
    case "$1" in
        blessable|stuck)
            cat > "$F/stock/bin/schwung-heal" <<S
#!/bin/sh
for b in "$F"/stock/modules/tools/*/bin; do [ -f "\$b/heal.new" ] && mv -f "\$b/heal.new" "\$b/heal" && chmod 4755 "\$b/heal"; done
exit 0
S
            [ "$1" = stuck ] && touch "$F/stuck" ;;
        none) printf '#!/bin/sh\nexit 0\n' > "$F/stock/bin/schwung-heal" ;;   # cannot bless
    esac
    chmod 755 "$F/stock/bin/schwung-heal"
}
run() {  # $1 = shell, rest = args. Sets RC; output in $T/out
    _sh="$1"; shift
    DBX_DIR="$F/dbx" STOCK_DIR="$F/stock" SETS_DIR="$F/UserLibrary/Sets" BOOT_ROOT="$F/boot" \
    SHM_DIR="$F/shm" PROC_DIR="$F/proc" SHIM_PATH="$F/root/davebox-shim.so" \
    UNIT_PATH="$F/root/davebox-restore.service" DONE_FILE="$F/done" \
        "$_sh" "$F/stock/modules/tools/davebox-uninstall/uninstall.sh" "$@" > "$T/out" 2>&1
    RC=$?
}
snapshot() { (cd "$F" && find . \( -type f -o -type l -o -type d \) -print | LC_ALL=C sort; \
              find . -type f -exec cksum {} + | LC_ALL=C sort) > "$1"; }
bound() { rm -rf "$F/UserLibrary/Sets"; ln -s "$F/dbx/sets/library" "$F/UserLibrary/Sets"; }

for SH in $SHELLS; do
echo "=== under $SH ==="

echo "--check:"
mk blessable; run "$SH" --check
[ "$RC" = 0 ] && [ "$(cat "$T/out")" = installed ] && ok "installed" || bad "rc=$RC out=$(cat "$T/out")"
echo 4242 > "$F/shm/.dbxhost-session.lock"; mkdir "$F/proc/4242"; run "$SH" --check
[ "$(cat "$T/out")" = live ] && ok "a lock whose pid is alive = live" || bad "out=$(cat "$T/out")"
rmdir "$F/proc/4242"; run "$SH" --check
[ "$(cat "$T/out")" = installed ] && ok "a stale lock (pid gone) is not live" || bad "out=$(cat "$T/out")"

echo "dry run (the default) changes nothing:"
mk blessable; bound; snapshot "$T/before"; run "$SH"
snapshot "$T/after"
[ "$RC" = 0 ] && cmp -s "$T/before" "$T/after" && ok "tree identical after a dry run" || bad "rc=$RC; changed: $(diff "$T/before" "$T/after" | head -5)"
grep -q "would: remove debug.log" "$T/out" && grep -q "keep:  projects$" "$T/out" && ok "says what it would remove and keep" || bad "$(head -30 "$T/out")"
grep -q "nothing was changed" "$T/out" && ! grep -q "is uninstalled" "$T/out" && ok "does not claim to have uninstalled" || bad "dry summary wrong"

echo "--run on a full install (Sets bound, helper blessable):"
mk blessable; bound
for f in projects/p1/Move-Set-p1/Song.abl projects.json davebox-exports/a.ablbundle daves-seen.txt \
         daves-window.txt bank-view-map.txt phrase-map.txt parallel-modules.txt active_set.txt sa_master_volume \
         shadow_config.json config/tts.json sets/sa_song_index quarantine/seq8sa-1-2.json \
         sets/quarantine/20260921/orphan/Song.abl; do cksum "$F/dbx/$f"; done > "$T/kept.before"
run "$SH" --run
[ "$RC" = 0 ] && ok "exit 0" || { bad "rc=$RC"; sed 's/^/      /' "$T/out"; }
[ "$(cat "$F/done" 2>/dev/null)" = 0 ] && ok "done file says 0" || bad "done=$(cat "$F/done" 2>/dev/null)"
for f in projects/p1/Move-Set-p1/Song.abl projects.json davebox-exports/a.ablbundle daves-seen.txt \
         daves-window.txt bank-view-map.txt phrase-map.txt parallel-modules.txt active_set.txt sa_master_volume \
         shadow_config.json config/tts.json sets/sa_song_index quarantine/seq8sa-1-2.json \
         sets/quarantine/20260921/orphan/Song.abl; do cksum "$F/dbx/$f" 2>&1; done > "$T/kept.after"
cmp -s "$T/kept.before" "$T/kept.after" && ok "every kept file is byte-identical, in place" || bad "kept files changed: $(diff "$T/kept.before" "$T/kept.after")"
left="$(cd "$F/dbx" && ls -A | LC_ALL=C sort | tr '\n' ' ')"
want="$(printf '%s\n' active_set.txt config bank-view-map.txt daves-seen.txt daves-window.txt davebox-exports parallel-modules.txt \
        phrase-map.txt projects projects.json quarantine sa_master_volume sets shadow_config.json | LC_ALL=C sort | tr '\n' ' ')"
[ "$left" = "$want" ] \
    && ok "dbx-host holds exactly the keep-list" || bad "left: $left"
[ "$(ls -A "$F/dbx/sets" | LC_ALL=C sort | tr '\n' ' ')" = "quarantine sa_song_index " ] && ok "sets/ holds only sa_song_index and quarantine/" || bad "sets: $(ls -A "$F/dbx/sets")"
[ ! -L "$F/UserLibrary/Sets" ] && [ "$(cat "$F/UserLibrary/Sets/theirs.txt")" = "their set" ] && ok "Sets/ unbound, the user's own sets there" || bad "Sets"
grep -q "recover HEAL_BIN=$F/stock/modules/tools/davebox-uninstall/bin/heal" "$F/setswap.log" && ok "set-swap recover ran with OUR blessed helper" || bad "setswap: $(cat "$F/setswap.log" 2>/dev/null)"
grep -qx -- "--uninstall-root" "$F/heal.log" && [ ! -e "$F/root/davebox-shim.so" ] && [ ! -e "$F/root/davebox-restore.service" ] && ok "root-owned shim and unit removed via the helper" || bad "root: $(cat "$F/heal.log")"
[ "$(cat "$F/boot/default")" = schwung ] && [ ! -e "$F/boot/davebox" ] && [ -f "$F/boot/schwung/boot.json" ] && ok "boot default handed back to schwung, our row gone, stock's kept" || bad "boot: $(cat "$F/boot/default"); $(ls "$F/boot")"
[ ! -e "$F/stock/cache/davebox-presetnames" ] && [ -f "$F/stock/cache/stock-own/x" ] && ok "our preset cache gone, stock's cache kept" || bad "cache"
[ ! -e "$F/stock/open_tool_cmd.json" ] && ok "a pending dAVEBOx open_tool_cmd.json removed" || bad "open_tool_cmd left"
[ ! -e "$F/shm/dbxhost-display" ] && [ -e "$F/shm/schwung-display" ] && ok "our /dev/shm rings gone, stock's kept" || bad "shm: $(ls -A "$F/shm")"
[ ! -e "$F/stock/modules/tools/davebox-sa" ] && ok "the dAVEBOx Tools module removed" || bad "davebox-sa left"
[ ! -e "$F/stock/modules/tools/davebox-uninstall" ] && ok "the uninstaller removed itself, last" || bad "uninstaller left"
[ -f "$F/stock/modules/tools/other-tool/module.json" ] && [ -f "$F/stock/presets/p/a.json" ] && [ -d "$F/stock/modules/audio_fx/x" ] \
    && ok "stock's tools, presets and modules untouched (our links removed, not followed)" || bad "stock content touched"
grep -q "projects are in $F/dbx/projects" "$T/out" && ok "tells the user where the projects are" || bad "no kept-path line"

echo "a non-dAVEBOx open_tool_cmd.json and a non-davebox default are left alone:"
mk blessable; printf '{"tool_id": "song-mode"}\n' > "$F/stock/open_tool_cmd.json"; printf 'schwung\n' > "$F/boot/default"
run "$SH" --run
[ -f "$F/stock/open_tool_cmd.json" ] && [ "$(cat "$F/boot/default")" = schwung ] && ok "both untouched" || bad "touched"

echo "a live session refuses everything:"
mk blessable; echo 77 > "$F/shm/.dbxhost-session.lock"; mkdir "$F/proc/77"; snapshot "$T/before"
run "$SH" --run
rm -f "$F/done"; snapshot "$T/after"
[ "$RC" = 2 ] && grep -q "Quit dAVEBOx first" "$T/out" && ok "rc 2, says why" || bad "rc=$RC: $(cat "$T/out")"
cmp -s "$T/before" "$T/after" && ok "nothing changed" || bad "changed: $(diff "$T/before" "$T/after" | head -5)"

echo "Sets bound and cannot be unbound — refuses before deleting anything:"
mk stuck; bound
run "$SH" --run
[ "$RC" = 3 ] && [ "$(cat "$F/done")" = 3 ] && grep -q "REFUSING: Sets/ still shows" "$T/out" && ok "rc 3, says why" || bad "rc=$RC: $(cat "$T/out")"
[ -f "$F/dbx/schwung" ] && [ -f "$F/root/davebox-shim.so" ] && [ -d "$F/stock/modules/tools/davebox-sa" ] && [ -d "$F/boot/davebox" ] \
    && ok "install, root files, module and boot row all still there" || bad "deleted something while bound"

echo "no helper can be blessed (a stock that predates it):"
mk none
run "$SH" --run
[ "$RC" = 4 ] && [ "$(cat "$F/done")" = 4 ] && ok "rc 4 — finished with a problem, never claims clean success" || bad "rc=$RC"
grep -q "To remove by hand, as root" "$T/out" && ! grep -q "is uninstalled" "$T/out" && ok "prints the manual root line" || bad "$(cat "$T/out")"
[ -f "$F/root/davebox-shim.so" ] && [ ! -e "$F/dbx/schwung" ] && [ ! -e "$F/stock/modules/tools/davebox-sa" ] \
    && ok "root files reported, everything unprivileged still removed" || bad "state wrong"

echo "dAVEBOx's own helper is used when ours cannot be blessed:"
mk none; rm "$F/stock/modules/tools/davebox-uninstall/bin/heal.new"
printf '#!/bin/sh\necho "SA $*" >> "%s/heal.log"\n[ "$1" = --uninstall-root ] && rm -f "%s/root/"*\nexit 0\n' "$F" "$F" > "$F/stock/modules/tools/davebox-sa/bin/heal"
chmod 4755 "$F/stock/modules/tools/davebox-sa/bin/heal"
run "$SH" --run
grep -qx "SA --uninstall-root" "$F/heal.log" && [ "$RC" = 0 ] && ok "falls back to davebox-sa/bin/heal" || bad "rc=$RC heal: $(cat "$F/heal.log" 2>/dev/null)"

echo "idempotent — a second run over what the first left:"
mk blessable; run "$SH" --run
mkdir -p "$F/stock/modules/tools/davebox-uninstall"; cp "$SCRIPT" "$F/stock/modules/tools/davebox-uninstall/uninstall.sh"
run "$SH" --check
[ "$(cat "$T/out")" = absent ] && ok "--check says absent once only kept data remains" || bad "check=$(cat "$T/out")"
run "$SH" --run
[ "$RC" = 4 ] || [ "$RC" = 0 ]; [ "$RC" = 0 ] && [ -f "$F/dbx/projects/p1/Move-Set-p1/Song.abl" ] && ok "second run exits 0, projects intact" || bad "rc=$RC: $(cat "$T/out")"

echo "usage:"
mk blessable; run "$SH" --delete-everything
[ "$RC" = 64 ] && [ -f "$F/dbx/schwung" ] && ok "an unknown flag is refused, nothing done" || bad "rc=$RC"
done

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
