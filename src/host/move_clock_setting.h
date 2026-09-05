/*
 * move_clock_setting.h — Move's "MIDI Clock Out" preference, read ONCE A
 * SECOND on a non-realtime thread and handed to the audio path as a cached
 * word.
 *
 * ⚠ THE BUG THIS REPLACES (found 2026-09-05 by the cross-slot race pass):
 * the chain host re-read Settings.json — fopen/fseek/malloc/fread — from
 * whichever thread asked the clock status, throttled to once a second. The
 * asker is the SPI callback (a sub-plugin's render); docs/REALTIME_SAFETY.md
 * §1: any file I/O in that path can spike to 78 ms when the disk is busy. The
 * throttle made it rare, not safe.
 *
 * Split: the PARSE is pure (unit-tested here); the READ is file I/O and is
 * called only by the shim worker (shim_worker.c, SCHED_OTHER), which publishes
 * the result in `shim_clock_output_enabled`; the chain reads that through
 * host_api_v1.clock_output_enabled. Same file, same key, same 1 s staleness.
 */
#ifndef MOVE_CLOCK_SETTING_H
#define MOVE_CLOCK_SETTING_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MOVE_SETTINGS_JSON_PATH "/data/UserData/settings/Settings.json"
#define CLOCK_SETTINGS_MAX_BYTES (256 * 1024)
#define CLOCK_SETTINGS_REFRESH_MS 1000

/* 1 when Move's midiClockMode is "output"; 0 for "off" / "input"; 1 when the
 * key is absent or unknown (avoid false "no clock" warnings). Pure. */
static inline int move_clock_output_enabled_parse(const char *json, size_t n) {
    if (!json || n == 0) return 1;
    const char *key = "\"midiClockMode\"";
    const char *end = json + n;
    const char *pos = NULL;
    /* strnstr by hand: the buffer may not be NUL-terminated at n. */
    size_t klen = strlen(key);
    for (const char *p = json; p + klen <= end; p++) {
        if (memcmp(p, key, klen) == 0) { pos = p + klen; break; }
    }
    if (!pos) return 1;
    while (pos < end && *pos != ':') pos++;
    if (pos >= end) return 1;
    pos++;
    while (pos < end && (*pos == ' ' || *pos == '\t' || *pos == '\n' || *pos == '\r')) pos++;
    if (pos >= end || *pos != '"') return 1;
    pos++;
    char mode[32]; int i = 0;
    while (pos < end && *pos != '"' && i < (int)sizeof(mode) - 1) mode[i++] = *pos++;
    mode[i] = '\0';
    if (strcmp(mode, "output") == 0) return 1;
    if (strcmp(mode, "off") == 0)    return 0;
    if (strcmp(mode, "input") == 0)  return 0;
    return 1;
}

/* FILE I/O — NON-REALTIME THREADS ONLY (the shim worker). Unavailable or
 * oversized file → 1, exactly as before. */
static inline int move_clock_output_enabled_read(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return 1;
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return 1; }
    long size = ftell(f);
    if (size <= 0 || size > CLOCK_SETTINGS_MAX_BYTES || fseek(f, 0, SEEK_SET) != 0) { fclose(f); return 1; }
    char *json = (char *)malloc((size_t)size);
    if (!json) { fclose(f); return 1; }
    size_t nread = fread(json, 1, (size_t)size, f);
    fclose(f);
    int en = (nread == 0) ? 1 : move_clock_output_enabled_parse(json, nread);
    free(json);
    return en;
}

#endif /* MOVE_CLOCK_SETTING_H */
