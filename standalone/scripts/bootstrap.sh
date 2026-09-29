#!/bin/sh
# standalone/scripts/bootstrap.sh — the ZERO-SSH first install, run ON THE
# DEVICE as ableton by the launcher (launch.sh) whenever the helper is not
# blessed or the install dir is not there (2026-09-05). Ships inside the
# launcher module's payload: modules/tools/davebox-sa/payload/scripts/.
#
# Order matters, and it is BLESS FIRST:
#   1. bless   — stage bin/heal.new (from the payload) and ask STOCK's own
#                schwung-heal to install it (charlesvestal/schwung#419). If the
#                stock host predates that, nothing else is touched: a half-made
#                install that cannot be blessed is worse than none. The log
#                names the one manual command.
#   2. payload — layout-install.sh lays the payload into $DBX_DIR, then stamps
#                sa-build.json.
# (No boot unit any more: the recovery a reboot needs is the launch's own
# `set-swap.sh recover`, and the helper removes the unit older builds installed.)
# Idempotent: every step checks before acting, so the launcher may call this
# on every launch where the cheap checks say something is missing.
#
# Overridable for tests only: MOD_DIR, DBX_DIR, STOCK_DIR, STOCK_HEAL.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
MOD_DIR="${MOD_DIR:-$(cd "$HERE/../.." && pwd)}"          # …/modules/tools/davebox-sa
DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
STOCK_DIR="${STOCK_DIR:-/data/UserData/schwung}"
STOCK_HEAL="${STOCK_HEAL:-$STOCK_DIR/bin/schwung-heal}"
PAYLOAD="$MOD_DIR/payload"
HEAL="$MOD_DIR/bin/heal"

say() { echo "bootstrap: $*"; }

# ---- 1. bless ----------------------------------------------------------------
if [ ! -u "$HEAL" ]; then
    say "the helper is not blessed ($HEAL)"
    if [ ! -f "$MOD_DIR/bin/heal.new" ]; then
        if [ -f "$PAYLOAD/bin/heal" ]; then
            mkdir -p "$MOD_DIR/bin" && cp -f "$PAYLOAD/bin/heal" "$MOD_DIR/bin/heal.new"
            say "staged bin/heal.new from the payload"
        elif [ ! -f "$HEAL" ]; then
            say "REFUSING: nothing to bless — no bin/heal.new and no payload/bin/heal"
            exit 1
        fi
    fi
    if [ -x "$STOCK_HEAL" ]; then
        "$STOCK_HEAL" || true          # installs a staged tool helper (schwung#419); silent otherwise
    else
        say "stock schwung-heal not found at $STOCK_HEAL"
    fi
    if [ ! -u "$HEAL" ]; then
        say "REFUSING: this stock Schwung cannot bless a tool helper (it predates schwung#419)."
        say "  One-time manual step, as root:  sh $DBX_DIR/bless.sh   (after the payload is in place:"
        say "  sh $PAYLOAD/scripts/layout-install.sh $PAYLOAD $DBX_DIR $STOCK_DIR)"
        exit 1
    fi
    say "blessed: $(ls -la "$HEAL")"
fi

# ---- 2. payload ----------------------------------------------------------------
want="$(cat "$PAYLOAD/sa-version.txt" 2>/dev/null || echo unknown)"
have="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$DBX_DIR/sa-build.json" 2>/dev/null || true)"
# ⚠ WHEN TO LAY THE PAYLOAD (device, 2026-09-06): only when there is NO install,
# or when BOTH stamps are release versions (x.y.z) and the payload is NEWER.
# "any mismatch → reinstall" laid a stale 0.1.0 catalog payload over a
# developer build (stamped with a git sha) the moment its helper lost setuid
# to a stock reinstall — the whole dev tree replaced on a launch. A dev stamp
# is never replaced here; a release is never downgraded.
is_release() { echo "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; }
newer() {  # $1 newer than $2, both x.y.z
    [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$1" ] && [ "$1" != "$2" ]
}
# ⚠ An install with NO stamp was laid by a bootstrap that did not finish (a
# tester's 0.0.3, 2026-09-29: a later step failed after the layout, and
# every later launch "kept" the unstamped tree as if it were a dev build — it
# would have kept it over a newer release too). Dev deploys always stamp, so a
# missing stamp means unfinished: lay it again.
lay=0
if [ ! -x "$DBX_DIR/schwung" ] || [ ! -d "$DBX_DIR/shadow" ]; then lay=1
elif [ -z "${have:-}" ]; then lay=1; say "install present but never finished (no stamp) — laying the payload"
elif is_release "$want" && is_release "${have:-}" && newer "$want" "$have"; then lay=1; say "upgrade: $have -> $want"
elif [ "$want" != "${have:-}" ]; then say "install present ($have) is not the payload ($want) — keeping it (dev build or newer release)"
fi
if [ "$lay" = 1 ]; then
    if [ ! -d "$PAYLOAD" ]; then
        say "REFUSING: no install at $DBX_DIR and no payload at $PAYLOAD"
        exit 1
    fi
    say "installing payload $want into $DBX_DIR (had: ${have:-none})"
    sh "$PAYLOAD/scripts/layout-install.sh" "$PAYLOAD" "$DBX_DIR" "$STOCK_DIR" || { say "REFUSING: layout failed"; exit 1; }
    # Stamped as soon as the layout is in place — see the missing-stamp rule above.
    printf '{"version":"%s","host":1,"davebox":1,"installed":"%s","by":"bootstrap"}\n' \
        "$want" "$(date -Iseconds 2>/dev/null || date)" > "$DBX_DIR/sa-build.json"
else
    say "install present ($have)"
fi

say "done ($want)"
exit 0
