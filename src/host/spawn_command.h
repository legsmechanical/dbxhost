/* ---- spawning a helper process from inside Move -----------------------------
 *
 * ⚠⚠ fork() + execvp() is the trap this exists to close. MoveOriginal is
 * heavily multithreaded, and these calls come from its threads — including the
 * SPI one. After fork() the child has ONE thread but inherits every lock in
 * whatever state it was in, and execvp() searches PATH, which allocates: if any
 * other thread held the malloc lock at the instant of the fork, the child
 * blocks forever on a lock whose owner does not exist in it. It never reaches
 * exec, so it keeps the parent's name and argv — observed on device 2026-08-23
 * as a process called "Audio Main/SPI" carrying Move's argv, PPid 1, holding
 * Move's image open after Move had exited.
 *
 * posix_spawnp is glibc's answer: it clones with CLONE_VFORK and does the PATH
 * search on the child stack, so nothing between the clone and the exec can take
 * a lock the child does not own.
 *
 * Two callers had their own copy of the fork/execvp version (the shim and the
 * JS host); this is that code, once.
 */
#ifndef SPAWN_COMMAND_H
#define SPAWN_COMMAND_H

/* Run argv to completion. Returns the exit status, or -1 if the process could
 * not be started or did not exit normally. argv[0] is looked up on PATH.
 *
 * The child is put back on SCHED_OTHER: children of Move's audio threads would
 * otherwise inherit SCHED_FIFO and compete with the SPI driver.
 *
 * ⚠ Blocks the calling thread until the child exits — same contract as the
 * fork/waitpid version it replaces. Do not call it from the audio callback.
 */
int spawn_command(const char *const argv[]);

/* Fire-and-forget: returns as soon as the child is started, which is put in its
 * own session with stdio on /dev/null. Same anti-deadlock reasoning as above —
 * more so, since nothing ever waits on this one, so a child stuck before exec
 * is a process nobody is looking at. Returns 0 if it was started, -1 if not. */
int spawn_command_background(const char *const argv[]);

#endif /* SPAWN_COMMAND_H */
