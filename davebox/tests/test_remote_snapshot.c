#include <stdlib.h>
/* tests/test_remote_snapshot.c — verify the remote-UI snapshot (get_param "state")
 * reflects clip note content + the tN_cC_ruisel selection target.
 *
 * White-box harness (#includes seq8.c). The snapshot is the read path the
 * schwung-manager pulls on subscribe (comp+":state") to seed the browser piano
 * roll; davebox's own persistence stays on the separate state_full path. */
#include "harness.h"

static void test_snapshot_has_selected_clip_notes(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");

    /* track 0 defaults to DRUM, so use track 1 (melodic) for the melodic path */
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_ruisel", "");

    char buf[8192];
    int len = hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "get_param state returned no data");
    /* flat string fields (manager-explosion-safe) */
    HX_ASSERT(strstr(buf, "\"rui_sel\":\"1:0:-1\"") != NULL, "sel target not t1c0 melodic");
    HX_ASSERT(strstr(buf, "\"rui_index\":\"") != NULL, "missing tracks index");
    HX_ASSERT(strstr(buf, "\"rui_notes\":\"") != NULL, "missing clip notes field");
    HX_ASSERT(strstr(buf, ":60:100:") != NULL, "pitch 60 vel 100 not in notes");
    HX_ASSERT(strstr(buf, "\"rui_play\":\"") != NULL, "missing play field");
    HX_ASSERT(strstr(buf, "\"rui_clip\":\"") != NULL, "missing clip params field");
    hx_destroy(h);
}

static void test_snapshot_selection_switches_clip(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");

    hx_set_param(h, "t2_c3_step_0_toggle", "72 90");
    hx_set_param(h, "t2_c3_ruisel", "");

    char buf[8192];
    int len = hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "get_param state returned no data");
    HX_ASSERT(strstr(buf, "\"rui_sel\":\"2:3:-1\"") != NULL, "sel target not t2c3 melodic");
    HX_ASSERT(strstr(buf, ":72:90:") != NULL, "pitch 72 vel 90 not in selected clip");
    hx_destroy(h);
}

static void test_snapshot_empty_clip_has_index(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");
    /* no notes anywhere: snapshot still valid, has=0 throughout, notes empty */
    hx_set_param(h, "t0_c0_ruisel", "");
    char buf[8192];
    int len = hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "get_param state returned no data for empty session");
    HX_ASSERT(strstr(buf, "\"rui_index\":\"") != NULL, "expected a tracks index");
    HX_ASSERT(strstr(buf, "\"rui_notes\":\"\"") != NULL, "empty selected clip should have empty notes");
    hx_destroy(h);
}

/* The schwung-manager discovers an active overtake tool by probing
 * "overtake_dsp:module_id" (forwarded to the DSP's get_param("module_id")) and
 * then uses the answer as a DIRECTORY NAME:
 * modules/<category>/<module_id>/web_ui.html.
 *
 * So it must be THIS BUILD'S id, not a constant. It used to be hardcoded
 * "davebox", which meant that under SA — installed as `davebox-sound` — the
 * manager looked in a directory that does not exist and the remote UI never
 * appeared. This test asserted the hardcoded string, so it PINNED THE BUG:
 * it would have gone green while the feature was broken on the device. Assert
 * against the compiled-in id instead, which is what the installer uses. */
static void test_module_id_probe(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");
    char buf[64];
    int len = hx_get_param(h, "module_id", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "get_param module_id returned no data");
    HX_ASSERT(strcmp(buf, DAVEBOX_MODULE_ID) == 0,
              "module_id probe must return this build's module id — the manager "
              "uses it as the directory name holding web_ui.html");
    hx_destroy(h);
}

/* A DRUM track with notes must light its clip's has-bit in rui_index, so the
 * session grid doesn't show populated drum clips as empty. Before the fix the
 * has-bits scanned only trk->clips[] (melodic), so drum tracks emitted all 0s. */
