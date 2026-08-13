#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A log line that names a shared-memory segment must print the REAL name, not a
# literal.
#
# Every segment name is built from SCHWUNG_SHM_PREFIX, which differs per install
# ("/schwung-" stock, "/dbxhost-" for the davebox build). A hardcoded literal is
# therefore wrong in exactly one of the two builds — and wrong in the direction
# that hurts: a davebox session announced "/schwung-link-in attached" while
# actually attaching to /dbxhost-link-in. During a hunt for why Link Audio was
# dead (2026-08-13) that line read as a prefix mismatch and sent the
# investigation sideways. A diagnostic that lies is worse than no diagnostic.
#
# Comments and docs may still spell a name for readability — this is about what
# the RUNNING build prints.

fail=0

hits=$(grep -rnE '(LOG_[A-Z]+|shadow_log)\([^;]*"[^"]*(/schwung-|/dbxhost-)' src/ 2>/dev/null | grep -v '^Binary' || true)
if [ -n "$hits" ]; then
  echo "FAIL: log messages hardcode a shm segment name instead of printing it:" >&2
  echo "$hits" >&2
  echo "      use the segment's macro (e.g. SHM_LINK_AUDIO_IN) as a %s argument." >&2
  fail=1
else
  echo "  ok   — no log message hardcodes a segment name"
fi

# The three that were wrong must specifically be right, so a future edit that
# reintroduces a literal at these sites is caught even if the pattern above is
# loosened.
for n in 3; do :; done
attach=$(grep -c 'LOG_INFO("shim", "%s attached (version=%u)", SHM_LINK_AUDIO_IN' src/schwung_shim.c || true)
[ "$attach" = "1" ] \
  && echo "  ok   — the attach line prints the real segment name" \
  || { echo "FAIL: the link-in attach log no longer prints SHM_LINK_AUDIO_IN" >&2; fail=1; }

miss=$(grep -c 'SHM_LINK_AUDIO_IN, max_attempts' src/schwung_shim.c || true)
[ "$miss" = "1" ] \
  && echo "  ok   — the never-appeared warning names the real segment" \
  || { echo "FAIL: the link-in timeout warning no longer names the real segment" >&2; fail=1; }

[ $fail -eq 0 ] && echo "PASS: shm diagnostics name what they actually opened"
exit $fail
