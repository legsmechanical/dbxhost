#!/bin/bash
# tests/js/run-one.sh — rebuild, then run ONE js test. Use this for the tight
# loop (and for mutation testing) instead of running a bundle out of /tmp: the
# bundles are plain node scripts, so invoking one directly runs whatever was
# compiled LAST, which on 2026-08-24 made a mutation report SURVIVED against
# code that never contained it. Bundles now refuse to run stale; this is the
# path that keeps them fresh.
#
#   bash tests/js/run-one.sh test_track_volume
#   bash tests/js/run-one.sh track_volume        # the prefix is optional
set -e
cd "$(dirname "$0")/../.."
name="${1:?usage: run-one.sh <test name, with or without the test_ prefix>}"
case "$name" in test_*) ;; *) name="test_$name" ;; esac
[ -f "tests/js/$name.mjs" ] || {
    echo "no such test: tests/js/$name.mjs" >&2
    echo "available:" >&2
    ls tests/js/test_*.mjs | sed 's#tests/js/##; s#\.mjs##; s#^#  #' >&2
    exit 2
}
node tests/js/build.mjs >/dev/null
exec node "/tmp/davebox-js-tests/$name.js"