static void test_snapshot_drum_clip_has_bit(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    /* track 0 -> drum: first tN_lL_* write allocates drum clips + sets pad_mode */
    hx_set_param(h, "t0_l0_clip_length", "16");
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "track 0 should be drum");
    /* add a hit at tick 0 in lane 0 of the active drum clip (clip 0) */
    hx_set_param(h, "t0_l0_note_add", "0 100");
    hx_set_param(h, "t0_c0_ruisel", "");
    char buf[16384];
    int len = hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "no state");
    /* rui_index track-0 record = "pm:ac:qc:pl:<16 has-bits>:route:chan". Skip the
     * 4 leading colon-separated fields; the first has-bit (clip 0) must be '1'. */
    const char *p = strstr(buf, "\"rui_index\":\"");
    HX_ASSERT(p != NULL, "missing rui_index");
    p += strlen("\"rui_index\":\"");
    int colons = 0;
    while (*p && colons < 4) { if (*p == ':') colons++; p++; }
    HX_ASSERT(*p == '1', "drum clip 0 with a note must set its rui_index has-bit");
    hx_destroy(h);
}

static void test_snapshot_cond_present(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");
    /* make track 2 the conductor, set responder fields on its active clip (clip 0) */
    hx_set_param(h, "t2_convert_to_conduct", "");
    hx_set_param(h, "t2_c0_cond_resp", "3 0");     /* track 3 not responding */
    hx_set_param(h, "t2_c0_cond_oct",  "4 1");     /* track 4 +1 oct */
    hx_set_param(h, "t2_c0_cond_lock", "1");
    hx_set_param(h, "t1_c0_ruisel", "");           /* select any track */
    char buf[16384];
    hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(strstr(buf, "\"rui_cond\":\"2:0:1;") != NULL, "condTrk/clip/lock header wrong");
    /* within-group delimiter must be commas: "resp,oct,when". */
    HX_ASSERT(strstr(buf, ";1,0,0") != NULL, "track-0 default group (resp,oct,when) wrong");
    HX_ASSERT(strstr(buf, ";0,0,0") != NULL, "track-3 resp-off group wrong");
    HX_ASSERT(strstr(buf, ";1,1,0") != NULL, "track-4 oct+1 group wrong");
    hx_destroy(h);
}

static void test_snapshot_cond_none(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");
    hx_set_param(h, "t1_c0_ruisel", "");
    char buf[16384];
    hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(strstr(buf, "\"rui_cond\":\"-1:") != NULL, "no-conductor short form wrong");
    hx_destroy(h);
}

/* rui_index track records must expose per-track mute/solo state so the remote UI
 * can reflect live muted/soloed headers. Format becomes:
 * pm:ac:qc:pl:<16bits>:route:chan:mute:solo */
static void test_snapshot_index_mute_solo(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");

    hx_set_param(h, "t1_mute", "1");   /* mute track 1, clears solo */
    hx_set_param(h, "t2_solo", "1");   /* solo track 2, clears mute */
    hx_set_param(h, "t0_c0_ruisel", "");

    char buf[16384];
    int len = hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "no state");

    const char *idx = strstr(buf, "\"rui_index\":\"");
    HX_ASSERT(idx != NULL, "missing rui_index");
    idx += strlen("\"rui_index\":\"");

    /* rui_index = "trk0_rec;trk1_rec;trk2_rec;..." — records separated by ';' */

    /* advance to track 1 record */
    const char *t1 = strchr(idx, ';');
    HX_ASSERT(t1 != NULL, "rui_index missing track 1 separator");
    t1++; /* start of track 1 record */
    const char *t1_end = strchr(t1, ';');
    HX_ASSERT(t1_end != NULL, "rui_index missing track 2 separator");
    /* tail must be :1:0:1 (mute=1, solo=0, slot=B — default t&3) */
    HX_ASSERT(t1_end - t1 > 6 &&
              t1_end[-1] == '1' && t1_end[-2] == ':' &&
              t1_end[-3] == '0' && t1_end[-4] == ':' &&
              t1_end[-5] == '1' && t1_end[-6] == ':',
              "track 1 mute=1 solo=0: rui_index tail must be :1:0:1");

    /* advance to track 2 record */
    const char *t2 = t1_end + 1;
    const char *t2_end = strchr(t2, ';');
    HX_ASSERT(t2_end != NULL, "rui_index missing track 3 separator");
    /* tail must be :0:1:2 (mute=0, solo=1, slot=C — default t&3) */
    HX_ASSERT(t2_end - t2 > 6 &&
              t2_end[-1] == '2' && t2_end[-2] == ':' &&
              t2_end[-3] == '1' && t2_end[-4] == ':' &&
              t2_end[-5] == '0' && t2_end[-6] == ':',
              "track 2 mute=0 solo=1: rui_index tail must be :0:1:2");

    hx_destroy(h);
}

