/* shadow_state.c - Shadow slot state persistence
 * Extracted from schwung_shim.c for maintainability. */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pwd.h>
#include "shadow_state.h"
#include "shadow_chain_mgmt.h"  /* shadow_per_set_config_loaded */

#include "host/schwung_paths.h"
/* ============================================================================
 * Host callbacks (set by state_init)
 * ============================================================================ */

static void (*host_log)(const char *msg);
static shadow_chain_slot_t *host_chain_slots;
static int *host_solo_count;

/* Per-bus send return level — defined in shadow_chain_mgmt.c (same .so).
 * Declared locally to avoid pulling in the full chain-mgmt header. */
extern float shadow_send_return_level[2];
extern float shadow_send_a_to_b_level;

/* Fix file ownership after writing as root */
static void chown_to_ableton(const char *path) {
    struct passwd *pw = getpwnam("ableton");
    if (pw) chown(path, pw->pw_uid, pw->pw_gid);
}

void state_init(const state_host_t *host)
{
    host_log = host->log;
    host_chain_slots = host->chain_slots;
    host_solo_count = host->solo_count;
}


/* ============================================================================
 * JSON array parsing — count-agnostic
 * ============================================================================ */

/* Parse "[a, b, c, ...]" starting at `pos` (which must point at the '['), into
 * out[], at most `max` entries. Returns how many were parsed.
 *
 * ⚠ These replace a family of `sscanf(pos, "[%f, %f, %f, %f]", ...) == 4` reads
 * whose failure mode was invisible. At more than four slots the writer emits N
 * values and that format consumes the first four **and still matches**, so every
 * slot past the fourth silently reverted to its default on every load — no
 * error, no version mismatch, no file that fails to parse. There is no count at
 * which it breaks loudly, which is why `tests/host/test_slot_state_roundtrip.sh`
 * exists and was written before the count moved.
 *
 * A PARTIAL array is deliberately APPLIED rather than rejected: a config written
 * by an older build with fewer slots restores the slots it has and leaves the
 * rest at their defaults, which is exactly the migration behaviour we want. */
static int parse_float_array(const char *pos, float *out, int max)
{
    if (!pos || *pos != '[') return 0;
    const char *p = pos + 1;
    int n = 0;
    while (n < max) {
        char *end = NULL;
        float v = strtof(p, &end);
        if (end == p) break;              /* no number here — done */
        out[n++] = v;
        p = end;
        while (*p == ' ' || *p == '\t') p++;
        if (*p != ',') break;
        p++;
    }
    return n;
}

static int parse_int_array(const char *pos, int *out, int max)
{
    if (!pos || *pos != '[') return 0;
    const char *p = pos + 1;
    int n = 0;
    while (n < max) {
        char *end = NULL;
        long v = strtol(p, &end, 10);
        if (end == p) break;
        out[n++] = (int)v;
        p = end;
        while (*p == ' ' || *p == '\t') p++;
        if (*p != ',') break;
        p++;
    }
    return n;
}

