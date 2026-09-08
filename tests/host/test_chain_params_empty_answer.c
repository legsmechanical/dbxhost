/*
 * chain_params_answer_is_useful — an EMPTY ARRAY IS NOT AN ANSWER.
 *
 * A chain component's chain_params are served plugin-first, with the params
 * parsed out of the module's own module.json as the fallback beneath. The test
 * that chose between them was `result > 0`, i.e. "the plugin wrote some bytes".
 *
 * A module that reads its chain_params from a JSON file at runtime answers the
 * two characters "[]" when that file is not installed — which it is not, in a
 * shipped tarball. Two bytes is > 0, so the host threw away the declarations it
 * had already parsed and served "[]". The Shadow UI then had no type for any of
 * those params and drove every one as a float 0..1: an int wrote a fraction its
 * atoi read as 0, an enum took option 0.
 *
 * It presents as "i could see the values change, but when i release, it reset
 * to the default" — an edit/commit complaint for a metadata bug two layers
 * away, which is why it needs a test rather than a comment.
 *
 * The three routes are in chain_host.c (synth / fx / midi_fx) and are serviced
 * from the SPI callback, so the predicate is a pure scan over a caller-owned
 * buffer: no allocation, no I/O.
 */
#include <stdio.h>
#include <string.h>

/* The predicate under test, lifted verbatim from chain_internal.h. That header
 * cannot be included here — it pulls in the whole chain instance, the plugin
 * ABIs and dlfcn — so test_chain_params_empty_answer.sh greps the real
 * definition and fails if this copy drifts from it. */
static inline int chain_params_answer_is_useful(const char *buf, int result) {
    if (result <= 0 || !buf) return 0;
    for (int i = 0; i < result && buf[i]; i++) {
        char c = buf[i];
        if (c == '[' || c == ']' || c == ' ' || c == '\t' || c == '\n' || c == '\r') continue;
        return 1;
    }
    return 0;
}

static int failures = 0;
static int checks = 0;

static void expect(const char *what, const char *buf, int result, int want)
{
    checks++;
    int got = chain_params_answer_is_useful(buf, result);
    if (got != want) {
        fprintf(stderr, "FAIL %s: got %d, want %d\n", what, got, want);
        failures++;
    }
}

int main(void)
{
    /* ---- THE BUG ITSELF ---------------------------------------------- */

    /* The exact answer that cost fifteen correct declarations. */
    expect("\"[]\" is not an answer", "[]", 2, 0);
    /* And the shapes it arrives in when the module pretty-prints. */
    expect("\"[ ]\" is not an answer", "[ ]", 3, 0);
    expect("a whitespace-padded empty array is not an answer", " [\n\t] \r", 7, 0);
    expect("bare brackets are not an answer", "[[]]", 4, 0);

    /* ---- A REAL ANSWER STILL IS ONE ---------------------------------- */

    const char *real = "[{\"key\":\"cutoff\",\"type\":\"float\"}]";
    expect("a populated array is an answer", real, (int)strlen(real), 1);
    /* One character of content is enough — the rule is "anything but brackets
     * and space", not "looks like valid JSON". Parsing is the caller's job and
     * this runs on the audio thread. */
    expect("a single non-bracket character is an answer", "[x]", 3, 1);

    /* ---- THE FAILURE CASES MUST NOT READ AS ANSWERS ------------------- */

    expect("a refused read is not an answer", "", 0, 0);
    expect("a negative result is not an answer", "[{\"key\":\"a\"}]", -1, 0);
    expect("a NULL buffer is not an answer", NULL, 8, 0);

    /* ---- `result` BOUNDS THE SCAN, NOT strlen ------------------------- */

    /* The plugin reports how much it wrote. Content past that is not the
     * plugin's answer, and trusting the terminator instead would let stale
     * bytes left in a reused buffer vouch for an empty reply. */
    expect("content past `result` does not count", "[]{\"key\":\"stale\"}", 2, 0);
    /* And a short result inside real content still reads what it was given. */
    expect("`result` shorter than the buffer still scans its prefix", "[a]bcd", 3, 1);

    /* An embedded NUL ends the scan early — the loop tests buf[i]. A plugin
     * that reports more than it wrote must not walk off its own buffer. */
    expect("an embedded NUL stops the scan", "[]\0{\"key\":\"x\"}", 14, 0);

    if (failures) {
        fprintf(stderr, "FAIL: %d chain_params_answer_is_useful check(s) failed\n", failures);
        return 1;
    }
    printf("PASS: chain_params_answer_is_useful (%d checks)\n", checks);
    return 0;
}
