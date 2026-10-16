/* midi_fx_offline_render.h — run MIDI FX modules on a note list OFFLINE,
 * against a virtual transport (move_host_ext_v1_t.midi_fx_offline_*).
 *
 * The core of the offline job, kept apart from the loading and the threads
 * (midi_fx_offline.c) so it can be driven directly by a test. It does what the
 * chain does live, block by block (chain_midi.c):
 *
 *   - Start (0xFA) at tick 0, before anything else;
 *   - per 128-frame block at `bpm` (the overtake DSP's own tick_delta
 *     formula: 128 * bpm * 96 / (60 * 44100) ticks), every input event whose
 *     tick falls in the block, in order, through the modules in turn
 *     (process_midi, each one's output the next one's input — v2_process_midi_fx),
 *     with Clock (0xF8) after the events of every tick t where t % 4 == 3
 *     (dAVEBOx's slot clock: one every 4th 96-PPQN tick, after that tick's
 *     notes), and Stop (0xFC) at `length_ticks`;
 *   - then tick(128, 44100) on every module, whose output goes straight out,
 *     as live (v2_tick_midi_fx: tick output does not pass the later modules);
 *   - ticking on for `tail_ticks` past the Stop, for the note-offs a module
 *     sends late.
 *
 * Every output that is a channel message (what the chain would hand back:
 * chain_fx_to_host_should_emit) is kept, stamped with its event's tick
 * (process_midi) or the end of its block (tick), so the list comes out in
 * tick order. Bypassed modules are left out by the caller.
 */
#ifndef MIDI_FX_OFFLINE_RENDER_H
#define MIDI_FX_OFFLINE_RENDER_H

#include <stdint.h>
#include "midi_fx_api_v1.h"
#include "plugin_api_v1.h"

#define MFO_BLOCK_FRAMES 128
#define MFO_SAMPLE_RATE  44100

typedef struct {
    midi_fx_api_v1_t *api;
    void             *inst;
} mfo_fx_t;

/* The virtual transport the clones' host_api answers from (get_bpm,
 * get_clock_status, get_beat_position): set by the renderer as it goes. */
typedef struct {
    volatile float  bpm;
    volatile int    running;      /* between Start and Stop */
    volatile double tick;         /* 96 PPQN, the current block's start */
} mfo_transport_t;

typedef struct {
    move_midi_fx_offline_ev_t *out;
    int cap, n, overflow;
} mfo_sink_t;

static inline void mfo_keep(mfo_sink_t *s, uint32_t tick, const uint8_t m[3], int len) {
    const uint8_t type = (uint8_t)(m[0] & 0xF0);
    if (len < 2 || len > 3 || type < 0x80 || type > 0xE0) return;
    if (s->n >= s->cap) { s->overflow = 1; return; }
    s->out[s->n].tick = tick;
    s->out[s->n].status = m[0];
    s->out[s->n].d1 = m[1];
    s->out[s->n].d2 = len > 2 ? m[2] : 0;
    s->out[s->n].len = (uint8_t)len;
    s->n++;
}

/* One message through the modules in turn; what the last one makes is kept. */
static inline void mfo_through(const mfo_fx_t *fx, int nfx, const uint8_t *msg, int len,
                               uint32_t tick, mfo_sink_t *s) {
    uint8_t cur[MIDI_FX_MAX_OUT_MSGS][3];
    int cur_len[MIDI_FX_MAX_OUT_MSGS], cur_n = 1, i, m;
    cur[0][0] = msg[0]; cur[0][1] = len > 1 ? msg[1] : 0; cur[0][2] = len > 2 ? msg[2] : 0;
    cur_len[0] = len;
    for (i = 0; i < nfx; i++) {
        uint8_t nxt[MIDI_FX_MAX_OUT_MSGS][3];
        int nxt_len[MIDI_FX_MAX_OUT_MSGS], nxt_n = 0;
        if (!fx[i].api || !fx[i].inst || !fx[i].api->process_midi) continue;
        for (m = 0; m < cur_n && nxt_n < MIDI_FX_MAX_OUT_MSGS; m++)
            nxt_n += fx[i].api->process_midi(fx[i].inst, cur[m], cur_len[m],
                                             &nxt[nxt_n], &nxt_len[nxt_n],
                                             MIDI_FX_MAX_OUT_MSGS - nxt_n);
        for (m = 0; m < nxt_n; m++) {
            cur[m][0] = nxt[m][0]; cur[m][1] = nxt[m][1]; cur[m][2] = nxt[m][2];
            cur_len[m] = nxt_len[m];
        }
        cur_n = nxt_n;
    }
    for (m = 0; m < cur_n; m++) mfo_keep(s, tick, cur[m], cur_len[m]);
}

