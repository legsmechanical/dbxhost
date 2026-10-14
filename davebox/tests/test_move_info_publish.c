/* tests/test_move_info_publish.c — dAVEBOx publishes its key, scale, tempo and
 * transport for modules that follow the host's (move_info.h through the
 * host's schwung_move_info(); the extension's set_move_info).
 *
 *   - the first block publishes: valid, the key, the scale by NAME, the
 *     tempo, stopped; every field db does not know reads as move_info's
 *     explicit unknown (never a plausible 0);
 *   - a key / scale / tempo / transport change is republished at the next
 *     block, and an idle block publishes nothing (it is not per block);
 *   - a transpose PREVIEW publishes its candidate (what is heard), and a
 *     cancel puts the committed key back;
 *   - the names are the UI's SCALE_NAMES, in order (one table, two copies).
 */
#include "harness.h"

static const move_info_t *mi(void) { return hx_stub_move_info(); }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    hx_set_param(h, "key", "2");          /* D */
    hx_set_param(h, "scale", "2");        /* Dorian */
    hx_set_param(h, "bpm", "97");
    hx_render(h, 1);
    HX_ASSERT(mi() != NULL, "nothing was published");
    HX_ASSERT(mi()->size == sizeof(move_info_t) && mi()->version == MOVE_INFO_VERSION, "size / version");
    HX_ASSERT(mi()->valid == 1, "not valid");
    HX_ASSERT(mi()->root_note == 2, "root_note");
    HX_ASSERT(!strcmp(mi()->scale, "Dorian"), "scale name");
    HX_ASSERT(mi()->tempo > 96.9f && mi()->tempo < 97.1f, "tempo");
    HX_ASSERT(mi()->playing == 0, "playing while stopped");
    /* the unknowns are explicit */
    HX_ASSERT(mi()->metronome_on == 255 && mi()->midi_clock_sync == 255 && mi()->input_monitoring == 255, "flag unknowns");
    HX_ASSERT(mi()->selected_track == -1 && mi()->global_quant == -1, "int unknowns");
    HX_ASSERT(mi()->groove < 0 && mi()->master_db <= -1000.0f && mi()->song_beats < 0, "float unknowns");
    HX_ASSERT(mi()->track[0].color_id == -1 && mi()->track[3].muted == 255 && mi()->track[2].volume_db <= -1000.0f, "track unknowns");

    /* idle: no republish */
    {
        const int n = hx_stub_move_info_calls();
        hx_render(h, 50);
        HX_ASSERT(hx_stub_move_info_calls() == n, "republished with nothing changed (it must not be per block)");
    }

    /* changes follow, one block later */
    hx_set_param(h, "key", "7");
    hx_render(h, 1);
    HX_ASSERT(mi()->root_note == 7, "a key change was not republished");
    hx_set_param(h, "scale", "13");
    hx_render(h, 1);
    HX_ASSERT(!strcmp(mi()->scale, "Diminished"), "a scale change was not republished");
    hx_set_param(h, "bpm", "123");
    hx_render(h, 1);
    HX_ASSERT(mi()->tempo > 122.9f && mi()->tempo < 123.1f, "a tempo change was not republished");
    hx_set_param(h, "transport", "play");
    hx_render(h, 2);
    HX_ASSERT(mi()->playing == 1, "play was not published");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 2);
    HX_ASSERT(mi()->playing == 0, "stop was not published");

    /* a transpose preview publishes what is heard; a cancel puts it back */
    hx_set_param(h, "t0_xpose_prev", "7 13 0 0");
    hx_render(h, 1);
    HX_ASSERT(mi()->root_note == 0 && !strcmp(mi()->scale, "Major"), "the preview's candidate was not published");
    hx_set_param(h, "t0_xpose_apply", "7 13 0 0 0");
    hx_render(h, 1);
    HX_ASSERT(inst->xpose_preview_active == 0, "rig: the cancel did not end the preview");
    HX_ASSERT(mi()->root_note == 7 && !strcmp(mi()->scale, "Diminished"), "the committed key did not come back after a cancel");

    /* every scale has a name, and it is the UI's */
    {
        static const char *ui[14] = {
            "Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian",
            "Locrian", "Harmonic Minor", "Melodic Minor",
            "Pentatonic Major", "Pentatonic Minor", "Blues", "Whole Tone", "Diminished",
        };
        char v[8];
        int s;
        FILE *f = fopen("ui/ui_constants.mjs", "r");
        static char src[1 << 16];
        size_t n = f ? fread(src, 1, sizeof src - 1, f) : 0; src[n] = 0;
        if (f) fclose(f);
        const char *t = strstr(src, "export const SCALE_NAMES = [");
        HX_ASSERT(t != NULL, "SCALE_NAMES not found in ui/ui_constants.mjs");
        for (s = 0; s < 14; s++) {
            char q[40];
            snprintf(q, sizeof q, "'%s'", ui[s]);
            const char *at = strstr(t, q);
            HX_ASSERT(at != NULL && at < strchr(t, ']'), "the UI's SCALE_NAMES lacks a published name");
            t = at;                                    /* and in this order */
            snprintf(v, sizeof v, "%d", s);
            hx_set_param(h, "scale", v);
            hx_render(h, 1);
            HX_ASSERT(!strcmp(mi()->scale, ui[s]), "a scale published a name other than the UI's");
        }
    }

    hx_destroy(h);
    printf("PASS: dAVEBOx publishes its key, scale, tempo and transport for move_info readers, on change\n");
    return 0;
}
