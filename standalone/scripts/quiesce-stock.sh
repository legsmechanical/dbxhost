#!/bin/sh
# Quiesce the running (stock) Schwung before we tear the stack down to start
# the davebox host: mute the mix, paint our splash over its display, ask its
# own Live Set to save over D-Bus, then take it down (gracefully if we can).
#
# ⭑ should_exit is OFF BY DEFAULT as of 2026-09-15 — read this before turning
# it back on. It used to be step one of every launch: set byte 2 of the
# control SHM and wait for shadow_ui to see it, run shadow_save_state_now()
# (autosaveAllSlots + saveMasterFxChainConfig + saveChainConfigToDir) and
# exit. That save is real — shadow_ui registers only atexit(remove_pid), and
# neither it nor the shim handles SIGTERM, so nothing else flushes host state
# on the way out. But should_exit is also what TRIGGERS the remaining launch
# burst: stock's shim respawns a fresh shadow_ui within <=743 ms of the exit
# (its watchdog has no should_exit guard), the fresh UI reloads every chain
# slot UN-faded, and reloading osirus boots its emulator child whose first
# 4096 frames bypass gain and resampling at +3 dB — captured as a -4 dBFS
# 1.5 s burst on every launch with an osirus patch feeding the reverb, silent
# without one. A stock-only control (osirus loaded, NO should_exit sent,
# thread-directed SIGTERM straight to Move's signal thread) was SILENT — the
# respawn storm is should_exit's doing, not the exit itself.
#
# What should_exit buys, and what we give up by defaulting it off: stock
# autosaves the chain state on its own every ~5 s (the `synth:state` GET seen
# every 5 s in its log), gated on !isOvertakeActive — so the exposure is at
# most the last ~5 s of chain edits (or, launched from inside an overtake
# tool, whatever that tool has touched since it opened). That is the accepted
# trade for a launch with no audible burst. Move's own Live Set is unaffected
# either way — save_song() below asks for that over D-Bus regardless.
#
# The knob (ask_ui_exit_enabled, below) puts the old should_exit-and-wait step
# back for A/B: DBX_QUIESCE_ASK_UI_EXIT=1, or
# touch /data/UserData/dbx-host/quiesce-ask-ui-exit. Default OFF.
#
# Deliberately best-effort throughout: if the SHM is missing, or shadow_ui/
# Move ignore us, we return anyway and the caller proceeds to its kill
# sequence. Refusing to launch because a save might not have completed would
# be a worse trade than launching.
#
# Lives in its own file, rather than inline in launch.sh, because that script
# body is a single-quoted `setsid bash -c` argument where one apostrophe breaks
# everything after it — silently, since it runs detached.

CONTROL=/dev/shm/schwung-control

# Every line carries a wall-clock stamp: launch.log has none of its own, and
# the 2026-08-23 "three clicks to launch" hunt had to reconstruct this script's
# timeline from stock's debug.log. Never again.
say() {
    t=$(date '+%H:%M:%S.%N' 2>/dev/null | cut -c1-12)
    case "$t" in *N*) t=${t%.*} ;; esac      # a date without %N (BSD) prints the literal
    echo "$t quiesce: $*"
}

