/* tests/test_resample_offline.c — a CLIP TAKE RECORDED OFFLINE
 * (seq8_resample.c rs_offline_try; the host's offline_take_*, the harness's
 * stand-in).
 *
 *   - a Schwung instrument's Pre or FX take goes to the host: the same
 *     command, the slot, the point, the tempo, this project's state and how
 *     its automated instrument parameters are written; no transport starts;
 *     the take reads RECORDING with the host's frames, then DONE (the outcome
 *     read off the host);
 *   - an Audio track's too (its samples are fed to the slot);
 *   - real time instead: Wet; a Move instrument; the host refusing; automation
 *     the UI plays (a bus level) or that writes something of the slot's other
 *     than its instrument / effects; a chain parameter not yet resolved;
 *   - the host FAILING mid-take: the same take again, in real time;
 *   - Stop (the transport already stopped) cancels it at the host;
 *   - the engine's private copy ({"offline":1}) loads that state with
 *     offline_load, plays it, and never writes: no save (not even destroy's),
 *     no log. */
/* a log the test can open, so "the copy opens no log" can be seen failing */
#define SEQ8_LOG_PATH "/tmp/davebox-tests/resample-offline.log"
#include "harness.h"

static void note_at(hx_t *h, int t, int c, int step, int pitch) {
    char k[48], v[16];
    snprintf(k, sizeof k, "t%d_c%d_step_%d_toggle", t, c, step);
    snprintf(v, sizeof v, "%d 100", pitch);
    hx_set_param(h, k, v);
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "schwung");
    note_at(h, 1, 0, 0, 60);  note_at(h, 1, 0, 8, 64);
    inst->tracks[1].clips[0].length = 16;                /* 1 bar */
    return h;
}

/* a chain target `name` resolved to `key` on `slot` */
static void resolve(seq8_instance_t *inst, int id, const char *name, int slot, const char *key) {
    pa_res_t *r = &inst->pa_res[id];
    snprintf(inst->pa_targets[id], sizeof inst->pa_targets[id], "%s", name);
    memset(r, 0, sizeof *r);
    snprintf(r->name, sizeof r->name, "%s", name);
    snprintf(r->key, sizeof r->key, "%s", key);
    r->slot = (uint8_t)slot; r->kind = PA_RES_FLOAT; r->min = 0; r->max = 1; r->step = 0;
    r->valid = 1;
}

/* a take that went offline: begun at the host, nothing launched */
static int went_offline(seq8_instance_t *inst, int begins_before) {
    return hx_stub_ot_begins() == begins_before + 1 && inst->resample_offline &&
           inst->resample_state == RS_RECORDING && !inst->playing;
}