static float clampf(float v, float lo, float hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

/* ============================================================================
 * shadow_save_state - Write slot state to shadow_chain_config.json
 * ============================================================================ */

void shadow_save_state(void)
{
    /* Read existing config to preserve fields written by shadow_ui.js */
    FILE *f = fopen(SHADOW_CONFIG_PATH, "r");
    char patches_buf[4096] = "";
    char master_fx[256] = "";
    char master_fx_path[256] = "";
    char master_fx_chain_buf[2048] = "";
    int overlay_knobs_mode = -1;
    int resample_bridge_mode = -1;
    int link_audio_routing_saved = -1;

    if (f) {
        fseek(f, 0, SEEK_END);
        long size = ftell(f);
        fseek(f, 0, SEEK_SET);

        if (size > 0 && size < 65536) {
            char *json = malloc(size + 1);
            if (json) {
                size_t nread = fread(json, 1, size, f);
                json[nread] = '\0';

                /* Extract patches array (preserve as-is) */
                char *patches_start = strstr(json, "\"patches\":");
                if (patches_start) {
                    char *arr_start = strchr(patches_start, '[');
                    if (arr_start) {
                        int depth = 1;
                        char *arr_end = arr_start + 1;
                        while (*arr_end && depth > 0) {
                            if (*arr_end == '[') depth++;
                            else if (*arr_end == ']') depth--;
                            arr_end++;
                        }
                        int len = arr_end - arr_start;
                        if (len < (int)sizeof(patches_buf) - 1) {
                            strncpy(patches_buf, arr_start, len);
                            patches_buf[len] = '\0';
                        }
                    }
                }

                /* Extract master_fx string (legacy single-slot) */
                char *mfx = strstr(json, "\"master_fx\":");
                if (mfx) {
                    mfx = strchr(mfx, ':');
                    if (mfx) {
                        mfx++;
                        while (*mfx == ' ' || *mfx == '"') mfx++;
                        char *end = mfx;
                        while (*end && *end != '"' && *end != ',' && *end != '\n') end++;
                        int len = end - mfx;
                        if (len < (int)sizeof(master_fx) - 1) {
                            strncpy(master_fx, mfx, len);
                            master_fx[len] = '\0';
                        }
                    }
                }

                /* Extract master_fx_path string */
                char *mfxp = strstr(json, "\"master_fx_path\":");
                if (mfxp) {
                    mfxp = strchr(mfxp, ':');
                    if (mfxp) {
                        mfxp++;
                        while (*mfxp == ' ' || *mfxp == '"') mfxp++;
                        char *end = mfxp;
                        while (*end && *end != '"' && *end != ',' && *end != '\n') end++;
                        int len = end - mfxp;
                        if (len < (int)sizeof(master_fx_path) - 1) {
                            strncpy(master_fx_path, mfxp, len);
                            master_fx_path[len] = '\0';
                        }
                    }
                }

                /* Extract master_fx_chain object (written by shadow_ui.js) */
                char *mfc = strstr(json, "\"master_fx_chain\":");
                if (mfc) {
                    char *obj_start = strchr(mfc, '{');
                    if (obj_start) {
                        int depth = 1;
                        char *obj_end = obj_start + 1;
                        while (*obj_end && depth > 0) {
                            if (*obj_end == '{') depth++;
                            else if (*obj_end == '}') depth--;
                            obj_end++;
                        }
                        int len = obj_end - obj_start;
                        if (len < (int)sizeof(master_fx_chain_buf) - 1) {
                            strncpy(master_fx_chain_buf, obj_start, len);
                            master_fx_chain_buf[len] = '\0';
                        }
                    }
                }

                /* Extract overlay_knobs_mode integer */
                char *okm = strstr(json, "\"overlay_knobs_mode\":");
                if (okm) {
                    okm = strchr(okm, ':');
                    if (okm) {
                        okm++;
                        while (*okm == ' ') okm++;
                        overlay_knobs_mode = atoi(okm);
                    }
                }

                /* Extract resample_bridge_mode integer */
                char *rbm = strstr(json, "\"resample_bridge_mode\":");
                if (rbm) {
                    rbm = strchr(rbm, ':');
                    if (rbm) {
                        rbm++;
                        while (*rbm == ' ') rbm++;
                        resample_bridge_mode = atoi(rbm);
                    }
                }

                /* Extract link_audio_routing boolean */
                char *lar = strstr(json, "\"link_audio_routing\":");
                if (lar) {
                    lar = strchr(lar, ':');
                    if (lar) {
                        lar++;
                        while (*lar == ' ') lar++;
                        link_audio_routing_saved = (strncmp(lar, "true", 4) == 0) ? 1 : 0;
                    }
                }

                free(json);
            }
        }
        fclose(f);
    }

    /* Write complete config file */
    f = fopen(SHADOW_CONFIG_PATH, "w");
    if (!f) {
        if (host_log) host_log("shadow_save_state: failed to open for writing");
        return;
    }

    fprintf(f, "{\n");
    if (patches_buf[0]) {
        fprintf(f, "  \"patches\": %s,\n", patches_buf);
    }
    fprintf(f, "  \"master_fx\": \"%s\",\n", master_fx);
    if (master_fx_path[0]) {
        fprintf(f, "  \"master_fx_path\": \"%s\",\n", master_fx_path);
    }
    if (master_fx_chain_buf[0]) {
        fprintf(f, "  \"master_fx_chain\": %s,\n", master_fx_chain_buf);
    }
    if (overlay_knobs_mode >= 0) {
        fprintf(f, "  \"overlay_knobs_mode\": %d,\n", overlay_knobs_mode);
    }
    if (resample_bridge_mode >= 0) {
        fprintf(f, "  \"resample_bridge_mode\": %d,\n", resample_bridge_mode);
    }
    if (link_audio_routing_saved >= 0) {
        fprintf(f, "  \"link_audio_routing\": %s,\n", link_audio_routing_saved ? "true" : "false");
    }
    /* Every per-slot array is emitted by this one shape, over the slot count,
     * rather than unrolled with an explicit deref per slot. The unrolled form
     * was correct only while the count was 4 and silently dropped the rest the
     * moment it moved — and its reader could not tell the difference. */
#define EMIT_SLOT_ARRAY(key, fmt, member) do {                              \
        fprintf(f, "  \"" key "\": [");                                      \
        for (int _i = 0; _i < SHADOW_CHAIN_INSTANCES; _i++)                 \
            fprintf(f, "%s" fmt, _i ? ", " : "", host_chain_slots[_i].member); \
        fprintf(f, "],\n");                                                 \
    } while (0)

    /* Volume is always the real user-set level; mute/solo are separate flags */
    EMIT_SLOT_ARRAY("slot_volumes", "%.3f", volume);
    /* Sound-generator level, separate from the bus fader above. Written
     * unconditionally; readers that predate this key default it to unity. */
    EMIT_SLOT_ARRAY("slot_synth_volumes", "%.3f", synth_volume);
    EMIT_SLOT_ARRAY("slot_send_a", "%.3f", send_a);
    EMIT_SLOT_ARRAY("slot_send_b", "%.3f", send_b);
    EMIT_SLOT_ARRAY("slot_channels", "%d", channel);
    EMIT_SLOT_ARRAY("slot_forward_channels", "%d", forward_channel);
    EMIT_SLOT_ARRAY("slot_transpose", "%d", transpose);
    EMIT_SLOT_ARRAY("slot_muted", "%d", muted);
    EMIT_SLOT_ARRAY("slot_soloed", "%d", soloed);
    fprintf(f, "  \"send_return_level\": [%.3f, %.3f],\n",
            shadow_send_return_level[0],
            shadow_send_return_level[1]);
    fprintf(f, "  \"send_a_to_b\": %.3f\n", shadow_send_a_to_b_level);
    fprintf(f, "}\n");
    fclose(f);
    chown_to_ableton(SHADOW_CONFIG_PATH);

    char msg[320];
    /* One summary line, not a per-slot dump: the log is read to confirm a save
     * happened, and an 8-slot unrolled format string is a maintenance trap of
     * exactly the kind this commit is removing. */
    snprintf(msg, sizeof(msg), "Saved %d slots (vol/sends/channels/mute/solo)",
             SHADOW_CHAIN_INSTANCES);
    if (host_log) host_log(msg);
#undef EMIT_SLOT_ARRAY
}

