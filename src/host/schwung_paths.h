/*
 * schwung_paths.h — where THIS build installs, and which shared-memory
 * namespace it owns.
 *
 * Both default to the stock values, so an ordinary build is byte-identical to
 * one that never heard of this header. They exist so a SECOND Schwung install
 * can run on the same device without colliding with the stock one.
 *
 * Only one host can run at a time — the shim owns /dev/ablspi0.0 exclusively —
 * so the two installs alternate rather than coexist. But they do share a disk
 * and a /dev/shm, and either would happily scribble on the other's files and
 * ring buffers if both used the same names. Stale segments are the nastier
 * half: pointers in an abandoned ring outlive the process that made them and
 * hang the next host that reattaches.
 *
 * Override at compile time:
 *
 *   -DSCHWUNG_INSTALL_DIR='"/data/UserData/dbx-host"'
 *   -DSCHWUNG_SHM_PREFIX='"/dbxhost-"'
 *
 * ⚠ Change them TOGETHER. A build with its own directory but the stock SHM
 * prefix looks fine until the moment it shares ring buffers with whatever ran
 * before it.
 *
 * ⚠ NOT everything should move with the install directory. Module code imports
 * shared/ by a canonical absolute path that is part of the module contract, and
 * the module loader rewrites that prefix instead (see schwung_module_loader in
 * shadow/shadow_ui.c) — that is what lets a second install share one modules
 * directory. User content (presets, patches, slot state) is likewise better
 * shared than duplicated; symlink it rather than teaching this header about it.
 */

#ifndef SCHWUNG_PATHS_H
#define SCHWUNG_PATHS_H

/* Absolute path to this build's install tree, with no trailing slash, so it
 * composes by string concatenation: SCHWUNG_INSTALL_DIR "/debug.log". */
#ifndef SCHWUNG_INSTALL_DIR
#define SCHWUNG_INSTALL_DIR "/data/UserData/schwung"
#endif

/* Leading '/' and trailing '-' included, so names compose the same way:
 * SCHWUNG_SHM_PREFIX "audio" -> "/schwung-audio". */
#ifndef SCHWUNG_SHM_PREFIX
#define SCHWUNG_SHM_PREFIX "/schwung-"
#endif

#endif /* SCHWUNG_PATHS_H */
