/*
 * seq_midi_bridge.c — bridges the host's external MIDI to ALSA sequencer
 * clients, so a paired Bluetooth LE MIDI device behaves like one plugged
 * into USB-A.
 *
 * BlueZ exposes every connected BLE-MIDI device as an ALSA sequencer
 * client. This process owns one duplex sequencer port and keeps it
 * subscribed to those clients:
 *
 *   out  shim MIDI_OUT stream (cable 2) → sequencer → the device
 *   in   the device → sequencer → external MIDI input ring (cable 2)
 *
 * It only ever touches shared memory the shim publishes: it reads the
 * MIDI_OUT stream with a private cursor and pushes into the external MIDI
 * input ring (ext_midi_in.h), which the shim replays to the module on screen
 * and to Move. Nothing here runs on the audio thread.
 *
 * Talks to /dev/snd/seq directly (kernel UAPI) so the build needs no ALSA
 * library. Linux only.
 *
 * Usage: seq-midi-bridge [--any-client] [--no-in] [--no-out] [--verbose]
 *   --any-client  bridge every user-space sequencer client, not only the
 *                 ones bluetoothd owns (for testing with aplaymidi/aseqdump)
 */

#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include <sound/asequencer.h>

#include "seq_midi_bridge.h"
#include "shadow_midi_inject_writer.h"

#define RESCAN_INTERVAL_MS 2000
#define INJECT_SETTLE_MS   1000   /* a new input ring is unusable until the shim has initialized it */
#define POLL_INTERVAL_MS   1
#define OWNER_COMM         "bluetoothd"

static volatile sig_atomic_t g_stop = 0;
static int g_seq_fd = -1;
static int g_client = -1;
static int g_port = -1;
static int g_any_client = 0;
static int g_verbose = 0;

static void on_signal(int sig) { (void)sig; g_stop = 1; }

static long now_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

/* A shared-memory segment followed by NAME. The launcher starts this
 * process before the shim has created its segments, and removes and
 * recreates them between Move runs, so a mapping is only good while the
 * name still resolves to the inode that was mapped. */
typedef struct {
    const char *name;
    size_t size;
    void *map;
    ino_t ino;
    long attached_ms;
} shm_ref_t;

/* Returns 1 when the mapping changed (attached, re-attached or dropped). */
static int shm_follow(shm_ref_t *r)
{
    char path[128];
    struct stat st;
    snprintf(path, sizeof(path), "/dev/shm%s", r->name);
    /* Not present until it is full size: mapping a segment its creator has
     * not yet truncated faults on first touch. */
    int present = stat(path, &st) == 0 && (size_t)st.st_size >= r->size;
    if (r->map && present && st.st_ino == r->ino) return 0;

    int changed = r->map != NULL;
    if (r->map) { munmap(r->map, r->size); r->map = NULL; }
    if (!present) return changed;

    int fd = shm_open(r->name, O_RDWR, 0);
    if (fd < 0) return changed;
    void *p = MAP_FAILED;
    if (fstat(fd, &st) == 0 && (size_t)st.st_size >= r->size)
        p = mmap(NULL, r->size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    close(fd);
    if (p == MAP_FAILED) return changed;
    r->map = p;
    r->ino = st.st_ino;
    r->attached_ms = now_ms();
    return 1;
}

static int seq_open(void)
{
    g_seq_fd = open("/dev/snd/seq", O_RDWR | O_NONBLOCK);
    if (g_seq_fd < 0) { perror("seq-midi-bridge: open /dev/snd/seq"); return -1; }

    if (ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_CLIENT_ID, &g_client) < 0) {
        perror("seq-midi-bridge: CLIENT_ID"); return -1;
    }

    struct snd_seq_client_info ci;
    memset(&ci, 0, sizeof(ci));
    ci.client = g_client;
    if (ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_GET_CLIENT_INFO, &ci) == 0) {
        snprintf(ci.name, sizeof(ci.name), "Move");
        ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_SET_CLIENT_INFO, &ci);
    }

    struct snd_seq_port_info pi;
    memset(&pi, 0, sizeof(pi));
    pi.addr.client = (unsigned char)g_client;
    snprintf(pi.name, sizeof(pi.name), "External MIDI");
    pi.capability = SNDRV_SEQ_PORT_CAP_READ | SNDRV_SEQ_PORT_CAP_SUBS_READ |
                    SNDRV_SEQ_PORT_CAP_WRITE | SNDRV_SEQ_PORT_CAP_SUBS_WRITE;
    pi.type = SNDRV_SEQ_PORT_TYPE_MIDI_GENERIC | SNDRV_SEQ_PORT_TYPE_APPLICATION;
    pi.midi_channels = 16;
    if (ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_CREATE_PORT, &pi) < 0) {
        perror("seq-midi-bridge: CREATE_PORT"); return -1;
    }
    g_port = pi.addr.port;
    return 0;
}