# Freeze Move once we're done with it (freeze_move is called below, on every
# route that does not manage a graceful Move exit instead). Once shadow_ui
# stops ticking, the shim stops compositing and native Move would repaint the
# OLED and the pads (its set picker, at full brightness) for the second or two
# until the kill sweep lands; SIGSTOP means it cannot push a single frame —
# the panel and LEDs retain the stock menu straight through to the standalone
# splash. The stopped process ignores the sweep's SIGTERM but not its
# SIGKILL, which is what actually takes it down.
# ⚠ The freeze MUST NOT run while a should_exit-triggered save is still in
# flight: the shim inside MoveOriginal serves the shared-memory param bus
# shadow_ui blocks on, so a frozen Move mid-save deadlocks shadow_ui and the
# SIGKILL then eats the unsaved state (observed on hardware 2026-08-15, first
# launch after this order was briefly inverted). That constraint is why the
# should_exit knob (below) keeps its own wait-for-exit loop before freezing.
# It is NOT a constraint on the no-should_exit default path: there, shadow_ui
# was never asked to save, so there is no in-flight save to catch mid-write —
# freezing (or a graceful Move exit) with shadow_ui simply still running is
# the same shape as the old post-timeout fallback, which has run this way for
# months whenever shadow_ui was slow to react.
# paint_splash() used to paint the dAVEBOx splash (a rotating Dave portrait,
# Josh 2026-08-24: "no indication that it's loading") into the STOCK shadow
# display before freezing, so the frozen frame the panel retained through the
# whole entry gap was the splash, and the standalone host's own boot splash
# then replaced it with the TEXT screen (wordmark + Schwung base version).
# ⭑⭑ 2026-09-15 (Josh: "get rid of the 'daves' splash on launch (b/c it
# flickers for just a split second before 'move terminated' shows)"): that
# painted frame is no longer RETAINED through the gap — the graceful stock-
# Move exit below now repaints "Move terminated" over it within a frame or
# two, so the Dave read as a flicker, not a hold, and disappeared before it
# said anything. paint_splash() now only blanks the LEDs and leaves stock's
# own frame on screen; see the comment inside it for the full reasoning
# (including why this also satisfies "Dave only on project load", DBX-014).
# Every LED dark, as early as the surface can be written (Josh, 2026-08-24:
# "as early as possible when davebox is selected from stock tool menu") is
# the part of this that still applies.
#
# ⚠⚠ The shim boot LED-strip is NOT enough on its own, and a first attempt that
# relied on it shipped without darkening anything: stripping stops Move
# REPAINTING, but an LED holds its last physically-written value and the freeze
# below catches a lit Tools menu. Only a write turns a pad off.
#
# blank-leds.py reaches the pads through the same shadow-UI MIDI-out ring the
# old pad ticker used — which is why this works this early in the launch, and
# was the lead Josh gave when the first attempt failed.
# ⚠⚠ ABSOLUTE PATH, like everything else in this file. The first version used
# "$DBX_DIR/scripts/..." — and DBX_DIR is never DEFINED here (this script is run
# as `sh quiesce-stock.sh`, not sourced from the launcher). It expanded to
# empty, the -x test failed, and the function returned 0 in silence: the whole
# feature shipped, twice, doing nothing. A guard that skips quietly on a
# misspelled path is indistinguishable from a feature that ran.
BLANK_LEDS=/data/UserData/dbx-host/scripts/blank-leds.py
blank_leds() {
    if [ ! -x "$BLANK_LEDS" ]; then
        say "WARNING: $BLANK_LEDS missing — LEDs will hold the stock menu"
        return 0
    fi
    python3 "$BLANK_LEDS" --shm /dev/shm/schwung-midi-out >/dev/null 2>&1 \
        && say "LEDs blanked (stock ring)" \
        || say "WARNING: LED blank failed"
    return 0
}

