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
| `src/davebox-heal.c` | setuid-root helper; mirrors our shim into `/usr/lib` |
| `scripts/install-privileged.sh` | the one-time root step |
| `scripts/launch.sh` | tears down the stock stack, brings up our host |
| `module/module.json` | the `dAVEBOx SA` launcher manifest |
| `scripts/install-module.sh` | installs the launcher into stock's tools dir (no root) |

The davebox host build itself lives in its own repo,
[`legsmechanical/schwungbox-host`](https://github.com/legsmechanical/schwungbox-host)
(private), and installs to `/data/UserData/dbx-host/`.

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
