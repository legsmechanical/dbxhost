# dAVEBOx SA

**More better tracks for your Move.**

dAVEBOx SA is an 8-track MIDI sequencer for Ableton Move. It takes over the
pads, knobs and screen and turns the Move into a session machine: clips and
scenes on the pads, a sound of your choice on every track, note effects and
automation per clip, and a browser editor on the same Wi-Fi.

It is the successor to [dAVEBOx](https://github.com/legsmechanical/schwung-davebox),
which ran as a module inside [Schwung](https://github.com/charlesvestal/schwung).
That version is frozen. dAVEBOx SA runs as its own session, on its own build of
Schwung, and is where everything new happens.

**[Read the manual](https://legsmechanical.github.io/dbxhost/)** ·
**[Watch the tutorials](https://www.youtube.com/playlist?list=PLYG911Ay8pgk)** ·
**[See it in action](https://youtu.be/8-Cta7-WApQ)**

---

## What it does

dAVEBOx makes no sound of its own. Every track sends its notes to an
instrument: one of Move's own, a Schwung synth (OB-Xd, Dexed and the rest of
the module catalog), or an external synth on the USB-A port.

**Sequencing**

- 8 tracks, 16 clips each, up to 256 steps per clip. Melodic and drum tracks;
  every drum lane has its own length, so polyrhythms need no setup.
- Per-step pitch, velocity, length, nudge, probability, conditions and ratchets.
- Five pad layouts for playing in: Scale, Chromatic, Piano, Chord and your own
  Custom chords.
- Capture: whatever you just played is already recorded.
- A Conductor track transposes the other tracks, in key, as its clips play.
- Groove: swing, or the feel of any MIDI file or Ableton groove, per project or
  per track.

**Shaping the notes**

- Every clip has its own note effects: arpeggiator, harmonizer, MIDI delay with
  pitch and velocity feedback, pitch randomization that stays in key, and
  quantize, gate and velocity shaping. **Bake** writes the result into the clip
  so you can stack more on top.
- Schwung MIDI effect modules on any track — after the clip, or in front of the
  sequencer so you record what they play. They follow dAVEBOx's key, scale and
  tempo.

**Sound and mixing**

- Four insert effects per track, two send buses, master effects and two LFOs
  per track — on Move's instruments as well as Schwung's.
- Macros: one knob moves several parameters, each over its own range.
- Sound snapshots, and SnapMorph to glide between them on one knob.
- Automation for any parameter, in lanes of their own length, recorded from
  the knobs or drawn per step.

**Playing live**

- Performance mode turns the pads into real-time modulation, with 16 preset slots.
- Note repeat with groove, latch and multi-lane patterns on drum tracks.
- 16 mute/solo snapshots, and scenes launched from the pads.

**Getting things in and out**

- Projects live on the pads, separate from your Move sets.
- Export a project to an Ableton Live set, or any clip to a MIDI file; import
  MIDI files into clips.
- The browser editor at `move.local:7700` has the sequencer, mixer and sound
  pages, a live mirror of the screen you can record, and the full manual.

---

## Your Move stays yours

- **Nothing is installed over stock.** Official Schwung and Move's firmware are
  never modified. dAVEBOx restarts Move under its own build, and leaving hands
  the device back to stock.
- **A reboot returns to stock** — even after a power cut — unless you have made
  dAVEBOx your boot default.
- **Your Move sets are untouched.** dAVEBOx keeps its own projects and its own
  copy of Move's settings.
- **One folder.** Everything dAVEBOx keeps on the Move — projects, settings,
  logs and MIDI exports — is in `/data/UserData/daveboxSA`.

---

## Install

You need an Ableton Move with [Schwung](https://github.com/charlesvestal/schwung)
**1.3.0 or newer**.

The current builds are test builds, not yet in the Schwung module catalog, so
the install file comes from the [Releases page](https://github.com/legsmechanical/dbxhost/releases):

1. Download `davebox-sa-module.tar.gz` from the newest release.
2. Open Schwung Manager at `move.local:7700`, go to **Modules → Install Custom
   Module**, choose the file under **From Tarball**, and click **Install from
   File**.
3. On the Move, press **Shift + Step 13** to open the Tools menu and choose
   **dAVEBOx SA**. The first launch finishes the install by itself, which takes
   about a minute.

**Start it** from the Tools menu, or hold **Back** while the Move boots and
pick it. **Leave** with **Quit** in Project Settings (**Shift + Step 2**).

**Update** by installing a newer release the same way. Your projects carry
over; an install from an earlier test build (folder `dbx-host`) is moved into
`daveboxSA` on its first launch.

**Remove** it by installing `davebox-uninstall-module.tar.gz` from the same
release and choosing **Uninstall dAVEBOx SA** in the Tools menu. Your projects
and settings are kept.

New to it? The [Quick Start](davebox/QUICKSTART.md) gets you from an empty
project to a looping pattern in about fifteen minutes.

---

## Coming from dAVEBOx

The original dAVEBOx — now **dAVEBOx Legacy** — still works and gets no new
features. The two install side by side, but their projects are separate:
dAVEBOx SA doesn't open Legacy projects.

---

## For developers

This repo is the whole of dAVEBOx SA: the sequencer module (`davebox/`), a fork
of [Schwung](https://github.com/charlesvestal/schwung) that hosts it, the
browser editor and its server (`schwung-manager/`), and the launcher and
installer (`standalone/`). They ship together under one version. Changes that
make sense for Schwung itself are offered upstream.

```sh
./standalone/scripts/install-sa.sh          # build everything and deploy it to a Move over SSH
./standalone/scripts/build-sa-release.sh    # assemble the release tarball
```

- [`standalone/README.md`](standalone/README.md) — the launcher, installer and
  on-device layout
- [`BUILDING.md`](BUILDING.md) — the build system and cross-compiling
- [`docs/`](docs/) — the host's architecture, the module and JS APIs, and the
  OLED UI specification
- [`davebox/CHANGELOG.md`](davebox/CHANGELOG.md) — what changed in each release

---

## License

MIT, as inherited from Schwung — see [LICENSE](LICENSE).

Two shipped binaries carry stricter licenses: `schwung-shim.so` links eSpeak NG
for the screen reader and is GPL-3.0-or-later, and `link-subscriber` (Ableton
Link) is GPL-2.0-or-later. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

dAVEBOx was built by AI goblins and designed by a human who is not Dave. It
comes with no warranty: if it breaks your Move, makes your child cry or cleans
out your fridge, that's on you.
