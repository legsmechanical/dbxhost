/* host_api_v1_t keeps upstream Schwung's geometry: a NULL run from +120, the
 * struct 184 bytes, and this fork's two extra callbacks in the last two slots.
 *
 * Two different binaries depend on this, in opposite directions:
 *
 *   - a module whose own copy of plugin_api_v1.h declares a field the host does
 *     not have (breakbeat: `get_project_bpm` at +120) must find NULL there, or
 *     its `if (host->fn)` guard passes and it calls whatever is at that offset;
 *   - a dAVEBOx binary run under STOCK Schwung reads its two callbacks out of a
 *     184-byte struct, so they must lie inside it -- where stock has zeroed
 *     reserved slots -- and never past its end.
 *
 * The checks are about GEOMETRY. A zeroed-struct probe alone cannot see a live
 * field moved to +120: in a memset struct it reads NULL and passes. */

#include <stdio.h>
#include <stddef.h>
#include <string.h>

#include "plugin_api_v1.h"

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { printf("FAIL: "); printf(__VA_ARGS__); \
    printf("\n      (%s:%d: %s)\n", __FILE__, __LINE__, #cond); failures++; } } while (0)

/* Observed, not a round number: the offset breakbeat's drifted header calls. */
#define BREAKBEAT_OVERREAD_OFFSET 120
/* Upstream's sizeof(host_api_v1_t) since the reserved tail landed. */
#define UPSTREAM_SIZEOF 184

int main(void) {
    host_api_v1_t api;
    memset(&api, 0, sizeof(api));

    const size_t run_off = offsetof(host_api_v1_t, reserved);
    const size_t run_end = run_off + sizeof(api.reserved);

    CHECK(offsetof(host_api_v1_t, get_beat_position) < run_off,
          "a real field sits inside the NULL run");
    CHECK(run_off <= BREAKBEAT_OVERREAD_OFFSET,
          "NULL run starts at +%zu, past +%d -- a live pointer now sits where "
          "breakbeat calls get_project_bpm", run_off, BREAKBEAT_OVERREAD_OFFSET);
    CHECK(run_end - run_off >= 48,
          "NULL run is %zu bytes; shrinking it puts over-reads back on live fields",
          run_end - run_off);
    CHECK(offsetof(host_api_v1_t, midi_send_internal_slot) == run_end,
          "midi_send_internal_slot is not directly after the NULL run");
    CHECK(offsetof(host_api_v1_t, clock_output_enabled) + sizeof(void *) <= UPSTREAM_SIZEOF,
          "clock_output_enabled ends past +%d -- under stock Schwung a dAVEBOx "
          "binary would read it off the end of a %d-byte struct",
          UPSTREAM_SIZEOF, UPSTREAM_SIZEOF);
    CHECK(sizeof(host_api_v1_t) == UPSTREAM_SIZEOF,
          "sizeof is %zu, want %d (upstream's)", sizeof(host_api_v1_t), UPSTREAM_SIZEOF);

    for (size_t off = run_off; off + sizeof(void *) <= run_end; off += sizeof(void *)) {
        void *p;
        memcpy(&p, (const char *)&api + off, sizeof(p));
        CHECK(p == NULL, "NULL-run slot at +%zu is %p", off, p);
    }

    if (failures == 0) {
        printf("PASS: host_api_v1_t NULL run +%zu..+%zu, fork fields at +%zu/+%zu, "
               "sizeof %zu\n", run_off, run_end - 1,
               offsetof(host_api_v1_t, midi_send_internal_slot),
               offsetof(host_api_v1_t, clock_output_enabled), sizeof(host_api_v1_t));
        return 0;
    }
    printf("\n%d check(s) failed\n", failures);
    return 1;
}
