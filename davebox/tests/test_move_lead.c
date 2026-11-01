/* tests/test_move_lead.c — THE LEAD (see LEAD_BLOCKS in seq8.c).
 *
 * Move plays what is injected into it LEAD_BLOCKS blocks after a Schwung slot
 * plays the same note (measured on the device, 2026-11-01). So what the
 * sequencer plays for Move goes out at once, and everything else it plays is
 * held LEAD_BLOCKS blocks: both are then heard together.
 *
 *   - the same tick on a Move track and a Schwung track: the Schwung note
 *     leaves exactly LEAD_BLOCKS blocks after the Move one, on and off alike;
 *   - a drum lane is held the same;
 *   - a live pad is not held;
 *   - a stop inside the hold drops the held note-on (it was due after the stop
 *     in what is heard) and leaves no note hanging;
 *   - an Audio track's sequenced sound (a Pitch loop, Slice chops on steps) and
 *     the click come out exactly LEAD_FRAMES later than without the lead,
 *     and a pad's chop not at all later;
 *   - recording: a pad pressed at the same sequencer moment records the lead
 *     EARLIER (where it was heard), on a melodic track and a drum lane. */
#include "harness.h"
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

#define MEL_MAP \
    "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 " \
    "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91"

/* the block of the first note-on / note-off of `kind` (for INTERNAL: to `slot`), -1 = none */
static int first_ev(hx_midi_kind kind, int slot, int on) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != kind || (kind == HX_MIDI_INTERNAL && e->slot != slot)) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        int is_on = st == 0x90 && e->bytes[3] > 0;
        int is_off = st == 0x80 || (st == 0x90 && e->bytes[3] == 0);
        if ((on && is_on) || (!on && is_off)) return e->block;
    }
    return -1;
}
static int count_ons(hx_midi_kind kind, int slot) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != kind || (kind == HX_MIDI_INTERNAL && e->slot != slot)) continue;
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0) n++;
    }
    return n;
}

/* Track 1 (melodic) plays into Move, track 4 (melodic) into Schwung slot 4,
 * track 0 (drums) into Schwung slot 0: one note each on the first tick. */
#define MV_T 1
#define SW_T 4
#define SW_SLOT 4
#define DR_SLOT 0

/* ---- Audio: one sample, recorded off slot 4's feed ---- */
static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
static void write_tone(const char *path) {                 /* 2 s, 440 Hz, from frame 0 */
    FILE *f = fopen(path, "wb");
    uint32_t i, n = 88200;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(12000 * sin(2 * M_PI * 440 * i / 44100)));
    fclose(f);
}
/* track 4 an Audio track holding the tone: slice 0 = a Pitch loop, 1 = Slice */
static hx_t *audio_rig(int lead_off, int slice) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[300];
    if (lead_off) HX_NO_LEAD(h);
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/tone.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    for (int i = 0; i < 2000 && inst->au_clip[4][0].state == 1; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(inst->au_clip[4][0].state == 2, "the tone did not load");
    hx_set_param(h, "t4_au_set_bpm", "0 1200");
    if (slice) hx_set_param(h, "t4_au_set_mode", "0 1");      /* Even 16 on the 16 steps */
    else       hx_set_param(h, "t4_au_set_sync", "0 2");      /* Pitch */
    hx_set_param(h, "t4_launch_clip", "0");
    return h;
}
/* frames from now to the first sound slot 4 feeds, over `blocks` blocks
 * (silence where nothing was fed); -1 = none. set_param key = val is frame 0. */
static int first_sound(hx_t *h, const char *key, const char *val, int blocks) {
    int at = 0, fed = hx_stub_feed(4, NULL, NULL);
    hx_set_param(h, key, val);
    for (int b = 0; b < blocks; b++) {
        hx_render(h, 1);
        int n = hx_stub_feed(4, NULL, NULL);
        if (n != fed) {
            fed = n;
            const int16_t *x = hx_stub_feed_last(4);
            for (int k = 0; k < MOVE_FRAMES_PER_BLOCK; k++) if (x[k * 2]) return at + k;
        }
        at += MOVE_FRAMES_PER_BLOCK;
    }
    return -1;
}
/* the click's first frame in the block output (render_block's out_lr) */
static int first_click(hx_t *h, int blocks) {
    int at = 0;
    hx_set_param(h, "transport", "play");
    for (int b = 0; b < blocks; b++) {
        hx_render(h, 1);
        const int16_t *x = hx_last_audio();
        for (int k = 0; k < MOVE_FRAMES_PER_BLOCK; k++) if (x[k * 2]) return at + k;
        at += MOVE_FRAMES_PER_BLOCK;
    }
    return -1;
}


