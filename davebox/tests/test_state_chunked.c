/* tests/test_state_chunked.c — the chunked state readback.
 *
 * The project state reaches JS through the shadow parameter transport, whose
 * value buffer is 64 KB, and a full project of notes alone approaches that
 * before automation is counted. A single-shot fetch therefore truncated, and
 * because readers parse with strstr the cut blob loaded as a quietly smaller
 * project. The state is now served in chunks and reassembled by the caller.
 *
 * What must hold:
 *   - the pieces concatenate to EXACTLY the same bytes the serializer produced;
 *   - the snapshot is taken once, so an edit landing mid-fetch cannot splice
 *     two versions of the project together;
 *   - the run terminates, and a project far larger than one chunk survives it. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* Reassemble exactly as ui_dsp_bridge.mjs does. */
static int fetch_chunked(hx_t *h, char *out, int out_len) {
    char part[65536];
    char key[32];
    int n = 0;
    for (int i = 0; i < 16; i++) {
        snprintf(key, sizeof(key), "state_chunk_%d", i);
        int got = hx_get_param(h, key, part, (int)sizeof(part));
        if (got <= 0) break;
        HX_ASSERT(n + got < out_len, "reassembly buffer too small");
        memcpy(out + n, part, (size_t)got);
        n += got;
    }
    out[n] = '\0';
    return n;
}

/* Fill past the old single-shot ceiling. Notes alone across every clip land at
 * roughly 62 KB — just UNDER it, which is precisely why the truncation was so
 * easy to miss — so a couple of tracks get chords to carry it over. */
static void fill(hx_t *h, int clips) {
    char k[128], v[128];
    for (int c = 0; c < clips; c++)
        for (int t = 0; t < NUM_TRACKS; t++)
            for (int s = 0; s < 32; s++) {
                snprintf(k, sizeof(k), "t%d_c%d_step_%d_toggle", t, c, s);
                snprintf(v, sizeof(v), "%d 100", 48 + (s % 12));
                hx_set_param(h, k, v);
            }
    for (int c = 0; c < clips; c++)
        for (int t = 0; t < 2; t++)
            for (int s = 0; s < 32; s++) {
                snprintf(k, sizeof(k), "t%d_c%d_step_%d_set_notes", t, c, s);
                snprintf(v, sizeof(v), "%d %d %d", 48+(s%12), 52+(s%12), 55+(s%12));
                hx_set_param(h, k, v);
            }
}

int main(void) {
    static char asm_buf[262144];
    static char one[131072];

    /* A project small enough for one chunk still works — the loop is the only
     * path now, so the common case must not depend on being large. */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
        hx_set_param(h, "bpm", "121");
        int n = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
        HX_ASSERT(n > 0, "small project served");
        HX_ASSERT(asm_buf[0] == '{' && asm_buf[n - 1] == '}', "complete JSON document");
        HX_ASSERT(strstr(asm_buf, "\"bpm\":121"), "content present");
        OK("a small project reassembles to one complete document");
        hx_destroy(h);
    }

    /* The case that used to lose music: past one chunk, and past the old 64 KB
     * transport ceiling. */
    {
        hx_t *h = hx_create(NULL);
        fill(h, NUM_CLIPS);
        hx_set_param(h, "bpm", "133");
        int n = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
        HX_ASSERT(n > 65535, "fixture must exceed the old single-shot ceiling to be a test of it");
        HX_ASSERT(asm_buf[n - 1] == '}', "the LAST byte is the document's — nothing was cut");
        OK("a project past the 64 KB transport ceiling comes back whole");

        char len[32];
        hx_get_param(h, "state_snap_len", len, sizeof(len));
        HX_ASSERT(atoi(len) == n, "the reported snapshot length matches what was reassembled");
        OK("the length the DSP reports is the length the caller gets — a short read is detectable");

        /* Serving must be idempotent per snapshot: the same chunk twice is the
         * same bytes. (A serializer re-run per chunk would drift here.) */
        char a[65536], b[65536];
        int n1 = hx_get_param(h, "state_chunk_1", a, (int)sizeof(a));
        int n2 = hx_get_param(h, "state_chunk_1", b, (int)sizeof(b));
        HX_ASSERT(n1 == n2 && (n1 == 0 || !memcmp(a, b, (size_t)n1)), "a chunk is stable");
        OK("re-reading a chunk returns the same bytes");
        hx_destroy(h);
    }

    /* An edit arriving mid-fetch must not splice two versions together: the
     * snapshot is taken at chunk 0 and later chunks come from it. */
    {
        hx_t *h = hx_create(NULL);
        fill(h, NUM_CLIPS);
        hx_set_param(h, "bpm", "111");

        char part[65536];
        int n = hx_get_param(h, "state_chunk_0", part, (int)sizeof(part));
        HX_ASSERT(n > 0, "chunk 0");
        memcpy(asm_buf, part, (size_t)n);
        int total = n;

        /* ... the user edits between chunks ... */
        hx_set_param(h, "bpm", "177");
        hx_set_param(h, "t0_c0_step_1_toggle", "72 90");

        for (int i = 1; i < 16; i++) {
            char key[32];
            snprintf(key, sizeof(key), "state_chunk_%d", i);
            int got = hx_get_param(h, key, part, (int)sizeof(part));
            if (got <= 0) break;
            memcpy(asm_buf + total, part, (size_t)got);
            total += got;
        }
        asm_buf[total] = '\0';
        HX_ASSERT(asm_buf[total - 1] == '}', "still one complete document");
        HX_ASSERT(strstr(asm_buf, "\"bpm\":111"), "the snapshot is the one chunk 0 took");
        HX_ASSERT(!strstr(asm_buf, "\"bpm\":177"), "the mid-fetch edit did NOT bleed into it");
        OK("⚠ an edit between chunks cannot splice two versions of the project together");
        hx_destroy(h);
    }

    /* Automation rides inside that blob — the whole reason the ceiling had to
     * go — and must survive a project that needs several chunks. */
    {
        hx_t *h = hx_create(NULL);
        fill(h, NUM_CLIPS);
        char k[64], v[128];
        for (int i = 0; i < 40; i++) {
            snprintf(k, sizeof(k), "t%d_pa_set", i % NUM_TRACKS);
            snprintf(v, sizeof(v), "0 0:fx1:p%d %d %d", i, i * 24, 1000 + i);
            hx_set_param(h, k, v);
        }
        hx_set_param(h, "bpm", "120");
        int n = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
        HX_ASSERT(n > 65535, "still a multi-chunk project");
        HX_ASSERT(strstr(asm_buf, "\"pa\":["), "the automation section is in the blob");
        HX_ASSERT(strstr(asm_buf, "0:fx1:p39"), "including the LAST entry written");
        HX_ASSERT(asm_buf[n - 1] == '}', "document still complete");
        OK("automation rides inside the state and survives the chunking whole");
        hx_destroy(h);
    }

    /* state_full keeps its own contract for the callers that still use it: a
     * blob too large for the caller's buffer is refused, never truncated. */
    {
        hx_t *h = hx_create(NULL);
        fill(h, NUM_CLIPS);
        hx_set_param(h, "bpm", "120");
        int n = hx_get_param(h, "state_full", one, 65536);
        HX_ASSERT(n == 0, "state_full still refuses rather than truncating");
        OK("the single-shot path still refuses a blob it cannot deliver whole");
        hx_destroy(h);
    }

    printf("PASS: test_state_chunked (%d checks)\n", ok_count);
    return 0;
}
