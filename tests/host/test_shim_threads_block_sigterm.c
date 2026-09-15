/*
 * No shim thread may be an eligible receiver of the host's SIGTERM.
 *
 * The host takes SIGTERM on a dedicated sigwait() thread while its own threads
 * block it. A process-directed signal is delivered to ANY ONE thread that does
 * not block it — the kernel picks — so every shim thread that leaves SIGTERM
 * unblocked is a thread that can swallow the shutdown request and stop the
 * host's audio quiesce from ever running. Because the kernel picks, the
 * symptom is intermittent: the same exit works most days.
 *
 * These cases pin host/shim_thread.h:
 *   - the child created through shim_pthread_create() has SIGTERM/INT/HUP
 *     blocked, and SIGSEGV/SIGABRT deliberately NOT blocked;
 *   - the creating thread's own mask is restored exactly;
 *   - end to end: a child process shaped like the host — one sigwait
 *     "SignalManager" thread plus eight busy worker threads made through the
 *     wrapper — always routes SIGTERM to the sigwait thread and exits by its
 *     own path, never by the default disposition.
 */
#include <assert.h>
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#include "shim_thread.h"

static int failures = 0;
#define CHECK(cond, what) do { \
    if (cond) { printf("  ok: %s\n", (what)); } \
    else { printf("  FAIL: %s\n", (what)); failures++; } \
} while (0)

/* ---- case 1: what the child inherits -------------------------------- */

typedef struct {
    int term_blocked, int_blocked, hup_blocked;
    int segv_blocked, abrt_blocked;
    int mask_ok;
} inherited_t;

static void *report_mask(void *arg)
{
    inherited_t *out = (inherited_t *)arg;
    sigset_t cur;
    sigemptyset(&cur);
    out->mask_ok = (pthread_sigmask(SIG_BLOCK, NULL, &cur) == 0);
    out->term_blocked = sigismember(&cur, SIGTERM);
    out->int_blocked  = sigismember(&cur, SIGINT);
    out->hup_blocked  = sigismember(&cur, SIGHUP);
    out->segv_blocked = sigismember(&cur, SIGSEGV);
    out->abrt_blocked = sigismember(&cur, SIGABRT);
    return NULL;
}

/* ---- case 3: a child process shaped like the host ------------------- */

#define WORKERS 8
#define EXIT_GRACEFUL 42     /* the sigwait thread's own shutdown path */
#define EXIT_NO_SIGNAL 43    /* timed out waiting */

static volatile sig_atomic_t workers_should_stop;

static void *busy_worker(void *arg)
{
    (void)arg;
    /* Spin in a syscall-heavy loop so the kernel has plenty of chances to
     * pick this thread for a process-directed signal. */
    while (!workers_should_stop) {
        struct timespec ts = { 0, 200000 };  /* 0.2 ms */
        nanosleep(&ts, NULL);
    }
    return NULL;
}

/* Runs as the child process. Returns its exit code. */
static int host_shaped_child(void)
{
    sigset_t owned, prev;
    pthread_t workers[WORKERS];
    int i, sig = 0;

    /* The "SignalManager": this thread blocks the owned signals and waits.
     * Every OTHER thread in the host also blocks them; here, the workers do
     * so only because shim_pthread_create() puts them in that state. */
    shim_host_signal_set(&owned);
    if (pthread_sigmask(SIG_BLOCK, &owned, &prev) != 0) _exit(44);

    for (i = 0; i < WORKERS; i++) {
        if (shim_pthread_create(&workers[i], NULL, busy_worker, NULL) != 0)
            _exit(45);
    }

    /* Tell the parent we are ready: workers exist and are running. */
    if (write(STDOUT_FILENO, "R", 1) != 1) _exit(46);

    /* sigwait, not sigtimedwait: the latter does not exist on macOS, and this
     * suite builds on the dev machine. A signal that never arrives is caught
     * by the PARENT's timeout below, which SIGKILLs and reports it. */
    if (sigwait(&owned, &sig) != 0) sig = 0;

    workers_should_stop = 1;
    for (i = 0; i < WORKERS; i++) pthread_join(workers[i], NULL);

    if (sig == SIGTERM) return EXIT_GRACEFUL;
    return EXIT_NO_SIGNAL;
}

static int run_host_shaped_child(int kills, int *out_status)
{
    int pipefd[2];
    pid_t pid;
    char ready = 0;

    if (pipe(pipefd) != 0) return -1;

    pid = fork();
    if (pid == 0) {
        close(pipefd[0]);
        dup2(pipefd[1], STDOUT_FILENO);
        close(pipefd[1]);
        _exit(host_shaped_child());
    }
    if (pid < 0) return -1;
    close(pipefd[1]);

    /* Wait for the child to have its workers up before signalling. */
    if (read(pipefd[0], &ready, 1) != 1 || ready != 'R') {
        close(pipefd[0]);
        kill(pid, SIGKILL);
        waitpid(pid, NULL, 0);
        return -1;
    }
    close(pipefd[0]);

    for (int k = 0; k < kills; k++) {
        kill(pid, SIGTERM);     /* process-directed: the kernel picks a thread */
        struct timespec ts = { 0, 5 * 1000 * 1000 };
        nanosleep(&ts, NULL);
    }

    /* Bounded wait: if the signal were swallowed by a worker thread the child
     * would sit in sigwait() forever, so fail loudly instead of hanging. */
    for (int i = 0; i < 1000; i++) {           /* ~10 s */
        pid_t r = waitpid(pid, out_status, WNOHANG);
        if (r == pid) return 0;
        if (r < 0) return -1;
        struct timespec ts = { 0, 10 * 1000 * 1000 };
        nanosleep(&ts, NULL);
    }
    kill(pid, SIGKILL);
    waitpid(pid, out_status, 0);
    return -1;
}

