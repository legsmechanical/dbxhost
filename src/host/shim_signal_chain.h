/*
 * shim_signal_chain.h — hand a caught signal back to the action that was
 * installed before ours.
 *
 * The shim installs a diagnostic signal handler inside a host process it does
 * not own. For genuinely fatal signals (SIGSEGV/SIGBUS/SIGABRT) terminating
 * from the handler is correct: the process is already unrecoverable.
 *
 * SIGTERM is different. It is a *request* addressed to the host process, and
 * the host's own handler is what runs its shutdown — saving state and, on this
 * hardware, quiescing the audio device. A diagnostic handler that _exit()s on
 * SIGTERM pre-empts that shutdown, and whether it does so depends only on
 * which handler was installed last. So the diagnostic must observe SIGTERM and
 * then hand it on, never consume it.
 *
 * Everything here is async-signal-safe: no allocation, no stdio, no locks.
 */
#ifndef SHIM_SIGNAL_CHAIN_H
#define SHIM_SIGNAL_CHAIN_H

#include <signal.h>
#include <string.h>

/* Should the diagnostic handler terminate the process itself for `sig`?
 * True for the fatal faults; false for SIGTERM, which belongs to the host. */
static inline int sigterm_is_fatal_here(int sig)
{
    return sig != SIGTERM;
}

/* Does `prev` name a handler function (as opposed to SIG_DFL / SIG_IGN)? */
static inline int shim_prev_action_is_handler(const struct sigaction *prev)
{
    if (!prev) return 0;
    if (prev->sa_flags & SA_SIGINFO) {
        void *p = (void *)(prev->sa_sigaction);
        return p != (void *)SIG_DFL && p != (void *)SIG_IGN;
    }
    return prev->sa_handler != SIG_DFL && prev->sa_handler != SIG_IGN;
}

/* Is `prev` SIG_IGN? */
static inline int shim_prev_action_is_ignore(const struct sigaction *prev)
{
    if (!prev) return 0;
    if (prev->sa_flags & SA_SIGINFO)
        return (void *)(prev->sa_sigaction) == (void *)SIG_IGN;
    return prev->sa_handler == SIG_IGN;
}

/*
 * Deliver (sig, info, ctx) to the action saved in `prev`.
 *
 *  - previous action is a handler → call it, respecting its SA_SIGINFO flag,
 *    and return (the caller's handler then returns normally too).
 *  - previous action is SIG_IGN   → return; the signal was to be ignored.
 *  - previous action is SIG_DFL, or nothing was saved → restore SIG_DFL,
 *    unblock the signal and re-raise it, so the default disposition (for
 *    SIGTERM, termination) takes effect. Does not return in that case.
 */
static inline void chain_prev_sigaction(const struct sigaction *prev,
                                        int sig, siginfo_t *info, void *ctx)
{
    if (shim_prev_action_is_handler(prev)) {
        if (prev->sa_flags & SA_SIGINFO) prev->sa_sigaction(sig, info, ctx);
        else                             prev->sa_handler(sig);
        return;
    }
    if (shim_prev_action_is_ignore(prev)) return;

    /* SIG_DFL. Put the default back and re-raise. The signal is blocked
     * while our handler runs (sigaction adds it to the mask by default),
     * so unblock it first to make the death immediate rather than pending. */
    {
        struct sigaction dfl;
        memset(&dfl, 0, sizeof(dfl));
        dfl.sa_handler = SIG_DFL;
        sigemptyset(&dfl.sa_mask);
        sigaction(sig, &dfl, NULL);
    }
    {
        sigset_t just_sig;
        sigemptyset(&just_sig);
        sigaddset(&just_sig, sig);
        sigprocmask(SIG_UNBLOCK, &just_sig, NULL);
    }
    raise(sig);
}

#endif /* SHIM_SIGNAL_CHAIN_H */
