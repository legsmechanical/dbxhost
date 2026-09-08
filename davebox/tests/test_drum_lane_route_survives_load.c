/* tests/test_drum_lane_route_survives_load.c — a track's route lives in TWO
 * places, and a project load must restore BOTH.
 *
 * Every drum note leaves through drum_lane_pfx[lane], which carries its own
 * `route`; tracks[t].pfx.route is only what get_param answers and what the
 * Instrument row draws. seq8_load_state restored the track copy and left the
 * lanes holding whatever create_instance put there — ROUTE_MOVE for tracks 1-4.
 *
 * The result was a load-only split-brain, found on hardware 2026-09-08: the
 * editor opened the right Schwung instrument and the Instrument row read
 * correctly, while the pads and the sequencer went on playing the Move
 * instrument, with nothing logged anywhere.
 *
 * ⚠ WHY THE EXISTING ROUND-TRIP TEST CANNOT SEE THIS. Lane routes are not
 * serialized — they are derived from the track's. So the before and after blobs
 * are byte-identical while the in-memory routing differs, and a serializer
 * compare passes on a machine that would play the wrong instrument. This test
 * therefore asserts the loaded STATE, never the bytes.
 *
 * It needs all three conditions together, which is why it went unreproduced for
 * so long: a RELOAD (the live setter in sp_track_config.c does fan out, so
 * picking an instrument looks fine), a track in DRUM mode, and one of tracks
 * 1-4 (tracks 5-8 default to Schwung, so the stale copy is already right). */
#include "harness.h"
#include <unistd.h>

static void assert_lanes(seq8_instance_t *inst, int t, uint8_t want, const char *what)
{
    int l;
    for (l = 0; l < DRUM_LANES; l++) {
        if (inst->tracks[t].drum_lane_pfx[l].route != want) {
            fprintf(stderr,
                    "FAIL: %s — t%d lane %d route is %d, want %d "
                    "(track pfx.route is %d)\n",
                    what, t, l, (int)inst->tracks[t].drum_lane_pfx[l].route,
                    (int)want, (int)inst->tracks[t].pfx.route);
            exit(1);
        }
    }
}

int main(void)
{
    char tmp[256];
    static char blob[65536];
    int n;

    /* --- instance A: the gesture Josh made, on the track that broke --- */
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* Track 0 defaults to ROUTE_MOVE (t < 4), lanes included. */
    HX_ASSERT(inst->tracks[0].pfx.route == ROUTE_MOVE, "t0 did not default to MOVE");
    assert_lanes(inst, 0, ROUTE_MOVE, "fresh instance");

    hx_set_param(h, "t0_pad_mode", "1");        /* PAD_MODE_DRUM */
    hx_set_param(h, "t0_route", "schwung");
    /* The LIVE setter fans out — this is why picking an instrument works and
     * only a reload shows the bug. Pinned so a regression here is not mistaken
     * for the load-side one. */
    assert_lanes(inst, 0, ROUTE_SCHWUNG, "after the live route change");

    /* Track 1 stays Move, in drum mode too: the control. If the fix blanket-set
     * every lane to the track's default rather than its LOADED route, this is
     * what would catch it. */
    hx_set_param(h, "t1_pad_mode", "1");

    n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
    HX_ASSERT(n > 0, "state_full empty");
    HX_ASSERT((size_t)n < sizeof(blob) - 1, "state_full at buffer cap");

    snprintf(tmp, sizeof(tmp), "/tmp/hx_lane_route_%d.json", (int)getpid());
    {
        FILE *wf = fopen(tmp, "w");
        HX_ASSERT(wf && fwrite(blob, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
        fclose(wf);
    }

    /* --- instance B: fresh, then load. The reload that produced the bug. --- */
    hx_destroy(h);
    h = hx_create(NULL);
    HX_ASSERT(h, "second create failed");
    inst = (seq8_instance_t *)h->inst;

    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    inst->state_path[sizeof(inst->state_path) - 1] = '\0';
    seq8_load_state(inst);
    remove(tmp);

    /* The track copy always survived — that is why the UI looked right. */
    HX_ASSERT(inst->tracks[0].pfx.route == ROUTE_SCHWUNG,
              "t0 track route did not survive the load");
    /* ...and the copy the pads and sequencer actually emit through. */
    assert_lanes(inst, 0, ROUTE_SCHWUNG, "t0 lanes after load");

    /* The control: a Move track's lanes must still be MOVE. */
    HX_ASSERT(inst->tracks[1].pfx.route == ROUTE_MOVE, "t1 track route changed");
    assert_lanes(inst, 1, ROUTE_MOVE, "t1 lanes after load");

    /* Tracks 5-8 default to Schwung and must be unaffected either way. */
    HX_ASSERT(inst->tracks[4].pfx.route == ROUTE_SCHWUNG, "t4 track route changed");
    assert_lanes(inst, 4, ROUTE_SCHWUNG, "t4 lanes after load");

    hx_destroy(h);
    printf("PASS: a drum track's LANE routes survive a project load\n");
    return 0;
}
