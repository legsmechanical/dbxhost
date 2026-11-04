/*
 * ui_publish_shm.h -- a JSON description of what a module's UI shows, for
 * remote viewers.
 *
 * Written by shadow_ui (host_ui_publish), read by display_server, which streams
 * it as `event: ui` on /stream-auto?v=2 beside the OLED frame and the control
 * surface. The content is the module's business (a JSON document); the host
 * only carries the latest one. It is a latest-state page, not a log: a reader
 * that misses a document just gets the next.
 *
 * Torn-read protection is a sequence counter: the writer makes it ODD before
 * writing and EVEN after; a reader copies only between two equal, even reads.
 *
 * The one field written the OTHER way is `viewer_ms`: display_server stamps it
 * (CLOCK_MONOTONIC) on every pass while a v=2 client is connected, and the
 * writer reads it to decide whether describing its screen is worth doing at
 * all. Nobody watching = the module does no work. It is a single aligned
 * 64-bit store, outside the sequence counter.
 */
#ifndef UI_PUBLISH_SHM_H
#define UI_PUBLISH_SHM_H

#include <stdint.h>

#include "schwung_paths.h"

#define UI_PUBLISH_SHM_NAME   SCHWUNG_SHM_PREFIX "ui-publish"
#ifndef UI_PUBLISH_SHM_PATH   /* tests point it at a plain file */
#define UI_PUBLISH_SHM_PATH   "/dev/shm" SCHWUNG_SHM_PREFIX "ui-publish"
#endif
#define UI_PUBLISH_MAGIC      "UIPUB1"
#define UI_PUBLISH_VERSION    1
#define UI_PUBLISH_MAX        16352       /* JSON bytes; the page is 16 KB */
#define UI_PUBLISH_VIEWER_MS  2000        /* a viewer stamp older than this = nobody watching */
#define UI_PUBLISH_STALE_MS   3000        /* no call for this long = the writer stopped */

typedef struct {
    char magic[8];
    uint32_t version;              /* UI_PUBLISH_VERSION */
    uint32_t seq;                  /* odd while writing */
    uint64_t last_update_ms;       /* CLOCK_MONOTONIC, the writer's last call (a document or a
                                    * probe): older than UI_PUBLISH_STALE_MS = it stopped */
    uint64_t viewer_ms;            /* CLOCK_MONOTONIC, written by the READER */
    uint32_t len;                  /* bytes of json[] in use, 0 = nothing yet */
    uint32_t reserved;
    char json[UI_PUBLISH_MAX];
} ui_publish_shm_t;

#include <stddef.h>
_Static_assert(offsetof(ui_publish_shm_t, seq) == 12, "ui publish layout");
_Static_assert(offsetof(ui_publish_shm_t, last_update_ms) == 16, "ui publish layout");
_Static_assert(offsetof(ui_publish_shm_t, viewer_ms) == 24, "ui publish layout");
_Static_assert(offsetof(ui_publish_shm_t, json) == 40, "ui publish layout");
_Static_assert(sizeof(ui_publish_shm_t) == 16384 + 8, "ui publish layout");

#include <string.h>
/* The writer marks a fresh page as ours (magic + version) before its first
 * document; a reader ignores a page without them. */
static inline void ui_publish_shm_init(ui_publish_shm_t *m) {
    memcpy(m->magic, UI_PUBLISH_MAGIC, sizeof(UI_PUBLISH_MAGIC));
    m->version = UI_PUBLISH_VERSION;
}

#endif /* UI_PUBLISH_SHM_H */
