/* seq8_audio.h — AUDIO and SLICER: the types. Each is picked in Instmt/Dest
 * like the Conductor, and is its own kind of track (Josh, 2026-11-02: "two
 * instruments "audio" and "slicer""); both mix into the track's own chain
 * slot through the host's slot_audio_feed (so the slot's FX, fader, sends and
 * a Dry resample all apply).
 *   AUDIO  (PAD_MODE_AUDIO)  — each clip holds its own sample, copied into the
 *          project (<state dir>/samples/), and plays it locked to the clip's
 *          playhead: Sync Warp / Vintage / Pitch at the sample's own Tempo.
 *          Steps are ignored; the pads only show where it is.
 *   SLICER (PAD_MODE_SLICER) — ONE sample and its chops for the whole track
 *          (au_store[t][AU_SLC]); its clips are step sequences of chop numbers
 *          (a note's pitch is a chop: AU_NOTE_BASE + chop, up to 128). Always
 *          monophonic (a new chop cuts the last unless it carries straight on
 *          from it: au_range_on), velocity ignored. Chops are markers: Even,
 *          Transient, Lazy and Manual are tools that write them. Sync Off (own
 *          speed) or Pitch (varispeed to the project tempo).
 * Engine: seq8_audio.c. Keys: setparam/sp_track_audio.c. Included in seq8.c's
 * single translation unit before the track struct. */
#ifndef SEQ8_AUDIO_H
#define SEQ8_AUDIO_H

#include <stdint.h>

#define AU_MAX_SLICES      128
#define AU_SLC             NUM_CLIPS    /* au_store's extra column: a Slicer track's sample + chops */
#define AU_NOTE_BASE       0            /* chop k is note k */
#define AU_PIN_FULL        32           /* a streamed clip's first 32 chops pin two chunks each end, the rest
                                         * one: 128 chops x 2 x 2 chunks of a long file is too much memory
                                         * for the stock Move's 2 GB, and a chop's first chunk is what a
                                         * hit needs at once (the streamer fetches the rest ahead) */
#define AU_PATH_MAX        160          /* a sample's file name inside samples/ */
#define AU_PEAKS           128          /* waveform columns kept for the screen */
#define AU_SLICE_MAX_SEC   240          /* a Slicer's sample: 4 minutes (Josh) */
#define AU_LOOP_MAX_SEC    1800         /* an Audio clip's: 30 minutes (longer than a Slicer's, it streams) */

#define AU_MODE_LOOP       0
#define AU_MODE_SLICE      1

/* Sync: how a Loop clip keeps to the tempo. Every one follows the sample's own
 * Tempo (bpm10); there is no free-running loop (Josh, 2026-10-29: Free left,
 * Orig sets Tempo to the project's instead). Warp is the default. */
#define AU_SYNC_WARP       0            /* stretched to the tempo at its own pitch (Bungee, the stretcher thread) */
#define AU_SYNC_VINTAGE    1            /* cut every tick, each piece on its place at the sample's Tempo (au_sync_block) */
#define AU_SYNC_PITCH      2            /* the sample retuned (varispeed) to the tempo */
#define AU_SYNC_MAX        AU_SYNC_PITCH
/* A Slicer's Sync: its chops at their own speed, or retuned (varispeed) by
 * the project's tempo against the sample's own. 2 is kept for Snap (parked);
 * any value it does not know reads as Off. */
#define AU_SLC_SYNC_OFF    0
#define AU_SLC_SYNC_PITCH  1
#define AU_SLC_SYNC_WARP   3            /* stretched to the tempo at its own pitch: the whole sample
                                         * pre-stretched in the background (Josh, 2026-11-14:
                                         * "prestretch"), the slices played from that copy */
#define AU_SLC_WARP_MAX_SEC 60          /* Warp is offered for samples up to a minute (Josh, 2026-11-15) */
#define AU_BPM10_MIN       1            /* a sample's own Tempo, x10: 0.1 .. */
#define AU_BPM10_MAX       9999         /* .. 999.9 BPM (Josh, 2026-10-30: "999.9 max and .1 minimum" —
                                         * it was the project's 20..300, which refused Strch x2 on a loop
                                         * over 150 BPM; the Tempo says how many bars the audio spans) */
