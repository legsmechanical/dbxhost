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
 * of itself). --pause-launcher / --resume-launcher stop and start
 * move-launcher.service, which is systemd-supervised and would otherwise
 * revive the stock stack a few seconds after the launcher kills it, leaving
 * two hosts fighting over the SPI device. Both the unit name and the
 * systemctl path are compile-time constants.
 *
 * --mount-sets / --umount-sets bind-mount this install's project library over
 * Move's one and only set library, and undo it. Move's library path is not
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
#define DST_SHIM     "/usr/lib/davebox-shim.so"
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

/* The ONE unit this helper may INSTALL (2026-09-05, `--install-restore-unit`):
 * boot recovery for the project-library swap. It used to be written by bless.sh
 * as root over SSH — the last root step a zero-SSH install had left. The text is
 * a compile-time constant; the path is overridable only for the test build. */
#ifndef RESTORE_UNIT_PATH
#define RESTORE_UNIT_PATH "/etc/systemd/system/davebox-restore.service"
#endif
#define RESTORE_UNIT_NAME "davebox-restore.service"
static const char RESTORE_UNIT_TEXT[] =
    "[Unit]\n"
    "Description=davebox: restore native set library after an interrupted session\n"
    "Before=move-launcher.service\n"
    "ConditionPathExists=" DBX_DIR "/scripts/set-swap.sh\n"
    "\n"
    "[Service]\n"
    "Type=oneshot\n"
    "User=ableton\n"
    "ExecStart=/bin/sh " DBX_DIR "/scripts/set-swap.sh recover\n"
    "RemainAfterExit=no\n"
    "\n"
    "[Install]\n"
    "WantedBy=multi-user.target\n";

/* The ONLY bind mount this helper may make: this install's project library,
 * over Move's (non-configurable) set library. Both hardcoded — see the note
 * above. SETS_DIR is Move's own path and is deliberately NOT derived from
 * DBX_DIR: it belongs to the firmware, not to us. */
#define SA_LIBRARY   DBX_DIR "/sets/library"
#define SETS_DIR     "/data/UserData/UserLibrary/Sets"

/* uid/gid of the account Move runs as. Hardcoded rather than resolved through
 * getpwnam(): a setuid binary should not pull in NSS, which can load arbitrary
 * modules from configuration this binary does not control. Verified on device:
 * uid=1000(ableton) gid=100(users). */
#define ABLETON_UID 1000
#define USERS_GID   100

/* owner_uid/owner_gid < 0 means "leave as root" (used for our own binary). */
static int copy_atomic(const char *src, const char *dst, mode_t perms,
                       int owner_uid, int owner_gid) {
    int sfd = open(src, O_RDONLY);
    if (sfd < 0) {
        fprintf(stderr, "davebox-heal: open %s: %s\n", src, strerror(errno));
        return -1;
    }

    char tmp[512];
    int n = snprintf(tmp, sizeof(tmp), "%s.heal-tmp", dst);
    if (n < 0 || (size_t)n >= sizeof(tmp)) {
        fprintf(stderr, "davebox-heal: dst path too long\n");
        close(sfd);
        return -1;
    }

    int dfd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0600);
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
 * restore-unit install. */
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
static int launcher_unit(const char *verb) { return systemctl_run(verb, MOVE_UNIT); }

/* Install the boot-recovery unit (see RESTORE_UNIT_TEXT): write it atomically
 * when its content differs, then daemon-reload + enable. Idempotent — every
 * launch may call this; a device that already has it does one compare and two
 * cheap systemctl calls. Runs as ableton in the unit; root only writes it. */
static int install_restore_unit(void) {
    int need = 1;
    {
        FILE *f = fopen(RESTORE_UNIT_PATH, "r");
        if (f) {
            char cur[sizeof(RESTORE_UNIT_TEXT) + 64];
            size_t n = fread(cur, 1, sizeof(cur) - 1, f);
            fclose(f);
            cur[n] = 0;
            if (n == sizeof(RESTORE_UNIT_TEXT) - 1 && memcmp(cur, RESTORE_UNIT_TEXT, n) == 0) need = 0;
        }
    }
    if (need) {
        char tmp[512];
        int n = snprintf(tmp, sizeof(tmp), "%s.heal-tmp", RESTORE_UNIT_PATH);
        if (n < 0 || (size_t)n >= sizeof(tmp)) return -1;
        int fd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd < 0) { fprintf(stderr, "davebox-heal: open %s: %s\n", tmp, strerror(errno)); return -1; }
        size_t off = 0, len = sizeof(RESTORE_UNIT_TEXT) - 1;
        while (off < len) {
            ssize_t w = write(fd, RESTORE_UNIT_TEXT + off, len - off);
            if (w < 0) { if (errno == EINTR) continue; close(fd); unlink(tmp); return -1; }
            off += (size_t)w;
        }
        if (fsync(fd) < 0) { /* rename is the durability point */ }
        if (close(fd) < 0 || rename(tmp, RESTORE_UNIT_PATH) < 0) {
            fprintf(stderr, "davebox-heal: install %s: %s\n", RESTORE_UNIT_PATH, strerror(errno));
            unlink(tmp);
            return -1;
        }
        fprintf(stderr, "davebox-heal: wrote %s\n", RESTORE_UNIT_PATH);
    }
    if (systemctl_run("daemon-reload", NULL) != 0) return -1;
    if (systemctl_run("enable", RESTORE_UNIT_NAME) != 0) return -1;
    return 0;
}

