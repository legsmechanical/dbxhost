/* test_json_tiny.c — the ONE tiny integer-field JSON helper (host/json_tiny.h),
 * shared by the host, the chain module and the standalone MIDI FX plugins.
 * Five copies used to exist; this pins the contract they all now share. */
#include <stdio.h>
#include <string.h>
#include "json_tiny.h"

static int n = 0;
#define OK(c, m) do { if (c) { printf("  ok   %s\n", m); n++; } else { printf("  FAIL %s\n", m); return 1; } } while (0)

int main(void) {
    int v = -1;
    OK(json_tiny_get_int("{\"api_version\": 2}", "api_version", &v) == 1 && v == 2, "found: returns 1, writes the value");
    v = -1;
    OK(json_tiny_get_int("{\"a\":1}", "b", &v) == 0 && v == -1, "missing key: returns 0, leaves *out alone");
    OK(json_tiny_get_int("{\"bpm\"  :\n\t 120 }", "bpm", &v) == 1 && v == 120, "whitespace and newlines after the colon are fine (atoi)");
    OK(json_tiny_get_int("{\"min\":-12}", "min", &v) == 1 && v == -12, "negative values");
    OK(json_tiny_get_int("{\"x\":true}", "x", &v) == 1 && v == 0, "a boolean reads as 0 — the documented caveat, never use it for bools");
    OK(json_tiny_get_int("{\"curve\"}", "curve", &v) == 0, "a key with no colon: 0");
    OK(json_tiny_get_int(NULL, "k", &v) == 0 && json_tiny_get_int("{}", NULL, &v) == 0 && json_tiny_get_int("{}", "k", NULL) == 0, "NULL-safe");
    OK(json_tiny_get_int("{\"strum_ms\":5,\"strum\":7}", "strum", &v) == 1 && v == 7, "the QUOTED key is matched, so a longer key sharing the prefix does not shadow it");
    printf("PASS: test_json_tiny (%d checks)\n", n);
    return 0;
}
