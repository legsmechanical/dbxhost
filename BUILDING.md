# Building Schwung

Schwung must be cross-compiled for the Ableton Move's ARM64 processor (aarch64 Linux).

## Quick Start

```bash
./scripts/build.sh
```

This builds everything and creates `schwung.tar.gz`. The build script automatically uses Docker for cross-compilation if needed.

Requirements: Docker Desktop (macOS/Windows) or Docker Engine (Linux)

Build without screen reader (skip D-Bus/Flite dependencies):
```bash
DISABLE_SCREEN_READER=1 ./scripts/build.sh
```
This disables D-Bus-driven accessibility/sync features (screen reader announcements, track-volume D-Bus sync, and set-tempo detection from D-Bus text).

## Pre-commit Hook

A local pre-commit hook runs the same fast, native checks that the CI
`host-tests` and `go` jobs run (the device-free unit/contract tests and
`schwung-manager` `go vet`/`build`/`test`). It runs in a few seconds and
catches breakage before you push — no Docker or ARM64 toolchain required.
The ARM64 cross-compile is intentionally **not** in the hook; CI runs it
authoritatively on the pull request.

Install (once per clone):

```bash
./scripts/install-hooks.sh
# or manually: git config core.hooksPath scripts/hooks
```

Bypass once with `git commit --no-verify`, or skip via environment:

```bash
SCHWUNG_SKIP_HOOKS=1 git commit ...
```

## Bootstrap Dependencies (Debian/Ubuntu)

For a fresh Linux machine, bootstrap dependencies and QuickJS first:

```bash
./scripts/bootstrap-build-deps.sh
CROSS_PREFIX=aarch64-linux-gnu- ./scripts/build.sh
```

Without screen reader dependencies:

```bash
./scripts/bootstrap-build-deps.sh --no-screen-reader
DISABLE_SCREEN_READER=1 CROSS_PREFIX=aarch64-linux-gnu- ./scripts/build.sh
```

## Manual Build (without Docker)

### Ubuntu/Debian

```bash
./scripts/bootstrap-build-deps.sh

# Build QuickJS
# (handled by bootstrap script; manual fallback shown below if needed)

# Build project
CROSS_PREFIX=aarch64-linux-gnu- ./scripts/build.sh
# Or build without screen reader:
# DISABLE_SCREEN_READER=1 CROSS_PREFIX=aarch64-linux-gnu- ./scripts/build.sh
```

### macOS (via Homebrew)

```bash
brew tap messense/macos-cross-toolchains
brew install aarch64-unknown-linux-gnu

cd libs/quickjs/quickjs-2025-04-26
CC=aarch64-unknown-linux-gnu-gcc AR=aarch64-unknown-linux-gnu-ar make libquickjs.a
cd ../../..

CROSS_PREFIX=aarch64-unknown-linux-gnu- ./scripts/build.sh
```

## Deployment

dAVEBOx SA is deployed as one deliverable, host and module together:

```bash
./standalone/scripts/install-sa.sh              # build + deploy both halves
./standalone/scripts/install-sa.sh --davebox-only --no-build   # module only, prebuilt
```

It takes effect at the next launch from stock Schwung's Tools menu. See `standalone/README.md`.
(Upstream's stock installer — `scripts/install.sh`, `uninstall.sh`, `package.sh` — was removed
2026-09-24: no SA path used it.)

## Build Outputs

```
build/
  schwung                    # Host binary
  schwung-shim.so      # LD_PRELOAD shim
  host/menu_ui.js            # Host menu
  shared/                    # Shared JS utilities
  patches/                   # Chain patches
  modules/
    chain/                   # Signal Chain module (featured)
    audio_fx/freeverb/       # Audio FX: Freeverb reverb
    sound_generators/linein/ # Sound generator: Line In passthrough
    midi_fx/chord/           # MIDI FX: Chord generator
    midi_fx/arp/             # MIDI FX: Arpeggiator
    midi_fx/velocity_scale/  # MIDI FX: Velocity range mapping
    controller/              # MIDI controller (overtake)
    store/                   # Module Store (system)
    tools/file-browser/      # File browser tool (UI only)
    tools/song-mode/         # Song arranger tool (UI only)
    tools/wav-player/        # WAV player tool (UI + DSP)

schwung.tar.gz         # Deployable package
```

