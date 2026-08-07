# davebox standalone host

Lets davebox ship host changes **without waiting on upstream Schwung**, and
**without making users choose** between official Schwung and a davebox build.

## The idea

A **small launcher module**, `dAVEBOx SA`, declares `"standalone": true` and ships
one executable. Selecting it from stock Schwung's Tools menu runs the host's
existing `launch-standalone.sh`, which kills the whole stack, frees the SPI
device, and runs our binary.

⚠ **The launcher is a separate module, not a flag on davebox itself**, and it has
to be. The shadow UI dispatches a tool by the FIRST matching branch, and davebox
declares `tool_config.skip_file_browser` + `.interactive` (+ `.overtake`) — all
tested *before* `standalone` (`shadow_ui.js`, `launchToolConfirmed`). Setting
`standalone` on davebox would be silently ignored; it would keep launching as an
interactive/overtake tool. That is also the right shape: davebox should run
*inside* the davebox host as an ordinary tool, and the launcher's only job is to
swap the host underneath.

⚠ `standalone` is read **top-level** in module.json (`shadow_ui_tools.mjs`), even
though `module_manager.c` reads it as a *capability*. The live host is the shadow
UI, so top-level is what counts.

Our "binary" is [`scripts/launch.sh`](scripts/launch.sh), which brings Move back
up under the **davebox Schwung build** instead of the stock one. `/opt/move/Move`
is not the Move binary — it is the shim entrypoint, and its last line is
`exec env LD_PRELOAD=schwung-shim.so /opt/move/MoveOriginal`. Launching a
different Schwung is therefore just running `MoveOriginal` with a different
preload.

Both properties fall out of this:

- **No upstream dependency.** While our build runs, stock Schwung is not
  running. Nothing we need has to be merged by anyone.
- **No user choice.** The official install is never modified. It stays on disk,
  keeps updating normally, and a reboot always returns to it — so a broken
  davebox build cannot brick the device.

The launcher mechanism is already upstream. There is nothing to get merged.

## Layout

| path | what |
|---|---|
| `config.sh` | **the one place** the install dir, SHM prefix and shim soname are declared |
| `src/davebox-heal.c` | setuid-root helper; mirrors our shim into `/usr/lib` |
| `scripts/install-privileged.sh` | the one-time root step (deployed as `$DBX_DIR/bless.sh`) |
| `scripts/launch.sh` | tears down the stock stack, brings up our host |
| `module/module.json` | the `dAVEBOx SA` launcher manifest |
| `scripts/install-module.sh` | installs the launcher into stock's tools dir (no root) |
| `scripts/build-host.sh` | builds this host with `config.sh`'s dir + SHM namespace |
| `scripts/build-heal.sh` | cross-compiles `davebox-heal` with `-DDBX_DIR` from `config.sh` |
| `scripts/install-host.sh` | **build + deploy the host in one command** (the dev loop) |
| `scripts/check-config.sh` | fails if a literal copy drifted from `config.sh` |
| `scripts/select-list.sh` | set-select gate: writes `select_list.json` (pad index → set name) |
| `scripts/select-hook.sh` | set-select gate: post-selection wiring check/rewrite (deferred apply) |

This directory lives **in the host repo** — the launcher's only job is to start
this host, so shipping them together makes host + launcher + heal + installer one
deliverable with one version. It installs to `/data/UserData/dbx-host/`.

⚠ Three files must carry a literal copy of the install dir rather than sourcing
`config.sh`: `launch.sh` (installed as one self-contained file), `install-privileged.sh`
(deployed to the root of the install tree, so a relative source escapes the payload)
and `davebox-heal.c` (setuid-root — the value must stay compile-time). `check-config.sh`
pins all three, and `tests/host/test_standalone_config_contract.sh` runs it in CI.

⚠ The davebox module hardcodes this path too, in `ui/ui_tick.mjs`, and lives in a
**different repo**. It cannot source `config.sh` either: the same `ui.js` runs under
stock Schwung, where this directory does not exist, so the marker path has to be a
well-known constant. Changing `DBX_DIR` means changing it there as well.

## Why root is needed exactly once

`MoveOriginal` carries file capabilities (`cap_ipc_lock`, `cap_sys_nice`,
`cap_sys_resource`), so it runs in **secure-execution mode**. There, glibc
honours an `LD_PRELOAD` entry only if it is a **bare soname**, resolved from a
**standard directory**, and the library carries the **setuid bit**. Any path
containing a `/` is dropped **silently** — no error, no log; Move simply comes
up without the shim.

`/usr/lib` is not writable by `ableton`, which is what module installs,
schwung-manager and the launcher all run as. Hence one privileged step.

Fully web-driven installation is not reachable: `ableton` is in the `sudo` group
but `%sudo` requires a password, and there is no root-capable service to
delegate to.

### What that step actually grants

Nothing the device owner did not already have — they have `ableton` SSH and can
write `/data` freely.

