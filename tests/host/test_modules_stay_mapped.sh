#!/usr/bin/env bash
# A module's code stays mapped after the host unloads it.
#
# THE CRASH THIS PINS: a module whose destroy_instance() only signals a
# detached worker thread returns immediately; the host dlclose()d the library,
# and the worker woke a few ms later inside unmapped pages — SIGSEGV with
# pc == fault address, on every set switch away from a project holding that
# module. The host now opens module code with MODULE_DLOPEN_FLAGS
# (RTLD_NODELETE), so dlclose() never unmaps it.
#
# Two halves: (1) a toy module that does exactly that, driven the way the
# host drives one, must survive; (2) every dlopen() of module code in the host
# uses the shared flags.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0
T="$(mktemp -d "${TMPDIR:-/tmp}/stay-mapped.XXXXXX")"
trap 'rm -rf "$T"' EXIT

cat > "$T/toy.c" <<'C'
#include <pthread.h>
#include <stdatomic.h>
#include <time.h>
static atomic_int closing, cleaned;
static void nap(int ms) { struct timespec ts = { 0, ms * 1000000L }; nanosleep(&ts, 0); }
static void *worker(void *a) { (void)a;
    while (!atomic_load(&closing)) nap(4);
    nap(60);                      /* well past the host's dlclose */
    atomic_store(&cleaned, 1);    /* runs in this library's code and data */
    return 0; }
void toy_create(void)  { pthread_t t; pthread_create(&t, 0, worker, 0); pthread_detach(t); }
void toy_destroy(void) { atomic_store(&closing, 1); }   /* the worker owns the teardown */
C
cat > "$T/host.c" <<'C'
#include <stdio.h>
#include <time.h>
#include "host/module_dlopen.h"
#ifndef FLAGS
#define FLAGS MODULE_DLOPEN_FLAGS
#endif
int main(int argc, char **argv) {
    void *h = dlopen(argv[1], FLAGS);
    if (!h) { fprintf(stderr, "dlopen: %s\n", dlerror()); return 3; }
    void (*create)(void)  = (void (*)(void))dlsym(h, "toy_create");
    void (*destroy)(void) = (void (*)(void))dlsym(h, "toy_destroy");
    if (!create || !destroy) return 3;
    create();
    struct timespec ts = { 0, 30 * 1000000L }; nanosleep(&ts, 0);
    destroy();
    dlclose(h);                   /* what every unload path does next */
    ts.tv_nsec = 300 * 1000000L; nanosleep(&ts, 0);
    (void)argc; return 0;
}
C
SH="-shared -fPIC"
if ! cc -std=gnu11 $SH "$T/toy.c" -o "$T/toy.so" -lpthread 2>"$T/err" \
   || ! cc -std=gnu11 -Isrc "$T/host.c" -o "$T/host" -ldl 2>>"$T/err" \
   || ! cc -std=gnu11 -Isrc -DFLAGS='(RTLD_NOW|RTLD_LOCAL)' "$T/host.c" -o "$T/host_bare" -ldl 2>>"$T/err"; then
    echo "FAIL: could not build the rig:" >&2; cat "$T/err" >&2; exit 1
fi

"$T/host" "$T/toy.so"; rc=$?
if [ $rc -eq 0 ]; then echo "PASS: a module's detached worker outlives the unload"
else echo "FAIL: the host died (exit $rc) when a module's worker ran after dlclose" >&2; fail=1; fi

# Negative control: without the flag the same rig must die, or the check above
# proves nothing. (Verified on glibc and on macOS: both unmap.)
( "$T/host_bare" "$T/toy.so" ) >/dev/null 2>&1; rc=$?
if [ $rc -ne 0 ]; then echo "PASS: control - without RTLD_NODELETE the same rig crashes (exit $rc)"
else echo "FAIL: control - the rig survived WITHOUT the flag, so the test above cannot fail" >&2; fail=1; fi

# Source pin: no loader of module code opens it with a bare flag set.
bare="$(grep -rnE 'dlopen\([^;]*RTLD_(NOW|LAZY)' src --include='*.c' --include='*.h' \
        | grep -v '^src/lib/' | grep -v '^src/host/module_dlopen.h')"
if [ -n "$bare" ]; then echo "FAIL: dlopen without MODULE_DLOPEN_FLAGS:" >&2; echo "$bare" >&2; fail=1; fi
n="$(grep -rn 'dlopen(.*MODULE_DLOPEN_FLAGS' src --include='*.c' | grep -v '^src/lib/' | wc -l | tr -d ' ')"
if [ "$n" -lt 11 ]; then echo "FAIL: only $n loaders use MODULE_DLOPEN_FLAGS (11 expected) - the pin's grep no longer matches" >&2; fail=1
else echo "PASS: all $n module loaders use MODULE_DLOPEN_FLAGS"; fi
exit $fail
