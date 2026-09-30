#!/bin/sh
# uninstall.sh — remove dAVEBOx from a Move, keeping the user's projects and
# settings IN PLACE (2026-09-27).
#
# Shipped inside the "Uninstall dAVEBOx" Tools module
# (modules/tools/davebox-uninstall/), a SEPARATE module from dAVEBOx itself:
# someone who deleted dAVEBOx through the manager has no dAVEBOx left to
# uninstall from, and this still cleans up after it. Its ui.js runs this; it can
# also be run by hand over ssh:
#
#   sh /data/UserData/schwung/modules/tools/davebox-uninstall/uninstall.sh            # dry run
#   sh /data/UserData/schwung/modules/tools/davebox-uninstall/uninstall.sh --run
#
# Modes:
#   --check    one line for the UI: `live` (a session is running), `installed`
#              (something to remove) or `absent` (nothing left but kept data)
#   --dry-run  print what --run would do, change nothing (the default)
#   --run      do it; writes the exit code to $DONE_FILE when finished
#
# ⭐ KEPT, in place, so a reinstall picks up exactly where the user left off —
# the launcher rebuilds the set library from projects/ and seeds "Project 1"
# only when there are none; the first-launch install lays only its own files:
#   projects/ projects.json davebox-exports/       the user's work
#   daves-seen.txt daves-window.txt bank-view-map.txt jog-touch-card.txt seq-follow.txt midi-mute.txt midi-map.txt parallel-modules.txt
#   active_set.txt sets/sa_song_index              last project open
#   sa_master_volume shadow_config.json config/    settings
#   quarantine/ sets/quarantine/                   work set aside, never deleted:
#                 saves parked with no project, and orphan project folders
# Everything else under $DBX_DIR goes, and so does everything an install put
# anywhere else: the root-owned shim and any old boot-recovery unit (through our own
# blessed helper), the boot-selector row (handing `default` back to schwung if
# it named us), the dAVEBOx Tools module and, LAST,
# this module.
#
# ORDER is the safety argument:
#   1. a live session refuses everything;
#   2. the Sets bind mount is undone and VERIFIED undone before anything is
#      deleted — while it is bound, Move's Sets/ shows OUR library;
#   3. root-owned files, then the unprivileged ones;
#   4. this module last (ui.js is already in memory; the shell holds this
#      file open, and the whole body is functions with `main` on the last line,
#      so nothing is read from disk after the delete).
# Every step is idempotent: an interrupted run is finished by running it again.
#
# Overridable for tests only: DBX_DIR STOCK_DIR SETS_DIR BOOT_ROOT SHM_DIR
# SESSION_LOCK PROC_DIR STOCK_HEAL SHIM_PATH UNIT_PATH DONE_FILE MOD_DIR.

set -u

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
STOCK_DIR="${STOCK_DIR:-/data/UserData/schwung}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
MOVE_SETTINGS_DIR="${MOVE_SETTINGS_DIR:-/data/UserData/settings}"
BOOT_ROOT="${BOOT_ROOT:-/data/UserData/boot-targets}"
SHM_DIR="${SHM_DIR:-/dev/shm}"
SESSION_LOCK="${SESSION_LOCK:-$SHM_DIR/.dbxhost-session.lock}"
PROC_DIR="${PROC_DIR:-/proc}"
STOCK_HEAL="${STOCK_HEAL:-$STOCK_DIR/bin/schwung-heal}"
SHIM_PATH="${SHIM_PATH:-/usr/lib/davebox-shim.so}"
UNIT_PATH="${UNIT_PATH:-/etc/systemd/system/davebox-restore.service}"
DONE_FILE="${DONE_FILE:-/data/UserData/.dbx-uninstall.done}"
MOD_DIR="${MOD_DIR:-$(cd "$(dirname "$0")" && pwd)}"

