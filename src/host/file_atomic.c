/* file_atomic.c — see file_atomic.h for the contract and the reasoning. */
#include "file_atomic.h"

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <unistd.h>

int schwung_write_file_atomic(const char *path, const char *data, size_t len) {
    if (!path || (!data && len)) return -1;

    char tmp[PATH_MAX];
    int n = snprintf(tmp, sizeof(tmp), "%s.tmp", path);
    if (n < 0 || (size_t)n >= sizeof(tmp)) return -1;

    int fd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return -1;

    size_t off = 0;
    while (off < len) {
        ssize_t w = write(fd, data + off, len - off);
        if (w < 0) {
            if (errno == EINTR) continue;
            break;
        }
        off += (size_t)w;
    }

    /* fsync BEFORE the rename: rename(2) orders the metadata, not the data, so
     * publishing an unflushed temp file can hand a crash a named-but-empty
     * destination — the very failure this function exists to prevent. */
    int ok = (off == len) && (fsync(fd) == 0);
    if (close(fd) != 0) ok = 0;

    if (!ok || rename(tmp, path) != 0) {
        unlink(tmp);
        return -1;
    }
    return 0;
}