/* Is this client one we bridge? User-space clients only, and unless
 * --any-client was given, only those owned by bluetoothd. */
static int client_wanted(const struct snd_seq_client_info *ci)
{
    if (ci->client == g_client) return 0;
    if (ci->type != USER_CLIENT) return 0;
    if (g_any_client) return 1;

    char path[64], comm[32] = "";
    snprintf(path, sizeof(path), "/proc/%d/comm", ci->pid);
    FILE *f = fopen(path, "r");
    if (!f) return 0;
    if (!fgets(comm, sizeof(comm), f)) comm[0] = '\0';
    fclose(f);
    comm[strcspn(comm, "\n")] = '\0';
    return strcmp(comm, OWNER_COMM) == 0;
}

static void subscribe(int src_client, int src_port, int dst_client, int dst_port,
                      const char *what, const char *name)
{
    struct snd_seq_port_subscribe sub;
    memset(&sub, 0, sizeof(sub));
    sub.sender.client = (unsigned char)src_client;
    sub.sender.port = (unsigned char)src_port;
    sub.dest.client = (unsigned char)dst_client;
    sub.dest.port = (unsigned char)dst_port;
    if (ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_SUBSCRIBE_PORT, &sub) == 0) {
        printf("seq-midi-bridge: %s %s (%d:%d)\n", what, name,
               what[0] == 'i' ? src_client : dst_client,
               what[0] == 'i' ? src_port : dst_port);
        fflush(stdout);
    }
    /* EBUSY = already subscribed; anything else resolves on a later scan. */
}

/* Subscribe our port to every wanted client's ports. Idempotent: called
 * on a timer so a device that connects later is picked up. */
static void rescan(int want_in, int want_out)
{
    struct snd_seq_client_info ci;
    memset(&ci, 0, sizeof(ci));
    ci.client = -1;
    while (ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_QUERY_NEXT_CLIENT, &ci) == 0) {
        if (!client_wanted(&ci)) continue;

        struct snd_seq_port_info pi;
        memset(&pi, 0, sizeof(pi));
        pi.addr.client = (unsigned char)ci.client;
        pi.addr.port = (unsigned char)-1;
        while (ioctl(g_seq_fd, SNDRV_SEQ_IOCTL_QUERY_NEXT_PORT, &pi) == 0) {
            if (pi.capability & SNDRV_SEQ_PORT_CAP_NO_EXPORT) continue;
            const unsigned rd = SNDRV_SEQ_PORT_CAP_READ | SNDRV_SEQ_PORT_CAP_SUBS_READ;
            const unsigned wr = SNDRV_SEQ_PORT_CAP_WRITE | SNDRV_SEQ_PORT_CAP_SUBS_WRITE;
            if (want_in && (pi.capability & rd) == rd)
                subscribe(pi.addr.client, pi.addr.port, g_client, g_port, "in from", ci.name);
            if (want_out && (pi.capability & wr) == wr)
                subscribe(g_client, g_port, pi.addr.client, pi.addr.port, "out to", ci.name);
        }
    }
}