**Note:** Sound generators (SF2, Dexed, Mini-JV, OB-Xd) and audio effects (CloudSeed, PSX Verb, etc.) are external modules installed via the Module Store, not built with the host.

## Troubleshooting

**"libquickjs.a not found"**
```bash
cd libs/quickjs/quickjs-2025-04-26
CC=aarch64-linux-gnu-gcc AR=aarch64-linux-gnu-ar make libquickjs.a
```

**Missing font.png/font.png.dat**

`build/host/font.png` and `build/host/font.png.dat` are generated automatically by `build.sh` from `scripts/generate_font.py`. This script is the **single source of truth** for the bitmap font used on the host display, the shadow UI, and the OLED shim overlay.

If you need to regenerate the font manually (e.g. after editing `FONT` in `generate_font.py`):

```bash
python3 -m pip install pillow
python3 scripts/generate_font.py --deploy-png build/host/font.png
```

To preview the font as a grid image:
```bash
python3 scripts/generate_font.py --png font_preview.png
```

To print the C array for `overlay_font_5x7` in the shim:
```bash
python3 scripts/generate_font.py --c-array
```

> **Note:** The host no longer attempts to load the system TTF (`/opt/move/Fonts/unifont_jp-14.0.01.ttf`). The 5x7 bitmap font from `generate_font.py` is always used.

**Flite bundle verification failed**
```bash
# Recommended: use Docker build (auto-installs arm64 dependencies)
./scripts/build.sh

# If building manually, bootstrap deps (including Flite/dbus):
./scripts/bootstrap-build-deps.sh

# Or disable screen reader support in this build:
DISABLE_SCREEN_READER=1 ./scripts/build.sh
```

**Verify binary architecture**
```bash
file build/move-anything
# Should show: ELF 64-bit LSB executable, ARM aarch64
```

**SSH connection issues**
Add your public key at http://move.local/development/ssh

## Module Development

Rebuild a single module:

```bash
aarch64-linux-gnu-gcc -g -O3 -shared -fPIC \
    src/modules/sf2/dsp/sf2_plugin.c \
    -o build/modules/sf2/dsp.so \
    -Isrc -Isrc/modules/sf2/dsp -lm

scp build/modules/sf2/dsp.so ableton@move.local:~/move-anything/modules/sf2/
```

## Plugin API Versions

The host supports two plugin APIs. **All new modules should use V2.**

### Plugin API v2 (Recommended)

V2 supports multiple instances and is required for Signal Chain integration.

```c
#include "host/plugin_api_v2.h"

typedef struct plugin_api_v2 {
    uint32_t api_version;              // Must be 2
    void* (*create_instance)(const char *module_dir, const char *json_defaults);
    void (*destroy_instance)(void *instance);
    void (*on_midi)(void *instance, const uint8_t *msg, int len, int source);
    void (*set_param)(void *instance, const char *key, const char *val);
    int (*get_param)(void *instance, const char *key, char *buf, int buf_len);
    void (*render_block)(void *instance, int16_t *out_lr, int frames);
} plugin_api_v2_t;

// Entry point - export this function
extern "C" plugin_api_v2_t* move_plugin_init_v2(const host_api_v1_t *host);
```

### Plugin API v1 (Deprecated)

V1 is a singleton API - only one instance can exist. **Do not use for new modules.**

```c
typedef struct plugin_api_v1 {
    uint32_t api_version;              // Must be 1
    int (*on_load)(const char *module_dir, const char *json_defaults);
    void (*on_unload)(void);
    void (*on_midi)(const uint8_t *msg, int len, int source);
    void (*set_param)(const char *key, const char *val);
    int (*get_param)(const char *key, char *buf, int buf_len);
    void (*render_block)(int16_t *out_lr, int frames);
} plugin_api_v1_t;

// V1 entry point (deprecated)
extern "C" plugin_api_v1_t* move_plugin_init_v1(const host_api_v1_t *host);
```

### Migration from V1 to V2

1. Replace singleton state with instance struct
2. Update all functions to take `void *instance` as first parameter
3. Implement `create_instance()` and `destroy_instance()`
4. Export `move_plugin_init_v2()` instead of `move_plugin_init_v1()`

## Architecture

- **Target**: Ableton Move (aarch64 Linux, glibc)
- **Audio**: 44.1kHz, 128-sample blocks (~3ms latency)
- **Host**: Statically links QuickJS
- **Modules**: Loaded via dlopen()