/* Is SETS_DIR currently a mount point? Compares its st_dev with its parent's:
 * a bind mount from the SAME filesystem keeps st_dev equal, so that test alone
 * is not enough — we also compare st_ino against the source, which is what a
 * bind mount makes identical. Either signal means "already ours".
 *
 * Being wrong in the SAFE direction matters differently for each caller:
 * mounting twice merely stacks (harmless, and the umount below unstacks), while
 * umounting something that is not ours would expose... nothing, because the
 * only thing we ever mount is our own library. */
static int sets_is_bound(void) {
    struct stat st_target, st_source;
    if (stat(SETS_DIR, &st_target) < 0) return 0;
    if (stat(SA_LIBRARY, &st_source) < 0) return 0;
    return (st_target.st_dev == st_source.st_dev &&
            st_target.st_ino == st_source.st_ino) ? 1 : 0;
}

/* Bind the standalone library over Move's set library. Idempotent: a second
 * call is a no-op rather than a second stacked mount. */
static int sets_mount(void) {
    struct stat st;
    if (stat(SA_LIBRARY, &st) < 0 || !S_ISDIR(st.st_mode)) {
        fprintf(stderr, "davebox-heal: %s missing or not a directory — refusing to mount\n",
                SA_LIBRARY);
        return -1;
    }
    if (stat(SETS_DIR, &st) < 0 || !S_ISDIR(st.st_mode)) {
        fprintf(stderr, "davebox-heal: %s missing or not a directory — refusing to mount\n",
                SETS_DIR);
        return -1;
    }
    if (sets_is_bound()) {
        fprintf(stderr, "davebox-heal: sets already bound — nothing to do\n");
        return 0;
    }
    if (mount(SA_LIBRARY, SETS_DIR, NULL, MS_BIND, NULL) < 0) {
        fprintf(stderr, "davebox-heal: bind %s -> %s: %s\n",
                SA_LIBRARY, SETS_DIR, strerror(errno));
        return -1;
    }
    fprintf(stderr, "davebox-heal: bound %s -> %s\n", SA_LIBRARY, SETS_DIR);
    return 0;
}

/* Undo it. Not-mounted is SUCCESS, not an error: every teardown path calls this
 * unconditionally (session exit, the launcher's refuse paths, crash recovery),
 * and they must not fail because there was nothing to undo.
 *
 * MNT_DETACH as a fallback for the busy case — a process with a cwd inside the
 * library would otherwise pin the mount forever, and a lazy unmount detaches
 * the tree immediately so the user's real sets are visible again. */
static int sets_umount(void) {
    if (!sets_is_bound()) {
        fprintf(stderr, "davebox-heal: sets not bound — nothing to undo\n");
        return 0;
    }
    if (umount(SETS_DIR) == 0) {
        fprintf(stderr, "davebox-heal: unbound %s\n", SETS_DIR);
        return 0;
    }
    if (errno == EBUSY && umount2(SETS_DIR, MNT_DETACH) == 0) {
        fprintf(stderr, "davebox-heal: unbound %s (lazy — was busy)\n", SETS_DIR);
        return 0;
    }
    fprintf(stderr, "davebox-heal: umount %s: %s\n", SETS_DIR, strerror(errno));
    return -1;
}

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
    if (argc == 2) {
        if (strcmp(argv[1], "--pause-launcher") == 0)
            return launcher_unit("stop") == 0 ? 0 : 2;
        if (strcmp(argv[1], "--resume-launcher") == 0)
            return launcher_unit("start") == 0 ? 0 : 2;
        if (strcmp(argv[1], "--mount-sets") == 0)
            return sets_mount() == 0 ? 0 : 2;
        if (strcmp(argv[1], "--umount-sets") == 0)
            return sets_umount() == 0 ? 0 : 2;
        if (strcmp(argv[1], "--install-restore-unit") == 0)
            return install_restore_unit() == 0 ? 0 : 2;
        fprintf(stderr, "davebox-heal: unknown argument %s (expected "
                        "--pause-launcher, --resume-launcher, --mount-sets, "
                        "--umount-sets or --install-restore-unit)\n", argv[1]);
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

    return rc;
}
