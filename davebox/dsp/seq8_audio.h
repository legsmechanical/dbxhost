/* seq8_audio.h — AUDIO: the types. Audio is picked in Instmt/Dest, like the
 * Conductor (pad_mode PAD_MODE_AUDIO, melodic clip storage): the track's
 * clips play SLICES of their own sample instead of sending MIDI, mixed into
 * the track's own chain slot through the host's slot_audio_feed (so the
 * slot's FX, fader, sends and a Dry resample all apply). A note's pitch is a
 * slice: AU_NOTE_BASE + slice, up to 128 of them (Josh, 2026-10-28: "might
 * as well do 128"; external MIDI still reaches chop 1 at note 36, in the UI). Each clip holds its own sample, copied into
 * the project (<state dir>/samples/), one set of slices (CHOPS) over its
 * Start..End, and a Mode that says how the sequencer plays them (Josh,
 * 2026-10-28: "loop vs slice mode should be a clip bank setting. it basically
 * tells the sequencer how to handle the slices"):
 *   LOOP  — the clip plays the sample straight through, restarting with the
 *           clip; set and forget: steps are ignored and the pads only show
 *           where it is.
 *   SLICE — the chops on the steps: one sequence per clip (a step holds at
 *           most one slice), always monophonic (a new slice cuts the last,
 *           unless it carries straight on from it: au_slice_on). Velocity is
 *           ignored.
 * Engine: seq8_audio.c. Keys: setparam/sp_track_audio.c. Included in seq8.c's
 * single translation unit before the track struct. */
#ifndef SEQ8_AUDIO_H
#define SEQ8_AUDIO_H

#include <stdint.h>

#define AU_MAX_SLICES      128
#define AU_NOTE_BASE       0            /* chop k is note k */
#define AU_PIN_FULL        32           /* chops past this many pin one chunk each end, not two (streaming memory) */
#define AU_PATH_MAX        160          /* a sample's file name inside samples/ */
#define AU_PEAKS           128          /* waveform columns kept for the screen */
#define AU_SLICE_MAX_SEC   240          /* Slice mode: 4 minutes (Josh) */
#define AU_LOOP_MAX_SEC    1800         /* Loop mode: 30 minutes (longer than Slice's, it streams) */

#define AU_MODE_LOOP       0
#define AU_MODE_SLICE      1

#define AU_TEMPO_FREE      0            /* Loop: the sample at its own speed, whatever the tempo */
#define AU_TEMPO_VINTAGE   1            /* Loop: cut every tick, each piece on its place in the sample's own Bars (au_sync_block) */
#define AU_TEMPO_FIT_OLD   2            /* retired (Fit): loads and sets as Vintage */
#define AU_TEMPO_PITCH     3            /* Loop: the sample retuned (varispeed) to fill the clip's length */
#define AU_TEMPO_FIX(v)    ((v) == AU_TEMPO_FIT_OLD ? AU_TEMPO_VINTAGE : (v))
#define AU_BARS_MAX        64           /* a sample's own length in bars, 1..64 */
#define AU_GAP             16           /* frames: the least a slice can be */
#define AU_TAIL            128          /* frames: the fade back from a chop's end (~3 ms) */
#define AU_SLICE_NONE      (-1)         /* au_range_on: Loop mode's hidden chop at Start */
#define AU_JOIN            256          /* frames: a slice this near where the sounding one has reached carries it on */
#define AU_MIP             256          /* frames per waveform summary entry */
#define AU_CHUNK_SHIFT     13
#define AU_CHUNK           (1u << AU_CHUNK_SHIFT)   /* frames: a streamed sample's piece (186 ms at 44.1 kHz) */

#define AU_LAZY_NONE       0
#define AU_LAZY_ARMED      1            /* pad 1 lit, nothing playing yet */
#define AU_LAZY_RUN        2            /* playing; each tap drops a marker */
#define AU_LAZY_ENDED      3            /* played out / Back: keep or restore? */

#define AU_PLAY_ONE        0            /* to the slice's end */
#define AU_PLAY_GATE       1            /* for the step's gate */
#define AU_PLAY_LOOP       2            /* loops the slice for the gate */

struct au_stream;

/* A loaded sample: int16, its own channel count (1 or 2) and rate. Immutable
 * once published (but a streamed one's chunks); freed only by the loader
 * thread.
 * STREAMED (a file longer than Slice mode allows, so only a Loop clip ever
 * plays it): pcm is NULL and the frames live in chunk[], one slot per
 * AU_CHUNK frames, each NULL or that piece. The streamer thread is the only
 * one that fills or empties a slot; readers on the audio thread load a slot
 * once and use it within the block (seq8_audio.c, STREAMING). */
typedef struct au_sample {
    int16_t  *pcm;          /* frames * ch; NULL = streamed */
    int16_t **chunk;        /* streamed: nchunks slots of AU_CHUNK * ch */
    uint32_t  nchunks;
    struct au_stream *st;   /* streamed: the streamer's own state */
    uint32_t  frames;
    uint32_t  rate;
    uint8_t   ch;
    int8_t    peaks[AU_PEAKS][2];   /* per column: min, max (int8 of the int16 range) */
    int8_t  (*mip)[2];              /* min, max per AU_MIP frames (the zoomed waveform) */
    uint32_t  nmip;
    char      name[AU_PATH_MAX];    /* the file inside samples/ */
    uint32_t  refs;                 /* clips using it (loader thread only) */
} au_sample_t;

