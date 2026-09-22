# pytest-schwung

Python client + pytest plugin for `schwung-testd`, the on-device test-bus
daemon. Use it to drive end-to-end tests against a real Move from your dev
machine: inject MIDI events, wait for SPI frames to elapse, snapshot pad LED
state.

This first cut ships the daemon, the shim's MIDI_OUT test-stream, and the
client + fixtures. Reversible-UI helpers, display snapshots, and a broader
fixture set build on these primitives and land in follow-ups.

## Architecture in one diagram

```
[ pytest on dev machine ]                  [ Move device ]
      │                                          │
      │  TCP localhost:47777                     │
      │  ◄──── SSH port-forward ──────►          │
      │                                          │
      └─► SchwungBus (this package)              │
              ├─ ping / inject_midi              │  schwung-testd
              ├─ wait_frame / snapshot_pad_leds  │  (C, opt-in)
              └─ press_pad / release_pad         │       │
                                                 │       ▼
                                                 │  /schwung-control     (RO)
                                                 │  /schwung-midi-inject (RW)
                                                 │  /schwung-overlay     (RO)
                                                 │       │
                                                 │       ▼
                                                 │  schwung-shim
                                                 │  (LD_PRELOAD'd into MoveOriginal)
```

The daemon reads the SHM segments `shadow_ui` already uses; the only
shim-side addition is the MIDI_OUT test-stream publisher, which is a single
atomic load + branch per frame when no test client is subscribed.

## Quick start

### 1. Install the daemon on Move

The daemon is built as part of the standard schwung build and shipped in
the tarball at `bin/schwung-testd`:

```sh
./scripts/build.sh
./scripts/install.sh local --skip-modules --skip-confirmation
```

### 2. Start the daemon on Move

The daemon is **opt-in** and not started by `shim-entrypoint.sh`. Run it
manually over SSH:

```sh
ssh ableton@move.local /data/UserData/schwung/bin/schwung-testd
```

You should see:

```
schwung-testd 0.1.0 listening on 127.0.0.1:47777
```

Leave that SSH session open while you run tests.

### 3. Tunnel the port from your dev machine

In a second terminal:

```sh
ssh -L 47777:localhost:47777 ableton@move.local -N
```

Now `localhost:47777` on your dev machine reaches the daemon.

### 4. Install the plugin and run tests

```sh
pip install -e tools/pytest-schwung
pytest tests/e2e -v
```

If the daemon is unreachable, tests are skipped with a helpful message
rather than failing — safe to run in environments without a Move attached.

## Environment variables

| Var | Default | Effect |
| --- | --- | --- |
| `SCHWUNG_TEST_HOST` | `127.0.0.1` | Override target host (e.g. `move.local` to skip the SSH tunnel) |
| `SCHWUNG_TEST_PORT` | `47777` | Override target port |

The daemon honors `SCHWUNG_TEST_BIND` and `SCHWUNG_TEST_PORT` on its side.

## Direct API usage (no pytest)

```py
from schwung_bus import SchwungBus

with SchwungBus() as bus:
    print(bus.ping())                          # 'schwung-testd 0.1.0'
    before = bus.snapshot_pad_leds()
    bus.press_pad(84, velocity=100)
    bus.wait_frame(8)                          # block ~24ms
    after = bus.snapshot_pad_leds()
    bus.release_pad(84)
    print("changed indices:",
          [i for i in range(32) if before[i] != after[i]])
```

### Reversible UI tests

Tests that mutate Move's UI state need to undo what they did to stay
isolated. A declarative `Commander` pattern (each action carries its own
`undo`; a fixture unwinds the stack LIFO at teardown, even on failure) lands
in a follow-up. This PR ships the bus primitives it builds on — `inject_midi`,
`press_pad` / `release_pad`, `wait_frame`, `snapshot_pad_leds`, `state` — so
tests can drive and observe the device today.

### Resetting to a known-empty set (`pristine_set`)

Tests that read pad LED baselines need a deterministic starting
project, not "whatever song was last loaded". The `pristine_set` fixture
gives each test a fresh empty set:

