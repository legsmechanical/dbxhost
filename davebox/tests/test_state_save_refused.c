/* tests/test_state_save_refused.c — a project too big to save SAYS so.
 *
 * Chunk 0 refuses a serialization that does not fit state_buf (a cut blob
 * would load as a silently smaller project). Before this, the refusal came
 * back to JS as an empty string — exactly what "nothing to save" looks like —
 * so the user was never told, and the save was re-attempted (a full
 * serialize plus a log line on the SPI thread) on every quiet poll forever.
 *
 * What must hold:
 *   - an over-limit project: chunk 0 empty, state_dirty still 1, snap_len 0,
 *     and `save_refused` reads 1 — and keeps reading 1 (a condition, not a
 *     clear-on-read event);
 *   - the refusal logs ONCE, however many times chunk 0 is asked;
 *   - shrinking it below the limit serves it whole and clears the flag;
 *   - the deliberate refusals (awaiting a selection, version mismatch) stay
 *     silent: empty chunk 0 AND save_refused 0;
 *   - state_buf is 1 MB, and a project between the old 256 KB and 1 MB saves
 *     whole through the same 32-chunk loop the JS runs. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* JS's bound (ui_dsp_bridge.mjs fetchStateChunked): chunk 0 + chunks 1..31. */
#define JS_CHUNK_BOUND 32

static int fetch_chunked(hx_t *h, char *out, int out_len) {
    static char part[65536];
    char key[32];
    int n = 0;
    for (int i = 0; i < JS_CHUNK_BOUND; i++) {
        snprintf(key, sizeof(key), "state_chunk_%d", i);
        int got = hx_get_param(h, key, part, 32769);   /* the DSP's chunk size */
        if (got <= 0) break;
        HX_ASSERT(n + got < out_len, "reassembly buffer too small");
        memcpy(out + n, part, (size_t)got);
        n += got;
    }
    out[n] = '\0';
    return n;
}

static int getp_int(hx_t *h, const char *k) {
    char b[32] = {0};
    hx_get_param(h, k, b, (int)sizeof(b));
    return atoi(b);
}

/* White-box: fill `nclips` clips (track-major) with 512 notes each. A large
 * tick makes each note long, so the over-limit case needs no automation. */
static void fill_notes(hx_t *h, int nclips, uint32_t tick_base) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int k = 0;
    for (int t = 0; t < NUM_TRACKS && k < nclips; t++)
        for (int c = 0; c < NUM_CLIPS && k < nclips; c++, k++) {
            clip_t *cl = &inst->tracks[t].clips[c];
            for (int i = 0; i < MAX_NOTES_PER_CLIP; i++) {
                note_t *n = &cl->notes[i];
                memset(n, 0, sizeof(*n));
                n->tick = tick_base + (uint32_t)i;
                n->pitch = (uint8_t)(36 + (i % 60));
                n->vel = 100;
                n->gate = 12;
                n->active = 1;
            }
            cl->note_count = MAX_NOTES_PER_CLIP;
        }
    inst->state_dirty = 1;
}

static void clear_notes(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    for (int t = 0; t < NUM_TRACKS; t++)
        for (int c = 0; c < NUM_CLIPS; c++) inst->tracks[t].clips[c].note_count = 0;
    inst->state_dirty = 1;
}

/* seq8_ilog writes to inst->log_fp (not the stub host's log), so capture it. */
static FILE *capture_log(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    if (inst->log_fp) fclose(inst->log_fp);
    inst->log_fp = tmpfile();
    return inst->log_fp;
}
static int count_in_log(FILE *fp, const char *needle) {
    static char buf[65536];
    fflush(fp);
    long end = ftell(fp);
    rewind(fp);
    size_t n = fread(buf, 1, sizeof(buf) - 1, fp);
    buf[n] = '\0';
    fseek(fp, end, SEEK_SET);
    int count = 0;
    for (const char *p = buf; (p = strstr(p, needle)); p++) count++;
    return count;
}