/* A slice of the HAND SET (made by Lazy / Manual, shaped in the chop editor).
 * Its sound settings belong to the slice NUMBER: Even's slice k uses them too. */
typedef struct {
    uint32_t start;         /* frame */
    uint32_t end;           /* frame; 0 = HOME: the next slice's start (the clip's End for the last) */
    int8_t   pitch;         /* -24..+24 st */
    int8_t   gain_db;       /* -40..+12 dB */
    uint8_t  rev;
    uint8_t  play;          /* AU_PLAY_* */
    uint16_t attack_ms;     /* 0..2000 */
    uint16_t decay_ms;      /* 0 = full (no decay), else 1..5000 */
    int8_t   detune;        /* -50..+50 cents, on top of pitch */
} au_slice_t;

typedef struct {
    char         name[AU_PATH_MAX];  /* "" = no sample */
    au_sample_t *smp;                /* published by the audio thread; NULL until loaded */
    uint32_t     gen;                /* bumped by each pick / load; a late result is dropped */
    uint8_t      state;              /* 0 none, 1 loading, 2 ready, 3 failed */
    uint8_t      err;                /* AU_ERR_* when failed */
    uint8_t      mode;               /* AU_MODE_* */
    uint8_t      even;               /* 0 = Off (the hand set plays), else 2..32 equal slices of Start..End */
    uint8_t      nslices;            /* the hand set's slices, 1..32 */
    uint8_t      jump;               /* retired (jump points): read and written only so the file format stays */
    uint32_t     rstart, rend;       /* Start / End, sample frames; rend 0 = the sample's end */
    uint16_t     mig_rs, mig_re;     /* an older project's Start / End in 1/1000, applied when the sample loads (0/0 = none) */
    int8_t       pitch;              /* -24..+24 st */
    int8_t       detune;             /* -50..+50 cents, on top of pitch */
    int8_t       gain_db;            /* -40..+12 dB */
    uint8_t      revrs;              /* Loop: the sample plays backwards */
    int16_t      nudge_ms;           /* Loop: the sample's start against the bar, -500..+500 ms */
    uint8_t      jmpq;               /* retired (jump quantize): as `jump` */
    uint8_t      tempo;              /* Loop: AU_TEMPO_* (the CLIP bank's K1) */
    uint8_t      bars;               /* the sample's own length in bars, as recorded (the CLIP bank's K2); 0 = not known yet */
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
    uint32_t rel_wait;       /* output frames before that release begins (on its tick's frame) */
    uint32_t wait;           /* output frames of silence before it starts (Loop Nudge later; a slice's tick frame) */
    uint8_t  active, loop, mode_loop, slice;
    uint8_t  tail;           /* in the fade back from its end */
    uint8_t  gated;          /* GATE / LOOP: ends at note-off */
    uint8_t  starve;         /* streamed: 0..64, its level, down while a chunk is missing (64 at start) */
    uint32_t wlo, whi;       /* a Vintage piece: its clip's Start..End, which the streamer reads ahead
                              * through as for a Loop (whi 0: read ahead within lo..hi) */
} au_voice_t;

#define AU_VOICES 2          /* the sounding one + the one being choked */

/* What the streamer must have ready, published by the audio thread each
 * block: a voice's place in a streamed sample (slot AU_VOICES is spare: it
 * held a waiting JmpQ jump). smp NULL = nothing. Read by the streamer field
 * by field: a torn read only fetches the wrong chunk once. */
typedef struct {
    const void *smp;
    uint32_t    pos, lo, hi;
    int32_t     speed;       /* sample frames per output frame x 256, negative = reverse */
    uint8_t     loop;
} au_watch_t;

/* A clip holding a streamed sample, published the same way: its Start..End
 * as it plays (au_range) and, in Slice mode, its slices (au_slice_range;
 * a b 0 = none) — what the streamer keeps pinned. */
typedef struct {
    const void *smp;
    uint32_t    rs, re;
    uint8_t     mode, n;
    uint32_t    sa[AU_MAX_SLICES], sb[AU_MAX_SLICES];
} au_clipw_t;

typedef struct {
    au_voice_t v[AU_VOICES];
    int32_t    last_tick;    /* Loop: the clip position last block (wrap = restart) */
    uint8_t    loop_clip;    /* Loop: the clip the loop voice belongs to */
    uint8_t    sync_on;      /* Tempo Sync: its chops are playing */
    uint8_t    sync_live;    /* ...and the transport's first tick has played (a window before it means nothing) */
    uint8_t    vint_ok;      /* Vintage under a followed clock: vint_from is set */
    double     vint_from;    /* ...the clip tick the last block's window ended at */
    uint8_t    layout;       /* PAD MODE Layout: 0 4 Rows, 1 16 Pads (the UI's; saved as t%d_aul) */
    uint8_t    mgain;        /* mute as a bus: 0..64, the output's level, ramping one step a frame */
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
    uint8_t      bars;       /* the loader's guess at the sample's length in bars (au_guess_bars) */
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
