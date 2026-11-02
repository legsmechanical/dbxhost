/* module_clone.h — load a PRIVATE COPY of a module's code: a byte copy at a
 * new path, dlopened, so the copy's globals (its stashed host API, its static
 * tables) are its own, never the live instance's. A second dlopen of the same
 * path would hand back the live mapping. (dlmopen is no answer: modules
 * dlsym `schwung_move_info` globally.)
 *
 * Copies are kept under `cache_dir` (never /tmp on the Move), named by the
 * module's directory name, mtime and size, and reused for the session: one
 * handle per (path, mtime, size). The mapping is NODELETE, so a copy is never
 * unloaded. Used by the offline MIDI FX jobs and the offline takes, each from
 * its own job thread. */
#ifndef MODULE_CLONE_H
#define MODULE_CLONE_H

#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "module_dlopen.h"
#include "schwung_paths.h"

#define MODULE_CLONE_SLOTS 32

/* `from` copied to `to` through a temp sibling + fsync + rename. */
static inline int module_clone_copy_file(const char *from, const char *to) {
    char tmp[700], buf[65536];
    int in, out, ok = 1;
    ssize_t n;
    snprintf(tmp, sizeof tmp, "%s.tmp.%d", to, (int)getpid());
    in = open(from, O_RDONLY);
    if (in < 0) return 0;
    out = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (out < 0) { close(in); return 0; }
    while ((n = read(in, buf, sizeof buf)) > 0)
        if (write(out, buf, (size_t)n) != n) { ok = 0; break; }
    if (n < 0) ok = 0;
    if (fsync(out) != 0) ok = 0;
    close(in);
    if (close(out) != 0) ok = 0;
    if (ok && rename(tmp, to) != 0) ok = 0;
    if (!ok) unlink(tmp);
    return ok;
}

/* .../<id>/dsp.so -> <id> */
static inline const char *module_clone_id(const char *so_path, char *out, size_t cap) {
    const char *end = strrchr(so_path, '/'), *beg;
    size_t n;
    if (!end) { snprintf(out, cap, "module"); return out; }
    beg = end;
    while (beg > so_path && beg[-1] != '/') beg--;
    n = (size_t)(end - beg);
    if (n >= cap) n = cap - 1;
    memcpy(out, beg, n); out[n] = '\0';
    return out;
}

/* A handle on the private copy of `so_path`, or NULL (logged through `log`
 * when given). `*fresh` (may be NULL) is set when this call made the handle,
 * so its init symbol has not been called yet. */
static inline void *module_clone_open(const char *so_path, const char *cache_dir,
                                      void (*log)(const char *), int *fresh) {
    static struct { char src[512]; long long mtime, size; void *h; } C[MODULE_CLONE_SLOTS];
    static int C_n;
    struct stat sb;
    char id[128], dst[800], msg[1000];
    void *h;
    int i;
    if (fresh) *fresh = 0;
    if (!so_path || stat(so_path, &sb) != 0) return NULL;
    for (i = 0; i < C_n; i++)
        if (C[i].mtime == (long long)sb.st_mtime && C[i].size == (long long)sb.st_size && !strcmp(C[i].src, so_path))
            return C[i].h;
    if (C_n >= MODULE_CLONE_SLOTS) return NULL;
    mkdir(SCHWUNG_INSTALL_DIR "/cache", 0755);
    mkdir(cache_dir, 0755);
    snprintf(dst, sizeof dst, "%s/%s-%lld-%lld.so", cache_dir, module_clone_id(so_path, id, sizeof id),
             (long long)sb.st_mtime, (long long)sb.st_size);
    if (access(dst, R_OK) != 0 && !module_clone_copy_file(so_path, dst)) {
        if (log) { snprintf(msg, sizeof msg, "could not copy %s -> %s (errno %d)", so_path, dst, errno); log(msg); }
        return NULL;
    }
    h = dlopen(dst, MODULE_DLOPEN_FLAGS);
    if (!h) {
        if (log) { snprintf(msg, sizeof msg, "dlopen %s: %s", dst, dlerror()); log(msg); }
        return NULL;
    }
    snprintf(C[C_n].src, sizeof C[C_n].src, "%s", so_path);
    C[C_n].mtime = (long long)sb.st_mtime;
    C[C_n].size = (long long)sb.st_size;
    C[C_n].h = h;
    C_n++;
    if (fresh) *fresh = 1;
    return h;
}

#endif /* MODULE_CLONE_H */
