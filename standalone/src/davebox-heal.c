/*
 * davebox-heal — setuid-root helper that mirrors the davebox host's shim into
 * /usr/lib so it can be preloaded, and installs its own staged updates.
 *
 * Why this exists: MoveOriginal carries file capabilities (cap_ipc_lock,
 * cap_sys_nice, cap_sys_resource), so it runs AT_SECURE. There, glibc honours
 * an LD_PRELOAD entry only if it is a BARE SONAME, resolved from a standard
 * directory, AND the library carries the setuid bit. Any path containing a '/'
 * is dropped silently — no error, no log, the host simply comes up without the
 * shim. /usr/lib is not writable by `ableton`, which is what module installs,
 * schwung-manager and the standalone launcher all run as. Hence: root, once.
 *
 * Threat model. The mirrored .so is installed setuid **ableton**, not root, and
 * is preloaded into a process already running as ableton — so it confers no
 * privilege whatsoever. The setuid bit exists purely to satisfy glibc's check.
 * A setuid bit on a shared library grants nothing on its own; a .so is not
 * executed as a program. The only privileged act here is WRITING into /usr/lib,
 * and both the source and destination paths are hardcoded below, so this binary
 * can only ever do exactly what is written here. Its arguments are a CLOSED SET
 * of flags that select a hardcoded action — no caller-supplied string is ever
 * passed through to a path or a command — and an unrecognised argument is an
 * error, never ignored. The user already owns the device and can write /data
 * freely, so this grants them nothing they did not have.
 *
 * Idempotent (content-compared, not mtime-compared: a tar extract can leave the
 * source OLDER than the live copy, so "src newer" would skip a genuinely
 * different same-size build). Atomic: write to a tmpfile then rename, so a
 * crash mid-write cannot leave a half-written library.
 *
 * Actions: with no argument it mirrors the shim (and installs a staged update
 * of itself, and removes the boot-recovery unit earlier builds installed).
 * --pause-launcher / --resume-launcher stop and start move-launcher.service,
 * which is systemd-supervised and would otherwise revive the stock stack a few
 * seconds after the launcher kills it, leaving two hosts fighting over the SPI
 * device. Both the unit name and the
 * systemctl path are compile-time constants.
 *
 * --mount-sets / --umount-sets bind-mount this install's project library over
 * Move's one and only set library, and undo it. --mount-settings /
 * --umount-settings do the same for Move's settings folder (2026-09-28: Josh,
 * "need to have those settings be separate from the main move install"): a
 * session's Move reads and writes this install's own copy. Move's library path is not
 * configurable, so a standalone session has to make Sets/ show a different
 * population; a bind mount does that atomically, with the user's real sets
 * untouched underneath and NOTHING moved on disk. mount(2) is a privileged
 * call, and the launcher runs as ableton — hence this verb.
 *
 * Both paths are compile-time constants and no argument reaches them, so this
 * can only ever mount that one source over that one target. It cannot be aimed
 * anywhere else, and it takes no filesystem type, no options string and no
 * device — MS_BIND of a directory that this install already owns.
 * ⚠ Safety property worth stating: a bind mount HIDES, it never deletes. The
 * worst outcome of a wrong mount is that the user's sets are temporarily
 * invisible, and a reboot clears every mount unconditionally.
 *
 * Install: chown root, chmod 4755. After that every davebox host update is
 * unprivileged — the payload lands in the ableton-owned tree and the launcher
 * calls this to mirror it.
 *
 * Derived from schwung-heal.c, which solves the same problem for the stock
 * install. Kept deliberately close to it: same audit story, same failure modes.
 */

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <sys/types.h>
#include <unistd.h>

/* Hardcoded, never taken from input.
 *
 * DBX_DIR may be overridden with -DDBX_DIR at COMPILE time (build-heal.sh feeds
 * it from ../config.sh, the one place the install dir is declared). That keeps
 * the security property this helper depends on: the value is still baked into
 * the binary, so it can never be steered by argv, environment or cwd. Do NOT
 * make it runtime-settable. The fallback below is pinned to config.sh by
 * scripts/check-config.sh. */
