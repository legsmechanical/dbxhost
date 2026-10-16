/* midi_fx_offline.h — offline MIDI FX jobs (move_host_ext_v1_t.midi_fx_offline_*).
 *
 * One job at a time. begin / poll / cancel are called by the overtake DSP from
 * its set_param or render_block (the SPI thread): they copy and flip atomics,
 * nothing else. The job runs on its own thread (midi_fx_offline_start), which
 * makes and loads a private COPY of each module's code (so the copy's globals
 * are its own, never the live instance's), applies the live settings, renders
 * (midi_fx_offline_render.h) and destroys the copy's instance. Module code is
 * cached per (path, mtime, size) for the session, under SCHWUNG_INSTALL_DIR
 * "/cache/midifx-clone/" (never /tmp on the Move). */
#ifndef MIDI_FX_OFFLINE_H
#define MIDI_FX_OFFLINE_H

#include <stdint.h>
#include "plugin_api_v1.h"
#include "midi_fx_clone.h"

/* The chain slot's instance for a job: the shim's table, looked up by slot
 * at begin (NULL = no chain there). Set once at start. */
typedef void *(*mfo_slot_instance_fn)(int slot);

/* Start the job thread (SCHED_OTHER, cores 0-2). `host` is the host API the
 * live MIDI FX get; the copies get a copy of it whose clock answers the
 * virtual transport and whose sends go nowhere. Idempotent. */
void midi_fx_offline_start(const host_api_v1_t *host, mfo_slot_instance_fn slot_instance,
                           chain_midi_fx_clone_source_fn *clone_source);

int  midi_fx_offline_begin(int slot, float bpm, uint32_t length_ticks, uint32_t tail_ticks,
                           const move_midi_fx_offline_ev_t *in, int in_count);
int  midi_fx_offline_poll(move_midi_fx_offline_ev_t *out, int cap, int *out_count, int take);
void midi_fx_offline_cancel(void);

/* Test seams: what start does without its thread, and running a QUEUED job
 * on the calling thread, now (1 if one ran). */
void midi_fx_offline_configure(const host_api_v1_t *host, mfo_slot_instance_fn slot_instance,
                               chain_midi_fx_clone_source_fn *clone_source);
int  midi_fx_offline_run_pending(void);

#endif /* MIDI_FX_OFFLINE_H */