/* MIDI bytes → one sequencer event delivered to our port's subscribers. */
static void seq_send(const uint8_t *b, int len)
{
    struct snd_seq_event ev;
    memset(&ev, 0, sizeof(ev));
    ev.queue = SNDRV_SEQ_QUEUE_DIRECT;
    ev.source.port = (unsigned char)g_port;
    ev.dest.client = SNDRV_SEQ_ADDRESS_SUBSCRIBERS;
    ev.dest.port = SNDRV_SEQ_ADDRESS_UNKNOWN;

    uint8_t ch = b[0] & 0x0F;
    switch (b[0] & 0xF0) {
    case 0x80: case 0x90: case 0xA0:
        if (len < 3) return;
        ev.type = (b[0] & 0xF0) == 0x80 ? SNDRV_SEQ_EVENT_NOTEOFF :
                  (b[0] & 0xF0) == 0x90 ? SNDRV_SEQ_EVENT_NOTEON : SNDRV_SEQ_EVENT_KEYPRESS;
        ev.data.note.channel = ch;
        ev.data.note.note = b[1];
        ev.data.note.velocity = b[2];
        break;
    case 0xB0:
        if (len < 3) return;
        ev.type = SNDRV_SEQ_EVENT_CONTROLLER;
        ev.data.control.channel = ch;
        ev.data.control.param = b[1];
        ev.data.control.value = b[2];
        break;
    case 0xC0: case 0xD0:
        if (len < 2) return;
        ev.type = (b[0] & 0xF0) == 0xC0 ? SNDRV_SEQ_EVENT_PGMCHANGE : SNDRV_SEQ_EVENT_CHANPRESS;
        ev.data.control.channel = ch;
        ev.data.control.value = b[1];
        break;
    case 0xE0:
        if (len < 3) return;
        ev.type = SNDRV_SEQ_EVENT_PITCHBEND;
        ev.data.control.channel = ch;
        ev.data.control.value = ((b[2] << 7) | b[1]) - 8192;
        break;
    case 0xF0:
        ev.type = b[0] == 0xF8 ? SNDRV_SEQ_EVENT_CLOCK :
                  b[0] == 0xFA ? SNDRV_SEQ_EVENT_START :
                  b[0] == 0xFB ? SNDRV_SEQ_EVENT_CONTINUE :
                  b[0] == 0xFC ? SNDRV_SEQ_EVENT_STOP : SNDRV_SEQ_EVENT_NONE;
        if (ev.type == SNDRV_SEQ_EVENT_NONE) return;
        break;
    default:
        return;
    }
    if (write(g_seq_fd, &ev, sizeof(ev)) < 0 && g_verbose && errno != EAGAIN)
        perror("seq-midi-bridge: write");
}

/* One sequencer event → MIDI bytes. Returns the byte count, 0 if not bridged. */
static int seq_event_to_bytes(const struct snd_seq_event *ev, uint8_t out[3])
{
    switch (ev->type) {
    case SNDRV_SEQ_EVENT_NOTEON:
        out[0] = 0x90 | (ev->data.note.channel & 0x0F);
        out[1] = ev->data.note.note; out[2] = ev->data.note.velocity; return 3;
    case SNDRV_SEQ_EVENT_NOTEOFF:
        out[0] = 0x80 | (ev->data.note.channel & 0x0F);
        out[1] = ev->data.note.note; out[2] = ev->data.note.velocity; return 3;
    case SNDRV_SEQ_EVENT_KEYPRESS:
        out[0] = 0xA0 | (ev->data.note.channel & 0x0F);
        out[1] = ev->data.note.note; out[2] = ev->data.note.velocity; return 3;
    case SNDRV_SEQ_EVENT_CONTROLLER:
        out[0] = 0xB0 | (ev->data.control.channel & 0x0F);
        out[1] = (uint8_t)ev->data.control.param; out[2] = (uint8_t)ev->data.control.value; return 3;
    case SNDRV_SEQ_EVENT_PGMCHANGE:
        out[0] = 0xC0 | (ev->data.control.channel & 0x0F);
        out[1] = (uint8_t)ev->data.control.value; return 2;
    case SNDRV_SEQ_EVENT_CHANPRESS:
        out[0] = 0xD0 | (ev->data.control.channel & 0x0F);
        out[1] = (uint8_t)ev->data.control.value; return 2;
    case SNDRV_SEQ_EVENT_PITCHBEND: {
        int v = ev->data.control.value + 8192;
        if (v < 0) v = 0;
        if (v > 16383) v = 16383;
        out[0] = 0xE0 | (ev->data.control.channel & 0x0F);
        out[1] = v & 0x7F; out[2] = (v >> 7) & 0x7F; return 3;
    }
    default:
        return 0;
    }
}