paint_splash() {
    # ⭑ Here rather than at the call sites: every path that reaches the freeze
    # paints, and freeze_move paints again after the save, so one insertion
    # covers all four routes and a new one inherits it. Writing dark twice is
    # dark — the repeat also re-asserts after the save.
    blank_leds
    # ⭑⭑ NO DAVE ON THIS PATH (Josh, 2026-09-15: "get rid of the 'daves'
    # splash on launch (b/c it flickers for just a split second before 'move
    # terminated' shows)"). This function used to deal a Dave here (via
    # pick-splash.py) and paint it straight into STOCK's display, on the
    # theory that the frame would be RETAINED — either by the freeze below,
    # or (before that existed) simply by nothing else drawing again. Tonight's
    # graceful-exit change broke that theory: stock's own Move now shuts
    # itself down ORDERLY and repaints "Move terminated" over whatever we just
    # painted, within a frame or two of the handoff. The Dave was on screen
    # for a flicker and then replaced by something WORSE than the Tools menu
    # it used to hold — not "instead of a hang", an extra flash on top of one.
    # This also lines up with the standing board item (DBX-014, Josh: "Unwrap
    # a Dave only when loading a project, not on launch from tools menu") —
    # this whole script runs ONLY on that cold Tools-menu / boot-selector-
    # while-stock-was-alive entry (launch.sh calls it exactly once, before the
    # session's own supervisor loop even starts); an in-session project-load
    # relaunch never calls back into this script — see
    # standalone/scripts/launch.sh's "relaunch requested" branch, which
    # restarts Move directly and never touches quiesce-stock.sh at all. So "no
    # Dave dealt here" already IS "no Dave on a Tools-menu launch", with
    # nothing further to gate.
    #
    # So: no pick-splash.py call, nothing painted into stock's display, and
    # nothing recorded into daves-seen.txt (the Dave Box album stays accurate
    # — it must record only Daves that were genuinely SHOWN, and this path no
    # longer shows one). We deliberately leave stock's own frame up rather
    # than painting a placeholder of ours — simpler, and "get rid of it" is
    # Josh's own instruction.
    [ -e /dev/shm/schwung-display ] || return 0
    # ⭑ THE STAGE-1 HANDOFF (2026-08-31, revised 2026-09-15). The standalone
    # host's own boot splash (ensureCustomSplash, shadow_ui.js) still needs
    # telling that "stage 1" already happened on this launch — without that it
    # cannot tell a cold Tools-menu entry (this script) from an in-session
    # project-load relaunch (which never runs this script, and where dealing
    # its OWN Dave is exactly the DBX-014 behaviour we want to keep). Since we
    # no longer paint any artwork, the marker now carries a "skip" pick rather
    # than a real splash-N.hex path: the host reads its mere PRESENCE (and
    # freshness) as "stage 1 is decided — go straight to the text screen, deal
    # nothing", not as "here is the face that was shown". Timestamped so a
    # stale marker from a crashed launch cannot suppress the host's own Dave
    # forever; the host ignores one older than 120 s.
    printf '%s skip\n' "$(date +%s)" \
        > /data/UserData/dbx-host/splash-stage1.txt 2>/dev/null \
        && say "stage-1 marker written (no Dave on tools launch)"
}

# ⭑ THE GRACEFUL EXIT (2026-09-15). Freezing and then SIGKILLing Move leaves the
# audio hardware DRIVERLESS: captured 20:59:55 that night, a -3 dBFS burst began
# exactly at launch.sh's kill sweep and ran until our Move's first frames landed
# (~1.5 s). Another launch with the identical sequence was silent — the codec is
# simply not deterministic when nobody is feeding it. A Move that SHUTS DOWN
# ORDERLY quiesces it on the way out (verified on our own host the same night,
# with the thread-mask fix: a graceful exit left the line output silent across
# the whole gap).
#
# Getting that orderly shutdown is not `kill -TERM $pid`. MoveOriginal handles
# SIGTERM on ONE dedicated thread parked in rt_sigtimedwait — the only thread of
# the process with SigBlk == 0 (every other carries 0x4202). A process-directed
# signal goes to ANY thread with SIGTERM unblocked, and in the STOCK stack the
# shim's helper threads are unblocked (an upstream bug this fork has since
# fixed) and their crash handler _exit()s — so "SignalManager: Received signal
# 15 -> Terminating Move" has been running by luck. A THREAD-directed SIGTERM
# (tgkill) to the sigtimedwait thread is always consumed by that thread.
#
# ⚠ THE shadow_ui_live GATE APPLIES ONLY WHEN should_exit WAS SENT. It exists
# for the should_exit knob's wait-timeout route: should_exit asks shadow_ui to
# SAVE, and a Move that exits while that save is still in flight takes the
# param bus down mid-write exactly like a freeze would. Without should_exit —
# the 2026-09-15 default — shadow_ui was never asked to save, so there is no
# in-flight write to protect: the stock-only control (osirus loaded, no
# should_exit, thread-directed SIGTERM) proved this path works with shadow_ui
# still fully alive. Gating unconditionally on shadow_ui_live would refuse the
# graceful exit on EVERY default-path launch (shadow_ui is always still
# running at this point when should_exit was never sent) and fall through to
# freeze_move every time, silently discarding the whole point of this
# function. $SHOULD_EXIT_SENT is set by the knob branch below, only when
# should_exit was actually written.
# (Stock's shim respawns shadow_ui within <=743 ms of its exit; a graceful Move
# exit takes both down together, which is what we want.)
#
# Returns 0 only when Move is GONE — the caller then skips freeze_move, because
# there is nothing left to freeze. Every other outcome returns 1 and the caller
# falls through to today's freeze-and-let-the-sweep-kill-it path, unchanged.
#
# ⭑ THE KNOB. This changes what the PANEL does at the handoff — a graceful Move
# repaints on its way out, where a frozen one cannot push a frame — so it must
# be switchable off on the device without a redeploy: set
# DBX_QUIESCE_GRACEFUL=0, or `touch` the flag file below. Default ON.
GRACEFUL_OFF_FLAG=/data/UserData/dbx-host/quiesce-graceful-off
# ⚠⚠ ABSOLUTE PATH, for the reason spelled out at BLANK_LEDS above: this script
# runs as `sh quiesce-stock.sh`, nothing is sourced, and a relative path here
# would skip the whole feature in silence.
PICK_SIGNAL_THREAD=/data/UserData/dbx-host/scripts/pick-signal-thread.py

