#ifndef SEQ8_PARAM_AUTO_H
#define SEQ8_PARAM_AUTO_H

/* seq8_param_auto.h — per-parameter automation store: sizes and types.
 *
 * Split from seq8_param_auto.c because the instance struct embeds the pool,
 * so the types must be visible before it while the functions need the
 * instance type. Included by seq8.c; NOT a translation unit.
 *
 * The model, per docs/working/param-automation-spec.md: automation is one
 * thing you do to a parameter, and every parameter the editor shows can carry
 * it. There are no lanes and no 8-lane cap — an entry is created the moment a
 * parameter is automated, keyed by WHAT it addresses rather than by a knob
 * index.
 *
 * A target is an opaque string owned by JS: "<slot>:<comp>:<key>" for a chain
 * parameter, "bus:<n>:<field>" for a bus level, "cc:<n>" / "at" for the MIDI
 * Out device. The DSP interprets ONLY the cc:/at forms, which it can emit
 * itself; everything else it evaluates and stages for JS to push, because a
 * module DSP has no way to set another chain slot's parameters (the host API
 * gives it MIDI callbacks and nothing else — see plugin_api_v1.h).
 *
 * Storage is a fixed pool: entries and their points are resident, never
 * malloc'd. Writes arrive on the SPI thread via set_param, where allocation is
 * not safe, and playback reads them from the audio thread.
 *
 * Rest values: playback WRITES real parameters, and for a chain parameter that
 * write persists in the slot's own state. So an entry records the value the
 * parameter held when it was first automated, and that value is restored when
 * automation is deactivated, cleared, or the transport stops. Without it a
 * parameter would simply be stranded wherever the playhead left it.
 */

#define PA_MAX_ENTRIES     160   /* automated (track, clip, target) triples in a project */
#define PA_ENTRY_POINTS    512   /* points per entry: 16 bars at 1/32, or a dense recorded sweep */
#define PA_MAX_TARGETS      64   /* distinct parameters automated anywhere in the project */
#define PA_TARGET_LEN       64   /* "<slot>:<comp>:<key>" — longest real target seen is 37 (a JV-880 nvram key) */
#define PA_VAL_MAX       16383   /* values are 14-bit normalized; JS maps to/from wire units */
#define PA_VAL_UNSET     0xFFFF
#define PA_UNDO_ENTRIES     16   /* automated params per clip an undo slot can hold */
#define PA_RING_SLOTS      256   /* staged (target, value) changes awaiting the JS push; > 8 tracks x PA_TICK_MAX_STAGE x a few ticks */
#define PA_TICK_MAX_STAGE   16   /* changes one tick may stage — see pa_playback_scan */

#define PA_LIVE_MAX          8   /* targets one track can have under a hand at once */
#define PA_LIVE_RECORD       1   /* the knob is writing along the playhead */
#define PA_LIVE_OVERRIDE     2   /* the knob is overriding; automation resumes on release */

#define PA_FLAG_ACTIVE     0x01  /* cleared by Mute+knob: kept, but not played */
#define PA_FLAG_SMOOTH     0x02  /* linear interpolation instead of stepped hold */

typedef struct {
    uint16_t tick;               /* clip-relative tick; a 256-step clip at 24 tps fits u16 */
    uint16_t val;                /* 0..PA_VAL_MAX */
} pa_point_t;

/* One staged change: a parameter the DSP cannot write itself, and the value it
 * should now hold. Produced on the audio thread, consumed on the SPI thread. */
typedef struct {
    uint16_t target;
    uint16_t val;
} pa_change_t;

/* A target currently under a hand on one track. Written on the SPI thread
 * (pa_live / pa_live_end), read on the audio thread: the playback scan skips a
 * live target — touch wins — and, in RECORD mode, the latch writes `val` along
 * the playhead one cell at a time. last_snap is audio-thread owned. */
typedef struct {
    uint8_t  used;
    uint8_t  mode;               /* PA_LIVE_RECORD / PA_LIVE_OVERRIDE */
    uint16_t target;             /* interned target id */
    uint16_t val;                /* the live value, 0..PA_VAL_MAX */
    uint32_t last_snap;          /* last cell written (RECORD); 0xFFFFFFFF = none */
} pa_live_t;

typedef struct {
    uint8_t  used;
    uint8_t  track;
    uint8_t  clip;
    uint8_t  flags;
    uint16_t target;             /* index into pa_targets */
    uint16_t count;
    uint16_t rest;               /* value before automation existed; PA_VAL_UNSET = none captured */
    /* Independent loop window and resolution. Zero means "follow the clip",
     * which is the whole of v1 behaviour — nothing in the UI writes these yet.
     * They exist so that per-parameter polymetric automation, which the old
     * lane system could do, can be restored later as UI work rather than as a
     * storage change. */
    uint16_t loop_len;
    uint16_t loop_off;
    uint16_t resolution;
    /* Last value playback sent, so an unchanged parameter is not re-pushed
     * every tick — at ~2.9 ms a push, that is the difference between a
     * working feature and a stalled one. Audio-thread owned. */
    uint16_t last_sent;
    uint8_t  last_sent_valid;
    pa_point_t points[PA_ENTRY_POINTS];
} pa_entry_t;


#endif /* SEQ8_PARAM_AUTO_H */
