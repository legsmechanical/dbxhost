/*
 * The diagnostic signal handler must not CONSUME SIGTERM.
 *
 * SIGTERM is a shutdown request addressed to the host process; the host's own
 * handler is what saves state and quiesces the audio device. A diagnostic
 * handler that _exit()s on SIGTERM pre-empts that, and which handler wins is
 * decided only by install order — so the symptom is intermittent.
 *
 * These cases pin host/shim_signal_chain.h: the predicate that says SIGTERM is
 * not fatal here, and the chaining helper that hands the signal to whatever
 * action was installed before ours.
 */
#include <assert.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

#include "shim_signal_chain.h"

static int failures = 0;
#define CHECK(cond, what) do { \
    if (cond) { printf("  ok: %s\n", (what)); } \
    else { printf("  FAIL: %s\n", (what)); failures++; } \
} while (0)

/* ---- case 1/2: a previous handler is invoked, with the right signal ---- */

static volatile sig_atomic_t siginfo_calls, siginfo_sig, siginfo_had_info;
static void prev_siginfo_handler(int sig, siginfo_t *info, void *ctx)
{
    (void)ctx;
    siginfo_calls++;
    siginfo_sig = sig;
    siginfo_had_info = (info != NULL);
}

static volatile sig_atomic_t plain_calls, plain_sig;
static void prev_plain_handler(int sig) { plain_calls++; plain_sig = sig; }

/* ---- the child bodies for the terminating cases ---- */

static struct sigaction g_prev;   /* what our fake "diagnostic" chains to */

static void diagnostic_handler(int sig, siginfo_t *si, void *ctx)
{
    /* Mirrors the shim: log (here, nothing), then chain instead of _exit. */
    chain_prev_sigaction(&g_prev, sig, si, ctx);
}

/* Install diagnostic_handler over `prev_disposition`, raise SIGTERM, and —
 * if we survive — exit 42 so the parent can tell "returned" from "died". */
static void child_raise_sigterm(void (*prev_disposition)(int))
{
    struct sigaction prev_sa, sa;
    memset(&prev_sa, 0, sizeof(prev_sa));
    prev_sa.sa_handler = prev_disposition;
    sigemptyset(&prev_sa.sa_mask);
    sigaction(SIGTERM, &prev_sa, NULL);

    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = diagnostic_handler;
    sa.sa_flags = SA_SIGINFO;
    sigemptyset(&sa.sa_mask);
    /* Save the previous action exactly as init_shadow_shm() does. */
    sigaction(SIGTERM, &sa, &g_prev);

    raise(SIGTERM);
    _exit(42);   /* reached only if the signal was swallowed */
}

static int run_child(void (*prev_disposition)(int), int *out_status)
{
    pid_t pid = fork();
    if (pid == 0) { child_raise_sigterm(prev_disposition); _exit(43); }
    if (pid < 0) return -1;
    return waitpid(pid, out_status, 0) == pid ? 0 : -1;
}

int main(void)
{
    printf("test_sigterm_chains_to_move\n");

    /* --- the predicate --- */
    CHECK(sigterm_is_fatal_here(SIGSEGV), "SIGSEGV still terminates here");
    CHECK(sigterm_is_fatal_here(SIGBUS),  "SIGBUS still terminates here");
    CHECK(sigterm_is_fatal_here(SIGABRT), "SIGABRT still terminates here");
    CHECK(!sigterm_is_fatal_here(SIGTERM), "SIGTERM is NOT fatal here");

    /* --- case 1: previous action is an SA_SIGINFO handler --- */
    {
        struct sigaction prev;
        siginfo_t info;
        memset(&prev, 0, sizeof(prev));
        memset(&info, 0, sizeof(info));
        prev.sa_sigaction = prev_siginfo_handler;
        prev.sa_flags = SA_SIGINFO;
        sigemptyset(&prev.sa_mask);

        siginfo_calls = siginfo_sig = siginfo_had_info = 0;
        chain_prev_sigaction(&prev, SIGTERM, &info, NULL);
        CHECK(siginfo_calls == 1, "SA_SIGINFO predecessor called exactly once");
        CHECK(siginfo_sig == SIGTERM, "SA_SIGINFO predecessor got SIGTERM");
        CHECK(siginfo_had_info == 1, "SA_SIGINFO predecessor got the siginfo_t");
    }

    /* --- case 2: previous action is a plain sa_handler --- */
    {
        struct sigaction prev;
        memset(&prev, 0, sizeof(prev));
        prev.sa_handler = prev_plain_handler;
        sigemptyset(&prev.sa_mask);

        plain_calls = plain_sig = 0;
        chain_prev_sigaction(&prev, SIGTERM, NULL, NULL);
        CHECK(plain_calls == 1, "plain predecessor called exactly once");
        CHECK(plain_sig == SIGTERM, "plain predecessor got SIGTERM");
    }

    /* --- case 3: previous action is SIG_IGN — chaining must RETURN --- */
    {
        struct sigaction prev;
        memset(&prev, 0, sizeof(prev));
        prev.sa_handler = SIG_IGN;
        sigemptyset(&prev.sa_mask);
        chain_prev_sigaction(&prev, SIGTERM, NULL, NULL);
        CHECK(1, "SIG_IGN predecessor returns without terminating");
    }

    /* --- case 4: previous action is SIG_DFL — the process must DIE by
     *     SIGTERM, not survive and not exit with some other code. --- */
    {
        int status = 0;
        CHECK(run_child(SIG_DFL, &status) == 0, "SIG_DFL child ran");
        CHECK(WIFSIGNALED(status), "SIG_DFL child was killed by a signal");
        CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGTERM,
              "SIG_DFL child died by SIGTERM (default disposition restored)");
        CHECK(!WIFEXITED(status) || WEXITSTATUS(status) != 128 + SIGTERM,
              "SIG_DFL child did NOT _exit(128+SIGTERM)");
    }

    /* --- case 5: a real predecessor handler wins, and the process lives on
     *     to run the rest of its own shutdown (here: exit 42). --- */
    {
        int status = 0;
        CHECK(run_child(prev_plain_handler, &status) == 0, "handler child ran");
        CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 42,
              "predecessor handler ran and the process kept going");
    }

    if (failures) { printf("FAILED (%d)\n", failures); return 1; }
    printf("PASS\n");
    return 0;
}