int main(void)
{
    printf("test_shim_threads_block_sigterm\n");

    /* --- the signal set is the minimal, documented one --- */
    {
        sigset_t set;
        shim_host_signal_set(&set);
        CHECK(sigismember(&set, SIGTERM) == 1, "the set owns SIGTERM");
        CHECK(sigismember(&set, SIGINT)  == 1, "the set owns SIGINT");
        CHECK(sigismember(&set, SIGHUP)  == 1, "the set owns SIGHUP");
        CHECK(sigismember(&set, SIGSEGV) == 0,
              "SIGSEGV is NOT blocked (a synchronous fault must reach its thread)");
        CHECK(sigismember(&set, SIGBUS)  == 0, "SIGBUS is NOT blocked");
        CHECK(sigismember(&set, SIGABRT) == 0,
              "SIGABRT is NOT blocked (abort() must reach the caller)");
    }

    /* --- case 1: the child inherits the block --- */
    {
        inherited_t got;
        pthread_t t;
        memset(&got, 0, sizeof(got));
        CHECK(shim_pthread_create(&t, NULL, report_mask, &got) == 0,
              "shim_pthread_create succeeded");
        pthread_join(t, NULL);
        CHECK(got.mask_ok, "the child could read its own mask");
        CHECK(got.term_blocked, "SIGTERM is BLOCKED in the created thread");
        CHECK(got.int_blocked,  "SIGINT is BLOCKED in the created thread");
        CHECK(got.hup_blocked,  "SIGHUP is BLOCKED in the created thread");
        CHECK(!got.segv_blocked, "SIGSEGV is NOT blocked in the created thread");
        CHECK(!got.abrt_blocked, "SIGABRT is NOT blocked in the created thread");
    }

    /* --- case 2: the CREATING thread's mask is restored exactly --- */
    {
        sigset_t before, after;
        pthread_t t;
        inherited_t sink;
        memset(&sink, 0, sizeof(sink));

        sigemptyset(&before);
        sigemptyset(&after);
        pthread_sigmask(SIG_BLOCK, NULL, &before);
        CHECK(!sigismember(&before, SIGTERM),
              "precondition: SIGTERM is not blocked in the creating thread");

        shim_pthread_create(&t, NULL, report_mask, &sink);
        pthread_join(t, NULL);

        pthread_sigmask(SIG_BLOCK, NULL, &after);
        CHECK(!sigismember(&after, SIGTERM),
              "SIGTERM is NOT blocked in the creating thread afterwards");
        CHECK(memcmp(&before, &after, sizeof(sigset_t)) == 0,
              "the creating thread's mask is restored exactly");
    }

    /* --- case 2b: a caller that WAS blocking stays blocked --- */
    {
        sigset_t block_term, saved, after;
        pthread_t t;
        inherited_t sink;
        memset(&sink, 0, sizeof(sink));

        sigemptyset(&block_term);
        sigaddset(&block_term, SIGTERM);
        pthread_sigmask(SIG_BLOCK, &block_term, &saved);

        shim_pthread_create(&t, NULL, report_mask, &sink);
        pthread_join(t, NULL);

        sigemptyset(&after);
        pthread_sigmask(SIG_BLOCK, NULL, &after);
        CHECK(sigismember(&after, SIGTERM),
              "a caller that already blocked SIGTERM still blocks it after");

        pthread_sigmask(SIG_SETMASK, &saved, NULL);
    }

    /* --- case 3: end to end, one SIGTERM --- */
    {
        int status = 0;
        CHECK(run_host_shaped_child(1, &status) == 0, "host-shaped child ran");
        CHECK(!WIFSIGNALED(status),
              "the child was NOT killed by the default disposition");
        CHECK(WIFEXITED(status) && WEXITSTATUS(status) == EXIT_GRACEFUL,
              "SIGTERM reached the sigwait thread and the child exited its own way");
    }

    /* --- case 4: repeated SIGTERMs — the kernel gets many chances to pick a
     *     worker thread, and must never be able to. --- */
    {
        int status = 0;
        CHECK(run_host_shaped_child(20, &status) == 0, "repeat-kill child ran");
        CHECK(!WIFSIGNALED(status),
              "20 SIGTERMs never landed on an unblocked worker thread");
        CHECK(WIFEXITED(status) && WEXITSTATUS(status) == EXIT_GRACEFUL,
              "the sigwait thread still took it after 20 tries");
    }

    if (failures) { printf("FAILED (%d)\n", failures); return 1; }
    printf("PASS\n");
    return 0;
}
