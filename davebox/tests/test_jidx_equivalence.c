/* tests/test_jidx_equivalence.c — the JSON key index must answer EXACTLY what
 * the strstr it replaced would have, for every key, on every buffer.
 *
 * WHY THIS FILE EXISTS, and it is not a formality. seq8_load_state used to
 * strstr() from the start of the whole buffer for every lookup: 14,931
 * full-buffer scans, ~65 MB scanned to parse a 4.4 KB empty project, 95-97%
 * of the load, all on the SPI callback. The index removes that. But a wrong
 * lookup does not crash — it loads a subtly WRONG project, silently.
 *
 * ⚠⚠ The suite could not see the hard case. Mutating jidx_build to resume
 * after the string it just read (instead of at the next quote) left all 42
 * tests GREEN, because no real project file contains a quote inside a value.
 * strstr does not care about JSON structure: it finds `"name":` ANYWHERE,
 * including mid-value, so `"a"b":1` contains the key `b`. Equivalence has to
 * be tested against strstr on ADVERSARIAL input, not against the corpus we
 * happen to ship. → [[test-the-path-not-the-function]]
 *
 * Both halves below are differential: never "the index returns X", always
 * "the index returns what strstr returns". */
#include "harness.h"
#include <unistd.h>

static int checks = 0;

/* The index's answer for `"key":` must be strstr's, pointer for pointer. */
static void must_match(const char *buf, const char *key) {
    char needle[96];
    const char *want, *got;
    int usable;

    snprintf(needle, sizeof(needle), "\"%s\":", key);
    want = strstr(buf, needle);
    if (want) want += strlen(needle);

    jidx_build(buf);
    usable = jidx_lookup(buf, key, &got);
    HX_ASSERT(usable, "index reported itself unusable on a well-formed buffer");
    if (got != want) {
        fprintf(stderr, "FAIL key=<%s> buf=<%s>\n  index=%p strstr=%p\n",
                key, buf, (const void *)got, (const void *)want);
        HX_ASSERT(0, "index disagreed with strstr");
    }
    checks++;
}

/* ---- 1. hand-picked shapes, each one a specific way to get this wrong ---- */
static void named_cases(void) {
    static const char *keys[] = { "a", "b", "c", "ab", "bc", "abc", "k", "n", "m", "v" };
    static const char *bufs[] = {
        "{\"a\":1,\"b\":2}",              /* the ordinary case */
        "{\"a\"b\":1}",                   /* THE M2 CASE: `b` is a key to strstr */
        "{\"n\":\"a\"m\":3}",             /* a key buried inside a value */
        "{\"k\":1,\"k\":2}",              /* repeated: the FIRST must win */
        "{\"ab\":1,\"a\":2}",             /* one key a prefix of another */
        "{\"a\":\"b\",\"b\":1}",          /* name also appears as a value */
        "{\"a\":1,\"b\"}",                /* a name with no colon is not a key */
        "{\"a\":1,\"unterminated",        /* truncated file */
        "{\"a\"::1}",                     /* doubled colon */
        "{\"\":1,\"a\":2}",               /* empty name */
        "{}",
        "",
    };
    size_t bi, ki;
    for (bi = 0; bi < sizeof(bufs) / sizeof(*bufs); bi++)
        for (ki = 0; ki < sizeof(keys) / sizeof(*keys); ki++)
            must_match(bufs[bi], keys[ki]);
}

/* ---- 2. randomized differential fuzz ------------------------------------
 * The alphabet is deliberately quote- and colon-heavy so the pathological
 * shapes (quote inside a value, overlapping names, a name that is also a
 * value) turn up by the thousand rather than by luck. Fixed seed: a failure
 * a maintainer cannot reproduce is not a test. */
static void fuzz(void) {
    static const char alpha[] = "\"\":::abc,{}1";
    static const char *keys[] = { "a", "b", "c", "ab", "bc", "ca", "abc", "1", "" };
    char buf[128];
    unsigned seed = 20260908u;
    int iter;

    for (iter = 0; iter < 20000; iter++) {
        size_t len, i, ki;
        seed = seed * 1103515245u + 12345u;
        len = 4 + (seed >> 16) % (sizeof(buf) - 5);
        for (i = 0; i < len; i++) {
            seed = seed * 1103515245u + 12345u;
            buf[i] = alpha[(seed >> 16) % (sizeof(alpha) - 1)];
        }
        buf[len] = '\0';
        for (ki = 0; ki < sizeof(keys) / sizeof(*keys); ki++) {
            if (!keys[ki][0]) continue;     /* jidx_lookup declines an empty key */
            must_match(buf, keys[ki]);
        }
    }
}

/* ---- 3. the fallback must engage, not be assumed ------------------------
 * If the index is ever unusable, every getter has to go back to strstr. A
 * silent "absent" there would drop real settings out of a loaded project. */
static void fallback_is_reachable(void) {
    const char *buf = "{\"a\":1}";
    const char *got = NULL;
    jidx_build(buf);
    jidx_release();                          /* simulate: overflow / stale buffer */
    HX_ASSERT(jidx_lookup(buf, "a", &got) == 0,
              "a released index must report itself UNUSABLE, not empty");
    /* json_get_int must still find the key, via strstr. */
    HX_ASSERT(json_get_int(buf, "a", -1) == 1,
              "getter did not fall back to strstr when the index was unusable");
}


/* ---- 4. the index must actually be USED on a real project ---------------
 * Falling back to strstr is CORRECT, so every correctness test above still
 * passes with the index permanently disabled — and the whole point of it
 * would be gone, silently. This is the only check that can tell a working
 * build from an inert one. → [[test-the-path-not-the-function]] */
static void index_is_live_on_a_real_project(void) {
    char path[256];
    hx_t *h;
    seq8_instance_t *inst;
    int t, c, s;

    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    for (t = 0; t < 8; t++)
        for (c = 0; c < 4; c++)
            for (s = 0; s < 16; s++) {
                char k[64], v[32];
                snprintf(k, sizeof(k), "t%d_c%d_step_%d_toggle", t, c, s);
                snprintf(v, sizeof(v), "%d %d", 48 + (s % 24), 90);
                hx_set_param(h, k, v);
            }
    snprintf(path, sizeof(path), "/tmp/hx_jidx_%d.json", (int)getpid());
    inst = (seq8_instance_t *)h->inst;
    inst->awaiting_select = 0;
    snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
    seq8_save_state(inst);
    hx_destroy(h);

    h = hx_create(NULL);
    HX_ASSERT(h, "second create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);

    jidx_fallbacks = 0;
    jidx_xchecks   = 0;
    seq8_load_state(inst);

    printf("  ok   — real load: %ld index lookups verified against strstr, "
           "%ld fell back\n", jidx_xchecks, jidx_fallbacks);
    HX_ASSERT(jidx_xchecks > 5000,
              "the index served almost nothing — is it being built at all?");
    HX_ASSERT(jidx_fallbacks == 0,
              "a lookup fell back to a full-buffer strstr on a well-formed file");
    hx_destroy(h);
    remove(path);
}

int main(void) {
    named_cases();
    fuzz();
    fallback_is_reachable();
    index_is_live_on_a_real_project();
    printf("  ok   — index == strstr over %d differential checks\n", checks);
    printf("PASS: the JSON key index answers exactly what strstr did\n");
    return 0;
}