/* Record one pad at the sequencer's clip tick `at` (melodic track 4 or drum
 * track 0, lane 0) and return the tick it was recorded at (-1 = none). */
static int record_at(int lead_off, int drum, uint32_t at) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int t = drum ? 0 : 4;
    seq8_track_t *tr = &inst->tracks[t];
    char k[48];
    if (lead_off) HX_NO_LEAD(h);
    if (drum) { hx_set_param(h, "t0_drum_repeat_stop", "1"); hx_set_param(h, "t0_drum_repeat2_lane_off", "1"); }
    snprintf(k, sizeof k, "t%d_route", t); hx_set_param(h, k, "schwung");
    snprintf(k, sizeof k, "t%d_launch_clip", t); hx_set_param(h, k, "0");
    inst->dsp_inbound_enabled = 1;
    inst->active_track = (uint8_t)t;
    inst->drum_right_inert = 0;
    inst->pad_dispatch_muted = 0;
    inst->pad_note_map[t][0] = drum ? 36 : 60;
    tr->drum_inp_quant = 0;                                   /* InQ off: the tick as pressed */
    hx_set_param(h, "transport", "play");
    tr->recording = 1;
    for (int i = 0; i < 400; i++) {
        uint32_t now = drum ? (uint32_t)tr->drum_current_step[0] * TICKS_PER_STEP + tr->drum_tick_in_step[0]
                            : tr->current_clip_tick;
        if (now == at) break;
        hx_render(h, 1);
    }
    { uint8_t on[3] = { 0x90, 68, 100 }; hx_send_midi(h, on, 3, 0); }
    snprintf(k, sizeof k, drum ? "t%d_drum_record_note_on" : "t%d_record_note_on", t);
    hx_set_param(h, k, drum ? "36 100" : "60 100");
    hx_render(h, 2);
    { uint8_t off[3] = { 0x80, 68, 0 }; hx_send_midi(h, off, 3, 0); }
    snprintf(k, sizeof k, drum ? "t%d_drum_record_note_off" : "t%d_record_note_off", t);
    hx_set_param(h, k, drum ? "36" : "60");
    tr->recording = 0;
    hx_set_param(h, "transport", "stop");
    clip_t *cl = drum ? &tr->drum_clips[tr->active_clip]->lanes[0].clip : &tr->clips[tr->active_clip];
    int got = -1;
    for (int i = 0; i < cl->note_count; i++) if (cl->notes[i].active) { got = (int)cl->notes[i].tick; break; }
    hx_destroy(h);
    return got;
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create");
    hx_set_param(h, "t1_route", "move");
    hx_set_param(h, "t4_route", "schwung");
    hx_set_param(h, "t0_route", "schwung");
    hx_set_param(h, "t1_c0_note_add", "0 60 100 12");
    hx_set_param(h, "t4_c0_note_add", "0 60 100 12");
    hx_set_param(h, "t0_l0_note_add", "0 100 12");
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "t4_launch_clip", "0");
    return h;
}

