/* test_move_info_store.c — the shim's copy of what schwung_move_info()
 * answers (src/host/move_info_store.h), read back through the PUBLIC reader's
 * own copy routine (move_info_copy, move_info.h), as a module would.
 *
 *   - nothing published: 0 ("not provided"), the reader falls back;
 *   - published: 1, every field as given, size/version the host's, and
 *     `changes` bumped on each put;
 *   - a short writer struct: the rest of the host's struct is zero and
 *     `size` says how much is real;
 *   - a short reader cap: only cap bytes are written;
 *   - withdrawn (NULL): 0 again;
 *   - a writer thread hammering puts while a reader copies never yields a
 *     TORN struct (each put writes one value into every field it checks).
 */
#define _GNU_SOURCE
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include "move_info_store.h"

static int fails;
#define CHECK(c, m) do { if (!(c)) { fprintf(stderr, "FAIL: %s\n", m); fails++; } } while (0)

static move_info_shm_t S;
static volatile int stop;

static void fill(move_info_t *m, int v) {
    memset(m, 0, sizeof *m);
    m->size = sizeof *m; m->version = MOVE_INFO_VERSION;
    m->valid = 1;
    m->root_note = (int8_t)(v % 12);
    m->tempo = (float)v;
    snprintf(m->scale, sizeof m->scale, "s%d", v);
    m->song_beats = (double)v;
}

static void *writer(void *arg) {
    (void)arg;
    move_info_t m;
    int v = 0;
    while (!stop) { fill(&m, ++v); move_info_store_put(&S, &m, sizeof m); }
    return NULL;
}

int main(void) {
    move_info_t out, in;
    char big[sizeof(move_info_t) + 64];

    CHECK(move_info_store_get(&S, &out, sizeof out) == 0, "nothing published must answer 0");

    fill(&in, 7);
    move_info_store_put(&S, &in, sizeof in);
    CHECK(move_info_store_get(&S, &out, sizeof out) == 1, "published must answer 1");
    CHECK(out.valid == 1 && out.root_note == 7 && out.tempo == 7.0f && !strcmp(out.scale, "s7") && out.song_beats == 7.0,
          "fields did not come back as given");
    CHECK(out.size == sizeof(move_info_t) && out.version == MOVE_INFO_VERSION, "size / version are not the host's");
    {
        const uint32_t c0 = out.changes;
        fill(&in, 8);
        move_info_store_put(&S, &in, sizeof in);
        move_info_store_get(&S, &out, sizeof out);
        CHECK(out.changes == c0 + 1, "changes was not bumped by a put");
        CHECK(out.root_note == 8, "a second put did not replace the first");
    }

    /* a writer built against an older, shorter struct */
    fill(&in, 9);
    move_info_store_put(&S, &in, offsetof(move_info_t, scale));
    move_info_store_get(&S, &out, sizeof out);
    CHECK(out.size == offsetof(move_info_t, scale), "size does not say how much the writer filled");
    CHECK(out.root_note == 9 && out.scale[0] == 0 && out.song_beats == 0.0, "past the writer's size is not zero");

    /* a reader built against an older, shorter struct */
    fill(&in, 10);
    move_info_store_put(&S, &in, sizeof in);
    memset(big, 0x5A, sizeof big);
    CHECK(move_info_store_get(&S, big, offsetof(move_info_t, scale)) == 1, "a short reader was refused");
    CHECK((unsigned char)big[offsetof(move_info_t, scale)] == 0x5A, "wrote past the reader's cap");

    move_info_store_put(&S, NULL, 0);
    CHECK(move_info_store_get(&S, &out, sizeof out) == 0, "withdrawn must answer 0");

    /* torn reads */
    {
        pthread_t th;
        long reads = 0, torn = 0, i;
        stop = 0;
        pthread_create(&th, NULL, writer, NULL);
        for (i = 0; i < 2000000; i++) {
            if (move_info_store_get(&S, &out, sizeof out) != 1) continue;
            reads++;
            const int v = (int)out.tempo;
            char want[24];
            snprintf(want, sizeof want, "s%d", v);
            if (out.root_note != (int8_t)(v % 12) || out.song_beats != (double)v || strcmp(out.scale, want)) torn++;
        }
        stop = 1;
        pthread_join(th, NULL);
        CHECK(reads > 1000, "the reader almost never got a copy under a busy writer");
        CHECK(torn == 0, "a reader saw a TORN struct");
        printf("  %ld reads under a busy writer, %ld torn\n", reads, torn);
    }

    if (fails) return 1;
    printf("PASS: move_info store (publish, withdraw, size rules, no torn reads)\n");
    return 0;
}