```py
def test_starts_empty(bus, pristine_set):
    # Move has just been reset to the canonical empty set and restarted.
    assert len(bus.snapshot_pad_leds()) == 32
```

The fixture keeps a dedicated set named **"Schwung Test Template"** on the
device, identified by name:

* if that set already exists, it is reused;
* otherwise it is created from `tests/fixtures/empty_song.abl` (a
  default 4-track Move set committed in this repo) under a freshly
  minted UUID.

To point Move at the template without editing `Settings.json`, the
session-scoped `_template_staged` fixture swaps the `user.song-index`
xattr (Move's song-list is an xattr scan over `Sets/*/`) and
**restores it on teardown** — your
device's set list and `currentSongIndex` are left byte-identical to
before the run. The only persistent artifact is the "Schwung Test
Template" set itself, which is reused on the next run (delete it in
Move's UI if you want; the fixture recreates it). A crashed session
leaves a recovery file that the next run auto-restores from before
applying its own swap.

`pristine_set` adds ~3 s per test (the restart-move cycle). For grouped
scenario tests use `pristine_set_class` (one reset per class); for a
plain transient-state reset without swapping sets use `fresh_move`.
All three skip cleanly if SSH to the device is unavailable.

### Capturing MIDI_OUT events

The shim publishes every MIDI_OUT packet it observes to a SHM ring;
the daemon's `SUBSCRIBE_MIDI_OUT` / `DUMP_MIDI_OUT` / `UNSUBSCRIBE_MIDI_OUT`
expose it to tests. The Python client wraps it with a context manager
and a typed event class:

```py
with bus.capture_midi_out() as cap:
    bus.press_pad(84, velocity=100)
    bus.wait_frame(8)
    bus.release_pad(84)
    bus.wait_frame(20)

# After the with block, cap.events is a MidiOutCapture
note_ons  = cap.events.filter(kind="note_on", note=84).events
note_offs = cap.events.filter(kind="note_off", note=84).events
assert len(note_offs) >= len(note_ons), "stuck note!"
```

The pytest fixture `midi_out_capture` does the same wiring around a
test body — the fixture's teardown drains and unsubscribes even if the
test fails, so the next test starts with a clean baseline.

## Protocol v1

Line-based, ASCII, `\n`-terminated. One command per line, one response per
line. Replies start with `OK` or `ERR`.

| Request | Response |
| --- | --- |
| `PING` | `OK schwung-testd 0.1.0` |
| `INJECT_MIDI 0BB0307F` | `OK` |
| `WAIT_FRAME 5` | `OK frame=1234567` |
| `SNAPSHOT_PAD_LEDS` | `OK 00000000010000…` (64 hex chars = 32 bytes; notes 68-99) |
| `SNAPSHOT_DISPLAY` | `OK counter=<n> <2048 hex chars>` — the OLED itself, 1024 bytes of 128x64 1bpp |
| `SET_DISPLAY_MIRROR 0\|1` | `OK` (gates the shim's per-frame copy; **off by default**) |
| `INJECT_MIDI_MOVE 0BB0307F` | `OK move` — force Move's mailbox regardless of what is on screen |
| `STATE` | `OK move_ui_mode=N overtake_mode=N shift_held=N selected_slot=N ui_slot=N shim_counter=N transport_playing=N speaker_active=N line_in_connected=N display_mode=N` |
| `RESTART_MOVE` | `OK` (sets the shim's `restart_move` flag; Move relaunches) |
| `SET_PARAM <key> <value>` | `OK` (writes a shadow/overtake param via the `/schwung-param` SHM) |
| `GET_PARAM <key>` | `OK <value>` (use `DUMP_PARAM_FILE` if the value is too large for one line) |
| `SET_PARAM_FILE <key> <move_path>` | `OK` (value read from a device-side file — for values too large to inline) |
| `DUMP_PARAM_FILE <key> <move_path>` | `OK` (writes the `GET` result to a device-side file) |
| `SET_OPEN_TOOL <module_id>` | `OK` (asks shadow_ui to open the given tool/overtake module) |
| `SUBSCRIBE <channel>` | `OK` (enables shim capture, sets baseline). v1 channels: `midi_out`. |
| `DUMP <channel>` | multi-line: `OK count=<N> dropped=<D>` then `EV <frame_hex> <pkt_hex>` × N, then `END` |
| `UNSUBSCRIBE <channel>` | `OK` (disables shim capture for that channel) |
| `QUIT` | `OK bye` (server then closes the connection) |

`INJECT_MIDI` takes one 4-byte USB-MIDI packet as 8 hex chars. Pad presses
are notes 68–99 on cable 0; the high nibble of byte 0 is the cable number,
the low nibble the CIN (`0x9` = note-on, `0x8` = note-off, `0xB` = CC).

**`INJECT_MIDI` delivers to whoever owns the surface, and says which.** There
are two MIDI_IN routes and they do not meet: `/schwung-midi-inject` is drained
into **Move's mailbox** for the firmware, while a module that has taken over the
surface is fed from the **raw hardware buffer**. A packet on the wrong one is
not an error and not a drop — it arrives somewhere nobody is looking, which
reads exactly like "the gesture did nothing". So the daemon picks by
`overtake_mode` and replies `OK surface` or `OK move`; assert on that when a
test's meaning depends on it. `INJECT_MIDI_MOVE` forces the mailbox for tests
that mean Move itself (co-run, native UI).

*Measured 2026-09-20, before this existed: a project-picker pad tap through the
bus moved none of the 32 pad LEDs. Upstream measured the identical result on
2026-07-29.*

`WAIT_FRAME N` blocks until the shim's SPI frame counter has advanced by at
least N (each frame ≈ 2.9 ms). Hard cap N ≤ 10000 and a 30 s wall-clock
ceiling guard against runaway tests.

`SNAPSHOT_PAD_LEDS` returns 32 bytes from `shadow_overlay_state_t.pad_led_colors`,
one per pad. Index 0 = note 68 (track 4 pad A), index 31 = note 99
(track 1 pad H).

## What this does NOT do yet

(All build on the primitives shipped here and land in follow-ups.)

* Streams for `midi_in`, `log`, `audio` (only `midi_out` so far)
* ~~Display framebuffer snapshots~~ — **shipped**, see "Seeing the screen" below. Image *diffing* helpers (syrupy-style golden frames) are still to come.
* Module state providers (`host_register_test_state`)
* The reversible-UI `Commander` layer (see "Reversible UI tests" below)
* Combinator helpers (`bus.wait_all`)
* Server-side sub-filters on subscriptions (`midi_out:cable=0,status=note_off`) — for now, filter client-side via `cap.filter(...)`
* Audio fixture WAV-as-line-in injection

## Seeing the screen, and driving the surface

This is the pair that makes unattended device work possible: **read what is on
the OLED**, and **perform a real gesture** to change it. Before them a suite
could prove a screen was *wired* and never that it was *reachable* — the
distinction that has cost this repo whole days.

### The full loop, from a dev machine

```sh
# 1. a session must be running on the device (the launcher installs under this
#    name — there is no scripts/launch.sh on the device):
ssh ableton@move.local 'nohup setsid \
  /data/UserData/schwung/modules/tools/davebox-sa/standalone \
  > /data/UserData/launch.out 2>&1 < /dev/null &'

# 2. the daemon is opt-in — start it by hand:
ssh ableton@move.local 'nohup setsid /data/UserData/dbx-host/bin/schwung-testd \
  > /data/UserData/testd.log 2>&1 < /dev/null &'

# 3. forward the port:
ssh -f -N -L 47777:127.0.0.1:47777 ableton@move.local
```

```python
from schwung_bus.client import SchwungBus

with SchwungBus() as bus:
    bus.set_display_mirror(True)      # OFF by default: it costs a memcpy/frame
    bus.wait_frame(10)                # let one composite land

    before = bus.snapshot_display()
    print(before.to_ascii())          # 64 lines x 128 chars — readable in a terminal

    bus.inject_midi(bytes([0x0B, 0xB0, 14, 1]))   # jog turn, one detent right
    bus.wait_frame(20)

    after = bus.snapshot_display()
    changed = sum(1 for i in range(1024) if before.data[i] != after.data[i])
    assert changed, "the gesture did not move the screen"
```

Measured on hardware for orientation: a **jog turn** moves ~384 bytes of the
frame, a **jog click** ~628, a **pad press in a loaded session** ~47. A change
of 0 means the gesture did not land — treat it as a failure, not as noise.

### Gestures

`press_pad` / `release_pad` (notes 68–99), `press_step` / `release_step`,
`tap("jog_click" | "shift" | "menu" | "back", hold_frames=N)` — a **hold** is
what a long-press test needs, and `hold_frames` is how long. All of them go
through `inject_midi`, so all of them route to whoever owns the surface.

### Reading a frame

`snapshot_display()` returns a `DisplayFrame`:

* `pixel(x, y)` — origin top-left. **Use this, do not index `data` by hand.**
* `lit()` / `is_blank()` — a genuinely empty screen vs a screen you did not read
* `to_ascii(on="#", off=" ")` — put this in a failure message; a hex dump says nothing
* `to_pbm()` — write it to a file and open it

⚠ **The packing is PAGE-ordered, not row-ordered.** One byte is 8 *vertical*
pixels: `byte = (y // 8) * 128 + x`, `bit = y % 8`, LSB topmost. Decoded
row-wise nothing errors — you get plausible-looking noise, and an assertion
that fails for a reason unrelated to the screen. `tests/test_display_frame.py`
pins it with hand-checkable cases.

### Two refusals, on purpose

* `SNAPSHOT_DISPLAY` **refuses** when the mirror is off instead of returning the
  stale/zero buffer. All-zero renders as a blank screen and reads as "the module
  drew nothing" — a false finding is worse than a missing one.
* `SET_DISPLAY_MIRROR` is explicit rather than auto-enabled inside the snapshot.
  A command that silently changes device state describes a machine that only
  exists while it is being measured.

### Known gaps

* ~~Pads do nothing on the project picker~~ — **retracted 2026-09-20, the claim
  was wrong.** Pads work there like everywhere else: with the picker confirmed
  on screen, an injected tap on an empty pad raised the CREATE-NEW confirm (700
  bytes of the frame changed). The original "finding" came from injecting
  without looking at the screen first and assuming which screen was up. ⚠ **Read
  the frame before and after every gesture** — that is the whole point of having
  it, and an unread screen is how a null result becomes a false bug report.
* No golden-frame diffing helpers yet; compare byte counts or assert on
  `pixel()` regions.
* **Shift+Step does not reach a module IN A SESSION** (2026-09-22). An injected
  Shift CC arrives (the module logs it) but a step note after it does not, so
  Shift+Step 1 cannot reopen dAVEBOx's project picker mid-session. The replay
  path (`schwung_shim.c`, the `test_inject_ui_shm` drain) does publish notes, so
  the loss is after it. **Workaround:** a FRESH session lands on the picker —
  exit to stock and relaunch, then drive the picker from there.
* **Start the daemon AFTER the session is up, and again after every relaunch.**
  It maps the session's SHM at start; started too early (or left over from a
  previous session) it exits with `shm_open(/dbxhost-control) failed`, and the
  client sees `Connection reset by peer` — which reads like a network fault.
  Check `/data/UserData/testd.log` before debugging the forward.
* **Jog detents sent back-to-back are QUEUED, not dropped.** 80 detents in a
  tight loop, then a click, landed the click long after the snapshot said
  nothing happened. Wait a few frames per detent (`wait_frame(6)`) and read the
  screen before concluding a gesture failed.
* **`ssh -f … | grep` never returns** (the backgrounded ssh keeps the pipe
  open). Start the forward with `ssh -o LogLevel=ERROR -f -N -L … >/dev/null 2>&1`.
* The daemon serves **one client at a time**, and a dropped connection resets
  subscriptions.

### Provoking a failure on a real device — three traps, all paid for 2026-09-20

* **Show the provocation WORKED before believing the result.** `chmod 000
  projects.json` looks decisive and is not: `project-cmd` rewrites that file via
  temp + rename, which needs the *directory* bit, so the list came back and two
  assertions "failed" against a condition that never existed. Assert the
  condition first, then the behaviour.
* **A restore that races the thing it is restoring proves nothing.** Loading a
  project Move does not hold goes through a RELAUNCH; a `finally` that puts the
  folder back runs while Move is still restarting, so Move finds it, opens it,
  and there is no failure left to see.
* **⚠⚠ `mv .gone-X X` NESTS when `X` already exists** — and Move recreates a set
  folder on its own. The payload ends up at `X/.gone-X/`, `project-cmd
  repair-indices` then correctly quarantines the orphan at
  `dbx-host/sets/quarantine/<date>/`, and the project is gone from the picker.
  It is recoverable from there (it was), but move the payload explicitly rather
  than renaming onto a path that may have come back.

### Cleanup

`ssh ableton@move.local 'sh /data/UserData/dbx-host/scripts/exit-to-stock.sh'`
ends the session cleanly. Killing `shadow_ui` does **not** — the shim respawns
it. ⚠ Do not `pkill -f schwung-testd` inside an ssh command: the pattern matches
the remote shell's own command line and kills the session before the rest runs.

## Writing tests — pitfalls hard-won on hardware

The following are gotchas that bit while building the existing test suite.
They are listed once here rather than commented at every site that uses
them.

### Cable 0 carries MIDI *and* LED writes

Move emits pad-LED updates as `note_on` packets on cable 0 (the note
number identifies the pad, the velocity byte carries the color). A
"stuck note" test that matches `note_on(note=N)` on cable 0 will
trigger on every pad LED update for note N — including ones the test
itself caused. Real outgoing notes (to a downstream synth via USB) go
on **cable 2**. Filter to `cable=2` for stuck-note assertions, accept
that the test skips when no track is armed to USB MIDI OUT.

```py
cap = midi_out_capture.drain().filter(cable=2)
if len(cap) == 0:
    pytest.skip("no track armed to USB MIDI OUT")
```

### `move_ui_mode` and `selected_slot` mirror — covered for track CCs only

The shim's post-merge scan updates `move_ui_mode` and `selected_slot`
when a track CC (40-43) appears in the inject ring. **Other modifier
state — `shift_held` in particular — is hardware-only** (the shim's
shift handler runs additional debounce logic that the mirror skips).
If your test depends on `state.shift_held`, you must press shift on
the physical device; injecting CC 49 will inject but won't update the
mirror.

### Pad LED color drift is normal

Move shifts neighboring pads' brightness by ±1 byte during multi-pad
presses (e.g. a base color of `0x7B` can read as `0x7A` while another
pad is held). Exact-byte assertions on pad LED state are flaky for
this reason. Prefer:

* delta semantics (`after[i] != initial[i]` for indices we touched,
  unchanged for the rest)
* "not the bright press-glow color" rather than "equal to baseline"
* a settle window of 30 frames after release (Move holds the
  press-glow color for 15-25 frames before fading)

### `bus` fixture is session-scoped

`bus` opens one TCP connection at session start and keeps it open
across all tests — so the daemon sees ONE client throughout the run.
That client's per-connection state (current subscription, etc.) is
shared across tests, which is why `midi_out_capture` carefully
subscribes / unsubscribes around its body.

### Long teardown chains can outlast SSH idle timeouts

Restart-move-style tests freeze the shim for ~3 seconds, so a single
test can hold the connection idle for tens of seconds. The SSH tunnel
from the dev
machine needs `ServerAliveInterval=30` set or the kernel will idle
it out and the next test sees a stale socket. Use:

```
ssh -o ServerAliveInterval=30 -L 47777:localhost:47777 ableton@move.local -N
```
