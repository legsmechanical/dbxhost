#!/usr/bin/env bash
# THE BOOT TARGET — the second door, and the rules that keep the first one open.
#
# Josh, 2026-09-11, ruling the feature in: "we need to also be able launch it
# from within schwung tools without issues." So the property under test is not
# "the boot row works" — it is that adding it did not fork the launcher or take
# the boot away from stock.
#
# Four things can go silently wrong here, and each would only show up on
# hardware, at boot, which is the worst place to find out:
#
#   1. THE BOOT ROW STOPS SHARING THE LAUNCHER. If entry.sh ever grows its own
#      copy of the launch sequence, the two doors drift and the Tools one rots
#      quietly — it is the one nobody re-tests after a boot-path change.
#   2. THE INSTALL TAKES THE BOOT. Writing boot-targets/default would make a
#      broken davebox build the thing that boots, and "a reboot always returns
#      to stock" is the promise that stops this bricking the device.
#   3. ENTRY.SH FORKS INSTEAD OF EXEC'ING. The selector's watchdog tests the pid
#      it exec-ed; fork-and-exit fails that check, three strikes trip a forced
#      picker, and strikes never decay.
#   4. THE BOOT PATH PAUSES THE UNIT. At boot the launcher IS
#      move-launcher.service — stopping it kills the session and systemd boots
#      the selector again: a loop, not a launch.
set -u
cd "$(dirname "$0")/../.."

ENTRY=standalone/boot-target/entry.sh
BOOTJSON=standalone/boot-target/boot.json
INSTALL=standalone/scripts/install-boot-target.sh
LAUNCH=standalone/scripts/launch.sh
for f in "$ENTRY" "$BOOTJSON" "$INSTALL" "$LAUNCH"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
ok()   { echo "  ok   $1"; }
bad()  { echo "  FAIL $1" >&2; fails=1; }
check(){ local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }

