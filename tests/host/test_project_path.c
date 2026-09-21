/* test_project_path — dbx_project_dir(): the seam that turns a set-library
 * entry into the directory a project's files really live in.
 *
 * The case that matters is the one that does not exist yet: an entry that is a
 * SYMLINK onto a project stored elsewhere. It is tested here with a real
 * symlink and a real realpath(), not a stub, because the whole value of the
 * function is what the kernel does — and a stub would only re-assert what I
 * already believe.
 *
 * The identity case is pinned just as hard: it is the claim that routing every
 * caller through this function changes NO behaviour today, and that claim is
 * what makes the change safe to land on its own. */
/* ⚠ glibc hides POSIX declarations under -std=c11 (which this suite uses), so
 * mkdtemp/symlink/realpath come back IMPLICITLY DECLARED — i.e. int-returning.
 * The truncated pointer from mkdtemp then reached realpath and _FORTIFY_SOURCE
 * aborted the test with "buffer overflow detected". macOS declares them
 * regardless, so the local run was green and only the Linux run caught it.
 * [[local-green-on-a-different-libc-is-not-green]] */
#define _DEFAULT_SOURCE    /* glibc: POSIX 2008 + BSD, which -std=c11 hides */
#define _DARWIN_C_SOURCE   /* macOS: same job. ⚠ _XOPEN_SOURCE would HIDE
                            * mkdtemp here — it is a BSD extension — so the
                            * obvious portable-looking macro breaks the OTHER
                            * platform. Both are needed; neither alone. */

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "dbx_project_path.h"

static int fails = 0;
static void ok(const char *what)  { printf("  ok   %s\n", what); }
static void bad(const char *what, const char *got, const char *want) {
    fprintf(stderr, "  FAIL %s\n        got  %s\n        want %s\n", what, got, want);
    fails = 1;
}
static void eq(const char *what, const char *got, const char *want) {
    if (strcmp(got, want) == 0) ok(what); else bad(what, got, want);
}

int main(void)
{
    char tmpl[] = "/tmp/dbx-projpath-XXXXXX";
    char *made = mkdtemp(tmpl);
    char base[DBX_PROJECT_PATH_MAX];   /* ⚠ realpath(p, buf) may write up to
                                        * PATH_MAX. A 256-byte buffer here
                                        * aborted under glibc's _FORTIFY_SOURCE
                                        * ("buffer overflow detected") while
                                        * passing on macOS, where the resolved
                                        * path happened to be short. */
    char sets[512], projects[512], real_dir[1024], link_path[1024];
    char out[DBX_PROJECT_PATH_MAX];
    assert(made && "mkdtemp");
    /* ⚠ The temp root itself may be reached through a symlink — on macOS
     * /tmp IS one, to /private/tmp. realpath() resolves parent components
     * too, so expectations must be built from the RESOLVED base or every
     * assertion fails for a reason that has nothing to do with the code.
     * (On the Move no component of the set library is a symlink — checked on
     * the device — which is why resolving is the identity there.) */
    {   /* the malloc form, as dbx_project_path.h uses, so no PATH_MAX
         * assumption is needed at all */
        char *rp = realpath(made, NULL);
        snprintf(base, sizeof(base), "%s", rp ? rp : made);
        free(rp);
    }

    snprintf(sets, sizeof(sets), "%s/Sets", base);
    snprintf(projects, sizeof(projects), "%s/projects", base);
    assert(mkdir(sets, 0755) == 0);
    assert(mkdir(projects, 0755) == 0);

    printf("test_project_path\n");

    /* ---- 1. a plain directory entry resolves to itself -------------------
     * This is TODAY's whole behaviour. If this ever stops holding, routing
     * callers through the seam is no longer a no-op and the phase that did so
     * was not safe. */
    snprintf(real_dir, sizeof(real_dir), "%s/plain-uuid", sets);
    assert(mkdir(real_dir, 0755) == 0);
    dbx_project_dir(sets, "plain-uuid", out, sizeof(out));
    eq("a real set dir resolves to itself (the identity claim)", out, real_dir);

    /* ---- 2. a SYMLINK entry resolves to its target ------------------------
     * The case the seam exists for. */
    char target[1024];
    snprintf(target, sizeof(target), "%s/actual-project", projects);
    assert(mkdir(target, 0755) == 0);
    snprintf(link_path, sizeof(link_path), "%s/slot-uuid", sets);
    assert(symlink(target, link_path) == 0);
    dbx_project_dir(sets, "slot-uuid", out, sizeof(out));
    eq("a symlinked entry resolves to the project it points at", out, target);

    /* ---- 3. re-pointing the symlink changes where NEW paths land ---------- */
    char target2[1024];
    snprintf(target2, sizeof(target2), "%s/other-project", projects);
    assert(mkdir(target2, 0755) == 0);
    assert(unlink(link_path) == 0);
    assert(symlink(target2, link_path) == 0);
    dbx_project_dir(sets, "slot-uuid", out, sizeof(out));
    eq("re-pointing the entry re-aims the NEXT resolution", out, target2);

    /* ---- 4. …but a path already resolved is NOT re-aimed ------------------
     * The structural property. Resolve, then move the window, and the string
     * in hand still names the project it named before. This is what makes a
     * deferred write land where it was aimed instead of wherever the window
     * happens to point when it finally runs. */
    char held[DBX_PROJECT_PATH_MAX];
    dbx_project_dir(sets, "slot-uuid", held, sizeof(held));
    assert(unlink(link_path) == 0);
    assert(symlink(target, link_path) == 0);      /* window moved back */
    eq("an ALREADY-RESOLVED path is unaffected by a later re-point", held, target2);

    /* ---- 5. a project that does not exist yet keeps the join --------------
     * realpath() fails ENOENT here. Returning empty would file a fresh
     * project's first write nowhere at all. */
    char want_join[2048];
    snprintf(want_join, sizeof(want_join), "%s/not-created-yet", sets);
    dbx_project_dir(sets, "not-created-yet", out, sizeof(out));
    eq("an uncreated project keeps the literal join", out, want_join);

    /* ---- 6. refuses to invent a path from nothing ------------------------- */
    out[0] = 'x';
    dbx_project_dir(sets, "", out, sizeof(out));
    eq("empty uuid yields empty, not the bare root", out, "");
    out[0] = 'x';
    dbx_project_dir(NULL, "u", out, sizeof(out));
    eq("NULL root yields empty", out, "");

    /* ---- 7. a dangling window keeps the join, rather than vanishing -------
     * Measured on device 2026-09-21: a dangling entry is INVISIBLE to
     * repair-indices (os.path.isdir is false), so it can persist. It must not
     * also make a path disappear here. */
    assert(unlink(link_path) == 0);
    snprintf(target2, sizeof(target2), "%s/gone", projects);
    assert(symlink(target2, link_path) == 0);
    snprintf(want_join, sizeof(want_join), "%s/slot-uuid", sets);
    dbx_project_dir(sets, "slot-uuid", out, sizeof(out));
    eq("a DANGLING window keeps the join", out, want_join);

    /* cleanup (best effort; /tmp, and the test is the only writer) */
    unlink(link_path);
    rmdir(real_dir); rmdir(target);
    snprintf(target2, sizeof(target2), "%s/other-project", projects);
    rmdir(target2); rmdir(sets); rmdir(projects); rmdir(base);

    if (fails) { fprintf(stderr, "test_project_path: FAILED\n"); return 1; }
    printf("test_project_path: all pass\n");
    return 0;
}