#ifndef DBX_DIR
#define DBX_DIR      "/data/UserData/dbx-host"
#endif
#define SRC_SHIM     DBX_DIR "/schwung-shim.so"
#ifndef DST_SHIM
#define DST_SHIM     "/usr/lib/davebox-shim.so"
#endif
/* Where this binary LIVES (2026-09-05): inside the launcher module's dir in
 * STOCK's tools tree — because that is the one place stock's own schwung-heal
 * will bless a staged helper (charlesvestal/schwung#419: `bin/heal.new` →
 * `bin/heal`, root 04755). Our self-update stages at the same path, so both the
 * first bless (stock heal) and every later update (this binary) are one copy.
 * ⚠ ableton owns the directory: a stock reinstall or a catalog reinstall of the
 * launcher module can remove or un-setuid this file. The launcher treats "heal
 * not setuid" as a re-bless condition on EVERY launch, never as first-run. */
#ifndef HEAL_DIR
#define HEAL_DIR     "/data/UserData/schwung/modules/tools/davebox-sa/bin"
#endif
#define SELF_PATH    HEAL_DIR "/heal"
#define SELF_STAGED  HEAL_DIR "/heal.new"

/* The one unit we are allowed to touch, and the only binary we will exec.
 * Both hardcoded: this helper must never be steerable at a different service. */
#ifndef SYSTEMCTL
#define SYSTEMCTL    "/usr/bin/systemctl"
#endif
#define MOVE_UNIT    "move-launcher.service"

/* The boot-recovery unit this helper USED to install (2026-09-05 .. 0.0.4):
 * a oneshot that ran `set-swap.sh recover` at boot. RETIRED — it is only ever
 * removed now, by every launch (see retire_restore_unit) and by the uninstall.
 * Why it went: a reboot clears the bind mounts by itself, so after a power loss
 * the user's own Sets and settings are back without it, and every launch runs
 * the same recover as its first step. Installing it was the one root write
 * official Schwung never makes, and it refused a tester's first launch. The
 * paths are overridable only for the test build. */
#ifndef RESTORE_UNIT_PATH
#define RESTORE_UNIT_PATH "/etc/systemd/system/davebox-restore.service"
#endif
#define RESTORE_UNIT_NAME "davebox-restore.service"
/* The link `systemctl enable` made (WantedBy=multi-user.target), removed by
 * hand as well as through `disable`, so a unit file that is already gone
 * cannot leave a dangling link behind. */
#ifndef RESTORE_WANTS_PATH
#define RESTORE_WANTS_PATH "/etc/systemd/system/multi-user.target.wants/davebox-restore.service"
#endif

/* The ONLY bind mount this helper may make: this install's project library,
 * over Move's (non-configurable) set library. Both hardcoded — see the note
 * above. SETS_DIR is Move's own path and is deliberately NOT derived from
 * DBX_DIR: it belongs to the firmware, not to us. */
#define SA_LIBRARY   DBX_DIR "/sets/library"
#ifndef SETS_DIR     /* overridable for the test build only */
#define SETS_DIR     "/data/UserData/UserLibrary/Sets"
#endif

/* The SECOND and last bind mount it may make: this install's settings folder
 * over Move's. The whole DIRECTORY, not Settings.json: every writer of that
 * file in this tree replaces it by rename, and rename(2) onto a file mount
 * point fails with EBUSY. Same rules as the Sets pair — both hardcoded,
 * SETTINGS_DIR belongs to the firmware and is not derived from DBX_DIR. */
#define SA_SETTINGS  DBX_DIR "/settings"
#ifndef SETTINGS_DIR /* overridable for the test build only */
#define SETTINGS_DIR "/data/UserData/settings"
#endif

