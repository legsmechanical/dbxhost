# dAVEBOx

**A standalone 8-track MIDI sequencer and live environment for Ableton Move.**

dAVEBOx turns a Move into a session machine: eight tracks of clips on the pads,
each track playing either one of Move's own instruments or a hosted synth
(OB-Xd, Dexed, and the rest of the Schwung module ecosystem), with per-clip
note effects, conditions and automation, a conductor track for harmonic
movement, retrospective capture, and a full browser editor on the same WiFi.

It runs as its own session on the device. **The official firmware and the
official Schwung install are never modified** — launching dAVEBOx relaunches
Move under this repo's host build, leaving stock untouched on disk, and a
reboot (even a power cut) always returns the device to stock exactly as it
was. Your Move sets are never touched either: dAVEBOx keeps its own project
workspace and swaps it in only while a session runs.

## Highlights

- **8 tracks × 16 scenes** of melodic and drum clips, launched from the pads,
  with per-step conditions, ratchets, nudge and probability.
- **One instrument per track, nothing to route**: one of Move's own
  instruments, a hosted synth (OB-Xd, Dexed and the rest of the Schwung module
  ecosystem), or external MIDI.
- **Four insert effects per track** (reorderable), **Send A/B buses**, **Master
  FX** and **two LFOs per track**, on hosted synths and Move tracks alike.
- **MACROS**: one knob drives several parameters, each with its own range; MIDI
  CC, aftertouch and pitch bend are targets too.
- **Sound snapshots and SnapMorph**: save and recall a track's sound, and glide
  between snapshots on one knob.
- **Automation for any parameter** — instrument, effect, level or dAVEBOx's own —
  with lanes of their own length, Curve/Punch and Wrap, hold-a-step editing, and
  Capture that keeps knob moves. It exports to Live with the rest of the project.
- **Note effects per clip**: harmony, MIDI delay with pitch/velocity feedback,
  arpeggiator, quantise/gate/velocity shaping, all sequenceable.
- **Chord and Piano pad layouts**, step recording, Import MIDI, and Crop.
- **A conductor track** that shifts responding tracks harmonically as its own
  clips play, and **retrospective capture** — what you just played is already
  recorded.
- **Projects on the pads**, kept apart from your Move sets, and **Move's own
  settings** reachable from Project Settings — dAVEBOx keeps its own copy, so
  your Move's settings stay as they are.
- **The browser editor** at `http://move.local:7700`: dAVEBOx's own sequencer,
  mixer and sound-editing pages, live in both directions, a real-time mirror of
  the device's screen, and the full manual on its Help page.
- **Boot straight into dAVEBOx** (hold Back at power-on), and instruments render
  in parallel across the Move's cores.

## Installing

dAVEBOx installs like any other Schwung module, and the first launch does the
rest itself. **The current builds are test builds** — not in the Schwung catalog
yet — so the tarball comes from this repo's
[Releases page](https://github.com/legsmechanical/dbxhost/releases):

1. Download `davebox-sa-module.tar.gz` from the newest release.
2. In Schwung Manager (`http://move.local:7700`): **Modules → Install Custom
   Module → From Tarball → Install from File**, and pick the tarball.
3. On the Move: **Shift + Step 13 (Tools) → dAVEBOx SA**. The first launch lays
   the dAVEBOx host beside stock and asks stock Schwung's own helper to bless
   dAVEBOx's — about a minute, once.
   Every later launch is a launch.

To remove it, install `davebox-uninstall-module.tar.gz` from the same release
the same way and run **Uninstall dAVEBOx SA** from Tools. Your projects and
settings are kept.

Prerequisites: an Ableton Move with [stock
Schwung](https://github.com/charlesvestal/schwung) **1.3.0 or newer** installed.
On a stock Schwung that lacks the "bless a tool's helper" step
([schwung#419](https://github.com/charlesvestal/schwung/pull/419)) the first
launch stops before touching anything and the launch log names the one manual
command:

```sh
# only on a stock Schwung without #419 — once, as root
ssh root@move.local 'sh /data/UserData/schwung/modules/tools/davebox-sa/payload/scripts/layout-install.sh \
    /data/UserData/schwung/modules/tools/davebox-sa/payload /data/UserData/dbx-host /data/UserData/schwung && \
    sh /data/UserData/dbx-host/bless.sh'
```

Stock Schwung is never modified — dAVEBOx runs Move under its own build beside
it, and a reboot always returns to stock.

Developers: `standalone/scripts/install-sa.sh` builds and deploys the whole
deliverable over SSH to an existing install (the update loop);
`standalone/scripts/build-sa-release.sh` assembles the release tarball the
release workflow publishes. See `standalone/README.md`.

Once installed: stock Schwung's **Tools menu → dAVEBOx SA** starts a session;
**Quit** in Project Settings (**Shift + Step 2**) hands the device back to stock.

## Documentation

- **[The dAVEBOx Manual](https://legsmechanical.github.io/dbxhost/)** — the
  complete user manual, with every screen pictured. It is also on the browser
  editor's Help page, and attached to each release as `dAVEBOx-SA-manual.html`.
- [CHANGELOG](davebox/CHANGELOG.md) — what's new.
- `docs/` — architecture, module and API references for the underlying
  framework, and the OLED UI specification.

## Relationship to Schwung

This repo contains the whole deliverable in one place: the sequencer module
(`davebox/`), a host — a fork of [stock
Schwung](https://github.com/charlesvestal/schwung) (MIT) carrying the changes
dAVEBOx depends on — the browser editor and its web server, and the launcher
and installer. `upstream` is the stock Schwung repo, fetch-only; changes that
are generic are still offered upstream as PRs. For the framework's own
documentation (writing modules, the JS/DSP APIs), see stock Schwung's README
and `docs/MODULES.md` here.

**dAVEBOx Legacy** — the earlier version that ran as an ordinary module inside
stock Schwung — lives at
[schwung-davebox](https://github.com/legsmechanical/schwung-davebox) and is
frozen. This standalone line is its successor; sessions are not compatible
between the two.

## License

MIT, as inherited from Schwung — see [LICENSE](LICENSE).

One shipped binary is licensed more strictly than the source: the shim links
eSpeak NG for the screen reader, so `schwung-shim.so` is conveyed under
GPL-3.0-or-later, and `link-subscriber` (Ableton Link) is GPL-2.0-or-later.
See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