#define BAR_FRAMES 88200u

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    const move_offline_take_t *t;
    const char *state, *setup;
    int b, i;
    static char saved[1u << 20];

    hx_stub_ot_enable(1);

    /* ---- Pre: to the host ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->log_fp != NULL, "rig: a live instance did not open its log (the copy's check would see nothing)");
    hx_clear_capture(h);
    hx_set_param(h, "resample_clip", "1 0 1 0 0 2 |/x/pre.wav");
    HX_ASSERT(went_offline(inst, 0), "a Pre take of a Schwung instrument did not go offline");
    t = hx_stub_ot_take(&state, &setup);
    HX_ASSERT(!strcmp(t->key, "resample_clip") && !strcmp(t->val, "1 0 1 0 0 2 |/x/pre.wav"),
              "the copy is not given the same command");
    HX_ASSERT(t->slot == 1 && t->kind == MOVE_CAPTURE_SLOT_PRE, "not track 2's instrument before its FX");
    HX_ASSERT(t->bpm == 120.0f, "the tempo is not the project's");
    HX_ASSERT(strstr(state, "t1c0") || strlen(state) > 1000, "the state handed over is not the project's");
    snprintf(saved, sizeof saved, "%s", state);
    HX_ASSERT(inst->resample_frames == BAR_FRAMES, "the take's length is not 1 bar");
    hx_render(h, 2);
    HX_ASSERT(hx_count_midi(h, HX_MIDI_INTERNAL) == 0, "the live engine played the clip");
    hx_stub_ot_set(MOVE_OFFLINE_RUNNING, 4096, BAR_FRAMES);
    hx_render(h, 1);
    HX_ASSERT(inst->resample_done == 4096 && inst->resample_state == RS_RECORDING, "the host's progress is not the take's");
    hx_stub_ot_set(MOVE_OFFLINE_DONE, BAR_FRAMES, BAR_FRAMES);
    b = hx_stub_ot_cancels();
    hx_render(h, 1);
    HX_ASSERT(inst->resample_state == RS_DONE && inst->resample_done == BAR_FRAMES, "DONE did not finish the take");
    HX_ASSERT(hx_stub_ot_cancels() == b + 1, "the host's outcome was not cleared once read");
    HX_ASSERT(!inst->resample_offline && !inst->playing, "left running");
    HX_ASSERT(hx_stub_capture(NULL, NULL, NULL, NULL) == 0, "the host's real-time take was started too");
    hx_set_param(h, "resample_clear", "1");

    /* ---- FX: after the slot's effects ---- */
    b = hx_stub_ot_begins();
    hx_set_param(h, "resample_clip", "1 0 1 0 0 3 |/x/fx.wav");
    HX_ASSERT(went_offline(inst, b), "an FX take did not go offline");
    HX_ASSERT(hx_stub_ot_take(NULL, NULL)->kind == MOVE_CAPTURE_SLOT_FX, "not after the slot's effects");

    /* ---- Stop, the transport already stopped, cancels it at the host ---- */
    b = hx_stub_ot_cancels();
    hx_set_param(h, "transport", "stop");
    HX_ASSERT(inst->resample_state == RS_CANCELLED && !inst->resample_offline, "Stop did not cancel the offline take");
    HX_ASSERT(hx_stub_ot_cancels() == b + 1, "the host was not told");
    hx_set_param(h, "resample_clear", "1");

    /* ---- the host fails it: the same take again, in real time ---- */
    b = hx_stub_ot_begins();
    hx_set_param(h, "resample_clip", "1 0 1 0 0 2 |/x/again.wav");
    HX_ASSERT(went_offline(inst, b), "rig: offline");
    hx_stub_ot_set(MOVE_OFFLINE_FAILED, 0, 0);
    hx_render(h, 1);
    HX_ASSERT(!inst->resample_offline && inst->playing && inst->resample_state == RS_ARMED,
              "a failed offline take was not recorded in real time");
    HX_ASSERT(inst->resample_rt_why == RS_RT_FAILED, "a failed offline take: not the reason said");
    for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
    {
        int kind = -1, index = -1;
        const char *path;
        hx_stub_capture(NULL, NULL, NULL, &path);
        hx_stub_capture_src(&kind, &index);
        HX_ASSERT(kind == MOVE_CAPTURE_SLOT_PRE && index == 1 && !strcmp(path, "/x/again.wav"),
                  "the real-time take is not the same take");
    }
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");

    /* ---- real time: Wet ---- */
    b = hx_stub_ot_begins();
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/wet.wav");
    HX_ASSERT(hx_stub_ot_begins() == b && inst->playing && inst->resample_state == RS_ARMED, "Wet went offline");
    HX_ASSERT(inst->resample_rt_why == RS_RT_MIX, "Wet: the reason is not the whole mix");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");

    /* ---- real time: a scene (the whole mix), and said so ---- */
    b = hx_stub_ot_begins();
    hx_set_param(h, "resample_scene", "0 1 0 0 |/x/scene.wav");
    HX_ASSERT(hx_stub_ot_begins() == b && inst->resample_rt_why == RS_RT_MIX, "a scene take: not the whole mix's reason");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");

    /* ---- real time: the host refuses (the slot cannot be copied) ---- */
    hx_stub_ot_refuse(MOVE_OFFLINE_ERR_MOD);
    hx_set_param(h, "resample_clip", "1 0 1 0 0 2 |/x/mod.wav");
    HX_ASSERT(inst->playing && inst->resample_state == RS_ARMED && !inst->resample_offline,
              "a refused offline take was not recorded in real time");
    HX_ASSERT(inst->resample_rt_why == RS_RT_MOD, "the host's refusal is not the reason said");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_stub_ot_refuse(0);

    /* ---- automation ---- */
    resolve(inst, 5, "1:synth:cutoff", 1, "synth:cutoff");
    resolve(inst, 6, "3:synth:res", 3, "synth:res");           /* another slot's: does not matter */
    b = hx_stub_ot_begins();
    hx_set_param(h, "resample_clip", "1 0 1 0 0 2 |/x/auto.wav");
    HX_ASSERT(went_offline(inst, b), "the instrument's own automation kept it real time");
    hx_stub_ot_take(NULL, &setup);
    HX_ASSERT(strstr(setup, "pa_resolve 1:synth:cutoff 1 synth:cutoff 0 0 1 0\n") != NULL,
              "how the copy writes the automated parameter was not handed over");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");

    /* what a take HEARS decides: the fader and pan only Dry, an effect only
     * after the effects, sends / buses / other tracks' macros never */