/* ============================================================================
 * shadow_load_state - Read slot state from shadow_chain_config.json
 * ============================================================================ */

void shadow_load_state(void)
{
    FILE *f = fopen(SHADOW_CONFIG_PATH, "r");
    if (!f) {
        return;
    }

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    if (size <= 0 || size > 8192) {
        fclose(f);
        return;
    }

    char *json = malloc(size + 1);
    if (!json) {
        fclose(f);
        return;
    }

    size_t nread = fread(json, 1, size, f);
    json[nread] = '\0';
    fclose(f);

    /* ---- PER-SLOT SETTINGS: fallback only -----------------------------
     * Slot settings belong to the SET, not the install. This global file is
     * written on a different trigger entirely (mute/solo toggles, dbus, clean
     * shutdown), and it used to be applied here AFTER the per-set config had
     * already been restored — so an install-wide value from some earlier
     * session silently replaced the one the current set had just loaded, and a
     * per-set edit appeared not to stick. It is now consulted only when the set
     * brought no config of its own (a brand-new set, or one saved before a
     * field existed), where it is a sensible default rather than an override. */
    if (!shadow_per_set_config_loaded) {
    /* Parse slot_volumes array */
    const char *key = "\"slot_volumes\":";
    char *pos = strstr(json, key);
    if (pos) {
        pos = strchr(pos, '[');
        if (pos) {
            float v[SHADOW_CHAIN_INSTANCES];
            int n = parse_float_array(pos, v, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++)
                host_chain_slots[i].volume = clampf(v[i], 0.0f, 4.0f);
            if (n) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Loaded %d slot volumes", n);
                if (host_log) host_log(msg);
            }
        }
    }

    /* Parse slot_synth_volumes array. ABSENCE IS NORMAL — state files written
     * before this key existed simply leave the initialised unity value, so an
     * older config loads with the sound generator at full and only the bus
     * fader restored, exactly as it behaved before. */
    {
        const char *skey = "\"slot_synth_volumes\":";
        char *spos = strstr(json, skey);
        if (spos) {
            spos = strchr(spos, '[');
            if (spos) {
                float sv[SHADOW_CHAIN_INSTANCES];
                int n = parse_float_array(spos, sv, SHADOW_CHAIN_INSTANCES);
                for (int i = 0; i < n; i++)
                    host_chain_slots[i].synth_volume = clampf(sv[i], 0.0f, 4.0f);
            }
        }
    }

    /* Parse slot_send_a array */
    const char *sa_key = "\"slot_send_a\":";
    char *sa_pos = strstr(json, sa_key);
    if (sa_pos) {
        sa_pos = strchr(sa_pos, '[');
        if (sa_pos) {
            float sv[SHADOW_CHAIN_INSTANCES];
            int n = parse_float_array(sa_pos, sv, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++)
                host_chain_slots[i].send_a = clampf(sv[i], 0.0f, 1.0f);
        }
    }

    /* Parse slot_send_b array */
    const char *sb_key = "\"slot_send_b\":";
    char *sb_pos = strstr(json, sb_key);
    if (sb_pos) {
        sb_pos = strchr(sb_pos, '[');
        if (sb_pos) {
            float sv[SHADOW_CHAIN_INSTANCES];
            int n = parse_float_array(sb_pos, sv, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++)
                host_chain_slots[i].send_b = clampf(sv[i], 0.0f, 1.0f);
        }
    }

    /* Send return levels are ALSO stored per-set, in the active set's
     * send_fx_meta.json, and restoreSendFxFromFiles() applies those at boot
     * (shadow_ui.js:15250). This copy is therefore a FALLBACK for a set with no
     * config of its own, which is why it sits inside the guard above. Two
     * stores for one value is the shape that caused the slot-settings bug, so
     * keep the precedence explicit: per-set wins, this is only the default. */
    /* Parse send_return_level array (missing key → leaves the 1.0 default) */
    const char *srl_key = "\"send_return_level\":";
    char *srl_pos = strstr(json, srl_key);
    if (srl_pos) {
        srl_pos = strchr(srl_pos, '[');
        if (srl_pos) {
            float r0, r1;
            if (sscanf(srl_pos, "[%f, %f]", &r0, &r1) == 2) {
                if (r0 < 0.0f) r0 = 0.0f;
                if (r1 < 0.0f) r1 = 0.0f;
                shadow_send_return_level[0] = r0;
                shadow_send_return_level[1] = r1;
            }
        }
    }

    /* Parse send_a_to_b (missing key → leaves the 0.0 default) */
    const char *satb_key = "\"send_a_to_b\":";
    char *satb_pos = strstr(json, satb_key);
    if (satb_pos) {
        float v;
        if (sscanf(satb_pos + strlen(satb_key), " %f", &v) == 1) {
            if (v < 0.0f) v = 0.0f;
            if (v > 1.0f) v = 1.0f;
            shadow_send_a_to_b_level = v;
        }
    }

    /* Parse slot_channels (receive channel) array */
    const char *ch_key = "\"slot_channels\":";
    char *ch_pos = strstr(json, ch_key);
    if (ch_pos) {
        ch_pos = strchr(ch_pos, '[');
        if (ch_pos) {
            int c[SHADOW_CHAIN_INSTANCES];
            int n = parse_int_array(ch_pos, c, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++) host_chain_slots[i].channel = c[i];
            if (n) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Loaded %d slot channels", n);
                if (host_log) host_log(msg);
            }
        }
    }

    /* Parse slot_forward_channels array */
    const char *fwd_key = "\"slot_forward_channels\":";
    char *fwd_pos = strstr(json, fwd_key);
    if (fwd_pos) {
        fwd_pos = strchr(fwd_pos, '[');
        if (fwd_pos) {
            int fw[SHADOW_CHAIN_INSTANCES];
            int n = parse_int_array(fwd_pos, fw, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++) host_chain_slots[i].forward_channel = fw[i];
            if (n) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Loaded %d slot fwd channels", n);
                if (host_log) host_log(msg);
            }
        }
    }

    /* Parse slot_transpose array */
    const char *tr_key = "\"slot_transpose\":";
    char *tr_pos = strstr(json, tr_key);
    if (tr_pos) {
        tr_pos = strchr(tr_pos, '[');
        if (tr_pos) {
            int tr[SHADOW_CHAIN_INSTANCES];
            int n = parse_int_array(tr_pos, tr, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++) {
                int v = tr[i];
                if (v < -12) v = -12;
                if (v > 12) v = 12;
                host_chain_slots[i].transpose = v;
            }
            if (n) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Loaded %d slot transpose", n);
                if (host_log) host_log(msg);
            }
        }
    }

    /* Parse slot_muted array */
    const char *muted_key = "\"slot_muted\":";
    char *muted_pos = strstr(json, muted_key);
    if (muted_pos) {
        muted_pos = strchr(muted_pos, '[');
        if (muted_pos) {
            int m[SHADOW_CHAIN_INSTANCES];
            int n = parse_int_array(muted_pos, m, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++) host_chain_slots[i].muted = m[i];
            if (n) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Loaded %d slot muted", n);
                if (host_log) host_log(msg);
            }
        }
    }

    /* Parse slot_soloed array */
    const char *soloed_key = "\"slot_soloed\":";
    char *soloed_pos = strstr(json, soloed_key);
    *host_solo_count = 0;
    if (soloed_pos) {
        soloed_pos = strchr(soloed_pos, '[');
        if (soloed_pos) {
            int sol[SHADOW_CHAIN_INSTANCES];
            int n = parse_int_array(soloed_pos, sol, SHADOW_CHAIN_INSTANCES);
            for (int i = 0; i < n; i++) {
                host_chain_slots[i].soloed = sol[i];
                if (sol[i]) (*host_solo_count)++;
            }
            if (n) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Loaded %d slot soloed", n);
                if (host_log) host_log(msg);
            }
        }
    }

    }  /* end per-slot fallback */

    free(json);

    /* One-time heal for the removed D-Bus mute/solo auto-correct.
     * That code could spuriously mute/solo a slot when Move announced a drum
     * kit/pad name ending in "muted"/"soloed"; the stray state was saved to
     * shadow_chain_config.json and restored every boot, silencing the slot's
     * audio across all projects. Clear any persisted mute/solo exactly once
     * (version-stamped flag) so users already stuck are healed by updating,
     * while deliberate mute/solo set on later boots is not wiped. */
    {
        static const char reset_flag[] =
            SCHWUNG_INSTALL_DIR "/mute_solo_reset_v1_done";
        if (access(reset_flag, F_OK) != 0) {
            int had_state = 0;
            for (int i = 0; i < SHADOW_CHAIN_INSTANCES; i++) {
                if (host_chain_slots[i].muted || host_chain_slots[i].soloed)
                    had_state = 1;
                host_chain_slots[i].muted = 0;
                host_chain_slots[i].soloed = 0;
            }
            *host_solo_count = 0;
            shadow_save_state();  /* persist cleared state so it survives reboot */
            FILE *flag = fopen(reset_flag, "w");
            if (flag) {
                fputs("1\n", flag);
                fclose(flag);
                chown_to_ableton(reset_flag);
            }
            if (host_log)
                host_log(had_state
                    ? "One-time mute/solo reset: cleared persisted slot mute/solo"
                    : "One-time mute/solo reset: none persisted, flag set");
        }
    }
}