#define AU_SENS_DEFAULT    50           /* Transient chops: hit sensitivity, 0..100 */
#define AU_BARS_MAX        64           /* a sample's length in bars at its Tempo, for the guess: 1..64 */
#define AU_BAR_TICKS       (4 * 96)     /* a bar, ticks (4/4 at PPQN) */
#define AU_SPAN_MAX        (256 * AU_BAR_TICKS)   /* Bars: up to a clip's longest, 256 bars */
#define AU_GAP             16           /* frames: the least a slice can be */
#define AU_SPEED_MIN       10           /* Free's Speed, per mille: 1 % .. 400 % (Josh, 2026-11-13: "can we
                                         * make speed minimum lower?" — the stretcher takes any speed) */
#define AU_SPEED_MAX       4000
#define AU_TAIL            128          /* frames: the fade back from a chop's end (~3 ms) */
/* Vintage's pieces CROSSFADE: each fades in over this many output frames while
 * the one it cuts fades out (Josh, 2026-10-30, by ear on the device: "vintage
 * is super noisy in general" · "i feel like there are ways to mitigate it";
 * of a hard cut, every tick crossfaded, every 1/16 and every 1/8, he chose
 * every tick crossfaded, 128 frames). A hard cut 190 times a second at 120 BPM
 * was a buzz: on a 440 Hz tone at 3/4 speed the noise beat the tone by 5 dB;
 * crossfaded, the tone is 12 dB above it. A piece at the sample's own speed
 * still carries straight on (au_range_on), no fade. */
#define AU_VINTAGE_XF        128    /* frames */
#define AU_RMX_EV          160          /* REMIX events in one Loop bar (16 notes; ROLL adds runs) */
#define AU_RMX_BAR         384          /* REMIX: a bar of clip ticks, 16 x 1/16 at PPQN 96 */
#define AU_RMX_SN          1024         /* REMIX: a Slicer clip's remixed notes (ROLL adds repeats) */
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
#define AU_PLAY_THRU       2            /* THRU: from the slice's start on to the range's End (Josh,
                                         * 2026-11-14: "an option for slices to play THROUGH the
                                         * entire sample"); the next slice cuts it (mono) */
