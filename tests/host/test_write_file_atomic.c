/* Behavioural unit for schwung_write_file_atomic (src/host/file_atomic.c).
 *
 * The property under test is the one a power cut depends on: the destination
 * is never observable in a half-written state, and a failed write leaves the
 * previous contents intact rather than a truncated file. The temp sibling must
 * also never be left behind — it would show up in directory scans forever.
 */
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "file_atomic.h"

static int failures = 0;

static void check(int cond, const char *what) {
    if (!cond) {
        fprintf(stderr, "FAIL: %s\n", what);
        failures++;
    }
}

static char *slurp(const char *path, size_t *out_len) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = malloc((size_t)n + 1);
    size_t got = fread(buf, 1, (size_t)n, f);
    fclose(f);
    buf[got] = '\0';
    if (out_len) *out_len = got;
    return buf;
}

static int exists(const char *path) {
    struct stat st;
    return stat(path, &st) == 0;
}

int main(void) {
    char dir[] = "/tmp/schwung_atomic_XXXXXX";
    if (!mkdtemp(dir)) {
        perror("mkdtemp");
        return 1;
    }

    char path[PATH_MAX], tmp[PATH_MAX];
    snprintf(path, sizeof(path), "%s/state.json", dir);
    snprintf(tmp, sizeof(tmp), "%s.tmp", path);

    /* 1. A plain write lands complete, and leaves no temp sibling behind. */
    const char *first = "{\"v\":36,\"tracks\":8}";
    check(schwung_write_file_atomic(path, first, strlen(first)) == 0, "first write returns 0");
    char *got = slurp(path, NULL);
    check(got && strcmp(got, first) == 0, "first write content matches");
    free(got);
    check(!exists(tmp), "no .tmp left after a successful write");

    /* 2. Overwriting with SHORTER content replaces the file wholesale — the
     *    tail of the previous, longer document must not survive. That is
     *    exactly what an in-place write would leave behind. */
    const char *second = "{\"v\":36}";
    check(schwung_write_file_atomic(path, second, strlen(second)) == 0, "second write returns 0");
    size_t len = 0;
    got = slurp(path, &len);
    check(got && strcmp(got, second) == 0 && len == strlen(second),
          "shorter overwrite leaves no tail of the longer previous content");
    free(got);

    /* 2b. The destination is REPLACED, not rewritten: a rename installs a new
     *     inode, an in-place write keeps the old one. This is the only part of
     *     atomicity a single-process test can observe directly — without it
     *     every check here passes an implementation that truncates the live
     *     file, which is the bug this unit exists to keep out. */
    struct stat before, after;
    check(stat(path, &before) == 0, "stat before overwrite");
    const char *replaced = "{\"v\":36,\"replaced\":true}";
    check(schwung_write_file_atomic(path, replaced, strlen(replaced)) == 0, "replacing write returns 0");
    check(stat(path, &after) == 0, "stat after overwrite");
    check(before.st_ino != after.st_ino,
          "overwrite installs a NEW inode (temp+rename), it does not rewrite in place");

    /* 3. A big payload (past any single-write chunking) round-trips exactly. */
    size_t big_len = 400000;
    char *big = malloc(big_len + 1);
    for (size_t i = 0; i < big_len; i++) big[i] = (char)('a' + (i % 26));
    big[big_len] = '\0';
    check(schwung_write_file_atomic(path, big, big_len) == 0, "big write returns 0");
    got = slurp(path, &len);
    check(got && len == big_len && memcmp(got, big, big_len) == 0, "big write round-trips exactly");
    free(got);

    /* 4. A FAILED write leaves the previous contents intact and drops the temp.
     *    The failure is forced by a destination whose ".tmp" sibling cannot be
     *    created (the directory does not exist) — deterministic, and unlike a
     *    permissions trick it behaves the same when the suite runs as root. */
    char missing[PATH_MAX];
    snprintf(missing, sizeof(missing), "%s/nope/state.json", dir);
    check(schwung_write_file_atomic(missing, "x", 1) == -1, "write into a missing dir fails");
    got = slurp(path, &len);
    check(got && len == big_len, "a failed write elsewhere left the good file untouched");
    free(got);
    free(big);

    /* 5. A stale .tmp from an earlier crash is overwritten, not appended to. */
    FILE *stale = fopen(tmp, "w");
    fputs("GARBAGE-FROM-A-CRASHED-RUN", stale);
    fclose(stale);
    const char *third = "{\"v\":36,\"after\":\"stale tmp\"}";
    check(schwung_write_file_atomic(path, third, strlen(third)) == 0, "write over a stale tmp returns 0");
    got = slurp(path, NULL);
    check(got && strcmp(got, third) == 0, "stale tmp content does not leak into the destination");
    free(got);
    check(!exists(tmp), "no .tmp left after writing over a stale one");

    /* 6. A path so long that "<path>.tmp" would not fit is refused, not
     *    silently written in place. */
    char toolong[PATH_MAX];
    memset(toolong, 'a', sizeof(toolong) - 1);
    toolong[sizeof(toolong) - 1] = '\0';
    check(schwung_write_file_atomic(toolong, "x", 1) == -1, "over-long path is refused");

    unlink(path);
    rmdir(dir);

    if (failures) {
        fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    printf("test_write_file_atomic: all checks passed\n");
    return 0;
}
