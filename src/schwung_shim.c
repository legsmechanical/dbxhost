#define _GNU_SOURCE

#ifndef ENABLE_SCREEN_READER
#define ENABLE_SCREEN_READER 1
#endif

#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <dlfcn.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <dirent.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <signal.h>
#include <ucontext.h>
#include <execinfo.h>
#include <time.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <sys/xattr.h>
#include <math.h>
#include <linux/spi/spidev.h>
#include <pthread.h>
#include <sched.h>
#include <semaphore.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <net/if.h>
#if ENABLE_SCREEN_READER
#include <dbus/dbus.h>
#include <systemd/sd-bus.h>
#endif

#include "host/plugin_api_v1.h"
#include "host/audio_fx_api_v2.h"
#include "host/shadow_constants.h"
#include "host/shadow_ui_midi_policy.h"
#include "host/timespec_delta.h"
#include "host/shadow_midi_inject_writer.h"
#include "host/shadow_test_stream.h"
#include "host/shadow_chain_types.h"
#include "host/unified_log.h"
#include "host/sa_master_volume.h"
#include "host/spawn_command.h"
#include "host/schwung_trace.h"
#include "host/tts_engine.h"
#include "host/link_audio.h"
#include "host/shadow_sampler.h"
#include "host/shadow_transport.h"
#include "host/shadow_set_pages.h"
#include "host/shim_worker.h"
#include "host/shadow_dbus.h"
#include "host/shadow_chain_mgmt.h"
#include "host/shadow_link_audio.h"
#include "host/shadow_process.h"
#include "host/shadow_resample.h"
#include "host/shadow_overlay.h"
#include "host/shadow_pin_scanner.h"
#include "host/shadow_led_queue.h"
#include "host/shadow_state.h"
#include "host/shadow_midi.h"
#include "host/fx_midi_filter.h"
#include "host/shadow_shm_util.h"

/* Debug flags - set to 1 to enable various debug logging */
#define SHADOW_TIMING_LOG 0      /* ioctl/DSP timing logs to /tmp */

/* SPI protocol types, constants, and helpers from schwung-spi (MIT).
 * https://github.com/charlesvestal/schwung-spi */
#include "lib/schwung_spi_lib.h"
#include "lib/schwung_jack_bridge.h"

/* SPI library handle — provides shadow buffer, hardware buffer, and ioctl hooks */
static SchwungSpi *g_spi_handle = NULL;

/* JACK shadow driver shared memory (NULL until init, no-op if JACK never connects) */
static SchwungJackShm *g_jack_shm = NULL;

unsigned char *global_mmap_addr = NULL;  /* Points to library shadow buffer (what Move sees) */
unsigned char *hardware_mmap_addr = NULL; /* Points to real hardware mailbox */
static int shadow_spi_fd = -1;           /* SPI file descriptor for MIDI/ioctl */
int (*real_ioctl)(int, unsigned long, ...) = NULL;  /* Libc ioctl for non-hook calls */

/* Mailbox layout aliases — map old names to schwung-spi constants */
#define MAILBOX_SIZE      SCHWUNG_PAGE_SIZE
#define MIDI_OUT_OFFSET   SCHWUNG_OFF_OUT_MIDI
#define AUDIO_OUT_OFFSET  SCHWUNG_OFF_OUT_AUDIO
#define DISPLAY_OFFSET    768  /* schwung-spi doesn't define this (it's between audio regions) */
#define MIDI_IN_OFFSET    SCHWUNG_OFF_IN_MIDI
#define AUDIO_IN_OFFSET   SCHWUNG_OFF_IN_AUDIO

#define AUDIO_BUFFER_SIZE 512      /* 128 frames * 2 channels * 2 bytes */
/* Buffer sizes from shadow_constants.h: MIDI_BUFFER_SIZE, DISPLAY_BUFFER_SIZE,
   CONTROL_BUFFER_SIZE, SHADOW_UI_BUFFER_SIZE, SHADOW_PARAM_BUFFER_SIZE */
/* FRAMES_PER_BLOCK is now defined in shadow_constants.h */

/* Move host shortcut CCs (mirror schwung_host.c) */
#define CC_SHIFT 49
#define CC_JOG_CLICK 3
#define CC_JOG_WHEEL 14
#define CC_BACK 51
#define CC_MASTER_KNOB 79
#define CC_UP 55
#define CC_DOWN 54
#define CC_MENU 50
#define CC_CAPTURE 52
#define CC_UNDO 56
#define CC_LOOP 58
#define CC_COPY 60
#define CC_LEFT 62
#define CC_RIGHT 63
#define CC_KNOB1 71
#define CC_KNOB2 72
#define CC_KNOB3 73
#define CC_KNOB4 74
#define CC_KNOB5 75
#define CC_KNOB6 76
#define CC_KNOB7 77
#define CC_KNOB8 78
#define CC_PLAY 85
#define CC_REC 86
#define CC_SAMPLE 87
#define CC_MUTE 88
#define CC_MIC_IN_DETECT 114
#define CC_LINE_OUT_DETECT 115
#define CC_RECORD 118
#define CC_DELETE 119
#define CC_STEP_UI_FIRST 16
#define CC_STEP_UI_LAST 31

/* Shadow structs from shadow_constants.h: shadow_control_t, shadow_ui_state_t, shadow_param_t */
static shadow_control_t *shadow_control = NULL;
static uint8_t shadow_display_mode = 0;

static shadow_ui_state_t *shadow_ui_state = NULL;

static shadow_param_t *shadow_param = NULL;
static web_param_set_ring_t *web_param_set_shm = NULL;       /* Web UI → shim param set ring */
static web_param_notify_ring_t *web_param_notify_shm = NULL;  /* Shim → web UI param change ring */
static web_write_dirty_t *web_write_dirty_shm = NULL;         /* Shim → shadow_ui autosave dirty hints */
static shadow_screenreader_t *shadow_screenreader_shm = NULL;  /* Forward declaration for D-Bus handler */
static shadow_overlay_state_t *shadow_overlay_shm = NULL;     /* Overlay state for JS rendering */

/* Recording dot: use wall clock for consistent flash rate regardless of call frequency */
static inline int rec_dot_visible(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    /* 500ms on, 500ms off */
    return (ts.tv_nsec < 500000000L);
}

/* Display mode save/restore for overlay forcing */
/* display_overlay in shadow_control_t replaces the old display_mode forcing */

/* shadow_overlay_sync — now in shadow_overlay.c (via shadow_overlay.h) */
static volatile float shadow_master_volume;  /* Defined later */

/* Feature flags from config/features.json */
static bool shadow_ui_enabled = true;      /* Shadow UI enabled by default */
static bool display_mirror_enabled = false; /* Display mirror off by default */
static bool ext_midi_remap_feature_enabled = true; /* Cable-2 channel remap on by default */
static bool midi_indicator_enabled_setting = false; /* Off by default; persisted in features.json */
static int skipback_seconds_setting = SKIPBACK_DEFAULT_SECONDS; /* Skipback rolling buffer length */
/* (skipback_require_volume and shadow_ui_trigger settings RETIRED 2026-08-09:
 * skipback is fixed on Shift+Vol+Capture and the jump-gesture families whose
 * trigger mode the setting selected are deleted.) */

/* Skipback resize hook — runs on the shim worker (off the audio path). */
static void shim_hook_skipback_resize(void) {
    skipback_resize(skipback_seconds_setting);
}
static int shadow_speaker_active = 1;      /* 1=built-in speaker, 0=headphones/line-out (from CC 115) */
static int shadow_speaker_active_known = 0; /* 1 once any CC 115 jack-detect has been observed */
static int shadow_line_in_connected = 0;       /* 1 = cable plugged, 0 = internal mic active (from CC 114) */
static int shadow_line_in_connected_known = 0; /* 1 once any CC 114 jack-detect has been observed */
/* Long-press Track/Menu/Step2 shortcuts — always enabled */

/* ----- RBJ biquad (direct form I transposed) for speaker-EQ compensation -----
 * Approximates the MoveSpeakerEnhancer response derived from on-device white-noise
 * and log-sweep measurements (2026-04-18). Applied only on the rebuild_from_la
 * DAC output path so captures/headphones stay neutral. Coefficients are computed
 * once at startup — no per-frame allocations. */
typedef struct {
    float b0, b1, b2, a1, a2;    /* normalized biquad coefficients */
    float z1, z2;                /* state (per channel) */
} biquad_t;

#define SPEAKER_EQ_NUM_STAGES 4      /* SpeakerEq 4-biquad cascade */
#define BANDPASS_NUM_STAGES 4        /* Processed-band 4-biquad cascade */
#define SPEAKER_EQ_NUM_CHANNELS 2
static biquad_t speaker_eq_coefs[SPEAKER_EQ_NUM_STAGES];
static biquad_t speaker_eq_state[SPEAKER_EQ_NUM_STAGES][SPEAKER_EQ_NUM_CHANNELS];
static biquad_t bandpass_coefs[BANDPASS_NUM_STAGES];
static biquad_t bandpass_state[BANDPASS_NUM_STAGES][SPEAKER_EQ_NUM_CHANNELS];
static biquad_t subsonic_hp_coefs;   /* HP @ ~95 Hz, Q=1.5 — matches Move's observed sub-bass cut */
static biquad_t subsonic_hp_state[SPEAKER_EQ_NUM_CHANNELS];
static biquad_t crossover_hp_coefs;  /* unused — reserved */
static biquad_t crossover_hp_state[SPEAKER_EQ_NUM_CHANNELS];
static int speaker_eq_initialized = 0;

/* Jack-state robustness for the speaker EQ (2026-06-02).
 * The EQ must NEVER color headphone/line-out output. shadow_speaker_active by
 * itself is untrustworthy at boot and at song/set load: XMOS can broadcast a
 * transient or uncorrected CC 115 val=0 ("speaker") while headphones are
 * actually plugged, latching the EQ onto the headphone DAC path (the
 * hollow/distorted bug) until a physical replug sends a corrective val=127.
 *
 * Fix: bias hard toward EQ-OFF (per user: "less bass on speakers" is far
 * better than "hollow audio on headphones"). Only trust a speaker reading
 * (CC 115 val=0) if we have already seen a jack-inserted reading (val=127)
 * earlier this session — i.e. a genuine headphones→speaker transition while
 * running. A bare boot/song-load val=0 (no prior val=127) is NOT trusted, so
 * the EQ stays off. This needs no timers and has no timing hole: it does not
 * matter WHEN the stray val=0 arrives.
 *
 * Trade-off: a device that only ever uses the built-in speaker (never inserts
 * a jack) runs without the enhancer EQ until a jack is plugged+unplugged once
 * — no longer a practical concern now that the boot jack re-assert restores
 * the true state automatically. The EQ is always jack-auto (no user toggle). */
/* Auto-mode stability: engage the EQ only when the jack has read speaker
 * (CC 115 val=0) continuously for SPK_EQ_STABLE_SEC. A val=127 (jack inserted)
 * flips us out of speaker instantly. This rejects transients and contact
 * bounce (e.g. the 127→0→127 we observed on replug) and a transient boot
 * val=0 that's quickly corrected, while still restoring the EQ for a genuine
 * built-in-speaker session. A truly stuck wrong val=0 would still engage after
 * the window — that case is what mode "off" is for. */
#define SPK_EQ_STABLE_SEC 3.0
static struct timespec spk_eq_speaker_since;  /* when speaker state last became true */
static int spk_eq_speaker_stable(void) {
    if (!(shadow_speaker_active && shadow_speaker_active_known)) return 0;
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    double el = (double)(now.tv_sec - spk_eq_speaker_since.tv_sec)
              + (double)(now.tv_nsec - spk_eq_speaker_since.tv_nsec) / 1e9;
    return el >= SPK_EQ_STABLE_SEC;
}

static inline float waveshaper_poly(float x)
{
    /* y = c1*x + c2*x^2 + c3*x^3 + c4*x^4 + c5*x^5 using Horner's method. */
    return x * (2.4f + x * (-1.2f + x * (-5.6f + x * (1.2f + x * 4.48f))));
}

static void biquad_hp(biquad_t *f, float fs, float fc, float q)
{
    float w0 = 2.0f * (float)M_PI * fc / fs;
    float cw = cosf(w0), sw = sinf(w0);
    float alpha = sw / (2.0f * q);
    float b0 = (1.0f + cw) * 0.5f;
    float b1 = -(1.0f + cw);
    float b2 = (1.0f + cw) * 0.5f;
    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cw;
    float a2 = 1.0f - alpha;
    f->b0 = b0 / a0; f->b1 = b1 / a0; f->b2 = b2 / a0;
    f->a1 = a1 / a0; f->a2 = a2 / a0;
}

static inline void biquad_assign(biquad_t *f, float b0, float b1, float b2, float a1, float a2)
{
    f->b0 = b0; f->b1 = b1; f->b2 = b2; f->a1 = a1; f->a2 = a2;
}

static void speaker_eq_build(float fs)
{
    /* Coefficients copied verbatim from live MoveOriginal DSP state memory
     * (2026-04-18). SpeakerEq = Set 1 (4 biquads at 0x5592ef8060+0x0c onwards),
     * Bandpass = Set 2 (4 biquads at 0x5592ef80e0 onwards). The cascades
     * produce the measured speaker-voicing curve (-7 dB @ 50, +3.6 dB @ 200,
     * -4.6 dB @ 800, +3 dB @ 16k) and a steep bandpass at 131-200 Hz for the
     * harmonic exciter path.
     *
     * Signal flow per sample:
     *   1. hb = crossover_hp(x)           high band (> 203 Hz)
     *   2. bp = bandpass_cascade(x)       131-200 Hz extracted
     *   3. wsbp = waveshaper(bp/norm)*norm  harmonic exciter
     *   4. mix = hb + 1.365 × wsbp
     *   5. out = speaker_eq_cascade(mix)  final speaker tuning */
    (void)fs;

    /* SpeakerEq cascade (from 0x5592ef8060+0x0c) — format (b0,b1,b2,a1,a2) */
    biquad_assign(&speaker_eq_coefs[0], 0.992062628f, -1.98412526f,  0.992062628f, -1.98406231f, 0.984188318f);
    biquad_assign(&speaker_eq_coefs[1], 1.01622748f,  -1.9452281f,   0.92980653f,  -1.9452281f,  0.946034133f);
    biquad_assign(&speaker_eq_coefs[2], 0.962782085f, -1.83911681f,  0.888346255f, -1.83911681f, 0.851128399f);
    biquad_assign(&speaker_eq_coefs[3], 1.33173597f,  -1.80474436f,  0.611439228f, -1.25587428f, 0.394305021f);

    /* Bandpass cascade (from 0x5592ef80e0) — first 2 LP, then 2 HP (131-200 Hz) */
    biquad_assign(&bandpass_coefs[0], 0.000200790499f, 0.000401580997f, 0.000200790499f, -1.97762573f,  0.9784289f);
    biquad_assign(&bandpass_coefs[1], 0.000197773843f, 0.000395547686f, 0.000197773843f, -1.94791412f,  0.948705196f);
    biquad_assign(&bandpass_coefs[2], 0.992822111f,   -1.98564422f,    0.992822111f,    -1.98547125f,  0.985817075f);
    biquad_assign(&bandpass_coefs[3], 0.982964098f,   -1.9659282f,     0.982964098f,    -1.96575701f,  0.966099381f);

    /* Upstream subsonic HP (Move's master bus processing, not in MoveSpeakerEnhancer itself
     * but in the Move→DAC chain we're matching). Numerically fit to digital resample of
     * pink noise through Move's native path: fc=135 Hz, Q=1.5 matches observed curve with
     * 1.5 dB RMS error across 40 Hz–8 kHz. */
    biquad_hp(&subsonic_hp_coefs, 44100.0f, 135.0f, 1.5f);
    biquad_hp(&crossover_hp_coefs, 44100.0f, 203.0f, 0.707f); /* unused but kept for future */

    memset(speaker_eq_state, 0, sizeof(speaker_eq_state));
    memset(bandpass_state, 0, sizeof(bandpass_state));
    memset(subsonic_hp_state, 0, sizeof(subsonic_hp_state));
    memset(crossover_hp_state, 0, sizeof(crossover_hp_state));
    speaker_eq_initialized = 1;
}

/* Process one sample through a single biquad (transposed direct form II). */
static inline float biquad_step(biquad_t *c, biquad_t *st, float x)
{
    float y = c->b0 * x + st->z1;
    st->z1 = c->b1 * x - c->a1 * y + st->z2;
    st->z2 = c->b2 * x - c->a2 * y;
    return y;
}

/* MoveSpeakerEnhancer emulation using exact biquad coefficients + exact polynomial
 * waveshaper extracted from live DSP state. SpeakerEq cascade already contains
 * a HP component (Biquad 1 ≈ HP @ 85 Hz) that handles the LowBandVolume=0
 * sub-bass cut — no separate crossover HP needed. */
static void speaker_eq_process(int16_t *audio, int frames)
{
    const float proc_band_volume = 1.365f;
    const float inv_norm = 1.0f / 32768.0f;
    const float norm = 32768.0f;
    for (int i = 0; i < frames; i++) {
        for (int ch = 0; ch < SPEAKER_EQ_NUM_CHANNELS; ch++) {
            float x = (float)audio[i * 2 + ch];

            /* Bandpass cascade (131-200 Hz via 4-biquad cascade from DSP state) */
            float bp = x;
            for (int s = 0; s < BANDPASS_NUM_STAGES; s++) {
                bp = biquad_step(&bandpass_coefs[s], &bandpass_state[s][ch], bp);
            }
            /* Waveshape in normalized [-1, 1] range, generates 4th/5th harmonics */
            float bpn = bp * inv_norm;
            if (bpn > 1.0f) bpn = 1.0f;
            if (bpn < -1.0f) bpn = -1.0f;
            float wsbp = waveshaper_poly(bpn) * norm;

            /* Apply upstream subsonic HP to main signal (Move's master-bus filter;
             * not part of MoveSpeakerEnhancer itself but sits in the actual
             * Move→DAC path we're matching). */
            float x_sub = biquad_step(&subsonic_hp_coefs, &subsonic_hp_state[ch], x);

            /* Mix original signal + processed band (× ProcessedBandVolume) */
            float mix = x_sub + proc_band_volume * wsbp;

            /* Apply SpeakerEq cascade (4 biquads from DSP state) */
            float out = mix;
            for (int s = 0; s < SPEAKER_EQ_NUM_STAGES; s++) {
                out = biquad_step(&speaker_eq_coefs[s], &speaker_eq_state[s][ch], out);
            }

            if (out > 32767.0f) out = 32767.0f;
            if (out < -32768.0f) out = -32768.0f;
            audio[i * 2 + ch] = (int16_t)lroundf(out);
        }
    }
}

/* Link Audio state, process management — moved to shadow_link_audio.c, shadow_process.c */

/* Link Audio publisher shared memory (shim → link_subscriber) */
static link_audio_pub_shm_t *shadow_pub_audio_shm = NULL;

/* Read-only consumer of Move audio written by link-subscriber sidecar.
 * Sidecar may not have started yet — retry from non-RT context if missing. */
static link_audio_in_shm_t *shadow_in_audio_shm = NULL;
static int try_attach_in_audio_shm(void);
static void *link_in_attach_retry_thread(void *arg);

/* Read one Move channel of audio from /schwung-link-in (written by the
 * link-subscriber sidecar). Returns 1 on full read, 0 on starvation /
 * inactive slot / SHM not yet attached. */
static inline int shim_read_move_channel(int s, int16_t *out, int frames)
{
    return link_audio_read_channel_shm(shadow_in_audio_shm, s, out, frames);
}

/* Return the number of active Move channels from the sidecar SHM. */
static inline int shim_move_channel_count(void)
{
    if (!shadow_in_audio_shm) return 0;
    int count = 0;
    for (int i = 0; i < LINK_AUDIO_IN_SLOT_COUNT; ++i) {
        if (shadow_in_audio_shm->slots[i].active) ++count;
    }
    return count;
}

/* PFX per-track audio shared memory (shim → PFX DSP plugin) */

static void load_feature_config(void);


/* ============================================================================
 * IN-PROCESS SHADOW CHAIN (MULTI-PATCH)
 * ============================================================================
 * Load the chain DSP inside the shim and render in the ioctl audio cadence.
 * This avoids IPC timing drift and provides a stable audio mix proof-of-concept.
 * ============================================================================ */

/* Path constants now in shadow_set_pages.h:
 * SHADOW_CHAIN_CONFIG_PATH, SLOT_STATE_DIR, SET_STATE_DIR, ACTIVE_SET_PATH */
/* SHADOW_CHAIN_INSTANCES from shadow_constants.h */

/* System volume - for now just a placeholder, we'll find the real source */
static float shadow_master_gain = 1.0f;

/* Forward declaration */
static uint64_t now_mono_ms(void);


/* Overtake DSP state - loaded when an overtake module has a dsp.so */
static void *overtake_dsp_handle = NULL;           /* dlopen handle */
static plugin_api_v2_t *overtake_dsp_gen = NULL;   /* V2 generator plugin */
static void *overtake_dsp_gen_inst = NULL;          /* Generator instance */
static audio_fx_api_v2_t *overtake_dsp_fx = NULL;  /* V2 FX plugin */
static void *overtake_dsp_fx_inst = NULL;           /* FX instance */
static host_api_v1_t overtake_host_api;             /* Host API provided to plugin */

/* Remote-UI push probe state (see shadow_overtake_rui_probe). Reset on every
 * overtake DSP load/unload so a new tool re-probes rui_poll support. */
static uint8_t  overtake_rui_unsupported = 0;   /* module answered <0 once */
static char     overtake_rui_last[64] = {0};    /* last digest pushed */
static unsigned long overtake_rui_last_rev = 0; /* rev field of last push */
static int      overtake_rui_last_on = -1;      /* on field of last push (-1 = none) */
static uint8_t  overtake_rui_have_rev = 0;
static uint32_t overtake_rui_frame = 0;         /* SPI frame divider */
static uint32_t overtake_rui_ph_count = 0;      /* playhead-only change divider */

static void shadow_overtake_rui_reset(void) {
    overtake_rui_unsupported = 0;
    overtake_rui_last[0] = '\0';
    overtake_rui_last_rev = 0;
    overtake_rui_last_on = -1;
    overtake_rui_have_rev = 0;
    overtake_rui_ph_count = 0;
}

/* Per-CC passthrough bitmap. When an overtake module declares
 * capabilities.button_passthrough = [cc, ...], those CCs are routed through
 * overtake_mode=2's filter unchanged — both the press events reach Move
 * firmware and Move's own LED writes reach hardware. Indexed by CC number. */
static uint8_t overtake_passthrough_ccs[128] = {0};

/* Forward declarations for overtake DSP */
static void shadow_overtake_dsp_load(const char *path);
static void shadow_overtake_dsp_unload(void);

/* Startup mod wheel reset countdown - resets mod wheel after Move finishes its startup MIDI burst */
#define STARTUP_MODWHEEL_RESET_FRAMES 20  /* ~0.6 seconds at 128 frames/block */
static int shadow_startup_modwheel_countdown = 0;

/* Deferred DSP rendering buffer - rendered post-ioctl, mixed pre-ioctl next frame.
 * Used for overtake DSP and as fallback when chain_process_fx is unavailable. */
static int16_t shadow_deferred_dsp_buffer[FRAMES_PER_BLOCK * 2];
static int shadow_deferred_dsp_valid = 0;

/* Per-slot raw synth output from render_to_buffer (no FX applied).
 * FX is processed in mix_from_buffer using same-frame Link Audio data. */
static int16_t shadow_slot_deferred[SHADOW_CHAIN_INSTANCES][FRAMES_PER_BLOCK * 2];
static int shadow_slot_deferred_valid[SHADOW_CHAIN_INSTANCES];

/* Deferred FX output: FX runs in post-ioctl, result mixed in pre-ioctl */
static int16_t shadow_slot_fx_deferred[SHADOW_CHAIN_INSTANCES][FRAMES_PER_BLOCK * 2];
static int shadow_slot_fx_deferred_valid[SHADOW_CHAIN_INSTANCES];

/* Apply a slot's sound-generator level to its dry synth block, in place.
 *
 * This is the module level (`slot:synth_volume`), NOT the slot's bus fader
 * (`slot:volume`). It scales the generator alone and must run BEFORE the
 * slot's FX and before anything else is summed into the slot: post-FX the
 * generator and any audio routed alongside it are one signal, so a fader there
 * cannot balance the two against each other.
 *
 * Every path that renders a slot has to call this, or the level silently does
 * nothing on that path while still reading back correctly in the UI. Unity is
 * the default and is skipped outright, so a slot nobody has touched costs one
 * float compare per block. */
static inline void shadow_apply_synth_level(int slot, int16_t *buf) {
    const float lvl = shadow_chain_slots[slot].synth_volume;
    if (lvl == 1.0f) return;
    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
        int32_t v = (int32_t)lroundf((float)buf[i] * lvl);
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        buf[i] = (int16_t)v;
    }
}

/* ---- Preview player: lightweight WAV playback for file browser ---- */
#define PREVIEW_CMD_PATH SCHWUNG_INSTALL_DIR "/preview_cmd_path.txt"
#define PREVIEW_WAV_FORMAT_PCM   1
#define PREVIEW_WAV_FORMAT_FLOAT 3
static int preview_fd = -1;
static void *preview_map = NULL;
static size_t preview_map_size = 0;
static void *preview_data = NULL;
static uint32_t preview_total_frames = 0;
static uint32_t preview_pos = 0;
static int preview_channels = 0;
static int preview_format = 0;  /* PCM or FLOAT */
static int preview_bits = 0;
static int preview_playing = 0;
static float preview_gain = 0.5f;

static void preview_close(void) {
    if (preview_map && preview_map != MAP_FAILED) munmap(preview_map, preview_map_size);
    if (preview_fd >= 0) close(preview_fd);
    preview_fd = -1;
    preview_map = NULL;
    preview_map_size = 0;
    preview_data = NULL;
    preview_total_frames = 0;
    preview_pos = 0;
    preview_channels = 0;
    preview_format = 0;
    preview_bits = 0;
    preview_playing = 0;
}

static void preview_stop(void) {
    preview_playing = 0;
    preview_pos = 0;
}

static void preview_play(const char *path) {
    preview_close();

    preview_fd = open(path, O_RDONLY);
    if (preview_fd < 0) return;

    struct stat st;
    if (fstat(preview_fd, &st) < 0 || st.st_size < 44) { preview_close(); return; }

    preview_map_size = (size_t)st.st_size;
    preview_map = mmap(NULL, preview_map_size, PROT_READ, MAP_PRIVATE, preview_fd, 0);
    if (preview_map == MAP_FAILED) { preview_map = NULL; preview_close(); return; }

    const uint8_t *raw = (const uint8_t *)preview_map;
    if (memcmp(raw, "RIFF", 4) != 0 || memcmp(raw + 8, "WAVE", 4) != 0) {
        preview_close(); return;
    }

    uint32_t offset = 12;
    uint16_t audio_fmt = 0, nch = 0, bps = 0;
    uint32_t data_off = 0, data_sz = 0;
    int found_fmt = 0, found_data = 0;

    while (offset + 8 <= preview_map_size) {
        const uint8_t *c = raw + offset;
        uint32_t csz = c[4] | (c[5]<<8) | (c[6]<<16) | (c[7]<<24);
        if (memcmp(c, "fmt ", 4) == 0 && csz >= 16) {
            audio_fmt = c[8] | (c[9]<<8);
            nch       = c[10] | (c[11]<<8);
            bps       = c[22] | (c[23]<<8);
            found_fmt = 1;
        } else if (memcmp(c, "data", 4) == 0) {
            data_off = offset + 8;
            data_sz  = csz;
            found_data = 1;
            break;
        }
        offset += 8 + csz;
        if (csz & 1) offset++;
    }

    if (!found_fmt || !found_data) { preview_close(); return; }

    int bytes_per_sample = 0;
    if (audio_fmt == PREVIEW_WAV_FORMAT_PCM && bps == 16) bytes_per_sample = 2;
    else if (audio_fmt == PREVIEW_WAV_FORMAT_PCM && bps == 24) bytes_per_sample = 3;
    else if (audio_fmt == PREVIEW_WAV_FORMAT_FLOAT && bps == 32) bytes_per_sample = 4;
    else { preview_close(); return; }

    if (nch < 1 || nch > 2) { preview_close(); return; }
    if (data_off + data_sz > preview_map_size) data_sz = (uint32_t)(preview_map_size - data_off);

    preview_format = audio_fmt;
    preview_bits = bps;
    preview_channels = nch;
    preview_data = (void *)(raw + data_off);
    preview_total_frames = data_sz / (nch * bytes_per_sample);
    preview_pos = 0;
    preview_playing = 1;
    LOG_DEBUG("preview", "loaded %u frames, %d ch, fmt=%u/%u-bit", preview_total_frames, nch, audio_fmt, bps);
}

/* Worker hook: load + start the preview off the RT thread. preview_play
 * munmaps any previous file, so stop rendering first and give the RT path
 * one settle interval — preview_render checks preview_playing at block
 * start and a block lasts ~2.9 ms, so 10 ms guarantees no render is still
 * touching the old mapping when it goes away. */
static void shim_hook_preview_play(void) {
    preview_playing = 0;
    __sync_synchronize();
    usleep(10 * 1000);

    char path_buf[256] = "";
    FILE *pf = fopen(PREVIEW_CMD_PATH, "r");
    if (pf) {
        if (fgets(path_buf, sizeof(path_buf), pf)) {
            char *nl = strchr(path_buf, '\n');
            if (nl) *nl = '\0';
        }
        fclose(pf);
    }
    if (path_buf[0]) preview_play(path_buf);
}

static void preview_render(int16_t *buf, int frames) {
    if (!preview_playing || !preview_data || preview_total_frames == 0) return;
    const float gain = preview_gain;
    const int nch = preview_channels;
    const int is_float = (preview_format == PREVIEW_WAV_FORMAT_FLOAT);
    const int is_24bit = (preview_format == PREVIEW_WAV_FORMAT_PCM && preview_bits == 24);

    for (int i = 0; i < frames; i++) {
        if (preview_pos >= preview_total_frames) {
            preview_playing = 0;
            return;
        }
        float fL, fR;
        if (is_float) {
            const float *fd = (const float *)preview_data;
            if (nch == 1) { fL = fR = fd[preview_pos]; }
            else { fL = fd[preview_pos * 2]; fR = fd[preview_pos * 2 + 1]; }
        } else if (is_24bit) {
            const uint8_t *d = (const uint8_t *)preview_data;
            int off = preview_pos * nch * 3;
            int32_t sL = (int32_t)((d[off]<<8) | (d[off+1]<<16) | (d[off+2]<<24)) >> 8;
            fL = sL / 8388608.0f;
            if (nch == 1) { fR = fL; }
            else { int32_t sR = (int32_t)((d[off+3]<<8) | (d[off+4]<<16) | (d[off+5]<<24)) >> 8; fR = sR / 8388608.0f; }
        } else {
            const int16_t *sd = (const int16_t *)preview_data;
            if (nch == 1) { fL = fR = sd[preview_pos] / 32768.0f; }
            else { fL = sd[preview_pos * 2] / 32768.0f; fR = sd[preview_pos * 2 + 1] / 32768.0f; }
        }
        int32_t sL = (int32_t)(fL * gain * 32767.0f);
        int32_t sR = (int32_t)(fR * gain * 32767.0f);
        /* Mix into existing buffer */
        int32_t mL = buf[i * 2]     + sL;
        int32_t mR = buf[i * 2 + 1] + sR;
        if (mL > 32767) mL = 32767; if (mL < -32768) mL = -32768;
        if (mR > 32767) mR = 32767; if (mR < -32768) mR = -32768;
        buf[i * 2]     = (int16_t)mL;
        buf[i * 2 + 1] = (int16_t)mR;
        preview_pos++;
    }
}

/* Per-slot idle detection: skip render_block when output has been silent.
 * Wakes on MIDI dispatch with one-frame latency (2.9ms, inaudible). */
#define DSP_IDLE_THRESHOLD 344       /* ~1 second of silence before sleeping */
#define DSP_SILENCE_LEVEL 4          /* abs(sample) below this = silence */
static int shadow_slot_silence_frames[SHADOW_CHAIN_INSTANCES];
static int shadow_slot_idle[SHADOW_CHAIN_INSTANCES];
/* Phase 2: track FX output silence to skip FX processing too.
 * FX keeps running while reverb/delay tails decay (synth idle, FX active).
 * Once FX output is also silent, skip FX entirely. */
static int shadow_slot_fx_silence_frames[SHADOW_CHAIN_INSTANCES];
static int shadow_slot_fx_idle[SHADOW_CHAIN_INSTANCES];

/* Move FX bus idle detection. The buses run UNCONDITIONALLY now (Move>Slot is
 * retired) and they run PRE-ioctl, in the tighter window — so a loaded but
 * silent bus was paying its full insert-chain cost on every block, up to
 * MOVE_FX_SLOTS × MOVE_FX_BLOCKS instances of nothing.
 *
 * ⚠ Unlike a chain slot, a Move bus's input is AUDIO, not MIDI. A slot can nap
 * and be woken by a MIDI dispatch; a bus has no such event, so it must test its
 * input every block. A periodic probe would swallow up to the probe window
 * (~0.5 s) of a Move track starting to play — far worse than the cost saved. */
static int shadow_move_fx_silence_frames[MOVE_FX_SLOTS];
static int shadow_move_fx_idle[MOVE_FX_SLOTS];






/* ==========================================================================
 * D-Bus Volume Sync - Monitor Move's track volume via accessibility D-Bus
 * ========================================================================== */

/* Forward declarations */

/* Track button hold state for volume sync: -1 = none held, 0-3 = track 1-4 */
static volatile int shadow_held_track = -1;

/* Selected slot for Shift+Knob routing: 0-3, persists even when shadow UI is off */
static volatile int shadow_selected_slot = 0;

/* Mute button hold state: 1 while CC 88 is held, 0 when released */
static volatile int shadow_mute_held = 0;

/* Set detection globals now in shadow_set_pages.c (extern via shadow_set_pages.h):
 * sampler_set_tempo, sampler_current_set_name, sampler_current_set_uuid,
 * sampler_last_song_index, sampler_pending_song_index, sampler_pending_set_seq */
/* shadow_handle_set_loaded, shadow_poll_current_set now in shadow_set_pages.c */
/* shadow_read_set_mute_states — now in shadow_overlay.c (via shadow_overlay.h) */
static int shim_run_command(const char *const argv[]);  /* forward decl */
static float shim_get_bpm(void);  /* forward decl */

/* shadow_apply_mute, shadow_toggle_solo now in shadow_chain_mgmt.c */


/* D-Bus globals, shadow_parse_volume_db, priority announcement state,
 * in_set_overview — all moved to shadow_dbus.c (extern via shadow_dbus.h) */

/* Native Move sampler source tracking (from stock D-Bus announcements) */
/* Native sampler/resample types and globals — moved to shadow_resample.c */

static int shadow_read_global_volume_from_settings(float *linear_out, float *db_out);

/* Native resample bridge types and functions — moved to shadow_resample.c */

/* D-Bus inject_pending, handle_text, native_knob state, connect/send hooks —
 * all moved to shadow_dbus.c. Thin hook stubs remain here. */

/* Hook connect() to capture Move's D-Bus socket FD */
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen)
{
    static int (*real_connect)(int, const struct sockaddr *, socklen_t) = NULL;
    if (!real_connect) {
        real_connect = (int (*)(int, const struct sockaddr *, socklen_t))dlsym(RTLD_NEXT, "connect");
    }

    int result = real_connect(sockfd, addr, addrlen);

    if (result == 0 && addr && addr->sa_family == AF_UNIX) {
        struct sockaddr_un *un_addr = (struct sockaddr_un *)addr;
        dbus_on_connect(sockfd, un_addr->sun_path);
    }

    return result;
}

/* Hook send() to intercept Move's D-Bus messages and inject ours */
ssize_t send(int sockfd, const void *buf, size_t len, int flags)
{
    static ssize_t (*real_send)(int, const void *, size_t, int) = NULL;
    if (!real_send) {
        real_send = (ssize_t (*)(int, const void *, size_t, int))dlsym(RTLD_NEXT, "send");
    }

    ssize_t result;
    if (dbus_on_send(sockfd, buf, len, flags, real_send, &result))
        return result;

    return real_send(sockfd, buf, len, flags);
}



/* sd_bus hooks, send_screenreader_announcement, D-Bus filter/thread/start/stop —
 * all moved to shadow_dbus.c. Thin hook stubs remain here. */

#if ENABLE_SCREEN_READER
/* Hook sd_bus_default_system to capture Move's sd-bus connection */
int sd_bus_default_system(sd_bus **ret)
{
    static int (*real_default)(sd_bus**) = NULL;
    if (!real_default) {
        real_default = (int (*)(sd_bus**))dlsym(RTLD_NEXT, "sd_bus_default_system");
    }

    int result = real_default(ret);

    if (result >= 0 && ret && *ret) {
        dbus_on_sd_bus_default(*ret);
    }

    return result;
}

/* Hook sd_bus_start to capture Move's sd-bus connection */
int sd_bus_start(sd_bus *bus)
{
    static int (*real_start)(sd_bus*) = NULL;
    if (!real_start) {
        real_start = (int (*)(sd_bus*))dlsym(RTLD_NEXT, "sd_bus_start");
    }

    int result = real_start(bus);

    if (result >= 0 && bus) {
        dbus_on_sd_bus_start(bus);
    }

    return result;
}
#endif /* ENABLE_SCREEN_READER */


/* Update track button hold state from MIDI (called from ioctl hook) */
static void shadow_update_held_track(uint8_t cc, int pressed)
{
    /* Track buttons are CCs 40-43, but in reverse order:
     * CC 43 = Track 1 → slot 0
     * CC 42 = Track 2 → slot 1
     * CC 41 = Track 3 → slot 2
     * CC 40 = Track 4 → slot 3 */
    if (cc >= 40 && cc <= 43) {
        int slot = 43 - cc;  /* Reverse: CC43→0, CC42→1, CC41→2, CC40→3 */
        int old_held = shadow_held_track;
        if (pressed) {
            shadow_held_track = slot;
        } else if (shadow_held_track == slot) {
            shadow_held_track = -1;
        }
        /* Log state changes */
        if (shadow_held_track != old_held) {
            char msg[64];
            snprintf(msg, sizeof(msg), "Track button: CC%d (track %d) %s -> held_track=%d",
                     cc, 4 - (cc - 40), pressed ? "pressed" : "released", shadow_held_track);
            shadow_log(msg);
        }
    }
}

/* Shadow-UI shortcut gating.
 *
 * The Shift+Vol / long-press jump-gesture families (slot settings, Master FX,
 * Global Settings, Tools) were DELETED 2026-08-09: every destination is owned
 * by (or spec'd as a service opened from) the primary module's own UI, so a
 * second gesture door was pure conflict surface. What remains hardware-side:
 *   Shift+Step13        -> Tools menu (the one host menu with no module home)
 *   Shift+Step13 HELD   -> resume the most-recently-suspended tool (restored
 *                          2026-08-09 evening per Josh — the one long-press
 *                          that survives)
 *   Shift+Vol+Capture   -> Skipback (bare Shift+Capture belongs to the module)
 *   Shift+Sample        -> Quantized Sampler
 *   Shift+Vol+Back      -> suspend overtake;  Shift+Vol+JogClick -> exit
 *   Shift+Menu          -> screen reader toggle (double press; single = no-op)
 * The old shadow_ui_trigger mode setting died with the gesture families. */
#define LONG_PRESS_MS 500

static struct timespec step13_press_time;
static uint8_t step13_longpress_pending;
static uint8_t step13_longpress_fired;

static inline int long_press_elapsed(const struct timespec *start) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    int ms = (int)((now.tv_sec - start->tv_sec) * 1000 +
                    (now.tv_nsec - start->tv_nsec) / 1000000);
    return ms >= LONG_PRESS_MS;
}

/* ==========================================================================
 * Master Volume Sync - Read from display buffer when volume overlay shown
 * ========================================================================== */

/* Master volume for all shadow audio output (0.0 - 1.0) */
static volatile float shadow_master_volume = 1.0f;
/* Is volume knob currently being touched? (note 8) */
static volatile int shadow_volume_knob_touched = 0;
/* Count of currently-held pads (notes 68-99).  When > 0, volume knob adjusts
 * pad gain, not master volume, so display-based volume detection is skipped. */
static volatile int shadow_pads_held = 0;
/* Is jog encoder currently being touched? (note 9) */
static volatile int shadow_jog_touched = 0;
/* Is shift button currently held? (CC 49) - global for cross-function access */
static volatile int shadow_shift_held = 0;

/* Boot set-select gate: 1 = the CURRENT arming came from the launcher's
 * marker at shim init (Move itself boots into its picker — no entry gestures
 * needed). 0 = armed mid-session via shadow_select_arm(), where the gate must
 * open Move's native Set Overview itself (inject Shift+Step1) and back out of
 * it (inject Back) around the selection. Cleared with the phase. */
static void shim_select_blank_move_leds(void);   /* defined with the gate below */
/* Boot-tool LED blank: 1 from shim init until the boot tool takes overtake.
 * A latch, not a live condition — it must not re-arm when that tool later
 * exits to the menu, where Move's LEDs are legitimately the user's surface.
 * Bounded by a deadline: if the boot tool never arrives (missing module, a
 * throwing init, a stale boot_tool.json), holding the blank forever would
 * leave a dark, dead-looking surface with no way back. Expiring hands the
 * LEDs to Move, which is the honest fallback — the session is stock-ish at
 * that point anyway. */
#define BOOT_LED_BLANK_MAX_MS 20000
static int boot_tool_led_blank = 0;
static uint64_t boot_tool_led_blank_deadline_ms = 0;
/* Suppress plain volume-touch hide until touch is fully released after
 * Shift+Vol shortcut launches, avoiding a brief native volume flash. */
static volatile int shadow_block_plain_volume_hide_until_release = 0;

/* ==========================================================================
 * Shift+Knob Overlay - Show parameter overlay on Move's display
 * ========================================================================== */

/* Shift+Knob overlay state and constants — moved to shadow_overlay.c */

/* ==========================================================================
 * Set tracking - now in shadow_set_pages.c/.h
 * ========================================================================== */
/* in_set_overview now in shadow_dbus.c (extern via shadow_dbus.h) */

/* shadow_ensure_dir, shadow_copy_file, shadow_batch_migrate_sets,
 * shadow_save_config_to_dir, shadow_load_config_from_dir,
 * shadow_handle_set_loaded,
 * shadow_poll_current_set — all moved to shadow_set_pages.c */

/* shadow_copy_file — moved to shadow_set_pages.c */
/* shadow_save_config_to_dir — moved to shadow_set_pages.c */
/* shadow_load_config_from_dir — moved to shadow_set_pages.c */
/* shadow_handle_set_loaded — moved to shadow_set_pages.c */
/* shadow_poll_current_set — moved to shadow_set_pages.c */


/* Execute a command. posix_spawnp, NOT fork + execvp: this runs on Move
 * threads, and a child forked out of a multithreaded process can block forever
 * in execvp PATH lookup on a malloc lock another thread held at fork time. It
 * then never execs, so it keeps Move name and argv — the orphaned
 * "Audio Main/SPI" process seen on 2026-08-23. See host/spawn_command.h.
 * Still drops SCHED_FIFO and still merges stderr into stdout; both moved into
 * the shared unit, which the JS host uses too. */
static int shim_run_command(const char *const argv[]) {
    return spawn_command(argv);
}

/* Overlay font, drawing, overlay_sync — moved to shadow_overlay.c */

/* Load feature configuration from config/features.json */
static void load_feature_config(void)
{
    const char *config_path = SCHWUNG_INSTALL_DIR "/config/features.json";
    FILE *f = fopen(config_path, "r");
    if (!f) {
        /* No config file - use defaults (all enabled) */
        shadow_ui_enabled = true;
        shadow_log("Features: No config file, using defaults (all enabled)");
        return;
    }

    /* Read the whole file — a fixed small buffer silently truncated configs
     * with many keys, reverting anything past the cut to its default.
     * Init-time only, so malloc is fine here. */
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (fsize <= 0 || fsize > 65536) {
        fclose(f);
        shadow_ui_enabled = true;
        shadow_log("Features: features.json empty or implausibly large, using defaults");
        return;
    }
    char *config_buf = malloc((size_t)fsize + 1);
    if (!config_buf) {
        fclose(f);
        shadow_ui_enabled = true;
        shadow_log("Features: out of memory reading features.json, using defaults");
        return;
    }
    size_t len = fread(config_buf, 1, (size_t)fsize, f);
    fclose(f);
    config_buf[len] = '\0';

    /* Parse shadow_ui_enabled */
    const char *shadow_ui_key = strstr(config_buf, "\"shadow_ui_enabled\"");
    if (shadow_ui_key) {
        const char *colon = strchr(shadow_ui_key, ':');
        if (colon) {
            /* Skip whitespace */
            colon++;
            while (*colon == ' ' || *colon == '\t') colon++;
            if (strncmp(colon, "false", 5) == 0) {
                shadow_ui_enabled = false;
            } else {
                shadow_ui_enabled = true;
            }
        }
    }

    /* Parse link_audio_enabled (defaults to false) */
    const char *link_audio_key = strstr(config_buf, "\"link_audio_enabled\"");
    if (link_audio_key) {
        const char *colon = strchr(link_audio_key, ':');
        if (colon) {
            colon++;
            while (*colon == ' ' || *colon == '\t') colon++;
            if (strncmp(colon, "true", 4) == 0) {
                link_audio.enabled = 1;
            }
        }
    }


    /* Parse display_mirror_enabled (defaults to false) */
    const char *display_mirror_key = strstr(config_buf, "\"display_mirror_enabled\"");
    if (display_mirror_key) {
        const char *colon = strchr(display_mirror_key, ':');
        if (colon) {
            colon++;
            while (*colon == ' ' || *colon == '\t') colon++;
            if (strncmp(colon, "true", 4) == 0) {
                display_mirror_enabled = true;
            }
        }
    }

    /* Parse ext_midi_remap_enabled (defaults to true) */
    const char *ext_midi_remap_key = strstr(config_buf, "\"ext_midi_remap_enabled\"");
    if (ext_midi_remap_key) {
        const char *colon = strchr(ext_midi_remap_key, ':');
        if (colon) {
            colon++;
            while (*colon == ' ' || *colon == '\t') colon++;
            if (strncmp(colon, "false", 5) == 0) {
                ext_midi_remap_feature_enabled = false;
            }
        }
    }

    /* Parse midi_indicator_enabled (defaults to false) */
    const char *midi_ind_key = strstr(config_buf, "\"midi_indicator_enabled\"");
    if (midi_ind_key) {
        const char *colon = strchr(midi_ind_key, ':');
        if (colon) {
            colon++;
            while (*colon == ' ' || *colon == '\t') colon++;
            if (strncmp(colon, "true", 4) == 0) {
                midi_indicator_enabled_setting = true;
            }
        }
    }

    /* Parse skipback_seconds (defaults to SKIPBACK_DEFAULT_SECONDS, clamped) */
    const char *skipback_secs_key = strstr(config_buf, "\"skipback_seconds\"");
    if (skipback_secs_key) {
        const char *colon = strchr(skipback_secs_key, ':');
        if (colon) {
            colon++;
            while (*colon == ' ' || *colon == '\t') colon++;
            int parsed = atoi(colon);
            if (parsed > 0) {
                if (parsed > SKIPBACK_MAX_SECONDS) parsed = SKIPBACK_MAX_SECONDS;
                skipback_seconds_setting = parsed;
            }
        }
    }

    char log_msg[256];
    snprintf(log_msg, sizeof(log_msg),
             "Features: shadow_ui=%s, link_audio=%s, display_mirror=%s, skipback_buf=%ds",
             shadow_ui_enabled ? "enabled" : "disabled",
             link_audio.enabled ? "enabled" : "disabled",
             display_mirror_enabled ? "enabled" : "disabled",
             skipback_seconds_setting);
    shadow_log(log_msg);
    free(config_buf);
}

static int shadow_read_global_volume_from_settings(float *linear_out, float *db_out)
{
    FILE *f = fopen("/data/UserData/settings/Settings.json", "r");
    if (!f) return 0;

    /* Read file */
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    if (size <= 0 || size > 8192) {
        fclose(f);
        return 0;
    }

    char *json = malloc(size + 1);
    if (!json) {
        fclose(f);
        return 0;
    }

    size_t nread = fread(json, 1, size, f);
    json[nread] = '\0';
    fclose(f);

    /* Find "globalVolume": X.X */
    const char *key = "\"globalVolume\":";
    char *pos = strstr(json, key);
    if (!pos) {
        free(json);
        return 0;
    }

    pos += strlen(key);
    while (*pos == ' ') pos++;

    float db = strtof(pos, NULL);
    float linear = (db <= -60.0f) ? 0.0f : powf(10.0f, db / 20.0f);
    if (linear < 0.0f) linear = 0.0f;
    if (linear > 1.0f) linear = 1.0f;

    if (linear_out) *linear_out = linear;
    if (db_out) *db_out = db;

    free(json);
    return 1;
}

/* Read initial volume from Move's Settings.json */
static void shadow_read_initial_volume(void)
{
    float linear = 1.0f;
    float db = 0.0f;
    char msg[80];

    sa_master_volume_open();

    /* The session's own value wins when it has one (sa_master_volume.h has the
     * why: Settings.json keeps the value the session STARTED with, which the
     * dB->linear map turns into silence). Only a device that has never run a
     * session falls through to Settings.json — the right seed for exactly that
     * first launch, and the only time we read it. */
    if (sa_master_volume_load(&linear)) {
        shadow_master_volume = linear;
        snprintf(msg, sizeof(msg), "Master volume: session value %.3f linear", (double)linear);
        shadow_log(msg);
        return;
    }

    if (!shadow_read_global_volume_from_settings(&linear, &db)) {
        shadow_log("Master volume: Settings.json not found, defaulting to 1.0");
        return;
    }

    shadow_master_volume = linear;

    snprintf(msg, sizeof(msg), "Master volume: read %.1f dB -> %.3f linear", db, shadow_master_volume);
    shadow_log(msg);
}

/* ==========================================================================
 * Shadow State Persistence - Save/load slot volumes to shadow_chain_config.json
 * ========================================================================== */







static void shadow_inprocess_process_midi(void) {
    if (!shadow_inprocess_ready || !global_mmap_addr) return;

    /* Delayed mod wheel reset - fires after Move's startup MIDI burst settles.
     * This ensures any stale mod wheel values from Move's track state are cleared. */
    if (shadow_startup_modwheel_countdown > 0) {
        shadow_startup_modwheel_countdown--;
        if (shadow_startup_modwheel_countdown == 0) {
            shadow_log("Sending startup mod wheel reset to all slots");
            if (shadow_plugin_v2 && shadow_plugin_v2->on_midi) {
                for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                    if (shadow_chain_slots[s].active && shadow_chain_slots[s].instance) {
                        /* Send CC 1 = 0 (mod wheel reset) on all 16 channels */
                        for (int ch = 0; ch < 16; ch++) {
                            uint8_t mod_reset[3] = {(uint8_t)(0xB0 | ch), 1, 0};
                            shadow_plugin_v2->on_midi(shadow_chain_slots[s].instance, mod_reset, 3,
                                                      MOVE_MIDI_SOURCE_HOST);
                        }
                    }
                }
            }
        }
    }

    /* MIDI_IN (internal controls) is NOT routed to DSP here.
     * - Shadow UI handles knobs via set_param based on ui_hierarchy
     * - Capture rules are handled in shadow_filter_move_input (post-ioctl)
     * - Internal notes/CCs should only reach Move, not DSP */

    /* MIDI_OUT → DSP: Move's track output contains only musical notes.
     * Internal controls (knob touches, step buttons) do NOT appear in MIDI_OUT.
     * The buffer is refreshed from hardware after every ioctl (post-ioctl memcpy). */
    const uint8_t *out_src = global_mmap_addr + MIDI_OUT_OFFSET;
    int log_on = shadow_midi_out_log_enabled();
    static int midi_log_count = 0;
    /* Hardware MIDI_OUT region is 80 bytes (20 × 4-byte USB-MIDI packets).
     * Display data starts at offset 80; reading past this and dispatching
     * to the DSP would feed display bytes as spurious MIDI. */
    for (int i = 0; i < HW_MIDI_OUT_SIZE; i += 4) {
        const uint8_t *pkt = &out_src[i];
        if (pkt[0] == 0 && pkt[1] == 0 && pkt[2] == 0 && pkt[3] == 0) continue;

        uint8_t p0 = pkt[0], p1 = pkt[1], p2 = pkt[2], p3 = pkt[3];

        uint8_t cin = p0 & 0x0F;
        uint8_t cable = (p0 >> 4) & 0x0F;
        uint8_t status_usb = p1;

        /* Handle system realtime messages (CIN=0x0F): clock, start, continue, stop
         * These are 1-byte messages that should be broadcast to ALL active slots */
        if (cin == 0x0F && status_usb >= 0xF8 && status_usb <= 0xFF) {
            /* Sampler sees clock from cable 0 only (Move internal) to avoid double-counting */
            if (cable == 0) {
                sampler_on_clock(status_usb);
                shadow_transport_on_realtime(TRANSPORT_SRC_MOVE, status_usb);
            }

            /* Deliver realtime to overtake DSP from cable 0 (Move's internal
             * transport). Cable 0 always carries Move's transport state when
             * running, including when Move is slaved to an external master,
             * so it works regardless of the user's MIDI Clock Out preference.
             * Cable 2 was tried previously but is only populated when clock-
             * out is enabled, so users with clock-out off saw 3po never start
             * on Play. Mirrors the sampler_on_clock cable-0 choice above. */
            if (cable == 0 && overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->on_midi) {
                uint8_t msg[1] = { status_usb };
                overtake_dsp_gen->on_midi(overtake_dsp_gen_inst, msg, 1, MOVE_MIDI_SOURCE_EXTERNAL);
            }

            /* Broadcast Move's internal transport clock (cable 0) to all
             * shadow slots. Cable 0 is always populated when the sequencer
             * runs, independent of the user's MIDI Clock Out setting — so
             * chain synths sync off the internal clock with no plugin changes
             * and without requiring Clock Out. Mirrors the sampler_on_clock
             * and overtake-DSP cable-0 taps above. (Previously cable 2, which
             * is only present when Clock Out is enabled — the source of the
             * "plugins need MIDI Out for sync" friction.) */
            if (cable != 0) {
                continue;
            }
            /* Broadcast to all active slots */
            if (shadow_plugin_v2 && shadow_plugin_v2->on_midi) {
                uint8_t msg[3] = { status_usb, 0, 0 };
                for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                    if (shadow_chain_slots[s].active && shadow_chain_slots[s].instance) {
                        shadow_plugin_v2->on_midi(shadow_chain_slots[s].instance, msg, 1,
                                                  MOVE_MIDI_SOURCE_EXTERNAL);
                    }
                }
            }
            continue;  /* Done with this packet */
        }

        /* USB MIDI format: CIN in low nibble of byte 0 */
        if (cin >= 0x08 && cin <= 0x0E && (status_usb & 0x80)) {
            if ((status_usb & 0xF0) < 0x80 || (status_usb & 0xF0) > 0xE0) continue;

            /* Validate CIN matches status type (filter garbage/stale data) */
            uint8_t type = status_usb & 0xF0;
            uint8_t expected_cin = (type >> 4);  /* Note-off=0x8, Note-on=0x9, etc. */
            if (cin != expected_cin) {
                continue;  /* CIN doesn't match status - skip invalid packet */
            }

            /* Validate data bytes (MIDI data bytes must be 0-127, high bit clear) */
            if ((p2 & 0x80) || (p3 & 0x80)) {
                continue;  /* Invalid data bytes - skip garbage packet */
            }

            /* Only process cable 2 (external USB) MIDI for shadow chain.
             * Cable 0 = internal, cable 1 = TRS - both are Move's own output */
            if (cable != 2) {
                continue;
            }

            /* Filter internal control notes: knob touches (0-9) */
            if ((type == 0x90 || type == 0x80) && p2 < 10) {
                continue;
            }

            /* Check if this MIDI_OUT packet is an echo of external USB MIDI.
             * Two signals, either of which marks it as an echo:
             *   1. The same status+data is still in MIDI_IN cable 2 right now.
             *   2. The same status+data was dispatched by one of the MIDI_IN
             *      cable-2 readers within the last few frames (ring-based).
             * Signal 1 alone is unreliable under chord bursts because Move
             * consumes/reuses MIDI_IN cable-2 slots between the dispatch
             * frame and the echo frame.  The ring closes that race. */
            int is_external_echo = 0;
            const uint8_t *in_buf = global_mmap_addr + MIDI_IN_OFFSET;
            for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
                if ((in_buf[j] >> 4) == 2 &&          /* cable 2 */
                    in_buf[j + 1] == p1 &&             /* same status+channel */
                    in_buf[j + 2] == p2 &&             /* same data1 */
                    in_buf[j + 3] == p3) {             /* same data2 */
                    is_external_echo = 1;
                    break;
                }
            }
            if (!is_external_echo &&
                shadow_external_dispatch_was_recent(p1, p2, p3)) {
                is_external_echo = 1;
            }
            /* In non-overtake (or suspended-overtake) regime,
             * shadow_dispatch_direct_external_midi already handled THRU slots
             * and shadow_dispatch_cable2_channeled_slots already handled
             * channel-matched slots from MIDI_IN. Dispatching the MIDI_OUT
             * echo to chain slots would deliver the same event twice. */
            if (is_external_echo && shadow_control &&
                (shadow_control->overtake_mode == 0 ||
                 shadow_control->suspend_overtake)) {
                /* skip chain dispatch; overtake DSP routing below is a no-op
                 * when no overtake module is loaded */
            } else {
                shadow_chain_dispatch_midi_to_slots(pkt, log_on, &midi_log_count, is_external_echo);
            }

            /* Also route to overtake DSP if loaded */
            if (overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->on_midi) {
                uint8_t msg[3] = { p1, p2, p3 };
                overtake_dsp_gen->on_midi(overtake_dsp_gen_inst, msg, 3, MOVE_MIDI_SOURCE_EXTERNAL);
            } else if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->on_midi) {
                uint8_t msg[3] = { p1, p2, p3 };
                overtake_dsp_fx->on_midi(overtake_dsp_fx_inst, msg, 3, MOVE_MIDI_SOURCE_EXTERNAL);
            }

        }
    }

}

/* === OVERTAKE DSP LOAD/UNLOAD ===
 * Overtake modules can optionally include a dsp.so that runs in the shim's
 * audio thread.  V2-only: supports both generator (plugin_api_v2_t, outputs
 * audio) and effect (audio_fx_api_v2_t, processes combined audio in-place).
 */

/* MIDI send callback for overtake DSP → chain slots */
static int overtake_midi_send_internal(const uint8_t *msg, int len) {
    /* Realtime must be padded to >= 4 bytes to clear this guard: the emit path
     * packs status as [status,0,0,0], so a 1-byte realtime send is dropped. */
    if (!msg || len < 4) return 0;
    /* System realtime is transport, not note data: feed the transport service
     * and broadcast on the same 1-byte path as the cable-0 tap. Must NOT go
     * through dispatch_to_slots, whose channel remap corrupts the status byte.
     * Match only the four transport bytes — Start/Continue/Stop/Clock — not the
     * whole 0xF8..0xFF range, which also spans undefined (F9/FD), active
     * sensing (FE) and reset (FF); those must not fan out to every slot. */
    if (msg[1] == 0xF8 || msg[1] == 0xFA || msg[1] == 0xFB || msg[1] == 0xFC) {
        shadow_transport_on_realtime(TRANSPORT_SRC_INTERNAL, msg[1]);
        shadow_chain_broadcast_realtime(msg[1]);
        return len;
    }
    /* Build USB-MIDI packet: [CIN, status, d1, d2] */
    uint8_t cin = (msg[1] >> 4) & 0x0F;
    uint8_t pkt[4] = { cin, msg[1], msg[2], msg[3] };
    static int midi_log_count = 0;
    int log_on = shadow_midi_out_log_enabled();
    shadow_chain_dispatch_midi_to_slots(pkt, log_on, &midi_log_count, 0);
    return len;
}

/* Slot-addressed MIDI send callback for overtake DSP → one chain slot.
 * Same message form and realtime handling as overtake_midi_send_internal;
 * voice messages skip channel matching and go straight to `slot`. */
static int overtake_midi_send_internal_slot(int slot, const uint8_t *msg, int len) {
    if (!msg || len < 4) return 0;
    if (msg[1] == 0xF8 || msg[1] == 0xFA || msg[1] == 0xFB || msg[1] == 0xFC) {
        shadow_transport_on_realtime(TRANSPORT_SRC_INTERNAL, msg[1]);
        shadow_chain_broadcast_realtime(msg[1]);
        return len;
    }
    uint8_t cin = (msg[1] >> 4) & 0x0F;
    uint8_t pkt[4] = { cin, msg[1], msg[2], msg[3] };
    static int midi_log_count = 0;
    int log_on = shadow_midi_out_log_enabled();
    shadow_chain_dispatch_midi_to_slot(slot, pkt, log_on, &midi_log_count);
    return len;
}

/* === Phase 2: Audio-thread-safe ROUTE_EXTERNAL MIDI send =================
 *
 * overtake_midi_send_external() is called from an overtake DSP's audio
 * thread. The pre-Phase-2 body did its own
 * synchronous real_ioctl(SPI), which works only by accident — it ships
 * a partial 768-byte mailbox (including stale audio at offset 256-767)
 * out of step with the audio thread's own per-block ioctl.
 *
 * Move's SPI is single-channel: ONE ioctl(0xa, 0x300) per audio block
 * ships the whole mailbox (MIDI OUT @0-79, display, audio @256-767) as
 * one atomic transfer. There is no MIDI-only flush. So we enqueue
 * 4-byte USB-MIDI packets into a lock-free SPSC ring; the audio thread
 * drains the ring into mailbox bytes 0-79 inside shim_pre_transfer, just
 * before its existing ioctl fires. This makes ROUTE_EXTERNAL ride the
 * audio-block cadence (~2.9 ms at 44100/128) and removes the audio-
 * destruction symptom of the pre-Phase-2 sync body.
 *
 * Capability sentinel shadow_overtake_send_external_async_active() lets
 * opt-in tools call this with the audio-thread guarantee. */

#define OVERTAKE_EXT_RING_PACKETS 64           /* 64 slots × 4 bytes USB-MIDI = 256 B */

typedef struct {
    uint8_t pkt[OVERTAKE_EXT_RING_PACKETS][4];
    volatile uint32_t head;  /* producer writes (any audio thread) */
    volatile uint32_t tail;  /* consumer writes (shim_pre_transfer) */
} overtake_ext_ring_t;

static overtake_ext_ring_t overtake_ext_ring;
static volatile int overtake_ext_drops = 0;     /* incremented on ring-full; no log from audio thread */

/* Audio-thread producer. Lock-free SPSC enqueue. Drop-newest on full.
 * No logging — runs at FIFO 70 with ~900µs total SPI-callback budget. */
static int overtake_midi_send_external(const uint8_t *msg, int len) {
    if (!msg || len < 4) return 0;

    uint32_t head = overtake_ext_ring.head;
    uint32_t tail = overtake_ext_ring.tail;
    __sync_synchronize();  /* acquire */
    if ((uint32_t)(head - tail) >= OVERTAKE_EXT_RING_PACKETS) {
        overtake_ext_drops++;  /* silently — counter only; no get_param binding yet */
        return 0;
    }
    uint32_t idx = head % OVERTAKE_EXT_RING_PACKETS;
    memcpy(overtake_ext_ring.pkt[idx], msg, 4);
    __sync_synchronize();   /* release — packet data visible before head bump */
    overtake_ext_ring.head = head + 1;
    return len;
}

/* Audio-thread consumer. Drains up to 20 packets from the ring into empty
 * 4-byte slots of the MIDI_OUT region (shadow + MIDI_OUT_OFFSET, 80 bytes).
 * Called from shim_pre_transfer once per block, BEFORE the JACK MIDI writer
 * so sequencer notes get slot priority over JACK chain output.
 * Capacity: 20 slots/block * ~344 blocks/sec ≈ 6880 pkt/sec sustained;
 * realistic chord-rate sequencer traffic is well under this. */
static void overtake_ext_drain_into_shadow(uint8_t *shadow) {
    if (!shadow) return;
    uint32_t tail = overtake_ext_ring.tail;
    uint32_t head = overtake_ext_ring.head;
    __sync_synchronize();  /* acquire — see packet data the producer published */
    if (tail == head) return;

    uint8_t *midi_out = shadow + MIDI_OUT_OFFSET;
    int slot = 0;
    while (tail != head) {
        /* Find next empty 4-byte slot. */
        while (slot < 80 &&
               (midi_out[slot] || midi_out[slot+1] ||
                midi_out[slot+2] || midi_out[slot+3])) {
            slot += 4;
        }
        if (slot >= 80) break;  /* no slots left this block — leave rest in ring */
        uint32_t idx = tail % OVERTAKE_EXT_RING_PACKETS;
        midi_out[slot]   = overtake_ext_ring.pkt[idx][0];
        midi_out[slot+1] = overtake_ext_ring.pkt[idx][1];
        midi_out[slot+2] = overtake_ext_ring.pkt[idx][2];
        midi_out[slot+3] = overtake_ext_ring.pkt[idx][3];
        slot += 4;
        tail++;
    }
    __sync_synchronize();
    overtake_ext_ring.tail = tail;
}

/* ---- Off-RT cached remote snapshot (generic opt-in facility) -------------
 * A connected browser editor pulls the overtake DSP's big read-only "state"
 * snapshot (O(notes), up to SHADOW_PARAM_VALUE_LEN) on every rev-bump.
 * Serialized inline on the SPI RT thread it overruns the ~900µs frame budget
 * and hitches the sequencer clock + MIDI. Deferring the mailbox GET to a
 * worker (v1 of this facility) fixed the hitch but held the single param
 * mailbox for the whole worker latency — the other producer's fire-and-forget
 * SETs stomped it and manager requests died in 500ms timeouts.
 *
 * v2: the worker maintains a rev-stamped, double-buffered serialization of
 * the module's "state"; the RT servicer answers a GET inline with a memcpy
 * (~tens of µs for 64KB — well inside budget) in ONE frame, so the mailbox is
 * never held longer than any other GET. The worker re-serializes when kicked:
 * on a rev change while snapshot-hot (a GET arrived recently) and on any GET
 * that observed a stale or missing cache. A served snapshot may be one rev
 * stale; it carries its own rev (module JSON) so the manager re-pulls until
 * revs converge — usually the proactive rev-change kick has already
 * refreshed the cache by then.
 *
 * Module contract (get_param "remote_snapshot_rt_safe" == "1"): ALL instance
 * memory reachable by its "state"/"rui_poll" get_param is never freed or
 * realloc'd while the instance lives (frees only at destroy) — so the worker
 * may read concurrently with render_block AND set_param. Worst case is a
 * torn/stale snapshot, self-corrected by the next rev-gated pull — never a
 * use-after-free. The host still drains the worker before destroy/unload/
 * load-over. With no browser attached no snapshot GET ever arrives, the
 * cache stays cold and the worker sleeps on the semaphore → zero added cost. */
static int               g_snap_rt_safe = 0;    /* loaded module opted in */
static sem_t             g_snap_sem;
static int               g_snap_sem_ok  = 0;
static volatile int      g_snap_busy    = 0;    /* worker serializing */
static volatile int      g_snap_kick    = 0;    /* coalesced re-serialize request */
static volatile uint32_t g_snap_cur_rev = 0;    /* latest rev seen by the RT probe */
static int               g_snap_hot     = 0;    /* frames of remaining interest (RT only) */
#define SNAP_HOT_FRAMES 4000                    /* ~11.6s of SPI frames */
/* Double buffer: worker writes the inactive side, then flips g_snap_active.
 * Per-side seqlock (odd = mid-write) guards the rare reuse-while-copying race. */
static char              g_snap_buf[2][SHADOW_PARAM_VALUE_LEN];
static volatile int      g_snap_len[2] = {-1, -1};
static volatile uint32_t g_snap_rev[2];
static volatile uint32_t g_snap_seq[2];
static volatile int      g_snap_active = -1;    /* -1 = no valid snapshot yet */

/* Wait (BOUNDED) for the worker to go idle before a path frees the overtake
 * instance (unload/load-over). Cheap when idle (one load). Callers must clear
 * g_snap_rt_safe first so no new kick starts a serialize. Returns 1 when the
 * worker is idle; 0 on timeout — the worker (FIFO 10, cores 0-2) can in
 * principle be starved by Move's FIFO-70 threads, and an unbounded spin here
 * runs on the SPI RT thread. On timeout the caller must NOT free instance
 * memory or dlclose (leak instead — safe; pathological load only). */
static inline int snap_wait_idle(void) {
    if (!__atomic_load_n(&g_snap_busy, __ATOMIC_ACQUIRE)) return 1;
    struct timespec t0, t;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    while (__atomic_load_n(&g_snap_busy, __ATOMIC_ACQUIRE)) {
        clock_gettime(CLOCK_MONOTONIC, &t);
        long ms = (t.tv_sec - t0.tv_sec) * 1000L + (t.tv_nsec - t0.tv_nsec) / 1000000L;
        if (ms > 200) return 0;
    }
    return 1;
}

/* Ask the worker for a (re-)serialization. RT-safe: coalesces via g_snap_kick;
 * sem_post only on the idle->busy edge so the semaphore never accumulates. */
static inline void snap_kick(void) {
    if (!g_snap_rt_safe || !g_snap_sem_ok) return;
    __atomic_store_n(&g_snap_kick, 1, __ATOMIC_RELEASE);
    if (!__atomic_exchange_n(&g_snap_busy, 1, __ATOMIC_ACQ_REL))
        sem_post(&g_snap_sem);
}

/* Epoch counter: bumped by snap_cache_reset so a worker that straddles a
 * module unload/load (wedged mid-serialize during the bounded drain) can
 * detect its result belongs to a dead epoch and must not publish it. */
static volatile uint32_t g_snap_epoch = 0;

/* Invalidate the cache across module load/unload boundaries. Caller must have
 * cleared g_snap_rt_safe and drained the worker (snap_wait_idle) first. */
static inline void snap_cache_reset(void) {
    __atomic_add_fetch(&g_snap_epoch, 1, __ATOMIC_ACQ_REL);
    g_snap_active  = -1;
    g_snap_len[0]  = g_snap_len[1] = -1;
    g_snap_cur_rev = 0;
    g_snap_hot     = 0;
    g_snap_kick    = 0;
}

static void shadow_overtake_dsp_load(const char *path) {
    shadow_overtake_rui_reset();
    /* Unload previous if any */
    if (overtake_dsp_handle) {
        shadow_log("Overtake DSP: unloading previous before loading new");
        /* Stop new off-RT snapshot reads and drain any in flight before freeing. */
        g_snap_rt_safe = 0;
        int snap_idle = snap_wait_idle();
        snap_cache_reset();
        if (!snap_idle)
            shadow_log("Overtake DSP: snapshot worker wedged — leaking previous instance + handle (safe)");
        if (snap_idle && overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->destroy_instance)
            overtake_dsp_gen->destroy_instance(overtake_dsp_gen_inst);
        if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->destroy_instance)
            overtake_dsp_fx->destroy_instance(overtake_dsp_fx_inst);
        if (snap_idle)
            dlclose(overtake_dsp_handle);
        overtake_dsp_handle = NULL;
        overtake_dsp_gen = NULL;
        overtake_dsp_gen_inst = NULL;
        overtake_dsp_fx = NULL;
        overtake_dsp_fx_inst = NULL;
    }

    if (!path || !path[0]) return;

    overtake_dsp_handle = dlopen(path, RTLD_NOW | RTLD_LOCAL);
    if (!overtake_dsp_handle) {
        char msg[512];
        snprintf(msg, sizeof(msg), "Overtake DSP: failed to load %s: %s", path, dlerror());
        shadow_log(msg);
        return;
    }

    /* Set up host API for the overtake plugin */
    memset(&overtake_host_api, 0, sizeof(overtake_host_api));
    overtake_host_api.api_version = MOVE_PLUGIN_API_VERSION;
    overtake_host_api.sample_rate = MOVE_SAMPLE_RATE;
    overtake_host_api.frames_per_block = MOVE_FRAMES_PER_BLOCK;
    overtake_host_api.mapped_memory = global_mmap_addr;
    overtake_host_api.audio_out_offset = MOVE_AUDIO_OUT_OFFSET;
    overtake_host_api.audio_in_offset = MOVE_AUDIO_IN_OFFSET;
    overtake_host_api.log = shadow_log;
    overtake_host_api.midi_send_internal = overtake_midi_send_internal;
    overtake_host_api.midi_send_internal_slot = overtake_midi_send_internal_slot;
    overtake_host_api.midi_send_external = overtake_midi_send_external;
    overtake_host_api.get_bpm = shim_get_bpm;
    overtake_host_api.get_beat_position = shadow_transport_beat_position;
    overtake_host_api.midi_inject_to_move = shadow_chain_midi_inject;

    /* Extract module directory from dsp path */
    char module_dir[256];
    strncpy(module_dir, path, sizeof(module_dir) - 1);
    module_dir[sizeof(module_dir) - 1] = '\0';
    char *last_slash = strrchr(module_dir, '/');
    if (last_slash) *last_slash = '\0';

    /* Try V2 generator first (e.g. SEQOMD) */
    move_plugin_init_v2_fn init_gen = (move_plugin_init_v2_fn)dlsym(
        overtake_dsp_handle, MOVE_PLUGIN_INIT_V2_SYMBOL);
    if (init_gen) {
        overtake_dsp_gen = init_gen(&overtake_host_api);
        if (overtake_dsp_gen && overtake_dsp_gen->create_instance) {
            /* Read defaults from module.json if available */
            char json_path[512];
            snprintf(json_path, sizeof(json_path), "%s/module.json", module_dir);
            char *defaults = NULL;
            FILE *f = fopen(json_path, "r");
            if (f) {
                fseek(f, 0, SEEK_END);
                long sz = ftell(f);
                fseek(f, 0, SEEK_SET);
                if (sz > 0 && sz < 16384) {
                    defaults = malloc(sz + 1);
                    if (defaults) {
                        size_t nr = fread(defaults, 1, sz, f);
                        defaults[nr] = '\0';
                        /* Extract just the "defaults" value */
                        const char *dp = strstr(defaults, "\"defaults\"");
                        if (!dp) { free(defaults); defaults = NULL; }
                    }
                }
                fclose(f);
            }

            overtake_dsp_gen_inst = overtake_dsp_gen->create_instance(
                module_dir, defaults);
            if (defaults) free(defaults);

            if (overtake_dsp_gen_inst) {
                /* One-time capability query: may this module's read-only snapshot
                 * be serialized on a worker thread concurrently with render AND
                 * set_param? The module answers "1" only if instance memory the
                 * snapshot can reach is never freed/realloc'd while the instance
                 * lives (see the g_snap_* contract comment). Any module that
                 * doesn't implement the key returns <=0 → snapshot GETs stay
                 * inline on the RT thread (today's behavior). */
                g_snap_rt_safe = 0;
                if (overtake_dsp_gen->get_param) {
                    char cap[8] = {0};
                    int cl = overtake_dsp_gen->get_param(overtake_dsp_gen_inst,
                                 "remote_snapshot_rt_safe", cap, sizeof(cap));
                    if (cl > 0 && cap[0] == '1') g_snap_rt_safe = 1;
                }
                char msg[256];
                snprintf(msg, sizeof(msg), "Overtake DSP: loaded generator from %s (snapshot_rt_safe=%d)",
                         path, g_snap_rt_safe);
                shadow_log(msg);
                return;
            }
        }
        overtake_dsp_gen = NULL;
    }

    /* Try audio FX v2 (effect mode) */
    audio_fx_init_v2_fn init_fx = (audio_fx_init_v2_fn)dlsym(
        overtake_dsp_handle, AUDIO_FX_INIT_V2_SYMBOL);
    if (init_fx) {
        overtake_dsp_fx = init_fx(&overtake_host_api);
        if (overtake_dsp_fx && overtake_dsp_fx->create_instance) {
            overtake_dsp_fx_inst = overtake_dsp_fx->create_instance(module_dir, NULL);
            if (overtake_dsp_fx_inst) {
                char msg[256];
                snprintf(msg, sizeof(msg), "Overtake DSP: loaded FX from %s", path);
                shadow_log(msg);
                return;
            }
        }
        overtake_dsp_fx = NULL;
    }

    /* Neither worked */
    char msg[512];
    snprintf(msg, sizeof(msg), "Overtake DSP: no V2 generator or FX entry point in %s", path);
    shadow_log(msg);
    dlclose(overtake_dsp_handle);
    overtake_dsp_handle = NULL;
}

static void shadow_overtake_dsp_unload(void) {
    if (!overtake_dsp_handle) return;
    shadow_overtake_rui_reset();

    /* Stop new off-RT snapshot reads and drain any in flight before freeing. */
    g_snap_rt_safe = 0;
    int snap_idle = snap_wait_idle();
    snap_cache_reset();
    if (!snap_idle)
        shadow_log("Overtake DSP: snapshot worker wedged — leaking instance + handle (safe)");

    if (snap_idle && overtake_dsp_gen && overtake_dsp_gen_inst) {
        if (overtake_dsp_gen->destroy_instance)
            overtake_dsp_gen->destroy_instance(overtake_dsp_gen_inst);
        shadow_log("Overtake DSP: generator unloaded");
    }
    if (overtake_dsp_fx && overtake_dsp_fx_inst) {
        if (overtake_dsp_fx->destroy_instance)
            overtake_dsp_fx->destroy_instance(overtake_dsp_fx_inst);
        shadow_log("Overtake DSP: FX unloaded");
    }

    if (snap_idle)
        dlclose(overtake_dsp_handle);
    overtake_dsp_handle = NULL;
    overtake_dsp_gen = NULL;
    overtake_dsp_gen_inst = NULL;
    overtake_dsp_fx = NULL;
    overtake_dsp_fx_inst = NULL;

    /* Discard any ROUTE_EXTERNAL packets the unloaded DSP left in the ring.
     * Without this, the next overtake load would drain the previous module's
     * leftover packets into Move's MIDI_OUT region — up to 64 stray events
     * shipped to USB-A across the first ~4 audio blocks after load. The
     * producer (destroyed instance) can no longer fire, so the ring is
     * inert here and a non-atomic reset is safe. */
    overtake_ext_ring.head = 0;
    overtake_ext_ring.tail = 0;
}

/* Per-slot render breakdown counters (added 2026-05-15 for render spike hunt).
 * Forward-declared here so shadow_inprocess_render_to_buffer can update them;
 * snapshot/reset live with the other spi_timing statics further below. */
/* Idle-probe scheduling for the slot render loop (see the stagger comment at
 * the probe site). The window is how often a silent slot is re-rendered to
 * detect self-generating audio (~0.5 s); the stride is the per-slot phase
 * offset that keeps at most one slot probing on any given frame. Deriving the
 * stride from the slot count is what makes the stagger hold at any count. */
#define SLOT_PROBE_WINDOW_FRAMES 172
#define SLOT_PROBE_STRIDE_FRAMES (SLOT_PROBE_WINDOW_FRAMES / SHADOW_CHAIN_INSTANCES)

/* No local fallback #define for SHADOW_CHAIN_INSTANCES: shadow_constants.h is
 * the single declaration. A fallback would let an include-order change size
 * these arrays differently from the rest of the build, silently. */
static uint64_t spi_slot_render_max[SHADOW_CHAIN_INSTANCES];
static uint64_t spi_slot_synth_max[SHADOW_CHAIN_INSTANCES];  /* render_block only */
static uint64_t spi_slot_fx_max[SHADOW_CHAIN_INSTANCES];     /* chain_process_fx, ALL 3 paths */
static uint32_t spi_slot_probe_burst_max;

/* === DEFERRED DSP RENDERING ===
 * Render DSP into buffer (slow, ~300µs) - called POST-ioctl
 * This renders audio for the NEXT frame, adding one frame of latency (~3ms)
 * but allowing Move to process pad events faster after ioctl returns.
 */
static void shadow_inprocess_render_to_buffer(void) {
    if (!shadow_inprocess_ready || !global_mmap_addr) return;

    /* Advance the transport clock before slot/master LFOs render below, so
     * they read a beat position interpolated to this block. */
    shadow_transport_advance_block(MOVE_FRAMES_PER_BLOCK);

    /* Clear the deferred buffer (used for overtake DSP) */
    memset(shadow_deferred_dsp_buffer, 0, sizeof(shadow_deferred_dsp_buffer));

    /* Clear per-slot deferred buffers */
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        memset(shadow_slot_deferred[s], 0, FRAMES_PER_BLOCK * 2 * sizeof(int16_t));
        shadow_slot_deferred_valid[s] = 0;
        memset(shadow_slot_fx_deferred[s], 0, FRAMES_PER_BLOCK * 2 * sizeof(int16_t));
        shadow_slot_fx_deferred_valid[s] = 0;
    }

    /* Same-frame FX: render synth only into per-slot buffers.
     * FX + Link Audio inject are processed in mix_from_buffer (same frame as mailbox)
     * so the inject/subtract cancellation is sample-accurate. */
    int same_frame_fx = (shadow_chain_set_external_fx_mode != NULL &&
                         shadow_chain_process_fx != NULL);

    /* Probe-burst diagnostic: count slots whose idle probe fires this frame.
     * If 2-3 slots' silence counters align on the same probe-frame the
     * render cost stacks into a single ~1ms spike. */
    uint32_t probe_burst_this_frame = 0;
    if (shadow_plugin_v2 && shadow_plugin_v2->render_block) {
        for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
            if (!shadow_chain_slots[s].active || !shadow_chain_slots[s].instance) continue;

            /* Per-slot timing for the render+fx work below */
            struct timespec slot_t0, slot_t1;
            clock_gettime(CLOCK_MONOTONIC, &slot_t0);

            /* Wake slot from idle if fade is ramping (otherwise gain stays at 0) */
            if (shadow_chain_slots[s].fade.gain != shadow_chain_slots[s].fade.target) {
                shadow_slot_idle[s] = 0;
                shadow_slot_silence_frames[s] = 0;
            }

            /* Idle gate: skip render_block if synth output has been silent.
             * Buffer is already zeroed; FX still runs for tail decay.
             * Probe every ~0.5s to detect self-generating audio (LFOs, arps).
             *
             * Stagger: slots that go idle on the same frame (common at boot)
             * have aligned silence_frames counters and would all probe the
             * same frame, stacking render+FX cost into one ~1ms spike. The
             * per-slot offset spreads probes evenly across the probe window
             * so at most one slot probes per frame.
             *
             * ⚠ The offset MUST be derived from the slot count. It was once a
             * literal 43 (= 172/4), which silently collides the moment the
             * count is not 4: at 8 slots s=4..7 wrap modulo the window back
             * onto s=0..3's probe frames, so four pairs probe together — the
             * exact spike this stagger exists to prevent. */
            if (shadow_slot_idle[s]) {
                shadow_slot_silence_frames[s]++;
                if ((shadow_slot_silence_frames[s] + s * SLOT_PROBE_STRIDE_FRAMES)
                        % SLOT_PROBE_WINDOW_FRAMES != 0) {
                    /* Not a probe frame — skip synth render.
                     * Buffer is zeros; FX below still runs for tail decay. */
                    shadow_slot_deferred_valid[s] = 1;
                    goto slot_run_deferred_fx;
                }
                /* Probe frame: fall through to render and check output */
                probe_burst_this_frame++;
            }

            if (same_frame_fx) {
                /* Synth only → per-slot buffer. FX deferred below. */
                shadow_chain_set_external_fx_mode(shadow_chain_slots[s].instance, 1);
                struct timespec synth_t0, synth_t1;
                clock_gettime(CLOCK_MONOTONIC, &synth_t0);
                shadow_plugin_v2->render_block(shadow_chain_slots[s].instance,
                                               shadow_slot_deferred[s],
                                               MOVE_FRAMES_PER_BLOCK);
                clock_gettime(CLOCK_MONOTONIC, &synth_t1);
                uint64_t synth_us = (synth_t1.tv_sec - synth_t0.tv_sec) * 1000000ULL +
                                    (synth_t1.tv_nsec - synth_t0.tv_nsec) / 1000;
                if (synth_us > spi_slot_synth_max[s]) spi_slot_synth_max[s] = synth_us;
                shadow_slot_deferred_valid[s] = 1;
            } else {
                /* Fallback: full render (synth + FX) → accumulated buffer.
                 * No Link Audio inject (one-frame delay would cause issues). */
                int16_t render_buffer[FRAMES_PER_BLOCK * 2];
                memset(render_buffer, 0, sizeof(render_buffer));
                shadow_plugin_v2->render_block(shadow_chain_slots[s].instance,
                                               render_buffer, MOVE_FRAMES_PER_BLOCK);
                if (link_audio.enabled && s < LINK_AUDIO_SHADOW_CHANNELS) {
                    float cap_vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++)
                        shadow_slot_capture[s][i] = (int16_t)lroundf((float)render_buffer[i] * cap_vol);
                    /* Write to publisher shared memory for link_subscriber */
                    if (shadow_pub_audio_shm) {
                        link_audio_pub_slot_t *ps = &shadow_pub_audio_shm->slots[s];
                        uint32_t wp = ps->write_pos;
                        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                            ps->ring[wp & LINK_AUDIO_PUB_SHM_RING_MASK] = shadow_slot_capture[s][i];
                            wp++;
                        }
                        __sync_synchronize();
                        ps->write_pos = wp;
                        ps->active = 1;
                    }
                }
                float dfr_pan_l = shadow_pan_gain_l(shadow_chain_slots[s].pan);
                float dfr_pan_r = shadow_pan_gain_r(shadow_chain_slots[s].pan);
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    float vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    float pg = (i & 1) ? dfr_pan_r : dfr_pan_l;
                    int32_t mixed = shadow_deferred_dsp_buffer[i] + (int32_t)(render_buffer[i] * vol * pg);
                    if (mixed > 32767) mixed = 32767;
                    if (mixed < -32768) mixed = -32768;
                    shadow_deferred_dsp_buffer[i] = (int16_t)mixed;
                    if (i & 1) shadow_fade_advance(s);
                }
            }

            /* Check if synth render output is silent */
            {
            int16_t *slot_out = same_frame_fx ? shadow_slot_deferred[s] : shadow_deferred_dsp_buffer;
            int is_silent = 1;
            for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                if (slot_out[i] > DSP_SILENCE_LEVEL || slot_out[i] < -DSP_SILENCE_LEVEL) {
                    is_silent = 0;
                    break;
                }
            }

            if (is_silent) {
                shadow_slot_silence_frames[s]++;
                if (shadow_slot_silence_frames[s] >= DSP_IDLE_THRESHOLD) {
                    shadow_slot_idle[s] = 1;
                }
            } else {
                shadow_slot_silence_frames[s] = 0;
                shadow_slot_idle[s] = 0;
            }
            }

            /* Run per-slot FX in post-ioctl (deferred) when same_frame_fx is active.
             * Moves ~435µs avg / 3ms max out of the pre-ioctl budget.
             * When synth is idle, FX still runs on zeros for tail decay.
             * When both synth AND FX are idle, skip entirely. */
        slot_run_deferred_fx:
            /* Skip the deferred FX call ONLY when the main-mix rebuild path
             * will actually run this frame — otherwise the slot has no FX
             * output at all (both the deferred and the rebuild paths get
             * skipped). Mirrors the conditions of `rebuild_from_la` computed
             * later in shadow_inprocess_mix_from_buffer(). */
            int la_any_active = 0;
            if (shadow_in_audio_shm) {
                for (int i = 0; i < LINK_AUDIO_IN_SLOT_COUNT; i++) {
                    if (shadow_in_audio_shm->slots[i].active) {
                        la_any_active = 1; break;
                    }
                }
            }
            int skip_deferred_fx = (link_audio.enabled &&
                                    link_audio_routing_enabled &&
                                    la_any_active);

            if (skip_deferred_fx) {
                /* Mark valid with zeros so downstream non-rebuild path, if
                 * it ran, would get silence — but in practice main path
                 * replaces mailbox entirely so this is just for safety. */
                memset(shadow_slot_fx_deferred[s], 0,
                       sizeof(shadow_slot_fx_deferred[s]));
                shadow_slot_fx_deferred_valid[s] = 1;
            } else if (same_frame_fx && shadow_chain_process_fx) {
                if (shadow_slot_fx_idle[s] && shadow_slot_idle[s]) {
                    /* Both idle — FX output is silence */
                    shadow_slot_fx_deferred_valid[s] = 1;
                } else {
                    int16_t fx_buf[FRAMES_PER_BLOCK * 2];
                    memcpy(fx_buf, shadow_slot_deferred[s], sizeof(fx_buf));
                    shadow_apply_synth_level(s, fx_buf);
                    struct timespec fx_t0, fx_t1;
                    clock_gettime(CLOCK_MONOTONIC, &fx_t0);
                    shadow_chain_process_fx(shadow_chain_slots[s].instance,
                                            fx_buf, MOVE_FRAMES_PER_BLOCK);
                    clock_gettime(CLOCK_MONOTONIC, &fx_t1);
                    uint64_t fx_us = (fx_t1.tv_sec - fx_t0.tv_sec) * 1000000ULL +
                                     (fx_t1.tv_nsec - fx_t0.tv_nsec) / 1000;
                    if (fx_us > spi_slot_fx_max[s]) spi_slot_fx_max[s] = fx_us;
                    memcpy(shadow_slot_fx_deferred[s], fx_buf, sizeof(fx_buf));
                    shadow_slot_fx_deferred_valid[s] = 1;

                    /* Track FX output silence for phase 2 idle.
                     * Stateful FX (loopers, modulated delays) opt out via
                     * capabilities.requires_continuous_processing — without
                     * this, a 6 s looper's write_pos stops advancing during
                     * silence and the loop "only returns when there's signal". */
                    int fx_silent = 1;
                    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                        if (fx_buf[i] > DSP_SILENCE_LEVEL || fx_buf[i] < -DSP_SILENCE_LEVEL) {
                            fx_silent = 0;
                            break;
                        }
                    }
                    int fx_keep_alive = (shadow_chain_fx_requires_continuous &&
                                         shadow_chain_fx_requires_continuous(shadow_chain_slots[s].instance));
                    if (fx_keep_alive) {
                        shadow_slot_fx_silence_frames[s] = 0;
                        shadow_slot_fx_idle[s] = 0;
                    } else if (fx_silent) {
                        shadow_slot_fx_silence_frames[s]++;
                        if (shadow_slot_fx_silence_frames[s] >= DSP_IDLE_THRESHOLD)
                            shadow_slot_fx_idle[s] = 1;
                    } else {
                        shadow_slot_fx_silence_frames[s] = 0;
                        shadow_slot_fx_idle[s] = 0;
                    }
                }
            }

            /* End per-slot timing (added 2026-05-15 for render spike hunt) */
            clock_gettime(CLOCK_MONOTONIC, &slot_t1);
            uint64_t slot_us = (slot_t1.tv_sec - slot_t0.tv_sec) * 1000000ULL +
                               (slot_t1.tv_nsec - slot_t0.tv_nsec) / 1000;
            if (slot_us > spi_slot_render_max[s]) spi_slot_render_max[s] = slot_us;
        }
    }
    if (probe_burst_this_frame > spi_slot_probe_burst_max)
        spi_slot_probe_burst_max = probe_burst_this_frame;

    /* Overtake DSP generator: mix its output into the deferred buffer */
    if (overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->render_block) {
        /* Restore raw hardware audio_in so overtake plugins can read line-in.
         * The resample bridge may have overwritten the shadow_mailbox AUDIO_IN
         * region; re-copy from hardware to give plugins the actual input. */
        if (hardware_mmap_addr) {
            int16_t *hw_ain = (int16_t *)(hardware_mmap_addr + AUDIO_IN_OFFSET);
            int16_t *sh_ain = (int16_t *)(global_mmap_addr + AUDIO_IN_OFFSET);
            /* Log once to verify hardware audio levels */
            static int ain_log_count = 0;
            if (ain_log_count < 3) {
                int16_t hw_peak = 0, sh_peak = 0;
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    int16_t s = hw_ain[i] < 0 ? -hw_ain[i] : hw_ain[i];
                    if (s > hw_peak) hw_peak = s;
                    s = sh_ain[i] < 0 ? -sh_ain[i] : sh_ain[i];
                    if (s > sh_peak) sh_peak = s;
                }
                char msg[256];
                snprintf(msg, sizeof(msg),
                         "SampleRobot: audio_in restore - hw_peak=%d sh_peak=%d hw[0..3]=%d,%d,%d,%d",
                         hw_peak, sh_peak, hw_ain[0], hw_ain[1], hw_ain[2], hw_ain[3]);
                shadow_log(msg);
                ain_log_count++;
            }
            memcpy(sh_ain, hw_ain, AUDIO_BUFFER_SIZE);
        }
        int16_t render_buffer[FRAMES_PER_BLOCK * 2];
        memset(render_buffer, 0, sizeof(render_buffer));
        overtake_dsp_gen->render_block(overtake_dsp_gen_inst, render_buffer, MOVE_FRAMES_PER_BLOCK);
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            int32_t mixed = shadow_deferred_dsp_buffer[i] + (int32_t)render_buffer[i];
            if (mixed > 32767) mixed = 32767;
            if (mixed < -32768) mixed = -32768;
            shadow_deferred_dsp_buffer[i] = (int16_t)mixed;
        }
    }

    /* Preview player: mix file preview audio into the deferred buffer */
    preview_render(shadow_deferred_dsp_buffer, MOVE_FRAMES_PER_BLOCK);

    /* Note: Master FX is applied in mix_from_buffer() AFTER mixing with Move's audio */

    shadow_deferred_dsp_valid = 1;
}

/* Mix from pre-rendered buffer - called PRE-ioctl
 * When Link Audio is active: zeroes the mailbox and rebuilds from per-track
 * Link Audio data, routing each track through its slot's FX chain.
 * Tracks without active FX pass through at Move's volume level.
 * This eliminates dry signal leakage entirely (no subtraction needed).
 */
/* ============================================================================
 * Latency comp: Schwung-side delay ring
 * ============================================================================
 * When latency_comp_active and rebuild_from_la are both true, the Schwung
 * slot synth output is delayed by LATENCY_COMP_TARGET_SAMPLES stereo samples
 * before combining with the (already-delayed) Move-track Link Audio. This
 * aligns the two signals at the mailbox, so MFX and DAC see them as a
 * single coherent moment.
 *
 * Ring is 2048 stereo samples (~23 ms) — well over the target so we have
 * room to tune without resizing. Per-slot, file-static. Only touched from
 * the SPI-callback mixer path (single writer/reader). */
#define SHADOW_LATENCY_DELAY_RING_SAMPLES 2048
#define SHADOW_LATENCY_DELAY_RING_MASK    (SHADOW_LATENCY_DELAY_RING_SAMPLES - 1)
static int16_t shadow_latency_delay_ring[SHADOW_CHAIN_INSTANCES]
                                        [SHADOW_LATENCY_DELAY_RING_SAMPLES];
static uint32_t shadow_latency_delay_wp[SHADOW_CHAIN_INSTANCES];

void shadow_latency_delay_reset(void) {
    memset(shadow_latency_delay_ring, 0, sizeof(shadow_latency_delay_ring));
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        shadow_latency_delay_wp[s] = 0;
    }
}

/* Read `delay_samples` behind the write pointer into `out`, then write
 * `in` at the current write pointer. Both buffers are FRAMES_PER_BLOCK*2
 * stereo samples. `delay_samples` must be ≤ ring size minus block size. */
static void shadow_latency_delay_apply(int slot, const int16_t *in,
                                       int16_t *out,
                                       uint32_t delay_samples)
{
    uint32_t wp = shadow_latency_delay_wp[slot];
    /* Read delay_samples behind wp first (so we don't read what we're
     * about to write). */
    uint32_t rp = (wp - delay_samples) & SHADOW_LATENCY_DELAY_RING_MASK;
    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
        out[i] = shadow_latency_delay_ring[slot]
                                          [(rp + i) & SHADOW_LATENCY_DELAY_RING_MASK];
    }
    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
        shadow_latency_delay_ring[slot][(wp + i) & SHADOW_LATENCY_DELAY_RING_MASK] = in[i];
    }
    shadow_latency_delay_wp[slot] = wp + FRAMES_PER_BLOCK * 2;
}

/* Tap a post-fader buffer into the global send buses at explicit levels.
 * Shared by synth slots and Move FX slots (which carry their own vol/sends). */
static inline void accumulate_sends_ex(const int16_t *fx_buf, float vol,
                                       float send_a, float send_b,
                                       int32_t send_accum[][FRAMES_PER_BLOCK * 2]) {
    float levels[SEND_BUS_COUNT] = { send_a, send_b };
    for (int b = 0; b < SEND_BUS_COUNT; b++) {
        if (levels[b] < 0.001f) continue;
        float g = levels[b] * vol;
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++)
            send_accum[b][i] += (int32_t)lroundf((float)fx_buf[i] * g);
    }
}

static inline void accumulate_sends(int slot, const int16_t *fx_buf,
                                    int32_t send_accum[][FRAMES_PER_BLOCK * 2]) {
    float vol = shadow_effective_volume(slot) * shadow_chain_slots[slot].fade.gain;
    accumulate_sends_ex(fx_buf, vol, shadow_chain_slots[slot].send_a,
                        shadow_chain_slots[slot].send_b, send_accum);
}

/* ── mix_buf phase timers ────────────────────────────────────────────────────
 *
 * `mix_buf` is ONE number in the spi_timing line and it is the biggest one:
 * measured at 1915 µs of a 1946 µs frame on 2026-08-22, against a 900 µs budget,
 * while every DSP slot together spent 28 µs. So the frame was lost in here, and
 * a single total cannot say WHERE — this function is ~900 lines across six
 * phases, any of which could be the one.
 *
 * Max per phase, same shape as the per-slot maxima, reset each report window. A
 * max (not a sum) because the question is "which phase blows the budget", and an
 * average hides a phase that is cheap 999 frames out of 1000.
 *
 * ⭑⭑ The phases TILE the function — every line between the fast-path return and
 * the closing brace is inside exactly one. That is not tidiness, it is the
 * self-check: the phases should roughly SUM to mix_buf, so if they do not, the
 * cost is in a region we forgot to time and the log says so instead of quietly
 * pointing everywhere-but. The first cut had six phases and two untimed gaps
 * (the publisher/me_unity middle, and the whole ~185-line capture tail); it
 * would have reported six small numbers against a huge total and taught us
 * nothing. Found because Josh asked whether the PCM dumps were skipback-related
 * — the capture tail is where skipback's consumers are built.
 *
 * ⚠ RT path: two vDSO clock reads per phase, ~40 ns each — call it 0.5 µs a
 * frame against a 900 µs budget. Always-on for the same reason the slot timers
 * are: a stall you have to redeploy to observe is a stall you will not catch. */
#define MIX_PHASE_HEAD        0   /* setup, link-audio read, jack mix           */
#define MIX_PHASE_LA_REBUILD  1   /* the zero-and-rebuild-from-Link-Audio path  */
#define MIX_PHASE_CHAIN_FX    2   /* per-slot chain FX (non-rebuild)            */
#define MIX_PHASE_SEND_FX     3   /* send FX buses + returns                    */
#define MIX_PHASE_ODSP_FX     4   /* overtake DSP FX                            */
#define MIX_PHASE_MFX         5   /* master FX chain                            */
#define MIX_PHASE_MID         6   /* publisher write, me_unity view, ME->mailbox */
#define MIX_PHASE_TAIL        7   /* unity_view for capture, master vol, spkr EQ */
#define MIX_PHASE_COUNT       8
static uint64_t spi_mix_phase_max[MIX_PHASE_COUNT];
static const char *const spi_mix_phase_name[MIX_PHASE_COUNT] = {
    "head", "la_rebuild", "chain_fx", "send_fx", "odsp_fx", "mfx", "mid", "tail"
};
/* ⚠ ONE shared pair, declared at the top of the function — NOT per call site.
 * All six BEGINs sit at the same block scope, so a declaration inside the macro
 * would redeclare _mp0 six times in one scope and fail to compile. The phases
 * are strictly sequential and never nested, so sharing is safe; if one is ever
 * nested inside another, this breaks silently and needs per-phase names. */
#define MIX_PHASE_BEGIN()                                                      \
    clock_gettime(CLOCK_MONOTONIC, &_mp0)
#define MIX_PHASE_END(idx)                                                     \
    do {                                                                       \
        clock_gettime(CLOCK_MONOTONIC, &_mp1);                                 \
        /* ⚠ NOT computed inline: casting the nsec difference to unsigned BEFORE
         * dividing wraps a second-boundary crossing to ~1.8e16, and these are
         * MAX trackers, so one hit poisons the whole 5 s window. Seen live.
         * See timespec_delta.h. */                                            \
        uint64_t _us = timespec_delta_us(&_mp0, &_mp1);                        \
        if (_us > spi_mix_phase_max[idx]) spi_mix_phase_max[idx] = _us;        \
    } while (0)

static void shadow_inprocess_mix_from_buffer(void) {
    struct timespec _mp0, _mp1;   /* the shared pair MIX_PHASE_BEGIN/END use */
    (void)_mp1;
    if (!shadow_inprocess_ready || !global_mmap_addr) return;
    if (!shadow_deferred_dsp_valid) return;  /* No buffer to mix yet */

    /* Fast path: nothing active. Leave Move's mailbox untouched. Snapshot the
     * Move component so any bridge query sees a coherent state, then return. */
    int any_slot = 0;
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        if (shadow_chain_slots[s].instance) { any_slot = 1; break; }
    }
    int any_mfx = 0;
    for (int fx = 0; fx < MASTER_FX_SLOTS; fx++) {
        if (shadow_master_fx_slots[fx].instance) { any_mfx = 1; break; }
    }
    int any_overtake_dsp = (overtake_dsp_fx && overtake_dsp_fx_inst);
    int any_la_rebuild = (link_audio.enabled && link_audio_routing_enabled &&
                         shadow_chain_process_fx && shim_move_channel_count() >= 4);
    int any_capture = (sampler_source == SAMPLER_SOURCE_RESAMPLE);
    int any_send_fx = (shadow_send_fx_bus_active(0) || shadow_send_fx_bus_active(1));

    if (!any_slot && !any_mfx && !any_overtake_dsp && !any_la_rebuild && !any_capture && !any_send_fx) {
        int16_t *mailbox_audio = (int16_t *)(global_mmap_addr + AUDIO_OUT_OFFSET);
        memcpy(native_bridge_move_component, mailbox_audio, AUDIO_BUFFER_SIZE);
        memset(native_bridge_me_component, 0, AUDIO_BUFFER_SIZE);
        native_bridge_capture_mv = shadow_master_volume;
        native_bridge_split_valid = 1;
        return;
    }

    int16_t *mailbox_audio = (int16_t *)(global_mmap_addr + AUDIO_OUT_OFFSET);
    float mv = shadow_master_volume;
    (void)shadow_master_fx_chain_active();  /* MFX slots processed unconditionally below */
    MIX_PHASE_BEGIN();
    /* Always build the mix at unity level so sampler/skipback capture audio
     * at full gain (independent of master volume).  Apply mv at the end. */

    /* Save Move's audio for bridge split (before zeroing) */
    memcpy(native_bridge_move_component, mailbox_audio, AUDIO_BUFFER_SIZE);

    /* Accumulate ME output across slots for bridge split component */
    int32_t me_full[FRAMES_PER_BLOCK * 2];
    memset(me_full, 0, sizeof(me_full));
    /* ME-only unity bus: sum of slot synths + slot FX + overtake DSP, full-gain,
     * before Master FX and master volume. Task 3 populates this alongside
     * me_full without reading it; Task 4 will consume it. */
    int32_t me_unity[FRAMES_PER_BLOCK * 2];
    memset(me_unity, 0, sizeof(me_unity));

    /* Send bus accumulators — post-fader taps summed across all slots */
    int32_t send_accum[SEND_BUS_COUNT][FRAMES_PER_BLOCK * 2];
    memset(send_accum, 0, sizeof(send_accum));

    /* Zero-and-rebuild approach: if Link Audio provides per-track data,
     * zero the mailbox and rebuild from Link Audio, applying FX per-slot.
     * This completely eliminates dry signal leakage — no subtraction needed.
     *
     * IMPORTANT: Only rebuild when audio data is actually flowing.
     * Session announcements set move_channel_count but don't mean audio
     * is streaming.  Without a subscriber triggering ChannelRequests,
     * the ring buffers are empty and zeroing the mailbox kills all audio. */
    /* Link Audio is active once at least one slot in /schwung-link-in has
     * received a buffer (sidecar sets `active` on first write). */
    int la_receiving = 0;
    if (shadow_in_audio_shm) {
        for (int i = 0; i < LINK_AUDIO_IN_SLOT_COUNT; i++) {
            if (shadow_in_audio_shm->slots[i].active) { la_receiving = 1; break; }
        }
    }

    int rebuild_from_la = (link_audio.enabled && link_audio_routing_enabled &&
                           shadow_chain_process_fx &&
                           shim_move_channel_count() >= 4 &&
                           la_receiving);

    /* Path-flip telemetry + 0→1 drain. Every flip between rebuild and
     * passthrough is a potential seam, because the two paths composite the
     * mailbox differently. Worse: during passthrough nobody reads
     * /schwung-link-in, but the sidecar keeps writing, so a 0→1 flip
     * finds a stale backlog that trips catch-up and drops a long chunk of
     * audio. Snap read_pos = write_pos per slot on 0→1 so the first
     * rebuild frame starts clean. Single-writer (SPI path), single-reader
     * (logger thread) for the counter. */
    extern volatile uint32_t shim_la_rebuild_flip_count;
    {
        static int rebuild_prev = -1;
        int prev_in_rebuild = (rebuild_prev == 1);
        int entering_rebuild = (!prev_in_rebuild && rebuild_from_la);
        int leaving_rebuild  = (prev_in_rebuild && !rebuild_from_la);
        /* Only count real 0↔1 flips, not the startup-seed transition from
         * uninitialized (-1) to current value. */
        if (rebuild_prev >= 0 && (entering_rebuild || leaving_rebuild)) {
            shim_la_rebuild_flip_count++;
        }
        /* Snap read_pos = write_pos on any entry into rebuild mode,
         * including startup-with-rebuild-already-true. try_attach_in_audio_shm()
         * drains on attach, but a subscriber-write burst between attach and
         * the first rebuild frame can leave a stale backlog that lands under
         * the 70 ms catch-up threshold and leaves one slot permanently
         * offset — audible as pitch/sample-rate drift on that track. */
        if (entering_rebuild && shadow_in_audio_shm) {
            /* Acquire/release pair against sidecar write_pos updates
             * so ring writes are visible before we publish read_pos. */
            for (int s = 0; s < LINK_AUDIO_IN_SLOT_COUNT; s++) {
                uint32_t wp = __atomic_load_n(
                    &shadow_in_audio_shm->slots[s].write_pos,
                    __ATOMIC_ACQUIRE);
                __atomic_store_n(
                    &shadow_in_audio_shm->slots[s].read_pos,
                    wp, __ATOMIC_RELEASE);
            }
        }
        /* Latency comp re-engage policy: latch the user toggle into the
         * active flag only on a clean 0→1 rebuild entry. Toggling mid-
         * playback would either punch a 9 ms hole (OFF→ON) or produce
         * a 9 ms duplicate (ON→OFF) in Schwung audio. Also clear the
         * Schwung-side delay ring so the first frame starts clean. */
        if (entering_rebuild && latency_comp_active != latency_comp_user_enabled) {
            latency_comp_active = latency_comp_user_enabled;
            link_audio_reset_nudge_state();
            extern void shadow_latency_delay_reset(void);
            shadow_latency_delay_reset();
            {
                char msg[80];
                snprintf(msg, sizeof(msg),
                    "Latency Comp: now %s on Move>Schwung engage",
                    latency_comp_active ? "ACTIVE" : "BYPASSED");
                shadow_log(msg);
            }
        }
        /* On leaving rebuild, deactivate so the delay buffer can't add
         * latency to a path that doesn't need it. */
        if (leaving_rebuild && latency_comp_active) {
            latency_comp_active = 0;
            extern void shadow_latency_delay_reset(void);
            shadow_latency_delay_reset();
        }
        rebuild_prev = rebuild_from_la;
    }

    /* Mix JACK/RNBO audio at mv level to match Move's attenuated audio.
     * Both sources then prescale to unity together, go through master FX,
     * and get captured by skipback/sampler at the same consistent level. */
    {
        const int16_t *jack_audio = schwung_jack_bridge_read_audio(g_jack_shm);
        if (jack_audio) {
            for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                int32_t scaled_jack = (int32_t)lroundf((float)jack_audio[i] * mv);
                int32_t mixed = (int32_t)mailbox_audio[i] + scaled_jack;
                if (mixed > 32767) mixed = 32767;
                if (mixed < -32768) mixed = -32768;
                mailbox_audio[i] = (int16_t)mixed;
            }
        }
    }

    /* Cache Link Audio reads to avoid redundant ring buffer access + barriers */
    int16_t la_cache[SHADOW_CHAIN_INSTANCES][FRAMES_PER_BLOCK * 2];
    int la_cache_valid[SHADOW_CHAIN_INSTANCES];
    memset(la_cache_valid, 0, sizeof(la_cache_valid));

    MIX_PHASE_END(MIX_PHASE_HEAD);

    MIX_PHASE_BEGIN();
    if (rebuild_from_la) {
        /* Read all Link Audio channels FIRST so we can decide whether to
         * actually rebuild. If every slot starves (e.g. during a Move set
         * transition when the audio engine briefly stops publishing), zeroing
         * the mailbox would produce total silence. In that case fall through
         * to the legacy non-rebuild path so Move's native audio (already in
         * the mailbox from Move's own write) survives. */
        int la_channel_count = shim_move_channel_count();
        int any_la_valid = 0;
        /* ⚠ Bounded by MOVE_TRACK_CHANNELS, not by the chain-slot count.
         *
         * These two were the same number while both were 4, and the identity
         * was a coincidence: `s` here is a CHAIN SLOT, but the index handed to
         * the reader addresses a MOVE TRACK in the sidecar's `in` segment. That
         * segment has five slots and **index 4 is Move's MAIN MIX**, so once the
         * chain count passes 4, chain slot 4 would read the entire Move main mix
         * and treat it as its own per-track return — the whole mix re-entering
         * the rebuild through one slot. Slots 5+ are merely rejected by the
         * reader's bounds check; slot 4 is the one that silently sounds wrong.
         *
         * Move has four instrument tracks and that is a hardware fact, so the
         * bound belongs to Move's side of the seam and stays 4 while the chain
         * count grows. */
        for (int s = 0; s < SHADOW_CHAIN_INSTANCES && s < MOVE_TRACK_CHANNELS &&
                        s < la_channel_count; s++) {
            la_cache_valid[s] = shim_read_move_channel(s, la_cache[s], FRAMES_PER_BLOCK);
            if (la_cache_valid[s]) any_la_valid = 1;
        }
        if (!any_la_valid) {
            /* SHM is empty across all slots — sidecar isn't producing fast
             * enough this frame. Skip the rebuild; treat this frame like
             * the non-rebuild path so we don't drop into silence. */
            extern volatile uint32_t shim_la_starve_fallback_count;
            shim_la_starve_fallback_count++;
            rebuild_from_la = 0;
            goto skip_la_rebuild;
        }

        /* Zero the mailbox — all audio reconstructed from Link Audio */
        memset(mailbox_audio, 0, FRAMES_PER_BLOCK * 2 * sizeof(int16_t));


        for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
            int16_t *move_track = la_cache[s];
            int have_move_track = la_cache_valid[s];

            /* A Move track ALWAYS goes to its own Move FX bus now. The old
             * per-slot "Move>Slot" switch — sum the track into this slot's
             * synth chain instead — is retired: a slot is one thing or the
             * other, a Move instrument bus or a Schwung chain, never both.
             * ⚠ This is an audible change for a slot that had BOTH a synth and
             * a Move track: the Move audio no longer passes through the synth's
             * FX chain, it runs its own inserts. That is the point of the
             * model, and Move>Slot's own 4 inserts cover the effects case. */

            int slot_active = (shadow_chain_slots[s].active &&
                               shadow_chain_slots[s].instance &&
                               shadow_slot_deferred_valid[s]);

            /* Move FX bus: the channel's Move track runs through its own
             * ≤MOVE_FX_BLOCKS insert FX chain (independent of any synth on this
             * channel), then mixes to the master at the strip's volume and taps
             * the global Send A/B buses. Runs regardless of whether a synth is
             * loaded on the slot, and BEFORE the synth block so the synth's
             * idle-continue below can't skip it. Mixing is additive, so order
             * doesn't change the sum. */
            /* Idle gate: the input is checked EVERY block (cheap — one scan, no
             * plugin calls) so the bus wakes the instant Move audio returns. It
             * sleeps only once the input has been silent AND the inserts have
             * decayed to silence, so a reverb/delay tail still rings out. */
            int move_in_silent = 1;
            if (have_move_track && s < MOVE_FX_SLOTS) {
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    if (move_track[i] > DSP_SILENCE_LEVEL ||
                        move_track[i] < -DSP_SILENCE_LEVEL) { move_in_silent = 0; break; }
                }
            }
            if (have_move_track && s < MOVE_FX_SLOTS &&
                !(move_in_silent && shadow_move_fx_idle[s])) {
                /* Skip the copy + FX loop entirely when no FX is loaded — the
                 * track then mixes straight from la_cache (read-only). */
                const int16_t *msrc = move_track;
                int16_t mbuf[FRAMES_PER_BLOCK * 2];
                if (shadow_move_fx_has_fx(s)) {
                    memcpy(mbuf, move_track, sizeof(mbuf));
                    for (int b = 0; b < MOVE_FX_BLOCKS; b++) {
                        master_fx_slot_t *mf = &shadow_move_fx_slots[s][b];
                        if (!(mf->instance && mf->api && mf->api->process_block)) continue;
                        if (mf->bypassed) continue;
                        mf->api->process_block(mf->instance, mbuf, FRAMES_PER_BLOCK);
                    }
                    msrc = mbuf;
                }
                /* The bus's OWN mixer state — its volume, its mute, and the
                 * shared solo group. Deliberately not the synth slot's mute at
                 * the same index: the two are alternative occupants of one
                 * mixer position, so a bus follows only itself. Solo is shared
                 * because a solo that left the other family sounding would not
                 * be a solo. */
                float mvol = shadow_move_fx_effective_volume(s);
                float bus_pan_l = shadow_pan_gain_l(shadow_move_fx_strip[s].pan);
                float bus_pan_r = shadow_pan_gain_r(shadow_move_fx_strip[s].pan);
                /* Publish this bus as the slot's ME channel when no synth owns
                 * the slot's ring. The retired "inactive slot, Move>Slot on"
                 * branch below used to do this and would otherwise take the
                 * publish with it; an active slot still publishes its own
                 * post-FX output further down, and two writers on one ring
                 * would interleave garbage. Content is post-insert and
                 * post-strip-volume, matching what a synth slot publishes
                 * (fx_buf × effective volume) rather than the raw track the old
                 * branch wrote. */
                int publish_bus = (!slot_active && s < LINK_AUDIO_SHADOW_CHANNELS &&
                                   shadow_pub_audio_shm);
                link_audio_pub_slot_t *bus_ps = publish_bus
                    ? &shadow_pub_audio_shm->slots[s] : NULL;
                uint32_t bus_wp = bus_ps ? bus_ps->write_pos : 0;
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    float pg = (i & 1) ? bus_pan_r : bus_pan_l;
                    int32_t scaled = (int32_t)lroundf((float)msrc[i] * mvol * pg);
                    int32_t mixed = (int32_t)mailbox_audio[i] + scaled;
                    if (mixed > 32767) mixed = 32767;
                    if (mixed < -32768) mixed = -32768;
                    mailbox_audio[i] = (int16_t)mixed;
                    me_full[i]  += scaled;
                    me_unity[i] += scaled;
                    if (bus_ps) {
                        int32_t c = scaled;
                        if (c > 32767) c = 32767;
                        if (c < -32768) c = -32768;
                        bus_ps->ring[bus_wp & LINK_AUDIO_PUB_SHM_RING_MASK] = (int16_t)c;
                        bus_wp++;
                    }
                }
                if (bus_ps) {
                    __sync_synchronize();
                    bus_ps->write_pos = bus_wp;
                }
                accumulate_sends_ex(msrc, mvol, shadow_move_fx_strip[s].send_a,
                                    shadow_move_fx_strip[s].send_b, send_accum);

                /* Sleep only when the POST-insert signal is silent too, so a
                 * tail is never cut. With no FX loaded msrc aliases the input,
                 * so this collapses to "input silent" — which is what we want. */
                int move_out_silent = 1;
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    if (msrc[i] > DSP_SILENCE_LEVEL ||
                        msrc[i] < -DSP_SILENCE_LEVEL) { move_out_silent = 0; break; }
                }
                if (move_in_silent && move_out_silent) {
                    if (++shadow_move_fx_silence_frames[s] >= DSP_IDLE_THRESHOLD)
                        shadow_move_fx_idle[s] = 1;
                } else {
                    shadow_move_fx_silence_frames[s] = 0;
                    shadow_move_fx_idle[s] = 0;
                }
            }

            if (slot_active) {
                /* Phase 2 idle gate: skip FX when synth AND FX output are silent.
                 * The Link Audio term that used to qualify this is gone with
                 * Move>Slot — a Move track is always peeled to its own bus
                 * (handled above), so it never gives the synth chain work. */
                if (shadow_slot_fx_idle[s] && shadow_slot_idle[s]) continue;

                /* Latency comp: delay the local synth output to match the
                 * Link Audio path before combining. The nudge in
                 * link_audio_read_channel_shm keeps the Move side stable
                 * at LATENCY_COMP_TARGET_SAMPLES; delaying the synth by
                 * the same amount aligns both into the FX chain. */
                const int16_t *synth_src = shadow_slot_deferred[s];
                int16_t synth_delayed[FRAMES_PER_BLOCK * 2];
                if (latency_comp_active) {
                    shadow_latency_delay_apply(s, shadow_slot_deferred[s],
                                               synth_delayed,
                                               LATENCY_COMP_TARGET_SAMPLES);
                    synth_src = synth_delayed;
                }

                /* Latency alignment dump (slot 0 only). Touch
                 * /data/UserData/schwung/align_dump_trigger to arm;
                 * captures 300 blocks (~870 ms) of:
                 *   slot0_move_track.pcm  — Move Link Audio (post-nudge)
                 *   slot0_synth_src.pcm   — Schwung synth (post-delay if
                 *                            comp active)
                 * Both s16le stereo @44.1k. Cross-correlate them to
                 * measure the actual sample offset between Move and
                 * Schwung audio paths. */
                if (s == 0) {
                    static FILE *align_move_f  = NULL;
                    static FILE *align_synth_f = NULL;
                    static int align_dump_frames = 0;
                    if (align_dump_frames == 0 &&
                        shim_debug_flag_consume(SHIM_FLAG_ALIGN_DUMP)) {
                        /* Worker already unlinked the trigger file. */
                        align_move_f = fopen(
                            SCHWUNG_INSTALL_DIR "/slot0_move_track.pcm", "wb");
                        align_synth_f = fopen(
                            SCHWUNG_INSTALL_DIR "/slot0_synth_src.pcm", "wb");
                        align_dump_frames = 1000;  /* ~2.9 s */
                    }
                    if (align_dump_frames > 0) {
                        if (align_move_f && have_move_track) {
                            fwrite(move_track, sizeof(int16_t),
                                   FRAMES_PER_BLOCK * 2, align_move_f);
                        }
                        if (align_synth_f) {
                            fwrite(synth_src, sizeof(int16_t),
                                   FRAMES_PER_BLOCK * 2, align_synth_f);
                        }
                        align_dump_frames--;
                        if (align_dump_frames == 0) {
                            if (align_move_f)  { fclose(align_move_f);  align_move_f = NULL; }
                            if (align_synth_f) { fclose(align_synth_f); align_synth_f = NULL; }
                        }
                    }
                }

                /* Active slot: run the synth through its FX. The Move track is
                 * NOT summed in — it goes through its own Move FX bus above.
                 * (Move>Slot, which used to sum it here, is retired.) */
                int16_t fx_buf[FRAMES_PER_BLOCK * 2];
                /* Sound-generator level, applied to the synth ALONE and BEFORE
                 * anything is summed in. The slot's own volume is a bus fader
                 * applied after the FX, so it scales a routed Move track too and
                 * cannot balance the two sources against each other. Post-FX the
                 * signals are inseparable (a reverb tail doesn't remember its
                 * source), so pre-sum is the only place this can work. Unity by
                 * default — nothing changes until a UI drives it.
                 *
                 * Applied inline here rather than via shadow_apply_synth_level()
                 * because this path scales while copying and summing the routed
                 * track in one pass. The other two render paths call the helper;
                 * ⚠ all three must stay in sync, or the level works on some
                 * paths and silently does nothing on the rest. */
                const float synth_vol = shadow_chain_slots[s].synth_volume;
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    int32_t combined = (synth_vol == 1.0f)
                        ? (int32_t)synth_src[i]
                        : (int32_t)lroundf((float)synth_src[i] * synth_vol);
                    if (combined > 32767) combined = 32767;
                    if (combined < -32768) combined = -32768;
                    fx_buf[i] = (int16_t)combined;
                }

                /* Main-mix dump (rebuild_from_la path). Gated on
                 * /data/UserData/schwung/main_fx_dump_trigger — touch to arm.
                 * Dumps slot<s>_main_pre_fx.pcm + slot<s>_main_post_fx.pcm. */
                {
                    static FILE *mpre_f[SHADOW_CHAIN_INSTANCES] = {0};
                    static FILE *mpost_f[SHADOW_CHAIN_INSTANCES] = {0};
                    static int main_dump_frames = 0;
                    if (main_dump_frames > 0) {
                        if (mpre_f[s])
                            fwrite(fx_buf, sizeof(int16_t),
                                   FRAMES_PER_BLOCK * 2, mpre_f[s]);
                    }
                    /* Arm check only on slot==0 to avoid redundant work. */
                    if (s == 0 && main_dump_frames == 0 &&
                        shim_debug_flag_consume(SHIM_FLAG_MAIN_FX_DUMP)) {
                        for (int t = 0; t < SHADOW_CHAIN_INSTANCES; t++) {
                            char p[96];
                            snprintf(p, sizeof(p),
                                SCHWUNG_INSTALL_DIR "/slot%d_main_pre_fx.pcm", t);
                            mpre_f[t] = fopen(p, "wb");
                            snprintf(p, sizeof(p),
                                SCHWUNG_INSTALL_DIR "/slot%d_main_post_fx.pcm", t);
                            mpost_f[t] = fopen(p, "wb");
                        }
                        main_dump_frames = 100;
                        /* Record this frame too */
                        if (mpre_f[s])
                            fwrite(fx_buf, sizeof(int16_t),
                                   FRAMES_PER_BLOCK * 2, mpre_f[s]);
                    }

                    /* Run FX chain.
                     * ⚠⚠ TIMED, and it must stay timed: this is the call
                     * `Slot fx max` reports for, and for a Link-Audio session
                     * it is the ONLY one that runs. The deferred site (~line
                     * 1925) was timed from the start, but `skip_deferred_fx`
                     * above it skips that path whenever Link Audio is routing
                     * a live slot — the normal case once Move tracks are in
                     * play — so the counter read ZERO for a chain burning most
                     * of a core, and that zero was taken as "the modules were
                     * idle" in two separate investigations (2026-08-25/26).
                     * The cost did not vanish; it was inside the la_rebuild
                     * mix phase, which is the very phase those investigations
                     * were trying to explain. See timespec_delta.h for why the
                     * subtraction is not spelled inline. */
                    struct timespec mfx_t0, mfx_t1;
                    clock_gettime(CLOCK_MONOTONIC, &mfx_t0);
                    shadow_chain_process_fx(shadow_chain_slots[s].instance,
                                            fx_buf, MOVE_FRAMES_PER_BLOCK);
                    clock_gettime(CLOCK_MONOTONIC, &mfx_t1);
                    {
                        uint64_t mfx_us = timespec_delta_us(&mfx_t0, &mfx_t1);
                        if (mfx_us > spi_slot_fx_max[s]) spi_slot_fx_max[s] = mfx_us;
                    }

                    if (main_dump_frames > 0) {
                        if (mpost_f[s])
                            fwrite(fx_buf, sizeof(int16_t),
                                   FRAMES_PER_BLOCK * 2, mpost_f[s]);
                        /* Decrement once per frame (at slot 0) */
                        if (s == SHADOW_CHAIN_INSTANCES - 1) {
                            main_dump_frames--;
                            if (main_dump_frames == 0) {
                                for (int t = 0; t < SHADOW_CHAIN_INSTANCES; t++) {
                                    if (mpre_f[t])  { fclose(mpre_f[t]);  mpre_f[t] = NULL; }
                                    if (mpost_f[t]) { fclose(mpost_f[t]); mpost_f[t] = NULL; }
                                }
                            }
                        }
                    }
                }

                /* Track FX output silence for phase 2 idle */
                int fx_silent = 1;
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    if (fx_buf[i] > DSP_SILENCE_LEVEL || fx_buf[i] < -DSP_SILENCE_LEVEL) {
                        fx_silent = 0;
                        break;
                    }
                }
                if (fx_silent) {
                    shadow_slot_fx_silence_frames[s]++;
                    if (shadow_slot_fx_silence_frames[s] >= DSP_IDLE_THRESHOLD) {
                        shadow_slot_fx_idle[s] = 1;
                    }
                } else {
                    shadow_slot_fx_silence_frames[s] = 0;
                    shadow_slot_fx_idle[s] = 0;
                }

                /* Capture for Link Audio publisher */
                if (s < LINK_AUDIO_SHADOW_CHANNELS) {
                    float cap_vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++)
                        shadow_slot_capture[s][i] = (int16_t)lroundf((float)fx_buf[i] * cap_vol);
                    /* Write to publisher shared memory for link_subscriber */
                    if (shadow_pub_audio_shm) {
                        link_audio_pub_slot_t *ps = &shadow_pub_audio_shm->slots[s];
                        uint32_t wp = ps->write_pos;
                        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                            ps->ring[wp & LINK_AUDIO_PUB_SHM_RING_MASK] = shadow_slot_capture[s][i];
                            wp++;
                        }
                        __sync_synchronize();
                        ps->write_pos = wp;
                    }
                }

                /* Add FX output to mailbox */
                float slot_pan_l = shadow_pan_gain_l(shadow_chain_slots[s].pan);
                float slot_pan_r = shadow_pan_gain_r(shadow_chain_slots[s].pan);
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    float vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    float pg = (i & 1) ? slot_pan_r : slot_pan_l;
                    int32_t mixed = (int32_t)mailbox_audio[i] + (int32_t)lroundf((float)fx_buf[i] * vol * pg);
                    if (mixed > 32767) mixed = 32767;
                    if (mixed < -32768) mixed = -32768;
                    mailbox_audio[i] = (int16_t)mixed;
                    me_full[i] += (int32_t)lroundf((float)fx_buf[i] * vol * pg);
                    me_unity[i] += (int32_t)lroundf((float)fx_buf[i] * vol * pg);
                    if (i & 1) shadow_fade_advance(s);
                }
                accumulate_sends(s, fx_buf, send_accum);
            }
            /* (The old "inactive slot, Move>Slot on: pass Link Audio through at
             * unity" branch lived here. With Move>Slot retired the Move FX bus
             * above owns that audio unconditionally — and at the strip's volume
             * rather than forced unity, so the bus fader finally applies. Its ME
             * publish moved up there too; see the note at the bus mix loop.) */
        }

    }
    MIX_PHASE_END(MIX_PHASE_LA_REBUILD);
skip_la_rebuild:
    MIX_PHASE_BEGIN();
    if (!rebuild_from_la && shadow_chain_process_fx) {
        /* No Link Audio — use deferred FX output from post-ioctl (fast path) */
        for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
            if (!shadow_chain_slots[s].instance) continue;

            /* Use deferred FX output if available (FX ran in post-ioctl) */
            if (shadow_slot_fx_deferred_valid[s]) {
                if (shadow_slot_fx_idle[s] && shadow_slot_idle[s]) continue;

                int16_t *fx_buf = shadow_slot_fx_deferred[s];

                /* Write to publisher shared memory for link_subscriber */
                if (link_audio.enabled && s < LINK_AUDIO_SHADOW_CHANNELS && shadow_pub_audio_shm) {
                    float cap_vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    link_audio_pub_slot_t *ps = &shadow_pub_audio_shm->slots[s];
                    uint32_t wp = ps->write_pos;
                    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                        ps->ring[wp & LINK_AUDIO_PUB_SHM_RING_MASK] =
                            (int16_t)lroundf((float)fx_buf[i] * cap_vol);
                        wp++;
                    }
                    __sync_synchronize();
                    ps->write_pos = wp;
                }

                float spn_l = shadow_pan_gain_l(shadow_chain_slots[s].pan);
                float spn_r = shadow_pan_gain_r(shadow_chain_slots[s].pan);
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    float vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    float pg = (i & 1) ? spn_r : spn_l;
                    int32_t contrib = (int32_t)lroundf((float)fx_buf[i] * vol * pg);
                    me_full[i] += contrib;
                    me_unity[i] += contrib;
                    if (i & 1) shadow_fade_advance(s);
                }
                accumulate_sends(s, fx_buf, send_accum);
            } else if (shadow_slot_deferred_valid[s]) {
                /* Fallback: FX not deferred — run inline (legacy path) */
                if (shadow_slot_fx_idle[s] && shadow_slot_idle[s]) continue;

                int16_t fx_buf[FRAMES_PER_BLOCK * 2];
                memcpy(fx_buf, shadow_slot_deferred[s], sizeof(fx_buf));
                shadow_apply_synth_level(s, fx_buf);
                /* Timed for the same reason as the other two sites: an FX path
                 * that does not feed `Slot fx max` reports zero cost however
                 * expensive it is. Rare (it needs same_frame_fx to be off), but
                 * "rare" is exactly when an untimed path is most misleading. */
                struct timespec lfx_t0, lfx_t1;
                clock_gettime(CLOCK_MONOTONIC, &lfx_t0);
                shadow_chain_process_fx(shadow_chain_slots[s].instance,
                                        fx_buf, MOVE_FRAMES_PER_BLOCK);
                clock_gettime(CLOCK_MONOTONIC, &lfx_t1);
                {
                    uint64_t lfx_us = timespec_delta_us(&lfx_t0, &lfx_t1);
                    if (lfx_us > spi_slot_fx_max[s]) spi_slot_fx_max[s] = lfx_us;
                }

                if (link_audio.enabled && s < LINK_AUDIO_SHADOW_CHANNELS && shadow_pub_audio_shm) {
                    float cap_vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    link_audio_pub_slot_t *ps = &shadow_pub_audio_shm->slots[s];
                    uint32_t wp = ps->write_pos;
                    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                        ps->ring[wp & LINK_AUDIO_PUB_SHM_RING_MASK] =
                            (int16_t)lroundf((float)fx_buf[i] * cap_vol);
                        wp++;
                    }
                    __sync_synchronize();
                    ps->write_pos = wp;
                }

                int fx_silent = 1;
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    if (fx_buf[i] > DSP_SILENCE_LEVEL || fx_buf[i] < -DSP_SILENCE_LEVEL) {
                        fx_silent = 0;
                        break;
                    }
                }
                if (fx_silent) {
                    shadow_slot_fx_silence_frames[s]++;
                    if (shadow_slot_fx_silence_frames[s] >= DSP_IDLE_THRESHOLD)
                        shadow_slot_fx_idle[s] = 1;
                } else {
                    shadow_slot_fx_silence_frames[s] = 0;
                    shadow_slot_fx_idle[s] = 0;
                }

                float fpn_l = shadow_pan_gain_l(shadow_chain_slots[s].pan);
                float fpn_r = shadow_pan_gain_r(shadow_chain_slots[s].pan);
                for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                    float vol = shadow_effective_volume(s) * shadow_chain_slots[s].fade.gain;
                    float pg = (i & 1) ? fpn_r : fpn_l;
                    int32_t contrib = (int32_t)lroundf((float)fx_buf[i] * vol * pg);
                    me_full[i] += contrib;
                    me_unity[i] += contrib;
                    if (i & 1) shadow_fade_advance(s);
                }
                accumulate_sends(s, fx_buf, send_accum);
            }
        }
    }
    MIX_PHASE_END(MIX_PHASE_CHAIN_FX);

    MIX_PHASE_BEGIN();
    /* Process send FX buses and sum returns into ME bus (before Master FX) */
    for (int b = 0; b < SEND_BUS_COUNT; b++) {
        if (!shadow_send_fx_bus_active(b)) continue;

        int16_t send_buf[FRAMES_PER_BLOCK * 2];
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            int32_t v = send_accum[b][i];
            if (v > 32767) v = 32767;
            if (v < -32768) v = -32768;
            send_buf[i] = (int16_t)v;
        }

        for (int fx = 0; fx < SEND_FX_SLOTS; fx++) {
            master_fx_slot_t *sf = &shadow_send_fx_slots[b][fx];
            if (!(sf->instance && sf->api && sf->api->process_block)) continue;
            if (sf->bypassed) continue;
            sf->api->process_block(sf->instance, send_buf, FRAMES_PER_BLOCK);
        }

        /* Per-bus return level scales the FX-processed return into the mix. */
        float rl = shadow_send_return_level[b];
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            int32_t sv = (int32_t)lroundf((float)send_buf[i] * rl);
            me_full[i] += sv;
            me_unity[i] += sv;
        }
        if (rebuild_from_la) {
            for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                int32_t sv = (int32_t)lroundf((float)send_buf[i] * rl);
                int32_t mixed = (int32_t)mailbox_audio[i] + sv;
                if (mixed > 32767) mixed = 32767;
                if (mixed < -32768) mixed = -32768;
                mailbox_audio[i] = (int16_t)mixed;
            }
        }

        /* Send A -> Send B (post-fader): tap A's return-scaled output into B's
         * accumulator, so A->B follows A's return level (like Ableton return-track
         * sends). Bus order (A=0 then B=1) is feedback-safe: B is built/processed
         * after this and A is already done, so B can never reach back into A. */
        if (b == 0 && shadow_send_a_to_b_level > 0.0f) {
            for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
                send_accum[1][i] += (int32_t)lroundf((float)send_buf[i] * rl * shadow_send_a_to_b_level);
            }
        }
    }
    MIX_PHASE_END(MIX_PHASE_SEND_FX);

    MIX_PHASE_BEGIN();

    /* Mix overtake DSP buffer into ME bus unconditionally. Under rebuild_from_la,
     * the mailbox is already the ME reconstruction and also needs overtake DSP;
     * under non-rebuild, the mailbox is Move-only and overtake DSP stays in ME. */
    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
        me_full[i] += (int32_t)shadow_deferred_dsp_buffer[i];
        me_unity[i] += (int32_t)shadow_deferred_dsp_buffer[i];
    }
    if (rebuild_from_la) {
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            int32_t mixed = (int32_t)mailbox_audio[i] + (int32_t)shadow_deferred_dsp_buffer[i];
            if (mixed > 32767) mixed = 32767;
            if (mixed < -32768) mixed = -32768;
            mailbox_audio[i] = (int16_t)mixed;
        }
    }

    /* Save ME full-gain component for bridge split */
    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
        if (me_full[i] > 32767) me_full[i] = 32767;
        if (me_full[i] < -32768) me_full[i] = -32768;
        native_bridge_me_component[i] = (int16_t)me_full[i];
    }
    native_bridge_capture_mv = mv;
    native_bridge_split_valid = 1;

    /* Write master mix to publisher shm (slot index LINK_AUDIO_PUB_MASTER_IDX) */
    if (link_audio.enabled && shadow_pub_audio_shm) {
        link_audio_pub_slot_t *ps = &shadow_pub_audio_shm->slots[LINK_AUDIO_PUB_MASTER_IDX];
        uint32_t wp = ps->write_pos;
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            ps->ring[wp & LINK_AUDIO_PUB_SHM_RING_MASK] = native_bridge_me_component[i];
            wp++;
        }
        __sync_synchronize();
        ps->write_pos = wp;
    }

    /* Build int16 view of me_unity for FX plugins (MFX, overtake DSP FX).
     * Under rebuild_from_la, mailbox is already the ME reconstruction and FX
     * run on mailbox directly (preserving existing behavior — Task 8 revisits). */
    int16_t me_unity_i16[FRAMES_PER_BLOCK * 2];
    if (!rebuild_from_la) {
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            int32_t v = me_unity[i];
            if (v > 32767) v = 32767;
            if (v < -32768) v = -32768;
            me_unity_i16[i] = (int16_t)v;
        }
    }
    int16_t *fx_target = rebuild_from_la ? mailbox_audio : me_unity_i16;

    /* Overtake DSP FX: process ME bus (non-rebuild) or reconstructed mailbox (rebuild_from_la) */
    MIX_PHASE_END(MIX_PHASE_MID);

    MIX_PHASE_BEGIN();
    if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->process_block) {
        overtake_dsp_fx->process_block(overtake_dsp_fx_inst, fx_target, FRAMES_PER_BLOCK);
    }
    MIX_PHASE_END(MIX_PHASE_ODSP_FX);

    MIX_PHASE_BEGIN();
    /* Apply master FX chain. Under non-rebuild, MFX processes ME only; under
     * rebuild_from_la, mailbox contains reconstructed ME tracks and MFX
     * processes mailbox (Task 8 revisits). */
    for (int fx = 0; fx < MASTER_FX_SLOTS; fx++) {
        master_fx_slot_t *s = &shadow_master_fx_slots[fx];
        if (!(s->instance && s->api && s->api->process_block)) continue;
        int16_t mfx_dry[FRAMES_PER_BLOCK * 2];
        if (s->bypassed) {
            memcpy(mfx_dry, fx_target, FRAMES_PER_BLOCK * 2 * sizeof(int16_t));
        }
        s->api->process_block(s->instance, fx_target, FRAMES_PER_BLOCK);
        if (s->bypassed) {
            memcpy(fx_target, mfx_dry, FRAMES_PER_BLOCK * 2 * sizeof(int16_t));
        }
    }
    MIX_PHASE_END(MIX_PHASE_MFX);

    MIX_PHASE_BEGIN();

    /* Tick Master FX LFOs after processing so updated params apply next block.
     * This mirrors the legacy in-process mix path behavior. */
    shadow_master_fx_lfo_tick(FRAMES_PER_BLOCK);

    /* Sum ME bus (after FX) into mailbox at master volume level.
     * Move's audio in mailbox is already at mv; ME needs mv applied here.
     * Skipped under rebuild_from_la — that path has already composited into mailbox. */
    if (!rebuild_from_la) {
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            int32_t scaled_me = (int32_t)lroundf((float)me_unity_i16[i] * mv);
            int32_t summed = (int32_t)mailbox_audio[i] + scaled_me;
            if (summed > 32767) summed = 32767;
            if (summed < -32768) summed = -32768;
            mailbox_audio[i] = (int16_t)summed;
        }
    }

    /* Build unity_view for capture consumers (skipback, native bridge, sampler).
     * unity_view = Move at unity + ME post-FX at unity. Independent of master volume
     * so captures are full-gain regardless of the volume knob position. */
    int16_t unity_view[FRAMES_PER_BLOCK * 2];
    if (rebuild_from_la) {
        /* Link Audio rebuild path already composited per-track routed audio into
         * mailbox at unity. Snapshot unity_view BEFORE applying master volume
         * (below) so captures stay at unity. */
        memcpy(unity_view, mailbox_audio, AUDIO_BUFFER_SIZE);
    } else {
        /* Smooth mv for capture only (DAC uses raw mv for instant response).
         * One-pole lowpass at ~30ms tau to ramp over discrete scan steps and
         * avoid brief amplitude glitches in captures during volume sweeps. */
        static float mv_capture_smoothed = 1.0f;
        const float alpha = 0.1f;  /* dt=2.9ms, tau≈28ms */
        mv_capture_smoothed += (mv - mv_capture_smoothed) * alpha;
        float inv_mv = (mv_capture_smoothed > 0.001f) ? 1.0f / mv_capture_smoothed : 1.0f;
        if (inv_mv > 50.0f) inv_mv = 50.0f;
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            float move_unity = (float)native_bridge_move_component[i] * inv_mv;
            float summed = move_unity + (float)me_unity_i16[i];
            if (summed > 32767.0f) summed = 32767.0f;
            if (summed < -32768.0f) summed = -32768.0f;
            unity_view[i] = (int16_t)lroundf(summed);
        }
    }

    /* Capture native bridge source AFTER master FX, BEFORE master volume.
     * This bakes master FX into native bridge resampling while keeping
     * capture independent of master-volume attenuation. */
    native_capture_total_mix_snapshot_from_buffer(unity_view);

    /* Under rebuild_from_la, the mailbox was built at unity (per-slot vol only,
     * no master vol). Apply master volume now so DAC output respects the knob.
     * Non-rebuild path already applied mv in the final ME-sum above. */
    if (rebuild_from_la && mv < 0.9999f) {
        for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
            float scaled = (float)mailbox_audio[i] * mv;
            if (scaled > 32767.0f) scaled = 32767.0f;
            if (scaled < -32768.0f) scaled = -32768.0f;
            mailbox_audio[i] = (int16_t)lroundf(scaled);
        }
    }

    /* Speaker-EQ compensation: on rebuild_from_la the DAC mailbox bypasses
     * MoveSpeakerEnhancer (which sits on Move's master bus after per-track sum).
     * Apply our emulation in its place. Only active when the built-in speaker
     * is the output — headphones stay neutral. Captures/unity_view snapshotted
     * above so this only colors the DAC path.
     *
     * Known simplification: this runs AFTER master volume was applied above.
     * Stock Move's order is more like enhancer_then_mv. The cascade is LTI so
     * the frequency response is unchanged, but any waveshaper/soft-clipper
     * stage inside the emulation will generate slightly different harmonic
     * content at non-unity mv than stock Move does. Audibility at <-6 dB is
     * negligible; revisit if measurements show a mismatch at loud volumes. */
    /* Speaker EQ requires us to know which output is active. We boot with
     * shadow_speaker_active=1 as a guess, but defer applying EQ until we've
     * actually observed a CC 115 jack-detect event from XMOS. Otherwise an
     * already-plugged HP at boot (or after an in-flight install.sh restart
     * where XMOS doesn't re-broadcast jack state) gets the speaker EQ wrongly
     * applied — phasey/hollow audio that only resolves on jack replug.
     * XMOS broadcasts CC 115 within ~180ms of shim init at every boot, so the
     * gate clears almost immediately on a real session. */
    {
        int eq_on = spk_eq_speaker_stable();  /* always jack-auto (no toggle) */
        if (rebuild_from_la && speaker_eq_initialized && eq_on) {
            speaker_eq_process(mailbox_audio, FRAMES_PER_BLOCK);
        }
    }

    /* Poll sampler commands from shadow UI (via shared memory) */
    if (shadow_control) {
        shadow_control->sampler_state_val = (uint8_t)sampler_get_state();
        sampler_external_stop_only = shadow_control->sampler_ext_stop ? 1 : 0;

        /* Wake all slots from idle when requested (e.g. Song Mode pre-warming) */
        if (shadow_control->wake_slots) {
            shadow_control->wake_slots = 0;
            for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                shadow_slot_idle[s] = 0;
                shadow_slot_silence_frames[s] = 0;
                shadow_slot_fx_idle[s] = 0;
                shadow_slot_fx_silence_frames[s] = 0;
            }
        }

        /* Sampler source request from shadow UI (used by tool modules that need
         * to record from a specific source — e.g. the assistant needs Move Input
         * for voice). 1=Resample, 2=Move Input. Reset to 0 after applying.
         * Processed BEFORE sampler_cmd so a "set source then start" sequence in
         * the same tick captures audio from the requested source. */
        uint8_t src_req = shadow_control->sampler_source_request;
        if (src_req != 0) {
            shadow_control->sampler_source_request = 0;
            sampler_source = (src_req == 2)
                ? SAMPLER_SOURCE_MOVE_INPUT
                : SAMPLER_SOURCE_RESAMPLE;
            shadow_overlay_sync();
            unified_log("shim", LOG_LEVEL_INFO,
                       "sampler source request applied: req=%u -> source=%d (0=Resample,1=MoveInput)",
                       src_req, (int)sampler_source);
        }

        /* Skipback buffer resize: settings UI writes new desired length to
         * shadow_control->skipback_seconds. We compare against the actually
         * allocated size and dispatch a worker thread to resize. The worker
         * holds skipback_saving briefly, so audio capture pauses for the
         * ~tens-of-ms it takes to malloc + memcpy the new buffer. */
        {
            int desired = (int)shadow_control->skipback_seconds;
            if (desired > 0 && desired != skipback_get_seconds()
                && skipback_seconds_setting != desired) {
                skipback_seconds_setting = desired;
                /* Resize runs on the shim worker — no pthread_create here. */
                shim_worker_post(SHIM_EVT_SKIPBACK_RESIZE);
            }
        }

        uint8_t cmd = shadow_control->sampler_cmd;
        if (cmd == 1) {
            /* Start recording — capture arms now; the shim worker reads the
             * path file and opens the WAV (no file I/O on this thread). */
            shadow_control->sampler_cmd = 0;
            sampler_request_start_custom(NULL);
        } else if (cmd == 2) {
            /* Stop recording */
            shadow_control->sampler_cmd = 0;
            sampler_request_stop();
        } else if (cmd == 3) {
            /* Pause recording */
            shadow_control->sampler_cmd = 0;
            if (sampler_state == SAMPLER_RECORDING) {
                sampler_pause_recording();
            }
        } else if (cmd == 4) {
            /* Resume recording */
            shadow_control->sampler_cmd = 0;
            if (sampler_state == SAMPLER_PAUSED) {
                sampler_resume_recording();
            }
        }

        /* Preview player commands. Play (open/fstat/mmap) runs on the shim
         * worker; stop is just flag clears, safe here. */
        uint8_t pcmd = shadow_control->preview_cmd;
        if (pcmd == 1) {
            shadow_control->preview_cmd = 0;
            shim_worker_post(SHIM_EVT_PREVIEW_PLAY);
        } else if (pcmd == 2) {
            shadow_control->preview_cmd = 0;
            preview_stop();
        }
    }

    /* Capture audio for sampler at unity (Resample source only) — reads from
     * unity_view[] so it captures pre-master-volume audio. */
    if (sampler_source == SAMPLER_SOURCE_RESAMPLE) {
        sampler_capture_audio_from_buffer(unity_view);
        sampler_tick_preroll();
        /* Skipback: always capture Resample source into rolling buffer.
         * No init call here — the buffer is allocated at startup by
         * skipback_prepare(). Capture declines the block if it is not ready. */
        skipback_capture(unity_view);
    }

    MIX_PHASE_END(MIX_PHASE_TAIL);
}

/* Shared memory segment names from shadow_constants.h */

#define NUM_AUDIO_BUFFERS 3  /* Triple buffering */

/* Shadow shared memory pointers */
static int16_t *shadow_audio_shm = NULL;    /* Shadow's mixed output */
static int16_t *shadow_movein_shm = NULL;   /* Move's audio for shadow to read */
static uint8_t *shadow_midi_shm = NULL;
static uint8_t *shadow_ui_midi_shm = NULL;
static uint8_t *shadow_display_shm = NULL;
static uint8_t *display_live_shm = NULL;
static shadow_midi_out_t *shadow_midi_out_shm = NULL;  /* MIDI output from shadow UI */
static uint8_t last_shadow_midi_out_ready = 0;
static shadow_midi_dsp_t *shadow_midi_dsp_shm = NULL;  /* MIDI to DSP from shadow UI */
static uint8_t last_shadow_midi_dsp_ready = 0;
static shadow_midi_inject_t *shadow_midi_inject_shm = NULL;  /* MIDI inject into Move's MIDI_IN */
static schwung_ext_midi_remap_t *ext_midi_remap_shm = NULL;  /* Cable-2 channel remap table */

static uint32_t last_screenreader_sequence = 0;  /* Track last spoken message */
static uint64_t last_speech_time_ms = 0;  /* Rate limiting for TTS */

/* Publish a 4-byte USB-MIDI event into the shim → shadow_ui SHM ring.
 *
 * The ring uses byte 0 as the "slot full" gate. Producer writes bytes 1-3
 * first, then commits with a release-store of byte 0. Consumer
 * (shadow_ui.c::process_shadow_midi) acquire-loads byte 0 to detect a
 * filled slot and release-stores 0 to release it. Without this ordering,
 * a wholesale memset on the consumer side could wipe events written
 * between the producer's slot-empty check and the consumer's clear,
 * dropping note-offs under burst (4-pad simultaneous release, etc.). */
/* Ring-pressure telemetry. Single writer (the SPI callback), read by the
 * background logger thread — the same discipline as the spi_timing counters, and
 * for the same reason: a fprintf() on this thread is the bug we keep finding,
 * never the instrument. `sticky` counts the drops that LATCH (a press or release
 * nobody will resend); `yield` counts knob detents that stood aside for them. */
static volatile uint32_t ui_midi_drop_sticky = 0;
static volatile uint32_t ui_midi_drop_yield = 0;

static inline void shadow_ui_midi_publish(uint8_t head, uint8_t status,
                                          uint8_t d1, uint8_t d2) {
    if (!shadow_ui_midi_shm || !shadow_control) return;
    /* Drop misaligned/garbage slots read out of the unfiltered hardware
     * MIDI_IN buffer, INCLUDING an all-zero SysEx-CIN slot. The old guard here
     * exempted CINs 0x04-0x07 outright, and overtake mode widens the forward
     * scan to accept exactly that range — so a stale slot with a zeroed
     * payload was dispatched into JS as status=0 d1=0 d2=0. See
     * src/host/shadow_midi_filter.c. */
    if (!shadow_midi_forwardable(head, status, d1, d2)) return;
    /* A knob detent may not take one of the last slots — those are held for
     * events whose loss STICKS. See shadow_ui_midi_policy.h for why the two are
     * not interchangeable. */
    const int yields = shadow_ui_midi_event_yields(head, status, d1);
    const int limit  = yields ? shadow_ui_midi_yield_limit(MIDI_BUFFER_SIZE)
                              : MIDI_BUFFER_SIZE;

    for (int slot = 0; slot < limit; slot += 4) {
        if (__atomic_load_n(&shadow_ui_midi_shm[slot], __ATOMIC_ACQUIRE) == 0) {
            shadow_ui_midi_shm[slot + 1] = status;
            shadow_ui_midi_shm[slot + 2] = d1;
            shadow_ui_midi_shm[slot + 3] = d2;
            __atomic_store_n(&shadow_ui_midi_shm[slot], head, __ATOMIC_RELEASE);
            shadow_control->midi_ready++;
            return;
        }
    }

    /* Dropped. Count it by consequence, so the log distinguishes "the surface
     * got busy" from "a release was lost and something is now stuck". */
    if (yields) ui_midi_drop_yield++;
    else        ui_midi_drop_sticky++;
}

/* LED queue constants and state — moved to shadow_led_queue.c */

/* Shadow shared memory segments are created via shadow_shm_map()
 * (src/host/shadow_shm_util.c); fds are closed after mmap — no caller
 * uses them post-init. */

/* Shadow initialization state */
static int shadow_shm_initialized = 0;

/* Initialize shadow shared memory segments */

/* Signal handler for crash diagnostics - async-signal-safe */
static void crash_signal_handler(int sig, siginfo_t *si, void *uctx_v)
{
    const char *name;
    switch (sig) {
        case SIGSEGV: name = "SIGSEGV"; break;
        case SIGBUS:  name = "SIGBUS";  break;
        case SIGABRT: name = "SIGABRT"; break;
        case SIGTERM: name = "SIGTERM"; break;
        case SIGINT:  name = "SIGINT";  break;
        default:      name = "UNKNOWN"; break;
    }
    /* Build async-signal-safe message including faulting address and PC.
     * Hex-format by hand since snprintf is not AS-safe. */
    char msg[256];
    int pos = 0;
    const char *prefix = "Caught ";
    for (int i = 0; prefix[i]; i++) msg[pos++] = prefix[i];
    for (int i = 0; name[i]; i++) msg[pos++] = name[i];

    /* Append si_addr if available (only meaningful for SIGSEGV/SIGBUS). */
    if (si && (sig == SIGSEGV || sig == SIGBUS)) {
        const char *at = " si_addr=0x";
        for (int i = 0; at[i]; i++) msg[pos++] = at[i];
        uintptr_t a = (uintptr_t)si->si_addr;
        /* 16 hex digits for 64-bit address, skip leading zeros */
        char hex[17]; int hp = 0;
        if (a == 0) { hex[hp++] = '0'; }
        else {
            char tmp[17]; int tp = 0;
            while (a) { int d = a & 0xf; tmp[tp++] = (char)(d < 10 ? '0'+d : 'a'+(d-10)); a >>= 4; }
            while (tp > 0) hex[hp++] = tmp[--tp];
        }
        for (int i = 0; i < hp; i++) msg[pos++] = hex[i];
    }

    /* Append PC from ucontext if available (Linux aarch64: uc_mcontext.pc). */
    if (uctx_v) {
        ucontext_t *uctx = (ucontext_t *)uctx_v;
        const char *at = " pc=0x";
        for (int i = 0; at[i]; i++) msg[pos++] = at[i];
        uintptr_t pc = 0;
#if defined(__aarch64__)
        pc = (uintptr_t)uctx->uc_mcontext.pc;
#endif
        char hex[17]; int hp = 0;
        if (pc == 0) { hex[hp++] = '0'; }
        else {
            char tmp[17]; int tp = 0;
            while (pc) { int d = pc & 0xf; tmp[tp++] = (char)(d < 10 ? '0'+d : 'a'+(d-10)); pc >>= 4; }
            while (tp > 0) hex[hp++] = tmp[--tp];
        }
        for (int i = 0; i < hp; i++) msg[pos++] = hex[i];
    }

    const char *suffix = " - terminating";
    for (int i = 0; suffix[i]; i++) msg[pos++] = suffix[i];
    msg[pos] = '\0';

    unified_log_crash(msg);

    /* Dump a call stack to a dedicated file for post-mortem symbolization.
     * backtrace()/backtrace_symbols_fd() are async-signal-safe (no malloc).
     * Symbolize: addr2line -e build/schwung-shim.so <+0xRVA>  (RVA is the
     * "(+0x...)" form printed for static fns; named frames resolve directly). */
    {
        void *bt[48];
        int n = backtrace(bt, 48);
        int fd = open(SCHWUNG_INSTALL_DIR "/shim_crash_bt.txt",
                      O_WRONLY | O_CREAT | O_APPEND, 0644);
        if (fd >= 0) {
            write(fd, msg, (size_t)pos);
            write(fd, "\n", 1);
            if (n > 0) backtrace_symbols_fd(bt, n, fd);
            write(fd, "====\n", 5);
            close(fd);
        }
    }

    _exit(128 + sig);
}

/* One-time migration from move-anything → schwung directory layout.
 * Handles upgrades from 0.7.x via Module Store, where files land in
 * /data/UserData/move-anything/ with schwung binary names.
 * Must run before any /data/UserData/schwung/ path access. */
static void migrate_from_old_layout(void)
{
    struct stat st;
    const char *new_dir = SCHWUNG_INSTALL_DIR;
    const char *old_dir = "/data/UserData/move-anything";

    /* Already migrated or fresh install — nothing to do */
    if (stat(new_dir, &st) == 0) return;

    /* Check if old directory exists and is a real directory (not a symlink) */
    if (lstat(old_dir, &st) != 0 || !S_ISDIR(st.st_mode)) return;

    printf("Shadow: Migrating move-anything → schwung...\n");

    /* Move directory */
    if (rename(old_dir, new_dir) != 0) {
        printf("Shadow: Migration failed (rename): %s\n", strerror(errno));
        return;
    }

    /* Create backwards-compat symlink */
    symlink(new_dir, old_dir);

    /* Migrate sample/preset directories */
    const char *old_samples = "/data/UserData/UserLibrary/Samples/Move Everything";
    const char *new_samples = "/data/UserData/UserLibrary/Samples/Schwung";
    if (lstat(old_samples, &st) == 0 && S_ISDIR(st.st_mode) && stat(new_samples, &st) != 0) {
        if (rename(old_samples, new_samples) == 0)
            symlink(new_samples, old_samples);
    }

    const char *old_presets = "/data/UserData/UserLibrary/Track Presets/Move Everything";
    const char *new_presets = "/data/UserData/UserLibrary/Track Presets/Schwung";
    if (lstat(old_presets, &st) == 0 && S_ISDIR(st.st_mode) && stat(new_presets, &st) != 0) {
        if (rename(old_presets, new_presets) == 0)
            symlink(new_presets, old_presets);
    }

    /* Update /usr/lib/ shim symlink to new path */
    unlink("/usr/lib/schwung-shim.so");
    symlink(SCHWUNG_INSTALL_DIR "/schwung-shim.so", "/usr/lib/schwung-shim.so");
    unlink("/usr/lib/move-anything-shim.so");

    /* Update /opt/move/Move entrypoint if it still references the old name */
    FILE *f = fopen("/opt/move/Move", "r");
    if (f) {
        char buf[512];
        int found_old = 0;
        while (fgets(buf, sizeof(buf), f)) {
            if (strstr(buf, "move-anything-shim.so")) { found_old = 1; break; }
        }
        fclose(f);

        if (found_old) {
            /* Copy the new entrypoint over */
            FILE *src = fopen(SCHWUNG_INSTALL_DIR "/shim-entrypoint.sh", "r");
            if (src) {
                FILE *dst = fopen("/opt/move/Move", "w");
                if (dst) {
                    int ch;
                    while ((ch = fgetc(src)) != EOF) fputc(ch, dst);
                    fclose(dst);
                    chmod("/opt/move/Move", 0755);
                }
                fclose(src);
            }
        }
    }

    printf("Shadow: Migration complete.\n");
}

static void init_shadow_shm(void)
{
    if (shadow_shm_initialized) return;

    /* Migrate from old directory layout before accessing any schwung paths */
    migrate_from_old_layout();

    /* Initialize unified logging first so we can log during shm init */
    unified_log_init();

    /* Install crash signal handlers */
    {
        struct sigaction sa;
        memset(&sa, 0, sizeof(sa));
        sa.sa_sigaction = crash_signal_handler;
        sa.sa_flags = SA_SIGINFO;
        sigemptyset(&sa.sa_mask);
        sigaction(SIGSEGV, &sa, NULL);
        sigaction(SIGBUS,  &sa, NULL);
        sigaction(SIGABRT, &sa, NULL);
        sigaction(SIGTERM, &sa, NULL);
    }

    /* Log startup identity (always-on, no flag needed) */
    {
        char init_msg[64];
        snprintf(init_msg, sizeof(init_msg), "Shim init: pid=%d ppid=%d", getpid(), getppid());
        unified_log_crash(init_msg);
    }

    printf("Shadow: Initializing shared memory...\n");

    /* Create/open audio shared memory - triple buffered */
    size_t triple_audio_size = AUDIO_BUFFER_SIZE * NUM_AUDIO_BUFFERS;
    shadow_audio_shm = (int16_t *)shadow_shm_map(SHM_SHADOW_AUDIO,
                                                 triple_audio_size, 1, 1);

    /* Create/open Move audio input shared memory (for shadow to read Move's audio) */
    shadow_movein_shm = (int16_t *)shadow_shm_map(SHM_SHADOW_MOVEIN,
                                                  AUDIO_BUFFER_SIZE, 1, 1);

    /* Create/open MIDI shared memory */
    shadow_midi_shm = (uint8_t *)shadow_shm_map(SHM_SHADOW_MIDI,
                                                MIDI_BUFFER_SIZE, 1, 1);

    /* Create/open UI MIDI shared memory */
    shadow_ui_midi_shm = (uint8_t *)shadow_shm_map(SHM_SHADOW_UI_MIDI,
                                                   MIDI_BUFFER_SIZE, 1, 1);

    /* Create/open display shared memory */
    shadow_display_shm = (uint8_t *)shadow_shm_map(SHM_SHADOW_DISPLAY,
                                                   DISPLAY_BUFFER_SIZE, 1, 1);

    /* Create/open live display shared memory (for remote display server) */
    display_live_shm = (uint8_t *)shadow_shm_map(SHM_DISPLAY_LIVE,
                                                 DISPLAY_BUFFER_SIZE, 1, 1);

    /* Create/open control shared memory - DON'T zero it, shadow_poc owns the state */
    shadow_control = (shadow_control_t *)shadow_shm_map(SHM_SHADOW_CONTROL,
                                                        CONTROL_BUFFER_SIZE, 1, 0);
    if (shadow_control) {
        /* Enable shadow display on boot for splash screen.
         * Shadow UI will set display_mode=0 when splash is done. */
        shadow_display_mode = 1;
        shadow_control->display_mode = 1;
        shadow_control->shadow_ready = 1;
        shadow_control->should_exit = 0;
        shadow_control->midi_ready = 0;
        shadow_control->write_idx = 0;
        shadow_control->read_idx = 0;
        shadow_control->ui_slot = 0;
        shadow_control->ui_flags = 0;
        /* Standalone session: raise the open-tool command so this host boots
         * straight into one module instead of its menu.
         *
         * Reuses the existing open_tool_cmd path rather than adding a parallel
         * one, because that path already does BOTH halves — the check further
         * down turns the shadow display on, and the shadow UI opens the tool
         * named in open_tool_cmd.json. JS can read display_mode but cannot set
         * it, so a JS-only "open this at boot" cannot claim the screen and the
         * module renders invisibly behind Move's UI.
         *
         * The launcher writes both files; absent boot_tool.json this is inert,
         * which is every ordinary boot. */
        {
            struct stat _bt;
            if (stat(SCHWUNG_INSTALL_DIR "/boot_tool.json", &_bt) == 0) {
                shadow_control->open_tool_cmd = 1;
                /* ...and hide Move's LEDs until that tool owns the surface.
                 * The shadow display is claimed from this point on, so the
                 * screen is ours for the whole boot — but Move still boots
                 * underneath, loads its set and paints the pads and buttons,
                 * which stayed fully lit under the boot splash for the ~3.4 s
                 * it runs. Nothing else strips them: the only other blanking
                 * is the select actuator's, and that never runs at boot. */
                boot_tool_led_blank = 1;
            }
        }
        /* Set-select actuator: armed only mid-session, by a tool calling
         * shadow_select_arm(pad). Starts clean on every shim init. */
        shadow_control->select_phase = 0;
        shadow_control->select_launch = SELECT_LAUNCH_NONE;
        shadow_control->select_ready = 0;
        shadow_control->select_queue = -1;
        shadow_control->ui_patch_index = 0;
        shadow_control->ui_request_id = 0;
        /* Reset overtake state on every shim init.
         *
         * The control SHM is backed by /dev/shm/schwung-control on a
         * tmpfs that survives across process restarts. restart-move.sh
         * kills MoveOriginal + shadow_ui + the shim but leaves the
         * SHM file intact, so without an explicit reset here the new
         * shim inherits whatever overtake state the prior session
         * left behind. Concrete symptom (reproduced on hardware
         * 2026-05-15): a `make deploy` from inside an overtake module
         * leaves overtake_mode=2 in the SHM; the new MoveOriginal
         * boots, sees overtake_mode=2, treats the surface as owned
         * by an overtake module that no longer exists, and stops
         * emitting LED commands to MIDI_OUT. The whole hardware
         * surface stays dark until the user provokes some code path
         * (e.g. a track-button press) that re-evaluates overtake
         * state and finally clears it.
         *
         * Suspend_overtake follows the same logic — it gates several
         * overtake passthrough decisions and a stale "1" lets the
         * shim drop input that no parked module will ever pick up. */
        shadow_control->overtake_mode    = 0;
        shadow_control->suspend_overtake = 0;
        shadow_control->selected_slot    = 0;
        shadow_control->skip_led_clear   = 0;
        shadow_control->overtake_suppress_sysex = 0;
        shadow_control->corun.target = CORUN_TARGET_NONE;  /* co-run inactive at boot */
        shadow_control->corun.id = -1;
        shadow_control->corun.flags = 0;      /* 0 = legacy keep-list model */
        shadow_control->corun.keep_mask = 0;  /* 0 = default split when a target is set without a manifest */
        shadow_control->corun.led_keep_mask = 0; /* 0 = LED ownership follows keep_mask */
        shadow_control->shadow_display_owner = DISPLAY_OWNER_SCHWUNG_UI; /* splash boots into shadow UI */
        /* Initialize TTS defaults */
        shadow_control->tts_enabled = 0;    /* Screen Reader off by default */
        shadow_control->tts_volume = 70;    /* 70% volume */
        shadow_control->tts_pitch = 110;    /* 110 Hz */
        shadow_control->tts_speed = 1.5f;   /* 1.5x speed */
        shadow_control->tts_engine = 0;     /* 0=espeak-ng (speak engine) */
        shadow_control->overlay_knobs_mode = OVERLAY_KNOBS_NATIVE; /* Native by default */
        shadow_control->tts_debounce_ms = 50; /* default debounce ms */
        /* Clear display overlay state — stale values from previous session
         * cause ghost overlays (e.g. "1/8" page toast) on soft reboot */
        shadow_control->display_overlay = 0;
        shadow_control->overlay_rect_x = 0;
        shadow_control->overlay_rect_y = 0;
        shadow_control->overlay_rect_w = 0;
        shadow_control->overlay_rect_h = 0;
    }

    /* Create/open UI shared memory (slot labels/state) */
    shadow_ui_state = (shadow_ui_state_t *)shadow_shm_map(SHM_SHADOW_UI,
                                                          SHADOW_UI_BUFFER_SIZE, 1, 1);
    if (shadow_ui_state) {
        shadow_ui_state->version = 1;
        shadow_ui_state->slot_count = SHADOW_UI_SLOTS;
    }

    /* Create/open param shared memory (for set_param/get_param requests) */
    shadow_param = (shadow_param_t *)shadow_shm_map(SHM_SHADOW_PARAM,
                                                    SHADOW_PARAM_BUFFER_SIZE, 1, 1);

    /* Create/open web param set ring (web UI → shim, fire-and-forget) */
    web_param_set_shm = (web_param_set_ring_t *)shadow_shm_map(SHM_WEB_PARAM_SET,
                                                               sizeof(web_param_set_ring_t), 1, 1);

    /* Create/open web param notify ring (shim → web UI, push changes) */
    web_param_notify_shm = (web_param_notify_ring_t *)shadow_shm_map(SHM_WEB_PARAM_NOTIFY,
                                                                     sizeof(web_param_notify_ring_t), 1, 1);

    /* Create/open the autosave dirty-hint word for web-originated writes
     * (shim → shadow_ui; see web_write_dirty_t in shadow_constants.h) */
    web_write_dirty_shm = (web_write_dirty_t *)shadow_shm_map(SHM_WEB_WRITE_DIRTY,
                                                              sizeof(web_write_dirty_t), 1, 1);

    /* Create/open MIDI out shared memory (for shadow UI to send MIDI) */
    shadow_midi_out_shm = (shadow_midi_out_t *)shadow_shm_map(SHM_SHADOW_MIDI_OUT,
                                                              sizeof(shadow_midi_out_t), 1, 1);

    /* Create/open MIDI-to-DSP shared memory (for shadow UI to route MIDI to chain slots) */
    shadow_midi_dsp_shm = (shadow_midi_dsp_t *)shadow_shm_map(SHM_SHADOW_MIDI_DSP,
                                                              sizeof(shadow_midi_dsp_t), 1, 1);

    /* Create/open MIDI inject shared memory (for injecting events into Move's MIDI_IN) */
    shadow_midi_inject_shm = (shadow_midi_inject_t *)shadow_shm_map(SHM_SHADOW_MIDI_INJECT,
                                                                    sizeof(shadow_midi_inject_t), 1, 1);
    /* The Vyukov ring needs seq[i] = i — zero-fill is not a valid initial
     * state. The shim creates this segment before any producer (schwung_host)
     * maps it, so initializing here once at startup is race-free. */
    if (shadow_midi_inject_shm) {
        shadow_midi_inject_init(shadow_midi_inject_shm);
    }

    /* Create/open cable-2 channel remap shared memory (active overtake module writes,
     * shim reads on every SPI frame to rewrite cable-2 MIDI_IN channel byte). */
    ext_midi_remap_shm = (schwung_ext_midi_remap_t *)shadow_shm_map(SHM_SHADOW_EXT_MIDI_REMAP,
                                                                    sizeof(schwung_ext_midi_remap_t), 1, 1);
    if (ext_midi_remap_shm) {
        ext_midi_remap_shm->version = EXT_MIDI_REMAP_VERSION;
        ext_midi_remap_shm->enabled = 0;
        memset((void *)ext_midi_remap_shm->remap, EXT_MIDI_REMAP_PASSTHROUGH, 16);
    }

    /* Create/open screen reader shared memory (for accessibility: TTS and D-Bus announcements) */
    shadow_screenreader_shm = (shadow_screenreader_t *)shadow_shm_map(SHM_SHADOW_SCREENREADER,
                                                                      sizeof(shadow_screenreader_t), 1, 1);

    /* Create/open overlay state shared memory (sampler/skipback state for JS rendering) */
    shadow_overlay_shm = (shadow_overlay_state_t *)shadow_shm_map(SHM_SHADOW_OVERLAY,
                                                                  SHADOW_OVERLAY_BUFFER_SIZE, 1, 1);

    /* Test-bus stream SHMs (E2E test infra, flagist0/schwung#2). Owned by
     * src/host/shadow_test_stream.c so future channels (MIDI_IN, log tail)
     * land there, not here. Cheap when no test client is subscribed. */
    shadow_test_stream_init();

    /* TTS engine uses lazy initialization - will init on first speak */
    tts_set_volume(70);  /* Set volume early (safe, doesn't require TTS init) */
    printf("Shadow: TTS engine configured (will init on first use)\n");

    /* Create/open Link Audio publisher shared memory */
    shadow_pub_audio_shm = (link_audio_pub_shm_t *)shadow_shm_map(SHM_LINK_AUDIO_PUB,
                                                                  sizeof(link_audio_pub_shm_t), 1, 1);
    if (shadow_pub_audio_shm) {
        shadow_pub_audio_shm->magic = LINK_AUDIO_PUB_SHM_MAGIC;
        shadow_pub_audio_shm->version = LINK_AUDIO_PUB_SHM_VERSION;
        printf("Shadow: Link Audio publisher shm initialized (%zu bytes)\n",
               sizeof(link_audio_pub_shm_t));
    }

    /* Try to attach read-only to the sidecar's Move-audio ring. Sidecar may
     * not have started yet; the retry thread in shim_spi_init will keep
     * trying for ~30s. No consumer yet (flag-gated in later tasks). */
    if (try_attach_in_audio_shm()) {
        printf("Shadow: Link Audio in shm attached at init\n");
    } else {
        printf("Shadow: Link Audio in shm not ready yet; retry thread will attempt\n");
    }

    /* Initialize Link Audio state */
    memset(&link_audio, 0, sizeof(link_audio));
    link_audio.move_socket_fd = -1;
    link_audio.publisher_socket_fd = -1;
    memset(shadow_slot_capture, 0, sizeof(shadow_slot_capture));

    shadow_shm_initialized = 1;
    printf("Shadow: Shared memory initialized (audio=%p, midi=%p, ui_midi=%p, display=%p, control=%p, ui=%p, param=%p, midi_out=%p, midi_dsp=%p, screenreader=%p, overlay=%p, pub_audio=%p)\n",
           shadow_audio_shm, shadow_midi_shm, shadow_ui_midi_shm,
           shadow_display_shm, shadow_control, shadow_ui_state, shadow_param, shadow_midi_out_shm, shadow_midi_dsp_shm, shadow_screenreader_shm, shadow_overlay_shm, shadow_pub_audio_shm);
}

/* Monitor screen reader messages and speak them with TTS (debounced) */
#define TTS_DEBOUNCE_MS_DEFAULT 300  /* Default debounce: 300ms of silence before speaking */
static char pending_tts_message[SHADOW_SCREENREADER_TEXT_LEN] = {0};
static uint64_t last_message_time_ms = 0;
static bool has_pending_message = false;

static void shadow_check_screenreader(void)
{
    if (!shadow_screenreader_shm) return;

    /* Get current time in milliseconds */
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    uint64_t now_ms = (uint64_t)(ts.tv_sec * 1000) + (ts.tv_nsec / 1000000);

    /* Check if there's a new message (sequence incremented) */
    uint32_t current_sequence = shadow_screenreader_shm->sequence;
    if (current_sequence != last_screenreader_sequence) {
        /* New message arrived - buffer it and reset debounce timer */
        if (shadow_screenreader_shm->text[0] != '\0') {
            strncpy(pending_tts_message, shadow_screenreader_shm->text, sizeof(pending_tts_message) - 1);
            pending_tts_message[sizeof(pending_tts_message) - 1] = '\0';
            last_message_time_ms = now_ms;
            has_pending_message = true;
        }
        last_screenreader_sequence = current_sequence;
        return;
    }

    /* Check if debounce period has elapsed and we have a pending message */
    uint16_t debounce_ms = shadow_control ? shadow_control->tts_debounce_ms : TTS_DEBOUNCE_MS_DEFAULT;
    if (has_pending_message && (now_ms - last_message_time_ms >= debounce_ms)) {
        /* Apply TTS settings from shared memory before speaking */
        if (shadow_control) {
            /* Check for engine switch (must happen before other settings) */
            const char *current_engine = tts_get_engine();
            const char *requested_engine = shadow_control->tts_engine == 1 ? "flite" : "espeak";
            if (strcmp(current_engine, requested_engine) != 0) {
                tts_set_engine(requested_engine);
            }

            tts_set_enabled(shadow_control->tts_enabled != 0);
            tts_set_volume(shadow_control->tts_volume);
            tts_set_speed(shadow_control->tts_speed);
            tts_set_pitch((float)shadow_control->tts_pitch);
        }

        /* Speak the buffered message */
        if (tts_speak(pending_tts_message)) {
            last_speech_time_ms = now_ms;
        }
        has_pending_message = false;
        pending_tts_message[0] = '\0';
    }
}

/* ==========================================================================
 * PIN Challenge Display Scanner
 *
 * Monitors the pin_challenge_active flag set by the web shim when a browser
 * connects to move.local and triggers a PIN challenge. When detected, we
 * wait for the PIN to render on the display, extract the 6 digits, and
 * speak them via TTS.
 *
 * Display format: 128x64 @ 1bpp, column-major (8 pages of 128 bytes).
 * PIN digits appear on pages 3-4 only, all other pages are blank.
 * ========================================================================== */

/* PIN scanner state — moved to shadow_pin_scanner.c */

/* Shift+Menu double-click detection state */
static uint64_t shift_menu_pending_ms = 0;
static int shift_menu_pending = 0;

/* PIN scanner functions — moved to shadow_pin_scanner.c */

/* Mix shadow audio into mailbox audio buffer - TRIPLE BUFFERED */
static void shadow_mix_audio(void)
{
    if (!shadow_audio_shm || !global_mmap_addr) return;
    if (!shadow_control || !shadow_control->shadow_ready) return;

    int16_t *mailbox_audio = (int16_t *)(global_mmap_addr + AUDIO_OUT_OFFSET);

    /* Check for new screen reader messages and speak them */
    shadow_check_screenreader();

    /* TTS test: speak once after 3 seconds to verify audio works */
    static int tts_test_frame_count = 0;
    static bool tts_test_done = false;
    if (!tts_test_done && shadow_control->shadow_ready) {
        tts_test_frame_count++;
        if (tts_test_frame_count == 1035) {  /* ~3 seconds at 44.1kHz, 128 frames/block */
            printf("TTS test: Speaking test phrase...\n");
            /* Apply TTS settings before test phrase */
            {
                const char *current_engine = tts_get_engine();
                const char *requested_engine = shadow_control->tts_engine == 1 ? "flite" : "espeak";
                if (strcmp(current_engine, requested_engine) != 0) {
                    tts_set_engine(requested_engine);
                }
            }
            tts_set_enabled(shadow_control->tts_enabled != 0);
            tts_set_volume(shadow_control->tts_volume);
            tts_set_speed(shadow_control->tts_speed);
            tts_set_pitch((float)shadow_control->tts_pitch);
            tts_speak("Text to speech is working");
            tts_test_done = true;
        }
    }

    /* Increment shim counter for shadow's drift correction */
    shadow_control->shim_counter++;

    /* Copy Move's audio to shared memory so shadow can mix it */
    if (shadow_movein_shm) {
        memcpy(shadow_movein_shm, mailbox_audio, AUDIO_BUFFER_SIZE);
    }

    /*
     * Triple buffering read strategy:
     * - Read from buffer that's 2 behind write (gives shadow time to render)
     * - This adds ~6ms latency but smooths out timing jitter
     */
    uint8_t write_idx = shadow_control->write_idx;
    uint8_t read_idx = (write_idx + NUM_AUDIO_BUFFERS - 2) % NUM_AUDIO_BUFFERS;

    /* Update read index for shadow's reference */
    shadow_control->read_idx = read_idx;

    /* Get pointer to the buffer we should read */
    int16_t *src_buffer = shadow_audio_shm + (read_idx * FRAMES_PER_BLOCK * 2);

    /* Mix shadow audio with Move's audio */
    for (int i = 0; i < FRAMES_PER_BLOCK * 2; i++) {
        int32_t mixed = (int32_t)mailbox_audio[i] + (int32_t)src_buffer[i];
        /* Clip to int16 range */
        if (mixed > 32767) mixed = 32767;
        if (mixed < -32768) mixed = -32768;
        mailbox_audio[i] = (int16_t)mixed;
    }

    /* NOTE: TTS mixing moved to shadow_mix_tts() which runs AFTER
     * shadow_inprocess_mix_from_buffer(). That function zeros the mailbox
     * when Link Audio is active, so TTS must be mixed in afterward. */
}

/* Mix TTS audio into mailbox.  Called AFTER shadow_inprocess_mix_from_buffer()
 * because that function may zero-and-rebuild the mailbox when Link Audio is
 * active.  Mixing TTS here ensures it is never wiped by the rebuild. */
static void shadow_mix_tts(void)
{
    if (!global_mmap_addr) return;
    if (!tts_is_speaking()) return;

    int16_t *mailbox_audio = (int16_t *)(global_mmap_addr + AUDIO_OUT_OFFSET);
    static int16_t tts_buffer[FRAMES_PER_BLOCK * 2];  /* Stereo interleaved */
    int frames_read = tts_get_audio(tts_buffer, FRAMES_PER_BLOCK);

    if (frames_read > 0) {
        float mv = shadow_master_volume;
        for (int i = 0; i < frames_read * 2; i++) {
            int32_t scaled_tts = (int32_t)lroundf((float)tts_buffer[i] * mv);
            int32_t mixed = (int32_t)mailbox_audio[i] + scaled_tts;
            /* Clip to int16 range */
            if (mixed > 32767) mixed = 32767;
            if (mixed < -32768) mixed = -32768;
            mailbox_audio[i] = (int16_t)mixed;
        }
    }
}

/* LED queue functions — moved to shadow_led_queue.c */


/* Check for and send screen reader announcements via D-Bus */
static void shadow_check_screenreader_announcements(void) {
    static uint32_t last_announcement_sequence = 0;

    if (!shadow_screenreader_shm) return;

    /* Check if there's a new message (sequence incremented) */
    uint32_t current_sequence = shadow_screenreader_shm->sequence;
    if (current_sequence == last_announcement_sequence) return;

    last_announcement_sequence = current_sequence;

    /* Queue announcement for D-Bus broadcast */
    if (shadow_screenreader_shm->text[0]) {
        send_screenreader_announcement(shadow_screenreader_shm->text);
        /* Inject immediately - don't wait for Move's next D-Bus activity */
        shadow_inject_pending_announcements();
    }
}




/* Swap display buffer if in shadow mode */
static void shadow_swap_display(void)
{
    static uint32_t ui_check_counter = 0;
    static int display_phase = 0;  /* 0-6: phases of display push */
    static int display_hidden_for_volume = 0;

    if (!shadow_display_shm || !global_mmap_addr) {
        return;
    }
    if (!shadow_control || !shadow_control->shadow_ready) {
        return;
    }

    /* shadow_ui watchdog. Runs BEFORE the shadow-mode gate below: shadow_ui is
     * meant to be up whenever the shim is (it owns param serving and autosave,
     * not just the OLED), and a dead one is most likely to be noticed while the
     * shadow UI is *hidden* — which is exactly when the gated version could
     * never recover it. launch_shadow_ui() is a waitpid() in the steady state. */
    if ((ui_check_counter++ % 256) == 0) {
        launch_shadow_ui();
    }

    if (!shadow_display_mode) {
        display_phase = 0;
        display_hidden_for_volume = 0;
        shadow_block_plain_volume_hide_until_release = 0;
        return;  /* Not in shadow mode */
    }
    /* Let Move's PIN screen show through during challenge so PIN scanner can read it */
    if (shadow_control->pin_challenge_active == 1) {
        display_phase = 0;
        return;
    }
    /* Display-owner split (see shadow_display_owner_t in shadow_constants.h):
     * shadow_display_mode says "the shadow session is active" (filters/MIDI
     * routing are armed). shadow_display_owner says "who is actually rendering
     * the OLED right now". During move_native co-run the session is active but
     * the OLED belongs to Move firmware — yield without tearing down the
     * session. */
    if (shadow_control->shadow_display_owner == DISPLAY_OWNER_MOVE_FIRMWARE) {
        display_phase = 0;
        return;
    }
    if (!shadow_volume_knob_touched) {
        shadow_block_plain_volume_hide_until_release = 0;
    }
    /* A tool holding vol_block owns the knob, so a volume TOUCH must not hand
     * the OLED to Move firmware. The shim still sees note 8 (the filter only
     * stops it reaching Move, not our own tracking), so without this the shadow
     * display is hidden and Move's screen shows through underneath the tool. */
    if (shadow_volume_knob_touched && !shadow_shift_held &&
        !(shadow_control && shadow_control->vol_block)) {
        if (shadow_block_plain_volume_hide_until_release) {
            /* Keep shadow UI visible until shortcut's volume touch is fully released. */
            if (display_hidden_for_volume) {
                display_phase = 0;
                display_hidden_for_volume = 0;
            }
        } else {
            /* Let native Move volume overlay show while volume touch is held. */
            display_phase = 0;
            display_hidden_for_volume = 1;
            return;
        }
    } else if (display_hidden_for_volume) {
        /* Restart shadow slicing cleanly after releasing volume touch. */
        display_phase = 0;
        display_hidden_for_volume = 0;
    }
    /* Composite overlays onto shadow display if active */
    static uint8_t shadow_composited[DISPLAY_BUFFER_SIZE];
    const uint8_t *display_src = shadow_display_shm;

    if (skipback_overlay_timeout > 0) {
        skipback_overlay_timeout--;
        shadow_overlay_sync();
    }

    /* Recording dot + optional MIDI channel indicator overlay on shadow display.
     * The indicator's enable bit lives in shadow_control->midi_indicator_enabled
     * (set by the shadow UI's midi_indicator_set binding). Reading it here is
     * lock-free and RT-safe — no file I/O on the SPI callback path. */
    int draw_rec_dot = (sampler_state == SAMPLER_RECORDING && rec_dot_visible());
    extern int midi_indicator_active_notes;
    int draw_midi_ind = shadow_control && shadow_control->midi_indicator_enabled
                        && midi_indicator_active_notes > 0;
    if (draw_rec_dot || draw_midi_ind) {
        memcpy(shadow_composited, shadow_display_shm, DISPLAY_BUFFER_SIZE);
        if (draw_rec_dot) {
            overlay_fill_rect(shadow_composited, 123, 1, 4, 4, 1);
        }
        if (draw_midi_ind) {
            overlay_draw_midi_indicator(shadow_composited);
        }
        display_src = shadow_composited;
    }

    /* Write full display to DISPLAY_OFFSET (768) */
    memcpy(global_mmap_addr + DISPLAY_OFFSET, display_src, DISPLAY_BUFFER_SIZE);

    /* Write display using slice protocol - one slice per ioctl */
    /* No rate limiting because we must overwrite Move every ioctl */

    if (display_phase == 0) {
        /* Phase 0: Zero out slice area - signals start of new frame */
        global_mmap_addr[80] = 0;
        memset(global_mmap_addr + 84, 0, 172);
    } else {
        /* Phases 1-6: Write slices 0-5 */
        int slice = display_phase - 1;
        int slice_offset = slice * 172;
        int slice_bytes = (slice == 5) ? 164 : 172;
        global_mmap_addr[80] = slice + 1;
        memcpy(global_mmap_addr + 84, display_src + slice_offset, slice_bytes);
    }

    display_phase = (display_phase + 1) % 7;  /* Cycle 0,1,2,3,4,5,6,0,... */
}

/* Callback for chain_mgmt: BPM query via sampler_get_bpm(NULL). */
static float shim_get_bpm(void) {
    return sampler_get_bpm(NULL);
}

/* =========================================================================
 * Web UI ring buffer: drain set requests from web server
 * ========================================================================= */
static void shadow_drain_web_param_set(void) {
    if (!web_param_set_shm) return;
    /* SPSC protocol (2026-07-19 rework, paired with the manager): write_idx is
     * the producer's MONOTONIC cursor (slot = idx % 32, clean uint8 wrap) and
     * reserved[0] is our published consumer cursor. The old scheme (count =
     * write_idx, then reset to 0) raced the producer's read-modify-write: an
     * edit landing mid-drain was orphaned, or the previous batch re-applied
     * (double-nudge). Now neither side writes the other's cursor. */
    static uint8_t tail;
    static int     tail_init = 0;
    uint8_t head = __atomic_load_n(&web_param_set_shm->write_idx, __ATOMIC_ACQUIRE);
    if (!tail_init) {
        /* First drain after (re)start: skip any pre-attach history — a
         * surviving SHM segment may hold a stale cursor from a prior run. */
        tail = head;
        tail_init = 1;
        return;
    }
    uint8_t count = (uint8_t)(head - tail);
    if (count == 0) return;
    if (count > WEB_PARAM_SET_ENTRIES) {
        /* Producer overran our ack (shouldn't happen — it checks fill) —
         * resync to the newest window rather than replaying garbage. */
        tail  = (uint8_t)(head - WEB_PARAM_SET_ENTRIES);
        count = WEB_PARAM_SET_ENTRIES;
    }

    /* Process each set request via direct dispatch — does NOT touch shadow_param,
     * so it's safe to run while shadow_ui.js has a request in-flight. Copy each
     * entry locally before dispatch (the producer may only reuse a slot after we
     * publish tail, but the copy keeps dispatch immune to a buggy producer). */
    for (uint8_t i = 0; i < count; i++) {
        web_param_set_entry_t e;
        memcpy(&e, (const void *)&web_param_set_shm->entries[(uint8_t)(tail + i) % WEB_PARAM_SET_ENTRIES],
               sizeof(e));
        if (e.key[0] == '\0') continue;

        /* Overtake-tool params dispatch straight to the overtake DSP (gen,
         * else fx — mirrors the mailbox SET dispatch). This is the browser
         * editor's lossless edit path: ring entries can't be stomped by the
         * shadow_ui mailbox producer (fire-and-forget in overtake mode),
         * unlike mailbox SETs, which died in 500ms manager timeouts under
         * contention. Values >255B still take the mailbox (ring entry cap) —
         * the manager routes by size. */
        if (strncmp(e.key, "overtake_dsp:", 13) == 0) {
            if (overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->set_param)
                overtake_dsp_gen->set_param(overtake_dsp_gen_inst, e.key + 13, e.value);
            else if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->set_param)
                overtake_dsp_fx->set_param(overtake_dsp_fx_inst, e.key + 13, e.value);
            continue;
        }

        shadow_direct_set_param(e.slot, e.key, e.value);

        /* Autosave dirty hint: this write bypassed shadow_ui (whose
         * shadow_set_param_common feeds the dirty masks), so without this a
         * browser edit only ever persisted via transition flushes. Mirror its
         * policy — over-mark on any slot-targeted key, per-bus for the fx-bus
         * namespaces — using the shared FXBUS_DIRTY_* encoding. Lock-free OR;
         * shadow_ui exchanges the words to 0 each tick. */
        if (web_write_dirty_shm) {
            if (strncmp(e.key, "master_fx:", 10) == 0) {
                __atomic_fetch_or(&web_write_dirty_shm->fxbus_mask,
                                  FXBUS_DIRTY_MASTER, __ATOMIC_RELEASE);
            } else if (strncmp(e.key, "send_fx:", 8) == 0) {
                uint32_t bit = (e.key[8] == 'a') ? FXBUS_DIRTY_SEND_A
                             : (e.key[8] == 'b') ? FXBUS_DIRTY_SEND_B : 0;
                if (bit) __atomic_fetch_or(&web_write_dirty_shm->fxbus_mask,
                                           bit, __ATOMIC_RELEASE);
            } else if (strncmp(e.key, "move_fx:", 8) == 0) {
                int n = e.key[8] - '0';
                if (n >= 1 && n <= 16)
                    __atomic_fetch_or(&web_write_dirty_shm->fxbus_mask,
                                      1u << (FXBUS_DIRTY_MOVE_SHIFT + (n - 1)),
                                      __ATOMIC_RELEASE);
            } else if (e.slot < 32) {
                __atomic_fetch_or(&web_write_dirty_shm->slot_mask,
                                  1u << e.slot, __ATOMIC_RELEASE);
            }
        }
    }
    tail = head;
    __atomic_store_n(&web_param_set_shm->reserved[0], tail, __ATOMIC_RELEASE);
}

/* =========================================================================
 * Web UI ring buffer: push param change notifications to web server
 * ========================================================================= */
void web_param_notify_push(uint8_t slot, const char *key, const char *value) {
    if (!web_param_notify_shm) return;
    int idx = web_param_notify_shm->write_idx;
    if (idx >= WEB_PARAM_NOTIFY_ENTRIES) return; /* buffer full, drop */

    web_param_notify_entry_t *e = &web_param_notify_shm->entries[idx];
    e->slot = slot;
    strncpy(e->key, key, WEB_PARAM_KEY_LEN - 1);
    e->key[WEB_PARAM_KEY_LEN - 1] = '\0';
    strncpy(e->value, value, WEB_PARAM_VALUE_LEN - 1);
    e->value[WEB_PARAM_VALUE_LEN - 1] = '\0';

    __sync_synchronize();
    web_param_notify_shm->write_idx = idx + 1;
    web_param_notify_shm->ready++;
}

/* Remote-UI push (F4): probe the loaded overtake DSP's cheap "rui_poll" digest
 * ("rev:on:tick:bpm") IN-PROCESS every RUI_PROBE_FRAMES SPI frames and push
 * changes into the web param notify ring, so schwung-manager learns about tool
 * edits on-change instead of polling the shared shadow_param channel (which
 * contends with browser SetParams). Runs where param serves already run
 * (post-transfer path); RT-safe: no alloc, no logging, no I/O — one in-process
 * get_param + a strcmp per interval, nothing at all when no overtake DSP is
 * loaded or the module doesn't implement rui_poll (latched after one <0
 * answer until the next overtake load).
 * Rate rule: a rev-field change (content edit) pushes immediately; a digest
 * change with the same rev (playhead tick/bpm only) pushes every
 * RUI_PLAYHEAD_DIVIDER-th changed probe (~96ms) so playback doesn't spam the
 * 64-entry ring — the manager's own poll cadence covered playhead at ~100ms. */
#define RUI_PROBE_FRAMES 4       /* probe every 4th SPI frame (~12ms) */
/* Playhead-only pushes every 24th changed probe (~280ms). The browser free-runs
 * a local BPM clock and only needs occasional phase corrections; a ~100ms
 * playhead stream measurably congested the Move's bursty WiFi and starved the
 * big snapshot pushes behind it (clip selects took up to 1.7s while playing). */
#define RUI_PLAYHEAD_DIVIDER 24
static void shadow_overtake_rui_probe(void) {
    if (!overtake_dsp_gen || !overtake_dsp_gen_inst || !overtake_dsp_gen->get_param)
        return;
    if (overtake_rui_unsupported || !web_param_notify_shm)
        return;
    if (++overtake_rui_frame % RUI_PROBE_FRAMES)
        return;
    if (g_snap_hot > 0) g_snap_hot -= RUI_PROBE_FRAMES;   /* interest decay */
    char digest[64];
    int len = overtake_dsp_gen->get_param(overtake_dsp_gen_inst, "rui_poll",
                                          digest, (int)sizeof(digest));
    if (len < 0) { overtake_rui_unsupported = 1; return; }
    if (len >= (int)sizeof(digest)) return;   /* not a rui_poll-shaped digest */
    digest[len] = '\0';
    if (strcmp(digest, overtake_rui_last) == 0)
        return;
    /* digest = "rev:on:tick:bpm". rev and on changes push IMMEDIATELY — a
     * missed/late on-edge leaves the browser's playhead animating after stop
     * (once stopped the digest freezes, so a divider-deferred push would
     * never come at all). Only tick/bpm-only changes take the divider. */
    unsigned long rev = strtoul(digest, NULL, 10);
    const char *colon = strchr(digest, ':');
    int on = (colon && colon[1] == '1') ? 1 : 0;
    /* Track the live rev for the snapshot cache; while a browser is actively
     * pulling (snapshot-hot), refresh the cache proactively on every rev
     * change so the manager's rev-gated pull usually hits a fresh cache. */
    if ((uint32_t)rev != __atomic_load_n(&g_snap_cur_rev, __ATOMIC_RELAXED)) {
        __atomic_store_n(&g_snap_cur_rev, (uint32_t)rev, __ATOMIC_RELEASE);
        if (g_snap_hot > 0) snap_kick();
    }
    int push;
    if (!overtake_rui_have_rev || rev != overtake_rui_last_rev
            || on != overtake_rui_last_on) {
        push = 1;
        overtake_rui_ph_count = 0;
    } else {
        push = (++overtake_rui_ph_count % RUI_PLAYHEAD_DIVIDER) == 0;
    }
    if (!push)
        return;
    overtake_rui_last_rev = rev;
    overtake_rui_last_on = on;
    overtake_rui_have_rev = 1;
    strncpy(overtake_rui_last, digest, sizeof(overtake_rui_last) - 1);
    overtake_rui_last[sizeof(overtake_rui_last) - 1] = '\0';
    web_param_notify_push(0, "overtake_dsp:rui_poll", digest);
}

/* ---- Bulk param get/set (request_type 3 / 4) ------------------------- *
 *
 * Collapses N overtake_dsp param round-trips into ONE: the cost of a param
 * request is the wait for this handler's next audio-block cycle (~2.9ms),
 * NOT the in-process get/set itself (µs). So one request carrying many keys
 * — serviced in a single cycle — turns ~N×2.9ms into ~2.9ms.
 *
 * Wire format in shadow_param->value, self-describing (no struct change,
 * binary-safe — values may contain '\n'):
 *     "<count>\n"  then  count × ( "<len>\n" <len bytes> )
 *   BULK_GET (3): items = keys; response = "<count>\n" + count value-records
 *                 (same order; empty record on a get miss).
 *   BULK_SET (4): items = key,value,key,value,… (count is even); applies each.
 * Capped at SHADOW_BULK_MAX_ITEMS so a malformed request can't monopolise
 * the audio thread. Runs on the SPI/audio thread — the module's get/set_param
 * must be audio-safe (read-only / no alloc / no locks). */
#define SHADOW_BULK_MAX_ITEMS 64

static char s_bulk_req[SHADOW_PARAM_VALUE_LEN];   /* request copy (parsed)   */
static char s_bulk_val[SHADOW_PARAM_VALUE_LEN];   /* one get value, scratch  */

/* Parse the next length-prefixed record at *pp (within [*pp,end)). On
 * success returns the record start, sets *out_len, advances *pp past it.
 * Returns NULL on malformed/exhausted input. */
static const char *bulk_next(const char **pp, const char *end, int *out_len) {
    const char *p = *pp;
    long n = 0; int any = 0;
    while (p < end && *p >= '0' && *p <= '9') { n = n * 10 + (*p - '0'); p++; any = 1; }
    if (!any || p >= end || *p != '\n') return NULL;
    p++;                                  /* skip the '\n' after the length */
    if (n < 0 || p + n > end) return NULL;
    *out_len = (int)n;
    *pp = p + n;
    return p;
}

/* Append "<len>\n<bytes>" to out[off..cap); returns new offset, or -1 on
 * overflow. */
static int bulk_put(char *out, int off, int cap, const char *bytes, int len) {
    int hdr = snprintf(out + off, (size_t)(cap - off), "%d\n", len);
    if (hdr <= 0 || off + hdr + len > cap) return -1;
    off += hdr;
    memcpy(out + off, bytes, (size_t)len);
    return off + len;
}

/* Service a BULK_GET/BULK_SET against the active overtake DSP. */
static void shim_handle_param_bulk(uint8_t req_type) {
    plugin_api_v2_t *api = NULL; void *inst = NULL;
    if (overtake_dsp_gen && overtake_dsp_gen_inst) {
        api = overtake_dsp_gen; inst = overtake_dsp_gen_inst;
    } else if (overtake_dsp_fx && overtake_dsp_fx_inst) {
        api = overtake_dsp_fx; inst = overtake_dsp_fx_inst;
    }
    if (!api) { shadow_param->error = 14; shadow_param->result_len = -1; return; }

    /* BULK_SET never overwrites ->value, so parse it in place. BULK_GET writes
     * the response back into ->value, so copy the request out first — bounded
     * to the actual NUL-terminated payload, not the whole 64 KB buffer (this
     * runs on the audio thread ~44×/sec). The request is ASCII/JSON with no
     * embedded NUL, so strnlen finds its true length. */
    const char *p, *end;
    if (req_type == 4) {
        p   = shadow_param->value;
        end = shadow_param->value + SHADOW_PARAM_VALUE_LEN;
    } else {
        size_t rlen = strnlen(shadow_param->value, SHADOW_PARAM_VALUE_LEN - 1);
        memcpy(s_bulk_req, shadow_param->value, rlen);
        s_bulk_req[rlen] = '\0';
        p   = s_bulk_req;
        end = s_bulk_req + rlen;
    }

    int count = 0; { int any = 0;
        while (p < end && *p >= '0' && *p <= '9') { count = count*10 + (*p-'0'); p++; any = 1; }
        if (!any || p >= end || *p != '\n') { shadow_param->error = 22; shadow_param->result_len = -1; return; }
        p++;
    }
    if (count < 0 || count > SHADOW_BULK_MAX_ITEMS) {
        shadow_param->error = 22; shadow_param->result_len = -1; return;
    }

    if (req_type == 4) {                  /* BULK_SET: key,value pairs */
        if (count & 1) { shadow_param->error = 22; shadow_param->result_len = -1; return; }
        char keybuf[SHADOW_PARAM_KEY_LEN];
        for (int i = 0; i + 1 < count; i += 2) {
            int klen = 0, vlen = 0;
            const char *k = bulk_next(&p, end, &klen);
            const char *v = k ? bulk_next(&p, end, &vlen) : NULL;
            if (!v) break;
            if (klen <= 0 || klen >= (int)sizeof keybuf) continue;
            memcpy(keybuf, k, (size_t)klen); keybuf[klen] = '\0';
            /* value is NOT NUL-terminated in s_bulk_req; copy into s_bulk_val. */
            if (vlen >= SHADOW_PARAM_VALUE_LEN) continue;
            memcpy(s_bulk_val, v, (size_t)vlen); s_bulk_val[vlen] = '\0';
            if (api->set_param) api->set_param(inst, keybuf, s_bulk_val);
        }
        shadow_param->error = 0; shadow_param->result_len = 0;
        return;
    }

    /* BULK_GET: keys → values, written back into ->value. */
    char *out = shadow_param->value;
    int   off = snprintf(out, SHADOW_PARAM_VALUE_LEN, "%d\n", count);
    char  keybuf[SHADOW_PARAM_KEY_LEN];
    for (int i = 0; i < count; i++) {
        int klen = 0;
        const char *k = bulk_next(&p, end, &klen);
        int vlen = 0;
        if (k && klen > 0 && klen < (int)sizeof keybuf && api->get_param) {
            memcpy(keybuf, k, (size_t)klen); keybuf[klen] = '\0';
            int r = api->get_param(inst, keybuf, s_bulk_val, SHADOW_PARAM_VALUE_LEN);
            if (r > 0) vlen = (r >= SHADOW_PARAM_VALUE_LEN) ? SHADOW_PARAM_VALUE_LEN - 1 : r;
        }
        int noff = bulk_put(out, off, SHADOW_PARAM_VALUE_LEN, s_bulk_val, vlen);
        if (noff < 0) { shadow_param->error = 22; shadow_param->result_len = -1; return; }
        off = noff;
    }
    shadow_param->error = 0; shadow_param->result_len = off;
}

/* Worker thread for the cached remote snapshot declared above the overtake
 * load path (see g_snap_* + snap_kick + snap_wait_idle). Serializes into its
 * own double buffer — NEVER into the shared param mailbox (v1 did, and a
 * producer-timeout could hand the mailbox to a new request mid-write). */
static void *snap_worker_main(void *arg) {
    (void)arg;
    /* Cores 0-2 only (keep core 3 free for the SPI SCHED_FIFO 90 audio callback).
     * LOW real-time priority (well below the audio thread's 90 and Move's FIFO
     * 70 threads) so a re-serialization isn't starved behind the manager /
     * shadow_ui SCHED_OTHER load. The snapshot is a ~ms CPU burst, then the
     * worker blocks on the semaphore, so it can't monopolise a core. */
    cpu_set_t mask; CPU_ZERO(&mask);
    CPU_SET(0, &mask); CPU_SET(1, &mask); CPU_SET(2, &mask);
    pthread_setaffinity_np(pthread_self(), sizeof(mask), &mask);
    struct sched_param sp = { .sched_priority = 10 };
    if (pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp) == 0) {
        shadow_log("snap worker: SCHED_FIFO prio 10 (cores 0-2)");
    } else {
        /* Fall back to SCHED_OTHER if RT priority isn't permitted. Log it —
         * a starved SCHED_OTHER worker is a known seconds-of-lag failure mode. */
        sp.sched_priority = 0;
        pthread_setschedparam(pthread_self(), SCHED_OTHER, &sp);
        shadow_log("snap worker: SCHED_FIFO denied, falling back to SCHED_OTHER");
    }
    for (;;) {
        if (sem_wait(&g_snap_sem) != 0) { if (errno == EINTR) continue; break; }
        for (;;) {
            __atomic_store_n(&g_snap_kick, 0, __ATOMIC_RELEASE);
            uint32_t epoch = __atomic_load_n(&g_snap_epoch, __ATOMIC_ACQUIRE);
            if (g_snap_rt_safe && overtake_dsp_gen && overtake_dsp_gen_inst
                    && overtake_dsp_gen->get_param) {
                /* Stamp the rev observed BEFORE serializing: content is at
                 * least this new, so a mid-serialize edit reads as "stale"
                 * and triggers one more refresh rather than a missed one. */
                uint32_t rev = __atomic_load_n(&g_snap_cur_rev, __ATOMIC_ACQUIRE);
                int idx = (__atomic_load_n(&g_snap_active, __ATOMIC_RELAXED) == 0) ? 1 : 0;
                /* Seqlock write side: the odd store must be globally visible
                 * BEFORE any data store — a release store only orders PRIOR
                 * writes, so an explicit fence is required after it (ARMv8
                 * would otherwise let the buffer fill overtake the odd mark
                 * and the reader could copy a torn buffer with matching seq). */
                __atomic_store_n(&g_snap_seq[idx], g_snap_seq[idx] + 1, __ATOMIC_RELAXED); /* odd */
                __atomic_thread_fence(__ATOMIC_SEQ_CST);
                int len = overtake_dsp_gen->get_param(overtake_dsp_gen_inst, "state",
                                                      g_snap_buf[idx], SHADOW_PARAM_VALUE_LEN);
                g_snap_len[idx] = len;
                g_snap_rev[idx] = rev;
                __atomic_store_n(&g_snap_seq[idx], g_snap_seq[idx] + 1, __ATOMIC_RELEASE); /* even */
                /* Publish only if no unload/load happened mid-serialize
                 * (epoch check) — else this blob belongs to a dead module. */
                if (len >= 0 && epoch == __atomic_load_n(&g_snap_epoch, __ATOMIC_ACQUIRE))
                    __atomic_store_n(&g_snap_active, idx, __ATOMIC_RELEASE);
            }
            if (__atomic_load_n(&g_snap_kick, __ATOMIC_ACQUIRE)) continue;
            __atomic_store_n(&g_snap_busy, 0, __ATOMIC_RELEASE);
            /* Kick raced our busy-clear? Reclaim and loop, else sleep. */
            if (__atomic_load_n(&g_snap_kick, __ATOMIC_ACQUIRE)
                    && !__atomic_exchange_n(&g_snap_busy, 1, __ATOMIC_ACQ_REL))
                continue;
            break;
        }
    }
    return NULL;
}

static void snap_worker_start(void) {
    static volatile int started = 0;
    if (__sync_lock_test_and_set(&started, 1)) return;
    if (sem_init(&g_snap_sem, 0, 0) != 0) { started = 0; return; }
    g_snap_sem_ok = 1;
    pthread_t tid;
    if (pthread_create(&tid, NULL, snap_worker_main, NULL) != 0) {
        started = 0; g_snap_sem_ok = 0;
        return;
    }
    pthread_detach(tid);
}

/* BULK_SET addressed to a CHAIN SLOT (key marker "chain:", slot = ->slot).
 *
 * The overtake bulk above reaches only the overtake DSP. A UI that drives
 * many chain parameters at once — automation, a macro, a scene recall — has
 * otherwise one round-trip per parameter, and a round-trip is an SPI frame
 * (~3 ms) whatever the work inside it. This is the same payload format as the
 * overtake BULK_SET; each pair goes through shadow_direct_set_param, i.e.
 * exactly where a single shadow_set_param(slot, key, value) would land
 * (slot-level params, master/send FX and the chain plugin alike). Ordered,
 * one consume, no stomp window between pairs. GET is not offered here —
 * chain readback has its own paths, and a bulk GET across slots would need
 * a per-item slot the format does not carry. */
static void shim_handle_param_bulk_chain(void) {
    uint8_t slot = shadow_param->slot;
    const char *p   = shadow_param->value;
    const char *end = shadow_param->value + SHADOW_PARAM_VALUE_LEN;
    int count = 0; { int any = 0;
        while (p < end && *p >= '0' && *p <= '9') { count = count*10 + (*p-'0'); p++; any = 1; }
        if (!any || p >= end || *p != '\n') { shadow_param->error = 22; shadow_param->result_len = -1; return; }
        p++;
    }
    if (count < 0 || count > SHADOW_BULK_MAX_ITEMS || (count & 1)) {
        shadow_param->error = 22; shadow_param->result_len = -1; return;
    }
    char keybuf[SHADOW_PARAM_KEY_LEN];
    for (int i = 0; i + 1 < count; i += 2) {
        int klen = 0, vlen = 0;
        const char *k = bulk_next(&p, end, &klen);
        const char *v = k ? bulk_next(&p, end, &vlen) : NULL;
        if (!v) break;
        if (klen <= 0 || klen >= (int)sizeof keybuf) continue;
        memcpy(keybuf, k, (size_t)klen); keybuf[klen] = '\0';
        if (vlen >= SHADOW_PARAM_VALUE_LEN) continue;
        memcpy(s_bulk_val, v, (size_t)vlen); s_bulk_val[vlen] = '\0';
        shadow_direct_set_param(slot, keybuf, s_bulk_val);
    }
    shadow_param->error = 0; shadow_param->result_len = 0;
}

/* Callback for chain_mgmt: handle shim-specific param prefixes.
 * Reads/writes shadow_param->key/value/error/result_len directly.
 * Returns 1 if handled, 0 if not. */
static int shim_handle_param_special(uint8_t req_type, uint32_t req_id) {
    (void)req_id;
    const char *key = shadow_param->key;

    /* chain: — a BULK_SET for the chain slot named by ->slot. */
    if (req_type == 4 && strcmp(key, "chain:") == 0) {
        shim_handle_param_bulk_chain();
        return 1;
    }

    /* overtake_dsp:<sub_key> */
    if (strncmp(key, "overtake_dsp:", 13) == 0) {
        /* Bulk get/set carry their payload (key list / pairs) in ->value;
         * the key field is just the "overtake_dsp:" routing marker. */
        if (req_type == 3 || req_type == 4) {
            shim_handle_param_bulk(req_type);
            return 1;
        }
        const char *param_key = key + 13;
        if (req_type == 1) {  /* SET */
            if (strcmp(param_key, "load") == 0) {
                shadow_overtake_dsp_load(shadow_param->value);
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (strcmp(param_key, "unload") == 0) {
                shadow_overtake_dsp_unload();
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->set_param) {
                /* No snap_wait_idle here: the remote_snapshot_rt_safe contract
                 * guarantees set_param never frees snapshot-reachable memory,
                 * so the worker may read concurrently (torn at worst). */
                overtake_dsp_gen->set_param(overtake_dsp_gen_inst, param_key, shadow_param->value);
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->set_param) {
                overtake_dsp_fx->set_param(overtake_dsp_fx_inst, param_key, shadow_param->value);
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else {
                shadow_param->error = 13;
                shadow_param->result_len = -1;
            }
        } else if (req_type == 2) {  /* GET */
            /* Cached snapshot: when the module opted in, answer the big
             * read-only "state" GET from the worker-maintained cache with a
             * memcpy — one frame, mailbox never held, audio thread never
             * serializes. A miss (cold cache / torn read) returns error 14;
             * the manager's retry cadence re-pulls after the kicked worker
             * has filled the cache. */
            if (g_snap_rt_safe && g_snap_sem_ok && strcmp(param_key, "state") == 0
                    && overtake_dsp_gen && overtake_dsp_gen_inst) {
                g_snap_hot = SNAP_HOT_FRAMES;   /* browser interest: keep cache fresh */
                int served = 0;
                int idx = __atomic_load_n(&g_snap_active, __ATOMIC_ACQUIRE);
                for (int tries = 0; tries < 2 && idx >= 0 && !served; tries++) {
                    uint32_t s1 = __atomic_load_n(&g_snap_seq[idx], __ATOMIC_ACQUIRE);
                    int len = g_snap_len[idx];
                    uint32_t rv = g_snap_rev[idx];
                    if (!(s1 & 1) && len >= 0 && len <= SHADOW_PARAM_VALUE_LEN - 1) {
                        memcpy(shadow_param->value, g_snap_buf[idx], (size_t)len);
                        shadow_param->value[len] = '\0';
                        /* Seqlock read side: the copy's loads must complete
                         * before the confirming seq load (an acquire load
                         * doesn't stop prior loads sinking past it). */
                        __atomic_thread_fence(__ATOMIC_ACQUIRE);
                        uint32_t s2 = __atomic_load_n(&g_snap_seq[idx], __ATOMIC_RELAXED);
                        if (s1 == s2) {
                            shadow_param->error = 0;
                            shadow_param->result_len = len;
                            served = 1;
                            /* Cache older than the live rev? Refresh for the
                             * manager's follow-up pull. */
                            if (rv != __atomic_load_n(&g_snap_cur_rev, __ATOMIC_RELAXED))
                                snap_kick();
                            break;
                        }
                    }
                    idx = __atomic_load_n(&g_snap_active, __ATOMIC_ACQUIRE);
                }
                if (!served) {
                    /* Kick only when the cache is COLD or STALE — a fresh
                     * cache that is unservable (module state overflowed the
                     * 64KB value buffer, len<0/oversize) would otherwise
                     * re-serialize on every pull in a futile churn loop. */
                    int a = __atomic_load_n(&g_snap_active, __ATOMIC_ACQUIRE);
                    if (a < 0 || g_snap_rev[a] !=
                            __atomic_load_n(&g_snap_cur_rev, __ATOMIC_RELAXED))
                        snap_kick();
                    shadow_param->error = 14;
                    shadow_param->result_len = -1;
                }
                return 1;
            }
            int len = -1;
            if (overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->get_param) {
                len = overtake_dsp_gen->get_param(overtake_dsp_gen_inst, param_key,
                                                   shadow_param->value, SHADOW_PARAM_VALUE_LEN);
            } else if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->get_param) {
                len = overtake_dsp_fx->get_param(overtake_dsp_fx_inst, param_key,
                                                  shadow_param->value, SHADOW_PARAM_VALUE_LEN);
            }
            if (len >= 0) {
                shadow_param->error = 0;
                shadow_param->result_len = len;
            } else {
                shadow_param->error = 14;
                shadow_param->result_len = -1;
            }
        }
        return 1;
    }

    /* jack:display — enable/disable JACK display override */
    if (strcmp(key, "jack:display") == 0) {
        if (req_type == 1 && g_jack_shm) {  /* SET */
            g_jack_shm->display_active = (shadow_param->value[0] == '1') ? 1 : 0;
            shadow_param->error = 0;
            shadow_param->result_len = 0;
        } else if (req_type == 2 && g_jack_shm) {  /* GET */
            shadow_param->value[0] = g_jack_shm->display_active ? '1' : '0';
            shadow_param->value[1] = '\0';
            shadow_param->error = 0;
            shadow_param->result_len = 1;
        }
        return 1;
    }

    /* "passthrough" — value is a CSV of CC numbers (0-127). Clears the
     * passthrough bitmap and sets the listed CCs in a single write.
     * Doing it atomically avoids the fire-and-forget race that back-to-back
     * passthrough_clear + passthrough_add calls ran into (overtake_mode=2
     * makes shadow_set_param non-blocking, so consecutive writes overwrite
     * before the shim reads them). */
    if (strcmp(key, "passthrough") == 0) {
        if (req_type == 1) {
            memset(overtake_passthrough_ccs, 0, sizeof(overtake_passthrough_ccs));
            const char *p = shadow_param->value;
            while (p && *p) {
                while (*p == ' ' || *p == ',') p++;
                if (!*p) break;
                int cc = atoi(p);
                if (cc >= 0 && cc < 128) overtake_passthrough_ccs[cc] = 1;
                while (*p && *p != ',') p++;
            }
            /* Log so we can verify registration in the debug log. */
            char dbg[128];
            int off = snprintf(dbg, sizeof(dbg), "passthrough set: value=\"%s\" ccs=[",
                               shadow_param->value ? shadow_param->value : "");
            for (int i = 0; i < 128 && off < (int)sizeof(dbg) - 4; i++) {
                if (overtake_passthrough_ccs[i]) {
                    off += snprintf(dbg + off, sizeof(dbg) - off, "%d,", i);
                }
            }
            snprintf(dbg + off, sizeof(dbg) - off, "]");
            shadow_log(dbg);
            shadow_param->error = 0;
            shadow_param->result_len = 0;
        }
        shadow_param->response_id = shadow_param->request_id;
        /* Release-store the flag AFTER the fields (incl. response_id), pairing
         * with the reader's acquire-load. Matches shadow_param_publish_response;
         * a plain store lets ARMv8 commit the flag ahead of the fields. */
        __atomic_store_n(&shadow_param->response_ready, 1, __ATOMIC_RELEASE);
        return 1;
    }

    if (strcmp(key, "suspend_overtake") == 0) {
        if (req_type == 1 && shadow_control) {  /* SET */
            shadow_control->suspend_overtake = (shadow_param->value[0] == '1') ? 1 : 0;
            shadow_param->error = 0;
            shadow_param->result_len = 0;
        }
        shadow_param->response_id = shadow_param->request_id;
        /* Release-store the flag AFTER the fields (incl. response_id), pairing
         * with the reader's acquire-load. Matches shadow_param_publish_response;
         * a plain store lets ARMv8 commit the flag ahead of the fields. */
        __atomic_store_n(&shadow_param->response_ready, 1, __ATOMIC_RELEASE);
        return 1;
    }

    if (strcmp(key, "jack:restore_leds") == 0) {
        if (req_type == 1) {  /* SET */
            {
                int starts = 0, cached = 0, last_cin = 0;
                int total = led_queue_jack_sysex_debug_info(&starts, &cached, &last_cin);
                char dbg[128];
                snprintf(dbg, sizeof(dbg),
                    "jack:restore_leds sysex debug: packets=%d starts=%d cached=%d last_cin=0x%02X",
                    total, starts, cached, last_cin);
                shadow_log(dbg);
            }
            led_queue_restore_jack_leds();
            led_queue_restore_jack_sysex_leds();
            shadow_param->error = 0;
            shadow_param->result_len = 0;
        }
        shadow_param->response_id = shadow_param->request_id;
        /* Release-store the flag AFTER the fields (incl. response_id), pairing
         * with the reader's acquire-load. Matches shadow_param_publish_response;
         * a plain store lets ARMv8 commit the flag ahead of the fields. */
        __atomic_store_n(&shadow_param->response_ready, 1, __ATOMIC_RELEASE);
        return 1;
    }

    /* master_fx:resample_bridge */
    if (strncmp(key, "master_fx:", 10) == 0) {
        const char *fx_key = key + 10;
        if (strcmp(fx_key, "resample_bridge") == 0) {
            if (req_type == 1) {
                native_resample_bridge_mode_t new_mode =
                    native_resample_bridge_mode_from_text(shadow_param->value);
                if (new_mode != native_resample_bridge_mode) {
                    char msg[128];
                    snprintf(msg, sizeof(msg), "Native resample bridge mode: %s",
                             native_resample_bridge_mode_name(new_mode));
                    shadow_log(msg);
                }
                native_resample_bridge_mode = new_mode;
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (req_type == 2) {
                int mode = (int)native_resample_bridge_mode;
                if (mode < 0 || mode > 2) mode = 0;
                shadow_param->result_len = snprintf(shadow_param->value,
                    SHADOW_PARAM_VALUE_LEN, "%d", mode);
                shadow_param->error = 0;
            }
            return 1;
        }
        /* master_fx:link_audio_routing */
        if (strcmp(fx_key, "link_audio_routing") == 0) {
            if (req_type == 1) {
                int val = atoi(shadow_param->value);
                int prev = link_audio_routing_enabled;
                link_audio_routing_enabled = val ? 1 : 0;
                /* On 0→1, re-attempt /schwung-link-in attach. The init-time
                 * retry thread exits after ~30s; if routing was off at boot
                 * (or the sidecar lost the race), shadow_in_audio_shm stays
                 * NULL and rebuild_from_la never engages. Respawn the retry
                 * thread here so toggling routing on later actually works. */
                if (!prev && link_audio_routing_enabled && !shadow_in_audio_shm) {
                    if (!try_attach_in_audio_shm()) {
                        pthread_t tid;
                        if (pthread_create(&tid, NULL,
                                           link_in_attach_retry_thread,
                                           NULL) == 0) {
                            pthread_detach(tid);
                        }
                    }
                }
                {
                    char msg[64];
                    snprintf(msg, sizeof(msg), "Link Audio routing: %s",
                             link_audio_routing_enabled ? "ON" : "OFF");
                    shadow_log(msg);
                }
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (req_type == 2) {
                shadow_param->result_len = snprintf(shadow_param->value,
                    SHADOW_PARAM_VALUE_LEN, "%d", link_audio_routing_enabled);
                shadow_param->error = 0;
            }
            return 1;
        }
        /* master_fx:link_audio_publish */
        if (strcmp(fx_key, "link_audio_publish") == 0) {
            if (req_type == 1) {
                int val = atoi(shadow_param->value);
                link_audio_publish_enabled = val ? 1 : 0;
                {
                    char msg[64];
                    snprintf(msg, sizeof(msg), "Link Audio publish: %s",
                             link_audio_publish_enabled ? "ON" : "OFF");
                    shadow_log(msg);
                }
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (req_type == 2) {
                shadow_param->result_len = snprintf(shadow_param->value,
                    SHADOW_PARAM_VALUE_LEN, "%d", link_audio_publish_enabled);
                shadow_param->error = 0;
            }
            return 1;
        }
        /* master_fx:latency_comp_enabled — user toggle. Applies
         * immediately; the brief ~9 ms transition artifact (audio hole on
         * OFF→ON, duplicate on ON→OFF) is accepted as a known cost of
         * flipping a delay buffer mid-playback. */
        if (strcmp(fx_key, "latency_comp_enabled") == 0) {
            if (req_type == 1) {
                int val = atoi(shadow_param->value) ? 1 : 0;
                latency_comp_user_enabled = val;
                if (val != latency_comp_active) {
                    latency_comp_active = val;
                    link_audio_reset_nudge_state();
                    shadow_latency_delay_reset();
                    char msg[64];
                    snprintf(msg, sizeof(msg), "Latency Comp: %s",
                             latency_comp_active ? "ACTIVE" : "BYPASSED");
                    shadow_log(msg);
                }
                shadow_param->error = 0;
                shadow_param->result_len = 0;
            } else if (req_type == 2) {
                shadow_param->result_len = snprintf(shadow_param->value,
                    SHADOW_PARAM_VALUE_LEN, "%d", latency_comp_user_enabled);
                shadow_param->error = 0;
            }
            return 1;
        }
        /* master_fx:system_link_enabled (GET-only, reads Move's Settings.json) */
        if (strcmp(fx_key, "system_link_enabled") == 0) {
            if (req_type == 2) {
                int enabled = 0;
                FILE *f = fopen("/data/UserData/settings/Settings.json", "r");
                if (f) {
                    char buf[1024];
                    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
                    fclose(f);
                    buf[n] = '\0';
                    char *p = strstr(buf, "\"isLinkEnabled\"");
                    if (p) {
                        p = strchr(p, ':');
                        if (p) {
                            p++;
                            while (*p == ' ' || *p == '\t') p++;
                            enabled = (strncmp(p, "true", 4) == 0) ? 1 : 0;
                        }
                    }
                }
                shadow_param->result_len = snprintf(shadow_param->value,
                    SHADOW_PARAM_VALUE_LEN, "%d", enabled);
                shadow_param->error = 0;
            } else {
                shadow_param->error = 1; /* read-only */
                shadow_param->result_len = 0;
            }
            return 1;
        }
    }

    return 0;  /* Not handled */
}

/* (The close()/read() libc interposers and shadow_fd_trace are gone: the
 * open()-side track_fd() caller was removed long ago, so the tracker never
 * had entries — every read/close in the whole Move process was paying a
 * no-op scan. See docs/plans/2026-06-11-codebase-cleanup-review.md.) */

/* ============================================================================
 * SUBSYSTEM INITIALIZATION
 * ============================================================================
 * Called once when the SPI library signals readiness (first post-transfer
 * callback).  All the subsystem init that was previously in the mmap hook.
 * ============================================================================ */
static int shim_subsystems_initialized = 0;

/* Sampler-specific announce wrapper. Tool modules that drive the sampler
 * programmatically set shadow_control->sampler_silent to suppress the
 * system "Sample saved" / "Recording failed" voice messages so the user
 * only hears the tool's own TTS (if any). */
static void sampler_announce_maybe_silent(const char *msg)
{
    if (shadow_control && shadow_control->sampler_silent) return;
    send_screenreader_announcement(msg);
}

static void shim_init_subsystems(void)
{
    if (shim_subsystems_initialized) return;
    shim_subsystems_initialized = 1;

    /* Point global pointers at library-managed buffers */
    global_mmap_addr = schwung_spi_get_shadow(g_spi_handle);
    hardware_mmap_addr = schwung_spi_get_hw(g_spi_handle);
    shadow_spi_fd = schwung_spi_get_fd(g_spi_handle);

    printf("Shadow mailbox: Move sees %p, hardware at %p\n",
           (void*)global_mmap_addr, (void*)hardware_mmap_addr);

    /* NOTE: Do NOT pin Move's CPU affinity here — child processes
     * (including jackd via rnbomovecontrol) inherit the mask. */

    /* Initialize shadow shared memory when we detect the SPI mailbox */
    init_shadow_shm();
    /* Initialize link audio subsystem (before load_feature_config sets link_audio.enabled) */
    shadow_link_audio_init();
    load_feature_config();  /* Load feature flags from config */

    /* Initialize chain management subsystem (must be before sampler - provides shadow_log) */
    {
        chain_mgmt_host_t cm_host = {
            .shadow_control_ptr = &shadow_control,
            .shadow_param_ptr = &shadow_param,
            .shadow_ui_state_ptr = &shadow_ui_state,
            .global_mmap_addr_ptr = &global_mmap_addr,
            .overlay_sync = shadow_overlay_sync,
            .run_command = shim_run_command,
            .launch_shadow_ui = launch_shadow_ui,
            .shadow_ui_enabled = &shadow_ui_enabled,
            .startup_modwheel_countdown = &shadow_startup_modwheel_countdown,
            .startup_modwheel_reset_frames = STARTUP_MODWHEEL_RESET_FRAMES,
            .handle_param_special = shim_handle_param_special,
            .get_bpm = shim_get_bpm,
            .get_beat_position = shadow_transport_beat_position,
            .on_param_changed = web_param_notify_push,
        };
        chain_mgmt_init(&cm_host);
    }
    /* Move's audio path is fixed 44.1 kHz (see shadow_master_fx_lfo_tick). */
    shadow_transport_init(44100);
    /* Sampler announce wrapper: defined inline above so this scope can
     * reference it. (Hoisted via the prototype near the top of the file.) */
    /* Initialize sampler subsystem with callbacks to shim functions.
     * Use a wrapper for `announce` so tool modules can suppress sampler
     * chatter ("Sample saved", etc.) by setting
     * shadow_control->sampler_silent. */
    {
        sampler_host_t sampler_host = {
            .log = shadow_log,
            .announce = sampler_announce_maybe_silent,
            .overlay_sync = shadow_overlay_sync,
            .run_command = shim_run_command,
            .global_mmap_addr = &global_mmap_addr,
            .hardware_mmap_addr = &hardware_mmap_addr,
        };
        sampler_init(&sampler_host, &sampler_set_tempo);
        /* Allocate the skipback rolling buffer HERE, on the startup thread —
         * never on the SPI callback, where it used to happen the first time
         * Resample capture engaged. 5.3 MB at the 30 s default against ~4 GB of
         * RAM, so paying for it unconditionally is cheaper than a stall, and it
         * removes the allocation from the deadline entirely. A later size
         * change still goes through skipback_resize(), which has always been
         * off-thread. */
        skipback_prepare(skipback_seconds_setting);
    }
    /* Initialize set pages subsystem with callbacks to shim functions */
    {
        set_pages_host_t sp_host = {
            .log = shadow_log,
            .announce = send_screenreader_announcement,
            .overlay_sync = shadow_overlay_sync,
            .run_command = shim_run_command,
            .save_state = shadow_save_state,
            .read_set_mute_states = shadow_read_set_mute_states,
            .read_set_tempo = sampler_read_set_tempo,
            .ui_state_update_slot = shadow_ui_state_update_slot,
            .ui_state_refresh = shadow_ui_state_refresh,
            .chain_parse_channel = shadow_chain_parse_channel,
            .chain_slots = shadow_chain_slots,
            .shadow_control_ptr = &shadow_control,
            .solo_count = (volatile int *)&shadow_solo_count,
        };
        set_pages_init(&sp_host);
    }
    if (shadow_control) {
        shadow_control->display_mirror = display_mirror_enabled ? 1 : 0;
        shadow_control->skipback_seconds = (uint16_t)skipback_seconds_setting;
        shadow_control->midi_indicator_enabled = midi_indicator_enabled_setting ? 1 : 0;
        shadow_control->speaker_active = 1; /* assume speaker at boot; CC 115 will correct */
        /* Speaker-EQ auto stability clock starts now; EQ stays off until a
         * speaker reading has been stable for SPK_EQ_STABLE_SEC. */
        clock_gettime(CLOCK_MONOTONIC, &spk_eq_speaker_since);
        shadow_control->line_in_connected = 0; /* assume internal mic at boot; CC 114 will correct */
    }

    /* Precompute speaker-EQ biquad coefficients. SR is 44.1 kHz (Move's audio engine). */
    if (!speaker_eq_initialized) {
        speaker_eq_build(44100.0f);
    }
    /* Initialize process management subsystem */
    {
        process_host_t proc_host = {
            .log = shadow_log,
            .get_bpm = (float (*)(void *))sampler_get_bpm,
            .link_audio = &link_audio,
        };
        process_init(&proc_host);
    }
    /* Initialize resample bridge */
    {
        resample_host_t res_host = {
            .log = shadow_log,
            .global_mmap_addr = &global_mmap_addr,
            .shadow_master_volume = &shadow_master_volume,
        };
        resample_init(&res_host);
    }
    /* Initialize overlay drawing */
    {
        overlay_host_t ov_host = {
            .log = shadow_log,
            .announce = send_screenreader_announcement,
            .shadow_control = &shadow_control,
            .shadow_overlay_shm = &shadow_overlay_shm,
            .chain_slots = shadow_chain_slots,
            .plugin_v2 = &shadow_plugin_v2,
        };
        overlay_init(&ov_host);
    }
    /* Initialize PIN scanner */
    {
        pin_scanner_host_t pin_host = {
            .log = shadow_log,
            .tts_speak = tts_speak,
            .shadow_control = &shadow_control,
        };
        pin_scanner_init(&pin_host);
    }
    /* Initialize LED queue */
    {
        uint8_t *shadow_buf = schwung_spi_get_shadow(g_spi_handle);
        led_queue_host_t led_host = {
            .midi_out_buf = shadow_buf + MIDI_OUT_OFFSET,
            .shadow_control = &shadow_control,
            .shadow_ui_midi_shm = &shadow_ui_midi_shm,
            .passthrough_ccs = overtake_passthrough_ccs,
        };
        led_queue_init(&led_host);
    }
    /* Initialize state persistence */
    {
        state_host_t st_host = {
            .log = shadow_log,
            .chain_slots = shadow_chain_slots,
            .solo_count = &shadow_solo_count,
        };
        state_init(&st_host);
    }
    /* Initialize MIDI routing */
    {
        uint8_t *shadow_buf = schwung_spi_get_shadow(g_spi_handle);
        midi_host_t midi_host = {
            .log = shadow_log,
            .midi_out_logf = shadow_midi_out_logf,
            .midi_out_log_enabled = shadow_midi_out_log_enabled,
            .ui_state_update_slot = shadow_ui_state_update_slot,
            .master_fx_forward_midi = shadow_master_fx_forward_midi,
            .queue_led = shadow_queue_led,
            .init_led_queue = shadow_init_led_queue,
            .chain_slots = shadow_chain_slots,
            .plugin_v2 = &shadow_plugin_v2,
            .shadow_control = &shadow_control,
            .global_mmap_addr = &global_mmap_addr,
            .shadow_inprocess_ready = &shadow_inprocess_ready,
            .shadow_display_mode = &shadow_display_mode,
            .shadow_midi_shm = &shadow_midi_shm,
            .shadow_midi_out_shm = &shadow_midi_out_shm,
            .shadow_ui_midi_shm = &shadow_ui_midi_shm,
            .shadow_midi_dsp_shm = &shadow_midi_dsp_shm,
            .shadow_midi_inject_shm = &shadow_midi_inject_shm,
            .shadow_mailbox = shadow_buf,
            .slot_idle = shadow_slot_idle,
            .slot_silence_frames = shadow_slot_silence_frames,
            .slot_fx_idle = shadow_slot_fx_idle,
            .slot_fx_silence_frames = shadow_slot_fx_silence_frames,
        };
        midi_routing_init(&midi_host);
    }
    /* Start Link Audio monitor — it will launch the subscriber
     * once link_audio_routing_enabled is set from config */
    if (link_audio.enabled) {
        start_link_sub_monitor();
    }
    native_resample_bridge_load_mode_from_shadow_config();  /* Restore bridge mode on Move restart */

    /* Phase 2: ROUTE_EXTERNAL packets are drained on the audio thread
     * inside shim_pre_transfer via overtake_ext_drain_into_shadow().
     * No worker thread — see the comment block on overtake_midi_send_external. */
    shadow_inprocess_load_chain();
    /* Initialize D-Bus subsystem with callbacks to shim functions */
    {
        dbus_host_t dbus_host = {
            .log = shadow_log,
            .save_state = shadow_save_state,
            .apply_mute = shadow_apply_mute,
            .ui_state_update_slot = shadow_ui_state_update_slot,
            .native_sampler_update = native_sampler_update_from_dbus_text,
            .chain_slots = shadow_chain_slots,
            .shadow_control_ptr = &shadow_control,
            .display_mode = &shadow_display_mode,
            .held_track = (volatile int *)&shadow_held_track,
            .selected_slot = (volatile int *)&shadow_selected_slot,
            .solo_count = (volatile int *)&shadow_solo_count,
            .pads_held = (volatile int *)&shadow_pads_held,
            .screenreader_shm = &shadow_screenreader_shm,
        };
        dbus_init(&dbus_host);
    }
    shadow_dbus_start();  /* Start D-Bus monitoring for volume sync */
    shadow_read_initial_volume();  /* Read initial master volume from settings */
    shadow_load_state();  /* Load saved slot volumes */

    /* Mute/solo state is now fully managed by shadow_load_state() above.
     * Previously we synced from Song.abl here, but Move's native track
     * mute (speakerOn) is independent of shadow slot mute state. */

    /* Initialize TTS and sync loaded state to shared memory */
    tts_init(44100);
    if (shadow_control) {
        shadow_control->tts_enabled = tts_get_enabled() ? 1 : 0;
        shadow_control->tts_volume = tts_get_volume();
        shadow_control->tts_speed = tts_get_speed();
        shadow_control->tts_pitch = (uint16_t)tts_get_pitch();
        shadow_control->tts_engine = (strcmp(tts_get_engine(), "flite") == 0) ? 1 : 0;
        unified_log("shim", LOG_LEVEL_INFO,
                   "TTS initialized, synced to shared memory: enabled=%s speed=%.2f pitch=%.1f volume=%d",
                   shadow_control->tts_enabled ? "ON" : "OFF",
                   shadow_control->tts_speed, (float)shadow_control->tts_pitch, shadow_control->tts_volume);
    }
}

/* write() hook removed - conflicts with system headers
 * Using send() hook instead for D-Bus interception */


int shiftHeld = 0;
int volumeTouched = 0;


static uint64_t shift_on_ms = 0;
static uint64_t vol_on_ms = 0;
static uint8_t hotkey_prev[MIDI_BUFFER_SIZE];
static int hotkey_prev_valid = 0;
static int shift_armed = 1;   /* Start armed so first press works */
static int volume_armed = 1;  /* Start armed so first press works */

static uint64_t now_mono_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)(ts.tv_nsec / 1000000ULL);
}

#define SHADOW_HOTKEY_WINDOW_MS 1500
#define SHADOW_HOTKEY_GRACE_MS 2000
static uint64_t shadow_hotkey_enable_ms = 0;
static int shadow_inject_knob_release = 0;  /* Set when toggling shadow mode to inject note-offs */

/* Shift+Vol+Knob1 toggle removed - use Track buttons or Shift+Jog instead */

void midi_monitor()
{
    if (!global_mmap_addr)
    {
        return;
    }

    uint8_t *src = (hardware_mmap_addr ? hardware_mmap_addr : global_mmap_addr) + MIDI_IN_OFFSET;

    /* NOTE: Shadow mode MIDI filtering now happens AFTER ioctl in the ioctl() function.
     * This function only handles hotkey detection for shadow mode toggle. */

    if (!hotkey_prev_valid) {
        memcpy(hotkey_prev, src, MIDI_BUFFER_SIZE);
        hotkey_prev_valid = 1;
        return;
    }

    for (int i = 0; i < SHADOW_MIDI_IN_BYTES; i += 8)
    {
        if (memcmp(&src[i], &hotkey_prev[i], 4) == 0) {
            continue;
        }
        memcpy(&hotkey_prev[i], &src[i], 4);

        unsigned char *byte = &src[i];
        unsigned char cable = (*byte & 0b11110000) >> 4;
        unsigned char code_index_number = (*byte & 0b00001111);
        unsigned char midi_0 = *(byte + 1);
        unsigned char midi_1 = *(byte + 2);
        unsigned char midi_2 = *(byte + 3);

        if (code_index_number == 2 || code_index_number == 1 || (cable == 0xf && code_index_number == 0xb && midi_0 == 176))
        {
            continue;
        }

        if (midi_0 + midi_1 + midi_2 == 0)
        {
            continue;
        }

        int controlMessage = 0xb0;
        if (midi_0 == controlMessage)
        {
            if (midi_1 == 0x31)
            {
                if (midi_2 == 0x7f)
                {
                    if (!shiftHeld && shift_armed) {
                        shiftHeld = 1;
                        shadow_shift_held = 1;  /* Sync global for cross-function access */
                        if (shadow_control) shadow_control->shift_held = 1;
                        shift_on_ms = now_mono_ms();
                    }
                }
                else
                {
                    shiftHeld = 0;
                    shadow_shift_held = 0;  /* Sync global for cross-function access */
                    if (shadow_control) shadow_control->shift_held = 0;
                    shift_armed = 1;
                    shift_on_ms = 0;
                }
            }

        }

        if ((midi_0 & 0xF0) == 0x90 && midi_1 == 0x08)
        {
            if (midi_2 == 0x7f)
            {
                if (!volumeTouched && volume_armed) {
                    volumeTouched = 1;
                    shadow_volume_knob_touched = 1;  /* Sync global for cross-function access */
                    vol_on_ms = now_mono_ms();
                }
            }
            else
            {
                volumeTouched = 0;
                shadow_volume_knob_touched = 0;  /* Sync global for cross-function access */
                volume_armed = 1;
                vol_on_ms = 0;
            }
        }

        /* Track pad hold state (notes 68-99) for volume detection gating.
         * When a pad is held and the volume knob is turned, Move shows a
         * pad-gain overlay, not the master volume overlay.  Without this
         * guard the pixel-based volume reader can misinterpret the gain
         * overlay as a very low master volume, muting all audio. */
        if (midi_1 >= 68 && midi_1 <= 99) {
            if ((midi_0 & 0xF0) == 0x90 && midi_2 > 0) {
                shadow_pads_held++;
            } else if ((midi_0 & 0xF0) == 0x80 ||
                       ((midi_0 & 0xF0) == 0x90 && midi_2 == 0)) {
                if (shadow_pads_held > 0) shadow_pads_held--;
            }
        }

    }
}

/* ============================================================================
 * SPI CALLBACK SHARED STATE
 * ============================================================================
 * Timing and overrun detection statics shared between pre/post callbacks.
 * These were previously local statics inside the monolithic ioctl() function.
 * ============================================================================ */

/* Comprehensive timing */
static struct timespec spi_ioctl_start, spi_pre_end, spi_post_start, spi_ioctl_end;
static uint64_t spi_total_sum = 0, spi_pre_sum = 0, spi_ioctl_sum = 0, spi_post_sum = 0;
static uint64_t spi_total_max = 0, spi_pre_max = 0, spi_ioctl_max = 0, spi_post_max = 0;
static int spi_timing_count = 0;

/* === COMPUTE, the load signal ===
 * pre + post: the work this process actually does per frame. Deliberately
 * excludes the ioctl span, which BLOCKS until the next frame boundary and so
 * always measures ~one block period no matter how idle we are. Comparing a
 * budget against the frame total is therefore not a load measure at all — it
 * reads ~2850 µs on a completely idle device, which is why the old overrun
 * counter ran into the tens of thousands with nothing loaded.
 *
 * This is the number to watch when deciding whether more DSP fits. */
static uint64_t spi_compute_sum = 0, spi_compute_max = 0;
static uint32_t spi_compute_over_budget = 0;   /* frames where compute > budget */
static uint64_t spi_last_frame_compute_us = 0;
static int spi_baseline_mode = -1;  /* -1 = unknown, 0 = full mode, 1 = baseline only */

/* === SPI Timing Snapshot (written from SPI path, read by background logger) ===
 * All fields are written atomically (single writer) from the SPI callbacks.
 * The background thread reads them periodically — torn reads are harmless
 * since the data is purely informational. */
typedef struct {
    /* Frame-level timing (avg/max over last 1000 blocks) */
    uint64_t frame_total_avg, frame_total_max;
    uint64_t frame_pre_avg, frame_pre_max;
    uint64_t frame_ioctl_avg, frame_ioctl_max;
    uint64_t frame_post_avg, frame_post_max;
    /* Compute = pre + post: the actual per-frame work, and the only one of
     * these that responds to load (see the definition above). */
    uint64_t compute_avg, compute_max;
    uint32_t compute_over_budget;
    /* Granular pre-ioctl sections (avg/max) */
    uint64_t midi_mon_avg, midi_mon_max;
    uint64_t fwd_midi_avg, fwd_midi_max;
    uint64_t mix_audio_avg, mix_audio_max;
    uint64_t ui_req_avg, ui_req_max;
    uint64_t param_req_avg, param_req_max;
    uint64_t fwd_cc_avg, fwd_cc_max;
    uint64_t proc_midi_avg, proc_midi_max;
    uint64_t jack_stash_avg, jack_stash_max;
    uint64_t drain_dsp_avg, drain_dsp_max;
    uint64_t jack_wake_avg, jack_wake_max;
    uint64_t mix_buf_avg, mix_buf_max;
    uint64_t tts_avg, tts_max;
    uint64_t display_avg, display_max;
    uint64_t clear_leds_avg, clear_leds_max;
    uint64_t jack_midi_avg, jack_midi_max;
    uint64_t ui_midi_avg, ui_midi_max;
    uint64_t flush_leds_avg, flush_leds_max;
    uint64_t screenreader_avg, screenreader_max;
    uint64_t jack_pre_avg, jack_pre_max;
    uint64_t jack_disp_avg, jack_disp_max;
    uint64_t pin_avg, pin_max;
    /* Post-ioctl un-instrumented chunks (added 2026-05-15 for overrun hunt) */
    uint64_t post_midi_scan_avg, post_midi_scan_max;  /* lines ~5841-6696 */
    uint64_t post_drain_dsp_avg, post_drain_dsp_max;  /* shadow_drain_ui_midi_dsp */
    uint64_t post_render_avg, post_render_max;        /* shadow_inprocess_render_to_buffer + slot dump */
    /* Per-slot render breakdown (added 2026-05-15 for render spike hunt) */
    uint64_t slot_render_max[SHADOW_CHAIN_INSTANCES];
    uint64_t slot_synth_max[SHADOW_CHAIN_INSTANCES];
    uint64_t mix_phase_max[MIX_PHASE_COUNT];   /* where mix_buf's time went */
    uint64_t slot_fx_max[SHADOW_CHAIN_INSTANCES];
    uint32_t slot_probe_burst_max;
    /* JACK audio double-buffer stats */
    uint32_t jack_audio_hits;
    uint32_t jack_audio_misses;
    /* Overrun tracking */
    uint32_t overrun_count;
    uint64_t last_overrun_total, last_overrun_pre, last_overrun_ioctl, last_overrun_post;
    /* Sequence number — incremented on each snapshot update */
    uint32_t seq;
    uint32_t frame_ready;     /* 1 = frame snapshot valid */
    uint32_t granular_ready;  /* 1 = granular snapshot valid */
} spi_timing_snapshot_t;

static volatile spi_timing_snapshot_t spi_snap = {0};

/* Link Audio path-flip counters (single-writer from SPI path, single-reader
 * from the background logger thread). Declared extern where incremented. */
volatile uint32_t shim_la_rebuild_flip_count = 0;
volatile uint32_t shim_la_starve_fallback_count = 0;

/* Granular pre-ioctl timing */
static struct timespec spi_section_start, spi_section_end;
static uint64_t spi_midi_mon_sum = 0, spi_midi_mon_max = 0;
static uint64_t spi_fwd_midi_sum = 0, spi_fwd_midi_max = 0;
static uint64_t spi_mix_audio_sum = 0, spi_mix_audio_max = 0;
static uint64_t spi_ui_req_sum = 0, spi_ui_req_max = 0;
static uint64_t spi_param_req_sum = 0, spi_param_req_max = 0;
static uint64_t spi_proc_midi_sum = 0, spi_proc_midi_max = 0;
static uint64_t spi_inproc_mix_sum = 0, spi_inproc_mix_max = 0;
static uint64_t spi_display_sum = 0, spi_display_max = 0;
/* Additional granular timing for previously-untimed sections */
static uint64_t spi_jack_stash_sum = 0, spi_jack_stash_max = 0;
static uint64_t spi_drain_ui_midi_sum = 0, spi_drain_ui_midi_max = 0;
static uint64_t spi_jack_wake_sum = 0, spi_jack_wake_max = 0;
static uint64_t spi_tts_mix_sum = 0, spi_tts_mix_max = 0;
static uint64_t spi_clear_leds_sum = 0, spi_clear_leds_max = 0;
static uint64_t spi_jack_midi_out_sum = 0, spi_jack_midi_out_max = 0;
static uint64_t spi_ui_midi_out_sum = 0, spi_ui_midi_out_max = 0;
static uint64_t spi_flush_leds_sum = 0, spi_flush_leds_max = 0;
static uint64_t spi_screenreader_sum = 0, spi_screenreader_max = 0;
static uint64_t spi_jack_pre_sum = 0, spi_jack_pre_max = 0;
static uint64_t spi_jack_disp_sum = 0, spi_jack_disp_max = 0;
static uint64_t spi_pin_sum = 0, spi_pin_max = 0;
static uint64_t spi_fwd_ext_cc_sum = 0, spi_fwd_ext_cc_max = 0;
static uint64_t spi_direct_midi_sum = 0, spi_direct_midi_max = 0;
/* Post-ioctl un-instrumented chunks (added 2026-05-15 for overrun hunt) */
static uint64_t spi_post_midi_scan_sum = 0, spi_post_midi_scan_max = 0;
static uint64_t spi_post_drain_dsp_sum = 0, spi_post_drain_dsp_max = 0;
static uint64_t spi_post_render_sum = 0, spi_post_render_max = 0;
/* Per-slot render breakdown forward-declared near shadow_inprocess_render_to_buffer */
static int spi_granular_count = 0;

/* XMOS jack-detect / SysEx logger — dormant unless flag file exists.
 * Flag: /data/UserData/schwung/log_xmos_sysex_on
 * Output: /data/UserData/schwung/xmos_sysex.txt
 * Used by scripts/collect-diagnostics.sh and the schwung-manager web UI to
 * capture host↔XMOS MIDI traffic during the "hollow / phasey audio" bug
 * investigation. Zero overhead when the flag file is absent.
 * State shared between pre/post transfer callbacks.
 * Hard size cap (XMOS_LOG_MAX_BYTES) protects against runaway log growth
 * if a user leaves the flag armed indefinitely. */
#define XMOS_LOG_MAX_BYTES (8 * 1024 * 1024)  /* 8 MB safety cap */
static int xmos_log_fd = -1;
static uint32_t xmos_frame = 0;
static uint64_t xmos_log_bytes = 0;

#define TIME_SECTION_START() clock_gettime(CLOCK_MONOTONIC, &spi_section_start)
#define TIME_SECTION_END(sum_var, max_var) do { \
    clock_gettime(CLOCK_MONOTONIC, &spi_section_end); \
    uint64_t _section_us = (spi_section_end.tv_sec - spi_section_start.tv_sec) * 1000000 + \
                   (spi_section_end.tv_nsec - spi_section_start.tv_nsec) / 1000; \
    sum_var += _section_us; \
    if (_section_us > max_var) max_var = _section_us; \
} while(0)

/* Overrun detection */
static int spi_consecutive_overruns = 0;
static int spi_skip_dsp_this_frame = 0;
/* (The old OVERRUN_THRESHOLD_US of 2850 µs was removed: it was compared against
 * the frame TOTAL, which includes the blocking ioctl, so it fired on an idle
 * device and measured nothing about load. Use SPI_COMPUTE_BUDGET_US below.) */
#define SKIP_DSP_THRESHOLD 3       /* Skip DSP after 3 consecutive over-budget frames */

/* The work window: a 128-frame block at 44.1 kHz is ~2900 µs, of which the SPI
 * transfer takes ~2 ms, leaving ~900 µs for everything this process does. This
 * is the figure that per-frame COMPUTE (pre + post) must stay under — not the
 * frame total, which includes the blocking wait. */
#define SPI_COMPUTE_BUDGET_US 900

/* ============================================================================
 * SPI PRE-TRANSFER CALLBACK
 * ============================================================================
 * Called by schwung_spi_lib before shadow→hardware copy on every SPI frame.
 * Contains all domain logic that was previously in the ioctl() pre-ioctl section:
 * MIDI monitoring, audio mixing, display compositing, LED injection, etc.
 * ============================================================================ */
static void shim_pre_transfer(void *ctx, uint8_t *shadow, int size)
{
    (void)ctx;
    (void)size;

    /* Root span for the pre-ioctl half of the SPI frame. No-op when tracing
     * is off (default). Closes on function return (incl. the goto pre_done
     * baseline path — the handle stays in scope). */
    TRACE_SCOPE("spi.pre");

    /* Flush-to-zero denormals on the SPI thread so IIR filters (speaker EQ,
     * subsonic HP, etc.) don't grind through gradual-underflow range during
     * long silent tails. FPCR is per-thread — set once on first callback.
     * aarch64 FPCR bit 24 = FZ (flush single/double denormals to zero). */
    {
        static int fpcr_fz_set = 0;
        if (!fpcr_fz_set) {
#if defined(__aarch64__)
            unsigned long fpcr;
            __asm__ __volatile__ ("mrs %0, fpcr" : "=r"(fpcr));
            fpcr |= (1UL << 24);
            __asm__ __volatile__ ("msr fpcr, %0" :: "r"(fpcr));
#endif
            fpcr_fz_set = 1;
        }
    }

    /* SPI buffer snapshot: dump full buffer to file when trigger exists.
     * Flag presence is published by the shim worker (1 Hz) — no syscalls
     * here. The dump writes themselves stay on this thread by design —
     * arming a debug tap is accepted to glitch audio. */
    {
        static int snap_cooldown = 0;
        if (snap_cooldown > 0) snap_cooldown--;
        if (snap_cooldown == 0 && (shim_debug_flags & SHIM_FLAG_SPI_SNAP)) {
            /* Write both output (0-2047) and input (2048-4095) regions */
            static int snap_seq = 0;
            char path[128];
            snprintf(path, sizeof(path),
                     SCHWUNG_INSTALL_DIR "/spi_snap_%04d.bin", snap_seq++);
            int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
            if (fd >= 0) {
                write(fd, shadow, 4096);
                close(fd);
            }
            /* Also dump hardware buffer */
            snprintf(path, sizeof(path),
                     SCHWUNG_INSTALL_DIR "/spi_snap_%04d_hw.bin", snap_seq - 1);
            unsigned char *hw_buf = schwung_spi_get_hw(g_spi_handle);
            if (hw_buf) {
                fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
                if (fd >= 0) {
                    write(fd, hw_buf, 4096);
                    close(fd);
                }
            }
            snap_cooldown = 44;  /* ~1 second between snapshots */
        }
    }

    /* SPI SysEx injection: send audio source change command to XMOS.
     * The worker reads + unlinks the trigger file and publishes the value;
     * here we only consume it — no file I/O on the SPI thread. */
    {
        static int inject_cooldown = 0;
        if (inject_cooldown > 0) inject_cooldown--;
        if (inject_cooldown == 0 && shim_pending_sysex_inject >= 0) {
            int val_byte = shim_pending_sysex_inject;
            shim_pending_sysex_inject = -1;

            /* Write SysEx as USB-MIDI packets into shadow output MIDI region.
             * F0 00 21 1D 01 01 37 12 <val> 00 00 00 00 00 00 F7
             * USB-MIDI: cin=0x04 (SysEx start/continue), cin=0x06 (SysEx end 2 bytes) */
            uint8_t *out = shadow + MIDI_OUT_OFFSET;
            /* Packet 1: F0 00 21 */
            out[0] = 0x04; out[1] = 0xF0; out[2] = 0x00; out[3] = 0x21;
            /* Packet 2: 1D 01 01 */
            out[4] = 0x04; out[5] = 0x1D; out[6] = 0x01; out[7] = 0x01;
            /* Packet 3: 37 12 <val> */
            out[8] = 0x04; out[9] = 0x37; out[10] = 0x12; out[11] = (uint8_t)val_byte;
            /* Packet 4: 00 00 00 */
            out[12] = 0x04; out[13] = 0x00; out[14] = 0x00; out[15] = 0x00;
            /* Packet 5: 00 00 00 */
            out[16] = 0x04; out[17] = 0x00; out[18] = 0x00; out[19] = 0x00;
            /* Packet 6: 00 00 00 */
            out[20] = 0x04; out[21] = 0x00; out[22] = 0x00; out[23] = 0x00;
            /* Packet 7: 00 00 00 */
            out[24] = 0x04; out[25] = 0x00; out[26] = 0x00; out[27] = 0x00;
            /* Packet 8: 00 F7 (SysEx end) */
            out[28] = 0x06; out[29] = 0x00; out[30] = 0xF7; out[31] = 0x00;

            inject_cooldown = 44;
            shadow_log("SPI SysEx inject: audio source change sent");
        }
    }

    /* XMOS SysEx + jack-detect logger — dormant unless flag file exists.
     * Captures cin 0x04..0x07 (SysEx framing) packets in MIDI_OUT and
     * cc=114/115 (line-in / line-out detect) events in MIDI_IN.
     * PRE-transfer log point: this block. POST-transfer (hw view) log
     * point: just before the hw→shadow memcpy in shim_post_transfer. */
    {
        static int xmos_log_checked = 0;
        if (xmos_log_checked++ % 44 == 0) {  /* check every ~1s */
            int want = (shim_debug_flags & SHIM_FLAG_XMOS_LOG) != 0;
            if (want && xmos_log_fd < 0) {
                xmos_log_fd = open(SCHWUNG_INSTALL_DIR "/xmos_sysex.txt",
                                   O_WRONLY | O_CREAT | O_APPEND, 0644);
                xmos_log_bytes = 0;
            } else if (!want && xmos_log_fd >= 0) {
                close(xmos_log_fd);
                xmos_log_fd = -1;
            }
        }
        /* Hard size cap: stop writing once the file exceeds XMOS_LOG_MAX_BYTES.
         * Don't close the fd — the next flag-check tick will close it cleanly. */
        if (xmos_log_fd >= 0 && xmos_log_bytes < XMOS_LOG_MAX_BYTES) {
            xmos_frame++;
            char line[128];
            /* Mark the first frame after arming so boot captures are easy to find. */
            static int xmos_log_first_frame_written = 0;
            if (!xmos_log_first_frame_written) {
                int n = snprintf(line, sizeof(line),
                    "[f%u] BOOT first armed frame (xmos_frame counter resets per shim load)\n",
                    xmos_frame);
                if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
                xmos_log_first_frame_written = 1;
            }
            const uint8_t *midi_out = shadow + MIDI_OUT_OFFSET;
            int any = 0;
            for (int i = 0; i < 80; i += 4) {
                uint8_t cin = midi_out[i] & 0x0F;
                if (cin >= 0x04 && cin <= 0x07) {
                    int n = snprintf(line, sizeof(line),
                        "[f%u] PRE  slot=%2d cable=%d cin=0x%x : %02x %02x %02x %02x\n",
                        xmos_frame, i, (midi_out[i] >> 4) & 0xF, cin,
                        midi_out[i], midi_out[i+1], midi_out[i+2], midi_out[i+3]);
                    if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
                    any = 1;
                }
            }
            if (any) {
                int n = snprintf(line, sizeof(line), "[f%u] PRE  end\n", xmos_frame);
                if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
            }
            /* Scan MIDI_IN for jack-detect CCs (114/115) AND incoming SysEx
             * framing (cin 0x04..0x07) from XMOS. MIDI_IN events are 8 bytes
             * (4 USB-MIDI + 4 timestamp) at offset 2048. */
            unsigned char *hw_buf2 = schwung_spi_get_hw(g_spi_handle);
            if (hw_buf2) {
                const uint8_t *midi_in = hw_buf2 + 2048;
                int in_any = 0;
                for (int i = 0; i < 248; i += 8) {
                    uint8_t cin = midi_in[i] & 0x0F;
                    uint8_t status = midi_in[i+1];
                    uint8_t d1 = midi_in[i+2];
                    if (cin == 0x0B && (status & 0xF0) == 0xB0 && (d1 == 114 || d1 == 115)) {
                        int n = snprintf(line, sizeof(line),
                            "[f%u] IN   slot=%2d cable=%d CC %d val=%d (jack-detect)\n",
                            xmos_frame, i, (midi_in[i] >> 4) & 0xF,
                            d1, midi_in[i+3]);
                        if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
                    }
                    if (cin >= 0x04 && cin <= 0x07) {
                        int n = snprintf(line, sizeof(line),
                            "[f%u] INsys slot=%2d cable=%d cin=0x%x : %02x %02x %02x %02x\n",
                            xmos_frame, i, (midi_in[i] >> 4) & 0xF, cin,
                            midi_in[i], midi_in[i+1], midi_in[i+2], midi_in[i+3]);
                        if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
                        in_any = 1;
                    }
                }
                if (in_any) {
                    int n = snprintf(line, sizeof(line), "[f%u] INsys end\n", xmos_frame);
                    if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
                }
            }
        }
    }

    /* Log any MIDI packets on cable >= 3 in the output buffer (host→XMOS).
     * These are rare control commands, not normal musical MIDI. */
    {
        static int midi_log_fd = -1;
        static int midi_log_checked = 0;
        if (midi_log_checked++ % 4400 == 0) {  /* check every ~10s */
            int want = (shim_debug_flags & SHIM_FLAG_SPI_MIDI_LOG) != 0;
            if (want && midi_log_fd < 0) {
                midi_log_fd = open(SCHWUNG_INSTALL_DIR "/spi_midi_log.txt",
                                   O_WRONLY | O_CREAT | O_APPEND, 0644);
            } else if (!want && midi_log_fd >= 0) {
                close(midi_log_fd);
                midi_log_fd = -1;
            }
        }
        if (midi_log_fd >= 0) {
            const uint8_t *midi_out = shadow + MIDI_OUT_OFFSET;
            for (int i = 0; i < 80; i += 4) {
                if (midi_out[i] || midi_out[i+1] || midi_out[i+2] || midi_out[i+3]) {
                    int cable = (midi_out[i] >> 4) & 0xF;
                    char line[128];
                    int n = snprintf(line, sizeof(line),
                        "OUT [%2d] cable=%2d cin=0x%x : %02x %02x %02x %02x\n",
                        i, cable, midi_out[i] & 0xF,
                        midi_out[i], midi_out[i+1], midi_out[i+2], midi_out[i+3]);
                    write(midi_log_fd, line, n);
                }
            }
            /* Also check incoming MIDI from XMOS */
            unsigned char *hw_buf = schwung_spi_get_hw(g_spi_handle);
            if (hw_buf) {
                const uint8_t *midi_in = hw_buf + 2048;
                for (int i = 0; i < 248; i += 8) {
                    if (midi_in[i] || midi_in[i+1] || midi_in[i+2] || midi_in[i+3]) {
                        int cable = (midi_in[i] >> 4) & 0xF;
                        char line[128];
                        int n = snprintf(line, sizeof(line),
                            "IN  [%2d] cable=%2d cin=0x%x : %02x %02x %02x %02x\n",
                            i, cable, midi_in[i] & 0xF,
                            midi_in[i], midi_in[i+1], midi_in[i+2], midi_in[i+3]);
                        write(midi_log_fd, line, n);
                    }
                }
            }
        }
    }

    /* Ensure subsystems are initialized on first call */
    if (!shim_subsystems_initialized) {
        shim_init_subsystems();
    }

    /* Timing and overrun statics are at file scope (shared between pre/post callbacks) */

    /* Check for baseline timing mode (set SHADOW_BASELINE=1 to disable all processing) */
    if (spi_baseline_mode < 0) {
        const char *env = getenv("SHADOW_BASELINE");
        spi_baseline_mode = (env && env[0] == '1') ? 1 : 0;
#if SHADOW_TIMING_LOG
        if (spi_baseline_mode) {
            FILE *f = fopen(SCHWUNG_INSTALL_DIR "/ioctl_timing.log", "a");
            if (f) { fprintf(f, "=== BASELINE MODE: All processing disabled ===\n"); fclose(f); }
        }
#endif
    }

    clock_gettime(CLOCK_MONOTONIC, &spi_ioctl_start);

    /* === IOCTL GAP DETECTION (always-on, no flag needed) === */
    {
        static struct timespec last_ioctl_time = {0, 0};
        if (last_ioctl_time.tv_sec > 0) {
            uint64_t gap_ms = (spi_ioctl_start.tv_sec - last_ioctl_time.tv_sec) * 1000 +
                              (spi_ioctl_start.tv_nsec - last_ioctl_time.tv_nsec) / 1000000;
            if (gap_ms > 1000) {
                /* No I/O in SPI path — just record the gap for background logger */
                static volatile uint64_t last_gap_ms = 0;
                last_gap_ms = gap_ms;
                (void)last_gap_ms;
            }
        }
        last_ioctl_time = spi_ioctl_start;
    }

    /* === HEARTBEAT (every ~5700 frames / ~100s) === */
    /* Heartbeat logging moved to background timer thread to avoid I/O in SPI path */

    /* === SET DETECTION ===
     * The filesystem scan (Settings.json + per-Set getxattr) runs on the
     * shim worker thread; here we only consume its published snapshot. */
    {
        static uint32_t set_poll_counter = 0;
        set_poll_counter++;
        if (set_poll_counter >= 500) {  /* ~1.5s at 44100/128 */
            set_poll_counter = 0;
            shadow_set_pages_consume();
        }
    }


    /* Check if the previous frame overran its WORK budget — if so, consider
     * skipping expensive work.
     *
     * ⚠⚠ `spi_skip_dsp_this_frame` is currently WRITTEN AND NEVER READ: this is
     * the only site that sets it, the else-branch is the only site that clears
     * it, and nothing consumes it. So there is NO automatic DSP-skip backstop
     * today, despite this block reading like one. Do not cite it as protection.
     * Wiring it up is a deliberate RT behaviour change and needs its own
     * measurement; it is tracked on the board rather than done in passing.
     *
     * The condition itself was also wrong until now: it tested the frame TOTAL,
     * which includes the blocking ioctl and therefore sat at ~one block period
     * on an idle device, making the test a coin flip unrelated to load. It now
     * tests compute against the work budget. */
    if (spi_last_frame_compute_us > SPI_COMPUTE_BUDGET_US) {
        spi_consecutive_overruns++;
        if (spi_consecutive_overruns >= SKIP_DSP_THRESHOLD) {
            spi_skip_dsp_this_frame = 1;
#if SHADOW_TIMING_LOG
            static int skip_log_count = 0;
            if (skip_log_count++ < 10 || skip_log_count % 100 == 0) {
                FILE *f = fopen(SCHWUNG_INSTALL_DIR "/ioctl_timing.log", "a");
                if (f) {
                    fprintf(f, "SKIP_DSP: spi_consecutive_overruns=%d, last_compute=%llu us\n",
                            spi_consecutive_overruns, (unsigned long long)spi_last_frame_compute_us);
                    fclose(f);
                }
            }
#endif
        }
    } else {
        spi_consecutive_overruns = 0;
        spi_skip_dsp_this_frame = 0;
    }

    /* Skip all processing in baseline mode to measure pure Move ioctl time */
    if (spi_baseline_mode) goto pre_done;

    // TODO: Consider using schwung host code and quickjs for flexibility
    TIME_SECTION_START();
    midi_monitor();
    TIME_SECTION_END(spi_midi_mon_sum, spi_midi_mon_max);

    /* Sync the shim's display gate with shared memory in BOTH directions.
     * shadow_control->display_mode is authoritative — shadow_ui arming a
     * session, the dismissal gestures and the D-Bus handover all write it —
     * but the MIDI_IN filter and the display compositor gate on this local
     * copy. Without the upward edge, a session armed while this process
     * missed open_tool_cmd (another reader consumes it on read) runs with
     * hardware input and the panel still routed to Move firmware while every
     * shared flag reads healthy. */
    if (shadow_control) {
        if (shadow_display_mode && !shadow_control->display_mode) {
            shadow_display_mode = 0;
            shadow_inject_knob_release = 1;  /* Inject note-offs when exiting shadow mode */
        } else if (!shadow_display_mode && shadow_control->display_mode) {
            shadow_display_mode = 1;
        }
    }

    /* Check if web UI wants to open a tool — activate shadow display so JS can render */
    if (shadow_control && shadow_control->open_tool_cmd && !shadow_display_mode) {
        shadow_display_mode = 1;
        shadow_control->display_mode = 1;
    }

    /* NOTE: MIDI filtering moved to AFTER ioctl - see post-ioctl section below */

    /* === SHADOW INSTRUMENT: PRE-IOCTL PROCESSING === */

    /* Forward MIDI BEFORE ioctl - hardware clears the buffer during transaction */
    TIME_SECTION_START();
    shadow_forward_midi();
    TIME_SECTION_END(spi_fwd_midi_sum, spi_fwd_midi_max);

    /* Mix shadow audio into mailbox BEFORE hardware transaction */
    TIME_SECTION_START();
    { TRACE_SCOPE("shadow.mix_audio"); shadow_mix_audio(); }
    TIME_SECTION_END(spi_mix_audio_sum, spi_mix_audio_max);

    TIME_SECTION_START();
    shadow_inprocess_handle_ui_request();
    shadow_process_fade_completions();
    TIME_SECTION_END(spi_ui_req_sum, spi_ui_req_max);

    TIME_SECTION_START();
    /* param.serve span is emitted inside the handler, parented to the JS
     * param.get span via the SHM-propagated trace context (Phase 2b). */
    shadow_inprocess_handle_param_request();
    shadow_drain_web_param_set();  /* Web UI fire-and-forget param sets */
    shadow_overtake_rui_probe();   /* Remote-UI push: overtake rui_poll → notify ring */
    TIME_SECTION_END(spi_param_req_sum, spi_param_req_max);

    /* Forward CC/pitch bend/aftertouch from external MIDI to MIDI_OUT so DSP
     * routing can pick them up (Move only echoes notes, not these). Gated on
     * an overtake DSP being loaded — that's the only consumer that needs CCs
     * via the MIDI_OUT path. Chain slots already receive external CCs from
     * MIDI_IN via shadow_dispatch_cable2_channeled_slots / _direct_external_midi
     * (channel-filtered), and the MIDI_OUT cable-2 reader skips chain dispatch
     * for is_external_echo packets when no overtake is loaded. Without this
     * gate the forward leaks every external CC straight back out cable-2 USB,
     * creating self-loops on synths that send+receive on the same channel
     * (e.g. Bastl Alchemist's mode CC). */
    TIME_SECTION_START();
    if (overtake_dsp_gen_inst || overtake_dsp_fx_inst) {
        shadow_forward_external_cc_to_out();
    }
    TIME_SECTION_END(spi_fwd_ext_cc_sum, spi_fwd_ext_cc_max);

    /* Advance the external-dispatch ring's age counter once per frame. */
    shadow_external_dispatch_tick();

    /* MIDI channel indicator: scan external (cable 2) MIDI_IN and MIDI_OUT for
     * note events and record the channels for the on-screen "i<IN> o<OUT>"
     * overlay. IN = what the controller sends; OUT = what Schwung emits back to
     * the external device (post MIDI-FX/remap). Done here (raw cable-2 buffers)
     * rather than in the chain dispatch path so the indicator reflects the
     * actual external channels, not a post-routing/echo channel. Held-note
     * counter is driven by the IN side so the label shows only while a key is
     * down. Runs every frame; cable-2 events appear once (same buffers the
     * cable-2 readers below consume), so the counter tracks key-down state. */
    if (global_mmap_addr) {
        extern int midi_indicator_in_channel;
        extern int midi_indicator_out_channel;
        extern int midi_indicator_active_notes;
        extern int midi_indicator_out_active_notes;
        const uint8_t *mi = global_mmap_addr + MIDI_IN_OFFSET;
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            if (((mi[j] >> 4) & 0x0F) != 2) continue;  /* cable 2 only */
            uint8_t st = mi[j + 1], ty = st & 0xF0, d1b = mi[j + 2], d2b = mi[j + 3];
            if (ty == 0x90 && d2b > 0) {
                midi_indicator_in_channel = (int)(st & 0x0F) + 1;
                midi_indicator_active_notes++;
            } else if (ty == 0x80 || (ty == 0x90 && d2b == 0)) {
                if (midi_indicator_active_notes > 0) midi_indicator_active_notes--;
            } else if (ty == 0xB0 && (d1b == 120 || d1b == 123)) {
                midi_indicator_active_notes = 0;
            }
        }
        /* OUT side: cable-2 MIDI_OUT note-ons — i.e. notes Schwung forwards back
         * out to the external device for what you're playing in. (Clip/track
         * MIDI-out doesn't reach this SPI mailbox in shadow mode, so the OUT
         * side only lights for forwarded external input, not clips.) */
        const uint8_t *mo = global_mmap_addr + MIDI_OUT_OFFSET;
        /* MIDI_OUT region is 20 x 4-byte packets (80 bytes) — scanning to
         * MIDI_BUFFER_SIZE would read display bytes as MIDI. */
        for (int j = 0; j < 80; j += 4) {
            if (((mo[j] >> 4) & 0x0F) != 2) continue;  /* cable 2 only */
            uint8_t st = mo[j + 1], ty = st & 0xF0, d1b = mo[j + 2], d2b = mo[j + 3];
            if (ty == 0x90 && d2b > 0) {
                midi_indicator_out_channel = (int)(st & 0x0F) + 1;
                midi_indicator_out_active_notes++;
            } else if (ty == 0x80 || (ty == 0x90 && d2b == 0)) {
                if (midi_indicator_out_active_notes > 0) midi_indicator_out_active_notes--;
            } else if (ty == 0xB0 && (d1b == 120 || d1b == 123)) {
                midi_indicator_out_active_notes = 0;
            }
        }
    }

    /* Direct MIDI dispatch for MPE passthrough slots (receive=All, forward=THRU).
     * Reads MIDI_IN cable 2 and dispatches all message types directly to these
     * slots, bypassing Move's MIDI_OUT channel remapping. */
    TIME_SECTION_START();
    shadow_dispatch_direct_external_midi();
    TIME_SECTION_END(spi_direct_midi_sum, spi_direct_midi_max);

    /* When no tool module is active (or a module is suspended), dispatch
     * cable-2 events to Schwung chain slots by channel so Schwung instruments
     * respond.  Move's native instruments already receive cable-2 directly
     * via the firmware DSP's channel router — no shim-side reinjection
     * needed (PR #78's cable-0 reinjection caused channel-1 notes to trip
     * Move's pad/clip protocol; removed). */
    if (shadow_control &&
        (shadow_control->overtake_mode == 0 || shadow_control->suspend_overtake)) {
        shadow_dispatch_cable2_channeled_slots();
    }

    TIME_SECTION_START();
    { TRACE_SCOPE("midi.process"); shadow_inprocess_process_midi(); }
    TIME_SECTION_END(spi_proc_midi_sum, spi_proc_midi_max);

    /* Stash MIDI_OUT cable-2 sequencer notes before SPI ioctl consumes them.
     * The bridge picks these up post-transfer and appends to ext_midi_to_jack. */
    TIME_SECTION_START();
    if (g_jack_shm && shadow_control) {
        schwung_jack_bridge_stash_midi_out(
            global_mmap_addr + MIDI_OUT_OFFSET,
            shadow_control->overtake_mode);
    }
    TIME_SECTION_END(spi_jack_stash_sum, spi_jack_stash_max);

    /* Drain MIDI-to-DSP from shadow UI (overtake modules sending to chain slots) */
    TIME_SECTION_START();
    shadow_drain_ui_midi_dsp();
    TIME_SECTION_END(spi_drain_ui_midi_sum, spi_drain_ui_midi_max);

    /* Wake JACK early so it computes audio in parallel with DSP render.
     * Audio is read inside mix_from_buffer (before master FX/volume). */
    TIME_SECTION_START();
    schwung_jack_bridge_wake(g_jack_shm);
    TIME_SECTION_END(spi_jack_wake_sum, spi_jack_wake_max);

    /* Pre-ioctl: Mix from pre-rendered buffer (FAST, ~5µs)
     * DSP was rendered post-ioctl in the previous frame.
     * This adds ~3ms latency but lets Move process pad events faster.
     */
    static uint64_t mix_time_sum = 0;
    static int mix_time_count = 0;
    static uint64_t mix_time_max = 0;

    /* Always run pre-ioctl mix/capture path.
     * This path is lightweight and feeds native bridge state; skipping it causes
     * stale/invalid bridge snapshots and inconsistent resample behavior. */
    {
        struct timespec mix_start, mix_end;
        clock_gettime(CLOCK_MONOTONIC, &mix_start);

        shadow_inprocess_mix_from_buffer();  /* Fast: memcpy+mix (FX deferred to post-ioctl) */

        clock_gettime(CLOCK_MONOTONIC, &mix_end);
        uint64_t mix_us = (mix_end.tv_sec - mix_start.tv_sec) * 1000000 +
                          (mix_end.tv_nsec - mix_start.tv_nsec) / 1000;
        mix_time_sum += mix_us;
        mix_time_count++;
        if (mix_us > mix_time_max) mix_time_max = mix_us;

        /* Track in granular timing */
        spi_inproc_mix_sum += mix_us;
        if (mix_us > spi_inproc_mix_max) spi_inproc_mix_max = mix_us;
    }

    /* Update publisher shm slot active flags (subscriber reads these).
     * When Link Audio is receiving Move per-track audio, always mark all
     * 4 slots active so Live sees ME-1 through ME-4 even without synths.
     * The mix_from_buffer path publishes Move audio for inactive slots.
     * If link_audio_publish_enabled is off, deactivate all slots so the
     * subscriber won't create sinks and no shadow audio flows to Live. */
    if (shadow_pub_audio_shm && link_audio.enabled) {
        if (!link_audio_publish_enabled) {
            for (int i = 0; i < LINK_AUDIO_SHADOW_CHANNELS; i++)
                shadow_pub_audio_shm->slots[i].active = 0;
            shadow_pub_audio_shm->slots[LINK_AUDIO_PUB_MASTER_IDX].active = 0;
            shadow_pub_audio_shm->num_slots = 0;
        } else {
            int la_flowing = (shim_move_channel_count() >= 4);
            for (int i = 0; i < LINK_AUDIO_SHADOW_CHANNELS; i++) {
                int is_active = la_flowing ||
                                (i < SHADOW_CHAIN_INSTANCES &&
                                 shadow_chain_slots[i].active &&
                                 shadow_chain_slots[i].instance != NULL);
                shadow_pub_audio_shm->slots[i].active = is_active;
            }
            /* Master slot is always active when Link Audio is flowing */
            shadow_pub_audio_shm->slots[LINK_AUDIO_PUB_MASTER_IDX].active = la_flowing;
            shadow_pub_audio_shm->num_slots = la_flowing ? LINK_AUDIO_PUB_SLOT_COUNT : 0;
        }
    }

    /* Mix TTS audio AFTER inprocess mix (which may zero-rebuild mailbox for Link Audio) */
    TIME_SECTION_START();
    shadow_mix_tts();
    TIME_SECTION_END(spi_tts_mix_sum, spi_tts_mix_max);

    /* Signal Link Audio publisher thread to drain accumulated audio */
    if (link_audio.publisher_running) {
        link_audio.publisher_tick = 1;
    }

    /* Log pre-ioctl mix timing every 1000 blocks (~23 seconds) */
    if (mix_time_count >= 1000) {
#if SHADOW_TIMING_LOG
        uint64_t avg = mix_time_sum / mix_time_count;
        FILE *f = fopen(SCHWUNG_INSTALL_DIR "/dsp_timing.log", "a");
        if (f) {
            fprintf(f, "Pre-ioctl mix (from buffer): avg=%llu us, max=%llu us\n",
                    (unsigned long long)avg, (unsigned long long)mix_time_max);
            fclose(f);
        }
#endif
        mix_time_sum = 0;
        mix_time_count = 0;
        mix_time_max = 0;
    }

    /* === SLICE-BASED DISPLAY CAPTURE FOR VOLUME === */
    TIME_SECTION_START();  /* Start timing display section */
    static uint8_t captured_slices[6][172];
    static uint8_t slice_fresh[6] = {0};  /* Reset each time we want new capture */
    static int volume_capture_active = 0;
    static int volume_capture_cooldown = 0;
    static int volume_capture_warmup = 0;  /* Wait for Move to render overlay */

    /* Native Move display is visible either when shadow mode is off, when
     * plain volume-touch temporarily hides shadow UI to reveal Move overlays,
     * or when a PIN challenge is active (so the PIN scanner can read the PIN).
     * shadow_swap_display() hands the frame back to Move on plain volume
     * touch in overtake too, so we scan the volume bar regardless of
     * overtake_mode — otherwise audio scales to whatever volume was active
     * when overtake engaged. */
    int pin_challenge = shadow_control && shadow_control->pin_challenge_active == 1;
    int corun_owns_native_oled = shadow_control &&
        shadow_control->shadow_display_owner == DISPLAY_OWNER_MOVE_FIRMWARE;
    int native_display_visible = (!shadow_display_mode) ||
                                 (shadow_display_mode &&
                                  shadow_volume_knob_touched &&
                                  !shadow_shift_held &&
                                  shadow_control) ||
                                 corun_owns_native_oled ||
                                 pin_challenge;

    if (global_mmap_addr && native_display_visible) {
        uint8_t *mem = (uint8_t *)global_mmap_addr;
        uint8_t slice_num = mem[80];

        /* Always capture incoming slices */
        if (slice_num >= 1 && slice_num <= 6) {
            int idx = slice_num - 1;
            int bytes = (idx == 5) ? 164 : 172;
            memcpy(captured_slices[idx], mem + 84, 172);
            slice_fresh[idx] = 1;

            /* Always accumulate into PIN display buffer for dump trigger */
            pin_accumulate_slice(idx, mem + 84, bytes);
        }

        /* When volume knob touched (and no track or pad held), start capturing.
         * Pad+volume adjusts pad gain and shows a gain overlay, not the
         * master volume overlay — reading it would set master volume wrong. */
        if (shadow_volume_knob_touched && shadow_held_track < 0 && shadow_pads_held == 0) {
            if (!volume_capture_active) {
                volume_capture_active = 1;
                volume_capture_warmup = 18;  /* Wait ~3 frames (6 slices * 3) for overlay to render */
                memset(slice_fresh, 0, 6);  /* Reset freshness */
            }

            /* Decrement warmup and skip reading until warmup complete */
            if (volume_capture_warmup > 0) {
                volume_capture_warmup--;
                memset(slice_fresh, 0, 6);  /* Discard stale slices during warmup */
            }

            /* Check if all slices are fresh */
            int all_fresh = 1;
            for (int i = 0; i < 6; i++) {
                if (!slice_fresh[i]) all_fresh = 0;
            }

            if (all_fresh && volume_capture_cooldown == 0) {
                /* Reconstruct display */
                uint8_t full_display[1024];
                for (int s = 0; s < 6; s++) {
                    int offset = s * 172;
                    int bytes = (s == 5) ? 164 : 172;
                    memcpy(full_display + offset, captured_slices[s], bytes);
                }

                /* Find the volume position indicator in the gap between VU bars.
                 * Rows 30-32 are blank on the volume overlay except for the 1-pixel
                 * vertical indicator.  Require: vertical alignment on rows 30+31+32
                 * at the same column AND the gap rows are otherwise blank (total lit
                 * pixels across all three rows <= 6).  Waveform screens have many
                 * scattered pixels on these rows. */
                int bar_col = -1;
                int gap_total_lit = 0;
                {
                    int page3 = 30 / 8;  /* page 3 for rows 30-31 */
                    int page4 = 32 / 8;  /* page 4 for row 32 */
                    int bit30 = 30 % 8;
                    int bit31 = 31 % 8;
                    int bit32 = 32 % 8;
                    for (int col = 0; col < 128; col++) {
                        int l30 = !!(full_display[page3 * 128 + col] & (1 << bit30));
                        int l31 = !!(full_display[page3 * 128 + col] & (1 << bit31));
                        int l32 = !!(full_display[page4 * 128 + col] & (1 << bit32));
                        gap_total_lit += l30 + l31 + l32;
                        if (l30 && l31 && l32 && bar_col < 0)
                            bar_col = col;
                    }
                }

                if (bar_col >= 0 && gap_total_lit <= 6) {
                    float normalized = (float)(bar_col - 4) / (122.0f - 4.0f);
                    if (normalized < 0.0f) normalized = 0.0f;
                    if (normalized > 1.0f) normalized = 1.0f;

                    /* Map pixel bar position to amplitude matching Move's volume curve.
                     * Piecewise-linear in dB through points measured from Move's
                     * Settings.json globalVolume. The old closed-form sqrt model
                     * (dB = -70*(1-sqrt(pos))) missed every measured point by 1-2 dB:
                     *   pos 0.25 → -33.2 dB (sqrt model: -35.0)
                     *   pos 0.50 → -19.9 dB (sqrt model: -20.5)
                     *   pos 0.75 → -10.4 dB (sqrt model:  -9.4)
                     *   pos 1.00 →   0.0 dB (sqrt model:   0.0)
                     * Under Move>Schwung (rebuild_from_la) Schwung re-applies this
                     * estimate as master volume, so a 1-2 dB error here is an audible
                     * level jump on toggle (even on headphones). Interpolating through
                     * the measured points is exact at the knots and close between. */
                    float amplitude;
                    if (normalized <= 0.0f) {
                        amplitude = 0.0f;
                    } else if (normalized >= 1.0f) {
                        amplitude = 1.0f;
                    } else {
                        static const float knot_pos[] = { 0.0f, 0.25f, 0.50f, 0.75f, 1.0f };
                        static const float knot_db[]  = { -70.0f, -33.2f, -19.9f, -10.4f, 0.0f };
                        float db = knot_db[4];
                        for (int kk = 1; kk < 5; kk++) {
                            if (normalized <= knot_pos[kk]) {
                                float span = knot_pos[kk] - knot_pos[kk - 1];
                                float t = (normalized - knot_pos[kk - 1]) / span;
                                db = knot_db[kk - 1] + t * (knot_db[kk] - knot_db[kk - 1]);
                                break;
                            }
                        }
                        amplitude = powf(10.0f, db / 20.0f);
                    }

                    if (amplitude == 0.0f || fabsf(amplitude - shadow_master_volume) > 0.003f) {
                        shadow_master_volume = amplitude;
                        /* Persist as it moves, not at shutdown: the shim can be
                         * killed outright (the relaunch loop escalates to
                         * kill -9), and a value only written on a clean exit is
                         * a value that is usually not written. */
                        sa_master_volume_store(amplitude);
                        float db_val = (amplitude > 0.0f) ? (20.0f * log10f(amplitude)) : -99.0f;
                        char msg[112];
                        snprintf(msg, sizeof(msg), "Master volume: x=%d pos=%.3f dB=%.1f amp=%.4f", bar_col, normalized, db_val, amplitude);
                        shadow_log(msg);
                    }
                }

                memset(slice_fresh, 0, 6);  /* Reset for next capture */
                volume_capture_cooldown = 12;  /* ~2 display frames between reads */
            }
        } else {
            volume_capture_active = 0;
            volume_capture_warmup = 0;  /* Reset warmup for next touch */
        }

        if (volume_capture_cooldown > 0) volume_capture_cooldown--;

        /* === OVERLAY COMPOSITING ===
         * JS sets display_overlay in shadow_control_t:
         *   0 = off (normal native display)
         *   1 = rect overlay (blit rect from shadow display onto native)
         *   2 = fullscreen (replace native display with shadow display)
         * All overlays (sampler, skipback, shift+knob) are JS-rendered. */
        int shift_knob_overlay_on = (shift_knob_overlay_active && shift_knob_overlay_timeout > 0);
        int sampler_overlay_on = (sampler_overlay_active &&
                                  (sampler_state != SAMPLER_IDLE || sampler_overlay_timeout > 0));
        int sampler_fullscreen_on = (sampler_fullscreen_active &&
                                     (sampler_state != SAMPLER_IDLE || sampler_overlay_timeout > 0));
        int skipback_overlay_on = (skipback_overlay_timeout > 0);
        int recording_dot_on = (sampler_state == SAMPLER_RECORDING);

        /* Read JS display_overlay request */
        uint8_t disp_overlay = shadow_control ? shadow_control->display_overlay : 0;

        int any_overlay = shift_knob_overlay_on || sampler_overlay_on ||
                          sampler_fullscreen_on || skipback_overlay_on ||
                          disp_overlay || recording_dot_on;
        if (any_overlay && slice_num >= 1 && slice_num <= 6) {
            static uint8_t overlay_display[1024];
            static int overlay_frame_ready = 0;

            if (slice_num == 1) {
                /* Track MIDI clock staleness (once per frame) */
                if (sampler_clock_active) {
                    sampler_clock_stale_frames++;
                    if (sampler_clock_stale_frames > SAMPLER_CLOCK_STALE_THRESHOLD) {
                        sampler_clock_active = 0;
                        sampler_clock_stale_frames = 0;
                    }
                }

                /* Update VU / sync for sampler when overlay active */
                if (sampler_fullscreen_on || sampler_overlay_on) {
                    sampler_update_vu();
                    shadow_overlay_sync();
                }

                if (disp_overlay == 2 && shadow_display_shm) {
                    /* JS fullscreen: replace native display with shadow display */
                    memcpy(overlay_display, shadow_display_shm, 1024);
                    overlay_frame_ready = 1;
                } else if (disp_overlay == 1 && shadow_display_shm && shadow_control) {
                    /* JS rect overlay: reconstruct native, blit shadow rect on top */
                    int all_present = 1;
                    for (int i = 0; i < 6; i++) {
                        if (!slice_fresh[i]) all_present = 0;
                    }
                    if (all_present) {
                        for (int s = 0; s < 6; s++) {
                            int offset = s * 172;
                            int bytes = (s == 5) ? 164 : 172;
                            memcpy(overlay_display + offset, captured_slices[s], bytes);
                        }
                        overlay_blit_rect(overlay_display, shadow_display_shm,
                                          shadow_control->overlay_rect_x,
                                          shadow_control->overlay_rect_y,
                                          shadow_control->overlay_rect_w,
                                          shadow_control->overlay_rect_h);
                        overlay_frame_ready = 1;
                    }
                } else if (!disp_overlay) {
                    overlay_frame_ready = 0;
                }

                /* Recording dot: flashing white dot in top-right corner. */

                if (recording_dot_on) {
                    /* If no other overlay provided a base frame, reconstruct native */
                    if (!overlay_frame_ready) {
                        int all_present = 1;
                        for (int i = 0; i < 6; i++) {
                            if (!slice_fresh[i]) all_present = 0;
                        }
                        if (all_present) {
                            for (int s = 0; s < 6; s++) {
                                int offset = s * 172;
                                int bytes = (s == 5) ? 164 : 172;
                                memcpy(overlay_display + offset, captured_slices[s], bytes);
                            }
                            overlay_frame_ready = 1;
                        }
                    }

                    /* Draw dot on visible half of flash cycle (~0.5s on, 0.5s off) */
                    if (overlay_frame_ready && rec_dot_visible()) {
                        overlay_fill_rect(overlay_display, 123, 1, 4, 4, 1);
                    }
                }

                /* Decrement timeouts once per frame */
                if (shift_knob_overlay_on) {
                    shift_knob_overlay_timeout--;
                    if (shift_knob_overlay_timeout <= 0) {
                        shift_knob_overlay_active = 0;
                        shadow_overlay_sync();
                    }
                }
                if ((sampler_overlay_on || sampler_fullscreen_on) && sampler_state == SAMPLER_IDLE) {
                    sampler_overlay_timeout--;
                    if (sampler_overlay_timeout <= 0) {
                        sampler_overlay_active = 0;
                        sampler_fullscreen_active = 0;
                        shadow_overlay_sync();
                    }
                }
                if (skipback_overlay_on) {
                    skipback_overlay_timeout--;
                    if (skipback_overlay_timeout <= 0)
                        shadow_overlay_sync();
                }
                if (!any_overlay)
                    overlay_frame_ready = 0;
            }

            /* Copy overlay-composited slice back to mailbox */
            if (overlay_frame_ready) {
                int idx = slice_num - 1;
                int offset = idx * 172;
                int bytes = (idx == 5) ? 164 : 172;
                memcpy(mem + 84, overlay_display + offset, bytes);
            }
        }
    }

    /* Update VU meter during recording even when overtake module owns the display */
    if (sampler_state == SAMPLER_RECORDING) {
        sampler_update_vu();
        shadow_overlay_sync();
    }

    /* Write display BEFORE ioctl - overwrites Move's content right before send */
    shadow_swap_display();
    TIME_SECTION_END(spi_display_sum, spi_display_max);  /* End timing display section */

    /* Composite JACK display with skipback toast overlay when active.
     * Used for both the remote mirror and the physical OLED (via bridge_pre). */
    static uint8_t composited_jack_display[DISPLAY_BUFFER_SIZE];
    int jack_display_composited = 0;
    if (g_jack_shm && g_jack_shm->display_active) {
        memcpy(composited_jack_display, g_jack_shm->display_data, DISPLAY_BUFFER_SIZE);
        if (skipback_overlay_timeout > 0) {
            overlay_draw_skipback_toast(composited_jack_display);
        }
        if (sampler_state == SAMPLER_RECORDING && rec_dot_visible()) {
            overlay_fill_rect(composited_jack_display, 123, 1, 4, 4, 1);
        }
        extern int midi_indicator_active_notes;
        if (shadow_control && shadow_control->midi_indicator_enabled
            && midi_indicator_active_notes > 0) {
            overlay_draw_midi_indicator(composited_jack_display);
        }
        jack_display_composited = 1;
    }

    /* Capture final display to live shm for remote viewer.
     * Shadow mode: copy from shadow display shm (full composited frame).
     * Native mode: reconstruct from captured slices (written above). */
    if (display_live_shm && shadow_control && shadow_control->display_mirror) {
        if (jack_display_composited) {
            memcpy(display_live_shm, composited_jack_display, DISPLAY_BUFFER_SIZE);
        } else if (shadow_display_mode && shadow_display_shm) {
            memcpy(display_live_shm, shadow_display_shm, DISPLAY_BUFFER_SIZE);
        } else {
            static uint8_t live_native[DISPLAY_BUFFER_SIZE];
            static int live_slice_seen[6] = {0};
            uint8_t cur_slice = global_mmap_addr ? ((uint8_t *)global_mmap_addr)[80] : 0;
            if (cur_slice >= 1 && cur_slice <= 6) {
                int idx = cur_slice - 1;
                int bytes = (idx == 5) ? 164 : 172;
                memcpy(live_native + idx * 172, (uint8_t *)global_mmap_addr + 84, bytes);
                live_slice_seen[idx] = 1;
                /* On last slice, push full frame */
                if (cur_slice == 6) {
                    int all = 1;
                    for (int i = 0; i < 6; i++) { if (!live_slice_seen[i]) all = 0; }
                    if (all) {
                        memcpy(display_live_shm, live_native, DISPLAY_BUFFER_SIZE);
                        memset(live_slice_seen, 0, sizeof(live_slice_seen));
                    }
                }
            }
        }
        /* Overlay recording dot on live mirror too */
        if (sampler_state == SAMPLER_RECORDING && rec_dot_visible()) {
            overlay_fill_rect(display_live_shm, 123, 1, 4, 4, 1);
        }
    }

    /* === PIN CHALLENGE SCANNER ===
     * Check if a web PIN challenge is active and speak the digits. */
    TIME_SECTION_START();
    pin_check_and_speak();
    TIME_SECTION_END(spi_pin_sum, spi_pin_max);

    /* Mark end of pre-ioctl processing */
    clock_gettime(CLOCK_MONOTONIC, &spi_pre_end);

pre_done:
    /* In baseline mode, spi_pre_end wasn't set - set it now */
    if (spi_baseline_mode) clock_gettime(CLOCK_MONOTONIC, &spi_pre_end);

    /* === SHADOW UI MIDI OUT (PRE-IOCTL) ===
     * Inject any MIDI from shadow UI into the mailbox before sync.
     * In overtake mode, also clears Move's cable 0 packets when shadow has new data. */
    TIME_SECTION_START();
    shadow_clear_move_leds_if_overtake();  /* Free buffer space before inject */
    shim_select_blank_move_leds();         /* Mid-session picker entry: no instrument-UI flash */
    TIME_SECTION_END(spi_clear_leds_sum, spi_clear_leds_max);

    /* Phase 2: drain ROUTE_EXTERNAL ring (overtake DSPs pushed into it via
     * g_host->midi_send_external on their audio thread) into the mailbox
     * MIDI_OUT region. Runs BEFORE the JACK writer so sequencer notes get
     * slot priority over JACK chain MIDI when both compete for the 20-slot
     * budget. Audio-thread safe (no syscalls, no logging). */
    overtake_ext_drain_into_shadow(shadow);

    /* Route JACK MIDI output to SPI buffer.
     * The JACK driver writes packets to midi_from_jack[] and sets count.
     * We read ALL of them each frame (up to 20 = SPI hardware limit).
     * The driver clears count to 0 when queue is empty, so we only
     * process fresh data. */
    /* Only write JACK MIDI output to hardware during overtake mode.
     * During suspend (mode 0), RNBO's sysex LED commands would conflict
     * with Move's LEDs and the cache would be overwritten with stale data. */
    TIME_SECTION_START();
    if (g_jack_shm && g_jack_shm->midi_from_jack_count > 0 &&
        shadow_control && shadow_control->overtake_mode >= 2) {
        uint8_t *midi_out = shadow + MIDI_OUT_OFFSET;
        uint8_t count = g_jack_shm->midi_from_jack_count;
        const int HW_MIDI_LIMIT = 80;
        int slot = 0;
        int written = 0;
        int empty_found = 0;

        /* Count empty slots before writing */
        for (int s = 0; s < HW_MIDI_LIMIT; s += 4) {
            if (!midi_out[s] && !midi_out[s+1] && !midi_out[s+2] && !midi_out[s+3])
                empty_found++;
        }

        /* During sysex restore, gate RNBO's sysex output from the buffer.
         * Both share cable 0 — interleaved sysex on the same cable corrupts
         * the hardware's sysex parser. After restore completes, RNBO's live
         * sysex flows normally and re-establishes its LED state. */
        int gate_sysex = led_queue_jack_sysex_restore_pending();

        for (uint8_t i = 0; i < count && i < 20; i++) {
            SchwungJackUsbMidiMsg m = g_jack_shm->midi_from_jack[i];
            uint8_t cin_type = m.cin & 0x0F;

            /* Skip sysex packets during restore to prevent interleaving */
            if (gate_sysex && cin_type >= 0x04 && cin_type <= 0x07) {
                /* Still cache the sysex for future suspend/resume cycles */
                uint8_t raw_cin = m.cin | (m.cable << 4);
                uint8_t jack_status = (m.midi.type << 4) | m.midi.channel;
                led_queue_jack_sysex_packet(raw_cin, jack_status, m.midi.data1, m.midi.data2);
                continue;
            }

            /* Find empty slot */
            while (slot < HW_MIDI_LIMIT &&
                   (midi_out[slot] || midi_out[slot+1] || midi_out[slot+2] || midi_out[slot+3]))
                slot += 4;
            if (slot >= HW_MIDI_LIMIT) break;

            midi_out[slot]   = m.cin | (m.cable << 4);
            midi_out[slot+1] = (m.midi.type << 4) | m.midi.channel;
            midi_out[slot+2] = m.midi.data1;
            midi_out[slot+3] = m.midi.data2;
            slot += 4;
            written++;

            /* Cache LED state from JACK output for suspend/resume.
             * Only cache during overtake (mode >= 2). During suspend (mode 0),
             * RNBO may send LED-off commands that would overwrite the cache. */
            if (shadow_control && shadow_control->overtake_mode >= 2) {
                uint8_t raw_cin = m.cin | (m.cable << 4);
                uint8_t jack_status = (m.midi.type << 4) | m.midi.channel;
                uint8_t jack_type = jack_status & 0xF0;
                /* Note/CC LEDs */
                if (jack_type == 0x90 || jack_type == 0xB0) {
                    led_queue_cache_jack_led(raw_cin, jack_status, m.midi.data1, m.midi.data2);
                }
                /* Sysex LED commands (RNBO uses sysex for LED colors) */
                led_queue_jack_sysex_packet(raw_cin, jack_status, m.midi.data1, m.midi.data2);
            }
        }

        /* Debug: store at offset 3900 */
        ((uint8_t *)g_jack_shm)[3900] = (uint8_t)count;
        ((uint8_t *)g_jack_shm)[3901] = (uint8_t)written;
        ((uint8_t *)g_jack_shm)[3902] = (uint8_t)empty_found;
        ((uint8_t *)g_jack_shm)[3903]++;  /* frame counter */
        /* Copy first 80 bytes of shadow MIDI out */
        memcpy(((uint8_t *)g_jack_shm) + 3800, midi_out, 80);
    }

    TIME_SECTION_END(spi_jack_midi_out_sum, spi_jack_midi_out_max);

    /* Copy pad LED colors (notes 68-99) to overlay SHM for shadow_ui to read */
    if (shadow_overlay_shm) {
        for (int i = 0; i < 32; i++) {
            int color = led_queue_get_note_led_color(68 + i);
            shadow_overlay_shm->pad_led_colors[i] = (color >= 0) ? (uint8_t)color : 0;
        }
    }
    TIME_SECTION_START();
    shadow_inject_ui_midi_out();
    TIME_SECTION_END(spi_ui_midi_out_sum, spi_ui_midi_out_max);

    TIME_SECTION_START();
    shadow_flush_pending_leds();  /* Rate-limited LED output */
    /* Second blanking pass: the overtake-exit LED CACHE REPLAY (and any
     * other queued writer above) lands in the mailbox AFTER the first pass —
     * on a headless switch that replay is Move's cached NATIVE pad state,
     * repainted progressively right as the tool suspends ("shows native UI
     * right after hitting a pad", hardware 2026-08-07). Strip once more
     * after every writer so nothing native reaches the hardware while the
     * gate owns the surface. No-op when the phase is down. */
    shim_select_blank_move_leds();
    TIME_SECTION_END(spi_flush_leds_sum, spi_flush_leds_max);

    /* === SCREEN READER ANNOUNCEMENTS ===
     * Check for and send accessibility announcements via D-Bus. */
    TIME_SECTION_START();
    shadow_check_screenreader_announcements();
    TIME_SECTION_END(spi_screenreader_sum, spi_screenreader_max);

    /* === SHORTCUT INDICATOR LED ===
     * Step 13 icon (CC 28) = Tools, lit while Shift is held. The Settings
     * icon died with the Global Settings gesture (its menu is opened from
     * the primary module's own menu as a service).
     * NOT while an overtake module runs — it owns the step LEDs (and delta-
     * caches them, so a shim write would desync its cache from the LED). */
    {
        static int step13_lit = 0;
        int want_step13 = shadow_shift_held &&
                          (!shadow_control || shadow_control->overtake_mode == 0);
        if (want_step13 && !step13_lit) {
            shadow_queue_led(0x0B, 0xB0, 28, 118);  /* Step 13 icon = LightGrey (Tools) */
            step13_lit = 1;
        } else if (!want_step13 && step13_lit) {
            shadow_queue_led(0x0B, 0xB0, 28, 0);
            step13_lit = 0;
        }
    }

    /* Shift+Step13 long-press threshold: held past 500ms with Shift still
     * down -> resume the most-recently-suspended tool (the tap already
     * opened the Tools menu; the hold skips it). */
    if (step13_longpress_pending && !step13_longpress_fired &&
        shadow_shift_held && shadow_control && shadow_ui_enabled &&
        long_press_elapsed(&step13_press_time)) {
        step13_longpress_fired = 1;
        step13_longpress_pending = 0;
        shadow_control->resume_last_tool = 1;
        shadow_control->ui_flags |= SHADOW_UI_FLAG_JUMP_TO_TOOLS;
        shadow_display_mode = 1;
        shadow_control->display_mode = 1;
        launch_shadow_ui_reset_backoff();
        launch_shadow_ui();
        shadow_log("Shift+Step13 long-press: resuming last tool");
    }

    /* Capture the SPI fd for use by overtake_midi_send_external */
    if (shadow_spi_fd < 0 && hardware_mmap_addr) {
        shadow_spi_fd = schwung_spi_get_fd(g_spi_handle);
    }

    /* Handle JACK display (audio is mixed earlier in mix_from_buffer) */
    TIME_SECTION_START();
    schwung_jack_bridge_pre(g_jack_shm, shadow);
    TIME_SECTION_END(spi_jack_pre_sum, spi_jack_pre_max);

    /* Overwrite display chunk with composited version (includes skipback toast). */
    TIME_SECTION_START();
    if (jack_display_composited && g_jack_shm->display_active) {
        uint32_t idx = *(uint32_t *)(shadow + SCHWUNG_OFF_IN_DISP_STAT);
        if (idx >= 1 && idx <= 5) {
            memcpy(shadow + SCHWUNG_OFF_OUT_DISP_DATA,
                   composited_jack_display + (idx - 1) * SCHWUNG_OUT_DISP_CHUNK_LEN,
                   SCHWUNG_OUT_DISP_CHUNK_LEN);
        } else if (idx == 6) {
            memcpy(shadow + SCHWUNG_OFF_OUT_DISP_DATA,
                   composited_jack_display + 5 * SCHWUNG_OUT_DISP_CHUNK_LEN,
                   DISPLAY_BUFFER_SIZE - 5 * SCHWUNG_OUT_DISP_CHUNK_LEN);
        }
    }
    TIME_SECTION_END(spi_jack_disp_sum, spi_jack_disp_max);

    /* Mute Move's audio output when requested (e.g. during silent clip switching).
     * Zero the audio region in shadow BEFORE the library copies shadow→hw. */
    if (shadow_control && shadow_control->mute_move_audio) {
        memset(shadow + AUDIO_OUT_OFFSET, 0,
               DISPLAY_OFFSET - AUDIO_OUT_OFFSET);
    }
}

/* === Cable-2 (external USB) MIDI channel remap ===
 *
 * Active overtake modules can write a 16-entry channel remap table into
 * /schwung-ext-midi-remap. The shim reads this table on every SPI frame
 * (in post_transfer, after the ioctl populates hw MIDI_IN with the
 * current frame's events, before the ioctl wrapper returns to Move) and
 * rewrites the channel byte of cable-2 MIDI_IN events in-place. Both the
 * hw mailbox and shadow buffer are mutated so Move firmware and shim
 * pre-transfer readers (next frame) see consistent data.
 *
 * The remap is bypassed globally whenever any chain slot is configured
 * forward=THRU (MPE passthrough), because remapping channels destroys
 * per-channel expression data MPE relies on.
 *
 * Solves the cable-2 echo cascade documented in docs/MIDI_INJECTION.md
 * by rewriting in-place rather than re-injecting from JS.
 */
static int any_thru_slot_active(void) {
    for (int i = 0; i < SHADOW_CHAIN_INSTANCES; i++) {
        if (shadow_chain_slots[i].forward_channel == SHADOW_FORWARD_THRU) {
            return 1;
        }
    }
    return 0;
}

static void shim_remap_cable2_channels(uint8_t *shadow) {
    if (!ext_midi_remap_feature_enabled) return;  /* Feature flag kill switch */
    if (!ext_midi_remap_shm || !ext_midi_remap_shm->enabled) return;
    if (!hardware_mmap_addr) return;
    if (any_thru_slot_active()) return;           /* MPE passthrough wins */

    /* MIDI_IN events are 8 bytes (4 USB-MIDI + 4 timestamp); stride at 8.
     * 4-byte stride would hit timestamp bytes, corrupt the contiguous event
     * run, and produce SIGABRT deep in Move's stack. */
    uint8_t *hw_buf = hardware_mmap_addr + MIDI_IN_OFFSET;
    uint8_t *sh_buf = shadow ? (shadow + MIDI_IN_OFFSET) : NULL;
    const int MIDI_IN_MAX_BYTES = 8 * 31;     /* 31 events × 8 bytes */

    for (int j = 0; j < MIDI_IN_MAX_BYTES; j += 8) {
        uint8_t header = hw_buf[j];
        if (header == 0) continue;            /* empty slot — later slots can
                                                 still hold events (the filter
                                                 zeroes slots mid-run) */
        uint8_t cable = (header >> 4) & 0x0F;
        if (cable != 2) continue;             /* only cable-2 (external USB) */
        uint8_t status = hw_buf[j + 1];
        if ((status & 0xF0) == 0xF0) continue; /* system messages — channelless */
        uint8_t in_ch = status & 0x0F;
        uint8_t mapped = ext_midi_remap_shm->remap[in_ch];

        if (mapped == EXT_MIDI_REMAP_PASSTHROUGH) continue;

        if (mapped == EXT_MIDI_REMAP_BLOCK) {
            /* Leave hardware_mmap_addr untouched — writing the MIDI_IN region
             * of the hardware SPI mmap crashes Move's process.  The shadow
             * buffer (sh_midi) is patched to a proper note-off after the
             * sh_midi copy loop via shim_block_cable2_in_sh_midi(). */
            continue;
        }

        /* Normal channel remap: rewrite channel byte in both hw and shadow so
         * Move firmware and next-frame internal readers see consistent data. */
        if (mapped >= 16) continue;  /* guard: treat unknown values as passthrough */
        hw_buf[j + 1] = (status & 0xF0) | (mapped & 0x0F);
        if (sh_buf) sh_buf[j + 1] = (status & 0xF0) | (mapped & 0x0F);
    }
}

/* ============================================================================
 * Boot set-select gate (standalone sessions)
 *
 * While shadow_control->select_phase is set (armed by a standalone launcher's
 * marker file, see shim init), the session holds at Move's NATIVE set picker
 * instead of auto-opening its boot tool. Move keeps everything that makes the
 * picker useful — pad taps load sets, Copy/Delete manage them — and this
 * machine decides which inputs mean something else:
 *
 *   - a pad tap OUTSIDE a copy/delete flow, once Move's load has settled,
 *     is the launch trigger (select_launch = pad index, consumed by shadow_ui)
 *   - jog click is "resume the already-loaded set" (natively inert in the
 *     picker — claiming it costs nothing)
 *   - Shift+pad is suppressed from Move (recolor/cloud submenus stay on
 *     vanilla Move; a conditional jog inside the phase isn't worth it)
 *   - while a copy/delete flow runs, the OLED is CEDED to Move so its own
 *     confirm text shows, and reclaimed after the flow settles
 *
 * Flow tracking is PURELY button state, for both buttons: Move treats Copy
 * and Delete as hold-modifiers and CANCELS the pending step the moment the
 * button is released (hardware-confirmed 2026-08-06 — delete's "press pad
 * again", copy with no source yet, and copy awaiting its destination all
 * die on release). So releasing falls straight back to normal picking, and
 * the earlier D-Bus text window — built for a confirm/paste tap arriving
 * after release, which cannot happen — only wrongly ate the next launch tap.
 *
 * Runs post-ioctl on the SPI thread AFTER sh_midi is finalized, for BOTH
 * display states (during a cede the display-mode filter doesn't run at all).
 * Scans hw_midi (originals), mutates only sh_midi — never the hardware map.
 * ============================================================================ */

#define SELECT_SETTLE_MS        700   /* pad tap -> launch trigger, if quiet   */
static int select_candidate_pad = -1;               /* pad awaiting launch settle */
static uint64_t select_settle_deadline_ms = 0;
static int select_launched = 0;                     /* trigger fired; phase frozen */

/* Mid-session (non-boot) arming only: gesture-injection state machines.
 * Entry walks Move into its Set Overview (Shift held + Step1, Move's own
 * gesture per its manual) and then claims the OLED; back-out taps Back once
 * the launch trigger fires so Move leaves the overview before the tool
 * resumes. All events go through the MPSC inject ring — Move sees them as
 * real cable-0 input, while the gate itself (which scans the HARDWARE
 * buffer) never sees its own injections. */
static int select_entry_state = 0;       /* 0 idle, 1..5 gesture, 6..7 repaint nudge, 8 entered */
static uint64_t select_entry_next_ms = 0;
static int select_entry_attempts = 0;    /* gesture retries (Move settles late) */
static int select_back_state = 0;        /* 0 idle, 1 down sent, 2 done */
static uint64_t select_back_next_ms = 0;
/* The pad to select, taken from ctrl->select_queue at arm time. It cannot be
 * delivered until Move's overview is actually open, so it waits here and is
 * replayed (injected, so Move loads it for real) once entry completes. */
static int select_queued_pad = -1;
static int select_replay_state = 0;      /* 0 idle, 1 down sent */
static uint64_t select_replay_next_ms = 0;

static void shim_select_inject(uint8_t cin, uint8_t status, uint8_t d1, uint8_t d2)
{
    if (!shadow_midi_inject_shm) return;
    const uint8_t pkt[4] = { cin, status, d1, d2 };
    if (shadow_midi_inject_push(shadow_midi_inject_shm, pkt) != 0)
        shadow_log("select gate: inject ring full — gesture event dropped");
}

/* PRE-IOCTL: blank Move's LED writes while Schwung owns the surface but no
 * tool has taken it yet. Two windows, same problem and same fix:
 *   - BOOT, while a boot tool is pending (boot_tool_led_blank),
 *   - a set-select actuator run (select_phase).
 * In both the shadow display is claimed, so the user sees our screen — while
 * Move, running underneath, paints its pads and buttons at full brightness.
 *
 * Below: the mid-session entry window.
 * Between the tool's suspend and the picker, Move sits in its previous mode
 * and repaints the pads with its instrument UI — a visible flash the user
 * never asked to see (reported on hardware 2026-08-06). While the entry
 * machine is walking Move into the Set Overview, strip every cable-0 LED
 * write (note LEDs, button CCs, RGB sysex) from the outgoing mailbox; the
 * pads simply stay dark (the suspending tool cleared them). The strip ends
 * the moment the machine leaves the gesture states, and the nudge that
 * follows makes Move repaint — so an overview paint eaten by the strip can
 * never leave a working-but-dark picker. */
static void shim_select_blank_move_leds(void)
{
    if (!shadow_control) return;
    /* A tool owns LEDs — and if this is the boot tool, drop the latch for
     * good: once it has taken the surface, any LATER moment with overtake
     * off is the menu, where Move's own LEDs are what the user should see. */
    if (shadow_control->overtake_mode) {
        boot_tool_led_blank = 0;
        return;
    }
    if (!shadow_control->select_phase && !boot_tool_led_blank) return;
    if (boot_tool_led_blank) {
        /* Deadline starts on the first blanked frame, not at init: the clock
         * matters from when the user can actually see the surface. */
        uint64_t _now = now_mono_ms();
        if (boot_tool_led_blank_deadline_ms == 0) {
            boot_tool_led_blank_deadline_ms = _now + BOOT_LED_BLANK_MAX_MS;
        } else if (_now >= boot_tool_led_blank_deadline_ms) {
            boot_tool_led_blank = 0;
            shadow_log("boot LED blank: timed out — releasing LEDs to Move");
            if (!shadow_control->select_phase) return;
        }
    }

    /* Strip EVERY Move LED write for the whole run — note LEDs, button CCs,
     * RGB sysex. There is no user surface to light: the actuator drives the
     * overview itself, behind our screen. An earlier version passed the
     * picker's own lights through once entry completed, which let the native
     * overview pads light up behind "Loading" (Josh, 2026-08-07: "falls back
     * briefly to the native ui" during a switch).
     *
     * Safe against leaving a working-but-dark surface: the strip lasts only
     * as long as the phase, and the tool that resumes repaints from scratch. */
    uint8_t *shadow = schwung_spi_get_shadow(g_spi_handle);
    if (!shadow) return;
    uint8_t *midi_out = shadow + MIDI_OUT_OFFSET;
    for (int i = 0; i < HW_MIDI_OUT_SIZE; i += 4) {
        uint8_t cable = (midi_out[i] >> 4) & 0x0F;
        uint8_t cin = midi_out[i] & 0x0F;
        uint8_t type = midi_out[i + 1] & 0xF0;
        if (cable != 0) continue;
        if (type == 0x90 || type == 0x80 || type == 0xB0 ||
            (cin >= 0x04 && cin <= 0x07)) {
            midi_out[i] = 0; midi_out[i + 1] = 0;
            midi_out[i + 2] = 0; midi_out[i + 3] = 0;
        }
    }

}

static void shim_select_gate_frame(const uint8_t *hw_midi, uint8_t *sh_midi)
{
    if (!shadow_control) return;
    if (!shadow_control->select_phase) {
        /* Phase inactive: hold ALL per-arming state at its reset values,
         * UNCONDITIONALLY. The shim process outlives an arming, and a
         * mid-session re-arm must start clean.
         * An earlier version reset only when shim-side state was set, which
         * missed exactly the selections the shim never saw (the launch
         * consumed via SHM/JS with no trigger recorded here). A few
         * stores per idle frame is free. */
        select_candidate_pad = -1;
        select_launched = 0;
        select_entry_state = 0;
        select_entry_attempts = 0;
        select_back_state = 0;
        select_queued_pad = -1;
        select_replay_state = 0;
        /* NOT cleared here: ctrl->select_queue. It is an input MAILBOX the
         * armer writes BEFORE raising select_phase — clearing it on every
         * phase-down frame wiped the queue in the gap between the two writes
         * (observed: the arm lost its pad and the run hung). It is consumed
         * at arm (case 0) and cleared by shadow_select_phase_end. */
        return;
    }
    if (shadow_control->overtake_mode) return;   /* a tool owns the surface */

    uint64_t now = now_mono_ms();

    /* Mid-session entry: open Move's Set Overview, then claim the OLED. The
     * arming module suspended itself before arming, so by the time overtake
     * is off, Move owns input again and the injected gesture lands natively.
     * D-Bus "Set Overview" (in_set_overview, shadow_dbus.c) confirms arrival;
     * a timeout claims the screen anyway rather than wedging the phase. */
    if (select_entry_state < 8 && !select_launched) {
        switch (select_entry_state) {
        /* Timings measured on hardware (2026-08-06): the first cut used a
         * 150 ms settle + 60-80 ms gesture spacing and Move IGNORED the
         * combo — it was still mid-transition (announcing "Note Mode") when
         * Step1 landed, and the shift lead was too short for its combo
         * latch. 500 ms settle + 250/120 ms spacing opens the overview
         * reliably; the whole entry is still under a second. */
        case 0:
            /* Claim the OLED IMMEDIATELY: the select screen covers the whole
             * transition, so Move's instrument UI never flashes on the
             * display (the LED blanking above handles the pads). */
            shadow_display_mode = 1;
            shadow_control->display_mode = 1;
            /* The arming tool pre-chose the pad (shadow_select_arm refuses
             * without one) — consume it into the replay queue. */
            if (shadow_control->select_queue >= 0) {
                select_queued_pad = shadow_control->select_queue;
                shadow_control->select_queue = -1;
                shadow_log("select gate: actuator armed");
            }
            select_entry_state = 1;
            select_entry_next_ms = now + 500;  /* let Move finish the overtake-exit mode change */
            break;
        case 1:
            if (now >= select_entry_next_ms) {
                shim_select_inject(0x0B, 0xB0, CC_SHIFT, 127);
                select_entry_state = 2;
                select_entry_next_ms = now + 250;
            }
            break;
        case 2:
            if (now >= select_entry_next_ms) {
                shim_select_inject(0x09, 0x90, 16, 100);   /* Step1 down */
                select_entry_state = 3;
                select_entry_next_ms = now + 120;
            }
            break;
        case 3:
            if (now >= select_entry_next_ms) {
                shim_select_inject(0x08, 0x80, 16, 0x40);  /* Step1 up */
                select_entry_state = 4;
                select_entry_next_ms = now + 100;
            }
            break;
        case 4:
            if (now >= select_entry_next_ms) {
                shim_select_inject(0x0B, 0xB0, CC_SHIFT, 0);
                select_entry_state = 5;
                select_entry_next_ms = now + 1500;         /* overview deadline */
            }
            break;
        case 5:
            if (in_set_overview) {
                shadow_log("select gate: Set Overview open");
                select_entry_state = 6;
                select_entry_next_ms = now + 150;
            } else if (now >= select_entry_next_ms) {
                /* Move can keep transitioning for SECONDS after a suspend
                 * (observed: mode/preset announcements 3 s in) and silently
                 * eats the combo while it does — so re-send the gesture with
                 * growing gaps instead of trusting one fixed settle. Only
                 * after the retries are spent do we give up and move on
                 * (a wedged phase would be worse than an unpicker-ed one). */
                if (select_entry_attempts < 3) {
                    select_entry_attempts++;
                    shadow_log("select gate: no overview yet — re-sending gesture");
                    select_entry_state = 1;
                    select_entry_next_ms = now + 700u * (uint32_t)select_entry_attempts;
                } else {
                    shadow_log("select gate: overview timeout — proceeding anyway");
                    select_entry_state = 6;
                    select_entry_next_ms = now + 150;
                }
            }
            break;
        /* Repaint nudge: LED blanking may have eaten the overview's own
         * initial pad paint (it races the D-Bus confirmation), so tap Shift
         * once — Move repaints the current screen's pads on the release.
         * Harmless in the overview (bare Shift is just an overlay). */
        case 6:
            if (now >= select_entry_next_ms) {
                shim_select_inject(0x0B, 0xB0, CC_SHIFT, 127);
                select_entry_state = 7;
                select_entry_next_ms = now + 120;
            }
            break;
        case 7:
            if (now >= select_entry_next_ms) {
                shim_select_inject(0x0B, 0xB0, CC_SHIFT, 0);
                select_entry_state = 8;
                shadow_control->select_ready = 1;
                shadow_log("select gate: entry complete");
            }
            break;
        }
    }

    /* The overview is open: inject the chosen pad as a real tap so Move loads
     * that set, and arm the launch candidate. The settle window below turns
     * the candidate into the trigger once Move's load goes quiet. */
    if (select_entry_state >= 8 &&
        select_queued_pad >= 0 && !select_launched) {
        if (select_replay_state == 0) {
            shim_select_inject(0x09, 0x90, (uint8_t)(68 + select_queued_pad), 100);
            select_replay_state = 1;
            select_replay_next_ms = now + 60;
        } else if (now >= select_replay_next_ms) {
            shim_select_inject(0x08, 0x80, (uint8_t)(68 + select_queued_pad), 0x40);
            select_candidate_pad = select_queued_pad;
            select_settle_deadline_ms = now + SELECT_SETTLE_MS;
            {
                char _m[56];
                snprintf(_m, sizeof(_m), "select gate: queued pad %d replayed",
                         select_queued_pad);
                shadow_log(_m);
            }
            select_queued_pad = -1;
            select_replay_state = 0;
        }
    }

    /* Mid-session back-out: once the launch trigger fired, tap Back so Move
     * returns from the overview to a normal mode before the tool resumes
     * over it (per the manual, Back reopens the previously-active mode). */
    if (select_launched && select_back_state < 2) {
        if (select_back_state == 0) {
            shim_select_inject(0x0B, 0xB0, CC_BACK, 127);
            select_back_state = 1;
            select_back_next_ms = now + 60;
        } else if (now >= select_back_next_ms) {
            shim_select_inject(0x0B, 0xB0, CC_BACK, 0);
            select_back_state = 2;
        }
    }

    for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
        uint8_t cin = hw_midi[j] & 0x0F;
        uint8_t cable = (hw_midi[j] >> 4) & 0x0F;
        if (cable != 0x00) continue;
        uint8_t status = hw_midi[j + 1];
        uint8_t type = status & 0xF0;
        uint8_t d1 = hw_midi[j + 2];
        uint8_t d2 = hw_midi[j + 3];
        int zero_it = 0;

        if (cin == 0x0B && type == 0xB0) {
            /* Default-deny. The phase has NO user surface — the actuator
             * drives Move itself, behind our screen — so every control is a
             * no-op, and letting one through would move Move off the overview
             * the actuator is walking. The two exceptions: the master volume
             * knob (output level, not UI) and Back, which is claimed so
             * Shift+Back can leave the session. Shift itself is TRACKED from
             * the hardware buffer for that combo, but blocked from Move. */
            switch (d1) {
            case CC_MASTER_KNOB:
                break;                      /* allowed: output level, not UI */
            case CC_BACK:
                zero_it = 1;
                if (d2 > 0 && shadow_shift_held && !select_launched) {
                    static uint64_t select_exit_last_ms = 0;
                    if (now - select_exit_last_ms > 2000) {
                        select_exit_last_ms = now;
                        shadow_log("select gate: Shift+Back -> exit to stock");
                        shim_worker_post(SHIM_EVT_SELECT_EXIT_STOCK);
                    }
                }
                break;
            default:
                zero_it = 1;                /* Shift (49) included: tracked from hw only */
                break;
            }
        } else if ((cin == 0x09 || cin == 0x08) &&
                   (type == 0x90 || type == 0x80)) {
            /* Notes, pads included: all no-ops during the phase. A physical
             * pad tap must not reach Move — the actuator has already chosen,
             * and a stray tap would load a DIFFERENT set under the tool that
             * is about to resume. Only the volume-knob touch (note 8) passes,
             * pairing with the allowed CC 79. */
            if (d1 != 8) zero_it = 1;
        } else if (cin >= 0x08 && cin <= 0x0E && status >= 0x80) {
            /* Any other cable-0 channel message (non-pad aftertouch, pitch
             * bend, ...): no-op during the phase. ASIC metadata (status 0)
             * and sysex are untouched. */
            zero_it = 1;
        }

        if (zero_it) {
            sh_midi[j] = 0;
            sh_midi[j + 1] = 0;
            sh_midi[j + 2] = 0;
            sh_midi[j + 3] = 0;
        }
    }

    /* Launch-settle expiry: the replayed pad survives a full quiet window ->
     * that set is loaded and chosen. shadow_ui consumes select_launch. */
    if (!select_launched && select_candidate_pad >= 0 &&
        now >= select_settle_deadline_ms) {
        select_launched = 1;
        shadow_control->select_launch = (int8_t)select_candidate_pad;
        /* Fast set-tracking: pad k ↔ user.song-index k, and Move has
         * already loaded the set — hand the index to the tracker so the
         * SET_CHANGED reload starts NOW instead of after Move lazily
         * writes Settings.json (which trailed by up to ~5 s and was the
         * dominant chunk of a project switch). */
        shadow_set_tracking_force_index(select_candidate_pad);
        {
            char msg[64];
            snprintf(msg, sizeof(msg), "select gate: pad %d -> launch",
                     select_candidate_pad);
            shadow_log(msg);
        }
        select_candidate_pad = -1;
    }
}

/* Patch sh_midi (shadow buffer, 4-byte stride) to suppress BLOCK channels from
 * reaching Move's firmware.  Called AFTER the sh_midi copy loop so the patch
 * survives the overwrite.  Converts note-ons on BLOCK channels to proper
 * note-offs (CIN 8 / status 0x80) rather than zeroing velocity, avoiding any
 * firmware edge-case on velocity=0 note-ons.  hardware_mmap_addr is left
 * untouched — writing MIDI_IN there crashes Move's process. */
static void shim_block_cable2_in_sh_midi(uint8_t *sh_midi) {
    if (!ext_midi_remap_feature_enabled) return;
    if (!ext_midi_remap_shm || !ext_midi_remap_shm->enabled) return;
    if (any_thru_slot_active()) return;           /* MPE passthrough wins */
    /* MIDI_IN events are 8 bytes (4 USB-MIDI + 4 timestamp). Must stride by 8
     * so we only inspect the USB-MIDI header bytes and never accidentally
     * interpret or corrupt timestamp bytes. */
    const int MIDI_IN_MAX_BYTES = 8 * 31;
    for (int j = 0; j < MIDI_IN_MAX_BYTES; j += 8) {
        if (sh_midi[j] == 0) continue;                 /* empty slot — keep scanning */
        uint8_t cable = (sh_midi[j] >> 4) & 0x0F;
        if (cable != 2) continue;
        uint8_t status = sh_midi[j + 1];
        if ((status & 0xF0) != 0x90) continue;         /* note-on only */
        if (sh_midi[j + 3] == 0) continue;             /* already velocity=0 */
        uint8_t in_ch = status & 0x0F;
        if (ext_midi_remap_shm->remap[in_ch] != EXT_MIDI_REMAP_BLOCK) continue;
        /* Convert to proper note-off so Move ignores it cleanly */
        sh_midi[j]     = (sh_midi[j] & 0xF0) | 0x08;  /* CIN 8 = note-off */
        sh_midi[j + 1] = 0x80 | in_ch;                 /* note-off status */
        sh_midi[j + 3] = 0x40;                         /* standard note-off vel */
    }
}

/* ============================================================================
 * SPI POST-TRANSFER CALLBACK
 * ============================================================================
 * Called by schwung_spi_lib after hardware→shadow copy on every SPI frame.
 * The library has already copied the input region (2048+) from hw→shadow.
 * This callback handles:
 *   - Syncing output regions (0-2047) from hw→shadow
 *   - MIDI_IN filtering
 *   - All post-ioctl domain logic (track detection, shortcuts, DSP rendering)
 * ============================================================================ */
/* Edit-CC (Undo/Copy/Delete) press latch — see the filter site in
 * shim_post_transfer. Records who received each button's PRESS so the same
 * consumer receives its RELEASE even if capabilities.claims_edit_ccs is claimed
 * or released mid-hold. Read by both the Move-firmware filter and the
 * forward-to-shadow_ui site; the filter runs first in the frame, so the forward
 * site sees this frame's decision. Index: 0=Undo, 1=Copy, 2=Delete.
 * Touched only from the SPI callback (single thread) — no locking needed. */

/* Button-claim press latch -- see the filter site in shim_post_transfer.
 * Records, per CC, whether the module received its PRESS, so the same consumer
 * receives its RELEASE even if the claim (capabilities.claims_ccs) changes
 * mid-hold. Read by both the Move-firmware filter and the forward-to-shadow_ui
 * site; the filter runs first in the frame, so the forward site sees this
 * frame's decision. Touched only from the SPI callback -- no locking. */
static uint8_t claim_press_blocked[128];

/* Controls the host owns and a module may NEVER claim: how you leave the
 * screen (Menu, Back, Shift), what the host routes itself (jog, the eight
 * knobs, the master knob, the track buttons), and Mute, on which Move-native
 * Mute+Pad depends. A claim on one of these is ignored here whatever shadow_ui
 * wrote, so the shim stays correct even against a UI that forgot the list. */
static int claim_denied_cc(uint8_t cc) {
    if (cc == CC_SHIFT || cc == CC_MENU || cc == CC_BACK) return 1;
    if (cc == CC_JOG_WHEEL || cc == CC_JOG_CLICK) return 1;
    if (cc >= CC_KNOB1 && cc <= CC_KNOB8) return 1;
    if (cc == CC_MASTER_KNOB || cc == CC_MUTE) return 1;
    if (cc >= 40 && cc <= 43) return 1;                 /* track buttons */
    if (cc == CC_MIC_IN_DETECT || cc == CC_LINE_OUT_DETECT) return 1;
    return 0;
}
static inline int claim_cc_set(uint8_t cc) {
    return shadow_control && ((shadow_control->claim_cc_bits[cc >> 3] >> (cc & 7)) & 1);
}

static void shim_post_transfer(void *ctx, uint8_t *shadow, const uint8_t *hw, int size)
{
    (void)ctx;
    (void)size;

    /* Root span for the post-ioctl half of the SPI frame. */
    TRACE_SCOPE("spi.post");

    /* Timing: reuse statics from pre-transfer (same translation unit) */
    /* spi_post_start is at file scope */

    /* Cable-2 channel remap: rewrite incoming external MIDI channel bytes in
     * both hw mailbox (so Move firmware sees remapped channels this frame)
     * and shadow buffer (so next frame's pre-transfer readers stay
     * consistent). Must run before any post-transfer logic that reads
     * MIDI_IN. */
    shim_remap_cable2_channels(shadow);

    /* E2E test-bus: publish observed MIDI_OUT events to the test stream SHM
     * if a test client is subscribed. No-op when disabled (one atomic load +
     * branch). Implementation in shadow_test_stream.c. */
    shadow_test_stream_publish_midi_out(hw, shadow_control ? shadow_control->shim_counter : 0);

    /* XMOS SysEx logger — POST-transfer view of hw[MIDI_OUT] BEFORE the
     * hw→shadow memcpy below. Lets us see what XMOS left in the slots
     * (does it clear after consuming, or does data persist?). Pre/post
     * comparison reveals slot stomping or stale replay. Dormant unless
     * /data/UserData/schwung/log_xmos_sysex_on exists; honors the same
     * size cap as the pre-transfer block. */
    if (xmos_log_fd >= 0 && xmos_log_bytes < XMOS_LOG_MAX_BYTES) {
        int any = 0;
        char line[128];
        for (int i = 0; i < 80; i += 4) {
            uint8_t cin = hw[i] & 0x0F;
            if (cin >= 0x04 && cin <= 0x07) {
                int n = snprintf(line, sizeof(line),
                    "[f%u] POSThw slot=%2d cable=%d cin=0x%x : %02x %02x %02x %02x\n",
                    xmos_frame, i, (hw[i] >> 4) & 0xF, cin,
                    hw[i], hw[i+1], hw[i+2], hw[i+3]);
                if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
                any = 1;
            }
        }
        if (any) {
            int n = snprintf(line, sizeof(line), "[f%u] POSThw end\n", xmos_frame);
            if (write(xmos_log_fd, line, n) > 0) xmos_log_bytes += (uint64_t)n;
        }
    }

    /* Sync output regions from hardware→shadow.
     * The library only copies the input region (SCHWUNG_OFF_IN_BASE+).
     * The output region may have been modified by hardware during ioctl. */
    memcpy(shadow + MIDI_OUT_OFFSET, hw + MIDI_OUT_OFFSET,
           AUDIO_OUT_OFFSET - MIDI_OUT_OFFSET);  /* MIDI_OUT: 0-255 */
    /* Skip hw→shadow copy for AUDIO_OUT — prevents stale mixed audio
     * from accumulating when Move firmware doesn't overwrite the region. */
    /* memcpy(shadow + AUDIO_OUT_OFFSET, hw + AUDIO_OUT_OFFSET,
           DISPLAY_OFFSET - AUDIO_OUT_OFFSET); */
    memcpy(shadow + DISPLAY_OFFSET, hw + DISPLAY_OFFSET,
           MIDI_IN_OFFSET - DISPLAY_OFFSET);     /* DISPLAY: 768-2047 */

    /* Copy capture data to JACK shared memory and wake JACK driver */
    schwung_jack_bridge_post(g_jack_shm, shadow, hw,
                             shadow_control ? &shadow_control->overtake_mode : NULL,
                             shadow_control ? &shadow_control->shift_held : NULL);

    /* Bridge Schwung's total mix into native resampling path when selected. */
    native_resample_bridge_apply();

    /* Capture audio for sampler post-ioctl (Move Input source only - fresh hardware input) */
    if (sampler_source == SAMPLER_SOURCE_MOVE_INPUT) {
        sampler_capture_audio();
        sampler_tick_preroll();
        /* Skipback: always capture Move Input source into rolling buffer.
         * No init call here — see the Resample site in the mix path. */
        skipback_capture((int16_t *)(hw + AUDIO_IN_OFFSET));
    }

    /* Copy MIDI_IN with filtering when in shadow display mode.
     * The library already copied the full input region (2048+) from hw→shadow.
     * When shadow_display_mode is active, we re-filter the MIDI_IN portion. */
    uint8_t *hw_midi = (uint8_t *)hw + MIDI_IN_OFFSET;
    uint8_t *sh_midi = shadow + MIDI_IN_OFFSET;
    int overtake_mode = shadow_control ? shadow_control->overtake_mode : 0;

    /* Detect overtake mode exit and inject button releases into Move's MIDI_IN.
     * During overtake, all cable-0 MIDI is filtered from reaching Move firmware,
     * so if the user released Shift or the volume knob touch while in overtake,
     * Move never saw the release. Inject shift-off and volume-touch-off to ensure
     * Move doesn't think buttons are still held.
     * This covers all exit paths: JS shadow_set_overtake_mode(0), D-Bus shutdown
     * prompt, or any other direct write to shadow_control->overtake_mode. */
    /* ── Volume claim released MID-TOUCH: hand Move the touch it never saw ───
     *
     * While vol_block is raised we withhold BOTH the volume CC and the
     * capacitive TOUCH note (note 8) from Move firmware — the pair travel
     * together, because passing the touch alone pops Move's volume overlay over
     * the tool's screen. dAVEBOx raises the claim only while Shift is held.
     *
     * So releasing Shift with the knob STILL PHYSICALLY HELD leaves Move's view
     * of the world wrong: it starts receiving the CCs again (and shows volume
     * while they arrive) but it never got the touch-ON, so the moment you stop
     * turning it reverts to its normal screen — as if the knob were not being
     * touched, which it is. Josh, 2026-08-25: "i can get it so that it always
     * shows volume ... but i have to be actively moving the volume during shift
     * release."
     *
     * Fix the STATE rather than the symptom: on the 1->0 edge, if the knob is
     * still down, inject the touch-on Move missed. Its subsequent real note-off
     * passes through normally (the claim is gone), so the two stay in step.
     *
     * ⭑ Exactly the mirror of the overtake-exit cleanup below, which injects a
     * touch-OFF for the same reason in the opposite direction: whoever takes the
     * surface must inherit a truthful picture of what is physically held. */
    {
        static int prev_vol_block = 0;
        int vb_now = shadow_control ? (int)shadow_control->vol_block : 0;
        if (prev_vol_block && !vb_now && shadow_volume_knob_touched &&
            shadow_midi_inject_shm) {
            const uint8_t vol_touch_on[4] = {0x09, 0x90, 8, 127};
            if (shadow_midi_inject_push(shadow_midi_inject_shm, vol_touch_on) == 0)
                shadow_log("vol claim released mid-touch: injected volume-touch-on to Move");
            else
                shadow_log("vol claim released mid-touch: touch-on DROPPED (inject ring full)");
        }
        prev_vol_block = vb_now;
    }

    {
        static int prev_overtake_mode = 0;
        if (prev_overtake_mode != 0 && overtake_mode == 0 && shadow_midi_inject_shm) {
            /* Synthesize releases for any controls that may have been
             * down at overtake start so Move firmware doesn't think
             * buttons are still held. Each push is independent under
             * the MPSC helper — no cursor coordination required here. */
            /* Drop any runtime master-knob claim with the session. A tool that
             * exits without clearing it would otherwise leave the volume knob
             * captured for whatever tool runs next — and unlike pad_block, a
             * stuck volume claim is the one control a user always expects to
             * work. Cleared here because this edge covers EVERY exit path,
             * including a tool that crashed before its own cleanup ran. */
            if (shadow_control) shadow_control->vol_block = 0;

            const uint8_t shift_off[4]    = {0x0B, 0xB0, CC_SHIFT,     0};
            const uint8_t vol_touch_off[4]= {0x08, 0x80, 8,            0};
            const uint8_t back_off[4]     = {0x0B, 0xB0, CC_BACK,      0};
            const uint8_t jog_click_off[4]= {0x0B, 0xB0, CC_JOG_CLICK, 0};
            /* These are the highest-consequence injects: a dropped release
             * leaves Move believing a control is still held. push() only
             * fails (-1) if the ring is full (drain starved) — never expected
             * for four one-shot packets, but check each and name any casualty
             * rather than dropping it silently. */
            int rc_shift = shadow_midi_inject_push(shadow_midi_inject_shm, shift_off);
            int rc_vol   = shadow_midi_inject_push(shadow_midi_inject_shm, vol_touch_off);
            int rc_back  = shadow_midi_inject_push(shadow_midi_inject_shm, back_off);
            int rc_jog   = shadow_midi_inject_push(shadow_midi_inject_shm, jog_click_off);
            if (rc_shift == 0 && rc_vol == 0 && rc_back == 0 && rc_jog == 0) {
                shadow_log("Overtake exit: injected shift-off, volume-touch-off, back-off, jog-click-off");
            } else {
                if (rc_shift) shadow_log("Overtake exit: DROPPED shift-off inject (ring full) — Move may think Shift is held");
                if (rc_vol)   shadow_log("Overtake exit: DROPPED volume-touch-off inject (ring full)");
                if (rc_back)  shadow_log("Overtake exit: DROPPED back-off inject (ring full) — Move may think Back is held");
                if (rc_jog)   shadow_log("Overtake exit: DROPPED jog-click-off inject (ring full) — Move may think Jog Click is held");
            }
        }
        /* Forced reset of cable-2 channel remap on overtake exit. The active
         * module owns the table during overtake; on exit, clear it so a
         * stale table from a crashed module can't bleed into the next
         * session or into Move's normal operation. */
        if (prev_overtake_mode != 0 && overtake_mode == 0 && ext_midi_remap_shm) {
            memset((void *)ext_midi_remap_shm->remap, EXT_MIDI_REMAP_PASSTHROUGH, 16);
            ext_midi_remap_shm->enabled = 0;
            __sync_synchronize();
        }
        /* Symmetric inject on overtake ENTRY (0→non-zero): if Shift was held when
         * overtake activated (e.g. Shift+long-press-Step13 → resume tool fires while
         * the user is still physically holding Shift), inject Shift-off so Move's
         * firmware doesn't stay in shift-mode (which slows the volume knob, etc.).
         * Cable-0 input is filtered during overtake, so the eventual physical release
         * never reaches Move otherwise. */
        if (prev_overtake_mode == 0 && overtake_mode != 0 && shadow_midi_inject_shm &&
            shadow_shift_held) {
            const uint8_t shift_off[4] = {0x0B, 0xB0, CC_SHIFT, 0};
            if (shadow_midi_inject_push(shadow_midi_inject_shm, shift_off) == 0) {
                shadow_log("Overtake entry with shift held: injected shift-off");
            }
        }
        /* Clear JACK display override on overtake exit (always — Move needs display back) */
        if (prev_overtake_mode != 0 && overtake_mode == 0 && g_jack_shm) {
            g_jack_shm->display_active = 0;
            g_jack_shm->midi_from_jack_count = 0;
        }
        /* Run overtake exit hook if it exists (modules install their own cleanup).
         * Skip if suspend_overtake is set — JACK keeps running. */
        if (prev_overtake_mode != 0 && overtake_mode == 0) {
            if (shadow_control && shadow_control->suspend_overtake) {
                shadow_control->suspend_overtake = 0;  /* consumed */
                /* Freeze sysex cache so RNBO's init batch on resume
                 * doesn't overwrite pre-suspend LED state */
                led_queue_freeze_jack_sysex_cache();
            } else {
                /* Defer hook resolution + execution to the shim worker:
                 * reading .exiting-module-id and fork/exec'ing the hook are
                 * file I/O + process spawning, never allowed on the SPI
                 * thread (the old shell-out also inherited FIFO 90). The
                 * worker picks this up within ~200 ms — hooks were
                 * backgrounded with '&' anyway, so the latency is
                 * unobservable. */
                shim_worker_post(SHIM_EVT_OVERTAKE_EXIT_HOOK);
                /* Clear JACK LED cache on clean exit */
                led_queue_clear_jack_cache();
            }
        }
        prev_overtake_mode = overtake_mode;
    }

    /* Drop any edit-CC claim when the shadow display goes away. The claim only
     * means anything while a module's UI is on screen, and a shadow_ui that
     * exited (or crashed) before reconciling it to 0 would otherwise leave
     * Move's Undo / Copy / Delete captured with nothing left to deliver them
     * to. Same reasoning as the runtime-claim drops on overtake exit above:
     * this edge covers EVERY exit path. Also disarms the press latch so a
     * release arriving after the display closed is routed to Move, matching
     * where its press went. Runs unconditionally -- the filter itself is inside
     * the shadow_display_mode branch below, so this must not be. */
    {
        static int prev_display_mode = 0;
        if (prev_display_mode && !shadow_display_mode) {
            if (shadow_control) memset((void *)shadow_control->claim_cc_bits, 0, sizeof(shadow_control->claim_cc_bits));
            memset(claim_press_blocked, 0, sizeof(claim_press_blocked));
        }
        prev_display_mode = shadow_display_mode;
    }

    /* Boot jack-state re-assert: worker arms shim_inject_boot_jack ~5 s after
     * start (Move firmware is up by then). Inject a CC 115 into Move's MIDI_IN
     * via the safe MPSC inject ring so Move's speaker enhancer corrects when
     * headphones were already plugged at boot (XMOS only reports jack on a
     * physical transition, never at boot). CC injection is the same safe path
     * as the overtake-exit button releases — unlike XMOS SysEx injection. */
    if (shim_inject_boot_jack >= 0 && shadow_midi_inject_shm) {
        uint8_t v = (uint8_t)shim_inject_boot_jack;
        shim_inject_boot_jack = -1;
        const uint8_t jack_cc[4] = { 0x0B, 0xB0, CC_LINE_OUT_DETECT, v };
        if (shadow_midi_inject_push(shadow_midi_inject_shm, jack_cc) == 0)
            shadow_log("Boot jack re-assert: injected CC 115 to Move");
        else
            shadow_log("Boot jack re-assert: inject ring full, dropped CC 115");
    }

    if (shadow_display_mode && shadow_control) {
        /* Move-native co-run knob coalescing: Move firmware spends ~900µs per
         * CC 71-78 it receives (synth-param write + OLED redraw). Multiple
         * detents in one audio frame stack their cost and overrun the SPI
         * frame budget, which manifests as sequencer stutter while the user
         * spins a knob. Sum incoming detents per knob within this frame and
         * emit ONE consolidated CC at the end of the filter loop instead of
         * letting every detent through individually. Per-frame collapse is
         * the framework's contract; tools generating unusually heavy
         * concurrent MIDI traffic (simultaneous pad fire + step LEDs +
         * automation lanes during transport, etc.) may still see residual
         * stutter on very fast knob spins and should document that as a
         * tool-side characteristic. See docs/CORUN.md. */
        int16_t corun_knob_delta[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };
        int corun_knob_coalesce =
            (corun_target(shadow_control) == CORUN_TARGET_MOVE_NATIVE) &&
            !(corun_keep_mask_eff(shadow_control) & CORUN_GRP_KNOBS);

        /* Filter MIDI_IN: zero out jog/back/knobs.
         *
         * Bound is SHADOW_MIDI_IN_BYTES (248 = 31 x 8), NOT MIDI_BUFFER_SIZE
         * (256). MIDI_IN holds 31 events and the RX display-status word sits
         * immediately behind it at +248; at the 256 bound the last iteration
         * read that word as a 32nd event and, whenever it looked like a
         * filtered control, ZEROED it. */
        /* Power-button SysEx run-length: set when the lookahead below matches
         * the message's first packet, decremented as its remaining 3 packets
         * are walked. Function-local and re-zeroed every call (one SPI frame
         * each), so it only ever spans packets within a single frame. */
        int power_sysex_remaining = 0;
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin = hw_midi[j] & 0x0F;
            uint8_t cable = (hw_midi[j] >> 4) & 0x0F;
            uint8_t status = hw_midi[j + 1];
            uint8_t type = status & 0xF0;
            uint8_t d1 = hw_midi[j + 2];
            uint8_t d2 = hw_midi[j + 3];

            /* Power button: F0 00 21 1D 01 01 3A <id> <val> 00 F7, four USB-MIDI
             * packets (cin 0x4, 0x4, 0x4, 0x6). Unlike every other overtake
             * button, this one is not a routable CC/note (docs/CORUN.md) — it
             * only shows up as this SysEx, and the mode-2/mode-1 "status>=0x80"
             * suppression below zeroes its lead packet (0xF0 counts as a
             * status byte here) same as it would any other cable-0 SysEx,
             * corrupting the one message Move's own shutdown-prompt flow needs
             * intact — so "Press wheel to shut down" never appears and the
             * device cannot be powered off from inside a tool. The id byte at
             * offset 17 varies (observed 0x2A on a tap, 0x3A on a ~1.5-2s
             * hold); match on the fixed header + subcommand only. Lookahead,
             * not a stateful match at the subcommand packet, because a
             * corrective *retroactive* un-filter of already-written sh_midi
             * slots would need to special-case every filter site above instead
             * of the one line below. */
            int power_sysex_hit = 0;
            if (power_sysex_remaining > 0) {
                power_sysex_remaining--;
                power_sysex_hit = 1;
            } else if (cable == 0x00 && cin == 0x04 &&
                       status == 0xF0 && d1 == 0x00 && d2 == 0x21 &&
                       j + 24 < SHADOW_MIDI_IN_BYTES &&
                       (hw_midi[j + 8] & 0x0F) == 0x04 &&
                       hw_midi[j + 9] == 0x1D && hw_midi[j + 10] == 0x01 && hw_midi[j + 11] == 0x01 &&
                       (hw_midi[j + 16] & 0x0F) == 0x04 && hw_midi[j + 17] == 0x3A &&
                       (hw_midi[j + 24] & 0x0F) == 0x06) {
                power_sysex_hit = 1;
                power_sysex_remaining = 3;
            }

            int filter = 0;

            /* Only filter internal cable (0x00) */
            if (cable == 0x00) {
                /* Overtake mode split:
                 * - mode 2 (module): block all cable 0 MIDI events from Move
                 *   Only filter valid MIDI (status >= 0x80), preserve ASIC metadata
                 *   (status == 0x00) which Move needs to recognize event validity.
                 * - mode 1 (menu): allow only volume touch/turn passthrough */
                if (overtake_mode == 2) {
                    if (status >= 0x80) filter = 1;
                    /* Let volume knob CC and touch through so Move shows volume
                     * overlay — UNLESS the tool has claimed the knob at runtime
                     * (shadow_control->vol_block, set via host_vol_block). Both
                     * the CC and the touch note are held back together: passing
                     * the touch alone would still pop Move's volume overlay over
                     * the tool's screen. */
                    int vol_claimed = shadow_control && shadow_control->vol_block;
                    if (cin == 0x0B && type == 0xB0 && d1 == CC_MASTER_KNOB) {
                        if (!vol_claimed) filter = 0;
                    }
                    if ((cin == 0x09 || cin == 0x08) &&
                        (type == 0x90 || type == 0x80) &&
                        d1 == 8) {
                        if (!vol_claimed) filter = 0;
                    }
                    /* Per-CC passthrough list (from the module's
                     * capabilities.button_passthrough). Used to let Play,
                     * Record etc. reach Move firmware so Move handles them
                     * natively — button press flows through, and Move's own
                     * LED writes back aren't blocked. */
                    /* A RUNTIME claim beats this STATIC list. A tool declares
                     * button_passthrough once in module.json, but vol_block is
                     * raised and dropped as it changes mode — so honouring the
                     * list here would silently undo the claim for any tool that
                     * also passes CC 79 through (dAVEBOx does exactly that, and
                     * this is why the first attempt had no effect on device). */
                    if (cin == 0x0B && type == 0xB0 && d1 < 128 && overtake_passthrough_ccs[d1] &&
                        !(vol_claimed && d1 == CC_MASTER_KNOB)) {
                        filter = 0;
                    }
                    /* Move-native co-run: let Move firmware see whichever
                     * control-surface events the tool cedes via its keep_mask.
                     * corun_event_owner (shadow_constants.h) is the single
                     * source of truth — same predicate runs at the forward-to-
                     * shadow_ui suppress site below, so the two routes can
                     * never drift. */
                    if (corun_target(shadow_control) == CORUN_TARGET_MOVE_NATIVE &&
                        corun_event_owner(shadow_control, type, d1) == CORUN_OWNER_PEER) {
                        filter = 0;
                        /* CC 71-78 detents: accumulate and emit once per frame
                         * (see corun_knob_delta declaration above). Suppress
                         * the individual event by re-asserting filter=1; the
                         * post-loop pass will inject one consolidated CC. */
                        if (corun_knob_coalesce && type == 0xB0 && d1 >= 71 && d1 <= 78) {
                            int16_t delta = 0;
                            if (d2 >= 1 && d2 <= 63) delta = d2;
                            else if (d2 >= 65 && d2 <= 127) delta = (int16_t)d2 - 128;
                            corun_knob_delta[d1 - 71] += delta;
                            filter = 1;
                        }
                    }
                } else if (overtake_mode == 1) {
                    filter = 1;
                    if (cin == 0x0B && type == 0xB0 && d1 == CC_MASTER_KNOB) {
                        filter = 0;
                    }
                    if ((cin == 0x09 || cin == 0x08) &&
                        (type == 0x90 || type == 0x80) &&
                        d1 == 8) {
                        filter = 0;
                    }
                    /* Same per-CC passthrough list applies at mode 1 (tool
                     * with skipOvertake) so hardware buttons the module
                     * doesn't claim reach Move firmware unchanged. */
                    if (cin == 0x0B && type == 0xB0 && d1 < 128 && overtake_passthrough_ccs[d1]) {
                        filter = 0;
                    }
                } else {
                    /* CC messages: filter jog/back controls (let up/down through for octave) */
                    if (cin == 0x0B && type == 0xB0) {
                        if (d1 == CC_JOG_WHEEL || d1 == CC_JOG_CLICK || d1 == CC_BACK) {
                            filter = 1;
                        }
                        /* A CLAIMED button: withheld from Move firmware ONLY while
                         * the module on screen has claimed it
                         * (shadow_control->claim_cc_bits, reconciled by shadow_ui
                         * from capabilities.claims_ccs / claims_edit_ccs). Unclaimed
                         * it passes through untouched, so Move keeps its native
                         * Undo during ordinary chain use -- precisely what the
                         * unconditional version (#154) broke and why it was
                         * reverted (#175). Forwarded to the shadow UI under the
                         * same latch by the post-ioctl loop. The host-owned
                         * controls (claim_denied_cc) can never be claimed. */
                        if (d1 < 128) {
                            /* Latch per button so a claim that changes MID-HOLD
                             * cannot desync Move's view of the button: whoever
                             * received the PRESS also receives the RELEASE.
                             * Without this, a claim engaging between press and
                             * release leaves Move believing the button is still
                             * held, and a claim dropping mid-hold delivers Move an
                             * orphan release. */
                            if (d2 > 0) {
                                /* Shift+<button> is the host's own vocabulary
                                 * (Shift+Copy / Shift+Delete = snapshot and
                                 * recall, handled and swallowed in the post-ioctl
                                 * loop). A press with Shift held is never claimed:
                                 * the module gets the BARE buttons only. */
                                claim_press_blocked[d1] =
                                    (claim_cc_set(d1) && !claim_denied_cc(d1) && !shadow_shift_held) ? 1 : 0;
                            }
                            if (claim_press_blocked[d1]) filter = 1;
                            /* Deliberately NOT cleared on release: the latch is
                             * re-armed by the next press, which keeps it valid
                             * for the forward-to-shadow_ui site that runs LATER
                             * in this same frame and must route the release the
                             * same way it routed the press. */
                        }
                        /* Filter Menu unless long-press mode dismisses shadow on tap */
                        if (d1 == CC_MENU && !LONG_PRESS_ACTIVE()) {
                            filter = 1;
                        }
                        /* Filter knob CCs when shift held */
                        if (d1 >= CC_KNOB1 && d1 <= CC_KNOB8) {
                            filter = 1;
                        }
                        /* Filter Jog Click while the Shift+Vol chord is held
                         * (exit combo must not leak a click to Move) */
                        if (d1 == CC_JOG_CLICK &&
                            shadow_shift_held && shadow_volume_knob_touched) {
                            filter = 1;
                        }
                    }
                    /* Note messages: filter knob touches (0-7,9).
                     * Keep note 8 (volume touch) so Move can do track+volume
                     * and native volume workflows while shadow UI is active. */
                    if ((cin == 0x09 || cin == 0x08) && (type == 0x90 || type == 0x80)) {
                        if (d1 <= 7 || d1 == 9) {
                            filter = 1;
                        }
                        /* Block pad notes (68-99) from reaching Move when pad_block is set */
                        if (shadow_control->pad_block && d1 >= 68 && d1 <= 99) {
                            filter = 1;
                        }
                    }
                    /* Block polyphonic aftertouch on pads when pad_block is set */
                    if (cin == 0x0A && type == 0xA0 &&
                        shadow_control->pad_block && d1 >= 68 && d1 <= 99) {
                        filter = 1;
                    }
                }
            }

            /* Let the power-button SysEx through intact regardless of which
             * overtake-mode branch above ran — see the lookahead comment. */
            if (power_sysex_hit) filter = 0;

            if (filter) {
                /* Zero the packet dword in the shadow buffer.  This does NOT
                 * punch a hole: Move's firmware MIDI_IN reader STOPS at the
                 * first empty slot, so a zeroed slot is a TERMINATOR and
                 * everything behind it is invisible to Move for that frame.
                 * The MIDI_IN compaction at the end of shim_post_transfer
                 * closes the gaps again. */
                sh_midi[j] = 0;
                sh_midi[j + 1] = 0;
                sh_midi[j + 2] = 0;
                sh_midi[j + 3] = 0;
            } else {
                /* Copy packet as-is */
                sh_midi[j] = hw_midi[j];
                sh_midi[j + 1] = hw_midi[j + 1];
                sh_midi[j + 2] = hw_midi[j + 2];
                sh_midi[j + 3] = hw_midi[j + 3];
            }
            /* Carry the 4-byte timestamp dword either way */
            sh_midi[j + 4] = hw_midi[j + 4];
            sh_midi[j + 5] = hw_midi[j + 5];
            sh_midi[j + 6] = hw_midi[j + 6];
            sh_midi[j + 7] = hw_midi[j + 7];
        }

        /* Move-native knob coalesce: emit ONE consolidated CC per knob whose
         * detents we suppressed above, into an empty sh_midi slot. Clamp deltas
         * into the one-byte signed encoding (±63); any leftover carries.
         *
         * Co-run knob-CC inject starvation: the synthetic CC occupies a MIDI_IN
         * slot, and shadow_drain_midi_inject defers note delivery to Move tracks
         * whenever ANY MIDI_IN slot is non-zero (the SIGABRT-avoidance guard in
         * shadow_midi.c). Emitting every frame during a hard knob spin therefore
         * keeps MIDI_IN perpetually occupied and STARVES a co-run tool's
         * sequenced notes to Move-native instruments — the tool audibly drops
         * out and catches up at a different position (measured ~235 deferred
         * injects/s during a hard spin under a co-run sequencer). Fix: fold
         * detents into a PERSISTENT accumulator and emit only 1 frame in KNOB_EMIT_PERIOD,
         * leaving the intervening frames' MIDI_IN empty so the drain (which needs
         * ~3 consecutive empty frames: hw-occupancy bail + DEFER_FRAMES=2) gets a
         * window. Knob→Move update rate drops 344→~86 Hz (imperceptible); deltas
         * are accumulated/carried so no motion is lost, only lightly time-quantized
         * during a spin. */
        static int16_t  s_corun_knob_accum[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };
        static uint32_t s_corun_knob_phase = 0;
        const int KNOB_EMIT_PERIOD = 4;   /* 1 emit + 3 empty frames per cycle */
        for (int k = 0; k < 8; k++) s_corun_knob_accum[k] += corun_knob_delta[k];
        if ((++s_corun_knob_phase % (uint32_t)KNOB_EMIT_PERIOD) == 0) {
            for (int k = 0; k < 8; k++) {
                if (s_corun_knob_accum[k] == 0) continue;
                int16_t delta = s_corun_knob_accum[k];
                if (delta > 63) delta = 63;
                else if (delta < -63) delta = -63;
                s_corun_knob_accum[k] -= delta;   /* carry remainder to next emit */
                uint8_t d2 = (delta >= 0) ? (uint8_t)delta : (uint8_t)(delta + 128);
                for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
                    if (sh_midi[j] == 0 && sh_midi[j + 1] == 0 &&
                        sh_midi[j + 2] == 0 && sh_midi[j + 3] == 0) {
                        sh_midi[j]     = 0x0B;     /* cable 0, CIN 0x0B = CC */
                        sh_midi[j + 1] = 0xB0;     /* status: CC, channel 0 */
                        sh_midi[j + 2] = (uint8_t)(71 + k);
                        sh_midi[j + 3] = d2;
                        /* Synthetic event: zero the timestamp dword */
                        sh_midi[j + 4] = 0;
                        sh_midi[j + 5] = 0;
                        sh_midi[j + 6] = 0;
                        sh_midi[j + 7] = 0;
                        break;
                    }
                }
            }
        }

        /* NOTE: a second, duplicate coalesce loop used to live here. It strided
         * j += 4 over the 8-byte MIDI_IN events (the correct stride is 8, as in
         * the loop above) and re-injected each corun_knob_delta a second time
         * without zeroing the timestamp dword — double-injecting every knob CC
         * and writing CCs at 4-byte offsets *inside* 8-byte events, the exact
         * misalignment that causes a MIDI_IN SIGABRT (see docs/SPI_PROTOCOL.md).
         * Removed (copy-paste artifact); the j += 8 loop above is sufficient
         * (corun_knob_delta is frame-local and uncleared by either loop). */
    } else {
        /* Not in shadow mode - copy MIDI_IN directly */
        memcpy(sh_midi, hw_midi, MIDI_BUFFER_SIZE);
    }

    /* Convert BLOCK-channel cable-2 note-ons to note-offs in shadow so Move
     * ignores them.  Must run AFTER the sh_midi loop (which overwrites shadow
     * from hw_midi) and only touches shadow — never hardware_mmap_addr. */
    shim_block_cable2_in_sh_midi(sh_midi);

    /* Boot set-select gate: runs for BOTH display states (during a flow cede
     * the display-mode filter above doesn't run at all) and must come after
     * sh_midi is finalized so its suppressions survive. No-op unless a
     * standalone launcher armed the phase. */
    shim_select_gate_frame(hw_midi, sh_midi);

    /* === SHIFT+MENU SHORTCUT DETECTION AND BLOCKING (POST-IOCTL) ===
     * Scan hardware MIDI_IN for Shift+Menu, perform action, and block from reaching Move.
     * This works regardless of shadow_display_mode.
     * Skip entirely in overtake mode - overtake module owns all input. */
    if (overtake_mode) goto skip_shift_menu;
    for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
        uint8_t cin = hw_midi[j] & 0x0F;
        uint8_t cable = (hw_midi[j] >> 4) & 0x0F;
        if (cable != 0x00) continue;  /* Only internal cable */
        if (cin == 0x0B) {  /* Control Change */
            uint8_t d1 = hw_midi[j + 2];
            uint8_t d2 = hw_midi[j + 3];

            /* Shift + Menu: single press = Master FX / screen reader settings
             *                double press = toggle screen reader on/off
             * First press is deferred 400ms to detect double-click. */
            /* Block Menu CC entirely when Shift is held (both press and release) */
            if (d1 == CC_MENU && shadow_shift_held) {
                if (d2 > 0 && shadow_control) {
                    struct timespec sm_ts;
                    clock_gettime(CLOCK_MONOTONIC, &sm_ts);
                    uint64_t sm_now = (uint64_t)(sm_ts.tv_sec * 1000) + (sm_ts.tv_nsec / 1000000);

                    if (shift_menu_pending && (sm_now - shift_menu_pending_ms) < 300) {
                        /* Double-click: toggle screen reader */
                        shift_menu_pending = 0;
                        uint8_t was_on = shadow_control->tts_enabled;
                        shadow_control->tts_enabled = was_on ? 0 : 1;
                        tts_set_enabled(!was_on);
                        tts_speak(was_on ? "Screen reader off" : "Screen reader on");
                        shadow_log(was_on ? "Shift+Menu double-click: screen reader OFF"
                                          : "Shift+Menu double-click: screen reader ON");
                    } else {
                        /* First press: defer action */
                        shift_menu_pending = 1;
                        shift_menu_pending_ms = sm_now;
                    }
                }
                /* Block Menu CC from reaching Move by zeroing in shadow buffer */
                char block_msg[128];
                snprintf(block_msg, sizeof(block_msg), "Blocking Menu CC (POST-IOCTL d2=%d)", d2);
                shadow_log(block_msg);
                sh_midi[j] = 0;
                sh_midi[j + 1] = 0;
                sh_midi[j + 2] = 0;
                sh_midi[j + 3] = 0;
            }
        }
    }
    skip_shift_menu:

    /* Shift+Menu single press is a NO-OP (2026-08-09): its old destinations —
     * Master FX, then screen-reader settings — both live in menus the primary
     * module owns (sound mode FX buses; Host Settings -> Screen Reader). Only
     * the double-press screen-reader TOGGLE survives, as the accessibility
     * gesture that must work without navigating any menu. The pending flag
     * still times out here so a lone press doesn't satisfy a later
     * double-press window. */
    if (shift_menu_pending && shadow_control) {
        struct timespec sm_ts2;
        clock_gettime(CLOCK_MONOTONIC, &sm_ts2);
        uint64_t sm_now2 = (uint64_t)(sm_ts2.tv_sec * 1000) + (sm_ts2.tv_nsec / 1000000);
        if (sm_now2 - shift_menu_pending_ms >= 300) {
            shift_menu_pending = 0;
        }
    }

    /* === SAMPLER MIDI FILTERING ===
     * Block events from reaching Move for sampler use.
     * Always block Shift+Record so the first press doesn't leak through.
     * Block jog while sampler is armed or recording. */
    {
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin = sh_midi[j] & 0x0F;
            uint8_t cable = (sh_midi[j] >> 4) & 0x0F;
            if (cable != 0x00) continue;
            uint8_t s_type = sh_midi[j + 1] & 0xF0;
            uint8_t s_d1 = sh_midi[j + 2];

            if (cin == 0x0B && s_type == 0xB0) {
                /* Block Record (CC 118) from Move: always when Shift held,
                 * and also when sampler is non-idle (armed or recording) */
                if (s_d1 == CC_RECORD && (shadow_shift_held || sampler_state != SAMPLER_IDLE)) {
                    sh_midi[j] = 0; sh_midi[j+1] = 0; sh_midi[j+2] = 0; sh_midi[j+3] = 0;
                }
                /* Block Shift+Vol+Capture from reaching Move (only when
                 * skipback would trigger; bare Shift+Capture passes — it
                 * belongs to the primary module). */
                if (s_d1 == CC_CAPTURE && shadow_shift_held &&
                    shadow_volume_knob_touched) {
                    sh_midi[j] = 0; sh_midi[j+1] = 0; sh_midi[j+2] = 0; sh_midi[j+3] = 0;
                }
                /* Block jog/back while sampler UI is fullscreen and active */
                if (sampler_state != SAMPLER_IDLE && sampler_fullscreen_active) {
                    if (s_d1 == CC_JOG_WHEEL || s_d1 == CC_JOG_CLICK || s_d1 == CC_BACK) {
                        sh_midi[j] = 0; sh_midi[j+1] = 0; sh_midi[j+2] = 0; sh_midi[j+3] = 0;
                    }
                }
            }
        }
    }

    /* Drain MIDI inject SHM into MIDI_IN (after all filtering, before barrier) */
    shadow_drain_midi_inject();

    /* Debug: dump raw HW MIDI_IN vs shadow MIDI_IN on inject */
    {
        static int inject_dump_count = 0;
        uint8_t *sh = shadow + MIDI_IN_OFFSET;
        /* Check if there's any non-zero data in shadow MIDI_IN (injection happened) */
        int has_inject = 0;
        for (int d = 0; d < 32; d += 4) {
            if (sh[d] || sh[d+1] || sh[d+2] || sh[d+3]) { has_inject = 1; break; }
        }
        if (has_inject && inject_dump_count < 5 && hardware_mmap_addr) {
            inject_dump_count++;
            uint8_t *hw = hardware_mmap_addr + MIDI_IN_OFFSET;
            char msg[256];
            snprintf(msg, sizeof(msg),
                "HW  MIDI_IN[0-31]: %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X",
                hw[0],hw[1],hw[2],hw[3], hw[4],hw[5],hw[6],hw[7],
                hw[8],hw[9],hw[10],hw[11], hw[12],hw[13],hw[14],hw[15],
                hw[16],hw[17],hw[18],hw[19], hw[20],hw[21],hw[22],hw[23],
                hw[24],hw[25],hw[26],hw[27], hw[28],hw[29],hw[30],hw[31]);
            shadow_log(msg);
            snprintf(msg, sizeof(msg),
                "SHD MIDI_IN[0-31]: %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X",
                sh[0],sh[1],sh[2],sh[3], sh[4],sh[5],sh[6],sh[7],
                sh[8],sh[9],sh[10],sh[11], sh[12],sh[13],sh[14],sh[15],
                sh[16],sh[17],sh[18],sh[19], sh[20],sh[21],sh[22],sh[23],
                sh[24],sh[25],sh[26],sh[27], sh[28],sh[29],sh[30],sh[31]);
            shadow_log(msg);
            /* Also dump last 16 bytes of both buffers (check for metadata) */
            snprintf(msg, sizeof(msg),
                "HW  MIDI_IN[240-255]: %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X",
                hw[240],hw[241],hw[242],hw[243], hw[244],hw[245],hw[246],hw[247],
                hw[248],hw[249],hw[250],hw[251], hw[252],hw[253],hw[254],hw[255]);
            shadow_log(msg);
            snprintf(msg, sizeof(msg),
                "SHD MIDI_IN[240-255]: %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X %02X%02X%02X%02X",
                sh[240],sh[241],sh[242],sh[243], sh[244],sh[245],sh[246],sh[247],
                sh[248],sh[249],sh[250],sh[251], sh[252],sh[253],sh[254],sh[255]);
            shadow_log(msg);
        }
    }

    /* Memory barrier to ensure all writes are visible */
    __sync_synchronize();

    /* Mark start of post-ioctl processing */
    clock_gettime(CLOCK_MONOTONIC, &spi_post_start);

    /* Skip post-ioctl processing in baseline mode */
    if (spi_baseline_mode) goto post_timing;

    /* Diagnostic: time the post-ioctl MIDI scan block (added 2026-05-15) */
    TIME_SECTION_START();

    /* === EARLY (UNGATED) CC 115 / CC 114 JACK-DETECT ===
     * The full handler below is gated on shadow_inprocess_ready, which is
     * set ~hundreds of ms into boot after shadow chain init runs. XMOS
     * broadcasts CC 115 within ~180ms of shim init at every boot, so the
     * gated handler usually misses the only CC 115 we get. That left
     * shadow_speaker_active stuck at its default of 1, applying speaker EQ
     * to headphone output (the "hollow / phasey" bug). Detect CC 115 here,
     * before any gating, so we have correct jack state from frame 1.
     * MIDI_IN events are 8 bytes (4 USB-MIDI + 4 timestamp). */
    if (hardware_mmap_addr) {
        const uint8_t *src_early = hardware_mmap_addr + MIDI_IN_OFFSET;
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin   = src_early[j] & 0x0F;
            uint8_t cable = (src_early[j] >> 4) & 0x0F;
            if (cable != 0x00) continue;
            if (cin != 0x0B) continue;
            uint8_t status = src_early[j + 1];
            uint8_t d1     = src_early[j + 2];
            uint8_t d2     = src_early[j + 3];
            if ((status & 0xF0) != 0xB0) continue;

            if (d1 == CC_LINE_OUT_DETECT) {
                int new_speaker = (d2 == 0) ? 1 : 0;
                /* Publish the raw CC 115 value (0=speaker, 127=jack) for the
                 * worker to persist to /data. At boot the worker re-asserts it
                 * to Move so its enhancer matches when headphones were already
                 * plugged (XMOS stays silent on a jack-in boot). */
                shim_jack_persist = (int)d2;
                int prev_known_speaker = shadow_speaker_active && shadow_speaker_active_known;
                shadow_speaker_active_known = 1;
                if (new_speaker != shadow_speaker_active) {
                    shadow_speaker_active = new_speaker;
                    if (shadow_control) shadow_control->speaker_active = (uint8_t)new_speaker;
                    memset(speaker_eq_state, 0, sizeof(speaker_eq_state));
                }
                /* Auto-mode stability: restart the speaker stability clock when
                 * we newly enter the speaker state, so only a stable speaker
                 * reading engages the EQ (transients/bounce do not). */
                if (new_speaker && !prev_known_speaker) {
                    clock_gettime(CLOCK_MONOTONIC, &spk_eq_speaker_since);
                }
            } else if (d1 == CC_MIC_IN_DETECT) {
                int new_line_in = (d2 == 0) ? 0 : 1;  /* d2=0 → no cable (internal mic); d2=127 → cable plugged */
                shadow_line_in_connected_known = 1;
                if (new_line_in != shadow_line_in_connected) {
                    shadow_line_in_connected = new_line_in;
                    if (shadow_control) shadow_control->line_in_connected = (uint8_t)new_line_in;
                }
            }
        }
    }

    /* === POST-IOCTL: TRACK BUTTON AND VOLUME KNOB DETECTION ===
     * Scan for track button CCs (40-43) for D-Bus volume sync,
     * and volume knob touch (note 8) for master volume display reading.
     * NOTE: We scan hardware_mmap_addr (unfiltered) because shadow buffer is already filtered. */
    if (hardware_mmap_addr && shadow_inprocess_ready) {
        uint8_t *src = hardware_mmap_addr + MIDI_IN_OFFSET;
        int overtake_active = shadow_control ? shadow_control->overtake_mode : 0;
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin = src[j] & 0x0F;
            uint8_t cable = (src[j] >> 4) & 0x0F;
            if (cable != 0x00) continue;  /* Only internal cable */

            uint8_t status = src[j + 1];
            uint8_t type = status & 0xF0;
            uint8_t d1 = src[j + 2];
            uint8_t d2 = src[j + 3];

            /* CC messages (CIN 0x0B) */
            if (cin == 0x0B && type == 0xB0) {
                /* Line-out / headphone jack detect: runs unconditionally, independent of
                 * overtake mode. Polarity is a guess on first deploy — adjust if
                 * speaker vs headphone logic is inverted. */
                if (d1 == CC_LINE_OUT_DETECT) {
                    int new_speaker = (d2 == 0) ? 1 : 0;  /* val=0 → speaker active; val=127 → jack inserted */
                    int prev_known_speaker = shadow_speaker_active && shadow_speaker_active_known;
                    if (new_speaker != shadow_speaker_active) {
                        shadow_speaker_active = new_speaker;
                        if (shadow_control) shadow_control->speaker_active = (uint8_t)new_speaker;
                        /* Reset filter state on output switch to avoid thump */
                        memset(speaker_eq_state, 0, sizeof(speaker_eq_state));
                    }
                    /* Auto-mode stability: restart the speaker stability clock on
                     * a new entry into the speaker state. */
                    if (new_speaker && !prev_known_speaker) {
                        clock_gettime(CLOCK_MONOTONIC, &spk_eq_speaker_since);
                    }
                }

                if (d1 == CC_MIC_IN_DETECT) {
                    int new_line_in = (d2 == 0) ? 0 : 1;
                    if (new_line_in != shadow_line_in_connected) {
                        shadow_line_in_connected = new_line_in;
                        if (shadow_control) shadow_control->line_in_connected = (uint8_t)new_line_in;
                        char msg[64];
                        snprintf(msg, sizeof(msg),
                                 "CC 114 line-in detect: val=%d → line_in_connected=%d",
                                 d2, new_line_in);
                        shadow_log(msg);
                    }
                }

                /* In overtake mode, skip all shortcuts except:
                 *   Shift+Vol+Jog Click (exit) / Shift+Vol+Back (suspend)
                 *   Shift+Vol+Capture (skipback — bare Shift+Capture belongs
                 *   to the overtake module)
                 *   the Quantized Sampler's controls: Shift+Vol+Sample (arm;
                 *   bare Shift+Sample resumes/cancels only once ENGAGED —
                 *   idle it passes to the primary module), Sample while
                 *   engaged (stop), and jog/jog-click/Back while its
                 *   fullscreen menu is up. CC 118 stays in this exempt list
                 *   under bare Shift so the intercept can decline it there. */
                {
                    int sampler_engaged = (sampler_state != SAMPLER_IDLE);
                    if (overtake_active &&
                        !(d1 == CC_RECORD && (shadow_shift_held || sampler_engaged)) &&
                        !((d1 == CC_JOG_WHEEL || d1 == CC_JOG_CLICK || d1 == CC_BACK) &&
                          sampler_engaged && sampler_fullscreen_active) &&
                        !(d1 == CC_JOG_CLICK && shadow_shift_held && shadow_volume_knob_touched) &&
                        !(d1 == CC_BACK && shadow_shift_held && shadow_volume_knob_touched) &&
                        !(d1 == CC_CAPTURE && shadow_shift_held && shadow_volume_knob_touched)) {
                        continue;
                    }
                }
                /* DEBUG: log CCs while shift held */
                if (shadow_shift_held && d2 > 0) {
                    char dbg[64];
                    snprintf(dbg, sizeof(dbg), "Shift+CC: cc=%d val=%d", d1, d2);
                    shadow_log(dbg);
                }
                /* Track buttons are CCs 40-43 */
                if (d1 >= 40 && d1 <= 43) {
                    int pressed = (d2 > 0);
                    shadow_update_held_track(d1, pressed);
                    if (pressed && shadow_control) shadow_control->move_ui_mode = 2; /* NOTE */

                    /* Update selected slot when track is pressed (for Shift+Knob routing)
                     * Track buttons are reversed: CC43=Track1, CC42=Track2, CC41=Track3, CC40=Track4 */
                    if (pressed) {
                        int new_slot = 43 - d1;  /* Reverse: CC43→0, CC42→1, CC41→2, CC40→3 */
                        if (new_slot != shadow_selected_slot) {
                            shadow_selected_slot = new_slot;
                            /* Sync to shared memory for shadow UI and Shift+Knob routing */
                            if (shadow_control) {
                                shadow_control->selected_slot = (uint8_t)new_slot;
                                shadow_control->ui_slot = (uint8_t)new_slot;
                            }
                            char msg[64];
                            snprintf(msg, sizeof(msg), "Selected slot: %d (Track %d)", new_slot, new_slot + 1);
                            shadow_log(msg);
                        }

                        /* Shift + Mute + Track = toggle solo; Mute + Track = toggle mute */
                        if (shadow_mute_held) {
                            if (shadow_shift_held) {
                                shadow_toggle_solo(new_slot);
                            } else {
                                shadow_apply_mute(new_slot, !shadow_chain_slots[new_slot].muted);
                            }
                        }

                        /* (Shift+Vol+Track slot-settings jump DELETED 2026-08-09 —
                         * slot settings live in the primary module's sound mode.) */

                        /* Shift + Track (without Volume / Mute) while shadow UI is displayed = dismiss shadow UI
                         * and let the Track CC pass through to Move for native track settings.
                         * Excluded: Shift+Mute+Track is the solo combo handled above — must not
                         * also dismiss shadow UI (leaks the Mute release to Move firmware and
                         * leaves Mute "latched" on the hardware). */
                        if (shadow_display_mode && shadow_shift_held && !shadow_volume_knob_touched &&
                            !shadow_mute_held && shadow_control) {
                            shadow_display_mode = 0;
                            shadow_control->display_mode = 0;
                            shadow_log("Shift+Track: dismissing shadow UI");
                        }
                    }

                    /* Track release while shadow UI is displayed = dismiss it.
                     * (Long-press slot-settings entry DELETED 2026-08-09.)
                     * Skip if the volume knob is/was involved (volume tweak
                     * gesture) or Mute is held — Mute+Track (slot mute) and
                     * Shift+Mute+Track (solo) are modifier combos; releasing
                     * Track must not dismiss the shadow UI, or the trailing
                     * Mute release leaks to Move firmware and latches Mute. */
                    if (shadow_ui_enabled && !pressed &&
                        shadow_display_mode && shadow_control &&
                        !shadow_volume_knob_touched &&
                        !shadow_mute_held && !shadow_shift_held) {
                        shadow_display_mode = 0;
                        shadow_control->display_mode = 0;
                        shadow_log("Track tap: dismissing shadow UI");
                    }
                }

                /* Mute button (CC 88): track held state */
                if (d1 == CC_MUTE) {
                    shadow_mute_held = (d2 > 0) ? 1 : 0;
                }

                /* Menu release while shadow UI is displayed = dismiss it.
                 * (Long-press Master FX entry DELETED 2026-08-09 — the FX
                 * buses live in the primary module's sound mode.) */
                if (d1 == CC_MENU && shadow_ui_enabled && d2 == 0 &&
                    shadow_display_mode && shadow_control &&
                    !(shadow_shift_held && shadow_volume_knob_touched)) {
                    shadow_display_mode = 0;
                    shadow_control->display_mode = 0;
                    shadow_log("Menu tap: dismissing shadow UI");
                }

                /* Shift + Volume + Back = suspend overtake (JACK keeps running) */
                if (d1 == CC_BACK && d2 > 0) {
                    if (shadow_shift_held && shadow_volume_knob_touched && shadow_control &&
                        shadow_ui_enabled && shadow_control->overtake_mode >= 2) {
                        shadow_control->suspend_overtake = 1;
                        shadow_control->ui_flags |= SHADOW_UI_FLAG_JUMP_TO_OVERTAKE;
                        /* Block Back from reaching Move */
                        src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
                    }
                }

                /* Shift + Volume + Jog Click = toggle overtake module menu (if shadow UI enabled) */
                if (d1 == CC_JOG_CLICK && d2 > 0) {
                    if (shadow_shift_held && shadow_volume_knob_touched && shadow_control && shadow_ui_enabled) {
                        if (!shadow_display_mode) {
                            /* From Move mode: launch shadow UI and show overtake menu */
                            shadow_control->ui_flags |= SHADOW_UI_FLAG_JUMP_TO_OVERTAKE;
                            shadow_display_mode = 1;
                            shadow_control->display_mode = 1;
                            launch_shadow_ui_reset_backoff();
                            launch_shadow_ui();
                        } else {
                            /* Already in shadow mode: toggle - if in overtake, exit to Move */
                            shadow_control->ui_flags |= SHADOW_UI_FLAG_JUMP_TO_OVERTAKE;
                        }
                        /* Block Jog Click from reaching Move */
                        src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
                    }
                }

                /* Skipback: Shift+Vol+Capture. Bare Shift+Capture belongs to
                 * the primary module (2026-08-09 — it uses Shift+Capture for
                 * discard-captured-input, Move parity), so the volume-knob
                 * touch is REQUIRED and the old configurable mode is gone. */
                if (d1 == CC_CAPTURE && d2 > 0 && shadow_shift_held &&
                    shadow_volume_knob_touched) {
                    skipback_trigger_save();
                    src[j] = 0; src[j+1] = 0; src[j+2] = 0; src[j+3] = 0;
                }

                /* Sample/Record button (CC 118) - sampler intercept */
                if (d1 == CC_RECORD && d2 > 0) {
                    /* ⭑ The ARM chord is Shift+VOL+Sample (2026-09-01): bare
                     * Shift+Sample belongs to the primary module now, so an
                     * IDLE sampler ignores it and the event passes through
                     * unconsumed. Once ENGAGED the sampler owns the button —
                     * resume/cancel/force-stop stay on bare Shift+Sample,
                     * matching Skipback's Shift+Vol+Capture entry shape. */
                    if (shadow_shift_held &&
                        (shadow_volume_knob_touched || sampler_state != SAMPLER_IDLE)) {
                        /* Shift(+Vol)+Sample: arm/resume/cancel/force-stop.
                         * Arm is allowed while an overtake module owns the
                         * display (the sampler draws over it) — the old
                         * !shadow_display_mode gate silently killed the
                         * gesture for the whole life of an overtake session.
                         * Still refused while the shadow MENU UI is up
                         * without an overtake (its own input owns the jog). */
                        if (sampler_state == SAMPLER_IDLE &&
                            (!shadow_display_mode || overtake_active)) {
                            sampler_state = SAMPLER_ARMED;
                            sampler_overlay_active = 1;
                            sampler_overlay_timeout = 0;
                            sampler_fullscreen_active = 1;
                            sampler_menu_cursor = SAMPLER_MENU_SOURCE;
                            shadow_overlay_sync();
                            shadow_log("Sampler: ARMED");
                            {
                                char sr_buf[256];
                                const char *src = (sampler_source == SAMPLER_SOURCE_RESAMPLE)
                                    ? "Resample" : "Move Input";
                                snprintf(sr_buf, sizeof(sr_buf),
                                    "Quantized Sampler. Source: %s. "
                                    "Press play or a pad to begin recording.",
                                    src);
                                send_screenreader_announcement(sr_buf);
                            }
                        } else if (sampler_state != SAMPLER_IDLE && !sampler_fullscreen_active) {
                            sampler_overlay_active = 1;
                            sampler_overlay_timeout = 0;
                            sampler_fullscreen_active = 1;
                            shadow_overlay_sync();
                            shadow_log("Sampler: fullscreen resumed via Shift+Sample");
                            send_screenreader_announcement("Sampler resumed");
                        } else if (sampler_state == SAMPLER_ARMED) {
                            sampler_state = SAMPLER_IDLE;
                            sampler_overlay_active = 0;
                            sampler_fullscreen_active = 0;
                            shadow_overlay_sync();
                            shadow_log("Sampler: cancelled");
                            send_screenreader_announcement("Sampler cancelled");
                        } else if (sampler_state == SAMPLER_RECORDING) {
                            shadow_log("Sampler: force stop via Shift+Sample");
                            sampler_request_stop();
                        } else if (sampler_state == SAMPLER_PREROLL) {
                            shadow_log("Sampler: preroll cancelled via Shift+Sample");
                            sampler_request_stop();
                        }
                        src[j] = 0; src[j+1] = 0; src[j+2] = 0; src[j+3] = 0;
                    } else if (sampler_state == SAMPLER_RECORDING) {
                        /* Bare Sample while recording: stop */
                        shadow_log("Sampler: stopped via Sample button");
                        sampler_request_stop();
                        src[j] = 0; src[j+1] = 0; src[j+2] = 0; src[j+3] = 0;
                    } else if (sampler_state == SAMPLER_PREROLL) {
                        /* Bare Sample while preroll: cancel back to armed */
                        shadow_log("Sampler: preroll cancelled via Sample button");
                        sampler_request_stop();
                        src[j] = 0; src[j+1] = 0; src[j+2] = 0; src[j+3] = 0;
                    }
                }

                /* Back button while sampler is visible = hide sampler UI */
                if (d1 == CC_BACK && d2 > 0 &&
                    sampler_state != SAMPLER_IDLE && sampler_fullscreen_active) {
                    sampler_overlay_active = 0;
                    sampler_overlay_timeout = 0;
                    sampler_fullscreen_active = 0;
                    shadow_overlay_sync();
                    shadow_log("Sampler: fullscreen dismissed via Back");
                    send_screenreader_announcement("Sampler hidden. Shift+Sample to resume.");
                    src[j] = 0; src[j+1] = 0; src[j+2] = 0; src[j+3] = 0;
                }

                /* Jog wheel while sampler is armed = navigate menu */
                if (d1 == CC_JOG_WHEEL &&
                    sampler_state == SAMPLER_ARMED && sampler_fullscreen_active) {
                    /* Decode relative value: 1-63=CW, 65-127=CCW */
                    if (d2 >= 1 && d2 <= 63) {
                        if (sampler_menu_cursor < SAMPLER_MENU_COUNT - 1)
                            sampler_menu_cursor++;
                    } else if (d2 >= 65 && d2 <= 127) {
                        if (sampler_menu_cursor > 0)
                            sampler_menu_cursor--;
                    }
                    shadow_overlay_sync();
                    sampler_announce_menu_item();
                    /* Block jog from reaching Move/shadow UI */
                    src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
                }

                /* Jog click while sampler is armed = cycle selected menu item */
                if (d1 == CC_JOG_CLICK && d2 > 0 &&
                    sampler_state == SAMPLER_ARMED && sampler_fullscreen_active) {
                    if (sampler_menu_cursor == SAMPLER_MENU_SOURCE) {
                        sampler_source = (sampler_source == SAMPLER_SOURCE_RESAMPLE)
                            ? SAMPLER_SOURCE_MOVE_INPUT : SAMPLER_SOURCE_RESAMPLE;
                    } else if (sampler_menu_cursor == SAMPLER_MENU_DURATION) {
                        sampler_duration_index = (sampler_duration_index + 1) % SAMPLER_DURATION_COUNT;
                    } else if (sampler_menu_cursor == SAMPLER_MENU_PREROLL) {
                        sampler_preroll_enabled = !sampler_preroll_enabled;
                    }
                    shadow_overlay_sync();
                    sampler_announce_menu_item();
                    src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
                }
            }

            /* Note On/Off messages (CIN 0x09/0x08) for knob touches and step buttons */
            if ((cin == 0x09 || cin == 0x08) && (type == 0x90 || type == 0x80)) {
                int touched = (type == 0x90 && d2 > 0);

                /* Volume knob touch (note 8) */
                if (d1 == 8) {
                    if (touched != shadow_volume_knob_touched) {
                        shadow_volume_knob_touched = touched;
                        volumeTouched = touched;
                        if (!touched) {
                            shadow_block_plain_volume_hide_until_release = 0;
                        }
                        char msg[64];
                        snprintf(msg, sizeof(msg), "Volume knob touch: %s", touched ? "ON" : "OFF");
                        shadow_log(msg);
                    }
                }

                /* Jog encoder touch (note 9) */
                if (d1 == 9) {
                    shadow_jog_touched = touched;
                }

                /* Shift + Step 13 (note 28) = Tools menu — the ONE surviving
                 * jump gesture (2026-08-09): the Tools menu is the only host
                 * menu with no home in the primary module, and it is the
                 * resume path for a suspended tool. The Global Settings /
                 * slot-settings / Master FX gestures are gone — those menus
                 * are the module's own (or opened by it as services). */
                if (d1 == 28 && type == 0x90 && d2 > 0 &&
                    shadow_shift_held && shadow_control && shadow_ui_enabled) {
                    shadow_control->ui_flags |= SHADOW_UI_FLAG_JUMP_TO_TOOLS;
                    shadow_display_mode = 1;
                    shadow_control->display_mode = 1;
                    launch_shadow_ui_reset_backoff();
                    launch_shadow_ui();  /* No-op if already running */
                    /* Arm the long-press timer: held past 500ms resumes the
                     * most-recently-suspended tool (periodic check above). */
                    clock_gettime(CLOCK_MONOTONIC, &step13_press_time);
                    step13_longpress_pending = 1;
                    step13_longpress_fired = 0;
                    /* Block Step note from reaching Move */
                    uint8_t *sh = shadow + MIDI_IN_OFFSET;
                    sh[j] = 0; sh[j+1] = 0; sh[j+2] = 0; sh[j+3] = 0;
                    src[j] = 0; src[j+1] = 0; src[j+2] = 0; src[j+3] = 0;
                    shadow_log("Shift+Step13: opening tools");
                }
                if (d1 == 28 && (type == 0x80 || (type == 0x90 && d2 == 0))) {
                    step13_longpress_pending = 0;
                }

                /* Shift + Step button while shadow UI is displayed = dismiss shadow UI
                 * (user is loading a native Move component to edit).
                 * Skip in overtake mode — the overtake module owns step buttons.
                 * Skip Step 13 (28) — the Tools shortcut. */
                if (shadow_display_mode && shadow_shift_held && !shadow_volume_knob_touched &&
                    type == 0x90 && d2 > 0 && d1 != 28 &&
                    d1 >= CC_STEP_UI_FIRST && d1 <= CC_STEP_UI_LAST &&
                    shadow_control && shadow_control->overtake_mode == 0) {
                    shadow_display_mode = 0;
                    shadow_control->display_mode = 0;
                    shadow_log("Shift+Step: dismissing shadow UI");
                }

                /* Pad note-on while sampler armed = trigger recording (or preroll) */
                if (type == 0x90 && d2 > 0 && d1 >= 68 && d1 <= 99 &&
                    sampler_state == SAMPLER_ARMED) {
                    if (sampler_preroll_enabled && sampler_duration_options[sampler_duration_index] > 0) {
                        shadow_log("Sampler: triggered preroll by pad note-on");
                        sampler_request_start(1);
                    } else {
                        shadow_log("Sampler: triggered by pad note-on");
                        sampler_request_start(0);
                    }
                    /* Do NOT block the note - it must play so it gets recorded */
                }
            }
        }

        /* External MIDI trigger (cable 2): any note-on triggers recording when armed */
        if (sampler_state == SAMPLER_ARMED) {
            for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
                uint8_t cable = (src[j] >> 4) & 0x0F;
                uint8_t cin = src[j] & 0x0F;
                if (cable != 0x02) continue;
                if (cin == 0x09) {  /* Note-on */
                    uint8_t vel = src[j + 3];
                    if (vel > 0) {
                        if (sampler_preroll_enabled && sampler_duration_options[sampler_duration_index] > 0) {
                            shadow_log("Sampler: triggered preroll by external MIDI (cable 2)");
                            sampler_request_start(1);
                        } else {
                            shadow_log("Sampler: triggered by external MIDI (cable 2)");
                            sampler_request_start(0);
                        }
                        /* Do NOT block - let note pass through for playback/recording */
                        break;
                    }
                }
            }
        }
    }

    /* === POST-IOCTL: OVERLAY KNOB INTERCEPTION (MOVE MODE) ===
     * When in Move mode (not shadow mode) and the overlay activation condition is met,
     * intercept knob CCs (71-78) and route to shadow chain DSP.
     * Also block knob touch notes (0-7) to prevent them reaching Move.
     * Activation depends on overlay_knobs_mode: Shift (0), Jog Touch (1), Off (2), or Native (3). */
    uint8_t overlay_knobs_mode = shadow_control ? shadow_control->overlay_knobs_mode : OVERLAY_KNOBS_NATIVE;
    int overlay_active = 0;
    if (overlay_knobs_mode == OVERLAY_KNOBS_SHIFT) overlay_active = shiftHeld;
    else if (overlay_knobs_mode == OVERLAY_KNOBS_JOG_TOUCH) overlay_active = shadow_jog_touched;

    if (!shadow_display_mode && overlay_active && shadow_ui_enabled &&
        shadow_inprocess_ready && global_mmap_addr) {
        uint8_t *src = global_mmap_addr + MIDI_IN_OFFSET;
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin = src[j] & 0x0F;
            uint8_t cable = (src[j] >> 4) & 0x0F;
            if (cable != 0x00) continue;  /* Only internal cable */

            uint8_t status = src[j + 1];
            uint8_t type = status & 0xF0;
            uint8_t d1 = src[j + 2];
            uint8_t d2 = src[j + 3];

            /* Handle knob touch notes 0-7 - block from Move, show overlay */
            if ((cin == 0x09 || cin == 0x08) && (type == 0x90 || type == 0x80) && d1 <= 7) {
                int knob_num = d1 + 1;  /* Note 0 = Knob 1, etc. */
                /* Use ui_slot from shadow UI navigation, fall back to track button selection */
                int slot = (shadow_control && shadow_control->ui_slot < SHADOW_CHAIN_INSTANCES)
                           ? shadow_control->ui_slot : shadow_selected_slot;
                if (slot < 0 || slot >= SHADOW_CHAIN_INSTANCES) slot = 0;

                /* Note On (touch start) - show overlay and hold it */
                if (type == 0x90 && d2 > 0) {
                    shift_knob_update_overlay(slot, knob_num, 0);
                    /* Set timeout very high so it stays visible until Note Off */
                    shift_knob_overlay_timeout = 10000;
                }
                /* Note Off (touch release) - start normal timeout for fade */
                else if (type == 0x80 || (type == 0x90 && d2 == 0)) {
                    /* Only fade if this is the knob that's currently shown */
                    if (shift_knob_overlay_active && shift_knob_overlay_knob == knob_num) {
                        shift_knob_overlay_timeout = SHIFT_KNOB_OVERLAY_FRAMES;
                        shadow_overlay_sync();
                    }
                }
                /* Block touch note from reaching Move */
                src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
                continue;
            }

            /* Handle knob CC messages - adjust parameter via set_param */
            if (cin == 0x0B && type == 0xB0 && d1 >= 71 && d1 <= 78) {
                int knob_num = d1 - 70;  /* 1-8 */
                /* Use ui_slot from shadow UI navigation, fall back to track button selection */
                int slot = (shadow_control && shadow_control->ui_slot < SHADOW_CHAIN_INSTANCES)
                           ? shadow_control->ui_slot : shadow_selected_slot;
                if (slot < 0 || slot >= SHADOW_CHAIN_INSTANCES) slot = 0;

                /* Debug: log knob CC received */
                {
                    char dbg[128];
                    snprintf(dbg, sizeof(dbg), "Shift+Knob: CC=%d knob=%d d2=%d slot=%d active=%d v2=%d set_param=%d",
                             d1, knob_num, d2, slot,
                             shadow_chain_slots[slot].active,
                             shadow_plugin_v2 ? 1 : 0,
                             (shadow_plugin_v2 && shadow_plugin_v2->set_param) ? 1 : 0);
                    shadow_log(dbg);
                }

                /* Adjust parameter if slot is active */
                if (shadow_chain_slots[slot].active && shadow_plugin_v2 && shadow_plugin_v2->set_param) {
                    /* Decode relative encoder value to delta (1 = CW, 127 = CCW) */
                    int delta = 0;
                    if (d2 >= 1 && d2 <= 63) delta = d2;      /* Clockwise: 1-63 */
                    else if (d2 >= 65 && d2 <= 127) delta = d2 - 128;  /* Counter-clockwise: -63 to -1 */

                    if (delta != 0) {
                        /* Adjust parameter via knob_N_adjust */
                        char key[32];
                        char val[16];
                        snprintf(key, sizeof(key), "knob_%d_adjust", knob_num);
                        snprintf(val, sizeof(val), "%d", delta);
                        shadow_plugin_v2->set_param(shadow_chain_slots[slot].instance, key, val);
                    }
                }

                /* Always show overlay (shows "Unmapped" for unmapped knobs) */
                shift_knob_update_overlay(slot, knob_num, d2);

                /* Block CC from reaching Move when shift held */
                src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
            }
        }
    }

    /* === POST-IOCTL: NATIVE OVERLAY KNOB INTERCEPTION (MOVE MODE) ===
     * In Native mode, knob touches pass through to Move so the Schwung Slot preset
     * macros fire and produce D-Bus screen reader text ("Schwung S1 K3 57.42").
     * The D-Bus handler parses the text and maps knob -> shadow slot.
     * Once mapped, subsequent CCs are intercepted and routed to shadow DSP. */
    if (!shadow_display_mode && overlay_knobs_mode == OVERLAY_KNOBS_NATIVE &&
        shadow_ui_enabled && shadow_inprocess_ready && global_mmap_addr) {
        uint8_t *src = global_mmap_addr + MIDI_IN_OFFSET;
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin = src[j] & 0x0F;
            uint8_t cable = (src[j] >> 4) & 0x0F;
            if (cable != 0x00) continue;  /* Only internal cable */

            uint8_t status = src[j + 1];
            uint8_t type = status & 0xF0;
            uint8_t d1 = src[j + 2];
            uint8_t d2 = src[j + 3];

            /* Handle knob touch notes 0-7 - let pass through to Move, track touch state */
            if ((cin == 0x09 || cin == 0x08) && (type == 0x90 || type == 0x80) && d1 <= 7) {
                int idx = d1;  /* Note 0 = knob index 0 */

                if (type == 0x90 && d2 > 0) {
                    /* Touch start - flag as touched, clear any stale mapping */
                    native_knob_touched[idx] = 1;
                    native_knob_mapped[idx] = 0;
                    native_knob_slot[idx] = -1;
                    native_knob_any_touched = 1;
                } else if (type == 0x80 || (type == 0x90 && d2 == 0)) {
                    /* Touch release - clear mapping and touch state */
                    native_knob_touched[idx] = 0;
                    native_knob_mapped[idx] = 0;
                    native_knob_slot[idx] = -1;
                    /* Recompute any_touched */
                    int any = 0;
                    for (int k = 0; k < 8; k++) {
                        if (native_knob_touched[k]) { any = 1; break; }
                    }
                    native_knob_any_touched = any;
                    /* Start overlay fade timeout */
                    int knob_num = idx + 1;
                    if (shift_knob_overlay_active && shift_knob_overlay_knob == knob_num) {
                        shift_knob_overlay_timeout = SHIFT_KNOB_OVERLAY_FRAMES;
                        shadow_overlay_sync();
                    }
                }
                /* DO NOT block - let touch note pass through to Move */
                continue;
            }

            /* Handle knob CC messages (71-78) */
            if (cin == 0x0B && type == 0xB0 && d1 >= 71 && d1 <= 78) {
                int idx = d1 - 71;     /* 0-7 */
                int knob_num = idx + 1; /* 1-8 */

                if (native_knob_mapped[idx] && native_knob_slot[idx] >= 0) {
                    /* Mapped: intercept CC and route to shadow slot */
                    int slot = native_knob_slot[idx];
                    if (slot < SHADOW_CHAIN_INSTANCES &&
                        shadow_chain_slots[slot].active &&
                        shadow_plugin_v2 && shadow_plugin_v2->set_param) {
                        int delta = 0;
                        if (d2 >= 1 && d2 <= 63) delta = d2;
                        else if (d2 >= 65 && d2 <= 127) delta = d2 - 128;

                        if (delta != 0) {
                            char key[32];
                            char val[16];
                            snprintf(key, sizeof(key), "knob_%d_adjust", knob_num);
                            snprintf(val, sizeof(val), "%d", delta);
                            shadow_plugin_v2->set_param(shadow_chain_slots[slot].instance, key, val);
                        }
                    }
                    /* Show overlay */
                    shift_knob_update_overlay(native_knob_slot[idx], knob_num, d2);
                    /* Block CC from reaching Move */
                    src[j] = 0; src[j + 1] = 0; src[j + 2] = 0; src[j + 3] = 0;
                }
                /* else: not yet mapped - let CC pass through to Move so macro fires D-Bus text */
            }
        }
    }

    /* Shift release while the knob overlay shows: deliberately not cleared
     * here — the overlay timeout handles it for a smooth fade-out. */

    /* === POST-IOCTL: FORWARD MIDI TO SHADOW UI AND HANDLE CAPTURE RULES ===
     * Shadow mailbox sync already filtered MIDI_IN for Move.
     * Here we scan the UNFILTERED hardware buffer to:
     * 1. Forward relevant events to shadow_ui_midi_shm
     * 2. Handle capture rules (route captured events to DSP) */
    if (shadow_display_mode && shadow_control && hardware_mmap_addr) {
        uint8_t *src = hardware_mmap_addr + MIDI_IN_OFFSET;  /* Scan unfiltered hardware buffer */
        int overtake_mode = shadow_control->overtake_mode;

        for (int j = 0; j < SHADOW_MIDI_IN_BYTES; j += 8) {
            uint8_t cin = src[j] & 0x0F;
            uint8_t cable = (src[j] >> 4) & 0x0F;
            /* In overtake mode, allow sysex (CIN 0x04-0x07) and normal messages (0x08-0x0E) */
            if (overtake_mode) {
                if (cin < 0x04 || cin > 0x0E) continue;
            } else {
                if (cin < 0x08 || cin > 0x0E) continue;
                if (cable != 0x00) continue;  /* Only internal cable 0 (Move hardware) */
            }
            /* Cable 14 ("system") carries internal signaling — e.g. the power
             * button's CC, whose value on a long hold (0x3A = 58) happens to
             * collide with Move's own Loop-button CC number. It was never
             * meant to reach a module's regular MIDI dispatch as an ordinary
             * button press (a module's onMidiMessageInternal receives
             * [status, d1, d2] with no cable byte to tell the two apart, per
             * docs/MODULES.md's module contract), so it never should have.
             * Confirmed on-device upstream: a power-button hold entered a
             * module's Loop mode via this path. */
            if (cable == 0x0E) continue;

            uint8_t status = src[j + 1];
            uint8_t type = status & 0xF0;
            uint8_t d1 = src[j + 2];
            uint8_t d2 = src[j + 3];

            /* Deliver internal cable-0 note events (d1 >= 10, excludes
             * knob-touch reserved range 0–9) to the loaded overtake DSP
             * via its audio-thread on_midi hook.  Enables overtake tools
             * to handle pad input on the audio thread instead of through
             * the JS round-trip below. */
            if (overtake_mode == 2 && cable == 0x00 &&
                (type == 0x90 || type == 0x80) && d1 >= 10) {
                if (overtake_dsp_gen && overtake_dsp_gen_inst && overtake_dsp_gen->on_midi) {
                    uint8_t msg[3] = { status, d1, d2 };
                    overtake_dsp_gen->on_midi(overtake_dsp_gen_inst, msg, 3, MOVE_MIDI_SOURCE_INTERNAL);
                } else if (overtake_dsp_fx && overtake_dsp_fx_inst && overtake_dsp_fx->on_midi) {
                    uint8_t msg[3] = { status, d1, d2 };
                    overtake_dsp_fx->on_midi(overtake_dsp_fx_inst, msg, 3, MOVE_MIDI_SOURCE_INTERNAL);
                }
            }

            /* In overtake mode, forward events to shadow UI.
             * overtake_mode=1 (menu): only forward UI events (jog, click, back)
             * overtake_mode=2 (module): forward ALL events (all cables) */
            if (overtake_mode && shadow_ui_midi_shm) {
                /* In menu mode (1), only forward essential UI events */
                if (overtake_mode == 1) {
                    int is_ui_event = (type == 0xB0 &&
                                      (d1 == 14 || d1 == 3 || d1 == 51 ||  /* jog, click, back */
                                       (d1 >= 40 && d1 <= 43)));           /* track buttons */
                    if (!is_ui_event) continue;  /* Skip non-UI events in menu mode */
                }

                /* Co-run forward-suppress: when the peer is a SEPARATE process
                 * (Move firmware in move_native), we gate the publish here so
                 * the tool doesn't see events that already went to Move via
                 * the pre-ioctl filter. For chain-edit the peer IS shadow_ui
                 * (same process as the tool dispatch), so shadow_ui.js handles
                 * routing internally via coRunCedes() — we MUST let publish
                 * through, otherwise the chain editor never receives jog,
                 * track buttons, etc. Back-as-framework-exit also lives here:
                 * when corun_event_owner returns NONE (Back without
                 * CORUN_KEEP_BACK opt-out), end the session and suppress. */
                if (overtake_mode == 2 && cable == 0x00 && corun_active(shadow_control)) {
                    corun_owner_t owner = corun_event_owner(shadow_control, type, d1);
                    if (owner == CORUN_OWNER_NONE && type == 0xB0 && d1 == CC_BACK && d2 > 0) {
                        shadow_control->corun.target = CORUN_TARGET_NONE;
                        shadow_control->corun.id = -1;
                        shadow_control->corun.flags = 0;
                        shadow_control->corun.keep_mask = 0;
                        shadow_control->corun.led_keep_mask = 0;
                        shadow_control->shadow_display_owner = DISPLAY_OWNER_SCHWUNG_UI;
                        shadow_log("Back: exiting co-run");
                        continue;
                    }
                    /* Move-native only: cede-to-peer events go to Move via the
                     * pre-ioctl filter, so suppress the duplicate to shadow_ui
                     * here. For chain-edit the peer is shadow_ui itself — let
                     * publish through and rely on its coRunCedes() gating. */
                    if (corun_target(shadow_control) == CORUN_TARGET_MOVE_NATIVE &&
                        (owner == CORUN_OWNER_PEER || owner == CORUN_OWNER_NONE)) {
                        continue;
                    }
                }

                /* BLOCK channels: hardware_mmap_addr is NOT modified (writing
                 * MIDI_IN hardware crashes Move), so src here has the original
                 * velocity.  Forward the note-on normally so SEQ8 can route it.
                 * Move won't play it because sh_midi has the patched note-off. */

                /* Queue cable 2 note-on messages (external LED commands like M8)
                 * for rate-limited forwarding to prevent buffer overflow */
                if (cable == 0x02 && type == 0x90) {
                    shadow_queue_input_led(src[j], status, d1, d2);
                    continue;
                }

                /* All other messages: forward directly */
                shadow_ui_midi_publish(src[j], status, d1, d2);
                continue;  /* Skip normal processing in overtake mode */
            }

            /* Handle CC events */
            if (type == 0xB0) {
                /* CCs to forward to shadow UI:
                 * - CC 14 (jog wheel), CC 3 (jog click), CC 51 (back)
                 * - CC 40-43 (track buttons)
                 * - CC 71-78 (knobs)
                 * - CC 88 (mute) — used as a modifier for Mute+JogClick module bypass
                 * - any CC the module on screen has CLAIMED (capabilities.claims_ccs
                 *   / claims_edit_ccs), by the latch the firmware filter above set
                 *   on its press -- so a claimed press drives the module and
                 *   nothing else. Unclaimed, a button is not forwarded and reaches
                 *   Move unchanged. */
                int forward_to_shadow = (d1 == 14 || d1 == 3 || d1 == 51 ||
                                         (d1 >= 40 && d1 <= 43) || (d1 >= 71 && d1 <= 78) ||
                                         d1 == 88 ||
                                         (d1 < 128 && claim_press_blocked[d1]));

                if (forward_to_shadow && shadow_ui_midi_shm) {
                    shadow_ui_midi_publish(0x0B, status, d1, d2);
                }

                /* Mute (CC 88) is passed through to Move firmware unconditionally,
                 * even while the shadow UI is shown, so Move-native Mute+Pad
                 * (per-drum mute) works. shadow_mute_held is already updated from
                 * the hardware buffer above, so the shadow combos (Mute+Track slot
                 * mute, Shift+Mute+Track solo, Mute+JogClick bypass) still work.
                 * Trade-off: a plain Mute tap also toggles Move's selected-track
                 * mute, and Mute+Track double-mutes (slot + Move track). */

                /* Check capture rules for CCs (beyond the hardcoded blocks) */
                /* Skip knobs - they're handled by shadow UI, not routed to DSP */
                int is_knob_cc = (d1 >= 71 && d1 <= 78);
                {
                    /* !is_knob_cc first: knob CCs stream continuously and are
                     * never routed here, so there is no reason to walk the
                     * capture rules for them. */
                    if (!is_knob_cc && shadow_focused_captures_cc(d1)) {
                        /* Route captured CC to focused slot's DSP */
                        int slot = shadow_control ? shadow_control->ui_slot : 0;
                        if (slot >= 0 && slot < SHADOW_CHAIN_INSTANCES &&
                            shadow_chain_slots[slot].active &&
                            shadow_plugin_v2 && shadow_plugin_v2->on_midi) {
                            uint8_t msg[3] = { status, d1, d2 };
                            shadow_plugin_v2->on_midi(shadow_chain_slots[slot].instance, msg, 3,
                                                      MOVE_MIDI_SOURCE_INTERNAL);
                        }
                    }
                }
                continue;
            }

            /* Handle note events */
            if (type == 0x90 || type == 0x80) {
                /* Forward track notes (40-43) to shadow UI for slot switching */
                if (d1 >= 40 && d1 <= 43 && shadow_ui_midi_shm) {
                    shadow_ui_midi_publish((type == 0x90) ? 0x09 : 0x08, status, d1, d2);
                }

                /* Forward knob touch notes (0-7) to shadow UI for peek-at-value */
                if (d1 <= 7 && shadow_ui_midi_shm) {
                    shadow_ui_midi_publish((type == 0x90) ? 0x09 : 0x08, status, d1, d2);
                }

                /* Forward master/jog capacitive touch (notes 8-9) ONLY while a
                 * canvas overlay is active (shadow_ui sets canvas_input on
                 * canvas open/close) — canvas UIs can react to jog-wheel touch
                 * without changing what the shadow UI sees anywhere else. */
                else if (d1 <= 9 && shadow_ui_midi_shm &&
                         shadow_control && shadow_control->canvas_input) {
                    shadow_ui_midi_publish((type == 0x90) ? 0x09 : 0x08, status, d1, d2);
                }

                /* Forward pad notes (68-99) to shadow UI when pad_block is active,
                 * and skip DSP routing so pads only reach the text entry handler */
                if (shadow_control && shadow_control->pad_block &&
                    d1 >= 68 && d1 <= 99 && shadow_ui_midi_shm) {
                    shadow_ui_midi_publish((type == 0x90) ? 0x09 : 0x08, status, d1, d2);
                    continue;  /* Skip DSP routing for blocked pads */
                }

                /* Forward pad notes (68-99) to the shadow UI ONLY while a canvas
                 * overlay is active — same rule as the jog/knob touch notes just
                 * above, and for the same reason: a canvas UI can react to the
                 * hardware without changing what the shadow UI sees anywhere else.
                 *
                 * This is ADDITIONAL and passive. Routing below is untouched, so
                 * the pad still plays exactly as before; the canvas just also
                 * learns that a finger hit it.
                 *
                 * That distinction is otherwise unavailable. Move converts a press
                 * into an ordinary note, so by the time one reaches a module the
                 * status, channel, note and source are identical to a sequenced
                 * note (measured on device). Here it is still its raw pad number,
                 * which the sequencer cannot produce. */
                if (d1 >= 68 && d1 <= 99 && shadow_ui_midi_shm &&
                    shadow_control && shadow_control->canvas_input) {
                    shadow_ui_midi_publish((type == 0x90) ? 0x09 : 0x08, status, d1, d2);
                }

                /* Boot set-select gate: same passive forwarding while the
                 * phase is active — the select screen shows the tapped pad's
                 * set name while Move handles the tap natively. */
                if (d1 >= 68 && d1 <= 99 && shadow_ui_midi_shm &&
                    shadow_control && shadow_control->select_phase &&
                    !shadow_control->canvas_input) {
                    shadow_ui_midi_publish((type == 0x90) ? 0x09 : 0x08, status, d1, d2);
                }

                /* Check capture rules for focused slot.
                 * Never route knob touch notes (0-9) to DSP even if in capture rules. */
                {
                    if (d1 >= 10 && shadow_focused_captures_note(d1)) {
                        /* Route captured note to focused slot's DSP */
                        int slot = shadow_control ? shadow_control->ui_slot : 0;
                        if (slot >= 0 && slot < SHADOW_CHAIN_INSTANCES &&
                            shadow_chain_slots[slot].active &&
                            shadow_plugin_v2 && shadow_plugin_v2->on_midi) {
                            uint8_t msg[3] = { status, d1, d2 };
                            shadow_plugin_v2->on_midi(shadow_chain_slots[slot].instance, msg, 3,
                                                      MOVE_MIDI_SOURCE_INTERNAL);
                        }
                    }
                }

                /* Broadcast internal MIDI to ALL active slots for audio FX (e.g. ducker).
                 * FX_BROADCAST only forwards to audio FX, not synth/MIDI FX, so this
                 * is safe even for the focused slot that received normal dispatch.
                 *
                 * PADS ONLY. This is Move's own surface (cable 0 is enforced at
                 * the top of the loop), so a note number here is a physical
                 * control, not a pitch — and the old `d1 >= 10` guard let step
                 * buttons (16-31) and track buttons (40-43) through as if they
                 * were played notes. See fx_midi_filter.h. */
                if (move_surface_note_is_pad(d1) && shadow_plugin_v2 && shadow_plugin_v2->on_midi) {
                    for (int si = 0; si < SHADOW_CHAIN_INSTANCES; si++) {
                        if (!shadow_chain_slots[si].active || !shadow_chain_slots[si].instance)
                            continue;
                        uint8_t msg[3] = { status, d1, d2 };
                        shadow_plugin_v2->on_midi(shadow_chain_slots[si].instance, msg, 3,
                                                  MOVE_MIDI_SOURCE_FX_BROADCAST);
                    }
                }

                /* Forward note events to master FX (e.g. ducker).
                 * Pads only, for the reason given on the slot broadcast above. */
                if (move_surface_note_is_pad(d1)) {
                    uint8_t msg[3] = { status, d1, d2 };
                    shadow_master_fx_forward_midi(msg, 3, MOVE_MIDI_SOURCE_INTERNAL);
                }
                continue;
            }

            /* Forward polyphonic aftertouch on pad notes when pad_block is active */
            if (type == 0xA0 && shadow_control && shadow_control->pad_block &&
                d1 >= 68 && d1 <= 99 && shadow_ui_midi_shm) {
                shadow_ui_midi_publish(0x0A, status, d1, d2);
                continue;
            }
        }

        /* Flush pending input LED queue (for cable 2 external MIDI in overtake mode) */
        shadow_flush_pending_input_leds();
    }

    /* === POST-IOCTL: CLOSE THE GAPS THE FILTERING LEFT ===
     * Every place above that suppresses an event does it by zeroing that slot
     * in place. Move's firmware MIDI_IN reader STOPS at the first empty slot
     * (the Ableton SPI convention - schwung_usb_midi_msg_is_empty), so a
     * zeroed slot is not a hole, it is a TERMINATOR: everything behind it is
     * invisible to Move for that frame.
     *
     * That is how a held pad gets stuck. With the shadow UI up, knob CCs
     * (71-78) and knob-touch notes (0-9) are filtered on every detent; spin a
     * knob while pads are held and a pad note-off landing in a later slot of
     * the same frame never reaches Move. Move keeps the pad lit and its own
     * instrument sounding - and chain slots are fed from Move's MIDI_OUT
     * echo, so the slot synth never sees the note-off either.
     *
     * Compact LAST: the blocking sites above pair `sh[j]` with `hw[j]` by
     * index, so nothing may move while they run.
     *
     * Dense-prefix-then-zero is the shape the hardware itself delivers, and
     * events already shift between slots across frames, which is why the
     * dedup rings key on content plus timestamp rather than position. */
    if (global_mmap_addr)
        shadow_midi_in_compact(global_mmap_addr + MIDI_IN_OFFSET);

    /* === POST-IOCTL: INJECT KNOB RELEASE EVENTS ===
     * When toggling shadow mode, inject note-off events for knob touches
     * so Move doesn't think knobs are still being held.
     * This MUST happen AFTER filtering to avoid being zeroed out - and after
     * the compaction above, so the free slots are a contiguous tail. */
    if (shadow_inject_knob_release && global_mmap_addr) {
        shadow_inject_knob_release = 0;
        uint8_t *src = global_mmap_addr + MIDI_IN_OFFSET;
        /* Find empty slots and inject note-offs for knobs 0, 7, 8 (Knob1, Knob8, Volume) */
        const uint8_t knob_notes[] = { 0, 7, 8 };  /* Knob 1, Knob 8, Volume */
        int injected = 0;
        /* 8-byte stride: MIDI_IN events are 4 USB-MIDI + 4 timestamp bytes.
         * At the old 4-byte stride the second and third note-offs were written
         * into the *timestamp* halves of the events before them - malformed,
         * and it also left the injected packets' own timestamps un-zeroed. */
        for (int j = 0; j < SHADOW_MIDI_IN_BYTES && injected < 3; j += SHADOW_MIDI_IN_STRIDE) {
            if (shadow_midi_in_slot_empty(&src[j])) {
                /* Empty slot - inject note-off */
                src[j] = 0x08;  /* CIN = Note Off, Cable 0 */
                src[j + 1] = 0x80;  /* Note Off, channel 0 */
                src[j + 2] = knob_notes[injected];  /* Note number */
                src[j + 3] = 0x00;  /* Velocity 0 */
                memset(&src[j + 4], 0, 4);  /* synthetic event: zero timestamp */
                injected++;
            }
        }
    }

    /* End post-ioctl MIDI scan diagnostic (added 2026-05-15) */
    TIME_SECTION_END(spi_post_midi_scan_sum, spi_post_midi_scan_max);

    /* === POST-IOCTL: SECOND MIDI-TO-DSP DRAIN ===
     * Catch any MIDI that the shadow UI JS process wrote between the
     * pre-ioctl drain and now.  This roughly doubles the time window
     * for overtake modules calling shadow_send_midi_to_dsp(), reducing
     * the chance of a note being delayed by one frame (~2.9 ms). */
    TIME_SECTION_START();
    shadow_drain_ui_midi_dsp();
    TIME_SECTION_END(spi_post_drain_dsp_sum, spi_post_drain_dsp_max);

    /* === POST-IOCTL: DEFERRED DSP RENDERING (SLOW, ~300µs) ===
     * Render DSP for the NEXT frame. This happens AFTER the ioctl returns,
     * so Move gets to process pad events before we do heavy DSP work.
     * The rendered audio will be mixed in pre-ioctl of the next frame.
     */
    TIME_SECTION_START();
    {
        static uint64_t render_time_sum = 0;
        static int render_time_count = 0;
        static uint64_t render_time_max = 0;

        struct timespec render_start, render_end;
        clock_gettime(CLOCK_MONOTONIC, &render_start);

        shadow_inprocess_render_to_buffer();  /* Slow: actual DSP rendering */

        /* Slot FX aliasing diagnostic (flag-gated, zero cost when inactive).
         * Pattern mirrors /data/UserData/schwung/spi_snap_trigger — touch the
         * trigger file while the bug is audible to capture ~290ms of each
         * slot's audio before and after the chain FX pass.
         * See docs/LOGGING.md for usage. Output files (one pair per slot):
         *   /data/UserData/schwung/slot{N}_pre_fx.pcm   (raw s16le stereo @44.1k)
         *   /data/UserData/schwung/slot{N}_post_fx.pcm  (N = 0..3)
         * All are overwritten each trigger fire. Self-limits to 100 frames. */
        {
            static FILE *slot_pre_f[SHADOW_CHAIN_INSTANCES]  = {0};
            static FILE *slot_post_f[SHADOW_CHAIN_INSTANCES] = {0};
            static int slot_dump_frames = 0;
            if (slot_dump_frames > 0) {
                for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                    if (slot_pre_f[s])
                        fwrite(shadow_slot_deferred[s], sizeof(int16_t),
                               FRAMES_PER_BLOCK * 2, slot_pre_f[s]);
                    if (slot_post_f[s])
                        fwrite(shadow_slot_fx_deferred[s], sizeof(int16_t),
                               FRAMES_PER_BLOCK * 2, slot_post_f[s]);
                }
                slot_dump_frames--;
                if (slot_dump_frames == 0) {
                    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                        if (slot_pre_f[s])  { fclose(slot_pre_f[s]);  slot_pre_f[s]  = NULL; }
                        if (slot_post_f[s]) { fclose(slot_post_f[s]); slot_post_f[s] = NULL; }
                    }
                }
            } else if (shim_debug_flag_consume(SHIM_FLAG_SLOT_FX_DUMP)) {
                /* Worker already unlinked the trigger file. */
                for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                    char p[96];
                    snprintf(p, sizeof(p),
                             SCHWUNG_INSTALL_DIR "/slot%d_pre_fx.pcm", s);
                    slot_pre_f[s] = fopen(p, "wb");
                    snprintf(p, sizeof(p),
                             SCHWUNG_INSTALL_DIR "/slot%d_post_fx.pcm", s);
                    slot_post_f[s] = fopen(p, "wb");
                }
                slot_dump_frames = 100;  /* ~290ms */
            }
        }

        clock_gettime(CLOCK_MONOTONIC, &render_end);
        uint64_t render_us = (render_end.tv_sec - render_start.tv_sec) * 1000000 +
                              (render_end.tv_nsec - render_start.tv_nsec) / 1000;
        render_time_sum += render_us;
        render_time_count++;
        if (render_us > render_time_max) render_time_max = render_us;

        /* Log DSP render timing every 1000 blocks (~23 seconds) */
        if (render_time_count >= 1000) {
#if SHADOW_TIMING_LOG
            uint64_t avg = render_time_sum / render_time_count;
            FILE *f = fopen(SCHWUNG_INSTALL_DIR "/dsp_timing.log", "a");
            if (f) {
                fprintf(f, "Post-ioctl DSP render: avg=%llu us, max=%llu us\n",
                        (unsigned long long)avg, (unsigned long long)render_time_max);
                fclose(f);
            }
#endif
            render_time_sum = 0;
            render_time_count = 0;
            render_time_max = 0;
        }
    }
    TIME_SECTION_END(spi_post_render_sum, spi_post_render_max);

    /* === POST-IOCTL: CHECK FOR RESTART REQUEST === */
    /* Shadow UI can request a Move restart (e.g. after core update) */
    if (shadow_control && shadow_control->restart_move) {
        shadow_control->restart_move = 0;
        shadow_control->should_exit = 1;  /* Tell shadow_ui to exit */
        shadow_log("Restart requested by shadow UI — restarting Move");
        /* Defer to the worker: a blocking shell-out here stalls the SPI
         * thread while the script tears Move down. The worker runs it
         * within ~200 ms (and carries the AT_SECURE/root rationale). */
        shim_worker_post(SHIM_EVT_RESTART_MOVE);
    }

post_timing:
    /* === COMPREHENSIVE IOCTL TIMING CALCULATIONS === */
    clock_gettime(CLOCK_MONOTONIC, &spi_ioctl_end);

    uint64_t pre_us = (spi_pre_end.tv_sec - spi_ioctl_start.tv_sec) * 1000000 +
                      (spi_pre_end.tv_nsec - spi_ioctl_start.tv_nsec) / 1000;
    uint64_t ioctl_us = (spi_post_start.tv_sec - spi_pre_end.tv_sec) * 1000000 +
                        (spi_post_start.tv_nsec - spi_pre_end.tv_nsec) / 1000;
    uint64_t post_us = (spi_ioctl_end.tv_sec - spi_post_start.tv_sec) * 1000000 +
                       (spi_ioctl_end.tv_nsec - spi_post_start.tv_nsec) / 1000;
    uint64_t total_us = (spi_ioctl_end.tv_sec - spi_ioctl_start.tv_sec) * 1000000 +
                        (spi_ioctl_end.tv_nsec - spi_ioctl_start.tv_nsec) / 1000;

    uint64_t compute_us = pre_us + post_us;

    spi_total_sum += total_us;
    spi_pre_sum += pre_us;
    spi_ioctl_sum += ioctl_us;
    spi_post_sum += post_us;
    spi_compute_sum += compute_us;
    if (compute_us > spi_compute_max) spi_compute_max = compute_us;
    if (compute_us > SPI_COMPUTE_BUDGET_US) spi_compute_over_budget++;
    spi_last_frame_compute_us = compute_us;
    spi_timing_count++;

    if (total_us > spi_total_max) spi_total_max = total_us;
    if (pre_us > spi_pre_max) spi_pre_max = pre_us;
    if (ioctl_us > spi_ioctl_max) spi_ioctl_max = ioctl_us;
    if (post_us > spi_post_max) spi_post_max = post_us;

    /* Track overruns (no I/O — just update snapshot).
     * Gated on COMPUTE, not the frame total: the total includes the blocking
     * ioctl and so exceeds any work-shaped threshold on every frame, idle or
     * not. The old `total_us > 2000` test counted essentially every frame,
     * which is why this counter read in the tens of thousands on an idle
     * device and carried no information. */
    if (compute_us > SPI_COMPUTE_BUDGET_US) {
        static uint32_t hook_overrun_count = 0;
        hook_overrun_count++;
        spi_snap.overrun_count = hook_overrun_count;
        spi_snap.last_overrun_total = total_us;
        spi_snap.last_overrun_pre = pre_us;
        spi_snap.last_overrun_ioctl = ioctl_us;
        spi_snap.last_overrun_post = post_us;
    }

    /* Snapshot frame-level timing every 1000 blocks (~3s) — no I/O */
    if (spi_timing_count >= 1000) {
        spi_snap.frame_total_avg = spi_total_sum / spi_timing_count;
        spi_snap.frame_total_max = spi_total_max;
        spi_snap.compute_avg = spi_compute_sum / spi_timing_count;
        spi_snap.compute_max = spi_compute_max;
        spi_snap.compute_over_budget = spi_compute_over_budget;
        spi_snap.frame_pre_avg = spi_pre_sum / spi_timing_count;
        spi_snap.frame_pre_max = spi_pre_max;
        spi_snap.frame_ioctl_avg = spi_ioctl_sum / spi_timing_count;
        spi_snap.frame_ioctl_max = spi_ioctl_max;
        spi_snap.frame_post_avg = spi_post_sum / spi_timing_count;
        spi_snap.frame_post_max = spi_post_max;
        spi_snap.frame_ready = 1;
        spi_total_sum = spi_pre_sum = spi_ioctl_sum = spi_post_sum = 0;
        spi_total_max = spi_pre_max = spi_ioctl_max = spi_post_max = 0;
        spi_compute_sum = spi_compute_max = 0;
        spi_compute_over_budget = 0;
        spi_timing_count = 0;
    }

    /* Snapshot granular pre-ioctl timing every 1000 blocks — no I/O */
    spi_granular_count++;
    if (spi_granular_count >= 1000) {
        int n = spi_granular_count;
        spi_snap.midi_mon_avg = spi_midi_mon_sum / n; spi_snap.midi_mon_max = spi_midi_mon_max;
        spi_snap.fwd_midi_avg = spi_fwd_midi_sum / n; spi_snap.fwd_midi_max = spi_fwd_midi_max;
        spi_snap.mix_audio_avg = spi_mix_audio_sum / n; spi_snap.mix_audio_max = spi_mix_audio_max;
        spi_snap.ui_req_avg = spi_ui_req_sum / n; spi_snap.ui_req_max = spi_ui_req_max;
        spi_snap.param_req_avg = spi_param_req_sum / n; spi_snap.param_req_max = spi_param_req_max;
        spi_snap.fwd_cc_avg = spi_fwd_ext_cc_sum / n; spi_snap.fwd_cc_max = spi_fwd_ext_cc_max;
        spi_snap.proc_midi_avg = spi_proc_midi_sum / n; spi_snap.proc_midi_max = spi_proc_midi_max;
        spi_snap.jack_stash_avg = spi_jack_stash_sum / n; spi_snap.jack_stash_max = spi_jack_stash_max;
        spi_snap.drain_dsp_avg = spi_drain_ui_midi_sum / n; spi_snap.drain_dsp_max = spi_drain_ui_midi_max;
        spi_snap.jack_wake_avg = spi_jack_wake_sum / n; spi_snap.jack_wake_max = spi_jack_wake_max;
        spi_snap.mix_buf_avg = spi_inproc_mix_sum / n; spi_snap.mix_buf_max = spi_inproc_mix_max;
        spi_snap.tts_avg = spi_tts_mix_sum / n; spi_snap.tts_max = spi_tts_mix_max;
        spi_snap.display_avg = spi_display_sum / n; spi_snap.display_max = spi_display_max;
        spi_snap.clear_leds_avg = spi_clear_leds_sum / n; spi_snap.clear_leds_max = spi_clear_leds_max;
        spi_snap.jack_midi_avg = spi_jack_midi_out_sum / n; spi_snap.jack_midi_max = spi_jack_midi_out_max;
        spi_snap.ui_midi_avg = spi_ui_midi_out_sum / n; spi_snap.ui_midi_max = spi_ui_midi_out_max;
        spi_snap.flush_leds_avg = spi_flush_leds_sum / n; spi_snap.flush_leds_max = spi_flush_leds_max;
        spi_snap.screenreader_avg = spi_screenreader_sum / n; spi_snap.screenreader_max = spi_screenreader_max;
        spi_snap.jack_pre_avg = spi_jack_pre_sum / n; spi_snap.jack_pre_max = spi_jack_pre_max;
        spi_snap.jack_disp_avg = spi_jack_disp_sum / n; spi_snap.jack_disp_max = spi_jack_disp_max;
        spi_snap.pin_avg = spi_pin_sum / n; spi_snap.pin_max = spi_pin_max;
        spi_snap.post_midi_scan_avg = spi_post_midi_scan_sum / n;
        spi_snap.post_midi_scan_max = spi_post_midi_scan_max;
        spi_snap.post_drain_dsp_avg = spi_post_drain_dsp_sum / n;
        spi_snap.post_drain_dsp_max = spi_post_drain_dsp_max;
        spi_snap.post_render_avg = spi_post_render_sum / n;
        spi_snap.post_render_max = spi_post_render_max;
        for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
            spi_snap.slot_render_max[s] = spi_slot_render_max[s];
            spi_snap.slot_synth_max[s] = spi_slot_synth_max[s];
            spi_snap.slot_fx_max[s] = spi_slot_fx_max[s];
        }
        for (int i = 0; i < MIX_PHASE_COUNT; i++)
            spi_snap.mix_phase_max[i] = spi_mix_phase_max[i];
        spi_snap.slot_probe_burst_max = spi_slot_probe_burst_max;
        spi_snap.jack_audio_hits = schwung_jack_bridge_get_hit_count();
        spi_snap.jack_audio_misses = schwung_jack_bridge_get_miss_count();
        spi_snap.granular_ready = 1;
        spi_snap.seq++;

        spi_midi_mon_sum = spi_midi_mon_max = spi_fwd_midi_sum = spi_fwd_midi_max = 0;
        spi_mix_audio_sum = spi_mix_audio_max = spi_ui_req_sum = spi_ui_req_max = 0;
        spi_param_req_sum = spi_param_req_max = spi_proc_midi_sum = spi_proc_midi_max = 0;
        spi_inproc_mix_sum = spi_inproc_mix_max = spi_display_sum = spi_display_max = 0;
        spi_jack_stash_sum = spi_jack_stash_max = spi_drain_ui_midi_sum = spi_drain_ui_midi_max = 0;
        spi_jack_wake_sum = spi_jack_wake_max = spi_tts_mix_sum = spi_tts_mix_max = 0;
        spi_clear_leds_sum = spi_clear_leds_max = spi_jack_midi_out_sum = spi_jack_midi_out_max = 0;
        spi_ui_midi_out_sum = spi_ui_midi_out_max = spi_flush_leds_sum = spi_flush_leds_max = 0;
        spi_screenreader_sum = spi_screenreader_max = spi_jack_pre_sum = spi_jack_pre_max = 0;
        spi_jack_disp_sum = spi_jack_disp_max = spi_pin_sum = spi_pin_max = 0;
        spi_fwd_ext_cc_sum = spi_fwd_ext_cc_max = 0;
        spi_direct_midi_sum = spi_direct_midi_max = 0;
        spi_post_midi_scan_sum = spi_post_midi_scan_max = 0;
        spi_post_drain_dsp_sum = spi_post_drain_dsp_max = 0;
        spi_post_render_sum = spi_post_render_max = 0;
        for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
            spi_slot_render_max[s] = 0;
            spi_slot_synth_max[s] = 0;
            spi_slot_fx_max[s] = 0;
        }
        for (int i = 0; i < MIX_PHASE_COUNT; i++) spi_mix_phase_max[i] = 0;
        spi_slot_probe_burst_max = 0;
        spi_granular_count = 0;
    }

    /* (spi_last_frame_compute_us is latched with the other compute stats
     * above — it is what the next frame's over-budget check reads.) */
}

/* ============================================================================
 * LINK-IN AUDIO SHM ATTACH (non-RT, with retry)
 * ============================================================================
 * Attaches read-only to /schwung-link-in, written by the link-subscriber
 * sidecar. The sidecar is a separate process and may not have created the
 * segment yet when the shim starts, so we retry from a short-lived non-RT
 * thread. shm_open/mmap/LOG_INFO are not RT-safe — never call from the SPI
 * callback path.
 * ============================================================================ */
static int try_attach_in_audio_shm(void)
{
    if (shadow_in_audio_shm) return 1;
    /* create=0: sidecar owns the segment; missing segment (sidecar not up
     * yet) returns NULL quietly so the retry loop can try again later. */
    link_audio_in_shm_t *shm = (link_audio_in_shm_t *)shadow_shm_map(
        SHM_LINK_AUDIO_IN, sizeof(link_audio_in_shm_t), 0, 0);
    if (!shm) return 0;
    if (shm->magic != LINK_AUDIO_IN_SHM_MAGIC) {
        munmap(shm, sizeof(link_audio_in_shm_t));
        return 0;
    }
    if (shm->version != LINK_AUDIO_IN_SHM_VERSION) {
        LOG_WARN("shim", "%s version mismatch: shm=%u expected=%u "
                        "— rebuild link-subscriber sidecar",
                 SHM_LINK_AUDIO_IN, shm->version, LINK_AUDIO_IN_SHM_VERSION);
        munmap(shm, sizeof(link_audio_in_shm_t));
        return 0;
    }
    /* Drain any producer-side backlog accumulated during the attach-retry
     * window. Without this, startup turns into a cascade of catchups
     * (instrumentation observed ~9k-sample backlogs = ~200 ms of pre-run
     * audio). Safe because we hold the only reader reference.
     * Acquire/release pair against the sidecar's RELEASE store of
     * write_pos so ring writes become visible before read_pos moves. */
    for (int i = 0; i < LINK_AUDIO_IN_SLOT_COUNT; i++) {
        uint32_t wp = __atomic_load_n(&shm->slots[i].write_pos,
                                      __ATOMIC_ACQUIRE);
        __atomic_store_n(&shm->slots[i].read_pos, wp, __ATOMIC_RELEASE);
    }
    shadow_in_audio_shm = shm;
    /* Print the REAL segment name. It was a literal, so a davebox build
     * announced "/schwung-link-in attached" while actually attaching to
     * /dbxhost-link-in — which reads as a prefix bug during exactly the kind of
     * hunt this line exists to help with, and cost time in one (2026-08-13). */
    LOG_INFO("shim", "%s attached (version=%u)", SHM_LINK_AUDIO_IN, shm->version);
    return 1;
}

static void *link_in_attach_retry_thread(void *arg)
{
    (void)arg;
    /* Retry every 500ms for up to ~30s. Exits once attached or after giveup. */
    const int max_attempts = 60;
    for (int i = 0; i < max_attempts; i++) {
        if (try_attach_in_audio_shm()) return NULL;
        usleep(500000);  /* 500ms */
    }
    if (!shadow_in_audio_shm) {
        LOG_WARN("shim", "%s never appeared after %d attempts (~%ds) — sidecar not running?",
                 SHM_LINK_AUDIO_IN, max_attempts, max_attempts / 2);
    }
    return NULL;
}

/* ============================================================================
 * BACKGROUND TIMING LOGGER THREAD
 * ============================================================================
 * Drains the spi_snap structure and writes to unified_log every ~5 seconds.
 * All file I/O happens here, never in the SPI callback path.
 * ============================================================================ */
#define LED_CAPTURE_FLAG_PATH SCHWUNG_INSTALL_DIR "/led_capture_on"
#define LED_CAPTURE_LOG_PATH  SCHWUNG_INSTALL_DIR "/led_capture.log"

static void *led_capture_logger_thread(void *arg)
{
    (void)arg;
    uint32_t last_seq = 0;
    int prev_enabled = 0;
    FILE *log_fp = NULL;

    while (1) {
        usleep(200000);  /* 200ms */
        int enabled = (access(LED_CAPTURE_FLAG_PATH, F_OK) == 0) ? 1 : 0;
        if (enabled != prev_enabled) {
            led_queue_set_capture_enabled(enabled);
            if (enabled) {
                if (!log_fp) log_fp = fopen(LED_CAPTURE_LOG_PATH, "a");
                if (log_fp) {
                    time_t now = time(NULL);
                    fprintf(log_fp, "=== led capture enabled: %s", ctime(&now));
                    fflush(log_fp);
                }
                last_seq = 0;  /* reset; capture buffer cleared by toggle */
            } else {
                if (log_fp) {
                    time_t now = time(NULL);
                    fprintf(log_fp, "=== led capture disabled: %s", ctime(&now));
                    fflush(log_fp);
                    fclose(log_fp);
                    log_fp = NULL;
                }
            }
            prev_enabled = enabled;
        }
        if (!enabled || !log_fp) continue;

        led_capture_entry_t batch[128];
        int n;
        while ((n = led_queue_drain_capture(&last_seq, batch, 128)) > 0) {
            for (int i = 0; i < n; i++) {
                uint8_t type = batch[i].status & 0xF0;
                uint8_t ch = batch[i].status & 0x0F;
                const char *type_str = (type == 0x90) ? "NoteOn"
                                     : (type == 0xB0) ? "CC" : "?";
                fprintf(log_fp,
                        "t=%llu.%03llu seq=%u cbl=%u st=0x%02X ch=%u %s d1=%u d2=%u\n",
                        (unsigned long long)(batch[i].ts_us / 1000),
                        (unsigned long long)(batch[i].ts_us % 1000),
                        batch[i].seq, batch[i].cable, batch[i].status,
                        ch, type_str, batch[i].d1, batch[i].d2);
            }
            if (n < 128) break;
        }
        fflush(log_fp);
    }
    return NULL;
}

static void *spi_timing_logger_thread(void *arg)
{
    (void)arg;
    uint32_t last_seq = 0;

    while (1) {
        usleep(5000000);  /* 5 seconds */

        /* Toggle span tracing live from the touch-file (independent of the
         * unified-log gate below). Non-RT thread → safe to start the
         * exporter / flip the atomic here. */
        schwung_trace_poll_enable();

        if (!unified_log_enabled()) continue;
        if (spi_snap.seq == last_seq) continue;  /* No new data */
        last_seq = spi_snap.seq;

        /* Read snapshot (torn reads are harmless — data is informational) */
        if (spi_snap.frame_ready) {
            unified_log("spi_timing", LOG_LEVEL_DEBUG,
                "Frame(us): total avg=%llu max=%llu | pre avg=%llu max=%llu | ioctl avg=%llu max=%llu | post avg=%llu max=%llu | overruns=%u",
                (unsigned long long)spi_snap.frame_total_avg, (unsigned long long)spi_snap.frame_total_max,
                (unsigned long long)spi_snap.frame_pre_avg, (unsigned long long)spi_snap.frame_pre_max,
                (unsigned long long)spi_snap.frame_ioctl_avg, (unsigned long long)spi_snap.frame_ioctl_max,
                (unsigned long long)spi_snap.frame_post_avg, (unsigned long long)spi_snap.frame_post_max,
                spi_snap.overrun_count);
            /* Ring pressure on the shim -> shadow_ui MIDI ring. `sticky` is the
             * one that matters: a press or release that never reached the tool,
             * i.e. a latched modifier waiting to be healed. `yield` is knob
             * detents that stood aside for it (shadow_ui_midi_policy.h) — those
             * are the design working, not a fault. Cumulative since launch, so a
             * flat pair across two lines means the last 5 s dropped nothing. */
            unified_log("spi_timing", LOG_LEVEL_DEBUG,
                "UI-MIDI ring drops: sticky=%u yield=%u",
                ui_midi_drop_sticky, ui_midi_drop_yield);
            /* THE load line. `total` above is dominated by the blocking ioctl
             * and barely moves with load; this one is the work we actually do
             * and the only one worth judging headroom from. */
            unified_log("spi_timing", LOG_LEVEL_DEBUG,
                "Compute(us): avg=%llu max=%llu budget=%d | headroom avg=%lld%% max=%lld%% | over_budget=%u/1000",
                (unsigned long long)spi_snap.compute_avg, (unsigned long long)spi_snap.compute_max,
                SPI_COMPUTE_BUDGET_US,
                (long long)(100 - (long long)spi_snap.compute_avg * 100 / SPI_COMPUTE_BUDGET_US),
                (long long)(100 - (long long)spi_snap.compute_max * 100 / SPI_COMPUTE_BUDGET_US),
                spi_snap.compute_over_budget);
        }

        if (spi_snap.granular_ready) {
            unified_log("spi_timing", LOG_LEVEL_DEBUG,
                "Pre(us): midi_mon=%llu/%llu fwd_midi=%llu/%llu mix_audio=%llu/%llu "
                "ui_req=%llu/%llu param=%llu/%llu fwd_cc=%llu/%llu proc_midi=%llu/%llu "
                "jack_stash=%llu/%llu drain_dsp=%llu/%llu jack_wake=%llu/%llu "
                "mix_buf=%llu/%llu tts=%llu/%llu display=%llu/%llu",
                (unsigned long long)spi_snap.midi_mon_avg, (unsigned long long)spi_snap.midi_mon_max,
                (unsigned long long)spi_snap.fwd_midi_avg, (unsigned long long)spi_snap.fwd_midi_max,
                (unsigned long long)spi_snap.mix_audio_avg, (unsigned long long)spi_snap.mix_audio_max,
                (unsigned long long)spi_snap.ui_req_avg, (unsigned long long)spi_snap.ui_req_max,
                (unsigned long long)spi_snap.param_req_avg, (unsigned long long)spi_snap.param_req_max,
                (unsigned long long)spi_snap.fwd_cc_avg, (unsigned long long)spi_snap.fwd_cc_max,
                (unsigned long long)spi_snap.proc_midi_avg, (unsigned long long)spi_snap.proc_midi_max,
                (unsigned long long)spi_snap.jack_stash_avg, (unsigned long long)spi_snap.jack_stash_max,
                (unsigned long long)spi_snap.drain_dsp_avg, (unsigned long long)spi_snap.drain_dsp_max,
                (unsigned long long)spi_snap.jack_wake_avg, (unsigned long long)spi_snap.jack_wake_max,
                (unsigned long long)spi_snap.mix_buf_avg, (unsigned long long)spi_snap.mix_buf_max,
                (unsigned long long)spi_snap.tts_avg, (unsigned long long)spi_snap.tts_max,
                (unsigned long long)spi_snap.display_avg, (unsigned long long)spi_snap.display_max);
            unified_log("spi_timing", LOG_LEVEL_DEBUG,
                "Post(us): clear_leds=%llu/%llu jack_midi=%llu/%llu ui_midi=%llu/%llu "
                "flush_leds=%llu/%llu screenreader=%llu/%llu jack_pre=%llu/%llu "
                "jack_disp=%llu/%llu pin=%llu/%llu "
                "midi_scan=%llu/%llu drain_dsp2=%llu/%llu render=%llu/%llu",
                (unsigned long long)spi_snap.clear_leds_avg, (unsigned long long)spi_snap.clear_leds_max,
                (unsigned long long)spi_snap.jack_midi_avg, (unsigned long long)spi_snap.jack_midi_max,
                (unsigned long long)spi_snap.ui_midi_avg, (unsigned long long)spi_snap.ui_midi_max,
                (unsigned long long)spi_snap.flush_leds_avg, (unsigned long long)spi_snap.flush_leds_max,
                (unsigned long long)spi_snap.screenreader_avg, (unsigned long long)spi_snap.screenreader_max,
                (unsigned long long)spi_snap.jack_pre_avg, (unsigned long long)spi_snap.jack_pre_max,
                (unsigned long long)spi_snap.jack_disp_avg, (unsigned long long)spi_snap.jack_disp_max,
                (unsigned long long)spi_snap.pin_avg, (unsigned long long)spi_snap.pin_max,
                (unsigned long long)spi_snap.post_midi_scan_avg, (unsigned long long)spi_snap.post_midi_scan_max,
                (unsigned long long)spi_snap.post_drain_dsp_avg, (unsigned long long)spi_snap.post_drain_dsp_max,
                (unsigned long long)spi_snap.post_render_avg, (unsigned long long)spi_snap.post_render_max);
            /* Built per-slot rather than unrolled: these lines are the only
             * view into where render time goes, so they must not go blind on
             * the slots above 4 exactly when the count grows. */
            {
                char render_buf[SHADOW_CHAIN_INSTANCES * 20 + 1];
                char synth_buf[SHADOW_CHAIN_INSTANCES * 20 + 1];
                char fx_buf[SHADOW_CHAIN_INSTANCES * 20 + 1];
                int rn = 0, sn = 0, fn = 0;
                for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
                    rn += snprintf(render_buf + rn, sizeof(render_buf) - rn, " s%d=%llu",
                                   s, (unsigned long long)spi_snap.slot_render_max[s]);
                    sn += snprintf(synth_buf + sn, sizeof(synth_buf) - sn, " s%d=%llu",
                                   s, (unsigned long long)spi_snap.slot_synth_max[s]);
                    fn += snprintf(fx_buf + fn, sizeof(fx_buf) - fn, " s%d=%llu",
                                   s, (unsigned long long)spi_snap.slot_fx_max[s]);
                }
                unified_log("spi_timing", LOG_LEVEL_DEBUG,
                    "Slot render max(us):%s probe_burst_max=%u",
                    render_buf, spi_snap.slot_probe_burst_max);
                unified_log("spi_timing", LOG_LEVEL_DEBUG,
                    "Slot synth max(us):%s | Slot fx max(us):%s",
                    synth_buf, fx_buf);
                /* Where mix_buf's time went. Printed next to the slot lines
                 * because the pair is the whole diagnosis: on 2026-08-22 the
                 * slots held 28 µs and mix_buf held 1915 µs of a 1946 µs
                 * frame, and nothing said which of its six phases that was. */
                {
                    char mix_buf_phases[MIX_PHASE_COUNT * 24 + 1];
                    int mn = 0;
                    for (int i = 0; i < MIX_PHASE_COUNT; i++)
                        mn += snprintf(mix_buf_phases + mn,
                                       sizeof(mix_buf_phases) - mn, " %s=%llu",
                                       spi_mix_phase_name[i],
                                       (unsigned long long)spi_snap.mix_phase_max[i]);
                    unified_log("spi_timing", LOG_LEVEL_DEBUG,
                        "MixBuf phase max(us):%s", mix_buf_phases);
                }
            }
            if (spi_snap.jack_audio_hits > 0 || spi_snap.jack_audio_misses > 0) {
                unified_log("spi_timing", LOG_LEVEL_DEBUG,
                    "JACK audio: hits=%u misses=%u (%.3f%% miss)",
                    spi_snap.jack_audio_hits,
                    spi_snap.jack_audio_misses,
                    spi_snap.jack_audio_hits > 0
                        ? (100.0 * spi_snap.jack_audio_misses /
                           (spi_snap.jack_audio_hits + spi_snap.jack_audio_misses))
                        : 0.0);
            }
        }

        /* === Link Audio drop telemetry (v2 SHM stats) === */
        /* Per-slot starvation / catch-up / producer-overrun counters + path
         * flips. These are THE numbers to watch when diagnosing Move→Schwung
         * dropouts: a catch-up or a would-overrun on any slot is (almost
         * always) an audible discontinuity. */
        if (shadow_in_audio_shm) {
            uint32_t flips = shim_la_rebuild_flip_count;
            uint32_t fallback = shim_la_starve_fallback_count;
            shim_la_rebuild_flip_count = 0;
            shim_la_starve_fallback_count = 0;

            int any_nonzero = (flips || fallback);
            {
                extern volatile uint32_t la_trim_count[LINK_AUDIO_IN_SLOT_COUNT];
                for (int s = 0; s < LINK_AUDIO_IN_SLOT_COUNT; s++)
                    if (__atomic_load_n(&la_trim_count[s], __ATOMIC_RELAXED)) any_nonzero = 1;
            }
            uint32_t slot_starve[LINK_AUDIO_IN_SLOT_COUNT];
            uint32_t slot_catchup[LINK_AUDIO_IN_SLOT_COUNT];
            uint32_t slot_dropped[LINK_AUDIO_IN_SLOT_COUNT];
            uint32_t slot_max_avail[LINK_AUDIO_IN_SLOT_COUNT];
            uint32_t slot_produced[LINK_AUDIO_IN_SLOT_COUNT];
            uint32_t slot_would_overrun[LINK_AUDIO_IN_SLOT_COUNT];
            uint32_t slot_max_frames[LINK_AUDIO_IN_SLOT_COUNT];
            int slot_active[LINK_AUDIO_IN_SLOT_COUNT];

            for (int s = 0; s < LINK_AUDIO_IN_SLOT_COUNT; s++) {
                link_audio_in_slot_t *sl = &shadow_in_audio_shm->slots[s];
                slot_active[s]        = sl->active;
                /* Atomic exchange read+reset so SPI-path increments landing
                 * during the read window aren't lost. RELAXED is fine —
                 * telemetry is informational. */
                slot_starve[s]        = __atomic_exchange_n(&sl->starve_count, 0, __ATOMIC_RELAXED);
                slot_catchup[s]       = __atomic_exchange_n(&sl->catchup_count, 0, __ATOMIC_RELAXED);
                slot_dropped[s]       = __atomic_exchange_n(&sl->catchup_samples_dropped, 0, __ATOMIC_RELAXED);
                slot_max_avail[s]     = __atomic_exchange_n(&sl->max_avail_seen, 0, __ATOMIC_RELAXED);
                slot_produced[s]      = __atomic_exchange_n(&sl->produced_count, 0, __ATOMIC_RELAXED);
                slot_would_overrun[s] = __atomic_exchange_n(&sl->would_overrun_count, 0, __ATOMIC_RELAXED);
                slot_max_frames[s]    = __atomic_exchange_n(&sl->max_frames_seen, 0, __ATOMIC_RELAXED);
                if (slot_starve[s] || slot_catchup[s] || slot_would_overrun[s])
                    any_nonzero = 1;
            }

            if (any_nonzero) {
                /* One line per active slot to keep the format tight but
                 * immediately useful: starve+catchup = "we dropped audio",
                 * would_overrun = "producer lapped us", max_avail /
                 * max_frames = headroom at edges. */
                for (int s = 0; s < LINK_AUDIO_IN_SLOT_COUNT; s++) {
                    if (!slot_active[s]) continue;
                    if (!slot_starve[s] && !slot_catchup[s] &&
                        !slot_would_overrun[s]) continue;
                    unified_log("link_audio", LOG_LEVEL_WARN,
                        "slot=%d name=%s starve=%u catchup=%u dropped_samples=%u "
                        "max_avail=%u produced=%u would_overrun=%u max_frames=%u",
                        s, shadow_in_audio_shm->slots[s].name,
                        slot_starve[s], slot_catchup[s], slot_dropped[s],
                        slot_max_avail[s], slot_produced[s],
                        slot_would_overrun[s], slot_max_frames[s]);
                }
                {
                    extern volatile uint32_t la_trim_count[LINK_AUDIO_IN_SLOT_COUNT];
                    extern volatile uint32_t la_trim_dropped[LINK_AUDIO_IN_SLOT_COUNT];
                    uint32_t tc = 0, td = 0;
                    for (int s = 0; s < LINK_AUDIO_IN_SLOT_COUNT; s++) {
                        tc += __atomic_exchange_n(&la_trim_count[s], 0, __ATOMIC_RELAXED);
                        td += __atomic_exchange_n(&la_trim_dropped[s], 0, __ATOMIC_RELAXED);
                    }
                    /* backlog_trims counts sustained backlogs removed;
                     * trim_dropped_ms is the latency reclaimed. */
                    unified_log("link_audio", LOG_LEVEL_DEBUG,
                        "path: rebuild_flips=%u la_starve_fallback=%u "
                        "backlog_trims=%u trim_dropped_ms=%u",
                        flips, fallback, tc, (unsigned)(td / 2 / 44));
                }
            }
        }

        /* === Move→Schwung latency profiling ===
         * Touch /data/UserData/schwung/link_audio_avail_log_on to enable.
         * Per active slot, emits min/mean/max of the read-time `avail`
         * counter over the last 5 s cycle. `avail` is stereo-sample count;
         * (avail/2/44.1) ms is the instantaneous Move-side pending
         * latency. Use to characterize variance before committing to a
         * static vs dynamic Schwung-side compensation delay. */
        if (shadow_in_audio_shm &&
            access(SCHWUNG_INSTALL_DIR "/link_audio_avail_log_on",
                   F_OK) == 0) {
            for (int s = 0; s < LINK_AUDIO_IN_SLOT_COUNT; s++) {
                if (!shadow_in_audio_shm->slots[s].active) continue;
                uint32_t a_min = 0, a_max = 0, a_ct = 0;
                uint64_t a_sum = 0;
                link_audio_drain_avail_stats(s, &a_min, &a_max,
                                             &a_sum, &a_ct);
                if (a_ct == 0) continue;
                double mean = (double)a_sum / (double)a_ct;
                /* avail is stereo samples → /2 frames → /44.1 ms */
                unified_log("link_audio", LOG_LEVEL_INFO,
                    "avail slot=%d name=%s n=%u "
                    "min=%u (%.2f ms) mean=%.1f (%.2f ms) "
                    "max=%u (%.2f ms)",
                    s, shadow_in_audio_shm->slots[s].name, a_ct,
                    a_min, (double)a_min / 2.0 / 44.1,
                    mean,  mean         / 2.0 / 44.1,
                    a_max, (double)a_max / 2.0 / 44.1);
            }
        }
    }
    return NULL;
}

/* ============================================================================
 * SPI LIBRARY CONSTRUCTOR
 * ============================================================================
 * Initialize the schwung-spi library and register pre/post callbacks.
 * Also obtain the real libc ioctl pointer for non-SPI ioctl calls
 * (e.g., overtake_midi_send_external uses real_ioctl directly).
 * ============================================================================ */
__attribute__((constructor))
static void shim_spi_init(void)
{
    /* Obtain real libc ioctl for non-SPI direct calls */
    if (!real_ioctl) {
        real_ioctl = dlsym(RTLD_NEXT, "ioctl");
    }

    /* Initialize OTLP span tracing (OFF unless the touch-file is present;
     * see docs/tracing.md). Cheap: just samples the
     * clock offset and polls the gate once. The exporter thread is started
     * lazily by poll_enable, on its own SCHED_OTHER schedule off core 3. */
    schwung_trace_init("schwung-shim");

    /* Initialize SPI library and register callbacks */
    g_spi_handle = schwung_spi_init();
    schwung_spi_set_callbacks(g_spi_handle, shim_pre_transfer, shim_post_transfer, NULL);

    /* Create JACK shadow driver shared memory (optional — zero overhead if JACK never connects) */
    g_jack_shm = schwung_jack_bridge_create();

    /* Start background timing logger thread */
    {
        pthread_t tid;
        pthread_create(&tid, NULL, spi_timing_logger_thread, NULL);
        pthread_detach(tid);
    }

    /* Start the shim worker (debug-flag polling, deferred hooks, set scan,
     * sampler/preview file I/O) — everything the SPI callbacks must not do
     * themselves. */
    {
        shim_worker_hooks_t hooks = {
            .sampler_prepare        = sampler_worker_prepare,
            .sampler_finalize       = sampler_worker_finalize,
            .sampler_cancel_preroll = sampler_worker_cancel_preroll,
            .skipback_save          = skipback_worker_spawn_save,
            .skipback_resize        = shim_hook_skipback_resize,
            .preview_play_pending   = shim_hook_preview_play,
        };
        shim_worker_set_hooks(&hooks);
    }
    shim_worker_start();
    snap_worker_start();   /* off-RT remote-snapshot servicer (idle until a browser pulls) */

    /* Start LED capture logger thread (gated by flag file) */
    {
        pthread_t tid;
        pthread_create(&tid, NULL, led_capture_logger_thread, NULL);
        pthread_detach(tid);
    }

    /* Start short-lived thread to retry attaching /schwung-link-in read-only.
     * Sidecar may not be up yet at shim load; this exits once attached or
     * after ~30s of retries. Non-RT: shm_open/mmap are not RT-safe. */
    if (!shadow_in_audio_shm) {
        pthread_t tid;
        pthread_create(&tid, NULL, link_in_attach_retry_thread, NULL);
        pthread_detach(tid);
    }
}
