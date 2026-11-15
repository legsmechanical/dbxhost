/* tests/test_slicer_rethink.c — the Slicer as rebuilt on 2026-11-14/15 (the
 * Slicer rethink): what the engine owes the new editor. Pinned here:
 *   1. LOAD does not chop: one slice, the range, which follows Start / End
 *      until the first chop; the range's End is a frame, so the sample's
 *      Tempo never moves it;
 *   2. the range is a HARD EDGE: a hand slice crossing it plays only the part
 *      inside, one wholly outside plays nothing; marks_ / sl_ still say where
 *      the slice lies (and sl_'s last field says whether it is heard);
 *      widening the range brings it back untouched;
 *   3. no way of making slices leaves the range: a split outside it is
 *      refused; the first split of the one slice starts from Start..End;
 *      Even cuts inside it; Clear all (tN_au_manual) is a fresh load again;
 *   4. Play THRU: forwards on to the range's End, backwards down to Start; a
 *      step's Length still ends it; a One slice carried on after a Thru one
 *      ends at its own end;
 *   5. a step's Dir: Slice follows the slice's Revrs, Fwd / Rev override it,
 *      REMIX's flip turns the result (au_track_t.nm_rev packing);
 *   6. the file: rs en wh on the Slicer's line, pl=2 (Thru), sy=3 (Warp);
 *   7. Lazy put back (keep 0) restores an unchopped Slicer as unchopped. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

#define AUS(t) (&inst->au_store[(t)][AU_SLC])

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, 1 s: frame i holds 1 + i (never 0) */
static void write_ramp(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(1 + i % 30000));
    fclose(f);
}

static int wait_loaded(hx_t *h, int t) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 4000; i++) {
        hx_render(h, 1);
        if (au_cl(inst, t, AU_SLC)->state != 1) return au_cl(inst, t, AU_SLC)->state;
        usleep(1000);
    }
    return au_cl(inst, t, AU_SLC)->state;
}

static const au_voice_t *chop_voice(const au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && !at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}

