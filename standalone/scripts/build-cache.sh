#!/bin/sh
# standalone/scripts/build-cache.sh — the shared host build cache (2026-09-05).
# Sourced by build-host.sh; three functions, no side effects at source time.
#
#   dbx_build_cache_key <repo_root> <flavour_flags>   -> prints the key
#   dbx_build_cache_restore <repo_root> <key>          -> fills build/ from the cache on a hit
#   dbx_build_cache_publish <repo_root> <key>          -> stores build/ after a successful build
#
# KEY = sha1 over (git hash-object of every TRACKED file the host build reads:
# src/, scripts/, standalone/config.sh, Dockerfile, schwung-manager/) + the
# flavour flags. Content-based: an uncommitted edit changes it; a touch does not.
# Location: $DBX_BUILD_CACHE (default ~/.cache/dbxhost-build); DBX_BUILD_CACHE=0 disables.
DBX_BUILD_CACHE_INPUTS="src scripts standalone/config.sh Dockerfile schwung-manager"

dbx_build_cache_root() {
    case "${DBX_BUILD_CACHE:-}" in
        0|off|no) return 1 ;;
        "") printf '%s' "$HOME/.cache/dbxhost-build" ;;
        *)  printf '%s' "$DBX_BUILD_CACHE" ;;
    esac
}

dbx_build_cache_key() {
    root="$1"; flags="$2"
    ( cd "$root" && {
        # shellcheck disable=SC2086
        git ls-files -z -- $DBX_BUILD_CACHE_INPUTS | xargs -0 git hash-object
        printf 'flags:%s\n' "$flags"
    } ) | { command -v sha1sum >/dev/null 2>&1 && sha1sum || shasum -a 1; } | cut -c1-40
}

dbx_build_cache_restore() {
    root="$1"; key="$2"
    cache="$(dbx_build_cache_root)" || return 0
    [ -d "$cache/$key/build" ] || return 0
    if [ -f "$root/build/.build-cache-key" ] && [ "$(cat "$root/build/.build-cache-key")" = "$key" ]; then
        echo "=== build cache: build/ already at key ${key} ==="; return 0
    fi
    echo "=== build cache HIT ${key} — restoring build/ (skips the ~10 min rebuild) ==="
    rm -rf "$root/build"
    cp -R "$cache/$key/build" "$root/build"
    printf '%s' "$key" > "$root/build/.build-cache-key"
}

dbx_build_cache_publish() {
    root="$1"; key="$2"
    cache="$(dbx_build_cache_root)" || return 0
    [ -d "$root/build" ] || return 0
    printf '%s' "$key" > "$root/build/.build-cache-key"
    [ -d "$cache/$key/build" ] && return 0
    mkdir -p "$cache"
    tmp="$cache/.publish-$$"
    rm -rf "$tmp"; mkdir -p "$tmp"
    cp -R "$root/build" "$tmp/build" && mv "$tmp" "$cache/$key" && echo "=== build cache: published ${key} ===" || rm -rf "$tmp"
}