SA_MOD_DIR="$STOCK_DIR/modules/tools/davebox-sa"
HEAL="$MOD_DIR/bin/heal"
SA_HEAL="$SA_MOD_DIR/bin/heal"
LIBRARY="$DBX_DIR/sets/library"
OPEN_TOOL_CMD="$STOCK_DIR/open_tool_cmd.json"

# Top-level names under $DBX_DIR that are the user's, never removed. sets/ is
# special-cased: only the KEEP_IN_SETS names survive inside it.
KEEP="projects projects.json davebox-exports daves-seen.txt daves-window.txt bank-view-map.txt jog-touch-card.txt seq-follow.txt midi-mute.txt midi-map.txt parallel-modules.txt active_set.txt sa_master_volume shadow_config.json config quarantine settings"
KEEP_IN_SETS="sa_song_index quarantine"

DRY=1
PROBLEMS=0
say() { printf '%s\n' "$*"; }
act() {  # describe, and do it unless dry: act "text" cmd args...
    _what="$1"; shift
    if [ "$DRY" = 1 ]; then say "  would: $_what"; return 0; fi
    if "$@"; then say "  done:  $_what"; return 0; fi
    say "  FAILED: $_what"; PROBLEMS=$((PROBLEMS + 1)); return 1
}

session_live() {
    [ -f "$SESSION_LOCK" ] || return 1
    _pid="$(head -n 1 "$SESSION_LOCK" 2>/dev/null | tr -cd '0-9')"
    [ -n "$_pid" ] && [ -d "$PROC_DIR/$_pid" ]
}

sets_bound() { [ -d "$LIBRARY" ] && [ "$SETS_DIR" -ef "$LIBRARY" ]; }
settings_bound() { [ -d "$DBX_DIR/settings" ] && [ "$MOVE_SETTINGS_DIR" -ef "$DBX_DIR/settings" ]; }

# Directory listings are iterated one NAME per line with globbing off, so a
# name with a space or a `*` in it is one entry, never several or an expansion.
NL='
'
lines_begin() { _saved_ifs="$IFS"; IFS="$NL"; set -f; }
lines_end()   { IFS="$_saved_ifs"; set +f; }

# ⚠ A string match, NOT `for k in $KEEP`: the listing loops run with IFS set
# to a newline, and word-splitting the keep-list under that IFS yields ONE word
# that matches nothing — which deleted every project in the first test run.
is_kept() {
    case " $KEEP " in *" $1 "*) return 0 ;; esac
    return 1
}
is_kept_in_sets() {
    case " $KEEP_IN_SETS " in *" $1 "*) return 0 ;; esac
    return 1
}

anything_installed() {
    [ -d "$SA_MOD_DIR" ] || [ -d "$BOOT_ROOT/davebox" ] ||
        [ -e "$SHIM_PATH" ] || [ -e "$UNIT_PATH" ] && return 0
    [ -d "$DBX_DIR" ] || return 1
    _found=1
    lines_begin
    for _e in $(ls -A "$DBX_DIR" 2>/dev/null); do
        is_kept "$_e" && continue
        if [ "$_e" = sets ]; then
            for _s in $(ls -A "$DBX_DIR/sets" 2>/dev/null); do
                is_kept_in_sets "$_s" || _found=0
            done
            continue
        fi
        _found=0
    done
    lines_end
    return $_found
}

# The helper that can undo root-owned things: ours (blessed from bin/heal.new by
# stock's schwung-heal), else dAVEBOx's own if it is still there and blessed.
pick_helper() {
    if [ -u "$HEAL" ]; then echo "$HEAL"; return 0; fi
    if [ -u "$SA_HEAL" ]; then echo "$SA_HEAL"; return 0; fi
    return 1
}

