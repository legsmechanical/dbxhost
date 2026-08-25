/* spawn_command.c — see spawn_command.h for why this is not fork + execvp. */
#include "spawn_command.h"

#include <errno.h>
#include <fcntl.h>
#include <sched.h>
#include <signal.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

int spawn_command(const char *const argv[])
{
    posix_spawnattr_t attr;
    posix_spawn_file_actions_t actions;
    struct sched_param sp;
    pid_t pid;
    int status = 0;
    int rc;

    if (!argv || !argv[0]) return -1;

    if (posix_spawnattr_init(&attr) != 0) return -1;
    if (posix_spawn_file_actions_init(&actions) != 0) {
        posix_spawnattr_destroy(&attr);
        return -1;
    }

    /* Drop inherited SCHED_FIFO — the whole reason the old child called
     * sched_setscheduler by hand.
     *
     * ⚠ These two attributes are the OPTIONAL scheduling part of POSIX, present
     * in glibc (the device) and absent on macOS, where the unit test builds. The
     * guard is for the test host only: on the target both are defined, so the
     * device always gets the de-prioritised child. Asserted by the test, which
     * fails loudly on a platform that has them but does not use them. */
    sp.sched_priority = 0;
#if defined(POSIX_SPAWN_SETSCHEDULER) && defined(POSIX_SPAWN_SETSCHEDPARAM)
    posix_spawnattr_setschedpolicy(&attr, SCHED_OTHER);
    posix_spawnattr_setschedparam(&attr, &sp);
    posix_spawnattr_setflags(&attr, POSIX_SPAWN_SETSCHEDULER | POSIX_SPAWN_SETSCHEDPARAM);
#else
    (void)sp;
#endif

    /* stderr onto stdout, as before, so a helper's complaint reaches the log
     * the caller is already reading. */
    posix_spawn_file_actions_adddup2(&actions, STDOUT_FILENO, STDERR_FILENO);

    rc = posix_spawnp(&pid, argv[0], &actions, &attr, (char *const *)argv, environ);

    posix_spawn_file_actions_destroy(&actions);
    posix_spawnattr_destroy(&attr);

    if (rc != 0) return -1;

    while (waitpid(pid, &status, 0) < 0) {
        if (errno != EINTR) return -1;
    }
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    return -1;
}

int spawn_command_background(const char *const argv[])
{
    posix_spawnattr_t attr;
    posix_spawn_file_actions_t actions;
    struct sched_param sp;
    short flags = 0;
    pid_t pid;
    int rc;

    if (!argv || !argv[0]) return -1;

    if (posix_spawnattr_init(&attr) != 0) return -1;
    if (posix_spawn_file_actions_init(&actions) != 0) {
        posix_spawnattr_destroy(&attr);
        return -1;
    }

    sp.sched_priority = 0;
#if defined(POSIX_SPAWN_SETSCHEDULER) && defined(POSIX_SPAWN_SETSCHEDPARAM)
    posix_spawnattr_setschedpolicy(&attr, SCHED_OTHER);
    posix_spawnattr_setschedparam(&attr, &sp);
    flags |= POSIX_SPAWN_SETSCHEDULER | POSIX_SPAWN_SETSCHEDPARAM;
#else
    (void)sp;
#endif
#ifdef POSIX_SPAWN_SETSID
    /* Its own session, as the fork + setsid version did: the child must not die
     * with the caller nor share its controlling terminal. */
    flags |= POSIX_SPAWN_SETSID;
#endif
    posix_spawnattr_setflags(&attr, flags);

    /* stdio to /dev/null — nothing is going to read it, and inheriting the
     * caller stdout would interleave into a log that is parsed. */
    posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDWR, 0);
    posix_spawn_file_actions_adddup2(&actions, STDIN_FILENO, STDOUT_FILENO);
    posix_spawn_file_actions_adddup2(&actions, STDIN_FILENO, STDERR_FILENO);

    rc = posix_spawnp(&pid, argv[0], &actions, &attr, (char *const *)argv, environ);

    posix_spawn_file_actions_destroy(&actions);
    posix_spawnattr_destroy(&attr);

    /* ⚠ NOT waited for, so it becomes a zombie until this process exits unless
     * something reaps it. The fork version had the same property; SIGCHLD is
     * left alone here rather than changed under callers that may rely on it. */
    return (rc == 0) ? 0 : -1;
}
