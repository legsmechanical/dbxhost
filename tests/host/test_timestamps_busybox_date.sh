#!/usr/bin/env bash
# tests/host/test_timestamps_busybox_date.sh — BusyBox date (stock AbletonOS)
# has no %N and prints it literally. launch.log carried "19:01:56.%2N" on
# every phase line, and quiesce-stock.sh did arithmetic on "1790798291%N" — a
# syntax error that ends the script under sh right after the save it times.
# Both run here against a date that behaves like BusyBox's, and against a real one.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

# A date that drops %N through unexpanded, as BusyBox 1.35 does.
mkdir -p "$T/bb"
cat > "$T/bb/date" <<'SH'
#!/bin/sh
fmt="$1"; real=$(PATH=/usr/bin:/bin command -v date)
case "$fmt" in
  +*) "$real" "$(printf '%s' "$fmt" | sed 's/%\([0-9]*\)N/@\1N@/g')" | sed 's/@\([0-9]*\)N@/%\1N/g' ;;
  *)  "$real" "$@" ;;
esac
SH
chmod +x "$T/bb/date"
PATH="$T/bb:$PATH" date +%H:%M:%S.%2N | grep -q '%2N$' \
    && ok "control: the stub prints %N literally, as BusyBox does" || bad "control: stub expands %N"

echo "launch.sh ts():"
line="$(grep -E '^  ts\(\) \{' standalone/scripts/launch.sh)"
[ -n "$line" ] || { echo "FAIL: ts() not found in launch.sh"; exit 1; }
out="$(PATH="$T/bb:$PATH" bash -c "$line"'; ts hello')"
echo "$out" | grep -qE '^[0-9]{2}:[0-9]{2}:[0-9]{2} phase: hello$' \
    && ok "BusyBox date: whole seconds, no literal ($out)" || bad "BusyBox date: $out"
if [ "$(uname -s)" = Linux ]; then
    out="$(bash -c "$line"'; ts hello')"
    echo "$out" | grep -qE '^[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{2} phase: hello$' \
        && ok "GNU date: hundredths kept ($out)" || bad "GNU date: $out"
fi

echo "quiesce-stock.sh _ms():"
def="$(grep -E '^    _ms\(\) \{' standalone/scripts/quiesce-stock.sh)"
[ -n "$def" ] || { echo "FAIL: _ms() not found in quiesce-stock.sh"; exit 1; }
! grep -v '^[[:space:]]*#' standalone/scripts/quiesce-stock.sh | grep -q '%s%N' && ok "no date +%s%N left" || bad "date +%s%N still used"
if [ -r /proc/uptime ]; then
    r="$(PATH="$T/bb:$PATH" sh -c "$def"'; a=$(_ms); sleep 0.3; b=$(_ms); echo $(( b - a ))')"
    case "$r" in ''|*[!0-9]*) bad "not a number of ms: $r" ;;
        *) [ "$r" -ge 200 ] && [ "$r" -le 2000 ] && ok "a 0.3 s sleep measures ${r} ms" || bad "a 0.3 s sleep measured ${r} ms" ;; esac
else
    echo "  skip — no /proc/uptime on $(uname -s): the ms clock runs on Linux only"
fi

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
