/* dbx_project_path.h — the ONE place that turns a set-library entry into the
 * directory a project's files actually live in.
 *
 * TODAY THIS IS THE IDENTITY FUNCTION. A project IS `Sets/<uuid>`: the entry
 * is a real directory, so resolving it returns it unchanged. Verified on the
 * device 2026-09-21 — no component of `/data/UserData/UserLibrary/Sets` is a
 * symlink, and `realpath()` of a set dir returns the same string. A bind mount
 * (which is how the session's library is presented) introduces no symlink, so
 * that holds mounted too.
 *
 * ⭑ IT EXISTS BECAUSE THAT IS ABOUT TO STOP BEING TRUE. When a set-library
 * entry becomes a WINDOW onto a project stored in our own tree, every path
 * built from a uuid has to follow the window to the project. Routing them all
 * through here means the change lands in one function rather than in every
 * caller — and the callers are not a list anyone can hold in their head
 * (tests/host/test_set_path_sites.sh derives them; a hand-written list and an
 * adversarial review of it each missed some).
 *
 * ⭑ WHY RESOLVE AT ALL, RATHER THAN JUST PASS THE PATH THROUGH? Because a
 * path resolved ONCE, at the moment it is computed, cannot be re-aimed by a
 * later change to the window. That turns a timing argument into a structural
 * one. ⚠ Measured on hardware 2026-09-21: re-pointing a window while it was in
 * use wrote one project's session state into ANOTHER project's directory —
 * 4386 bytes of it — and left the project actually being edited untouched.
 * Silently, in both directions. Resolving at computation time makes that
 * unreachable rather than merely unlikely.
 *
 * ⚠ A path that does not exist yet CANNOT be resolved (realpath fails ENOENT),
 * which is the normal case for a project being created. The join is then kept
 * verbatim — returning empty would file a fresh project's first write nowhere.
 *
 * ⚠ DOES DIRECTORY I/O. Never call from the audio thread. Same rule, and the
 * same reason, as dbx_state_subdir.h — which this is usually called just before.
 *
 * ⚠ ONE RULE, TWO COPIES: this header is duplicated BYTE-IDENTICALLY into
 * davebox/dsp/, whose Docker build cannot see src/. check-config.sh pins them
 * equal. Edit both or neither. */
#ifndef DBX_PROJECT_PATH_H
#define DBX_PROJECT_PATH_H

#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef DBX_PROJECT_PATH_MAX
#define DBX_PROJECT_PATH_MAX 4096
#endif

/* Join <sets_root>/<uuid> and resolve it to where the project's files really
 * live. `out` is always NUL-terminated and never empty for non-empty input. */
static inline void dbx_project_dir(const char *sets_root, const char *uuid,
                                   char *out, size_t out_sz)
{
    char joined[DBX_PROJECT_PATH_MAX];
    char *resolved;

    if (!out || out_sz == 0) return;
    out[0] = '\0';
    if (!sets_root || !uuid || !*sets_root || !*uuid) return;

    snprintf(joined, sizeof(joined), "%s/%s", sets_root, uuid);

    /* ⚠ realpath(p, NULL) MALLOCS the result rather than demanding a caller
     * buffer of at least PATH_MAX. That matters here: the two-buffer form put
     * 8 KB on the stack of whichever thread called it, including the DSP's,
     * and "probably enough stack" is not a thing worth being probably right
     * about. Allocation is fine on this path — it already does directory I/O
     * and is never reached from the audio thread.
     *
     * A NULL return is the EXPECTED case for a project not yet created
     * (ENOENT), and is also what a malloc failure looks like; both fall back
     * to the literal join, which is the right answer for the first and the
     * safe answer for the second. */
    resolved = realpath(joined, NULL);
    if (resolved) {
        snprintf(out, out_sz, "%s", resolved);
        free(resolved);
    } else {
        snprintf(out, out_sz, "%s", joined);
    }
}

#endif /* DBX_PROJECT_PATH_H */