#define AU_PLAY_MAX        AU_PLAY_THRU
/* A Slicer step's Dir (clip_t.step_xrev): an override over the slice's Revrs */
#define AU_SDIR_SLICE      0            /* follow the slice */
#define AU_SDIR_FWD        1
#define AU_SDIR_REV        2
#define AU_NM_DIR_MASK     0x03         /* au_track_t.nm_rev: the step's Dir ... */
#define AU_NM_RMX          0x04         /* ... and REMIX's flip on top */

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
    uint32_t *hits;                 /* Transient chops: candidate hits, frames (each the start of a rising AU_MIP block), ascending */
    uint8_t  *hit_d;                /* per candidate: its rise (au_lvl steps) */
    uint8_t  *hit_r;                /* per candidate: its rise against the ~100 ms around it, x16 */
    uint32_t  nhits;                /* candidates; Sens picks which count (au_hit_kept) */
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
    uint8_t      even;               /* 0 = Off (the hand set plays), else 2..AU_MAX_SLICES equal slices of Start..End */
    uint8_t      nslices;            /* the hand set's slices, 1..AU_MAX_SLICES (128) */
    uint8_t      whole;              /* a Slicer not chopped yet: its one slice IS the range, Start..End,
                                      * and follows it (Josh, 2026-11-15: "just don't do any automatic
                                      * chops on sample load. 1 chop and it plays the whole sample from
                                      * start point to end point"); the first chop clears it */
    uint8_t      jump;               /* retired (jump points): neither saved nor read; kept for the struct's shape */
    uint32_t     rstart;             /* Start, sample frames */
    uint32_t     slen;               /* retired (a Slicer's Length in ticks): its End is `rend` now, a frame,
                                      * so the sample's Tempo never moves the range */
    uint32_t     rend;               /* End, sample frames (0 = none: the sample's end). Loop: the audio stops
                                      * there, silent till the clip comes round. Slicer: the range's End —
                                      * a hard edge for every slice */
    uint32_t     rspan;              /* Loop: Bars, in ticks — Start..End (or the file's end) lasts this
                                      * long and the Tempo follows; held when End or Start moves
                                      * (0 = none: the Tempo rules) */
    int8_t       pitch;              /* -24..+24 st */
    int8_t       detune;             /* -50..+50 cents, on top of pitch */
    int8_t       gain_db;            /* -40..+12 dB */
    uint8_t      dir;                /* Loop: Dir, as a MIDI clip's (AU_DIR_*): Fwd, Bwd (the sample backwards),
                                      * PPf / PPb (a pass each way in turn). Shot plays one pass: a ping-pong
                                      * plays its first direction (au_dir) */
    uint8_t      shot;               /* Audio: One-shot — the clip plays its length once per launch, then stops
                                      * (Josh, 2026-11-10: "it should be a clip bank setting") */
    uint8_t      freerun;            /* Audio: FREE — launched with the clip, then Start..End plays at the
                                      * sample's own speed x Speed, looping on itself: not fitted to the
                                      * tempo, not cut or restarted by the clip (Josh, 2026-11-13: "a mode
                                      * ... irrespective of the sequencer's timing"). Sync Pitch = Tape
                                      * (speed and pitch together), anything else = Warp (time alone). */
    uint16_t     speed_pm;           /* Free: Speed, per mille of the sample's own (AU_SPEED_*); 0 = 1000 */
    int16_t      nudge_ms;           /* Loop: the sample's start against the bar, -500..+500 ms */
    uint32_t     rot;                /* Loop: Offset — where in its audio the clip starts, ticks (taken mod
                                      * the clip's length where it plays); saved as `of` */
    uint8_t      jmpq;               /* retired (jump quantize): as `jump` */
    uint8_t      sync;               /* Loop: AU_SYNC_* */
    uint16_t     bpm10;              /* the sample's own Tempo x10 (AU_BPM10_*); 0 = not known yet (guessed when it loads) */
    uint8_t      sens;               /* Transient chops: hit sensitivity 0..100 (the chop editor's jog) */
    uint8_t      trans;              /* Transient: an override over the hand set, like Even; never saved */
    uint8_t      tr_n;               /* Transient's chops, 1..AU_MAX_SLICES (au_trans_calc) */
    uint32_t     tr_at[AU_MAX_SLICES]; /* their starts: Start, then each kept hit inside Start..End */
    uint8_t      tr_due;             /* tr_at needs working out again (au_trans_settle: once a block, not a detent) */
    /* the info read's Transient count, kept for the (sample, gen, Start, End,
     * Sens) it was counted for: counting walks every candidate (review) */
    const void  *hc_smp;
    uint32_t     hc_gen, hc_rs, hc_re, hc_n;
    int16_t      hc_sens;
    /* AUTOMATION's live values: what a playing lane holds Pitch, Detune,
     * Gain, Dir and Tempo at (pa_seq_apply), over the clip's own settings,
     * which stay as they were. Bit AU_OV_* set = that one is held. Never
     * saved; the clip's own setting takes over again when its lane gives the
     * value back, a hand sets it, or the clip stops being the playing one. */
    uint8_t      ov;
    int8_t       ov_pitch, ov_detune, ov_gain;
    uint8_t      ov_dir;
    uint16_t     ov_bpm10;
    /* ...and ALL SLICES' (Attack, Decay, Gain, Pitch, Detune, Rev, Play):
     * every chop of the clip plays at the lane's value over its own (AU_OVS_*) */
    uint8_t      ovs;
    int8_t       ovs_pitch, ovs_detune, ovs_gain;
    uint8_t      ovs_rev, ovs_play;
    uint16_t     ovs_atk, ovs_dec;
    au_slice_t   sl[AU_MAX_SLICES];
} au_clip_t;