move_live() {
    for p in $(pgrep -x MoveOriginal 2>/dev/null); do
        case "$(cut -d' ' -f3 "/proc/$p/stat" 2>/dev/null)" in
            Z|X|"") ;;            # zombie / dead / vanished between pgrep and read
            *) return 0 ;;
        esac
    done
    return 1
}

graceful_enabled() {
    case "${DBX_QUIESCE_GRACEFUL:-1}" in
        0|no|off|false|NO|OFF|FALSE) return 1 ;;
    esac
    [ -e "$GRACEFUL_OFF_FLAG" ] && return 1
    return 0
}

graceful_move_exit() {
    if ! graceful_enabled; then
        say "graceful exit OFF (DBX_QUIESCE_GRACEFUL / $GRACEFUL_OFF_FLAG) — freezing"
        return 1
    fi
    if [ -n "${SHOULD_EXIT_SENT:-}" ] && shadow_ui_live; then
        say "should_exit was sent and shadow_ui is still live — no graceful exit (param-bus deadlock), freezing"
        return 1
    fi
    # Two MoveOriginal pids exist (parent/child, ~100 apart — e.g. "19827 19735").
    # BOTH get the signal, CHILD FIRST: the child is the higher pid and carries
    # the audio threads, so it is the one whose orderly shutdown quiesces the
    # hardware; the parent is signalled after so it cannot outlive it and be
    # left for the sweep's SIGKILL. `pidof` does not promise an order, so sort.
    pids=$(pidof MoveOriginal 2>/dev/null | tr ' ' '\n' | sort -rn | tr '\n' ' ')
    if [ -z "$(printf '%s' "$pids" | tr -d ' ')" ]; then
        say "no MoveOriginal to exit gracefully"
        return 1
    fi
    if [ ! -f "$PICK_SIGNAL_THREAD" ]; then
        say "WARNING: $PICK_SIGNAL_THREAD missing — freezing instead"
        return 1
    fi

    # Put the splash up and let the shim push it, exactly as freeze_move does,
    # BEFORE the signal: those are the last frames we control. What a shutting-
    # down Move paints over them is for hardware to answer.
    paint_splash
    sleep 0.2

    arch=$(uname -m 2>/dev/null || echo unknown)
    sent=0
    for p in $pids; do
        # SigBlk is world-readable; /proc/<tid>/syscall and wchan are not (we run
        # as `ableton`, Move runs as root), which is why the picker leads with
        # the mask. No zero-mask thread -> we do NOT guess: skip to the freeze.
        tid=$(python3 "$PICK_SIGNAL_THREAD" "$p" 2>/dev/null || true)
        if [ -z "$tid" ]; then
            say "pid $p: no SigBlk==0 signal thread — not signalling"
            continue
        fi
        if [ "$arch" = "aarch64" ]; then
            if python3 - "$p" "$tid" <<'PY'
import ctypes, sys
libc = ctypes.CDLL("libc.so.6", use_errno=True)
# ⚠ syscall() is VARIADIC and takes longs. ctypes would otherwise pass 32-bit
# ints and leave the top half of each 64-bit register undefined on aarch64.
libc.syscall.restype = ctypes.c_long
libc.syscall.argtypes = [ctypes.c_long] * 4
# aarch64 tgkill = 131. Thread-directed, so the rt_sigtimedwait thread — and
# not some unblocked shim helper — is the one that consumes SIGTERM (15).
sys.exit(0 if libc.syscall(131, int(sys.argv[1]), int(sys.argv[2]), 15) == 0 else 1)
PY
            then
                say "pid $p: SIGTERM -> tid $tid (tgkill 131)"
                sent=$((sent + 1))
            else
                say "pid $p: tgkill to tid $tid FAILED"
            fi
        else
            # Not the device. Nothing here is portable, so degrade to the
            # process-directed signal rather than aiming a wrong syscall number.
            kill -TERM "$p" 2>/dev/null \
                && { say "pid $p: arch $arch, process-directed SIGTERM"; sent=$((sent + 1)); }
        fi
    done
    if [ "$sent" -eq 0 ]; then
        say "no SIGTERM delivered — freezing"
        return 1
    fi

    # Up to 3 s, polled every 100 ms. "Gone" must mean GONE and not ZOMBIE, for
    # the same reason shadow_ui_live() reads /proc/<pid>/stat: we signal the
    # child first, and a child that has exited stays listed by pgrep until its
    # parent — which is itself shutting down — reaps it.
    i=0
    while [ "$i" -lt 30 ]; do
        if ! move_live; then
            say "stock Move exited gracefully after $((i * 100)) ms"
            # Re-assert the splash/LEDs over whatever Move painted on its way
            # out. Best-effort by construction: with the shim gone nothing is
            # compositing the display SHM any more, so this is the one part of
            # the visual handoff the freeze path gave us for free and this path
            # cannot guarantee. Josh judges the result on the device.
            paint_splash
            return 0
        fi
        sleep 0.1
        i=$((i + 1))
    done
    say "no graceful exit after 3 s — freezing"
    return 1
}

