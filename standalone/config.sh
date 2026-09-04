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
# The privileged helper lives in the LAUNCHER MODULE's dir inside STOCK's tools
# tree (2026-09-05), because that is where stock's own schwung-heal blesses a
# staged helper (charlesvestal/schwung#419: modules/tools/<id>/bin/heal.new →
# bin/heal root 04755). Ours self-updates from the same stage. The source file
# stays src/davebox-heal.c; the INSTALLED name is `heal`, as the convention says.
DBX_STOCK_DIR=/data/UserData/schwung
DBX_LAUNCHER_ID=davebox-sa
DBX_HEAL_DIR=$DBX_STOCK_DIR/modules/tools/$DBX_LAUNCHER_ID/bin
DBX_HEAL_NAME=heal
DBX_HEAL=$DBX_HEAL_DIR/$DBX_HEAL_NAME

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
DBX_SHARED_LINKS="presets patches"

# ⚠ `modules` USED TO BE IN THAT LIST. It cannot be, and the reason is a
# hardware regression (2026-08-30): a stock update to v1.0.0 replaced
# modules/chain/dsp.so, and because $DBX_DIR/modules was a bare symlink into
# the stock tree, dAVEBOx immediately started running UPSTREAM's chain.
#
# That directory is not CONTENT, it is CODE, and one piece of it is ours. The
# fork's chain answers the COLON readback (`synth:module`, added in P6 and
# symmetric with the write); upstream's does not, and has no reason to — we
# opted out of its variable-length-chain model. So every
# shadow_get_param(slot, "synth:module") came back empty, the module discovery
# bailed on its silent early return, and every slot in every project rendered
# "EMPTY / CLICK TO PICK" while the underlying state was perfectly intact.
# Nothing warned: the two module.json files are BYTE-IDENTICAL, version string
# included.
#
# So `modules` is now a REAL directory this install owns, holding one symlink
# per stock category (content we genuinely share, and want stock's updates to)
# and a REAL copy of the categories we ship ourselves. Categories are linked
# dynamically from whatever stock has, so a category added upstream later is
# picked up rather than silently missing.
# Entries are either a whole CATEGORY ("chain") or a single module inside one
# ("tools/davebox-sound"). A category containing an owned module becomes a real
# directory holding a symlink per stock entry plus our real copy, so stock's own
# modules stay shared and keep receiving stock's updates.
#
# `tools/davebox-sound` is ours and only ever loaded by THIS host, so there is no
# reason for it to live in a tree a stock update rewrites.
#
# ⚠ `tools/davebox-sa` is deliberately NOT here and CANNOT be: it is the entry in
# stock's Tools menu, so it has to exist in stock's own tree to be launchable at
# all. It is the single unavoidable thing we place there — which is exactly why
# the preflight checks it is still ours.
DBX_OWNED_MODULE_DIRS="chain tools/davebox-sound"
# (set_state left this list in Phase C of the state-co-location plan: per-set
# state lives inside each project's set dir now, so no such root is created.
# A leftover $DBX_DIR/set_state from an older build is inert.)
DBX_PRIVATE_STATE="slot_state active_set.txt shadow_chain_config.json shadow_config.json"
