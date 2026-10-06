/*
 * module_dlopen.h — how the host opens a module's shared library.
 *
 * ONE RULE: a module's code is never unmapped while the host runs.
 *
 * Every loader here pairs dlopen() with a dlclose() right after the module's
 * destroy_instance(). That is only safe if no thread is still executing the
 * module's code — and a module may own threads the host knows nothing about.
 * A module whose destroy only SIGNALS its worker (a detached thread that then
 * frees the engine itself) returns at once; the host dlclose()d, the worker
 * woke a few milliseconds later inside pages that were gone, and the whole
 * host died with SIGSEGV at pc == the fault address. On a set switch that is
 * every slot, so one such module in a project made the project impossible to
 * leave — and, if it was the project a session opens on, impossible to start.
 *
 * RTLD_NODELETE makes dlclose() drop the reference without unmapping. The cost
 * is the library's text and data staying resident (a module's heap is its
 * instance, which destroy_instance still frees) and its statics keeping their
 * values across an unload — which a second instance of the same module
 * already had to tolerate, since dlopen() is reference-counted.
 *
 * ⚠ A redeployed module is therefore not picked up by unloading and reloading
 * it: the host must be restarted, as BUILDING.md and CLAUDE.md already say.
 *
 * Use MODULE_DLOPEN_FLAGS for every dlopen() of module code. A source pin
 * (tests/host/test_modules_stay_mapped.sh) refuses a bare flag set.
 */
#ifndef SCHWUNG_MODULE_DLOPEN_H
#define SCHWUNG_MODULE_DLOPEN_H

#include <dlfcn.h>

#define MODULE_DLOPEN_FLAGS (RTLD_NOW | RTLD_LOCAL | RTLD_NODELETE)

#endif /* SCHWUNG_MODULE_DLOPEN_H */
