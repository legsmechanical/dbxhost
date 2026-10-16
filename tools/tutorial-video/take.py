"""take.py — one tutorial video, start to finish: a fresh session on the demo
project, the storyboard's PRE, the take, the render.

  python3 take.py storyboards/01_getting_around.py out/01_getting_around.mp4

Fresh every time, so every take starts in the same state: the dAVEBOx session
is ended (exit-to-stock.sh) and relaunched, the test daemon restarted after it
(it must start after the session), and the picker's selected project — the
current one, which must be the demo project — loaded with a jog click.
"""
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


def ssh(cmd, timeout=60):
    return subprocess.run(["ssh", "-o", "ConnectTimeout=8", "ableton@" + HOST, cmd],
                          capture_output=True, text=True, timeout=timeout).stdout


def fresh_session():
    ssh("sh /data/UserData/dbx-host/scripts/exit-to-stock.sh >/dev/null 2>&1", timeout=120)
    while ssh("ls /dev/shm | grep -c dbxhost").strip() not in ("0", ""):
        time.sleep(2)
    cur = ssh("cat /data/UserData/dbx-host/projects.json")
    if DEMO_NAME not in cur:
        raise RuntimeError("the demo project %r is not in projects.json" % DEMO_NAME)
    ssh("pkill -x schwung-testd; nohup setsid /data/UserData/schwung/modules/tools/davebox-sa/standalone "
        "> /data/UserData/launch.out 2>&1 < /dev/null &")
    while ssh("ls /dev/shm | grep -c dbxhost").strip() in ("0", ""):
        time.sleep(2)
    ssh("pidof schwung-testd >/dev/null || (nohup setsid /data/UserData/dbx-host/bin/schwung-testd "
        "> /data/UserData/testd.log 2>&1 < /dev/null &)")
    time.sleep(2)
    subprocess.run("pkill -f '47777:127.0.0.1:47777'; ssh -f -N -o ExitOnForwardFailure=yes "
                   "-L 47777:127.0.0.1:47777 ableton@" + HOST, shell=True)
    time.sleep(1)
    with SchwungBus() as bus:
        for _ in range(120):
            if bus.state().overtake_mode == 2:
                break
            time.sleep(1)
        bus.set_display_mirror(True)
        bus.wait_frame(600)
        bus.inject_midi(bytes([0x0B, 0xB0, 3, 127])); bus.wait_frame(20)
        bus.inject_midi(bytes([0x0B, 0xB0, 3, 0]))
        bus.wait_frame(1500)
        name = ssh("cat /data/UserData/UserLibrary/Sets/*/dAVEBOx/name.txt 2>/dev/null")
        print("loaded; library names:", name.replace("\n", " | "))


def main(storyboard, out_mp4, take_dir=None, fresh=True):
    take_dir = take_dir or os.path.join(HERE, "takes", os.path.splitext(os.path.basename(out_mp4))[0])
    if fresh:
        fresh_session()
    director.record_take(storyboard, take_dir, host=HOST)
    os.makedirs(os.path.dirname(os.path.abspath(out_mp4)), exist_ok=True)
    render.render(take_dir, out_mp4)
    print("wrote", out_mp4)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], fresh="--no-fresh" not in sys.argv)