#define AU_OV_PITCH     0x01
#define AU_OV_DETUNE    0x02
#define AU_OV_GAIN      0x04
#define AU_OV_DIR       0x08
#define AU_OV_BPM       0x10
#define AU_OVS_ATK      0x01
#define AU_OVS_DEC      0x02
#define AU_OVS_GAIN     0x04
#define AU_OVS_PITCH    0x08
#define AU_OVS_DETUNE   0x10
#define AU_OVS_REV      0x20
#define AU_OVS_PLAY     0x40

#define AU_ERR_NONE     0
#define AU_ERR_OPEN     1   /* could not read the file */
#define AU_ERR_FORMAT   2   /* not a WAV / AIFF we read */
#define AU_ERR_LONG     3   /* longer than the mode allows */
#define AU_ERR_MEM      4
#define AU_ERR_COPY     5   /* could not copy it into the project */
#define AU_ERR_SILENT   6   /* Normalize: the file is silent, nothing to raise */

typedef struct {
    const au_sample_t *smp;
    double   pos;            /* frames into the sample */
    double   step;           /* frames per output frame (negative = reverse) */
    double   lo, hi;         /* the playable range */
    float    gain;
    uint32_t age;            /* output frames since it started */
    uint32_t atk, dec;       /* frames; dec 0 = none */
    float    denv, dk;       /* Decay: the level it has fallen to, and its per-frame factor
                              * (exponential, a Move drum cell's: -83.87 dB at dec) */
    uint32_t rel, rel_len;   /* release (choke / gate end): frames left of rel_len */
    uint32_t rel_wait;       /* output frames before that release begins (on its tick's frame) */
    uint32_t wait;           /* output frames of silence before it starts (Loop Nudge later; a slice's tick frame) */
    uint8_t  active, loop, mode_loop, slice;
    uint8_t  pp;             /* a Free Tape loop ping-pongs: it turns at Start and End instead of wrapping */
    uint8_t  tail;           /* in the fade back from its end */
    int8_t   cond;           /* the Conductor's semitones its step holds (au_cond_now) */
    uint8_t  gated;          /* GATE / LOOP: ends at note-off */
    uint8_t  starve;         /* streamed: 0..64, its level, down while a chunk is missing (64 at start) */
    uint32_t wlo, whi;       /* a Vintage piece: its clip's Start..End, which the streamer reads ahead
                              * through as for a Loop (whi 0: read ahead within lo..hi) */
    /* following the clip's Pitch / Detune / Gain as they move (automation)
     * while it sounds: what it was started with — the clip's part, and the
     * chop's own on top (au_voice_follow) */
    uint8_t  clip;           /* the clip it plays */
    uint8_t  fpitch;         /* its pitch follows (not Tempo Pitch's, whose speed the tempo sets) */
    uint8_t  usl;            /* it plays its chop's sound (au_sl_eff), not a Loop's or a Vintage piece's */
    uint8_t  live;           /* a pad started it: heard at once, not through the lead's delay (au_render) */
    int8_t   ps;             /* semitones in its step: the clip's and its chop's */
    int16_t  pc;             /* cents in its step: the same */
    int8_t   gdb;            /* dB in v->gain: the same */
    float    vg;             /* its velocity's level */
} au_voice_t;

#define AU_VOICES 3          /* the sounding one, the one being choked, and room for a Vintage piece
                              * that waits into the block while the last cut still fades (with 2 it took
                              * that voice at the block's start and its fade's tail stepped: a click) */

/* What the streamer must have ready, published by the audio thread each
 * block: a voice's place in a streamed sample; slot AU_VOICES is where Warp's
 * stretcher reads (it once held a waiting JmpQ jump). smp NULL = nothing. Read by the streamer field
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

/* WARP, the audio thread's side of one track (the stretcher's is
 * au_warp_t in seq8_audio.c). */
