/* test_chain_patch_library.c — the chain's patch LIBRARY past 32 patches, and
 * patches that arrive while an instance lives.
 *
 * Bug (2026-10-14): the list embedded a full patch_info_t per entry and was
 * capped at 32. A library of 35 (a module installer added its presets) was
 * cut to whichever 32 readdir returned first, while the UI's list
 * (shadow_ui_patches.mjs) counted every file — so a pick by index loaded a
 * DIFFERENT patch, or nothing ("patch index out of range"). And the list was
 * scanned once, at create: a patch added later was invisible to the instance.
 *
 * Runs the real chain (every chain_*.c) against a temp library:
 *   - 40 patches are all listed, in the UI's order (case-insensitive by name);
 *   - patch_name_<i> answers the i-th name, so an index means one file;
 *   - a patch added AFTER create is listed on the next ask, and shifts the
 *     indexes exactly as the UI's fresh listing would;
 *   - a removed one is gone the same way;
 *   - loading index i loads the file named i (its receive channel reads back).
 */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>
#include <sys/stat.h>
#include "plugin_api_v1.h"

plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *host);
/* The host's logger, which the chain links against in MoveOriginal. */
void unified_log(const char *source, int level, const char *fmt, ...) { (void)source; (void)level; (void)fmt; }

static int fails;
#define CHECK(c, ...) do { if (!(c)) { fprintf(stderr, "FAIL: "); fprintf(stderr, __VA_ARGS__); fputc('\n', stderr); fails++; } } while (0)

static char lib[512];
static void write_patch(const char *file, const char *name, int rx) {
    char p[1024];
    snprintf(p, sizeof p, "%s/%s", lib, file);
    FILE *f = fopen(p, "w");
    fprintf(f, "{\"name\": \"%s\", \"version\": 1, \"chain\": {\"receive_channel\": %d}}\n", name, rx);
    fclose(f);
}
static void get(plugin_api_v2_t *api, void *inst, const char *k, char *buf, int n) {
    int len = api->get_param(inst, k, buf, n);
    if (len < 0) len = 0;
    buf[len < n ? len : n - 1] = 0;
}
static int count(plugin_api_v2_t *api, void *inst) {
    char b[32]; get(api, inst, "patch_count", b, sizeof b); return atoi(b);
}
static void name_at(plugin_api_v2_t *api, void *inst, int i, char *out, int n) {
    char k[32]; snprintf(k, sizeof k, "patch_name_%d", i); get(api, inst, k, out, n);
}
static int by_name(const void *a, const void *b) { return strcasecmp(*(char *const *)a, *(char *const *)b); }

int main(void) {
    char root[] = "/tmp/chain_patch_lib_XXXXXX";
    char modules[600], chain_dir[700];
    CHECK(mkdtemp(root) != NULL, "mkdtemp");
    /* The chain finds its library at <module_dir>/../../patches. */
    snprintf(modules, sizeof modules, "%s/modules", root);       mkdir(modules, 0755);
    snprintf(chain_dir, sizeof chain_dir, "%s/modules/chain", root); mkdir(chain_dir, 0755);
    snprintf(lib, sizeof lib, "%s/patches", root);              mkdir(lib, 0755);

    /* 40 patches, file names in a different order from patch names. */
    char *names[64]; int nn = 0;
    for (int i = 0; i < 40; i++) {
        char file[64], name[64];
        snprintf(file, sizeof file, "f%02d.json", 39 - i);
        snprintf(name, sizeof name, "%c%s patch %02d", 'a' + (i * 7) % 26, (i & 1) ? "" : "X", i);
        write_patch(file, name, 1 + i % 16);
        names[nn++] = strdup(name);
    }

    static host_api_v1_t host;
    host.api_version = MOVE_PLUGIN_API_VERSION;
    host.sample_rate = 44100;
    host.frames_per_block = 128;
    plugin_api_v2_t *api = move_plugin_init_v2(&host);
    CHECK(api != NULL, "move_plugin_init_v2");
    if (!api) return 1;
    void *inst = api->create_instance(chain_dir, NULL);
    CHECK(inst != NULL, "create_instance");

    /* ---- all 40, in the UI's order ---- */
    qsort(names, nn, sizeof names[0], by_name);
    CHECK(count(api, inst) == 40, "patch_count %d, want 40 (the old cap was 32)", count(api, inst));
    {
        int bad = 0; char got[128];
        for (int i = 0; i < nn; i++) { name_at(api, inst, i, got, sizeof got); if (strcmp(got, names[i])) bad++; }
        CHECK(bad == 0, "%d of 40 indexes name a different patch than the UI's sorted list", bad);
    }

    /* ---- a patch added while the instance lives, sorting FIRST ---- */
    usleep(20000);
    write_patch("zz_new.json", "AAA newcomer", 9);
    CHECK(count(api, inst) == 41, "a patch added after create was not listed (count %d)", count(api, inst));
    { char got[128]; name_at(api, inst, 0, got, sizeof got); CHECK(!strcmp(got, "AAA newcomer"), "index 0 is %s, want the newcomer", got); }
    { char got[128]; name_at(api, inst, 1, got, sizeof got); CHECK(!strcmp(got, names[0]), "the old first patch did not shift to index 1 (%s)", got); }

    /* ---- loading by index loads THAT file ---- */
    api->set_param(inst, "load_patch", "0");
    { char b[16]; get(api, inst, "patch:receive_channel", b, sizeof b); CHECK(!strcmp(b, "9"), "load_patch 0 read receive channel '%s', want the newcomer's 9", b); }
    { char b[16]; get(api, inst, "current_patch", b, sizeof b); CHECK(!strcmp(b, "0"), "current_patch '%s'", b); }

    /* ---- a removed one is gone the same way ---- */
    usleep(20000);
    { char p[1024]; snprintf(p, sizeof p, "%s/zz_new.json", lib); unlink(p); }
    CHECK(count(api, inst) == 40, "a removed patch is still listed (count %d)", count(api, inst));
    { char got[128]; name_at(api, inst, 0, got, sizeof got); CHECK(!strcmp(got, names[0]), "index 0 after the removal is %s", got); }

    /* ---- a load past the end is refused, not aliased ---- */
    api->set_param(inst, "load_patch", "40");
    { char b[16]; get(api, inst, "current_patch", b, sizeof b); CHECK(!strcmp(b, "0"), "an out-of-range load changed current_patch to %s", b); }

    api->destroy_instance(inst);
    { char cmd[700]; snprintf(cmd, sizeof cmd, "rm -rf '%s'", root); if (system(cmd)) {} }
    if (fails) { printf("FAIL: test_chain_patch_library (%d)\n", fails); return 1; }
    printf("PASS: test_chain_patch_library (40+ patches listed in the UI's order, live, and loaded by the same index)\n");
    return 0;
}
