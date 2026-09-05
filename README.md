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

- **8 tracks × 16 scenes** of melodic and drum clips, launched from the pads —
  with per-step conditions, ratchets, nudge and probability.
- **Every track picks its instrument**: one of Move's four internal
  instruments, a hosted synth with four insert effects and two send buses, or
  external MIDI hardware.
- **Note effects per clip**: harmony, MIDI delay with pitch/velocity feedback,
  arpeggiator, quantise/gate/velocity shaping — all sequenceable.
- **A conductor track** that shifts responding tracks harmonically as its own
  clips play.
- **Retrospective capture** — what you just played is already recorded.
- **Projects on the pads**: one pad per project, copy/delete with the hardware
  verbs, born correctly wired from a template.
- **The browser editor** at `http://move.local:7700`: the page *is* dAVEBOx —
  a piano-roll/session editor, an 8-strip mixer, and a per-track sound editor
  (hosted synths bring their own panels), all live in both directions, plus a
  real-time mirror of the device's screen. Phone-bookmarkable per view.

## Installing

dAVEBOx installs like any other Schwung module, and the first launch does the
rest itself:

1. In stock Schwung's web manager (`http://move.local:7700`), install
   **dAVEBOx** from the catalog (it is a *tool*).
2. On the Move: **Tools menu → dAVEBOx**. The first launch lays the dAVEBOx
   host beside stock, asks stock Schwung's own helper to bless dAVEBOx's, and
   installs the boot-recovery service — about a minute, once. Every later launch
   is a launch.

Prerequisites: an Ableton Move with [stock
Schwung](https://github.com/charlesvestal/schwung) installed, at a version that
carries [schwung#419](https://github.com/charlesvestal/schwung/pull/419) (the
"bless a tool's helper" step). On an older stock Schwung the first launch stops
before touching anything and the launch log names the one manual command:

```sh
# only on a stock Schwung older than #419 — once, as root
ssh root@move.local 'sh /data/UserData/schwung/modules/tools/davebox-sa/payload/scripts/layout-install.sh \
    /data/UserData/schwung/modules/tools/davebox-sa/payload /data/UserData/dbx-host /data/UserData/schwung && \
    sh /data/UserData/dbx-host/bless.sh'
```

Stock Schwung is never modified — dAVEBOx runs Move under its own build beside
it, and a reboot always returns to stock.

Developers: `standalone/scripts/install-sa.sh` builds and deploys the whole
deliverable over SSH to an existing install (the update loop);
`standalone/scripts/build-sa-release.sh` assembles the catalog tarball the
release workflow publishes. See `standalone/README.md`.

Once installed: stock Schwung's **Tools menu → dAVEBOx** starts a session;
**Shift + Back** (or Quit in the Settings menu) hands the device back to
stock.

## Documentation

- **[The dAVEBOx Manual](davebox/MANUAL-SA.md)** — the complete user manual.
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
