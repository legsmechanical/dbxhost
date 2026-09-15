#!/usr/bin/env python3
"""Print the TID of the thread that will CONSUME a SIGTERM for a process.

Why this exists: MoveOriginal handles SIGTERM on ONE dedicated thread, which
sits in rt_sigtimedwait() with an empty blocked-signal mask (comm
"MoveOriginal"; measured 2026-09-15 on Move 2.0.5b1, aarch64 — it is the only
thread of the process whose SigBlk is 0, every other thread carrying
SigBlk 0x4202). A PROCESS-directed `kill -TERM` is delivered to an arbitrary
thread that has SIGTERM unblocked, and in the STOCK stack the shim's own helper
threads are unblocked (upstream bug) — their crash handler _exit()s, so Move's
orderly shutdown runs only by luck. A THREAD-directed SIGTERM (tgkill) aimed at
the sigtimedwait thread is always consumed by that thread, and the orderly
shutdown QUIESCES THE AUDIO HARDWARE, which is the whole point: a SIGSTOPped
then SIGKILLed Move leaves the codec driverless and it can burst (captured
2026-09-15, -3 dBFS for ~1.5 s across the handoff gap).

Selection, in order of preference:

  1. SigBlk == 0 in /proc/<pid>/task/<tid>/status. This is the load-bearing
     rule and the only one that works as an unprivileged user: `status` is
     world-readable, while `syscall` and `wchan` are gated on PTRACE_MODE_READ
     and read as "0" / "0x0" for another user's process. The launcher runs as
     `ableton`; MoveOriginal runs as root. So SigBlk is the rule, not a hint.
  2. Among several zero-mask threads — which IS the stock case: the stock
     shim's helper threads are unblocked too (measured 2026-09-15: six
     zero-mask threads in stock's MoveOriginal, five of them shim loggers /
     the shim worker) — take the HIGHEST zero-mask tid that is still below
     the first thread whose comm differs from the process's (Move names its
     threads right after creating the signal thread; the shim's constructor
     threads precede it, its lazy threads follow the named ones). Verified
     on both hosts: ours 7748 < "sentry-http" 7749; stock 8843 < 8850.
     Positive sigtimedwait evidence (syscall 137 / wchan), when readable,
     wins outright.
  3. If NO thread has a zero mask, fall back to evidence alone (syscall/wchan),
     which is what a root caller would get for free.

Prints one TID and exits 0, or prints nothing and exits 1 — "no signal thread
found" is a normal answer (a Move that has already begun dying), and the caller
is expected to fall back to the freeze-and-kill path rather than fail.

`--proc-root DIR` points the walk at a fake /proc tree; tests/host/
test_quiesce_graceful.sh builds one, because this picker is the load-bearing
part and a shell-level source pin cannot exercise it.
"""

import os
import sys

AARCH64_RT_SIGTIMEDWAIT = 137


def _read(path):
    try:
        with open(path, "r") as f:
            return f.read()
    except OSError:
        return ""


def _sigblk(status_text):
    """The SigBlk mask as an int, or None if the field is absent/unparsable."""
    for line in status_text.splitlines():
        if line.startswith("SigBlk:"):
            try:
                return int(line.split(":", 1)[1].strip(), 16)
            except ValueError:
                return None
    return None


def _in_sigtimedwait(taskdir):
    """True when /proc evidence says this thread is parked in rt_sigtimedwait.

    Both files are PTRACE_MODE_READ-gated, so for an unprivileged caller this
    is simply always False — hence a preference, never a requirement.
    """
    syscall = _read(os.path.join(taskdir, "syscall")).strip()
    if syscall and syscall.split()[0] == str(AARCH64_RT_SIGTIMEDWAIT):
        return True
    wchan = _read(os.path.join(taskdir, "wchan")).strip()
    return "sigtimedwait" in wchan


def pick(pid, proc_root="/proc"):
    """Return the TID (int) to aim the SIGTERM at, or None."""
    procdir = os.path.join(proc_root, str(pid))
    taskroot = os.path.join(procdir, "task")
    try:
        tids = sorted(int(t) for t in os.listdir(taskroot) if t.isdigit())
    except OSError:
        return None

    pcomm = _read(os.path.join(procdir, "comm")).strip()

    # Pass 1: every thread's mask, comm, and (root only) sigtimedwait evidence.
    rows = []
    for tid in tids:
        taskdir = os.path.join(taskroot, str(tid))
        blk = _sigblk(_read(os.path.join(taskdir, "status")))
        comm = _read(os.path.join(taskdir, "comm")).strip()
        rows.append((tid, blk, comm, _in_sigtimedwait(taskdir)))

    # Root-grade evidence wins outright: a thread parked in rt_sigtimedwait.
    for tid, blk, comm, waiting in rows:
        if waiting:
            return tid

    # Unprivileged rule. Measured 2026-09-15 on TWO live hosts (ours: signal
    # thread 7748, stock 1.4.0: 8843): the shim's constructor threads are
    # created at library load, BEFORE Move's main() runs, so they carry LOWER
    # tids than the signal thread; Move creates its signal thread and then
    # immediately names its next threads ("sentry-http", "Link Main", ...);
    # the shim's remaining threads are created lazily on the first SPI frame,
    # AFTER those. So the signal thread is the HIGHEST zero-mask thread that
    # still sits below the first thread whose comm differs from the
    # process's. On stock the naive "lowest zero-mask tid" would have picked a
    # shim logger asleep in nanosleep (8836) — that tgkill would land in the
    # stock shim's crash handler and _exit(), i.e. today's abrupt exit.
    named = [tid for tid, blk, comm, w in rows if pcomm and comm and comm != pcomm]
    ceiling = min(named) if named else None
    zero = [tid for tid, blk, comm, w in rows if blk == 0]
    below = [tid for tid in zero if ceiling is None or tid < ceiling]
    if below:
        return max(below)
    if zero:
        return max(zero)
    return None


def main(argv):
    proc_root = "/proc"
    args = []
    i = 1
    while i < len(argv):
        if argv[i] == "--proc-root":
            i += 1
            if i >= len(argv):
                return 2
            proc_root = argv[i]
        else:
            args.append(argv[i])
        i += 1
    if len(args) != 1 or not args[0].isdigit():
        sys.stderr.write("usage: pick-signal-thread.py PID [--proc-root DIR]\n")
        return 2
    tid = pick(int(args[0]), proc_root)
    if tid is None:
        return 1
    print(tid)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
