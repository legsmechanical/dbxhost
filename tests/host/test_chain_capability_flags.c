/*
 * A capability FLAG in module.json is read however the module spells it.
 *
 * Bug (2026-09-27, found by the upstream-1.5 survey): chain_host read
 * capabilities.requires_continuous_processing with json_get_int_in_section, and
 * atoi("true") is 0 — so every audio FX that declares it the way modules do
 * (`true`, as docs/MODULES.md shows: rrverb10, echidna-fx, monomodule-fx) was
 * idle-parked on silence anyway and its internal time froze.
 */
#include <stdio.h>
#include <string.h>

int json_get_flag_in_section(const char *json, const char *section_key, const char *key);
int json_get_int_in_section(const char *json, const char *section_key, const char *key, int *out);

static int fails = 0;
static void expect(const char *label, int got, int want) {
    if (got != want) { fprintf(stderr, "FAIL: %s: got %d, want %d\n", label, got, want); fails++; }
    else printf("  ok   %s\n", label);
}

int main(void) {
    /* rrverb10's capabilities block, as it ships (module.json:33). */
    const char *rrverb10 =
        "{ \"id\": \"rrverb10\", \"capabilities\": {\n"
        "    \"chainable\": true,\n"
        "    \"component_type\": \"audio_fx\",\n"
        "    \"requires_continuous_processing\": true,\n"
        "    \"ui_hierarchy\": { \"modes\": null }\n"
        "  } }";
    /* CONTROL: the old read really does miss `true` — without this the test
     * could pass against a helper that was never the problem. */
    { int cap = -1; json_get_int_in_section(rrverb10, "capabilities", "requires_continuous_processing", &cap);
      expect("control: json_get_int reads true as 0 (the bug)", cap, 0); }
    expect("true (how modules write it) is set", json_get_flag_in_section(rrverb10, "capabilities", "requires_continuous_processing"), 1);
    expect("1 is set", json_get_flag_in_section("{\"capabilities\":{\"requires_continuous_processing\": 1}}", "capabilities", "requires_continuous_processing"), 1);
    expect("false is not", json_get_flag_in_section("{\"capabilities\":{\"requires_continuous_processing\": false}}", "capabilities", "requires_continuous_processing"), 0);
    expect("0 is not", json_get_flag_in_section("{\"capabilities\":{\"requires_continuous_processing\": 0}}", "capabilities", "requires_continuous_processing"), 0);
    expect("absent is not", json_get_flag_in_section("{\"capabilities\":{\"chainable\": true}}", "capabilities", "requires_continuous_processing"), 0);
    expect("no capabilities section is not", json_get_flag_in_section("{\"id\":\"x\"}", "capabilities", "requires_continuous_processing"), 0);
    expect("the key OUTSIDE the section does not count",
           json_get_flag_in_section("{\"requires_continuous_processing\": true, \"capabilities\":{\"chainable\": true}}", "capabilities", "requires_continuous_processing"), 0);
    expect("pre_capable: true is set", json_get_flag_in_section("{\"capabilities\":{\"pre_capable\": true}}", "capabilities", "pre_capable"), 1);
    if (fails) { printf("FAIL: test_chain_capability_flags (%d)\n", fails); return 1; }
    printf("PASS: test_chain_capability_flags\n");
    return 0;
}
