/* seq8_audio.h — AUDIO: the types. Audio is picked in Instmt/Dest, like the
 * Conductor (pad_mode PAD_MODE_AUDIO, melodic clip storage): the track's
 * clips play SLICES of their own sample instead of sending MIDI, mixed into
 * the track's own chain slot through the host's slot_audio_feed (so the
 * slot's FX, fader, sends and a Dry resample all apply). A note's pitch is a
 * slice: DRUM_BASE_NOTE + slice. Each clip holds its own sample, copied into
 * the project (<state dir>/samples/), and its own Mode:
 *   LOOP  — the clip plays the sample like a loop, restarting with the clip;
 *           the pads are jump points (Jump = 2..32 equal points); steps are
 *           ignored.
 *   SLICE — up to 32 slices, one sequence per clip (a step holds at most one
 *           slice), always monophonic (a new slice cuts the last). Velocity
 *           is ignored, except a DELAY echo's, which is its volume.
 * Engine: seq8_audio.c. Keys: setparam/sp_track_audio.c. Included in seq8.c's
 * single translation unit before the track struct. */
#ifndef SEQ8_AUDIO_H
#define SEQ8_AUDIO_H

#include <stdint.h>

#define AU_MAX_SLICES      32
#define AU_PATH_MAX        160          /* a sample's file name inside samples/ */
#define AU_PEAKS           128          /* waveform columns kept for the screen */
#define AU_SLICE_MAX_SEC   240          /* Slice mode: 4 minutes (Josh) */
#define AU_LOOP_MAX_SEC    600          /* Loop mode, until it streams: 10 minutes */

#define AU_MODE_LOOP       0
#define AU_MODE_SLICE      1
#define AU_METH_EVEN       0            /* N equal slices of Start..End */
#define AU_METH_MANUAL     1            /* starts set by hand */
#define AU_METH_LAZY       2            /* starts tapped in while it played */

#define AU_PLAY_ONE        0            /* to the slice's end */
#define AU_PLAY_GATE       1            /* for the step's gate */
#define AU_PLAY_LOOP       2            /* loops the slice for the gate */

/* A loaded sample: int16, its own channel count (1 or 2) and rate. Immutable
 * once published; freed only by the loader thread. */
typedef struct au_sample {
    int16_t  *pcm;          /* frames * ch */
    uint32_t  frames;
    uint32_t  rate;
    uint8_t   ch;
    int8_t    peaks[AU_PEAKS][2];   /* per column: min, max (int8 of the int16 range) */
    char      name[AU_PATH_MAX];    /* the file inside samples/ */
    uint32_t  refs;                 /* clips using it (loader thread only) */
} au_sample_t;

typedef struct {
    uint32_t start;         /* frame (Manual / Lazy); Even computes its own */
    int16_t  nudge_ms;      /* SLICE bank Start: -500..+500 ms */
    uint8_t  len_pct;       /* SLICE bank Len: 1..100 % of the slice */
    int8_t   pitch;         /* -24..+24 st */
    int8_t   gain_db;       /* -40..+12 dB */
    uint8_t  rev;
    uint8_t  play;          /* AU_PLAY_* */
    uint16_t attack_ms;     /* 0..2000 */
    uint16_t decay_ms;      /* 0 = full (no decay), else 1..5000 */
} au_slice_t;

typedef struct {
    char         name[AU_PATH_MAX];  /* "" = no sample */
    au_sample_t *smp;                /* published by the audio thread; NULL until loaded */
    uint32_t     gen;                /* bumped by each pick / load; a late result is dropped */
    uint8_t      state;              /* 0 none, 1 loading, 2 ready, 3 failed */
    uint8_t      err;                /* AU_ERR_* when failed */
    uint8_t      mode;               /* AU_MODE_* */
    uint8_t      method;             /* AU_METH_* */
    uint8_t      nslices;            /* 1..32 */
    uint8_t      jump;               /* Loop: 2/4/8/16/32 jump points */
    uint16_t     rstart, rend;       /* Start / End, in 1/1000 of the sample */
    int8_t       pitch;              /* -24..+24 st */
    int8_t       gain_db;            /* -40..+12 dB */
    uint8_t      revrs;              /* Loop: the sample plays backwards */
    int16_t      nudge_ms;           /* Loop: the sample's start against the bar, -500..+500 ms */
    uint8_t      jmpq;               /* Loop: a jump waits for the next 0 off / 1 1/16 / 2 1/8 / 3 1/4 */
    au_slice_t   sl[AU_MAX_SLICES];
} au_clip_t;

#define AU_ERR_NONE     0
#define AU_ERR_OPEN     1   /* could not read the file */
#define AU_ERR_FORMAT   2   /* not a WAV / AIFF we read */
#define AU_ERR_LONG     3   /* longer than the mode allows */
#define AU_ERR_MEM      4
#define AU_ERR_COPY     5   /* could not copy it into the project */

typedef struct {
    const au_sample_t *smp;
    double   pos;            /* frames into the sample */
    double   step;           /* frames per output frame (negative = reverse) */
    double   lo, hi;         /* the playable range */
    float    gain;
    uint32_t age;            /* output frames since it started */
    uint32_t atk, dec;       /* frames; dec 0 = none */
    uint32_t rel, rel_len;   /* release (choke / gate end): frames left of rel_len */
    uint32_t wait;           /* output frames of silence before it starts (Loop Nudge later) */
    uint8_t  active, loop, mode_loop, slice;
    uint8_t  gated;          /* GATE / LOOP: ends at note-off */
} au_voice_t;

#define AU_VOICES 2          /* the sounding one + the one being choked */

typedef struct {
    au_voice_t v[AU_VOICES];
    int32_t    last_tick;    /* Loop: the clip position last block (wrap = restart) */
    uint8_t    loop_clip;    /* Loop: the clip the loop voice belongs to */
    int8_t     pending_jump; /* Loop, JmpQ on: the jump point waiting for its boundary (-1 none) */
} au_track_t;

/* Loader mailbox (set_param / render -> loader thread). */
#define AU_REQ_PICK   1      /* copy `path` into samples/, then load it */
#define AU_REQ_LOAD   2      /* load samples/`path` (state load) */
#define AU_REQ_DROP   3      /* release a sample (smp) */

typedef struct {
    uint8_t      kind, track, clip, mode;
    uint32_t     gen;
    au_sample_t *smp;
    char         path[256];
    char         dir[256];   /* the project's samples/ directory */
} au_req_t;

typedef struct {
    uint8_t      track, clip, err;
    uint32_t     gen;
    au_sample_t *smp;
    char         name[AU_PATH_MAX];
} au_res_t;

#define AU_RING 512

/* Defined in seq8_audio.c, which is included after the code that calls them
 * (the state file code and the drum emit funnel). `inst` is the instance. */
#include <stdio.h>
static void au_save_state(void *inst, FILE *fp);
static void au_reset_all(void *inst);
static void au_load_state(void *inst, const char *buf);
static void au_note_event(int t, int slice, uint8_t status, uint8_t vel, int echo);

#endif