/* devms device-clock field: PLAYING digests/snapshots carry it (rui_poll 5th
 * field, rui_play 4th), STOPPED forms omit it (byte-stable digest at idle is
 * what gates the shim's push-on-change). devms = rui_frames*1000/44100. */
static void test_playhead_devms_field(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "hx_create returned NULL");
    char buf[8192];

    /* stopped: rui_poll = "rev:0:tick:bpm" (4 fields), rui_play 3 fields */
    int len = hx_get_param(h, "rui_poll", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "rui_poll returned no data");
    int colons = 0; for (int i = 0; i < len; i++) if (buf[i] == ':') colons++;
    HX_ASSERT(colons == 3, "stopped rui_poll must have 4 fields (no devms)");

    /* playing after 100 rendered blocks: devms = 100*128*1000/44100 = 290 */
    hx_set_param(h, "transport", "play");
    hx_render(h, 100);
    len = hx_get_param(h, "rui_poll", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "rui_poll (playing) returned no data");
    colons = 0; for (int i = 0; i < len; i++) if (buf[i] == ':') colons++;
    HX_ASSERT(colons == 4, "playing rui_poll must carry the 5th devms field");
    HX_ASSERT(strstr(buf, ":290") != NULL, "devms must be rui_frames*1000/44100 (100 blocks = 290ms)");

    len = hx_get_param(h, "state", buf, (int)sizeof(buf));
    HX_ASSERT(len > 0, "state returned no data");
    HX_ASSERT(strstr(buf, "\"rui_play\":\"1:") != NULL, "playing rui_play missing");
    { const char *p = strstr(buf, "\"rui_play\":\"");
      const char *q = p ? strchr(p + 12, '"') : NULL;
      int c2 = 0; for (const char *s = p + 12; s && s < q; s++) if (*s == ':') c2++;
      HX_ASSERT(c2 == 3, "playing rui_play must have 4 fields (devms last)"); }

    hx_set_param(h, "transport", "stop");
    len = hx_get_param(h, "rui_poll", buf, (int)sizeof(buf));
    colons = 0; for (int i = 0; i < len; i++) if (buf[i] == ':') colons++;
    HX_ASSERT(colons == 4, "stopped-again rui_poll carries the stop's order key (the manager forwards it)");
    HX_ASSERT(strstr(buf, ":291") != NULL, "rui_poll stop key must match rui_play's (291)");

    /* The stopped rui_play carries the stop's ORDER key: the last playing
     * block's devms + 1 (290 + 1) — later than every playing snapshot sent
     * before the stop, so the browser can't let one that lands late restart
     * its playhead. Frozen while stopped: the idle snapshot stays byte-stable. */
    char stopped1[8192], stopped2[8192];
    hx_render(h, 1);   /* the stop's own block bumps the content rev once (live state) */
    len = hx_get_param(h, "state", stopped1, (int)sizeof(stopped1));
    HX_ASSERT(len > 0, "state (stopped) returned no data");
    HX_ASSERT(strstr(stopped1, "\"rui_play\":\"0:") != NULL, "stopped rui_play missing");
    { const char *p = strstr(stopped1, "\"rui_play\":\"");
      const char *q = p ? strchr(p + 12, '"') : NULL;
      int c2 = 0; for (const char *s = p + 12; s && s < q; s++) if (*s == ':') c2++;
      HX_ASSERT(c2 == 3, "stopped rui_play (after a run) must carry the order key");
      HX_ASSERT(q && q - 4 >= p && !strncmp(q - 4, ":291", 4),
                "stop order key must be the last playing devms + 1 (291)"); }
    hx_render(h, 100);
    len = hx_get_param(h, "state", stopped2, (int)sizeof(stopped2));
    HX_ASSERT(len > 0 && !strcmp(stopped1, stopped2), "stopped snapshot must stay byte-stable while idle");
    hx_destroy(h);
}

/* The session grid's live state (launches, the bar-line switch, start/stop,
 * mute/solo) changes without an edit. The browser and the host's snapshot
 * cache only re-read on a content-rev change, so the RULE is: whenever what the
 * grid shows (rui_index) or the transport changes from one block to the next,
 * the content rev must change too — and an idle or steadily playing device
 * must NOT keep bumping it, or every block refetches the snapshot. Checked at
 * every block across a scripted session. */
typedef struct { hx_t *h; char idx[1024]; int on; unsigned rev; int fails, changes; } live_t;

