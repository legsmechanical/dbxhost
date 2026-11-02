/* offline_take.h — offline takes (move_host_ext_v1_t.offline_take_*).
 *
 * One take at a time. begin / state / cancel are called by the overtake DSP
 * (begin from its set_param or render_block, on the SPI thread: it reads the
 * slot's settings through the chain's export and flips atomics, nothing
 * else). The take runs on its own thread (offline_take_start): a MINI HOST
 * that loads private copies (module_clone.h) of the overtake DSP itself and of
 * the slot's instrument and audio FX, gives each the live settings, and
 * renders them block by block in the order the shim does —
 *
 *     the slot's copy renders (what earlier blocks sent it);
 *     the overtake DSP's copy renders: its sends land on the slot's copy now
 *       (heard next block), and a capture_start_src starts the take;
 *     the slot's block is written from the take's start —
 *
 * at the instrument's synth level (MOVE_CAPTURE_SLOT_PRE, the shim's
 * shadow_apply_synth_level) or after the copied FX at unity
 * (MOVE_CAPTURE_SLOT_FX). What the copy sends reaches the instrument as the
 * host would deliver it: the slot's channel remap and transpose, realtime as a
 * broadcast, a DIRECT send past both. The take's file is 16-bit stereo
 * 44.1 kHz, written as it renders; DONE once it is complete. */
#ifndef OFFLINE_TAKE_H
#define OFFLINE_TAKE_H

#include <stdint.h>
#include "plugin_api_v1.h"
#include "slot_clone.h"

/* The slot as the host sends to it, read at begin. */
typedef struct {
    float synth_level;      /* the PRE tap's level (shadow_apply_synth_level) */
    int   transpose;        /* semitones (shadow_chain_apply_transpose) */
    int   fwd_ch;           /* the channel voice messages are remapped to, -1 = as sent */
} offline_slot_info_t;

typedef struct {
    const host_api_v1_t *host;                 /* the live host API, the copies' starting point */
    void *(*slot_instance)(int slot);          /* the chain instance on a slot, NULL = none */
    chain_slot_clone_source_fn *clone_source;  /* the shim's resolved chain export */
    int  (*slot_info)(int slot, offline_slot_info_t *out);
    int  (*run_command)(const char *const argv[]);   /* mkdir / chown of the take */
    void (*log)(const char *msg);
} offline_take_host_t;

/* Configure and start the job thread (SCHED_OTHER, cores 0-2). Idempotent. */
void offline_take_start(const offline_take_host_t *host);
/* The overtake DSP whose copy plays the take: its dsp.so and module dir, ""
 * when none is loaded (a take is then refused, a running one cancelled). */
void offline_take_set_engine(const char *so_path, const char *module_dir);

int  offline_take_begin(const move_offline_take_t *take);
int  offline_take_state(uint32_t *done, uint32_t *total);
void offline_take_cancel(void);

/* Test seams: start's configuration without the thread, and running a QUEUED
 * take on the calling thread, now (1 if one ran). */
void offline_take_configure(const offline_take_host_t *host);
int  offline_take_run_pending(void);

#endif /* OFFLINE_TAKE_H */
