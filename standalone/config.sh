#!/bin/sh
# Single source of truth for where this host installs and what namespace it owns.
#
# These four values are a CONTRACT spanning three languages: the host's C build,
# the launcher's shell, the setuid heal helper, and the davebox module's JS and
# DSP (which name the marker and script paths to tell which host they are running
# under). Every one of them used to carry its own copy, so changing the install
# directory meant editing four files and hoping. Source this instead.
#
# Consumers:
#   scripts/build-host.sh        -> SCHWUNG_CFLAGS for the C build
#   scripts/build-heal.sh        -> -DDBX_DIR for davebox-heal
#   scripts/install-privileged.sh
#   scripts/check-config.sh      -> pins every literal copy against DBX_DIR
#
# ⚠ scripts/launch.sh CANNOT source this. It is installed as a single
# self-contained file (the module dir gets only module.json + `standalone`), so
# it must carry the literal. check-config.sh fails if the two ever disagree —
# that is what keeps this file authoritative rather than merely aspirational.
#
# ⚠ The davebox module hardcodes DBX_DIR too, in davebox/ui/*.mjs and
# davebox/dsp/seq8.c. It cannot source this either: the same ui.js runs under
# stock Schwung, where this directory does not exist, so the path has to be a
# well-known constant rather than something discovered from the host.
#
# It used to live in a different repo, which is why that half went unpinned for
# so long — check-config.sh could only see this one. Now that davebox is a
# subtree here, those copies are pinned too, so `grep the other repo and hope`
# is no longer the procedure. Change DBX_DIR and check-config.sh names every
# file that disagrees.

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

# Session liveness lock. The launcher takes an exclusive flock on this file
# and holds it for the life of the session, with the supervisor PID as the
# payload — so "is a session live" is answered by the kernel (lock held /
# PID alive), never by a marker someone must remember to delete. Lives in
# /dev/shm so a reboot clears it BY CONSTRUCTION. ⚠ DOTFILE deliberately:
# the session teardown wipes /dev/shm/dbxhost-*, and the glob must never
# delete the locked inode out from under the flock (a second launcher would
# then lock a fresh file at the same path and the guard is gone).
DBX_SESSION_LOCK=/dev/shm/.dbxhost-session.lock

# ── Workspace separation (Josh's ruling, 2026-08-06) ────────────────────────
# dAVEBOx SA is an ENTIRELY SEPARATE WORKSPACE from stock Schwung (and from
# Move native). Host STATE never crosses installs. Concretely, inside $DBX_DIR:
#
#   DBX_SHARED_LINKS   must each be a symlink to the stock tree — CONTENT the
#                      user installs or authors once and expects everywhere:
#                      modules (code, ~354 MB saved), presets (module presets),
#                      patches (chain patch library).
#
#   DBX_PRIVATE_STATE  must each be REAL (never a symlink) — this install's own
#                      state: per-set state, the no-set slot workspace, the
#                      active-set pointer and the two config files. The JS half
#                      composes these from HOST_INSTALL_DIR (js_host_common.c)
#                      and the C half from SCHWUNG_INSTALL_DIR, so both halves
#                      agree; a symlink here would silently fuse the two
#                      hosts' workspaces again.
#
# install-host.sh enforces both on every deploy (creates missing links,
# converts a leftover link in the private list to a real dir/file). Pinned by
# tests/host/test_workspace_separation.sh.
DBX_SHARED_LINKS="modules presets patches"
DBX_PRIVATE_STATE="set_state slot_state active_set.txt shadow_chain_config.json shadow_config.json"
