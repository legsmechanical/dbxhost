/*
 * shim_thread.h — create shim threads that can never steal the host's signals.
 *
 * WHY THIS EXISTS
 * ---------------
 * The shim is LD_PRELOADed into a host process it does not own. That host
 * handles its shutdown signals the modern way: a dedicated thread sits in
 * sigwait()/signalfd() while every other thread of the host BLOCKS those
 * signals. Nothing is installed with sigaction(), so there is no handler for
 * a diagnostic one to chain to.
 *
 * A process-directed signal (`kill(pid)`, `pkill`) is delivered to ANY ONE
 * thread that does not block it — the kernel picks. The shim adds a dozen or
 * so threads to that process. Every one of them that leaves SIGTERM unblocked
 * is a thread the kernel may choose, and if it does, the host's sigwait thread
 * never wakes: the shutdown that saves state and quiesces the audio hardware
 * simply does not run, and the process dies by the default disposition
 * instead. Because the choice is the kernel's, the symptom is intermittent —
 * the same command works most days and bursts audio on exit the rest.
 *
 * The fix is not a better handler. It is that NO shim thread may ever be an
 * eligible receiver. Create every shim thread through shim_pthread_create():
 * a new thread inherits the creating thread's signal mask, so blocking the
 * signals across the pthread_create() call hands the child a mask that
 * excludes it from delivery, permanently, from the moment it exists. The
 * caller's own mask is restored exactly afterwards, so a thread that was
 * signal-receptive for its own reasons stays that way.
 *
 * WHICH SIGNALS
 * -------------
 * Only the three the host's SignalManager owns and acts on: SIGTERM, SIGINT,
 * SIGHUP. Each is a process-directed *request* whose correct receiver is the
 * host. The set is deliberately minimal:
 *
 *   - Synchronous faults (SIGSEGV/SIGBUS/SIGFPE/SIGILL) are NOT included and
 *     must not be. They are delivered to the faulting thread itself, blocking
 *     them is undefined behaviour, and the shim's own crash handler wants
 *     them — that is the diagnostic this build exists to keep.
 *   - SIGABRT is not included, for the same reason: abort() must reach the
 *     thread that called it.
 *   - Realtime/timer signals are not included; nothing here uses them, and a
 *     blanket sigfillset() would silently disable any future use.
 *
 * ASYNC-SIGNAL SAFETY
 * -------------------
 * None required. Nothing here is called from a signal handler — these are
 * ordinary thread-startup paths. pthread_sigmask() is two rt_sigprocmask(2)
 * syscalls, which is negligible beside the clone(2) and stack mmap that
 * pthread_create() itself performs; one call site (the chain bus worker) is
 * on the audio callback and already documents pthread_create there as its one
 * deliberate allocation, so this adds no new class of cost.
 */
#ifndef SHIM_THREAD_H
#define SHIM_THREAD_H

#include <pthread.h>
#include <signal.h>

/* The signals the host's SignalManager owns. See the header comment: minimal
 * on purpose, and synchronous faults are deliberately absent. */
static inline void shim_host_signal_set(sigset_t *set)
{
    sigemptyset(set);
    sigaddset(set, SIGTERM);
    sigaddset(set, SIGINT);
    sigaddset(set, SIGHUP);
}

/*
 * Block the host's signals in the CALLING thread, saving the previous mask
 * into *saved. Pair with shim_unblock_host_signals().
 *
 * Use this directly around a third-party library call that spawns threads of
 * its own (the threads it creates inherit the mask the same way), when the
 * library gives no hook to wrap its pthread_create.
 */
static inline void shim_block_host_signals(sigset_t *saved)
{
    sigset_t block;
    shim_host_signal_set(&block);
    pthread_sigmask(SIG_BLOCK, &block, saved);
}

/* Restore exactly the mask shim_block_host_signals() saved. */
static inline void shim_unblock_host_signals(const sigset_t *saved)
{
    pthread_sigmask(SIG_SETMASK, saved, NULL);
}

/*
 * pthread_create(), with the host's shutdown signals blocked in the child.
 *
 * Drop-in: same arguments, same return value (0 or an errno). The caller's
 * signal mask is unchanged on return, whether the create succeeded or not.
 */
static inline int shim_pthread_create(pthread_t *thread,
                                      const pthread_attr_t *attr,
                                      void *(*start_routine)(void *),
                                      void *arg)
{
    sigset_t saved;
    int rc;

    shim_block_host_signals(&saved);
    rc = pthread_create(thread, attr, start_routine, arg);
    shim_unblock_host_signals(&saved);

    return rc;
}

#endif /* SHIM_THREAD_H */