bless_own_helper() {
    [ -u "$HEAL" ] && return 0
    [ -f "$MOD_DIR/bin/heal.new" ] || return 0
    [ -x "$STOCK_HEAL" ] || { say "  note: stock schwung-heal not found; cannot bless the helper"; return 0; }
    if [ "$DRY" = 1 ]; then say "  would: ask stock's schwung-heal to bless this module's helper"; return 0; fi
    "$STOCK_HEAL" >/dev/null 2>&1 || true
    [ -u "$HEAL" ] && say "  done:  helper blessed" || say "  note: the helper could not be blessed"
}

step_sets() {
    say "Sets library:"
    _h="$(pick_helper || true)"
    if [ -f "$DBX_DIR/scripts/set-swap.sh" ] && [ "$DRY" = 0 ]; then
        # recover = unbind if bound AND put the user's own currentSongIndex back.
        HEAL_BIN="${_h:-/nonexistent}" DBX_DIR="$DBX_DIR" SETS_DIR="$SETS_DIR" \
            MOVE_SETTINGS_DIR="$MOVE_SETTINGS_DIR" \
            sh "$DBX_DIR/scripts/set-swap.sh" recover 2>&1 | sed 's/^/  /'
    fi
    # Move's settings folder, which a session covers with its own copy the same
    # way (the copy itself is kept, like every other setting).
    if settings_bound; then
        if [ "$DRY" = 1 ]; then say "  would: unbind dAVEBOx's settings from Move's settings folder"
        else
            [ -n "$_h" ] && "$_h" --umount-settings >/dev/null 2>&1
            if settings_bound; then
                say "  REFUSING: Move's settings folder still shows dAVEBOx's copy and it cannot be unbound."
                say "  Restart the Move (a reboot always clears it) and run this again."
                return 1
            fi
        fi
    fi
    if sets_bound; then
        if [ "$DRY" = 1 ]; then say "  would: unbind dAVEBOx's library from Sets/"; return 0; fi
        [ -n "$_h" ] && "$_h" --umount-sets >/dev/null 2>&1
        if sets_bound; then
            say "  REFUSING: Sets/ still shows dAVEBOx's library and it cannot be unbound."
            say "  Restart the Move (a reboot always clears it) and run this again."
            return 1
        fi
    fi
    say "  Sets/ is the user's own library"
}

step_root() {
    say "Root-owned files:"
    if [ ! -e "$SHIM_PATH" ] && [ ! -e "$UNIT_PATH" ]; then say "  none"; return 0; fi
    _h="$(pick_helper || true)"
    if [ "$DRY" = 1 ]; then
        say "  would: remove $SHIM_PATH and the davebox-restore unit${_h:+ (via $_h)}"
        [ -n "$_h" ] || say "  (no blessed helper yet — the run blesses one first)"
        return 0
    fi
    [ -n "$_h" ] && "$_h" --uninstall-root 2>&1 | sed 's/^/  /'
    if [ -e "$SHIM_PATH" ] || [ -e "$UNIT_PATH" ]; then
        say "  NOT REMOVED (no helper could do it). Harmless: nothing uses them now."
        say "  To remove by hand, as root:"
        say "    systemctl disable davebox-restore.service; rm -f $UNIT_PATH $SHIM_PATH; systemctl daemon-reload"
        PROBLEMS=$((PROBLEMS + 1))
    else
        say "  removed"
    fi
}

step_boot_target() {
    say "Boot selector:"
    [ -d "$BOOT_ROOT" ] || { say "  none (stock predates the boot selector)"; return 0; }
    if [ "$(head -n 1 "$BOOT_ROOT/default" 2>/dev/null)" = davebox ]; then
        act "hand the default boot back to Schwung" \
            sh -c "printf 'schwung\n' > '$BOOT_ROOT/default.tmp' && mv -f '$BOOT_ROOT/default.tmp' '$BOOT_ROOT/default'"
    fi
    if [ -d "$BOOT_ROOT/davebox" ]; then act "remove the dAVEBOx boot row" rm -rf "$BOOT_ROOT/davebox"
    else say "  no dAVEBOx row"; fi
}