#define TRY(val, want_off, why, msg) do { \
        b = hx_stub_ot_begins(); \
        hx_set_param(h, "resample_clip", val); \
        HX_ASSERT((want_off) ? went_offline(inst, b) : (hx_stub_ot_begins() == b && inst->playing && inst->resample_rt_why == (why)), msg); \
        hx_set_param(h, "transport", "stop"); hx_set_param(h, "resample_clear", "1"); \
    } while (0)
    resolve(inst, 7, "1:slot:volume", 1, "slot:volume");       /* the slot's level, resolved */
    TRY("1 0 1 0 0 2 |/x/lvl_pre.wav", 1, 0, "a level lane kept a Pre take (it does not hear the fader) real time");
    TRY("1 0 1 0 0 1 |/x/lvl_dry.wav", 1, 0, "a resolved level lane kept a Dry take real time (the copy writes it)");
    inst->pa_res[7].valid = 0;                                 /* not resolved: the UI would write it */
    TRY("1 0 1 0 0 1 |/x/lvl_dry2.wav", 0, RS_RT_LANE, "an unresolved level lane went offline on Dry");
    TRY("1 0 1 0 0 3 |/x/lvl_fx.wav", 1, 0, "an unresolved level lane kept an FX take (at unity) real time");
    inst->pa_targets[7][0] = '\0';

    snprintf(inst->pa_targets[7], sizeof inst->pa_targets[7], "1:slot:send_a");
    TRY("1 0 1 0 0 1 |/x/send.wav", 1, 0, "a send lane kept a Dry take real time");
    inst->pa_targets[7][0] = '\0';

    /* an instrument lane the engine cannot write: offline, the host told the
     * instrument must not play (its lane writes nothing then) */
    inst->pa_res[5].valid = 0;
    TRY("1 0 1 0 0 2 |/x/unres.wav", 1, 0, "an unresolved instrument lane did not go to the host");
    HX_ASSERT(hx_stub_ot_take(NULL, NULL)->absent == 1u, "the host was not told the instrument must be absent");
    inst->pa_res[5].valid = 1;
    TRY("1 0 1 0 0 2 |/x/res.wav", 1, 0, "rig");
    HX_ASSERT(hx_stub_ot_take(NULL, NULL)->absent == 0, "a resolved lane asked for an absent instrument");

    /* an effect's: heard after the effects, not before */
    snprintf(inst->pa_targets[9], sizeof inst->pa_targets[9], "1:fx2:mix");
    TRY("1 0 1 0 0 2 |/x/fx_pre.wav", 1, 0, "an effect lane kept a Pre take real time");
    HX_ASSERT(hx_stub_ot_take(NULL, NULL)->absent == 0, "a Pre take asked for an absent effect");
    TRY("1 0 1 0 0 3 |/x/fx_fx.wav", 1, 0, "an unresolved effect lane did not go to the host");
    HX_ASSERT(hx_stub_ot_take(NULL, NULL)->absent == (1u << 2), "the host was not told fx2 must be absent");
    inst->pa_targets[9][0] = '\0';

    /* the host refusing for a module that plays: real time, said */
    hx_stub_ot_refuse(MOVE_OFFLINE_ERR_LANE);
    TRY("1 0 1 0 0 2 |/x/lane.wav", 0, RS_RT_LANE, "a refused lane is not the reason said");
    hx_stub_ot_refuse(0);

    snprintf(inst->pa_targets[8], sizeof inst->pa_targets[8], "bus:1:level");
    TRY("1 0 1 0 0 1 |/x/bus.wav", 1, 0, "a bus level lane (no slot take hears it) kept it real time");
    snprintf(inst->pa_targets[8], sizeof inst->pa_targets[8], "mac:3:0");
    TRY("1 0 1 0 0 1 |/x/mac3.wav", 1, 0, "another track's macro lane kept it real time");
    snprintf(inst->pa_targets[8], sizeof inst->pa_targets[8], "mac:1:0");
    TRY("1 0 1 0 0 1 |/x/mac1.wav", 0, RS_RT_MACRO, "the track's own macro lane went offline (the UI plays it)");
    snprintf(inst->pa_targets[8], sizeof inst->pa_targets[8], "1:midi_fx1:rate");
    TRY("1 0 1 0 0 1 |/x/mfx.wav", 0, RS_RT_MFX_LANE, "a MIDI effect's lane went offline");
    inst->pa_targets[8][0] = '\0';
