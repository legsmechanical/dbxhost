#!/bin/bash
# test_build_cache_key.sh — the shared host build cache is keyed by CONTENT
# (git hash-object over the tracked inputs + the flavour flags), and a cache
# entry is only ever restored under its own key.
#
# Why (2026-09-05): every branch deploy rebuilt the host in Docker for ~10 min
# because build/ is per worktree. A cache keyed by mtimes or by commit would be
# wrong twice over: a touch is not a change, and an uncommitted edit IS one.
set -e
cd "$(dirname "$0")/../.."
# ⚠ Under the repo's pre-commit hook GIT_DIR/GIT_INDEX_FILE point at THIS repo; the
# fixture repos below must not inherit them, and their commits must not run our hooks.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_PREFIX
GITQ() { git -c core.hooksPath=/dev/null -c user.email=t@t -c user.name=t "$@"; }
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }
. standalone/scripts/build-cache.sh
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mk() { # a tiny repo with the inputs the key reads
    d="$1"; mkdir -p "$d/src" "$d/scripts" "$d/standalone" "$d/schwung-manager"
    printf 'int a;\n' > "$d/src/a.c"; printf '#define X 1\n' > "$d/src/a.h"
    printf 'echo build\n' > "$d/scripts/build.sh"; printf 'DBX_DIR=/x\n' > "$d/standalone/config.sh"
    printf 'FROM debian\n' > "$d/Dockerfile"; printf 'package main\n' > "$d/schwung-manager/main.go"
    ( cd "$d" && GITQ init -q && GITQ add -A && GITQ commit -qm init )
}
mk "$T/a"; mk "$T/b"
ka=$(dbx_build_cache_key "$T/a" "-DFLAV=1"); kb=$(dbx_build_cache_key "$T/b" "-DFLAV=1")
[ -n "$ka" ] && [ "$ka" = "$kb" ] && say "ok   — two trees with identical inputs share one key ($ka)" || bad "identical trees got different keys: $ka vs $kb"
kf=$(dbx_build_cache_key "$T/a" "-DFLAV=2")
[ "$kf" != "$ka" ] && say "ok   — a different FLAVOUR is a different key" || bad "flavour ignored"
touch "$T/a/src/a.h"; kt=$(dbx_build_cache_key "$T/a" "-DFLAV=1")
[ "$kt" = "$ka" ] && say "ok   — a TOUCH (mtime only) does not change the key" || bad "mtime changed the key"
printf '#define X 2\n' > "$T/a/src/a.h"; kh=$(dbx_build_cache_key "$T/a" "-DFLAV=1")
[ "$kh" != "$ka" ] && say "ok   — an UNCOMMITTED header edit changes the key" || bad "uncommitted header edit ignored"
printf 'junk\n' > "$T/a/src/untracked.c"; ku=$(dbx_build_cache_key "$T/a" "-DFLAV=1")
[ "$ku" = "$kh" ] && say "ok   — an untracked file is not in the key (documented)" || bad "untracked file changed the key"
# restore/publish law under a private cache root
export DBX_BUILD_CACHE="$T/cache"
mkdir -p "$T/b/build"; printf 'bin' > "$T/b/build/schwung"
dbx_build_cache_publish "$T/b" "$kb" >/dev/null
[ -f "$T/cache/$kb/build/schwung" ] && say "ok   — publish stores build/ under its key" || bad "publish wrote nothing"
rm -rf "$T/a/build"; dbx_build_cache_restore "$T/a" "$kb" >/dev/null
[ -f "$T/a/build/schwung" ] && say "ok   — restore fills an empty build/ from the cache under the same key" || bad "restore did nothing on a hit"
rm -rf "$T/a/build"; dbx_build_cache_restore "$T/a" "$kh" >/dev/null
[ ! -d "$T/a/build" ] && say "ok   — a DIFFERENT key restores nothing (a header edit must rebuild)" || bad "restored a cache entry under the wrong key"
DBX_BUILD_CACHE=0 dbx_build_cache_restore "$T/a" "$kb" >/dev/null; [ ! -d "$T/a/build" ] && say "ok   — DBX_BUILD_CACHE=0 disables the cache" || bad "cache used while disabled"
grep -q 'build-cache.sh' standalone/scripts/build-host.sh && grep -q 'dbx_build_cache_restore' standalone/scripts/build-host.sh && grep -q 'dbx_build_cache_publish' standalone/scripts/build-host.sh \
    && say "ok   — build-host.sh restores before and publishes after the build" || bad "build-host.sh is not wired to the cache"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