# ⚠⚠ READ CODE, NOT THE PROSE BESIDE IT. The first version of this test matched
# its OWN subject's comments: the banner in entry.sh explains why it does not
# reimplement the launcher, and naming `setsid` and `LD_PRELOAD` to say so made
# three checks fail against a CORRECT file. A comment that describes a rule is
# not a violation of it. So every content check below runs over `code()` —
# comments and blank lines stripped — and the controls at the bottom prove the
# checks can still fail.
code() { sed -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$1"; }

echo "test_boot_target_second_door"

# ---- 1. ONE BODY, TWO DOORS -------------------------------------------------
# The launcher the Tools menu runs is the module's `standalone` file. entry.sh
# must run THAT, not a copy of it.
TOOLS_LAUNCHER='/data/UserData/schwung/modules/tools/davebox-sa/standalone'
check "entry.sh runs the SAME launcher the Tools menu runs" \
      grep -qF "$TOOLS_LAUNCHER" <(code "$ENTRY")

# A real reimplementation would have to DO these; a thin wrapper only talks
# about them. Hence code(), not the file.
forked=0
for marker in 'setsid' 'flock' 'set-swap.sh' 'pidof' 'LD_PRELOAD'; do
    if grep -q "$marker" <(code "$ENTRY"); then
        bad "entry.sh RUNS '$marker' — it is reimplementing the launcher instead of running it"
        forked=1
    fi
done
[ "$forked" = 0 ] && ok "entry.sh carries no launch logic of its own (5 markers absent from the code)"

# ---- 2. IT MUST NOT TAKE THE BOOT ------------------------------------------
# The only write to `default` allowed anywhere is the UNINSTALL handing it back
# to schwung. Everything else must leave it alone. Look for a redirect or a mv
# onto the default file outside that path.
# ⚠ Scope this STRUCTURALLY to the install half — from the "registering" banner
# to the end of the file. The uninstall block legitimately rewrites `default`
# (handing it back to schwung), and a whole-file word match also trips over the
# lines that merely REPORT the default, which is how the first draft of this
# check failed against a correct installer.
install_half=$(code "$INSTALL" | awk '/--- registering dAVEBOx as a boot target/,0')
[ -n "$install_half" ] || bad "could not isolate the install half — the banner it keys on moved"
# A WRITE is a redirect onto it, or an mv/cp/ln landing on it. Reads are fine.
offending=$(printf '%s\n' "$install_half" |
            grep -nE '(>[[:space:]]*.{0,20}/default|(mv|cp|ln)[^|]*/default)([^.]|$)' || true)
if [ -n "$offending" ]; then
    bad "the INSTALL path writes boot-targets/default — it would take the boot from stock:"
    printf '        %s\n' "$offending" >&2
else
    ok "⚠⚠ the install NEVER writes boot-targets/default — a reboot still returns to stock"
fi

# The other half of the same rule: uninstalling MUST hand the default back if it
# names us, or the selector is left pointing at a directory we just deleted.
uninstall_half=$(code "$INSTALL" | awk '/UNINSTALL" = "1"/,/^fi$/')
check "uninstall hands boot-targets/default back to schwung when it names us" \
      grep -q "printf 'schwung" <(printf '%s\n' "$uninstall_half")

check "...and it says so out loud, so the behaviour is visible in the install log" \
      grep -q "UNCHANGED by this install" "$INSTALL"

# The reserved ids must never be created by us.
check "the boot id is not a reserved one (schwung / stock)" \
      grep -q "^BOOT_ID=davebox$" "$INSTALL"
if grep -q "boot-targets/schwung" <(code "$INSTALL"); then
    bad "the installer touches boot-targets/schwung — the selector owns and rewrites that directory"
else
    ok "it never touches boot-targets/schwung (selector-owned, rewritten every boot)"
fi

# ---- 3. EXEC, NOT FORK ------------------------------------------------------
check "entry.sh EXECs the launcher (the watchdog tests the pid it exec-ed)" \
      grep -qE '^exec "\$LAUNCHER" --boot$' "$ENTRY"
if grep -qE '^\s*"?\$LAUNCHER"?\s*&\s*$' "$ENTRY"; then
    bad "entry.sh backgrounds the launcher — fork-and-exit fails the liveness check"
else
    ok "it does not background it"
fi
# The fallback matters as much: a missing launcher must still boot the device.
check "a missing launcher falls through to stock rather than a dead frame" \
      grep -q 'exec /opt/move/MoveOriginal' "$ENTRY"

# ---- 4. THE BOOT PATH MUST NOT PAUSE THE UNIT -------------------------------
# At boot the launcher IS move-launcher.service. Every pause/resume must be
# behind at_boot, or the session stops itself.
check "the door defaults to 'tools', so the Tools path is unchanged by default" \
      grep -q '^_dbx_entry=tools$' <(code "$LAUNCH")

# ---- 5. ⚠⚠ THE DOOR SIGNAL MUST NOT BE INHERITABLE -------------------------
# It was an EXPORTED variable for one hour and it left the device split: Move
# native on the OLED, dAVEBOx on everything else. The boot path ends in
# `exec /opt/move/Move`, and export survives exec — so DBX_ENTRY=boot rode into
# the next stock session, and the Tools launch after it took every boot branch.
# Confirmed on the device: shadow_ui holding DBX_ENTRY=boot, and a Tools launch
# logging entry=boot. An argument cannot be inherited; that is the whole fix.
if code "$LAUNCH" | grep -qE '^\s*export DBX_ENTRY'; then
    bad "⚠⚠ DBX_ENTRY is EXPORTED again — it leaks through the boot exec into the next session"
else
    ok "⚠⚠ the door signal is never exported (an exported one leaked into stock and split the device)"
fi
check "the boot door passes it as an ARGUMENT" \
      grep -q 'exec "\$LAUNCHER" --boot' <(code "$ENTRY")
check "...and the launcher reads that argument, not the environment" \
      grep -q '\-\-boot) _dbx_entry=boot ;;' <(code "$LAUNCH")
if code "$LAUNCH" | grep -q 'DBX_ENTRY:-'; then
    bad "the launcher still falls back to an INHERITED DBX_ENTRY — a stale copy would be believed"
else
    ok "...and consults no inherited value at all, so a stale copy is inert"
fi
check "the door reaches the body as a positional arg, not the environment" \
      grep -q "^' dbx-launch \"\\\$_dbx_entry\"$" <(code "$LAUNCH")

# ⭑ BEHAVIOURAL, not textual. The closer was written once with the variable
# silently eaten (a perl -pe interpolated `$_dbx_entry` to empty), which greps
# for "it is passed" would still have matched. Run the real calling convention
# and read what the body would see.
for want in tools boot; do
    got=$(bash -c 'echo "$1"' dbx-launch "$want")
    [ "$got" = "$want" ] || bad "the bash -c calling convention drops the door: sent '$want', body saw '$got'"
done
ok "⭑ the bash -c argument convention really delivers the door to the body (both values)"
# And the parse itself: --boot in, boot out; nothing in, tools out.
parse=$(sed -n '/^_dbx_entry=tools$/,/^esac$/p' "$LAUNCH")
for arg_want in ":tools" "--boot:boot"; do
    a="${arg_want%%:*}"; w="${arg_want##*:}"
    got=$(bash -c "set -- $a; $parse; echo \$_dbx_entry")
    [ "$got" = "$w" ] || bad "arg '$a' should select '$w', selected '$got'"
done
ok "⭑ the argument parse itself: no arg = tools, --boot = boot (run, not read)"

# Every --pause-launcher / --resume-launcher must be guarded. This is the check
# with teeth: a new one added later without a guard is the boot loop.
# ⭐ The guard is a SINGLE OWNER, `unit()`, not a condition repeated at each
# call site — so the check is simply that nothing bypasses it. That is a
# property a new call site cannot accidentally fail to inherit, and unlike the
# per-site version it does not need to understand the if/elif structure around
# each one (which is what made the first draft of this check wrong).
check "the launcher knows which door it came through" \
      grep -q 'at_boot() { \[ "\$DBX_ENTRY" = boot \]; }' <(code "$LAUNCH")
check "pause/resume of the unit has ONE owner, unit()" \
      grep -q '^  unit() {$' <(code "$LAUNCH")
check "...and that owner is the thing that knows about boot" \
      grep -q 'if at_boot; then echo "boot entry: skipping move-launcher' <(code "$LAUNCH")

# ⚠ ONE deliberate exception: the detached exit helper. It runs AFTER we have
# exited, when we are no longer the unit, so it MUST call the helper directly —
# unit() would take its at_boot branch, skip the start, and leave the device
# dark. Allowed by its exact shape (`&& exit 0`, inside the sh -c), nothing wider.
bypass=$(code "$LAUNCH" | grep -n 'HEAL --pause-launcher\|HEAL --resume-launcher' |
         grep -v '\$HEAL "\$@"' |
         grep -v 'HEAL --resume-launcher && exit 0' || true)
if [ -n "$bypass" ]; then
    bad "a pause/resume bypasses unit() — at boot the unit is US, and stopping it is a boot loop:"
    printf '        %s\n' "$bypass" >&2
else
    ok "⚠ every move-launcher pause/resume goes through unit()"
fi

# ---- 5. THE TWO BUGS THE FIRST BOOT TEST FOUND (2026-09-12, on hardware) ----
# Both were invisible off-device and both came from the same wrong assumption:
# that at boot there is nothing already running that matters.

# (a) THE SWEEP KILLED OUR OWN SUPERVISOR. MoveLauncher is still the unit's main
#     process when the selector hands over. Killing it by name reads as the
#     service failing; RestartSec=2s starts a fresh one, KillMode=process leaves
#     OUR tree alive, and two stacks fight over one SPI device — "communication
#     error", then a freeze.
boot_sweep=$(code "$LAUNCH" | grep -A6 'if at_boot; then' | grep 'SWEEP_NAMES=' || true)
if [ -z "$boot_sweep" ]; then
    bad "no boot-specific SWEEP_NAMES — the sweep would kill MoveLauncher, our own supervisor"
else
    if printf '%s\n' "$boot_sweep" | grep -q 'MoveLauncher'; then
        bad "⚠⚠ the BOOT sweep list still contains MoveLauncher — that is the two-stack freeze"
    else
        ok "⚠⚠ the boot sweep excludes MoveLauncher (killing it = systemd restarts under us)"
    fi
    printf '%s\n' "$boot_sweep" | grep -qE '(^|[ "])Move([ "]|$)' &&
        bad "the BOOT sweep list still contains 'Move' — /opt/move/Move is the selector, our own ancestor" ||
        ok "...and excludes 'Move', the selector image we were exec-ed from"
fi
# The wait loop has its own copy of the list; a fix to one and not the other
# leaves the loop waiting for a process it must not kill.
check "the post-sweep wait loop uses the same variable, not a second hardcoded list" \
      grep -q 'pidof \$SWEEP_WAIT_NAMES' <(code "$LAUNCH")
if code "$LAUNCH" | grep -q 'pidof MoveMessageDisplay MoveLauncher'; then
    bad "the wait loop still hardcodes MoveLauncher — the two lists can drift apart"
else
    ok "no second hardcoded sweep list"
fi

# (b) THE BOOT PATH MUST NOT EXIT AT ALL — it hands its pid to the selector.
#     MoveLauncher is a SUPERVISOR, not an exec wrapper: it forks
#     MoveSentryRunProcessor and Move as children and watches them, and the
#     string "Move crashed" is inside the MoveLauncher binary. At boot the pid
#     it supervises is OURS, so exiting looks like Move dying — whatever the
#     status. Three fixes were spent on the wrong layer (exit code, then
#     systemd) before the Tools-vs-boot comparison located it.
check "⚠⚠ the boot path EXECs onward rather than exiting (MoveLauncher supervises our pid)" \
      grep -q 'exec /data/UserData/schwung/schwung-entry.sh' <(code "$LAUNCH")
check "...guarded on the boot door, so the Tools door still returns normally" \
      grep -q 'if \[ "\$_dbx_entry" = boot \]; then' <(code "$LAUNCH")
# ⚠ exec does not return on success, so every line after one is a FALLBACK for
# a missing file — never a retry. Two of them, ending at bare MoveOriginal, so
# the device always gets something rather than a dialog and a dead panel.
check "...with fallbacks if that file is missing (selector, then bare Move)" \
      bash -c "grep -c 'exec /opt/move/Move' <(sed -e 's/[[:space:]]*#.*$//' '$LAUNCH') | grep -qE '^[12]$'"
check "the onward exec logs where it went (its stdout is not journalled here)" \
      grep -q 'boot exit: handing the pid on' <(code "$LAUNCH")
# It has to be in the OUTER script: the setsid body is a different pid, and
# exec-ing there would leave the supervised one to exit anyway.
if code "$LAUNCH" | awk "/^setsid --wait/,/^' dbx-launch /" | grep -q 'exec /opt/move/Move'; then
    bad "the exec is INSIDE the setsid body — that is the wrong pid; MoveLauncher watches the outer one"
else
    ok "...and it is in the OUTER script, the pid MoveLauncher actually watches"
fi
check "the Tools door still exits with the body's status" \
      grep -q 'exit "\$_body_rc"' <(code "$LAUNCH")
# The dead ends, pinned so they are not re-tried: both were deployed and both failed.
if code "$LAUNCH" | grep -q 'exiting NON-ZERO'; then
    bad "the non-zero boot exit is back — it restarts the unit AND shows the crash dialog"
else
    ok "the non-zero-exit dead end is gone"
fi
if code "$LAUNCH" | grep -q 'setsid nohup sh -c'; then
    bad "the detached systemctl-start helper is back — it did not stop the dialog either"
else
    ok "the detached-restart dead end is gone"
fi
if code "$LAUNCH" | grep -q 'rm -f /data/UserData/boot-targets/davebox/healthy'; then
    bad "the exit path clears the healthy marker — that re-arms the watchdog against a working target"
else
    ok "it does not clear the healthy marker on a normal quit"
fi

# ---- the contract's own rules ----------------------------------------------
# boot.json is read by an awk/C parser that takes the FIRST occurrence of a key
# and requires a QUOTED value; an unquoted exec reads back empty and the row is
# silently skipped.
check "boot.json quotes its exec value (an unquoted one parses as empty)" \
      grep -qE '"exec"[[:space:]]*:[[:space:]]*"/' "$BOOTJSON"
check "boot.json's exec points at the INSTALLED entry.sh, not the repo copy" \
      grep -qF '"/data/UserData/boot-targets/davebox/entry.sh"' "$BOOTJSON"
check "boot.json declares a name for the picker row" \
      grep -qE '"name"[[:space:]]*:[[:space:]]*"' "$BOOTJSON"
# One "exec" only — a second occurrence above the real one would shadow it.
n_exec=$(grep -c '"exec"' "$BOOTJSON" || true)
check "exactly one \"exec\" key (the parser takes the first it finds)" \
      test "$n_exec" -eq 1

# ---- degrade on an old stock ------------------------------------------------
check "an old stock (no registry) SKIPS rather than failing the install" \
      grep -q 'exit 0' "$INSTALL"
check "...and says the Tools door still works" \
      grep -qi 'Tools-menu' "$INSTALL"

# ---- the scripts must at least parse ---------------------------------------
for f in "$ENTRY" "$INSTALL"; do
    check "$f parses" bash -n "$f"
done
python3 -c "import json,sys; json.load(open('$BOOTJSON'))" 2>/dev/null &&
    ok "boot.json is valid JSON" || bad "boot.json is not valid JSON"

# ---- CONTROLS: prove the checks above can actually FAIL ---------------------
# ⚠ Two of these checks are "X is absent", which passes just as well when the
# test is looking in the wrong place or the file moved. And this very test
# already reported three failures against a correct tree by matching comments,
# so "it went green" is not on its own evidence of anything. Run the same
# predicates over deliberately-wrong text and require them to fire.
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# A bypass of unit() must be caught.
sed 's|^  unit() {$|  unit() { :; }\n  DUMMY() {|' "$LAUNCH" > "$tmp/launch_bypass.sh"
printf '  $HEAL --pause-launcher\n' >> "$tmp/launch_bypass.sh"
if code "$tmp/launch_bypass.sh" | grep -n 'HEAL --pause-launcher\|HEAL --resume-launcher' |
   grep -v '\$HEAL "\$@"' | grep -q .; then
    ok "control: a bare HEAL pause/resume IS detected"
else
    bad "control: the bypass check cannot fire — it is proving nothing"
fi

# The export leak must be caught — the bug that split the device.
printf '%s\n' 'export DBX_ENTRY=boot' > "$tmp/launch_exports.sh"
if code "$tmp/launch_exports.sh" | grep -qE '^\s*export DBX_ENTRY'; then
    ok "control: an exported DBX_ENTRY IS detected"
else
    bad "control: the export check cannot fire — the leak that split the device is unguarded"
fi

# A forked entry.sh must be caught — and a COMMENT mentioning setsid must not.
printf '#!/bin/bash\n# this comment mentions setsid and LD_PRELOAD\nexec /bin/true\n' > "$tmp/entry_ok.sh"
printf '#!/bin/bash\nsetsid --wait bash -c "true"\n' > "$tmp/entry_forked.sh"
if grep -q 'setsid' <(code "$tmp/entry_forked.sh"); then
    ok "control: an entry.sh that RUNS setsid is detected"
else
    bad "control: the fork check cannot fire"
fi
if grep -q 'setsid' <(code "$tmp/entry_ok.sh"); then
    bad "control: a comment mentioning setsid is still counted — code() is not stripping"
else
    ok "control: a COMMENT mentioning setsid is correctly ignored (the bug this test had)"
fi

# An installer that takes the boot must be caught.
printf '%s\n' 'say "--- registering dAVEBOx as a boot target"' \
               'echo davebox > "$BOOT_ROOT/default"' > "$tmp/install_steals.sh"
steal_half=$(code "$tmp/install_steals.sh" | awk '/--- registering dAVEBOx as a boot target/,0')
if printf '%s\n' "$steal_half" |
   grep -qE '(>[[:space:]]*.{0,20}/default|(mv|cp|ln)[^|]*/default)([^.]|$)'; then
    ok "control: an installer writing boot-targets/default IS detected"
else
    bad "control: the default-write check cannot fire — the most important check is inert"
fi
# ...and a line that merely REPORTS the default must NOT trip it.
printf '%s\n' 'say "--- registering dAVEBOx as a boot target"' \
               'say "boot default is $_default — UNCHANGED by this install"' > "$tmp/install_reports.sh"
report_half=$(code "$tmp/install_reports.sh" | awk '/--- registering dAVEBOx as a boot target/,0')
if printf '%s\n' "$report_half" |
   grep -qE '(>[[:space:]]*.{0,20}/default|(mv|cp|ln)[^|]*/default)([^.]|$)'; then
    bad "control: a line that only REPORTS the default trips the check — it cries wolf"
else
    ok "control: reporting the default is not mistaken for writing it"
fi

[ "$fails" = 0 ] && echo "PASS: test_boot_target_second_door" || echo "FAIL: test_boot_target_second_door" >&2
exit "$fails"