int main(void) {
    char m[160];

    /* ---- the same tick: Move at once, Schwung LEAD_BLOCKS later ---- */
    {
        hx_t *h = rig();
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play");
        hx_render(h, 60);
        int mv_on = first_ev(HX_MIDI_INJECT, 0, 1), mv_off = first_ev(HX_MIDI_INJECT, 0, 0);
        int sw_on = first_ev(HX_MIDI_INTERNAL, SW_SLOT, 1), sw_off = first_ev(HX_MIDI_INTERNAL, SW_SLOT, 0);
        int dr_on = first_ev(HX_MIDI_INTERNAL, DR_SLOT, 1);
        HX_ASSERT(mv_on > 0 && sw_on > 0 && dr_on > 0, "control: all three tracks played their note");
        snprintf(m, sizeof m, "the Schwung note-on left %d blocks after Move's, not %d", sw_on - mv_on, LEAD_BLOCKS);
        HX_ASSERT(sw_on - mv_on == LEAD_BLOCKS, m);
        snprintf(m, sizeof m, "the Schwung note-off left %d blocks after Move's, not %d", sw_off - mv_off, LEAD_BLOCKS);
        HX_ASSERT(mv_off > mv_on && sw_off - mv_off == LEAD_BLOCKS, m);
        snprintf(m, sizeof m, "the drum lane's note-on left %d blocks after Move's, not %d", dr_on - mv_on, LEAD_BLOCKS);
        HX_ASSERT(dr_on - mv_on == LEAD_BLOCKS, m);
        /* the slots' Start (their MIDI FX and synced LFOs run on it) keeps
         * time with their notes: sent in Play's first render, out LEAD later */
        int fa = -1;
        for (int i = 0; i < hx_stub_event_count() && fa < 0; i++) {
            const hx_midi_event *e = hx_stub_event(i);
            if (e->kind == HX_MIDI_INTERNAL && e->bytes[1] == 0xFA) fa = e->block;
        }
        snprintf(m, sizeof m, "the slots' Start left in block %d, not %d", fa, 1 + LEAD_BLOCKS);
        HX_ASSERT(fa == 1 + LEAD_BLOCKS, m);
        hx_set_param(h, "transport", "stop");
        hx_destroy(h);
        printf("  ok   — one tick: Move's note at once, a Schwung slot's, a drum lane's and the slots' Start %d blocks later\n", LEAD_BLOCKS);
    }

    /* ---- a live pad is not held ---- */
    {
        hx_t *h = rig();
        hx_set_param(h, "t4_padmap", MEL_MAP);
        hx_set_param(h, "transport", "play");
        hx_render(h, 20);
        hx_clear_capture(h);
        hx_render(h, 1);
        int at = hx_stub_event_count() ? hx_stub_event(0)->block : 1;   /* this capture's block clock */
        uint8_t on[3] = { 0x90, 68, 100 };
        hx_send_midi(h, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
        hx_render(h, 8);
        int got = -1;
        for (int i = 0; i < hx_stub_event_count(); i++) {
            const hx_midi_event *e = hx_stub_event(i);
            if (e->kind == HX_MIDI_INTERNAL && e->slot == SW_SLOT && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == 60 && e->bytes[3] > 0) { got = e->block; break; }
        }
        HX_ASSERT(got >= 0, "control: the live pad played");
        snprintf(m, sizeof m, "the live pad left %d blocks after it was pressed (held?)", got - at);
        HX_ASSERT(got - at <= 1, m);
        uint8_t off[3] = { 0x80, 68, 0 };
        hx_send_midi(h, off, 3, MOVE_MIDI_SOURCE_INTERNAL);
        hx_set_param(h, "transport", "stop");
        hx_destroy(h);
        printf("  ok   — a live pad on a Schwung track goes at once\n");
    }

    /* ---- a stop inside the hold: the held note-on never sounds ---- */
    {
        hx_t *h = rig();
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play");
        int i;
        for (i = 0; i < 60 && first_ev(HX_MIDI_INJECT, 0, 1) < 0; i++) hx_render(h, 1);
        HX_ASSERT(first_ev(HX_MIDI_INJECT, 0, 1) > 0, "control: Move's note went");
        HX_ASSERT(count_ons(HX_MIDI_INTERNAL, SW_SLOT) == 0, "control: the Schwung note is still held");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 20);
        HX_ASSERT(count_ons(HX_MIDI_INTERNAL, SW_SLOT) == 0,
                  "a note-on held across a stop sounded after it (it was due after the stop)");
        {
            /* (offs the stopped render still sends are held as usual) */
            seq8_instance_t *in = (seq8_instance_t *)h->inst;
            for (uint32_t q = in->lead_tail; q != in->lead_head; q++) {
                const lead_ev_t *e = &in->lead_q[q & (LEAD_RING - 1)];
                HX_ASSERT(!((e->st & 0xF0) == 0x90 && e->d2 > 0), "a note-on is still held after the stop");
            }
        }
        hx_destroy(h);
        printf("  ok   — a stop inside the hold drops the held note-on, none left held\n");
    }

    /* ---- an Audio track: the sequenced sound LEAD_FRAMES later, a pad's not ---- */
    snprintf(g_root, sizeof g_root, "/tmp/hx_lead_%d", (int)getpid());
    mkdir(g_root, 0775);
    { char p[300]; snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
      snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
      snprintf(p, sizeof p, "%s/tone.wav", g_root); write_tone(p); }
    {
        static const char *what[] = { "a Pitch loop", "Slice chops on steps" };
        for (int slice = 0; slice < 2; slice++) {
            int on, off;
            hx_t *h = audio_rig(1, slice); off = first_sound(h, "transport", "play", 40); hx_destroy(h);
            h = audio_rig(0, slice);       on  = first_sound(h, "transport", "play", 40); hx_destroy(h);
            HX_ASSERT(off > 0, "control: without the lead the track sounded");
            snprintf(m, sizeof m, "%s came out %d frames later with the lead, not %d", what[slice], on - off, LEAD_FRAMES);
            HX_ASSERT(on - off == LEAD_FRAMES, m);
            printf("  ok   — %s: heard %d frames later with the lead (%d without, %d with)\n", what[slice], LEAD_FRAMES, off, on);
        }
        int on, off;
        hx_t *h = audio_rig(1, 1); hx_render(h, 4); off = first_sound(h, "t4_live_notes", "eon 0 100", 10); hx_destroy(h);
        h = audio_rig(0, 1);       hx_render(h, 4); on  = first_sound(h, "t4_live_notes", "eon 0 100", 10); hx_destroy(h);
        HX_ASSERT(off >= 0, "control: the pad's chop sounded");
        snprintf(m, sizeof m, "a pad's chop came out %d frames later with the lead", on - off);
        HX_ASSERT(on == off, m);
        printf("  ok   — a pad's chop is not delayed (frame %d either way)\n", on);
    }
    {
        static int16_t click[256];
        int on, off;
        for (int i = 0; i < 256; i++) click[i] = 20000;
        for (int lead = 0; lead < 2; lead++) {
            hx_t *h = hx_create(NULL);
            seq8_instance_t *inst = (seq8_instance_t *)h->inst;
            if (!lead) HX_NO_LEAD(h);
            inst->metro_wav_data = click; inst->metro_wav_frames = 256; inst->metro_vol = 100;
            hx_set_param(h, "metro_on", "3");
            int f = first_click(h, 40);
            if (lead) on = f; else off = f;
            inst->metro_wav_data = NULL;
            hx_destroy(h);
        }
        HX_ASSERT(off >= 0, "control: the click sounded");
        snprintf(m, sizeof m, "the click came %d frames later with the lead, not %d", on - off, LEAD_FRAMES);
        HX_ASSERT(on - off == LEAD_FRAMES, m);
        printf("  ok   — the click: %d frames later with the lead\n", LEAD_FRAMES);
    }

    /* ---- recording: where it was heard ---- */
    {
        hx_t *h = hx_create(NULL);
        uint32_t L = lead_ticks((seq8_instance_t *)h->inst);
        hx_destroy(h);
        HX_ASSERT(L > 0, "control: the lead is some ticks at 120 BPM");
        for (int drum = 0; drum < 2; drum++) {
            int off = record_at(1, drum, 100), on = record_at(0, drum, 100);
            snprintf(m, sizeof m, "%s: pressed at tick 100, recorded at %d without the lead, %d with", drum ? "drum" : "melodic", off, on);
            HX_ASSERT(off == 100, m);
            HX_ASSERT(on == 100 - (int)L, m);
            printf("  ok   — recording (%s): a press at sequencer tick 100 lands at %d, where it was heard (%u ticks back)\n",
                   drum ? "a drum lane" : "melodic", on, L);
        }
    }
    { char cmd[300]; snprintf(cmd, sizeof cmd, "rm -rf %s", g_root); if (system(cmd)) {} }

    printf("PASS: test_move_lead\n");
    return 0;
}