/* uid/gid of the account Move runs as. Hardcoded rather than resolved through
 * getpwnam(): a setuid binary should not pull in NSS, which can load arbitrary
 * modules from configuration this binary does not control. Verified on device:
 * uid=1000(ableton) gid=100(users). */
#define ABLETON_UID 1000
#define USERS_GID   100

#ifndef HEAL_UNINSTALL_ONLY  /* copying is install-only */
/* owner_uid/owner_gid < 0 means "leave as root" (used for our own binary). */
static int copy_atomic(const char *src, const char *dst, mode_t perms,
                       int owner_uid, int owner_gid) {
    /* ⚠ Both ends of this copy sit in directories ableton can write, and this
     * runs as root. So neither path may be FOLLOWED:
     *   - src: a symlink heal.new -> /etc/shadow would have root copy a file
     *     ableton cannot read into one it can (the result is 04755);
     *   - tmp: a symlink planted at <dst>.heal-tmp would have root truncate,
     *     write and fchmod 04755 whatever it points at.
     * O_NOFOLLOW + S_ISREG on the source; unlink, then O_CREAT|O_EXCL on the
     * tmp (O_EXCL never follows a symlink, and a re-plant after the unlink
     * makes the open fail rather than redirect it). Hardlinks cannot reach a
     * root file from here: /data is its own filesystem. */
    int sfd = open(src, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (sfd < 0) {
        fprintf(stderr, "davebox-heal: open %s: %s\n", src, strerror(errno));
        return -1;
    }
    struct stat sst;
    if (fstat(sfd, &sst) < 0 || !S_ISREG(sst.st_mode)) {
        fprintf(stderr, "davebox-heal: %s is not a regular file\n", src);
        close(sfd);
        return -1;
    }

    char tmp[512];
    int n = snprintf(tmp, sizeof(tmp), "%s.heal-tmp", dst);
    if (n < 0 || (size_t)n >= sizeof(tmp)) {
        fprintf(stderr, "davebox-heal: dst path too long\n");
        close(sfd);
        return -1;
    }

    if (unlink(tmp) < 0 && errno != ENOENT) {
        fprintf(stderr, "davebox-heal: unlink %s: %s\n", tmp, strerror(errno));
        close(sfd);
        return -1;
    }
    int dfd = open(tmp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (dfd < 0) {
        fprintf(stderr, "davebox-heal: open %s: %s\n", tmp, strerror(errno));
        close(sfd);
        return -1;
    }

    char buf[65536];
    ssize_t r;
    while ((r = read(sfd, buf, sizeof(buf))) > 0) {
        ssize_t off = 0;
        while (off < r) {
            ssize_t w = write(dfd, buf + off, r - off);
            if (w < 0) {
                if (errno == EINTR) continue;
                fprintf(stderr, "davebox-heal: write %s: %s\n", tmp, strerror(errno));
                close(sfd); close(dfd); unlink(tmp);
                return -1;
            }
            off += w;
        }
    }
    if (r < 0) {
        fprintf(stderr, "davebox-heal: read %s: %s\n", src, strerror(errno));
        close(sfd); close(dfd); unlink(tmp);
        return -1;
    }
    close(sfd);

    /* ⚠ ORDER MATTERS: chown BEFORE chmod. Linux clears the setuid bit on
     * chown, so doing it the other way round silently yields a non-setuid
     * library — and AT_SECURE then refuses the preload with no diagnostic,
     * which presents as "the davebox host launched but Schwung isn't there". */
    if (owner_uid >= 0 && fchown(dfd, (uid_t)owner_uid, (gid_t)owner_gid) < 0) {
        fprintf(stderr, "davebox-heal: fchown %s: %s\n", tmp, strerror(errno));
        close(dfd); unlink(tmp);
        return -1;
    }
    if (fchmod(dfd, perms) < 0) {
        fprintf(stderr, "davebox-heal: fchmod %s: %s\n", tmp, strerror(errno));
        close(dfd); unlink(tmp);
        return -1;
    }

    if (fsync(dfd) < 0) { /* non-fatal; rename is the durability point */ }
    if (close(dfd) < 0) {
        fprintf(stderr, "davebox-heal: close %s: %s\n", tmp, strerror(errno));
        unlink(tmp);
        return -1;
    }

    if (rename(tmp, dst) < 0) {
        fprintf(stderr, "davebox-heal: rename %s -> %s: %s\n", tmp, dst, strerror(errno));
        unlink(tmp);
        return -1;
    }
    return 0;
}

#endif

/* Run `systemctl <verb> move-launcher.service` and wait for it.
 *
 * Why this exists: move-launcher.service is supervised with Restart=on-failure,
 * so killing MoveLauncher makes systemd bring the WHOLE stock stack back a few
 * seconds later. The davebox host would then be running alongside stock, both
 * driving /dev/ablspi0.0. The launcher runs as ableton and cannot stop a
 * systemd unit, so it asks us.
 *
 * The verb is chosen from a fixed pair by the caller's flag — never passed
 * through as a string — and the unit and systemctl path are compile-time
 * constants, so this cannot be aimed at another service. */
/* Run systemctl with a verb and an optional unit, both compile-time or
 * closed-set constants, and wait. Shared by the launcher pause/resume and the
 * retirement of the old boot-recovery unit. */
static int systemctl_run(const char *verb, const char *unit) {
    pid_t pid = fork();
    if (pid < 0) {
        fprintf(stderr, "davebox-heal: fork: %s\n", strerror(errno));
        return -1;
    }
    if (pid == 0) {
        if (unit) execl(SYSTEMCTL, "systemctl", verb, unit, (char *)NULL);
        else      execl(SYSTEMCTL, "systemctl", verb, (char *)NULL);
        _exit(127);
    }
    int st = 0;
    while (waitpid(pid, &st, 0) < 0) {
        if (errno == EINTR) continue;
        fprintf(stderr, "davebox-heal: waitpid: %s\n", strerror(errno));
        return -1;
    }
    if (!WIFEXITED(st) || WEXITSTATUS(st) != 0) {
        fprintf(stderr, "davebox-heal: systemctl %s %s failed (status %d)\n",
                verb, unit ? unit : "", st);
        return -1;
    }
    fprintf(stderr, "davebox-heal: systemctl %s %s\n", verb, unit ? unit : "");
    return 0;
}
#ifndef HEAL_UNINSTALL_ONLY  /* install-only verbs */
static int launcher_unit(const char *verb) { return systemctl_run(verb, MOVE_UNIT); }

#endif

/* Is `target` (SETS_DIR, SETTINGS_DIR) currently our bind mount? Compares its st_dev with its parent's:
 * a bind mount from the SAME filesystem keeps st_dev equal, so that test alone
 * is not enough — we also compare st_ino against the source, which is what a
 * bind mount makes identical. Either signal means "already ours".
 *
 * Being wrong in the SAFE direction matters differently for each caller:
 * mounting twice merely stacks (harmless, and the umount below unstacks), while
 * umounting something that is not ours would expose... nothing, because the
 * only thing we ever mount is our own library. */
static int dir_is_bound(const char *source, const char *target) {
    struct stat st_target, st_source;
    if (stat(target, &st_target) < 0) return 0;
    if (stat(source, &st_source) < 0) return 0;
    return (st_target.st_dev == st_source.st_dev &&
            st_target.st_ino == st_source.st_ino) ? 1 : 0;
}

#ifndef HEAL_UNINSTALL_ONLY  /* mounting is install-only */
/* Bind the standalone library over Move's set library. Idempotent: a second
 * call is a no-op rather than a second stacked mount. */
static int bind_dir(const char *source, const char *target, const char *what) {
    struct stat st;
    if (stat(source, &st) < 0 || !S_ISDIR(st.st_mode)) {
        fprintf(stderr, "davebox-heal: %s missing or not a directory — refusing to mount\n",
                source);
        return -1;
    }
    if (stat(target, &st) < 0 || !S_ISDIR(st.st_mode)) {
        fprintf(stderr, "davebox-heal: %s missing or not a directory — refusing to mount\n",
                target);
        return -1;
    }
    if (dir_is_bound(source, target)) {
        fprintf(stderr, "davebox-heal: %s already bound — nothing to do\n", what);
        return 0;
    }
    if (mount(source, target, NULL, MS_BIND, NULL) < 0) {
        fprintf(stderr, "davebox-heal: bind %s -> %s: %s\n",
                source, target, strerror(errno));
        return -1;
    }
    fprintf(stderr, "davebox-heal: bound %s -> %s\n", source, target);
    return 0;
}
static int sets_mount(void) { return bind_dir(SA_LIBRARY, SETS_DIR, "sets"); }
static int settings_mount(void) { return bind_dir(SA_SETTINGS, SETTINGS_DIR, "settings"); }

#endif

/* Undo it. Not-mounted is SUCCESS, not an error: every teardown path calls this
 * unconditionally (session exit, the launcher's refuse paths, crash recovery),
 * and they must not fail because there was nothing to undo.
 *
 * MNT_DETACH as a fallback for the busy case — a process with a cwd inside the
 * library would otherwise pin the mount forever, and a lazy unmount detaches
 * the tree immediately so the user's real sets are visible again. */
static int unbind_dir(const char *source, const char *target, const char *what) {
    if (!dir_is_bound(source, target)) {
        fprintf(stderr, "davebox-heal: %s not bound — nothing to undo\n", what);
        return 0;
    }
    if (umount(target) == 0) {
        fprintf(stderr, "davebox-heal: unbound %s\n", target);
        return 0;
    }
    if (errno == EBUSY && umount2(target, MNT_DETACH) == 0) {
        fprintf(stderr, "davebox-heal: unbound %s (lazy — was busy)\n", target);
        return 0;
    }
    fprintf(stderr, "davebox-heal: umount %s: %s\n", target, strerror(errno));
    return -1;
}
static int sets_umount(void) { return unbind_dir(SA_LIBRARY, SETS_DIR, "sets"); }
static int settings_umount(void) { return unbind_dir(SA_SETTINGS, SETTINGS_DIR, "settings"); }

/* Undo every root-owned thing an install made (2026-09-27, the uninstaller):
 * the Sets and settings bind mounts, the retired boot-recovery unit if an
 * earlier build left one, and the mirrored shim in /usr/lib. All three paths are the compile-time constants
 * above; nothing is taken from input. Idempotent — "already gone" is success,
 * so a half-finished uninstall can simply be run again.
 *
 * ORDER: the mounts first, and a failure there stops everything — nothing is
 * removed while ours might still be bound over the user's Sets or settings. */
static int unlink_if_present(const char *path) {
    if (unlink(path) == 0) {
        fprintf(stderr, "davebox-heal: removed %s\n", path);
        return 0;
    }
    if (errno == ENOENT) return 0;
    fprintf(stderr, "davebox-heal: unlink %s: %s\n", path, strerror(errno));
    return -1;
}

/* Remove the retired boot-recovery unit, if an earlier build installed it:
 * disable, unlink the unit and its wants link, reload. Nothing present is
 * success and costs one stat per call, so every launch can run it. */
static int retire_restore_unit(void) {
    int rc = 0;
    struct stat st;
    if (stat(RESTORE_UNIT_PATH, &st) == 0) {
        /* A failed disable is not fatal: the link is removed by hand below. */
        (void)systemctl_run("disable", RESTORE_UNIT_NAME);
        if (unlink_if_present(RESTORE_UNIT_PATH) != 0) rc = -1;
        if (unlink_if_present(RESTORE_WANTS_PATH) != 0) rc = -1;
        if (systemctl_run("daemon-reload", NULL) != 0) rc = -1;
    } else if (unlink_if_present(RESTORE_WANTS_PATH) != 0) {
        rc = -1;
    }
    return rc;
}

static int uninstall_root(void) {
    if (sets_umount() != 0) {
        fprintf(stderr, "davebox-heal: Sets still bound — removing nothing else\n");
        return -1;
    }
    if (settings_umount() != 0) {
        fprintf(stderr, "davebox-heal: settings still bound — removing nothing else\n");
        return -1;
    }
    int rc = retire_restore_unit();
    if (unlink_if_present(DST_SHIM) != 0) rc = -1;
    if (rc == 0) fprintf(stderr, "davebox-heal: root-owned files removed\n");
    return rc;
}

#ifndef HEAL_UNINSTALL_ONLY  /* the shim mirror is install-only */
/* Returns 1 if the files differ, or on any read error — re-copying is
 * idempotent and safe, skipping a real difference is not. */
static int contents_differ(const char *a, const char *b) {
    int fa = open(a, O_RDONLY);
    if (fa < 0) return 1;
    int fb = open(b, O_RDONLY);
    if (fb < 0) { close(fa); return 1; }

    char ba[65536], bb[65536];
    int differ = 0;
    for (;;) {
        ssize_t ra = read(fa, ba, sizeof(ba));
        ssize_t rb = read(fb, bb, sizeof(bb));
        if (ra != rb) { differ = 1; break; }
        if (ra <= 0) break;
        if (memcmp(ba, bb, (size_t)ra) != 0) { differ = 1; break; }
    }
    close(fa);
    close(fb);
    return differ;
}

static int needs_copy(const char *src, const char *dst) {
    struct stat sst, dstat;
    if (stat(src, &sst) < 0) return 0;             /* no source → don't touch */
    if (stat(dst, &dstat) < 0) return 1;           /* missing dst → copy */
    if (sst.st_size != dstat.st_size) return 1;    /* size mismatch → copy */
    return contents_differ(src, dst);              /* same size → verify bytes */
}

/* The mirrored library is useless without its setuid bit, and a chown at the
 * wrong moment is the one silent way to lose it. Returns 1 if the destination
 * exists AND carries the bit.
 *
 * This is checked independently of content, because the failure it guards is
 * invisible to a byte comparison: something can strip the bit while leaving the
 * bytes identical, and then AT_SECURE refuses the preload with no diagnostic
 * anywhere — presenting as "the davebox host launched but Schwung isn't there".
 * A content-only staleness check would call that state up-to-date forever. */
static int dst_setuid_ok(const char *path) {
    struct stat st;
    if (stat(path, &st) < 0) return 0;
    return (st.st_mode & S_ISUID) ? 1 : 0;
}

#endif

int main(int argc, char **argv) {
#ifndef HEAL_TESTING
    if (setgid(0) < 0) { /* non-fatal */ }
    if (setuid(0) < 0 && geteuid() != 0) {
        fprintf(stderr, "davebox-heal: not root (euid=%d) — setuid bit missing?\n",
                geteuid());
        return 1;
    }
#endif

    /* Exactly one optional flag, matched against a closed set. Anything else is
     * a bug or an attack; never ignore it. Note the flags select a hardcoded
     * verb — no caller-supplied string reaches execl(). */
    if (argc > 2) {
        fprintf(stderr, "davebox-heal: at most one argument\n");
        return 1;
    }
#ifdef HEAL_UNINSTALL_ONLY
    /* The UNINSTALLER's copy (2026-09-27). It lives in a different module dir
     * (HEAL_DIR is compiled in), and all it may ever do is take things AWAY:
     * unbind the Sets and settings mounts and remove what an install put in /usr/lib and
     * /etc/systemd. No mount, no launcher control, no self-update, no mirror —
     * so blessing it grants nothing an install did not already have. */
    if (argc == 2 && strcmp(argv[1], "--umount-sets") == 0)
        return sets_umount() == 0 ? 0 : 2;
    if (argc == 2 && strcmp(argv[1], "--umount-settings") == 0)
        return settings_umount() == 0 ? 0 : 2;
    if (argc == 2 && strcmp(argv[1], "--uninstall-root") == 0)
        return uninstall_root() == 0 ? 0 : 2;
    fprintf(stderr, "davebox-heal (uninstall): expected --umount-sets, --umount-settings or --uninstall-root\n");
    return 1;
#else
    if (argc == 2) {
        if (strcmp(argv[1], "--pause-launcher") == 0)
            return launcher_unit("stop") == 0 ? 0 : 2;
        if (strcmp(argv[1], "--resume-launcher") == 0)
            return launcher_unit("start") == 0 ? 0 : 2;
        if (strcmp(argv[1], "--mount-sets") == 0)
            return sets_mount() == 0 ? 0 : 2;
        if (strcmp(argv[1], "--umount-sets") == 0)
            return sets_umount() == 0 ? 0 : 2;
        if (strcmp(argv[1], "--mount-settings") == 0)
            return settings_mount() == 0 ? 0 : 2;
        if (strcmp(argv[1], "--umount-settings") == 0)
            return settings_umount() == 0 ? 0 : 2;
        if (strcmp(argv[1], "--uninstall-root") == 0)
            return uninstall_root() == 0 ? 0 : 2;
        fprintf(stderr, "davebox-heal: unknown argument %s (expected "
                        "--pause-launcher, --resume-launcher, --mount-sets, "
                        "--umount-sets, --mount-settings, --umount-settings "
                        "or --uninstall-root)\n", argv[1]);
        return 1;
    }

    int rc = 0;

    /* Self-update. An on-device update runs as ableton and cannot overwrite
     * this binary without stripping its setuid bit, after which it could no
     * longer mirror anything. So the update stages the new binary at a
     * hardcoded path and the current, still-privileged copy installs it. */
    {
        struct stat nst;
        if (stat(SELF_STAGED, &nst) == 0) {
            if (copy_atomic(SELF_STAGED, SELF_PATH, 04755, -1, -1) == 0) {
                unlink(SELF_STAGED);
                fprintf(stderr, "davebox-heal: self-updated from staged binary\n");
                /* Re-exec from the new inode. Continuing after renaming over
                 * our own running image is unreliable (schwung-heal documents
                 * the same, device-verified). .new is gone, so the new process
                 * skips this block. execv only returns on failure. */
                fflush(NULL);
                execv(SELF_PATH, argv);
                fprintf(stderr, "davebox-heal: re-exec failed: %s\n", strerror(errno));
            } else {
                rc = 2;
            }
        }
    }

    /* Mirror the shim: setuid ableton, 04755. Re-copy when the bytes differ OR
     * when the destination has lost its setuid bit — the latter is a broken
     * install even though the content matches, and repairing it is the entire
     * job of this binary. Reporting it and leaving it broken would not be
     * healing anything. */
    if (needs_copy(SRC_SHIM, DST_SHIM) || !dst_setuid_ok(DST_SHIM)) {
        if (copy_atomic(SRC_SHIM, DST_SHIM, 04755, ABLETON_UID, USERS_GID) == 0) {
            fprintf(stderr, "davebox-heal: shim mirrored\n");
        } else {
            rc = 2;
        }
    }

    /* Confirm the result rather than assume it: if this still fails, the
     * launcher must not proceed, because the host would come up silently
     * without Schwung. */
    if (rc == 0 && !dst_setuid_ok(DST_SHIM)) {
        fprintf(stderr, "davebox-heal: %s is NOT setuid after mirroring — "
                        "preload would be silently refused under AT_SECURE\n",
                DST_SHIM);
        rc = 2;
    }

    /* An earlier build's boot-recovery unit goes on the first launch of this
     * one. Best effort: a failure is said and never refuses the launch — a
     * left-over unit only runs the same recover every launch already runs. */
    if (retire_restore_unit() != 0)
        fprintf(stderr, "davebox-heal: WARNING: could not remove the old %s\n",
                RESTORE_UNIT_NAME);

    return rc;
#endif
}