freeze_move() {
    paint_splash
    # A few SPI frames (~3 ms each) so the shim pushes the new frame to the
    # panel before Move stops producing frames at all.
    sleep 0.2
    pids=$(pidof MoveOriginal 2>/dev/null || true)
    if [ -n "$pids" ]; then
        kill -STOP $pids 2>/dev/null && say "MoveOriginal frozen ($pids)"
    fi
}

# Move's own song save, asked over D-Bus. Best-effort; it matters because the
# library swap moves the native set directories, so unsaved musical edits must
# reach disk before the stack dies.
# ⚠ Ordered AFTER shadow_ui's exit and the splash, on purpose. It used to run
# FIRST, and with a 4 s reply timeout that was the first of two stalls behind
# "dAVEBOx needs three clicks" (Josh, 2026-08-23): stock's Tools menu stayed
# fully live for those seconds — jog, click, launch again (refused by the lock)
# — with nothing on screen to say the first click had taken. The call is
# independent of shadow_ui (it is Move's save, not the host's), so nothing is
# lost by letting the user see the splash first. The stale claim that stock
# "is already gone by now" dates from before launch-standalone.sh stopped
# pre-killing it (2026-08-15); Move is alive here, and this runs every launch.
save_song() {
    pgrep -x MoveOriginal >/dev/null 2>&1 || return 0

    # ⚠ GATE the save on a fast liveness Ping, and NEVER block long on it.
    # The Move that a Tools-menu launch quiesces is the one the PREVIOUS
    # session left running (launch-standalone.sh restarts it on exit), and that
    # Move can sit not answering com.ableton.move D-Bus at all — NoReply for the
    # full reply-timeout, on every launch, well past its boot (measured
    # 2026-08-23: ~15 ms on a systemd-booted Move, 4008 ms NoReply on the
    # returned one). A freshly booted Move answers at once. So Ping first with a
    # tight ceiling: if it does not answer, the save could not have run anyway
    # and the 4 s wait bought nothing but a frozen-looking launch. (Why the
    # returned Move goes deaf — a second MoveOriginal, an unclean D-Bus name
    # hand-off — is a separate board item; this only stops the stall.)
    _dbus() {  # method, extra-args...  — $1 timeout-ms
        local to="$1"; shift
        dbus-send --system --print-reply --reply-timeout="$to" \
            --dest=com.ableton.move "$@" 2>&1
    }
    t0=$(date +%s%N 2>/dev/null || echo 0)
    # ⭑ Three pings, not one (2026-09-04): the deaf Move is the nohup-restart
    # RACE in stock's own launcher (a second MoveOriginal claiming the D-Bus
    # name first), which resolves within a moment on most launches — measured
    # ~3% of launches skipped the save with a single ping. Two short retries
    # cost nothing on a healthy launch (the first ping answers) and at most
    # ~1.8 s on a deaf one, against the stock edit the save would lose.
    _pings=0
    until _dbus 800 /com/ableton/move/browser org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1; do
        _pings=$((_pings + 1))
        if [ "$_pings" -ge 3 ]; then
            t1=$(date +%s%N 2>/dev/null || echo 0)
            say "saveSongIfDirty SKIPPED — Move not answering D-Bus ($(( (t1 - t0) / 1000000 )) ms, 3 pings)"
            return 0
        fi
        sleep 0.5
    done
    [ "$_pings" -gt 0 ] && say "saveSongIfDirty: Move answered D-Bus on ping $((_pings + 1))"
    out=$(_dbus 4000 /com/ableton/move/browser com.ableton.move.Browser.saveSongIfDirty string:)
    rc=$?
    t1=$(date +%s%N 2>/dev/null || echo 0)
    ms=$(( (t1 - t0) / 1000000 ))
    if [ "$rc" = "0" ]; then
        say "saveSongIfDirty done (${ms} ms)"
    else
        say "saveSongIfDirty FAILED rc=$rc after ${ms} ms: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200)"
    fi
}

