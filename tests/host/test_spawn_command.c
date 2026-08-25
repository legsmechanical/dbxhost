/* spawn_command: the process launcher used from inside Move.
 *
 * The bug it exists for cannot be unit-tested — it needs a multithreaded parent
 * to lose the malloc-lock race between fork() and execvp(), which is exactly
 * why the orphaned "Audio Main/SPI" process was seen once on device and not
 * since. What CAN be pinned is everything a replacement must not quietly
 * change: the exit-status contract every caller reads, PATH lookup, argument
 * passing, and the failure answer for a command that does not exist. Get any of
 * those wrong and host_ensure_dir starts silently "succeeding".
 */
#include "../../src/host/spawn_command.h"

#include <spawn.h>
#include <stdio.h>
#include <string.h>

static int fails = 0;

static void check(const char *desc, int cond)
{
    printf(cond ? "  ok   %s\n" : "  FAIL %s\n", desc);
    if (!cond) fails = 1;
}

int main(void)
{
    printf("test_spawn_command\n");

    {
        const char *const argv[] = { "true", NULL };
        check("a command that succeeds returns 0", spawn_command(argv) == 0);
    }
    {
        const char *const argv[] = { "false", NULL };
        check("a command that fails returns its status", spawn_command(argv) == 1);
    }
    {
        /* The exit status must come through unmangled — callers compare == 0,
         * but a shifted status (the classic waitpid mistake) would make 1 look
         * like 256 and every failure look like a different failure. */
        const char *const argv[] = { "sh", "-c", "exit 42", NULL };
        check("an arbitrary exit status arrives intact (42)", spawn_command(argv) == 42);
    }
    {
        /* PATH lookup, which is the part that allocated in the old version. */
        const char *const argv[] = { "echo", "hello", NULL };
        check("a bare name is found on PATH", spawn_command(argv) == 0);
    }
    {
        const char *const argv[] = { "/bin/echo", "hello", NULL };
        check("an absolute path works too", spawn_command(argv) == 0);
    }
    {
        const char *const argv[] = { "definitely-not-a-real-command-xyzzy", NULL };
        check("a missing command reports failure, never success",
              spawn_command(argv) != 0);
    }
    {
        const char *const argv[] = { NULL };
        check("an empty argv is refused rather than spawned", spawn_command(argv) == -1);
        check("a NULL argv is refused", spawn_command(NULL) == -1);
    }

    /* ⭑ On the target (glibc) the scheduling attributes exist, and a child left
     * on SCHED_FIFO competes with the SPI driver. If a platform HAS them, the
     * implementation must use them — this fails on a build that quietly took
     * the macOS fallback path on Linux. */
#if defined(POSIX_SPAWN_SETSCHEDULER) && defined(POSIX_SPAWN_SETSCHEDPARAM)
    {
        FILE *f = fopen("../../src/host/spawn_command.c", "r");
        char buf[65536];
        size_t n = f ? fread(buf, 1, sizeof(buf) - 1, f) : 0;
        if (f) fclose(f);
        buf[n] = '\0';
        check("this platform has the sched attrs, so the child is de-prioritised",
              n > 0 && strstr(buf, "POSIX_SPAWN_SETSCHEDULER") != NULL);
    }
#else
    printf("  note  no POSIX_SPAWN_SETSCHEDULER here (macOS) — the device has it\n");
#endif

    printf(fails ? "FAIL: spawn_command\n" : "PASS: spawn_command\n");
    return fails;
}
