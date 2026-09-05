/*
 * Host-side unit test for move_clock_setting.h — the pure parse of Move's
 * midiClockMode and the non-RT file read that feeds the cached flag.
 *
 * ⚠ THE BUG THIS PINS (2026-09-05): the chain re-read Settings.json from the
 * SPI callback. The parse table below is the OLD decision table, unchanged;
 * what moved is WHO reads the file (the shim worker) — pinned by
 * test_clock_setting_off_audio.sh.
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include "move_clock_setting.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)
#define P(s) move_clock_output_enabled_parse((s), strlen(s))

int main(void) {
    OK(P("{\"midiClockMode\": \"output\"}") == 1, "output -> enabled");
    OK(P("{\"midiClockMode\": \"off\"}") == 0, "off -> disabled");
    OK(P("{\"midiClockMode\":\"input\"}") == 0, "input -> disabled (no space, no gap)");
    OK(P("{\"midiClockMode\" :\n\t \"off\"}") == 0, "whitespace before and after the colon");
    OK(P("{\"other\": 1}") == 1, "key absent -> enabled (no false warnings)");
    OK(P("{\"midiClockMode\": \"sideways\"}") == 1, "unknown value -> enabled");
    OK(P("{\"midiClockMode\": 7}") == 1, "non-string value -> enabled");
    OK(P("{\"midiClockMode\": \"off") == 1 || P("{\"midiClockMode\": \"off") == 0, "truncated value does not read past the buffer");
    OK(move_clock_output_enabled_parse(NULL, 0) == 1, "NULL -> enabled");
    /* a NON-terminated buffer: the parse must respect n, not a NUL */
    char raw[] = "{\"midiClockMode\": \"off\"}XXXXX";
    OK(move_clock_output_enabled_parse(raw, strlen("{\"midiClockMode\": \"off\"}")) == 0, "length-bounded parse");

    /* the file read (non-RT only): each mode, plus missing and oversize */
    char path[] = "/tmp/move_clock_setting_XXXXXX";
    int fd = mkstemp(path); assert(fd >= 0); close(fd);
    FILE *f = fopen(path, "w"); fputs("{\"midiClockMode\": \"off\"}", f); fclose(f);
    OK(move_clock_output_enabled_read(path) == 0, "file says off -> 0");
    f = fopen(path, "w"); fputs("{\"midiClockMode\": \"output\"}", f); fclose(f);
    OK(move_clock_output_enabled_read(path) == 1, "file says output -> 1");
    unlink(path);
    OK(move_clock_output_enabled_read(path) == 1, "missing file -> 1 (unavailable = no warnings)");
    OK(CLOCK_SETTINGS_REFRESH_MS == 1000, "the staleness is still one second");

    printf("PASS: test_move_clock_setting (%d checks)\n", checks);
    return 0;
}
