/* A slot level above unity survives a save and a reload of the project.
 *
 * The mixer's slot fader goes to 2.0 (+6 dB), and the per-set saver writes
 * whatever the slot holds. The BOOT loader — the only one that runs when a
 * session is launched straight into a project — accepted only 0.0..1.0, so a
 * saved 1.6 was dropped on the floor and the slot came back at its 1.0
 * default; the next save then wrote 1.0 over the user's level. Every other
 * reader of this value (shadow_chain_load_config, the global fallback, the
 * runtime set-change loader in shadow_ui.js) and the set path itself take
 * 0.0..4.0.
 *
 * This drives the real shadow_save_config_to_dir / shadow_load_config_from_dir
 * against a temp dir: no source pins. */

#include <sys/xattr.h>
#ifdef __APPLE__
/* Linux's 4-argument getxattr, used by an unrelated function in the file. */
#define getxattr(p, n, v, s) getxattr(p, n, v, s, 0, 0)
#endif
#include "shadow_set_pages.c"

#include <math.h>

void unified_log_important(const char *source, int level, const char *fmt, ...) {
    (void)source; (void)level; (void)fmt;
}

static shadow_chain_slot_t slots[SHADOW_CHAIN_INSTANCES];
static volatile int solo_count;
static int fails;

static int parse_ch(int ch) { return ch > 0 ? ch - 1 : -1; }
static void noop(void) {}
static int no_command(const char *const argv[]) { (void)argv; return 0; }  /* chown; the dir exists */

static void defaults(void) {
    memset(slots, 0, sizeof(slots));
    for (int i = 0; i < SHADOW_CHAIN_INSTANCES; i++) {
        slots[i].volume = 1.0f;
        slots[i].synth_volume = 1.0f;
        slots[i].pan = 0.5f;
        slots[i].channel = i;
        slots[i].forward_channel = -1;
    }
}

static void expect(int slot, float want, const char *what) {
    if (fabsf(slots[slot].volume - want) > 0.0005f) {
        printf("FAIL: %s: slot %d volume %.3f after reload, want %.3f\n",
               what, slot, slots[slot].volume, want);
        fails++;
    }
}

int main(void) {
    set_pages_host_t h = {0};
    h.chain_slots = slots;
    h.solo_count = &solo_count;
    h.chain_parse_channel = parse_ch;
    h.ui_state_refresh = noop;
    h.run_command = no_command;
    set_pages_init(&h);

    char dir[] = "/tmp/slot_level_reload_XXXXXX";
    if (!mkdtemp(dir)) { perror("mkdtemp"); return 2; }

    /* What the session mixer had: above unity, at the fader's ceiling, at and
     * below unity. */
    defaults();
    slots[0].volume = 1.6f;
    slots[1].volume = 1.07f;
    slots[2].volume = 2.0f;   /* SLOT_LEVEL_MAX, davebox/ui/ui_engine.mjs */
    slots[3].volume = 1.0f;
    slots[4].volume = 0.5f;
    shadow_save_config_to_dir(dir);

    /* A fresh session: every slot at its default, then the project loads. */
    defaults();
    if (!shadow_load_config_from_dir(dir)) {
        printf("FAIL: shadow_load_config_from_dir refused its own file\n");
        return 1;
    }
    expect(0, 1.6f, "above unity");
    expect(1, 1.07f, "just above unity");
    expect(2, 2.0f, "the mixer's maximum");
    expect(3, 1.0f, "unity");
    expect(4, 0.5f, "below unity");

    /* A value no writer can produce is still refused (the slot keeps its
     * default), same bound as the set path. */
    char path[600];
    snprintf(path, sizeof(path), "%s/" SHADOW_CHAIN_CONFIG_FILENAME, dir);
    FILE *f = fopen(path, "w");
    fprintf(f, "{\"slots\": [{\"name\": \"\", \"channel\": 1, \"volume\": 9.0}]}\n");
    fclose(f);
    defaults();
    shadow_load_config_from_dir(dir);
    expect(0, 1.0f, "out of range");

    unlink(path);
    rmdir(dir);
    if (fails) return 1;
    printf("PASS: a slot level up to the mixer's maximum survives save + reload\n");
    return 0;
}
