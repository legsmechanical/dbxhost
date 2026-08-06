#!/bin/sh
# Single source of truth for where this host installs and what namespace it owns.
#
# These four values are a CONTRACT spanning three languages and two repos: the
# host's C build, the launcher's shell, the setuid heal helper, and the davebox
# module's JS (which probes the marker path to tell which host it is running
# under). Every one of them used to carry its own copy, so changing the install
# directory meant editing four files and hoping. Source this instead.
#
# Consumers:
#   scripts/build-host.sh        -> SCHWUNG_CFLAGS for the C build
#   scripts/build-heal.sh        -> -DDBX_DIR for davebox-heal
#   scripts/install-privileged.sh
#   scripts/check-config.sh      -> pins launch.sh's literal against DBX_DIR
#
# ⚠ scripts/launch.sh CANNOT source this. It is installed as a single
# self-contained file (the module dir gets only module.json + `standalone`), so
# it must carry the literal. check-config.sh fails if the two ever disagree —
# that is what keeps this file authoritative rather than merely aspirational.
#
# ⚠ The davebox module hardcodes DBX_DIR too, in ui/ui_tick.mjs, and lives in a
# DIFFERENT repo. It cannot source this either: the same ui.js runs under stock
# Schwung, where this directory does not exist, so the path has to be a
# well-known constant rather than something discovered from the host. If you
# change DBX_DIR you must change it there as well — grep the module repo for
# `dbx-host` before you assume you are done.

# Where this host's payload lands. Must NOT be the stock install dir
# (/data/UserData/schwung) — the whole point is sitting beside it untouched.
DBX_DIR=/data/UserData/dbx-host

# Shared-memory namespace. Must differ from stock's, or the two hosts collide:
# stale rings from an abandoned host hang the next one that reattaches.
DBX_SHM_PREFIX=/dbxhost-

# The LD_PRELOAD soname. Must be a BARE soname in a standard directory carrying
# the setuid bit — MoveOriginal has file capabilities, so it runs AT_SECURE and
# glibc silently ignores an LD_PRELOAD entry that is a path.
DBX_SHIM_SONAME=davebox-shim.so

# The setuid-root helper that mirrors the shim into /usr/lib.
DBX_HEAL_NAME=davebox-heal
