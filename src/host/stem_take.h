/* stem_take.h — several chain slots recorded at once, each to its own WAV
 * (move_host_ext_v1_t.stems_*): a sequencer's live take of more than one
 * track. Each stem is one slot's INSTRUMENT before its FX (what
 * MOVE_CAPTURE_SLOT_PRE takes), 16-bit stereo 44.1 kHz.
 *
 * Separate from the sampler (shadow_sampler.c), which records ONE file: a
 * stem take runs alongside a capture_start take or the user's own sampler.
 *
 * Threads, as the sampler's:
 *   RT (the SPI callback): start / limit / stop / state, and once per block
 *     stem_take_capture for each stem, then stem_take_block_end. Each stem has
 *     its own ring, allocated once at init, so a start never allocates.
 *   worker (shim_worker): prepare (mkdir, fopen, header, the writer thread)
 *     and finalize (join, header, close, chown — or unlink a voided take).
 *   writer: drains every stem's ring into its file.
 *
 * A take is a LOOP, as a module take is: a block dropped from a ring (the disk
 * fell more than RING_SECONDS behind) or a file that would not open voids the
 * WHOLE take — every file is removed, and stem_take_state reports it. */
#ifndef STEM_TAKE_H
#define STEM_TAKE_H

#include <stdint.h>

#define STEM_TAKE_MAX            8
#define STEM_TAKE_RING_SECONDS   2
#define STEM_TAKE_BLOCK_FRAMES   128

/* stem_take_state's answers */
#define STEM_TAKE_IDLE       0   /* none, or the last one is complete on disk */
#define STEM_TAKE_RECORDING  1
#define STEM_TAKE_WRITING    2   /* capture over; the worker is closing the files */
#define STEM_TAKE_FAILED    -1   /* idle; the last take was voided, its files removed */

typedef struct {
    void (*log)(const char *msg);
    /* argv-style command (mkdir -p, chown), as the sampler's host runs them */
    int  (*run_command)(const char *const argv[]);
    /* hand a worker event over: 0 = prepare, 1 = finalize */
    void (*post)(int finalize);
} stem_take_host_t;

/* Once, off the audio thread. 0 ok, -1 the rings could not be allocated
 * (every start is then refused). */
int  stem_take_init(const stem_take_host_t *host);

/* ---- RT ---- */

/* n stems (1..STEM_TAKE_MAX): stem i is slot slots[i], to paths[i] (absolute;
 * its directory is created). `frames` > 0 ends the take after exactly that
 * many frames; 0 runs until stem_take_limit or stem_take_stop. Capture begins
 * with the next stem_take_capture. 1 armed, 0 refused (one already running or
 * still being written, bad arguments, no rings). */
int  stem_take_start(int n, const int *slots, const char *const *paths, uint32_t frames);
/* End the take after `frames` frames in all (counted from its first). Already
 * past it: it ends now, at what it has. */
void stem_take_limit(uint32_t frames);
void stem_take_stop(void);
/* STEM_TAKE_*; `peaks` (may be NULL) gets each stem's largest sample so far,
 * up to `cap` of them — 0 is a stem that recorded silence. */
int  stem_take_state(uint16_t *peaks, int cap);

/* The slot stem i records, or -1 (no take capturing, or no such stem). */
int  stem_take_slot(int i);
/* One block (STEM_TAKE_BLOCK_FRAMES stereo frames) of stem i; NULL = silence. */
void stem_take_capture(int i, const int16_t *block);
/* After every stem's block: counts the block, ends a take that is complete or
 * has failed. */
void stem_take_block_end(void);

/* ---- worker ---- */
void stem_take_worker_prepare(void);
void stem_take_worker_finalize(void);

#endif /* STEM_TAKE_H */
