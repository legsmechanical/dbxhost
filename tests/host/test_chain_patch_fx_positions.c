/* test_chain_patch_fx_positions.c — an insert FX comes back from a saved patch
 * at the POSITION it was saved from.
 *
 * Bug: the save wrote only the loaded positions ([A, -, C] as [A, C]) and the
 * load appended, so C came back at FX2 and everything addressing "fx3:" (an
 * automation lane, a macro leg) named nothing. The save now writes each FX's
 * "slot"; the load puts it there. A file without "slot" loads in order, as
 * every file written before did.
 *
 * Runs the real chain (every chain_*.c) with a stand-in FX module built by the
 * .sh beside this file. argv[1] is the temp root holding modules/ and patches/.
 */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "plugin_api_v1.h"

plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *host);
void unified_log(const char *source, int level, const char *fmt, ...) { (void)source; (void)level; (void)fmt; }

static int fails;
#define CHECK(c, ...) do { if (!(c)) { fprintf(stderr, "FAIL: "); fprintf(stderr, __VA_ARGS__); fputc('\n', stderr); fails++; } } while (0)

static char lib[600];
static void write_patch(const char *file, const char *name, const char *audio_fx) {
    char p[1024];
    snprintf(p, sizeof p, "%s/%s", lib, file);
    FILE *f = fopen(p, "w");
    fprintf(f, "{\"name\": \"%s\", \"version\": 1, \"chain\": {\"audio_fx\": %s}}\n", name, audio_fx);
    fclose(f);
}
static void get(plugin_api_v2_t *api, void *inst, const char *k, char *buf, int n) {
    buf[0] = '\0';
    int r = api->get_param(inst, k, buf, n);
    if (r < 0) buf[0] = '\0';
}
/* The module at each of the four positions, as "m m m m" with "-" for empty. */
static void positions(plugin_api_v2_t *api, void *inst, char *out, int n) {
    out[0] = '\0';
    for (int i = 1; i <= 4; i++) {
        char k[32], v[64];
        snprintf(k, sizeof k, "fx%d_module", i);
        get(api, inst, k, v, sizeof v);
        strncat(out, v[0] ? v : "-", n - strlen(out) - 1);
        if (i < 4) strncat(out, " ", n - strlen(out) - 1);
    }
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <root>\n", argv[0]); return 2; }
    char chain_dir[700];
    snprintf(chain_dir, sizeof chain_dir, "%s/modules/chain", argv[1]); mkdir(chain_dir, 0755);
    snprintf(lib, sizeof lib, "%s/patches", argv[1]);               mkdir(lib, 0755);

    /* Sorted by name, so load_patch N is the N-th below. */
    write_patch("a.json", "a gap",      "[{\"type\": \"stubfx\", \"slot\": 0}, {\"type\": \"stubfx\", \"slot\": 2, \"params\": {\"x\": \"7\"}}]");
    write_patch("b.json", "b old",      "[{\"type\": \"stubfx\"}, {\"type\": \"stubfx\", \"params\": {\"x\": \"5\"}}]");
    write_patch("c.json", "c nested",   "[{\"type\": \"stubfx\", \"params\": {\"slot\": 3, \"x\": \"4\"}}]");
    write_patch("d.json", "d last",     "[{\"type\": \"stubfx\", \"slot\": 3}]");
    write_patch("e.json", "e taken",    "[{\"type\": \"stubfx\", \"slot\": 1}, {\"type\": \"stubfx\", \"slot\": 1}]");

    static host_api_v1_t host;
    host.api_version = MOVE_PLUGIN_API_VERSION;
    host.sample_rate = 44100;
    host.frames_per_block = 128;
    plugin_api_v2_t *api = move_plugin_init_v2(&host);
    CHECK(api != NULL, "move_plugin_init_v2");
    if (!api) return 1;
    void *inst = api->create_instance(chain_dir, NULL);
    CHECK(inst != NULL, "create_instance");
    char got[128], v[32];

    /* CONTROL first: the stand-in module loads at all (else every check below
     * would read "-" and prove nothing). */
    api->set_param(inst, "fx1:module", "stubfx");
    positions(api, inst, got, sizeof got);
    CHECK(!strcmp(got, "stubfx - - -"), "control: the stand-in FX did not load (%s)", got);

    api->set_param(inst, "load_patch", "0");
    positions(api, inst, got, sizeof got);
    CHECK(!strcmp(got, "stubfx - stubfx -"), "a gap at FX2: positions %s, want 'stubfx - stubfx -'", got);
    get(api, inst, "fx3:x", v, sizeof v);
    CHECK(!strcmp(v, "7"), "FX3's saved param went to '%s' at FX3, want 7 (applied to the wrong position?)", v);

    api->set_param(inst, "load_patch", "1");
    positions(api, inst, got, sizeof got);
    CHECK(!strcmp(got, "stubfx stubfx - -"), "a file without positions: %s, want them in order", got);
    get(api, inst, "fx2:x", v, sizeof v);
    CHECK(!strcmp(v, "5"), "old file: FX2's param read '%s', want 5", v);

    api->set_param(inst, "load_patch", "2");
    positions(api, inst, got, sizeof got);
    CHECK(!strcmp(got, "stubfx - - -"), "a \"slot\" inside params was taken as the position: %s", got);

    api->set_param(inst, "load_patch", "3");
    positions(api, inst, got, sizeof got);
    CHECK(!strcmp(got, "- - - stubfx"), "saved at FX4 alone: %s", got);

    api->set_param(inst, "load_patch", "4");
    positions(api, inst, got, sizeof got);
    CHECK(!strcmp(got, "- stubfx stubfx -"), "two FX naming one position: %s, want the second in the next free", got);

    api->destroy_instance(inst);
    if (fails) { printf("FAIL: test_chain_patch_fx_positions (%d)\n", fails); return 1; }
    printf("PASS: test_chain_patch_fx_positions (FX reload at their saved positions; old files in order)\n");
    return 0;
}