/* Drain the sequencer fd into the external MIDI input ring. */
static void pump_in(shadow_midi_inject_t *inject)
{
    struct snd_seq_event evs[32];
    for (;;) {
        ssize_t got = read(g_seq_fd, evs, sizeof(evs));
        if (got <= 0) return;
        int n = (int)(got / (ssize_t)sizeof(evs[0]));
        for (int i = 0; i < n; i++) {
            const struct snd_seq_event *ev = &evs[i];
            if ((ev->flags & SNDRV_SEQ_EVENT_LENGTH_MASK) == SNDRV_SEQ_EVENT_LENGTH_VARIABLE) {
                /* Variable data (SysEx) follows in whole event-sized cells. */
                i += (int)((ev->data.ext.len + sizeof(evs[0]) - 1) / sizeof(evs[0]));
                continue;
            }
            uint8_t bytes[3], pkt[4];
            int len = seq_event_to_bytes(ev, bytes);
            if (!len || !seq_bridge_bytes_to_packet(bytes, len, pkt)) continue;
            if (g_verbose)
                printf("in  %02X %02X %02X\n", pkt[1], pkt[2], pkt[3]);
            if (inject) shadow_midi_inject_push(inject, pkt);
        }
    }
}

/* Forward everything new on the MIDI_OUT stream to the sequencer. */
static void pump_out(test_stream_shm_t *stream, uint32_t *cursor)
{
    /* The stream only captures while enabled; the test daemon clears the
     * flag when its last client leaves, so keep asserting it. */
    if (!__atomic_load_n(&stream->enabled, __ATOMIC_RELAXED))
        __atomic_store_n(&stream->enabled, 1, __ATOMIC_RELAXED);

    test_stream_event_t evs[64];
    int n;
    while ((n = seq_bridge_stream_read(stream, cursor, evs, 64)) > 0) {
        for (int i = 0; i < n; i++) {
            uint8_t bytes[3] = {0};
            int len = seq_bridge_packet_to_bytes(evs[i].pkt, bytes);
            if (!len) continue;
            if (g_verbose && bytes[0] != 0xF8)
                printf("out %02X %02X %02X\n", bytes[0], len > 1 ? bytes[1] : 0, len > 2 ? bytes[2] : 0);
            seq_send(bytes, len);
        }
    }
}

int main(int argc, char **argv)
{
    int want_in = 1, want_out = 1;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--any-client")) g_any_client = 1;
        else if (!strcmp(argv[i], "--no-in")) want_in = 0;
        else if (!strcmp(argv[i], "--no-out")) want_out = 0;
        else if (!strcmp(argv[i], "--verbose")) g_verbose = 1;
        else { fprintf(stderr, "seq-midi-bridge: unknown option %s\n", argv[i]); return 2; }
    }

    signal(SIGINT, on_signal);
    signal(SIGTERM, on_signal);

    shm_ref_t stream_ref = { .name = SHM_TEST_STREAM_MIDI_OUT, .size = sizeof(test_stream_shm_t) };
    shm_ref_t inject_ref = { .name = SHM_EXT_MIDI_IN, .size = sizeof(shadow_midi_inject_t) };

    if (seq_open() < 0) return 1;

    printf("seq-midi-bridge: client %d port %d (%s)\n", g_client, g_port,
           g_any_client ? "any client" : "bluetoothd clients");
    fflush(stdout);

    uint32_t cursor = 0;
    long next_scan = 0;

    while (!g_stop) {
        long t = now_ms();
        if (t >= next_scan) {
            /* Start at the stream head: never replay what was sent before
             * this process (or this run of the host) came up. */
            if (want_out && shm_follow(&stream_ref) && stream_ref.map)
                cursor = __atomic_load_n(&((test_stream_shm_t *)stream_ref.map)->write_seq,
                                         __ATOMIC_ACQUIRE);
            if (want_in) shm_follow(&inject_ref);
            rescan(want_in, want_out);
            next_scan = t + RESCAN_INTERVAL_MS;
        }

        struct pollfd pfd = { .fd = g_seq_fd, .events = POLLIN };
        if (poll(&pfd, 1, POLL_INTERVAL_MS) > 0 && (pfd.revents & POLLIN)) {
            /* Always drained, so the fd never backs up while the host is away. */
            int usable = inject_ref.map && t - inject_ref.attached_ms >= INJECT_SETTLE_MS;
            pump_in(usable ? (shadow_midi_inject_t *)inject_ref.map : NULL);
        }
        if (stream_ref.map) pump_out((test_stream_shm_t *)stream_ref.map, &cursor);
    }

    close(g_seq_fd);
    return 0;
}
