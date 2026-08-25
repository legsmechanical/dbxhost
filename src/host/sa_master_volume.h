/* ---- the session's own master volume ----------------------------------------
 *
 * ⚠⚠ Move's Settings.json cannot carry it. Measured on device 2026-08-25: a
 * session sat at -19.9 dB for an hour and the file still read -70.0 — the value
 * it had when that session started. The shim maps -70 dB to linear 0.0, so
 * every launch came up SILENT: "master volume always at zero on load, wherever
 * it was left" (Josh). Whatever the user did in-session was written nowhere.
 *
 * So the session remembers its own, exactly as set-swap.sh remembers the
 * session's project index beside the user's native one. Stock's volume stays
 * whatever stock left in Settings.json — that file is read once, as the seed
 * for a device that has never run a session, and never written.
 *
 * ⚠ Stored from the display-capture path (the only place the value changes):
 * ONE pwrite of a fixed, pre-formatted record onto a pre-opened fd — no
 * open/truncate per turn and no allocation. That site already rate-limits
 * itself (a >0.003 delta, a 12-frame cooldown). Never called from the audio
 * callback.
 */
#ifndef SA_MASTER_VOLUME_H
#define SA_MASTER_VOLUME_H

/* Open (creating if needed) the backing file. Call once at init; store() is a
 * no-op until it succeeds, so a read-only tree degrades to today's behaviour
 * rather than failing a launch. */
void sa_master_volume_open(void);

/* Persist a linear amplitude (0.0-1.0). */
void sa_master_volume_store(float linear);

/* Returns 1 and fills *out when the session has a stored volume of its own,
 * 0 when it does not (or the stored value is unusable). */
int sa_master_volume_load(float *out);

/* Test seam ONLY — the shim never calls this, so on device the path is the
 * compiled-in one and nothing can steer it. */
void sa_master_volume_set_path_for_test(const char *path);

#endif /* SA_MASTER_VOLUME_H */
