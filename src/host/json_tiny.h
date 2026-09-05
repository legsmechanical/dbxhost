/*
 * json_tiny.h — the one tiny "find an integer field" JSON helper.
 *
 * Five copies of this function existed (chain_json.c, module_manager.c, and
 * the arp / chord / velocity_scale MIDI FX), differing only in cosmetics: two
 * return conventions (0-on-found vs 1-on-found), a 64- vs 128-byte key buffer,
 * and which whitespace they skipped after the colon — moot, because atoi()
 * skips leading whitespace itself. Five copies of a parser is five places for
 * the next fix to miss (hygiene, 2026-09-05).
 *
 * Contract: returns 1 and writes *out when `"key"` is found with a value that
 * atoi can read; 0 otherwise (*out untouched). NULL-safe. Not a JSON parser —
 * it finds the first occurrence of the quoted key ANYWHERE in the text, so it
 * is for small, flat module.json / config blobs only. Never use it for
 * booleans: atoi("true") is 0.
 *
 * Header-only so the host, the chain module and the standalone MIDI FX
 * plugins (separate .so builds) share ONE body.
 */
#ifndef SCHWUNG_JSON_TINY_H
#define SCHWUNG_JSON_TINY_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static inline int json_tiny_get_int(const char *json, const char *key, int *out) {
    if (!json || !key || !out) return 0;
    char search[128];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *pos = strstr(json, search);
    if (!pos) return 0;
    pos = strchr(pos + strlen(search), ':');
    if (!pos) return 0;
    *out = atoi(pos + 1);   /* atoi skips leading whitespace */
    return 1;
}

#endif /* SCHWUNG_JSON_TINY_H */
