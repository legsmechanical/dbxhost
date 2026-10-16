/* test_midi_fx_offline.c — an offline MIDI FX job runs a private COPY of the
 * module (midi_fx_offline.c), against a virtual transport.
 *
 * The fixture module (built by the .sh) keeps its host pointer and a counter
 * in GLOBALS, as real modules do, and answers:
 *   - a note: itself, `transpose` higher (a setting: param, or "state");
 *   - Clock (0xF8): a note 100 + how many notes it holds, on and off — a
 *     clock-driven generator whose output shows its state;
 *   - get_param("host_bpm"): its stored host's get_bpm(); "count": its
 *     global counter.
 *
 * Asserted:
 *   - the LIVE instance is untouched: its counter, its host (the job's
 *     tempo never reaches it) — the copy's globals are its own, which a
 *     second load of the same file could not give;
 *   - the live settings reach the copy (param and state);
 *   - the clock: Start, then Clock after ticks 3, 7, 11... (dAVEBOx's slot
 *     clock), and none after Stop; the input at its own tick;
 *   - the copy's host answers the virtual tempo;
 *   - a second job reuses the cached copy (one file);
 *   - cancel returns the job to IDLE with nothing to read; a refused begin
 *     (nothing active, a busy job) queues nothing. */
#include <dirent.h>
#include <dlfcn.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "midi_fx_offline.h"
#include "midi_fx_offline_render.h"

void unified_log(const char *source, int level, const char *fmt, ...) {
    va_list ap; (void)level;
    if (!getenv("MFO_LOG")) return;
    va_start(ap, fmt); fprintf(stderr, "[%s] ", source); vfprintf(stderr, fmt, ap); fputc('\n', stderr); va_end(ap);
}

static int fails;
#define CHECK(c, m) do { if (!(c)) { fprintf(stderr, "FAIL: %s\n", m); fails++; } } while (0)

static float live_bpm(void) { return 99.0f; }
static host_api_v1_t live_host;

/* The "live" instance: the fixture loaded the ordinary way. */
static midi_fx_api_v1_t *live_api;
static void *live_inst;
static int clone_src_result = 1;     /* what the chain's export answers */

static void *slot_instance(int slot) { return slot == 3 ? (void *)&live_inst : NULL; }
static int clone_source(void *instance, mfo_fx_src_t *out, int max) {
    (void)instance; (void)max;
    if (clone_src_result <= 0) return clone_src_result;
    memset(out, 0, sizeof *out);
    snprintf(out->so_path, sizeof out->so_path, "%s/midi_fx/fix/dsp.so", FIXTURE_DIR);
    snprintf(out->dir, sizeof out->dir, "%s/midi_fx/fix", FIXTURE_DIR);
    /* as the chain does: read the live instance's settings */
    out->nparams = 1;
    snprintf(out->key[0], sizeof out->key[0], "transpose");
    live_api->get_param(live_inst, "transpose", out->val[0], sizeof out->val[0]);
    out->state_len = live_api->get_param(live_inst, "state", out->state, MFO_STATE_MAX);
    return 1;
}
static chain_midi_fx_clone_source_fn clone_fn = clone_source;

static int live_param(const char *k) {
    char b[64];
    if (live_api->get_param(live_inst, k, b, sizeof b) < 0) return -9999;
    return atoi(b);
}
static int files_in(const char *dir) {
    DIR *d = opendir(dir); struct dirent *e; int n = 0;
    if (!d) return 0;
    while ((e = readdir(d))) if (e->d_name[0] != '.') n++;
    closedir(d);
    return n;
}

