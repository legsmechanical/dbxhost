# Vendored for WARP (Loop clips stretched to the tempo)

Unmodified copies. The only code that touches them is `dsp/seq8_stretch.{h,cpp}`.

| folder | upstream | commit | licence |
|---|---|---|---|
| `bungee/` (`bungee/*.h`, `src/`) | https://github.com/Ableton/bungee | `c9cd42d` | MPL-2.0 (`bungee/LICENSE`) |
| `eigen/` (`Eigen/` headers only) | https://gitlab.com/libeigen/eigen | `c29c80012` | MPL-2.0, some files BSD / Apache (`eigen/COPYING.*`) |
| `pffft/` (`pffft.c`, `fftpack.c`, headers) | https://bitbucket.org/jpommier/pffft | `02fe771` | BSD-style, in each file's header (FFTPACKv5 licence) |

The commits are the ones Ableton's Bungee pins as submodules at `c9cd42d`. Built by
`scripts/build_sound.sh` (device) and `tests/run.sh` (tests) with the same defines.
To update: replace a folder wholesale from upstream at a new commit, change this table, and
rerun `tests/test_audio_stretch.c` and the device bench.
