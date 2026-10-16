"""take.py — one tutorial video, start to finish: a fresh session on the demo
project, the storyboard's PRE, the take, the render.

  python3 take.py storyboards/01_getting_around.py out/01_getting_around.mp4

Fresh every time, so every take starts in the same state: the dAVEBOx session
is ended (exit-to-stock.sh) and relaunched, the test daemon restarted after it
(it must start after the session), and the demo project loaded from the picker
with Shift + its pad (pad = 68 + its index in projects.json). The take refuses
to go on unless the session's library then carries the demo's name.
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "pytest-schwung", "src"))
from schwung_bus.client import SchwungBus      # noqa: E402
import director                                # noqa: E402
import render                                  # noqa: E402

HOST = os.environ.get("MOVE_HOST", "move.local")
DEMO_NAME = "dAVEBOx Tutorial"
PRISTINE = "/data/UserData/tutorial-demo-pristine"   # a copy of the demo project's folder


# The tether (MOVE_HOST=172.16.254.1) gets the same host-key handling as the
# user's own ssh config gives move.local — the Move's keys change with its
# firmware, so neither keeps one on file.
SSH_OPTS = ["-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR"]


def ssh(cmd, timeout=60):
    return subprocess.run(["ssh"] + SSH_OPTS + ["ableton@" + HOST, cmd],
                          capture_output=True, text=True, timeout=timeout).stdout


def fresh_session(load=True):
    ssh("sh /data/UserData/dbx-host/scripts/exit-to-stock.sh >/dev/null 2>&1", timeout=120)
    while ssh("ls /dev/shm | grep -c dbxhost").strip() not in ("0", ""):
        time.sleep(2)
    projects = json.loads(ssh("cat /data/UserData/dbx-host/projects.json"))["projects"]
    demo = [p for p in projects if p["name"] == DEMO_NAME]
    if len(demo) != 1:
        raise RuntimeError("the demo project %r is not (once) in projects.json" % DEMO_NAME)
    pad = 68 + demo[0]["index"]
    # Every take starts from the same project: the pristine copy (made by hand,
    # with the session ended) replaces whatever the last take left behind.
    proj = "/data/UserData/dbx-host/projects/" + demo[0]["uuid"]
    out = ssh("test -d %s/dAVEBOx && rm -rf %s && cp -a %s %s && echo restored"
              % (PRISTINE, proj, PRISTINE, proj))
    if "restored" not in out:
        raise RuntimeError("could not restore the demo project from " + PRISTINE)
    ssh("pkill -x schwung-testd; nohup setsid /data/UserData/schwung/modules/tools/davebox-sa/standalone "
        "> /data/UserData/launch.out 2>&1 < /dev/null &")
    while ssh("ls /dev/shm | grep -c dbxhost").strip() in ("0", ""):
        time.sleep(2)
    ssh("pidof schwung-testd >/dev/null || (nohup setsid /data/UserData/dbx-host/bin/schwung-testd "
        "> /data/UserData/testd.log 2>&1 < /dev/null &)")
    time.sleep(2)
    subprocess.run("pkill -f '47777:127.0.0.1:47777'; ssh -f -N -o ExitOnForwardFailure=yes " + " ".join(SSH_OPTS) + " "
                   "-L 47777:127.0.0.1:47777 ableton@" + HOST, shell=True)
    time.sleep(1)
    with SchwungBus() as bus:
        for _ in range(120):
            if bus.state().overtake_mode == 2:
                break
            time.sleep(1)
        bus.set_display_mirror(True)
        bus.wait_frame(600)
        if not load:                                  # the take starts on the picker
            print("on the picker"); return
        bus.inject_midi(bytes([0x0B, 0xB0, 49, 127])); bus.wait_frame(20)      # Shift + the demo's pad
        bus.inject_midi(bytes([0x09, 0x90, pad, 100])); bus.wait_frame(20)
        bus.inject_midi(bytes([0x08, 0x80, pad, 0])); bus.wait_frame(20)
        bus.inject_midi(bytes([0x0B, 0xB0, 49, 0]))
        bus.wait_frame(1500)
    for _ in range(60):
        names = ssh("cat /data/UserData/UserLibrary/Sets/*/dAVEBOx/name.txt 2>/dev/null").split("\n")
        if DEMO_NAME in names:
            break
        time.sleep(2)
    else:
        raise RuntimeError("the session did not load %r (library names: %r)" % (DEMO_NAME, names))
    time.sleep(3)
    print("loaded", DEMO_NAME)


def main(storyboard, out_mp4, take_dir=None, fresh=True):
    take_dir = take_dir or os.path.join(HERE, "takes", os.path.splitext(os.path.basename(out_mp4))[0])
    for attempt in range(1, 4):
        if fresh:
            fresh_session(load=getattr(director.load_storyboard(storyboard), "LOAD_DEMO", True))
        try:
            director.record_take(storyboard, take_dir, host=HOST)
            break
        except director.TakeFailed as e:
            print("take %d failed: %s" % (attempt, e))
            if not fresh or attempt == 3:
                raise
    os.makedirs(os.path.dirname(os.path.abspath(out_mp4)), exist_ok=True)
    render.render(take_dir, out_mp4)
    print("wrote", out_mp4)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], fresh="--no-fresh" not in sys.argv)