int main(void) {
    char path[600];
    move_midi_fx_offline_ev_t in[4], out[MOVE_MIDI_FX_OFFLINE_MAX_EV];
    int n = 0, st;

    snprintf(path, sizeof path, "%s/midi_fx/fix/dsp.so", FIXTURE_DIR);
    {
        void *h = dlopen(path, RTLD_NOW | RTLD_LOCAL);
        midi_fx_init_fn init = h ? (midi_fx_init_fn)dlsym(h, MIDI_FX_INIT_SYMBOL) : NULL;
        memset(&live_host, 0, sizeof live_host);
        live_host.get_bpm = live_bpm;
        live_api = init ? init(&live_host) : NULL;
        if (!live_api) { fprintf(stderr, "FAIL: rig: the fixture did not load\n"); return 1; }
        live_inst = live_api->create_instance(FIXTURE_DIR, NULL);
        live_api->set_param(live_inst, "transpose", "5");
    }
    {   /* the live instance plays one note: its counter is 1 */
        const uint8_t on[3] = { 0x90, 40, 100 };
        uint8_t o[16][3]; int ol[16];
        live_api->process_midi(live_inst, on, 3, o, ol, 16);
    }
    CHECK(live_param("count") == 1 && live_param("host_bpm") == 99, "rig: the live instance");

    midi_fx_offline_configure(&live_host, slot_instance, &clone_fn);

    /* ---- refusals queue nothing ---- */
    in[0] = (move_midi_fx_offline_ev_t){ 0, 0x90, 60, 100, 3 };
    in[1] = (move_midi_fx_offline_ev_t){ 24, 0x80, 60, 0, 3 };
    CHECK(midi_fx_offline_begin(7, 120.0f, 96, 24, in, 2) == 0, "a slot with no chain was not refused");
    clone_src_result = 0;
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 24, in, 2) == 0, "a slot with nothing active was not refused");
    clone_src_result = -1;
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 24, in, 2) == 0, "a setting that does not fit was not refused");
    clone_src_result = 1;
    CHECK(midi_fx_offline_poll(out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 1) == MOVE_MIDI_FX_OFFLINE_IDLE, "a refusal left a job");

    /* ---- one job ---- */
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 24, in, 2) == 1, "begin refused a good job");
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 24, in, 2) == 0, "a second job was taken while one is queued");
    CHECK(midi_fx_offline_poll(out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 0) == MOVE_MIDI_FX_OFFLINE_QUEUED, "not queued");
    CHECK(midi_fx_offline_run_pending() == 1, "the job did not run");
    st = midi_fx_offline_poll(out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 1);
    CHECK(st == MOVE_MIDI_FX_OFFLINE_DONE, "the job did not finish DONE");
    {
        int i, on60 = 0, off60 = 0, f8 = 0, f8_bad = 0, late = 0, bpm_ok = 0;
        uint32_t last = 0;
        for (i = 0; i < n; i++) {
            const move_midi_fx_offline_ev_t *e = &out[i];
            if (e->tick < last) late = 1;
            last = e->tick;
            if ((e->status & 0xF0) == 0x90 && e->d1 == 65 && e->d2) { on60++; CHECK(e->tick == 0, "the note did not come out at its tick"); }
            if ((e->status & 0xF0) == 0x80 && e->d1 == 65) { off60++; CHECK(e->tick == 24, "the note-off did not come out at its tick"); }
            if ((e->status & 0xF0) == 0x90 && e->d1 >= 100 && e->d1 < 110 && e->d2) {
                f8++;
                if (e->tick % 4 != 3) f8_bad = 1;
                if (e->tick >= 96) late = 2;
                /* held count: 1 while the note is on (ticks 0..23), 0 after */
                CHECK(e->d1 == (e->tick < 24 ? 101 : 100), "a clock note does not show the copy's own held count");
            }
            if (e->status == 0xB0 && e->d1 == 7) bpm_ok = (e->d2 == 120);
        }
        CHECK(on60 == 1 && off60 == 1, "the input did not come out transposed by the live setting (+5)");
        CHECK(f8 == 24, "not one clock note per 24-PPQN clock over 96 ticks");
        CHECK(!f8_bad, "a clock arrived off dAVEBOx's phase (after ticks 3, 7, 11...)");
        CHECK(late != 2, "the clock ran past Stop");
        CHECK(late != 1, "the output is not in tick order");
        CHECK(bpm_ok, "the copy's host did not answer the job's tempo");
    }
    /* the live instance is untouched */
    CHECK(live_param("count") == 1, "the job ran on the LIVE instance's globals (its counter moved)");
    CHECK(live_param("host_bpm") == 99, "the job re-pointed the LIVE instance's host (it reads the job's tempo)");

    /* ---- the state blob reaches the copy too ---- */
    live_api->set_param(live_inst, "state", "T=7");
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 0, in, 2) == 1, "begin refused the second job");
    midi_fx_offline_run_pending();
    st = midi_fx_offline_poll(out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 1);
    {
        int i, got = 0;
        for (i = 0; i < n; i++) if ((out[i].status & 0xF0) == 0x90 && out[i].d1 == 67 && out[i].d2) got = 1;
        CHECK(st == MOVE_MIDI_FX_OFFLINE_DONE && got, "the live state did not reach the copy (+7)");
    }
    snprintf(path, sizeof path, "%s/cache/midifx-clone", FIXTURE_DIR);
    CHECK(files_in(path) == 1, "the copy of the module was not cached (or was made twice)");

    /* ---- cancel ---- */
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 0, in, 2) == 1, "begin refused the third job");
    midi_fx_offline_cancel();
    midi_fx_offline_run_pending();
    CHECK(midi_fx_offline_poll(out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 1) == MOVE_MIDI_FX_OFFLINE_IDLE && n == 0,
          "a cancelled job left something to read");
    CHECK(midi_fx_offline_begin(3, 120.0f, 96, 0, in, 2) == 1, "after a cancel a new job was refused");
    midi_fx_offline_run_pending();
    midi_fx_offline_poll(out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 1);

    if (fails) return 1;
    printf("PASS: offline MIDI FX: a private copy, the live settings, dAVEBOx's clock, the live instance untouched\n");
    return 0;
}