int main(void) {
    static char asm_buf[(1u << 20) + 65536];
    char part[65536];

    /* The size canary: the limit this change raised. */
    HX_ASSERT(sizeof(((seq8_instance_t *)0)->state_buf) >= (1u << 20), "state_buf is at least 1 MB");
    OK("state_buf is 1 MB");

    /* ⭐ Over the limit: refused, SAID so, and the flag is a condition. */
    {
        hx_t *h = hx_create(NULL);
        FILE *log = capture_log(h);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        fill_notes(h, NUM_TRACKS * NUM_CLIPS, 4000000000u);   /* ~28 B/note x 65536 */
        HX_ASSERT(getp_int(h, "save_refused") == 0, "precondition: not refused before any attempt");

        int n = hx_get_param(h, "state_chunk_0", part, 32769);
        HX_ASSERT(n == 0, "chunk 0 is refused");
        HX_ASSERT(inst->state_dirty == 1, "still dirty — nothing was saved");
        HX_ASSERT(getp_int(h, "state_snap_len") == 0, "no snapshot to serve");
        HX_ASSERT(getp_int(h, "save_refused") == 1, "save_refused reads 1");
        HX_ASSERT(getp_int(h, "save_refused") == 1, "and still 1 on a second read (not clear-on-read)");
        OK("⭐ an over-limit project is refused, stays dirty, and save_refused reads 1 — sticky");

        for (int i = 0; i < 4; i++) {
            HX_ASSERT(hx_get_param(h, "state_chunk_0", part, 32769) == 0, "still refused");
        }
        HX_ASSERT(count_in_log(log, "exceeded state_buf") == 1,
                  "the refusal logs ONCE across five attempts, not per attempt");
        HX_ASSERT(getp_int(h, "save_refused") == 1, "still refused after the retries");
        OK("the refusal logs once on the edge, not on every retry");

        /* Shrink: the next attempt serves it whole and clears the flag. */
        clear_notes(h);
        fill_notes(h, 4, 100);
        int m = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
        HX_ASSERT(m > 0 && asm_buf[0] == '{' && asm_buf[m - 1] == '}', "a whole document");
        HX_ASSERT(getp_int(h, "save_refused") == 0, "save_refused clears once a save fits");
        HX_ASSERT(inst->state_dirty == 0, "and the state is clean");
        OK("shrinking it below the limit saves it whole and clears save_refused");

        /* Too big again: the edge re-arms, so it logs again (once). */
        fill_notes(h, NUM_TRACKS * NUM_CLIPS, 4000000000u);
        hx_get_param(h, "state_chunk_0", part, 32769);
        hx_get_param(h, "state_chunk_0", part, 32769);
        HX_ASSERT(count_in_log(log, "exceeded state_buf") == 2, "a new episode logs once more");
        OK("a second too-big episode logs once more");
        hx_destroy(h);
    }

    /* CONTROLS: the deliberate refusals are silent — no save_refused. */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        fill_notes(h, NUM_TRACKS * NUM_CLIPS, 4000000000u);
        inst->awaiting_select = 1;
        HX_ASSERT(hx_get_param(h, "state_chunk_0", part, 32769) == 0, "awaiting_select refuses");
        HX_ASSERT(getp_int(h, "save_refused") == 0, "…without claiming the project is too big");
        inst->awaiting_select = 0;
        inst->state_version_mismatch = 1;
        HX_ASSERT(hx_get_param(h, "state_chunk_0", part, 32769) == 0, "version mismatch refuses");
        HX_ASSERT(getp_int(h, "save_refused") == 0, "…without claiming the project is too big");
        inst->state_version_mismatch = 0;
        /* POSITIVE for the same fixture: the size branch DOES fire here. */
        HX_ASSERT(hx_get_param(h, "state_chunk_0", part, 32769) == 0, "size refusal");
        HX_ASSERT(getp_int(h, "save_refused") == 1, "the same fixture IS too big once the gates open");
        OK("CONTROL: awaiting-select and version-mismatch refusals leave save_refused at 0");
        hx_destroy(h);
    }

    /* A project between the old 256 KB limit and 1 MB now saves whole. */
    {
        hx_t *h = hx_create(NULL);
        fill_notes(h, 48, 1000);            /* ~16 B/note x 512 x 48 ≈ 390 KB */
        hx_set_param(h, "bpm", "131");
        int n = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
        HX_ASSERT(n > 262144, "the fixture must exceed the OLD 256 KB limit to be a test of it");
        HX_ASSERT(n == getp_int(h, "state_snap_len"), "reassembled all of the snapshot");
        HX_ASSERT(asm_buf[0] == '{' && asm_buf[n - 1] == '}', "one complete document");
        HX_ASSERT(strstr(asm_buf, "\"bpm\":131"), "content present");
        HX_ASSERT(getp_int(h, "save_refused") == 0, "not refused");
        OK("⭐ a ~390 KB project (over the old 256 KB) saves whole through the chunk loop");
        hx_destroy(h);
    }

    /* Near the new ceiling: the JS loop bound must cover every chunk. */
    {
        hx_t *h = hx_create(NULL);
        /* ~17 B/note x 512 x 128 clips ≈ 1.1 MB — over; shrink a clip at a
         * time (~9 KB each, inside the 32 KB window) until it fits. */
        fill_notes(h, 128, 100000);
        int n = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
        int want = getp_int(h, "state_snap_len");
        if (want == 0) {
            /* Over the limit on this fixture — shrink until it fits. */
            int k = 127;
            while (want == 0 && k > 0) {
                clear_notes(h); fill_notes(h, k--, 100000);
                n = fetch_chunked(h, asm_buf, (int)sizeof(asm_buf));
                want = getp_int(h, "state_snap_len");
            }
        }
        HX_ASSERT(want > 31 * 32768, "fixture needs the 32nd chunk to be a test of the bound");
        HX_ASSERT(n == want, "the 32-chunk loop reassembles all of it");
        HX_ASSERT(asm_buf[n - 1] == '}', "complete");
        OK("a project needing all 32 chunks reassembles whole within the JS bound");
        hx_destroy(h);
    }

    printf("PASS: test_state_save_refused (%d checks)\n", ok_count);
    return 0;
}