static void live_read(live_t *L, char *idx, int *on, unsigned *rev) {
    static char st[65536];
    char poll[256];
    int n = hx_get_param(L->h, "rui_poll", poll, (int)sizeof(poll));
    *rev = n > 0 ? (unsigned)strtoul(poll, NULL, 10) : 0u;
    const char *c = n > 0 ? strchr(poll, ':') : NULL;
    *on = c ? (c[1] == '1') : -1;
    idx[0] = 0;
    if (hx_get_param(L->h, "state", st, (int)sizeof(st)) > 0) {
        const char *p = strstr(st, "\"rui_index\":\"");
        if (p) { p += 13; const char *q = strchr(p, '"');
                 size_t len = q ? (size_t)(q - p) : 0; if (len > 1023) len = 1023;
                 memcpy(idx, p, len); idx[len] = 0; }
    }
}

/* Render n blocks one at a time, checking the rule after each. */
static void live_run(live_t *L, int n, const char *what) {
    for (int i = 0; i < n; i++) {
        hx_render(L->h, 1);
        char idx[1024]; int on; unsigned rev;
        live_read(L, idx, &on, &rev);
        int changed = strcmp(idx, L->idx) != 0 || on != L->on;
        if (changed) L->changes++;
        if (changed && rev == L->rev) {
            if (L->fails++ < 3)
                fprintf(stderr, "  %s, block %d: grid/transport changed but content rev stayed %u\n",
                        what, i, rev);
        }
        strcpy(L->idx, idx); L->on = on; L->rev = rev;
    }
}

static void test_live_state_bumps_content_rev(void) {
    live_t L = { .h = hx_create(NULL) };
    HX_ASSERT(L.h != NULL, "hx_create returned NULL");
    hx_t *h = L.h;
    hx_render(h, 2);
    live_read(&L, L.idx, &L.on, &L.rev);

    unsigned r0 = L.rev;
    live_run(&L, 50, "idle");
    HX_ASSERT(L.rev == r0, "an idle device must not bump the content rev");

    /* content on two tracks, two clips each (an empty clip launches too, but
     * this is the common case) */
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c1_step_0_toggle", "62 100");
    hx_set_param(h, "t2_c0_step_0_toggle", "64 100");
    hx_set_param(h, "t2_c3_step_0_toggle", "65 100");
    live_run(&L, 2, "content");

    hx_set_param(h, "transport", "play");            live_run(&L, 4,   "start (no clip launched)");
    hx_set_param(h, "t1_launch_clip", "0");          live_run(&L, 400, "launch t1 clip A → bar line");
    unsigned rs = L.rev;
    live_run(&L, 300, "steady playback");
    HX_ASSERT(L.rev == rs, "steady playback must not keep bumping the content rev");
    hx_set_param(h, "t1_launch_clip", "1");          live_run(&L, 400, "queue t1 clip B → bar-line switch");
    hx_set_param(h, "launch_scene", "3");            live_run(&L, 400, "scene D → bar-line switch");
    hx_set_param(h, "t2_mute", "1");                 live_run(&L, 2,   "mute");
    hx_set_param(h, "t2_mute", "0");                 live_run(&L, 2,   "unmute");
    hx_set_param(h, "t1_solo", "1");                 live_run(&L, 2,   "solo");
    hx_set_param(h, "t1_solo", "0");                 live_run(&L, 2,   "unsolo");
    hx_set_param(h, "transport", "stop");            live_run(&L, 4,   "stop");
    hx_set_param(h, "t2_launch_clip", "0");          live_run(&L, 4,   "launch while stopped");
    hx_set_param(h, "transport", "play");            live_run(&L, 400, "start with a clip armed");
    hx_set_param(h, "transport", "stop");            live_run(&L, 4,   "stop again");

    HX_ASSERT(L.changes >= 8, "the scripted session must actually change the grid (scenario broken?)");
    HX_ASSERT(L.fails == 0, "a grid/transport change without a content-rev bump");
    hx_destroy(h);
}

int main(void) {
    test_live_state_bumps_content_rev();
    test_snapshot_has_selected_clip_notes();
    test_snapshot_selection_switches_clip();
    test_snapshot_empty_clip_has_index();
    test_module_id_probe();
    test_snapshot_drum_clip_has_bit();
    test_snapshot_cond_present();
    test_snapshot_cond_none();
    test_snapshot_index_mute_solo();
    test_playhead_devms_field();
    printf("PASS: remote snapshot (notes round-trip, selection switch, empty index, module_id probe, rui_cond, mute/solo, devms)\n");
    return 0;
}