typedef struct {
    uint32_t gen;            /* the anchor it waits for / plays (the stretcher's frames carry theirs) */
    uint8_t  on;             /* the track's command says run */
    uint8_t  state;          /* AU_WARP_WAIT: no frame lined up yet; AU_WARP_PLAY */
    uint8_t  gain;           /* 0..64, ramping a step a frame */
    uint8_t  clip;           /* the clip it was anchored for */
    uint8_t  live;           /* the transport has played: the clock window is real */
    uint8_t  fadeout;        /* 0..64: the old anchor's frames still playing, fading (a stop) */
    uint8_t  hold;           /* the old anchor's frames play on at their level till the new is due (a launch) */
    uint8_t  ogain, oclip;   /* ...their level and clip */
    uint8_t  xf;             /* frames of the hand-over crossfade left */
    uint32_t ntail;          /* the ring index the current anchor's frames are read from (ahead of
                              * the old ones still playing) */
    double   tick;           /* the clip tick at this block's frame 0 (a followed clock: smoothed) */
    double   cur_anchor;     /* the tick the current anchor starts at */
    double   drift;          /* output frames the frame heard is ahead of the clock */
    uint32_t waited;         /* output frames since the last anchor, while waiting (the diag: `warp`) */
    uint32_t last_wait;      /* ...the last anchor's whole wait, once it played */
} au_warp_trk_t;

typedef struct {
    au_voice_t v[AU_VOICES];
    au_warp_trk_t w;
    int32_t    last_tick;    /* Loop: the clip position last block (wrap = restart) */
    uint8_t    loop_clip;    /* Loop: the clip the loop voice belongs to */
    uint8_t    sync_on;      /* Tempo Vintage: its pieces are playing */
    uint8_t    sync_live;    /* ...and the transport's first tick has played (a window before it means nothing) */
    uint8_t    layout;       /* Slicer's PAD MODE Layout: 0 4 Rows, 1 16 Pads (the UI's; saved in t%d_slc) */
    uint8_t    cond_on;      /* Slicer, LOAD ONLY: 0 = a file from before RESPONDER governed it said
                              * "not following" (its own switch, gone) — seq8_load_state carries it
                              * into the Conductor's RESPONDER bank, then sets it back to 1 */
    uint8_t    mgain;        /* mute as a bus: 0..64, the output's level, ramping one step a frame */
    int8_t     cond;         /* Loop: the Conductor's semitones in force (Next: taken at the wrap) */
    uint8_t    free_on;      /* Free: the clip's run has started (its launch tick played) */
    double     free_ph;      /* Free Warp: where it is in Start..End, 0..1 (the stretcher's clock);
                              * a ping-pong's 0..1 is both passes, there and back */
    uint32_t   pass;         /* Loop: the passes of the clip since it started (a ping-pong's direction) */
    uint8_t    pass_clip;    /* ...the clip they count for */
    uint8_t    rnow;         /* Loop: it plays backwards now (the pass's direction; read by the UI) */
    double     free_left;    /* Free + Shot: how much of one pass of Start..End is still to play
                              * (1 at the launch); at 0 the clip stops */
    /* THE LEAD: what the sequencer plays here is heard LEAD_FRAMES later, with
     * the MIDI the lead holds (LEAD_BLOCKS); a pad's voice is not delayed */
    int32_t    dl[LEAD_FRAMES * 2];
    uint16_t   dl_pos;       /* dl: the next frame out (and in) */
    uint16_t   dl_tail;      /* frames of sound still in dl (0: nothing to play out) */
    /* REMIX (a Loop clip): the setting in force, latched at the bar line, and
     * one bar's events for it (every bar of a Loop clip remixes alike: its
     * phrase is a note on each 1/16). rmx_bar: the bar it was latched in. */
    uint8_t    rmx_on, rmx_type, rmx_var, rmx_clip, rmx_rvel;
    rmx_dials_t rmx_dl;      /* the dials in force (latched with the rest) */
    int32_t    rmx_bar;
    uint32_t   rmx_gen;      /* bumped each time rmx_e is rebuilt (Warp's stretcher copies it by this) */
    int16_t    rmx_n;
    rmx_ev_t   rmx_e[AU_RMX_EV];
    /* REMIX on a Slicer: the clip's notes remixed bar by bar (rebuilt at each
     * bar line, as the RS7000 rebuilds its phrase), played instead of the
     * clip's own */
    uint8_t    rmx_slive, rmx_sclip;   /* the notes: seq8_instance_t.rmx_sn */
    uint16_t   rmx_sn_n;
    /* A Slicer's next hit of each slice, as the sequencer plays it: the step's
     * own Dir / pitch (and a remix's on top), a ROLL repeat's level — set
     * just before the note goes out, taken by that hit (au_note_event). A pad
     * played by hand finds none and plays the slice as it is.
     * nm_rev packs the direction (AU_NM_*): bits 0-1 the step's Dir (0 Slice:
     * the slice's own Revrs, 1 forwards, 2 backwards — an override), bit 2
     * REMIX's Revrs, which flips whatever the Dir chose (Josh, 2026-11-15). */
    uint8_t    nm_on[AU_MAX_SLICES], nm_rev[AU_MAX_SLICES];
    int8_t     nm_semi[AU_MAX_SLICES];
    uint8_t    nm_start[AU_MAX_SLICES], nm_len[AU_MAX_SLICES];   /* % of the chop: from, how much (0 = all) */
    float      nm_vg[AU_MAX_SLICES];
    /* INPUT bank, this track's part (seq8_audio_rec.c): in_len an empty
     * clip's take: 0 Free, else 1 / 2 / 4 / 8 bars (AR_LEN_BARS[in_len]);
     * in_ovr a clip with a sample: 0 Layer, 1 Replace. Saved as t%d_ain.
     * (Monitor / Input / Gain are the instance's: ain_*.) mon_g: the
     * monitor's level ramp through this track (0..64). */
    uint8_t    in_len, in_ovr, mon_g;
} au_track_t;