#undef TRY
    inst->pa_targets[5][0] = '\0'; inst->pa_res[5].valid = 0;
    inst->pa_targets[6][0] = '\0'; inst->pa_res[6].valid = 0;

    /* ---- an Audio track too (its copy waits for its samples:
     * test_resample_offline_audio.c) ---- */
    hx_set_param(h, "t1_convert_to_audio", "");
    note_at(h, 1, 0, 0, 0);                               /* chop 1 on the first step */
    b = hx_stub_ot_begins();
    HX_ASSERT(inst->tracks[1].pad_mode == PAD_MODE_AUDIO, "rig: t1_convert_to_audio did not make an Audio track");
    hx_set_param(h, "resample_clip", "1 0 1 0 0 2 |/x/audio.wav");
    HX_ASSERT(went_offline(inst, b), "an Audio track's Pre take did not go offline");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");

    /* ---- real time: a Move instrument ---- */
    hx_set_param(h, "t0_route", "move");
    note_at(h, 0, 0, 0, 36);
    b = hx_stub_ot_begins();
    hx_set_param(h, "resample_clip", "0 0 1 0 0 2 |/x/move.wav");
    HX_ASSERT(hx_stub_ot_begins() == b && inst->playing, "a Move instrument went offline");
    HX_ASSERT(inst->resample_rt_why == RS_RT_MOVE, "a Move instrument: not the reason said");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_destroy(h);

    /* ---- the engine's private copy: loads the state, plays it, writes nothing ---- */
    {
        const char *snap = "/tmp/davebox-tests/offline-snapshot.json";
        FILE *f = fopen(snap, "w");
        struct stat sb0, sb1;
        HX_ASSERT(f && fputs(saved, f) >= 0 && fclose(f) == 0, "rig: could not write the snapshot");
        stat(snap, &sb0);
        h = hx_create_raw("{\"offline\":1}");
        HX_ASSERT(h, "the copy was not made");
        inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(inst->offline && !inst->log_fp, "the copy is not offline, or it opened the log");
        hx_set_param(h, "offline_load", snap);
        HX_ASSERT(inst->tracks[1].pfx.route == ROUTE_SCHWUNG && inst->tracks[1].clips[0].note_count >= 2,
                  "the copy did not load the project it was given");
        hx_stub_ot_enable(1);
        hx_set_param(h, "resample_clip", "1 0 1 0 0 2 |/x/copy.wav");
        HX_ASSERT(hx_stub_ot_begins() == 0 && inst->playing && inst->resample_state == RS_ARMED,
                  "the copy did not play the take itself");
        for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
        HX_ASSERT(inst->resample_state == RS_RECORDING, "the copy did not start its take");
        hx_set_param(h, "save", "1");
        hx_destroy(h);                                     /* destroy saves a live instance */
        stat(snap, &sb1);
        HX_ASSERT(sb1.st_size == sb0.st_size && sb1.st_mtime == sb0.st_mtime, "the copy wrote the snapshot");
        f = fopen(snap, "r");
        {
            static char back[1u << 20];
            size_t n = f ? fread(back, 1, sizeof back - 1, f) : 0;
            back[n] = '\0';
            if (f) fclose(f);
            HX_ASSERT(!strcmp(back, saved), "the snapshot changed");
        }
        /* a live engine never takes the copy's key */
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "offline_load", snap);
        HX_ASSERT(inst->tracks[1].clips[0].note_count == 0, "a live engine loaded a snapshot by path");
        hx_set_param(h, "offline_samples", "/tmp/davebox-tests");
        HX_ASSERT(inst->au_offline_dir[0] == '\0', "a live engine took the copy's samples folder");
        hx_destroy(h);
    }

    printf("PASS: a clip take recorded offline when it can be, in real time when not\n");
    return 0;
}