# "Still running" must mean RUNNING. Stock's shim reaps shadow_ui only inside
# launch_shadow_ui(), after an early return that fires while it still believes
# the child is up — so the exited shadow_ui sits as a ZOMBIE until MoveOriginal
# dies, and `pgrep -x shadow_ui` keeps listing it. That was the second stall:
# the wait below burned its full 5 s ceiling on EVERY launch ("still running
# after 5s — proceeding anyway" on each header since the order was fixed on
# 08-15). A zombie has saved and gone; treat it as exited.
shadow_ui_live() {
    for p in $(pgrep -x shadow_ui 2>/dev/null); do
        case "$(cut -d' ' -f3 "/proc/$p/stat" 2>/dev/null)" in
            Z|X|"") ;;            # zombie / dead / vanished between pgrep and read
            *) return 0 ;;
        esac
    done
    return 1
}

# ⭑ THE ASK-UI-EXIT KNOB (2026-09-15, A/B against the default above). Puts the
# should_exit request back for comparison: set DBX_QUIESCE_ASK_UI_EXIT=1, or
# touch the flag file below. Default OFF — see the file header for why.
ASK_UI_EXIT_FLAG=/data/UserData/dbx-host/quiesce-ask-ui-exit
# ⚠⚠ ABSOLUTE PATH, for the reason spelled out at BLANK_LEDS above.
ask_ui_exit_enabled() {
    case "${DBX_QUIESCE_ASK_UI_EXIT:-0}" in
        1|yes|on|true|YES|ON|TRUE) return 0 ;;
    esac
    [ -e "$ASK_UI_EXIT_FLAG" ]
}

if [ ! -e "$CONTROL" ]; then
    say "no stock control SHM — nothing to save"
    paint_splash
    save_song
    graceful_move_exit || freeze_move
    exit 0