`davebox-heal` accepts only a **closed set of flags** that select hardcoded
actions — no caller-supplied string ever reaches a path or a command, and both
its source and destination are compile-time constants — so it can only ever do
exactly what is written in it. The library it installs is setuid
**ableton**, not root, and is loaded into a process already running as ableton —
so it confers **no privilege at all**. The setuid bit exists purely to satisfy
glibc's check; a setuid bit on a shared library grants nothing on its own,
because a `.so` is not executed as a program.

After that one step, every davebox host update is unprivileged: the payload
lands in the ableton-owned tree through the normal module channel, and the
launcher calls `davebox-heal` to mirror it.

## Sharing the user's modules

`dbx-host/modules` is a **symlink to the stock modules directory**, so every
module the user has installed is available under the davebox host, with no
duplication (~354 MB saved) and no version skew.

That works because the davebox host build resolves the canonical shared-import
prefix to its own `shared/`. Modules import shared utilities by absolute path
(`/data/UserData/schwung/shared/...`), which is part of the module contract, so
without this a second install would silently load the *other* install's library
code. See the `SCHWUNG_INSTALL_DIR` module-loader change on the `davebox-host`
branch — it is a no-op for ordinary builds.

## Workspace separation: state is PRIVATE, content is shared

**This install is an entirely separate workspace from stock Schwung** (Josh,
2026-08-06). Host state — per-set state, the no-set slot workspace, the
active-set pointer, the config files — never crosses installs. What IS shared
is installed/authored content: `modules` (code), `presets` and `patches`
(user libraries). `config.sh` declares both lists (`DBX_PRIVATE_STATE`,
`DBX_SHARED_LINKS`) and `install-host.sh` enforces the shapes on every deploy.

The mechanism that makes separation actually work: the JS half of the host
used to hardcode state paths under `/data/UserData/schwung`, while the C half
composes `SCHWUNG_INSTALL_DIR "/..."` — so in this build the two halves of the
*same host* read different files and nothing errored ("slot settings don't
stick", diagnosed on hardware 2026-08-06). Now `js_host_common.c` registers
the build's install dir as the JS global `HOST_INSTALL_DIR`, and
`shadow_ui.js` composes every state path from it (`HOST_STATE_ROOT`). For the
stock build that resolves to the historic literal — behaviour unchanged,
upstream no-op.

Pinned by `tests/host/test_workspace_separation.sh` — it also tripwires any
new hardcoded stock-tree literal for a private state family in `shadow_ui.js`.

## Install

```sh
# once, ever — needs root
ssh root@move.local 'sh /data/UserData/dbx-host/bless.sh'
```

Then launch davebox from the Schwung Tools menu.

## The watchdog

`move-launcher.service` is systemd-supervised with `Restart=on-failure`, so killing
`MoveLauncher` makes systemd revive the **whole stock stack** a few seconds later — which
would then run alongside the davebox host, both driving `/dev/ablspi0.0`.

So the launcher stands the watchdog down first, and puts it back when the davebox host
exits. Resuming the unit *is* the restore path: systemd brings stock Move back.

The launcher runs as `ableton` and cannot stop a systemd unit, so `davebox-heal` does it via
`--pause-launcher` / `--resume-launcher`. Those flags select a hardcoded verb — no
caller-supplied string reaches `execl` — and both the unit name and the `systemctl` path are
compile-time constants, so the helper cannot be aimed at any other service.

⚠ Upstream's `launch-standalone.sh` has this same hole on this image: it kills `MoveLauncher`
but nothing stops systemd from restarting it.

## Saving stock Schwung's state before we take over

Killing `shadow_ui` loses host state. Its main loop saves only when it sees
`shadow_control->should_exit`, at which point it runs `shadow_save_state_now()`
(`autosaveAllSlots` + `saveMasterFxChainConfig` + `saveChainConfigToDir`). There
is no safety net: `shadow_ui` registers only `atexit(remove_pid)`, and neither
it nor the shim handles `SIGTERM`.

So the launcher runs `scripts/quiesce-stock.sh` first, which sets `should_exit`
(byte 2 of the control SHM) and waits for `shadow_ui` to go. Best-effort — if it
does not, the kill sequence still runs.

Without it the user loses whatever the periodic autosave has not written, and
that autosave is both coarse (~10 s) and **gated on `!isOvertakeActive`** — so
launching from inside an overtake tool would have saved nothing since that tool
opened.

⚠ The host config for the current Move set lives in
`schwung/set_state/<set-uuid>/`, **not** `schwung/slot_state/`. The latter is the
default/legacy directory and stays untouched — checking it will tell you the save
did not happen when it did.

## The boot set-select gate (project selection)

A standalone session does not boot straight into its tool: `launch.sh` arms a
`select_phase` marker (and removes `boot_tool.json`), and the shim + shadow UI
hold the session at **Move's native set picker**, which — thanks to the
Design-B library swap — is showing exactly the session's own project library.
Move keeps everything that makes the picker good (pad tap loads a set, Copy
and Delete manage them, all native); the OLED shows the select screen and
names the tapped set.

Split of responsibilities (all generic host code; this directory provides the
launcher-side files):

- **shim** (`src/schwung_shim.c`, "Boot set-select gate"): decides what a pad
  tap *means*. During the phase the surface is locked down to the picker:
  every input except pads, jog wheel/click, Copy, Delete and the volume knob
  is a no-op (Shift is tracked but blocked; **Shift+Back leaves the session
  to stock**), and Move's LED writes pass only for the picker's own lights
  (pad RGB sysex + the Copy/Delete buttons) — track/step/transport LEDs stay
  dark. A tap outside a copy/delete flow, once Move's load settles, is
  the launch trigger; jog click means "resume the already-loaded set";
  Shift+pad is suppressed; while Copy or Delete is HELD the OLED is ceded to
  Move so its confirm text shows, and reclaimed the instant the button is
  released. Both flows are exactly the raw button state: Move treats Copy and
  Delete as hold-modifiers and cancels the pending step on release
  (hardware-confirmed — delete's confirm, copy-with-no-source, and
  copy-awaiting-destination all die with the button), so releasing falls
  straight back to normal picking.
- **shadow UI** (`src/shadow/shadow_ui.js`): the select screen. Runs
  `scripts/select-list.sh` for names (at entry and after every flow) and, on
  the shim's trigger, ends the phase, stages `boot_tool.json` (so every LATER
  relaunch direct-boots — a programmatic switch never re-asks), runs
  `scripts/select-hook.sh <index|current>`, and opens the tool.