/* Returns 0 done, 1 cancelled (*cancel went non-zero), 2 the output did not
 * fit in `cap` (what fitted is in out). *out_n = events written. */
static inline int mfo_render(const mfo_fx_t *fx, int nfx, mfo_transport_t *tp,
                             const move_midi_fx_offline_ev_t *in, int in_n,
                             float bpm, uint32_t length_ticks, uint32_t tail_ticks,
                             move_midi_fx_offline_ev_t *out, int cap, int *out_n,
                             volatile int *cancel) {
    mfo_sink_t s = { out, cap, 0, 0 };
    const double tpb = (double)MFO_BLOCK_FRAMES * (double)bpm * 96.0 / (60.0 * (double)MFO_SAMPLE_RATE);
    const uint32_t end = length_ticks + tail_ticks;
    uint32_t next_tick = 0;          /* the next master tick to process */
    int ii = 0, stopped = 0, i, k;
    double block_start = 0.0;
    const uint8_t fa[1] = { 0xFA }, f8[1] = { 0xF8 }, fc[1] = { 0xFC };

    *out_n = 0;
    if (!(tpb > 0.0) || nfx <= 0) return 0;
    tp->bpm = bpm; tp->tick = 0.0; tp->running = 1;
    mfo_through(fx, nfx, fa, 1, 0, &s);
    while (block_start < (double)end) {
        const double block_end = block_start + tpb;
        if (cancel && *cancel) { *out_n = s.n; tp->running = 0; return 1; }
        tp->tick = block_start;
        /* the master ticks this block covers, each one's events then its clock */
        while ((double)next_tick < block_end && next_tick < end) {
            const uint32_t t = next_tick;
            if (!stopped && t >= length_ticks) {
                mfo_through(fx, nfx, fc, 1, t, &s);
                stopped = 1; tp->running = 0;
            }
            while (ii < in_n && in[ii].tick <= t) {
                const uint8_t m[3] = { in[ii].status, in[ii].d1, in[ii].d2 };
                mfo_through(fx, nfx, m, in[ii].len ? in[ii].len : 3, t, &s);
                ii++;
            }
            if (!stopped && (t % 4) == 3) mfo_through(fx, nfx, f8, 1, t, &s);
            next_tick++;
        }
        {
            uint32_t stamp = (uint32_t)(block_end < (double)end ? block_end : (double)end);
            for (i = 0; i < nfx; i++) {
                uint8_t m[MIDI_FX_MAX_OUT_MSGS][3];
                int ml[MIDI_FX_MAX_OUT_MSGS], n;
                if (!fx[i].api || !fx[i].inst || !fx[i].api->tick) continue;
                n = fx[i].api->tick(fx[i].inst, MFO_BLOCK_FRAMES, MFO_SAMPLE_RATE, m, ml, MIDI_FX_MAX_OUT_MSGS);
                for (k = 0; k < n; k++) mfo_keep(&s, stamp, m[k], ml[k]);
            }
        }
        block_start = block_end;
    }
    if (!stopped) mfo_through(fx, nfx, fc, 1, length_ticks, &s);
    tp->running = 0;
    *out_n = s.n;
    return s.overflow ? 2 : 0;
}

#endif /* MIDI_FX_OFFLINE_RENDER_H */