fi

# [49] mute_move_audio = 1 — FIRST, before anything else touches the stack.
# Despite its name this is the shim's whole-mix hardware mute: the last
# statement of the SPI pre-transfer callback zeroes the audio region of the
# buffer that is about to be copied to the hardware, AFTER Move's audio, the
# chain slots, Master FX and TTS have all been mixed in. Captured 2026-09-15
# (ZOOM line capture, clocks matched): with should_exit still being sent that
# night, a broadband -4 dBFS burst decaying over ~1.4 s began within 10 ms of
# should_exit and ended before our Move started — the exiting UI's autosave
# serves multi-ms `synth:state` GETs on the SPI callback, the late frames tear
# the output, and the stock FX chain rings the tear out. Mute sits downstream
# of all of that, so the tear never leaves the box — and it stays load-bearing
# under the should_exit-off default below, because osirus's own +3 dB
# emulator-warmup burst (see file header) is downstream of the same mute.
# Nothing in stock resets the byte (the shim's init block skips it), and
# launch.sh's teardown removes /dev/shm/schwung-* so stock boots un-muted
# afterwards — if that rm is ever narrowed, clear this byte explicitly on the
# way out. Move's own set goes silent 1-2 s earlier than before; that is the
# trade at a handoff the user just asked for.
#
# Offset is stock v1.4.0's (offsetof, compiled from its header) and happens to
# equal the fork's; the map is the full CONTROL_BUFFER_SIZE, not the 84 bytes
# an older layout had — pinned by tests/host/test_handoff_mute.sh.
say "$(python3 - "$CONTROL" <<'PY'
import mmap, sys, time
try:
    with open(sys.argv[1], "r+b") as f:
        mm = mmap.mmap(f.fileno(), 256)
        mm[49] = 1          # mute_move_audio: whole-mix hardware mute
        mm.flush()
        time.sleep(0.01)    # ~3 SPI frames: the mute lands before anything else
        mm.close()
    print("audio muted")
except Exception as e:
    print("could not set mute: %s" % e)
PY
)"

SHOULD_EXIT_SENT=
if ask_ui_exit_enabled; then
    # The old path: [2] should_exit = 1, then wait for shadow_ui to see it,
    # save (shadow_save_state_now: autosaveAllSlots + saveMasterFxChainConfig
    # + saveChainConfigToDir) and exit — this is what buys the up-to-the-second
    # chain-state save the file header describes, at the cost of the launch
    # burst it also describes. Kept for A/B, not the default.
    SHOULD_EXIT_SENT=1
    say "$(python3 - "$CONTROL" <<'PY'
import mmap, sys
try:
    with open(sys.argv[1], "r+b") as f:
        mm = mmap.mmap(f.fileno(), 256)
        mm[2] = 1           # should_exit
        mm.flush()
        mm.close()
    print("should_exit set (DBX_QUIESCE_ASK_UI_EXIT knob)")
except Exception as e:
    print("could not set should_exit: %s" % e)
PY
)"

    # Wait for shadow_ui to finish saving and go. The save is a handful of
    # small JSON writes (~0.4 s on hardware); the ceiling only exists so a
    # wedged UI cannot stall the launch forever.
    i=0
    while [ "$i" -lt 50 ]; do
        if ! shadow_ui_live; then
            z=""; pgrep -x shadow_ui >/dev/null 2>&1 && z=" (zombie left for stock to reap)"
            say "shadow_ui exited after $((i * 100))ms$z"
            break
        fi
        sleep 0.1
        i=$((i + 1))
    done
    [ "$i" -ge 50 ] && say "shadow_ui still running after 5s — proceeding anyway"
fi

# Default path lands here directly (should_exit never sent, shadow_ui still
# fully alive and un-asked-to-save — see the file header for why that is fine
# to proceed past); the knob path lands here after its own wait above. Either
# way: splash, Move's own Live Set save over D-Bus, then take Move down.
paint_splash
save_song
graceful_move_exit || freeze_move
exit 0