- **select-hook.sh**: guarantees the chosen set has the template wiring
  (tracks 1-4 on channels 1-4, MIDI out off). A native "Empty Set" or pad-copy
  lacks it; the hook stages a **deferred** rewrite (`relaunch_patch.sh`,
  applied by `launch.sh` only after Move exits — a live Move's SIGTERM save
  would clobber the write) and restarts Move through the supervisor loop,
  which then direct-boots the tool with the fixed set.

**Mid-session re-entry (no restart).** A suspended tool can ask for the picker
back: it parks itself (`suspend_keeps_js`) and calls `shadow_select_arm()`.
The shim then walks Move into its native **Set Overview** — Move's own
Shift+Step1 gesture, injected through the MPSC ring once overtake drops —
waits for the D-Bus "Set Overview" confirmation (1.5 s timeout), and claims
the OLED. Selection runs the ordinary gate flow, taps Back so Move leaves the
overview, and **resumes** the parked tool, whose resume-edge set-UUID check
is the project switch. Only a set that needs the wiring hook's rewrite still
takes the one relaunch (Move must reload the rewritten file). The
`project-cmd.sh select` relaunch flavour remains as the fallback for a
gate-less host.

**Session branding.** The build ships `splash.hex` (128×64 1-bpp artwork,
2048 hex chars) + `splash_caption.txt` ("Schwung base: <version>", generated
from `src/host/version.txt` at build time) into the install root; the host's
boot splash draws them instead of the Schwung animation — but ONLY alongside
a standalone session-boot signal (`select_phase` / `boot_tool.json`), so the
same payload on a stock install can never rebrand stock Schwung. The
tool-load screen likewise says "Loading <project>" when the select gate knows
which project is opening, and the hosted module skips its own boot splash
under this host — one product, one splash.

Session-scoped files (all under `$DBX_DIR`, cleared on session exit):
`select_phase`, `select_list.json`, `select_hook_result.json`,
`boot_tool.json`, `relaunch_patch.sh`, `relaunch_select`.

## Gotchas

- **Never reference the shim by path.** Bare soname only — see above. A path
  fails silently and looks like "the host launched but Schwung is missing".
- **`chown` before `chmod`.** Linux clears the setuid bit on chown, so the
  reverse order yields a non-setuid library and the same silent failure.
- **`launch-standalone.sh` does not clear `/dev/shm/schwung-*`.** Stale rings
  hang slots on reattach; `launch.sh` clears both namespaces.
- **Testing the preload with a capability-free binary is a false positive.**
  `/bin/true` is not AT_SECURE, so an absolute-path preload succeeds there and
  proves nothing.
- **⚠⚠ Never `chown -R` the install tree.** It strips the setuid bit *and* root
  ownership from `bin/davebox-heal`, which then cannot pause the watchdog, and
  the launcher correctly refuses to start. Deploy `bin/` separately, or re-run
  `install-privileged.sh` afterwards — it is idempotent and cheap. This is the
  same chown-clears-setuid trap the helper documents internally, applied to the
  helper itself.
- **A refusal to launch is usually this.** `launch.log` says "could not pause
  move-launcher — refusing to launch"; check `ls -la bin/davebox-heal` expecting
  `-rwsr-xr-x root root`.
