/* tests/test_auto_seq_setting_noteoff.c — changing a SEQUENCER SETTING while
 * notes are sounding must not strand a note (Josh, device 2026-09-05: "a lot
 * of stuck notes when automating sequencer settings … changing notes in
 * progress doesn't effectively note off what's already there").
 *
 * Automation of a bank knob lands as an ordinary set_param on the track's
 * key (seq:<t>:<key> → t<t>_<key>) while the transport runs. This sweeps
 * every automatable knob (BANK_MACRO_ALLOW in ui_constants.mjs): a clip of
 * four notes plays on a chain route, the key is flipped mid-note to a value
 * far from its default, playback runs on for two bars, and then — BEFORE
 * stop, whose panic sweep would hide it — every pitch that ever sounded must
 * be either off (ons == offs) or sounding once with the DSP counting it.
 * A pitch with more ons than offs that the DSP no longer counts is exactly
 * the note a synth holds forever. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

typedef struct { const char *key; const char *from; const char *to; } sweep_t;
static const sweep_t SWEEPS[] = {
    { "clip_resolution",     "1", "4"   },
    { "clip_playback_dir",   "0", "1"   },
    { "diq",                 "0", "4"   },
    { "noteFX_octave",       "0", "2"   },
    { "noteFX_offset",       "0", "7"   },
    { "noteFX_velocity",     "0", "-40" },
    { "quantize",            "0", "100" },
    { "noteFX_length_mode",  "0", "3"   },
    { "noteFX_gate",         "100", "400" },
    { "noteFX_random",       "0", "12"  },
    { "harm_octaver",        "0", "1"   },
    { "harm_interval1",      "0", "7"   },
    { "harm_interval2",      "0", "12"  },
    { "harm_interval3",      "0", "-5"  },
    { "delay_time",          "10", "3"  },
    { "delay_level",         "127", "40" },
    { "delay_repeats",       "0", "4"   },
    { "delay_vel_fb",        "0", "-60" },
    { "delay_pitch_fb",      "0", "5"   },
    { "delay_gate_fb",       "0", "6"   },
    { "delay_retrig",        "1", "0"   },
    { "delay_pitch_random",  "0", "6"   },
    { "delay_clock_fb",      "0", "50"  },
    { "seq_arp_style",       "0", "2"   },
    { "seq_arp_rate",        "1", "5"   },
    { "seq_arp_octaves",     "0", "2"   },
    { "seq_arp_gate",        "100", "30" },
    { "seq_arp_retrigger",   "1", "0"   },
    { "seq_arp_sync",        "1", "0"   },
    { "tarp_style",          "0", "2"   },
    { "tarp_rate",           "1", "5"   },
    { "tarp_octaves",        "0", "2"   },
    { "tarp_gate",           "100", "30" },
    { "tarp_retrigger",      "0", "1"   },
    { "tarp_sync",           "1", "0"   },
    { "tarp_latch",          "0", "1"   },
    { "all_lanes_playback_dir", "0", "1" },
};

/* ons − offs per pitch across every internal (chain) event, any slot. */
static void balance(int ons[128], int offs[128]) {
    memset(ons, 0, 128 * sizeof(int)); memset(offs, 0, 128 * sizeof(int));
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL) continue;
        uint8_t st = e->bytes[1] & 0xF0, n = e->bytes[2], v = e->bytes[3];
        if (n >= 128) continue;
        if (st == 0x90 && v > 0) ons[n]++;
        else if (st == 0x80 || (st == 0x90 && v == 0)) offs[n]++;
    }
}

static int i0_dump = 0;
static int run_one(const sweep_t *s, int arp_on, char *why, int whylen) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    char key[64];
    snprintf(key, sizeof key, "t1_%s", s->key);
    hx_set_param(h, "t1_route", "schwung");
    if (arp_on) hx_set_param(h, "t1_seq_arp_on", "1");
    hx_set_param(h, key, s->from);
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_2_toggle", "64 100");
    hx_set_param(h, "t1_c0_step_4_toggle", "67 100");
    hx_set_param(h, "t1_c0_step_6_toggle", "72 100");
    hx_set_param(h, "transport", "play_focus:1:0");
    HX_ASSERT(in->playing == 1, "transport running");
    hx_render(h, 12);                      /* a note is on, its gate running */
    int any_on = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0) { any_on = 1; break; }
    }
    if (!any_on) { snprintf(why, whylen, "control: no note sounded before the change (%d events captured, internal=%d)", hx_stub_event_count(), hx_count_midi(h, HX_MIDI_INTERNAL)); if (i0_dump++ == 0) hx_dump_midi(h); hx_destroy(h); return -1; }
    hx_set_param(h, key, s->to);            /* the automated change, mid-note */
    hx_render(h, 20);
    hx_set_param(h, key, s->from);          /* and back, as a lane sweeping would */
    hx_render(h, 20);
    hx_set_param(h, key, s->to);
    hx_render(h, 120);                      /* two bars on: every gate has ended */
    int ons[128], offs[128], bad = 0;
    balance(ons, offs);
    for (int p = 0; p < 128; p++) {
        int open = ons[p] - offs[p];
        int counted = in->tracks[1].pfx.pitch_refcount[p];
        if (open < 0) { snprintf(why, whylen, "pitch %d: more offs (%d) than ons (%d)", p, offs[p], ons[p]); bad = 1; break; }
        if (open >= 2) { snprintf(why, whylen, "pitch %d: %d ons, %d offs — %d stuck", p, ons[p], offs[p], open); bad = 1; break; }
        if (open == 1 && counted == 0) { snprintf(why, whylen, "pitch %d: on without off, and the DSP no longer counts it — STUCK", p); bad = 1; break; }
        if (open == 0 && counted != 0) { snprintf(why, whylen, "pitch %d: refcount %d but every on has its off", p, counted); bad = 1; break; }
    }
    if (bad) hx_dump_midi(h);
    hx_destroy(h);
    return bad;
}

int main(void) {
    int fails = 0, n = 0, skipped = 0;
    for (int arp = 0; arp < 2; arp++) {
        for (unsigned i = 0; i < sizeof SWEEPS / sizeof SWEEPS[0]; i++) {
            char why[256] = "";
            int r = run_one(&SWEEPS[i], arp, why, sizeof why);
            n++;
            if (r < 0) { skipped++; printf("  skip — %s%s: %s\n", SWEEPS[i].key, arp ? " (seq arp on)" : "", why); continue; }
            if (r) { fails++; printf("  FAIL — %s%s %s→%s mid-note: %s\n", SWEEPS[i].key, arp ? " (seq arp on)" : "", SWEEPS[i].from, SWEEPS[i].to, why); }
            else printf("  ok   — %s%s %s→%s mid-note: every note that sounded ended\n", SWEEPS[i].key, arp ? " (seq arp on)" : "", SWEEPS[i].from, SWEEPS[i].to);
        }
    }
    if (fails) { printf("FAIL: test_auto_seq_setting_noteoff (%d of %d)\n", fails, n); return 1; }
    printf("PASS: test_auto_seq_setting_noteoff (%d checks, %d skipped)\n", n - skipped, skipped);
    return 0;
}