/* slice k of t4 hit now (a pad: no step sound), one block rendered */
static const au_voice_t *hit(hx_t *h, int k) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    au_note_event(4, k, 0x90, 100, 0);
    hx_render(h, 1);
    return chop_voice(&inst->au_trk[4]);
}
/* ...and as the sequencer plays it, with the step's packed Dir */
static const au_voice_t *hit_dir(hx_t *h, int k, int packed) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    au_track_t *at = &inst->au_trk[4];
    at->nm_on[k] = 1; at->nm_rev[k] = (uint8_t)packed; at->nm_semi[k] = 0;
    at->nm_start[k] = 0; at->nm_len[k] = 0; at->nm_vg[k] = 1.0f;
    return hit(h, k);
}
static void quiet(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    au_track_kill(inst, 4, NULL);
    hx_render(h, 30);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400], b[4096];
    static char blob[262144];
    uint32_t a, z;
    const au_voice_t *v;

    snprintf(g_root, sizeof g_root, "/tmp/hx_slicer_rethink_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp(p);

    h = hx_create(NULL); HX_NO_LEAD(h);
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_slicer", "");
    snprintf(p, sizeof p, "%d|%s/src/ramp.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2, "the ramp did not load");

    /* ==== 1. load: one slice, the range, following it ==== */
    HX_ASSERT(AUS(4)->whole && au_count(AUS(4)) == 1, "a load was chopped");
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 0, &a, &z) && a == 0 && z == 44100, "the one slice is not the file");
    hx_set_param(h, "t4_au_set_start", "16 4000");
    hx_set_param(h, "t4_au_set_end", "16 30000");
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 0, &a, &z) && a == 4000 && z == 30000, "the one slice did not follow the range");
    v = hit(h, 0);
    HX_ASSERT(v && (uint32_t)v->lo == 4000 && (uint32_t)v->hi == 30000 && v->pos >= 4000.0 && v->pos <= 4000.0 + 128, "pad 1 did not play Start..End");
    quiet(h);
    hx_set_param(h, "t4_au_set_bpm", "16 600");                 /* the sample's own Tempo moves nothing */
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 0, &a, &z) && a == 4000 && z == 30000, "the Tempo moved the range");
    hx_set_param(h, "t4_au_set_end", "16 44100");               /* the file's end itself: none */
    HX_ASSERT(AUS(4)->rend == 0, "an End at the file's end was kept as a cut");

    /* ==== 3a. the first split starts from the range; outside is refused ==== */
    hx_set_param(h, "t4_au_set_end", "16 30000");
    hx_set_param(h, "t4_au_mark_add", "16 2000");                /* before Start */
    HX_ASSERT(AUS(4)->whole, "a split before Start was taken");
    hx_set_param(h, "t4_au_mark_add", "16 35000");               /* past End */
    HX_ASSERT(AUS(4)->whole, "a split past End was taken");
    hx_set_param(h, "t4_au_mark_add", "16 12000");
    HX_ASSERT(!AUS(4)->whole && AUS(4)->nslices == 2 && AUS(4)->sl[0].start == 4000 && AUS(4)->sl[1].start == 12000,
              "the first split did not start from Start..End");
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 1, &a, &z) && a == 12000 && z == 30000, "the last slice does not end at End");

    /* ==== 2. the hard edge ==== */
    hx_set_param(h, "t4_au_mark_add", "16 20000");               /* slices: 4000 12000 20000 (..30000) */
    hx_set_param(h, "t4_au_set_end", "16 16000");                /* slice 2 now wholly outside, slice 1 crosses */
    HX_ASSERT(AUS(4)->nslices == 3, "moving End changed the slices");
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 1, &a, &z) && a == 12000 && z == 16000, "a crossing slice was not cut at End");
    HX_ASSERT(!au_slice_range(AUS(4), AUS(4)->smp, 2, &a, &z), "a slice wholly past End still plays");
    v = hit(h, 2);
    HX_ASSERT(!v, "pad 3 sounded though its slice is outside the range");
    quiet(h);
    v = hit(h, 1);
    HX_ASSERT(v && (uint32_t)v->hi == 16000, "the crossing slice played past End");
    quiet(h);
    hx_get_param(h, "t4_au_marks_16", b, sizeof b);
    HX_ASSERT(!strcmp(b, "4000 12000 12000 20000 20000 44100"), "marks_ does not say where every slice lies");
    {
        unsigned sa = 0, sb2 = 0; int f[9], heard = -1;
        hx_get_param(h, "t4_au_sl_16_2", b, sizeof b);
        HX_ASSERT(sscanf(b, "%u %u %d %d %d %d %d %d %d %d %d", &sa, &sb2, &f[0], &f[1], &f[2], &f[3], &f[4], &f[5], &f[6], &f[7], &heard) == 11 &&
                  sa == 20000 && heard == 0, "sl_ does not say where the hidden slice lies, and that it is not heard");
        hx_get_param(h, "t4_au_sl_16_1", b, sizeof b);
        HX_ASSERT(sscanf(b, "%u %u %d %d %d %d %d %d %d %d %d", &sa, &sb2, &f[0], &f[1], &f[2], &f[3], &f[4], &f[5], &f[6], &f[7], &heard) == 11 &&
                  heard == 1, "sl_ calls the crossing slice unheard");
    }
    hx_set_param(h, "t4_au_set_end", "16 30000");                /* widened: back, untouched */
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 2, &a, &z) && a == 20000 && z == 30000, "widening did not bring the slice back");
    hx_set_param(h, "t4_au_set_start", "16 14000");              /* Start crossing slice 1 */
    HX_ASSERT(au_slice_range(AUS(4), AUS(4)->smp, 1, &a, &z) && a == 14000 && z == 20000, "a slice crossing Start was not cut at it");
    HX_ASSERT(!au_slice_range(AUS(4), AUS(4)->smp, 0, &a, &z), "a slice wholly before Start still plays");
    hx_set_param(h, "t4_au_set_start", "16 4000");

    /* ==== 3b. Even inside the range; Clear all = a fresh load ==== */
    hx_set_param(h, "t4_au_set_even", "16 4");
    HX_ASSERT(AUS(4)->nslices == 4 && AUS(4)->sl[0].start == 4000 && AUS(4)->sl[1].start == 4000 + 26000 / 4,
              "Even did not cut inside the range");
    hx_set_param(h, "t4_au_manual", "16");
    HX_ASSERT(AUS(4)->whole && au_count(AUS(4)) == 1 &&
              au_slice_range(AUS(4), AUS(4)->smp, 0, &a, &z) && a == 4000 && z == 30000, "Clear all is not a fresh load of the range");
    hx_set_param(h, "t4_au_mark_del", "16 1");
    HX_ASSERT(AUS(4)->whole, "a delete on the unchopped slice did something");

    /* ==== 4. Thru ==== */
    hx_set_param(h, "t4_au_set_even", "16 4");                   /* 4000 10500 17000 23500 (..30000) */
    hx_set_param(h, "t4_au_slice_play", "16 1 2");
    HX_ASSERT(AUS(4)->sl[1].play == AU_PLAY_THRU, "Play did not take Thru");
    v = hit(h, 1);
    HX_ASSERT(v && (uint32_t)v->lo == 10500 && (uint32_t)v->hi == 30000 && !v->gated, "Thru did not play on to the range's End");
    quiet(h);
    hx_set_param(h, "t4_au_slice_rev", "16 1 1");
    v = hit(h, 1);
    HX_ASSERT(v && v->step < 0 && (uint32_t)v->lo == 4000 && v->pos <= 17000.0 - 1.0 && v->pos >= 17000.0 - 130, "Thru backwards did not run from its end down to Start");
    quiet(h);
    hx_set_param(h, "t4_au_slice_rev", "16 1 0");
    {   /* a step's Length ends a Thru slice at its window */
        au_track_t *at = &inst->au_trk[4];
        at->nm_on[1] = 1; at->nm_rev[1] = 0; at->nm_semi[1] = 0; at->nm_start[1] = 0; at->nm_len[1] = 50; at->nm_vg[1] = 1.0f;
        v = hit(h, 1);
        HX_ASSERT(v && (uint32_t)v->hi == 10500 + 6500 / 2, "a step's Length did not end the Thru slice at its window");
        quiet(h);
    }
    {   /* carry-on: slice 1 (Thru) then slice 2 (One) where it has reached: 2 ends at its own end */
        int blocks = (17000 - 10500) / 128;
        v = hit(h, 1);
        hx_render(h, blocks - 1);
        v = hit(h, 2);
        HX_ASSERT(v && (uint32_t)v->hi == 23500, "a One slice carried on after a Thru one did not end at its own end");
        quiet(h);
    }
    hx_set_param(h, "t4_au_slice_play", "16 1 0");

    /* ==== 5. a step's Dir and REMIX's flip ==== */
    hx_set_param(h, "t4_au_slice_rev", "16 2 1");                 /* slice 3 is reversed */
    v = hit_dir(h, 2, AU_SDIR_SLICE);
    HX_ASSERT(v && v->step < 0, "Dir Slice did not follow the slice's Revrs");
    quiet(h);
    v = hit_dir(h, 2, AU_SDIR_FWD);
    HX_ASSERT(v && v->step > 0, "Dir Fwd did not override a reversed slice");
    quiet(h);
    v = hit_dir(h, 2, AU_SDIR_REV);
    HX_ASSERT(v && v->step < 0, "Dir Rev did not play backwards");
    quiet(h);
    v = hit_dir(h, 2, AU_SDIR_FWD | AU_NM_RMX);
    HX_ASSERT(v && v->step < 0, "REMIX's flip did not turn a step set to Fwd");
    quiet(h);
    v = hit_dir(h, 2, AU_SDIR_SLICE | AU_NM_RMX);
    HX_ASSERT(v && v->step > 0, "REMIX's flip did not turn a step following a reversed slice");
    quiet(h);
    v = hit_dir(h, 1, AU_SDIR_REV);                               /* slice 2 forwards by itself */
    HX_ASSERT(v && v->step < 0, "Dir Rev did not reverse a forwards slice");
    quiet(h);
    v = hit(h, 2);                                                /* a pad: the slice as it is */
    HX_ASSERT(v && v->step < 0, "a pad's hit did not play the slice as it is");
    quiet(h);
    hx_set_param(h, "t4_c0_step_0_xrev", "2");
    HX_ASSERT(inst->tracks[4].clips[0].step_xrev[0] == AU_SDIR_REV, "the step key did not take Rev");
    hx_set_param(h, "t4_c0_step_0_xrev", "7");
    HX_ASSERT(inst->tracks[4].clips[0].step_xrev[0] == AU_SDIR_REV, "a Dir past Rev was not Rev");

    /* ==== 6. the file ==== */
    hx_set_param(h, "t4_au_slice_play", "16 3 2");
    hx_set_param(h, "t4_au_set_sync", "16 3");
    inst->state_dirty = 1;
    HX_ASSERT(hx_get_param(h, "state_full", blob, (int)sizeof blob) > 0, "state_full");
    HX_ASSERT(strstr(blob, " sy=3 ") && strstr(blob, " n=4 rs=4000 en=30000 wh=0|ramp.wav"), "the Slicer's line lacks its range / Warp");
    HX_ASSERT(strstr(blob, "\"t4s3_slc\":\"st=23500 en=0 p=0 dt=0 g=0 rv=0 pl=2 "), "slice 4's Thru was not saved");
    {
        FILE *wf = fopen(inst->state_path, "w");
        HX_ASSERT(wf && fwrite(blob, 1, strlen(blob), wf) == strlen(blob), "write state");
        fclose(wf);
    }
    hx_destroy(h);
    h = hx_create(NULL); HX_NO_LEAD(h);
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER && wait_loaded(h, 4) == 2, "the reload lost the Slicer");
    HX_ASSERT(AUS(4)->rstart == 4000 && AUS(4)->rend == 30000 && !AUS(4)->whole && AUS(4)->nslices == 4,
              "the reload lost the range or the slices");
    HX_ASSERT(AUS(4)->sl[3].play == AU_PLAY_THRU && AUS(4)->sync == AU_SLC_SYNC_WARP, "the reload lost Thru or Warp");
    HX_ASSERT(inst->tracks[4].clips[0].step_xrev[0] == AU_SDIR_REV, "the reload lost the step's Dir");

    /* ==== 7. Lazy put back keeps an unchopped Slicer unchopped ==== */
    hx_set_param(h, "t4_au_manual", "16");
    HX_ASSERT(AUS(4)->whole, "Clear all after the reload");
    hx_set_param(h, "t4_au_lazy", "16 1");
    hx_set_param(h, "t4_au_lazy_tap", "");
    HX_ASSERT(!AUS(4)->whole && inst->au_lazy_state == AU_LAZY_RUN, "Lazy's first tap did not start chopping");
    hx_set_param(h, "t4_au_lazy", "16 0");
    hx_render(h, 2);
    if (inst->au_lazy_state == AU_LAZY_ENDED) hx_set_param(h, "t4_au_lazy_keep", "0");
    HX_ASSERT(AUS(4)->whole && au_count(AUS(4)) == 1, "Lazy put back did not restore the unchopped slice");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_slicer_rethink\n");
    return 0;
}