step_stock_leftovers() {
    say "Stock Schwung leftovers:"
    # stock cache/davebox-presetnames is dAVEBOx LEGACY's: ours lives in $DBX_DIR/cache
    # and goes with the rest of the install. Never touch the stock one.
    # Only OUR tool ids: dAVEBOx Legacy is tool_id "davebox", and a pending
    # command for it is not ours to delete.
    if grep -Eq '"(davebox-sound|davebox-sa)"' "$OPEN_TOOL_CMD" 2>/dev/null; then
        act "remove a pending dAVEBOx open_tool_cmd.json" rm -f "$OPEN_TOOL_CMD"
    fi
    for _f in "$SHM_DIR"/dbxhost-* "$SESSION_LOCK"; do
        [ -e "$_f" ] && act "remove $_f" rm -f "$_f"
    done
    say "  (stock's launch-standalone.sh is left alone — a Schwung update restores it)"
}

step_dbx_dir() {
    say "$DBX_DIR:"
    [ -d "$DBX_DIR" ] || { say "  not there"; return 0; }
    lines_begin
    for _e in $(ls -A "$DBX_DIR"); do
        if is_kept "$_e"; then say "  keep:  $_e"; continue; fi
        if [ "$_e" = sets ] && [ -d "$DBX_DIR/sets" ] && [ ! -L "$DBX_DIR/sets" ]; then
            for _s in $(ls -A "$DBX_DIR/sets"); do
                if is_kept_in_sets "$_s"; then say "  keep:  sets/$_s"; continue; fi
                act "remove sets/$_s" rm -rf "$DBX_DIR/sets/$_s"
            done
            continue
        fi
        act "remove $_e" rm -rf "$DBX_DIR/$_e"
    done
    lines_end
}

step_modules() {
    say "Tools modules:"
    [ -d "$SA_MOD_DIR" ] || [ -L "$SA_MOD_DIR" ] && act "remove the dAVEBOx module" rm -rf "$SA_MOD_DIR"
    act "remove this uninstaller" rm -rf "$MOD_DIR"
}

report() {
    say ""
    say "Kept: your projects are in $DBX_DIR/projects,"
    say "      exports in $DBX_DIR/davebox-exports, with your settings beside them."
    say "      Reinstall dAVEBOx and it picks up where you left off."
    if [ "$DRY" = 1 ]; then say "Dry run only: nothing was changed. Run with --run to uninstall."
    elif [ "$PROBLEMS" = 0 ]; then say "dAVEBOx is uninstalled."
    else say "Finished with $PROBLEMS problem(s) — see above."; fi
}

main() {
    case "${1:---dry-run}" in
        --check)
            if session_live; then echo live
            elif anything_installed; then echo installed
            else echo absent; fi
            exit 0 ;;
        --dry-run) DRY=1 ;;
        --run) DRY=0 ;;
        *) say "usage: uninstall.sh [--check|--dry-run|--run]"; exit 64 ;;
    esac
    [ "$DRY" = 0 ] && rm -f "$DONE_FILE"
    say "dAVEBOx uninstall ($( [ "$DRY" = 1 ] && echo 'DRY RUN — nothing is changed' || echo run )) $(date 2>/dev/null)"
    if session_live; then
        say "REFUSING: a dAVEBOx session is running. Quit dAVEBOx first."
        [ "$DRY" = 0 ] && echo 2 > "$DONE_FILE"
        exit 2
    fi
    bless_own_helper
    if ! step_sets; then
        [ "$DRY" = 0 ] && echo 3 > "$DONE_FILE"
        exit 3
    fi
    step_root
    step_boot_target
    step_stock_leftovers
    step_dbx_dir
    step_modules
    report
    _rc=0; [ "$PROBLEMS" = 0 ] || _rc=4
    [ "$DRY" = 0 ] && echo "$_rc" > "$DONE_FILE"
    exit "$_rc"
}

main "$@"
