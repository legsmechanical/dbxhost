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

# User state shared with the stock install — ONE copy, in the stock tree.
# The shadow UI's JS addresses all of these by hardcoded literal under
# /data/UserData/schwung, while the C side composes SCHWUNG_INSTALL_DIR "/..."
# (which is $DBX_DIR in this build). The ONLY thing that keeps both halves of
# THIS host reading the same files is that each of these names, inside
# $DBX_DIR, is a symlink to the stock tree. A real directory or file in the
# way means the C side reads/writes a private copy the JS never sees: state
# saved by one half is invisible to the other, and nothing errors.
# (Diagnosed 2026-08-06: $DBX_DIR/set_state was a real directory, so per-set
# slot settings saved by the JS were never seen by the C boot loader, which
# fell back to a stale per-install global file.)
#
# install-host.sh creates/repairs these links on every deploy; anything real
# found in the way is moved aside as <name>.pre-share-<date>, never merged.
# Two lists because directories need their shared target ensured first, while
# files may dangle until first write (O_CREAT follows the link).
DBX_SHARED_STATE_DIRS="modules presets patches slot_state set_state set_pages"
DBX_SHARED_STATE_FILES="active_set.txt shadow_chain_config.json shadow_config.json"
