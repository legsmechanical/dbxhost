/* sa_master_volume.c — the session's own master volume, remembered across
 * launches. The why is in the header. */
#include "sa_master_volume.h"

#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

#ifndef SCHWUNG_INSTALL_DIR
#define SCHWUNG_INSTALL_DIR "/data/UserData/dbx-host"
#endif

#define SA_MASTER_VOLUME_DEFAULT_PATH SCHWUNG_INSTALL_DIR "/sa_master_volume"

/* Fixed record length: a shorter value must never leave a longer one's tail
 * behind, or the reader sees "0.5000001.000000". Padding, not truncation, is
 * what makes the pwrite-at-offset-0 safe without an ftruncate. */
#define SA_MASTER_VOLUME_RECLEN 16

static const char *sa_path = SA_MASTER_VOLUME_DEFAULT_PATH;
static int sa_fd = -1;

void sa_master_volume_set_path_for_test(const char *path)
{
    sa_path = path ? path : SA_MASTER_VOLUME_DEFAULT_PATH;
    if (sa_fd >= 0) { close(sa_fd); sa_fd = -1; }
}

void sa_master_volume_open(void)
{
    if (sa_fd >= 0) return;
    sa_fd = open(sa_path, O_WRONLY | O_CREAT, 0644);
}

void sa_master_volume_store(float linear)
{
    char rec[SA_MASTER_VOLUME_RECLEN + 1];
    if (sa_fd < 0) return;
    if (!(linear >= 0.0f)) linear = 0.0f;      /* NaN-safe */
    if (linear > 1.0f) linear = 1.0f;
    snprintf(rec, sizeof(rec), "%-*.6f", SA_MASTER_VOLUME_RECLEN - 1, (double)linear);
    rec[SA_MASTER_VOLUME_RECLEN - 1] = '\n';
    (void)!pwrite(sa_fd, rec, SA_MASTER_VOLUME_RECLEN, 0);
}

int sa_master_volume_load(float *out)
{
    char buf[SA_MASTER_VOLUME_RECLEN + 1];
    ssize_t n;
    float v;
    int fd = open(sa_path, O_RDONLY);
    if (fd < 0) return 0;
    n = read(fd, buf, sizeof(buf) - 1);
    close(fd);
    if (n <= 0) return 0;
    buf[n] = '\0';
    if (sscanf(buf, "%f", &v) != 1) return 0;
    if (!(v >= 0.0f && v <= 1.0f)) return 0;   /* NaN-safe: excludes it too */
    if (out) *out = v;
    return 1;
}