/* Loader mailbox (set_param / render -> loader thread). */
#define AU_REQ_PICK   1      /* copy `path` into samples/, then load it */
#define AU_REQ_LOAD   2      /* load samples/`path` (state load) */
#define AU_REQ_DROP   3      /* release a sample (smp) */
#define AU_REQ_EDIT   4      /* Trim / Normalize samples/`path` into a 16-bit WAV, then load it */

#define AU_EDIT_TRIM  0      /* keep frames a..b: what the clip plays */
#define AU_EDIT_NORM  1      /* the whole file, its peak raised to full scale */

typedef struct {
    uint8_t      kind, track, clip, mode;
    uint32_t     gen;
    au_sample_t *smp;
    char         path[256];
    char         dir[256];   /* the project's samples/ directory */
    uint8_t      op, ow;     /* AU_REQ_EDIT: AU_EDIT_*; 1 = overwrite the file, 0 = a new sample */
    uint32_t     a, b;       /* AU_REQ_EDIT, Trim: the frames kept */
    uint8_t      rechop;     /* a Slicer's Trim: a..b is its range; its slices are kept (au_slc_trim_slices) */
    uint8_t      keep;       /* AU_REQ_PICK: the clip keeps its length (a recorded take, seq8_audio_rec.c) */
    uint16_t     bpm10;      /* AU_REQ_PICK: the sample's Tempo x10 as known (a take: the project's), 0 = guess it */
} au_req_t;

typedef struct {
    uint8_t      track, clip, err;
    uint16_t     bpm10;      /* the loader's guess at the sample's own Tempo x10 (au_guess_bpm10) */
    uint32_t     gen;
    au_sample_t *smp;
    char         name[AU_PATH_MAX];
    uint8_t      edit, ow;   /* an AU_REQ_EDIT's answer: the clip keeps its settings; ow = the file was overwritten */
    uint8_t      rechop;     /* ...a Slicer's Trim: its slices are kept, moved with the audio (au_slc_trim_slices) */
    uint32_t     ka, kb;     /* ...the frames the Trim kept (a..b of the old file) */
    uint32_t     cut;        /* ...frames the edit took off the front (Trim): every position moves back by it */
    uint8_t      keep;       /* the pick's keep: the clip's length stays as it is */
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
