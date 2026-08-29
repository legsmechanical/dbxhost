/* shadow_process.c - Shadow UI and Link subscriber process management
 * Extracted from schwung_shim.c for maintainability. */

#define _GNU_SOURCE  /* CPU_ZERO/CPU_SET/sched_setaffinity */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <unistd.h>
#include <signal.h>
#include <dirent.h>
#include <errno.h>
#include <pthread.h>
#include <sys/wait.h>
#include <sched.h>
#include <time.h>
#include "shadow_process.h"
#include "shadow_resample.h"
#include "shadow_link_audio.h"
#include "unified_log.h"

#include "host/schwung_paths.h"
/* ============================================================================
 * Static host callbacks
 * ============================================================================ */

static process_host_t host;
static int process_initialized = 0;

/* ============================================================================
 * Global definitions
 * ============================================================================ */

volatile int link_sub_started = 0;
volatile pid_t link_sub_pid = -1;
volatile uint32_t link_sub_ever_received = 0;
volatile int link_sub_restart_count = 0;

/* ============================================================================
 * Internal state
 * ============================================================================ */

/* Shadow UI */
static int shadow_ui_started = 0;
static pid_t shadow_ui_pid = -1;
static const char *shadow_ui_pid_path = SCHWUNG_INSTALL_DIR "/shadow_ui.pid";

/* Link subscriber monitor */
static volatile int link_sub_monitor_started = 0;
static volatile int link_sub_monitor_running = 0;
static pthread_t link_sub_monitor_thread;
static const char *link_sub_pid_path = SCHWUNG_INSTALL_DIR "/link_sub.pid";

/* Recovery constants */
#define LINK_SUB_STALE_THRESHOLD_MS 5000
#define LINK_SUB_WAIT_MS            3000
#define LINK_SUB_COOLDOWN_MS        10000
#define LINK_SUB_ALIVE_CHECK_MS     5000
#define LINK_SUB_MONITOR_POLL_US    100000

/* ============================================================================
 * Init
 * ============================================================================ */

void process_init(const process_host_t *h) {
    host = *h;
    shadow_ui_started = 0;
    shadow_ui_pid = -1;
    link_sub_started = 0;
    link_sub_pid = -1;
    link_sub_ever_received = 0;
    link_sub_restart_count = 0;
    link_sub_monitor_started = 0;
    link_sub_monitor_running = 0;
    process_initialized = 1;
}

/* ============================================================================
 * Shadow UI process management
 * ============================================================================ */

/* Is this pid a process THIS build started?
 *
 * `comm` cannot answer that: two installs run binaries with the same name, so a
 * stock-tree sidecar looks identical to ours. /proc/<pid>/exe resolves to the
 * actual binary, and only our install dir is ours.
 *
 * A pid we cannot identify (readlink fails — a foreign owner, or the process
 * died mid-check) is deliberately NOT ours: adopting a sidecar we cannot verify
 * is how a session ends up with no sidecar at all, which is silent. Our own
 * children run as the same user, so the readlink succeeds for them.
 *
 * The bug this exists to prevent (hardware, 2026-08-13): a stock link-subscriber
 * started at boot survived into a standalone session — launch.sh's kill list did
 * not name it — and the session's shim, seeing a live pid in the pid file,
 * adopted it and never started its own. The stock subscriber publishes into the
 * STOCK shm namespace, so `<prefix>-link-in` never appeared, Move's audio never
 * reached the mixer, and every Move FX bus control (volume, mute, solo) was
 * inert with nothing in any log to say why. */
static int pid_is_ours(pid_t pid) {
    char path[64], exe[PATH_MAX];
    snprintf(path, sizeof(path), "/proc/%d/exe", (int)pid);
    ssize_t n = readlink(path, exe, sizeof(exe) - 1);
    if (n <= 0) return 0;
    exe[n] = '\0';
    return strncmp(exe, SCHWUNG_INSTALL_DIR "/", strlen(SCHWUNG_INSTALL_DIR "/")) == 0;
}

static int shadow_ui_pid_alive(pid_t pid) {
    if (pid <= 0) return 0;
    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/stat", (int)pid);
    FILE *f = fopen(path, "r");
    if (!f) return 0;
    int rpid = 0;
    char comm[64] = {0};
    char state = 0;
    int matched = fscanf(f, "%d %63s %c", &rpid, comm, &state);
    fclose(f);
    if (matched != 3) return 0;
    if (rpid != (int)pid) return 0;
    if (state == 'Z') return 0;
    if (!strstr(comm, "shadow_ui")) return 0;
    /* Same name is not the same process — see pid_is_ours. A stale pid naming
     * the OTHER install's shadow_ui would leave this session with none. */
    if (!pid_is_ours(pid)) return 0;
    return 1;
}

static pid_t shadow_ui_read_pid(void) {
    FILE *pid_file = fopen(shadow_ui_pid_path, "r");
    if (!pid_file) return -1;
    long pid = -1;
    if (fscanf(pid_file, "%ld", &pid) != 1) {
        pid = -1;
    }
    fclose(pid_file);
    return (pid_t)pid;
}

static void shadow_ui_refresh_pid(void) {
    if (shadow_ui_pid_alive(shadow_ui_pid)) {
        shadow_ui_started = 1;
        return;
    }
    pid_t pid = shadow_ui_read_pid();
    if (shadow_ui_pid_alive(pid)) {
        shadow_ui_pid = pid;
        shadow_ui_started = 1;
        return;
    }
    if (pid > 0) {
        unlink(shadow_ui_pid_path);
    }
    shadow_ui_pid = -1;
    shadow_ui_started = 0;
}

static void shadow_ui_reap(void) {
    if (shadow_ui_pid <= 0) return;
    int status = 0;
    pid_t res = waitpid(shadow_ui_pid, &status, WNOHANG);
    /* ECHILD = not our child any more (already reaped elsewhere) — either way
     * the process is gone and the cached pid must not keep looking "started". */
    if (res == shadow_ui_pid || (res < 0 && errno == ECHILD)) {
        shadow_ui_pid = -1;
        shadow_ui_started = 0;
    }
}

/* Relaunch backoff. shadow_ui is respawned from the SPI path, so a child that
 * dies immediately on startup (bad JS, missing module) would otherwise be
 * forked ~1.4x/sec forever. After SHADOW_UI_MAX_RAPID_RELAUNCH consecutive
 * deaths inside SHADOW_UI_RAPID_WINDOW_SEC we stop trying; any launch that
 * survives the window resets the counter, and an explicit user request
 * (shortcut press) clears it via launch_shadow_ui_reset_backoff(). */
#define SHADOW_UI_RAPID_WINDOW_SEC   5
#define SHADOW_UI_MAX_RAPID_RELAUNCH 5
static int shadow_ui_rapid_relaunches = 0;
static time_t shadow_ui_last_launch_sec = 0;
static int shadow_ui_backoff_active = 0;

void launch_shadow_ui_reset_backoff(void) {
    shadow_ui_rapid_relaunches = 0;
    shadow_ui_backoff_active = 0;
}

int shadow_ui_relaunch_backoff_active(void) {
    return shadow_ui_backoff_active;
}

void launch_shadow_ui(void) {
    /* Reap BEFORE the started/pid early-out. A dead shadow_ui leaves
     * shadow_ui_started == 1 with a still-nonzero pid, so checking first meant
     * the guard returned before the reap that would have cleared it — the
     * child stayed a zombie and was never respawned until MoveOriginal
     * restarted. waitpid(WNOHANG) is a bare syscall with no file I/O, so it is
     * safe to run on the SPI path every call; shadow_ui_refresh_pid() below
     * reads /proc and stays behind the early-out, off the steady-state path. */
    shadow_ui_reap();
    if (shadow_ui_started && shadow_ui_pid > 0) return;

    /* Gave up relaunching: return on the cheap syscall alone. Everything below
     * touches the filesystem (/proc, the pid file, access()), and this is the
     * SPI path — the give-up state must not pay that cost on every call. */
    if (shadow_ui_backoff_active) return;

    shadow_ui_refresh_pid();
    if (shadow_ui_started && shadow_ui_pid > 0) return;

    /* Count deaths that happen inside the rapid window; a child that outlives
     * it is treated as healthy and clears the counter. */
    struct timespec now_ts;
    clock_gettime(CLOCK_MONOTONIC, &now_ts);
    if (shadow_ui_last_launch_sec != 0 &&
        (now_ts.tv_sec - shadow_ui_last_launch_sec) < SHADOW_UI_RAPID_WINDOW_SEC) {
        shadow_ui_rapid_relaunches++;
    } else {
        shadow_ui_rapid_relaunches = 0;
    }
    if (shadow_ui_rapid_relaunches >= SHADOW_UI_MAX_RAPID_RELAUNCH) {
        /* Deliberately silent: unified_log() is banned here. The state is
         * exposed via shadow_ui_relaunch_backoff_active() for off-path callers. */
        shadow_ui_backoff_active = 1;
        return;
    }

    if (access(SCHWUNG_INSTALL_DIR "/shadow/shadow_ui", X_OK) != 0) {
        return;
    }

    shadow_ui_last_launch_sec = now_ts.tv_sec;
    int pid = fork();
    if (pid < 0) {
        return;
    }
    if (pid == 0) {
        /* Drop inherited SCHED_FIFO from MoveOriginal's audio thread.
         * Without this, shadow_ui and all its children (RNBO, jack_midi_connect,
         * etc.) run at FIFO 70, competing with the SPI driver. */
        struct sched_param sp = { .sched_priority = 0 };
        sched_setscheduler(0, SCHED_OTHER, &sp);
        setsid();
        int fdlimit = (int)sysconf(_SC_OPEN_MAX);
        for (int i = STDERR_FILENO + 1; i < fdlimit; i++) {
            close(i);
        }
        execl(SCHWUNG_INSTALL_DIR "/shadow/shadow_ui", "shadow_ui", (char *)0);
        _exit(1);
    }
    shadow_ui_started = 1;
    shadow_ui_pid = pid;
}

/* ============================================================================
 * Link subscriber process management
 * ============================================================================ */

static int link_sub_pid_alive(pid_t pid) {
    if (pid <= 0) return 0;
    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/stat", (int)pid);
    FILE *f = fopen(path, "r");
    if (!f) return 0;
    int rpid = 0;
    char comm[64] = {0};
    char state = 0;
    int matched = fscanf(f, "%d %63s %c", &rpid, comm, &state);
    fclose(f);
    if (matched != 3) return 0;
    if (rpid != (int)pid) return 0;
    if (state == 'Z') return 0;
    if (!strstr(comm, "link-sub")) return 0;
    /* Same name is not the same process — see pid_is_ours. */
    if (!pid_is_ours(pid)) return 0;
    return 1;
}

static void link_sub_reap(void) {
    if (link_sub_pid <= 0) return;
    int status = 0;
    pid_t res = waitpid(link_sub_pid, &status, WNOHANG);
    if (res == link_sub_pid) {
        link_sub_pid = -1;
        link_sub_started = 0;
    }
}

static pid_t link_sub_read_pid(void) {
    FILE *f = fopen(link_sub_pid_path, "r");
    if (!f) return -1;
    long pid = -1;
    if (fscanf(f, "%ld", &pid) != 1) pid = -1;
    fclose(f);
    return (pid_t)pid;
}

static void link_sub_write_pid(pid_t pid) {
    FILE *f = fopen(link_sub_pid_path, "w");
    if (f) {
        fprintf(f, "%d\n", (int)pid);
        fclose(f);
    }
}

/* Check if another shim process already launched a subscriber (via PID file) */
static void link_sub_refresh_pid(void) {
    if (link_sub_pid_alive(link_sub_pid)) {
        link_sub_started = 1;
        return;
    }
    pid_t pid = link_sub_read_pid();
    if (link_sub_pid_alive(pid)) {
        link_sub_pid = pid;
        link_sub_started = 1;
        return;
    }
    if (pid > 0) {
        unlink(link_sub_pid_path);
    }
    link_sub_pid = -1;
    link_sub_started = 0;
}

void link_sub_kill(void) {
    if (link_sub_pid > 0) {
        kill(link_sub_pid, SIGTERM);
    }
}

static void link_sub_kill_orphans(void) {
    DIR *dp = opendir("/proc");
    if (!dp) return;
    struct dirent *ent;
    pid_t my_pid = getpid();
    while ((ent = readdir(dp)) != NULL) {
        int pid = atoi(ent->d_name);
        if (pid <= 1) continue;
        if (pid == my_pid) continue;
        if (pid == link_sub_pid) continue;

        char path[64];
        snprintf(path, sizeof(path), "/proc/%d/stat", pid);
        FILE *f = fopen(path, "r");
        if (!f) continue;
        int rpid = 0;
        char comm[64] = {0};
        char state = 0;
        int matched = fscanf(f, "%d %63s %c", &rpid, comm, &state);
        fclose(f);
        if (matched != 3) continue;
        if (state == 'Z') continue;
        if (!strstr(comm, "link-sub")) continue;

        unified_log("shim", LOG_LEVEL_INFO,
                    "Killing orphaned link-subscriber pid=%d", pid);
        kill(pid, SIGTERM);
        usleep(50000);
        kill(pid, SIGKILL);
        waitpid(pid, NULL, WNOHANG);
    }
    closedir(dp);
}

void launch_link_subscriber(void) {
    if (link_sub_started && link_sub_pid > 0) return;
    link_sub_reap();
    if (link_sub_started && link_sub_pid > 0) return;

    /* Check if another shim process already owns a running subscriber */
    link_sub_refresh_pid();
    if (link_sub_started && link_sub_pid > 0) {
        unified_log("shim", LOG_LEVEL_INFO,
                    "Link subscriber already running (adopted pid=%d from pidfile)",
                    (int)link_sub_pid);
        return;
    }

    link_sub_kill_orphans();

    /* ⚠ A missing binary here used to `return` in silence, which is the worst
     * possible failure: the caller's monitor loop retries forever and logs
     * "launching subscriber (started=0 pid=-1)" ~10x/second, so it reads like a
     * subscriber that keeps crashing rather than one that was never installed.
     * Link Audio — and everything built on it, including the Move FX buses —
     * then cannot work, with no diagnosis anywhere. Say so, once. */
    const char *sub_path = SCHWUNG_INSTALL_DIR "/link-subscriber";
    if (access(sub_path, X_OK) != 0) {
        static int missing_logged = 0;
        if (!missing_logged) {
            missing_logged = 1;
            unified_log("shim", LOG_LEVEL_ERROR,
                        "Link Audio DISABLED: no executable at %s (errno=%d). "
                        "Link Audio routing, the Move FX buses and Move-track "
                        "processing cannot run until it is installed. It is built "
                        "only when the Link SDK submodule (libs/link) is present.",
                        sub_path, errno);
        }
        return;
    }

    /* (A /tmp/link-tempo write used to live here — nothing reads it; the
     * subscriber persists tempo itself via /data/UserData/schwung/last-tempo.) */

    int pid = fork();
    if (pid < 0) return;
    if (pid == 0) {
        /* Drop inherited SCHED_FIFO 70 from MoveOriginal's audio thread.
         * Without this the sidecar runs at the same RT priority as Move's
         * UI/audio threads and can preempt them on any core. Mirrors the
         * reset launch_shadow_ui does — same bug, same fix. */
        struct sched_param sp = { .sched_priority = 0 };
        sched_setscheduler(0, SCHED_OTHER, &sp);

        /* Pin to cores 0-2, leaving core 3 free for the SPI SCHED_FIFO 90
         * callback. Matches the RNBO pinning from the JACK-glitch fix. */
        cpu_set_t mask;
        CPU_ZERO(&mask);
        CPU_SET(0, &mask);
        CPU_SET(1, &mask);
        CPU_SET(2, &mask);
        sched_setaffinity(0, sizeof(mask), &mask);

        setsid();
        freopen("/dev/null", "w", stdout);
        freopen("/dev/null", "a", stderr);
        int fdlimit = (int)sysconf(_SC_OPEN_MAX);
        for (int i = STDERR_FILENO + 1; i < fdlimit; i++) {
            close(i);
        }
        unsetenv("LD_PRELOAD");
        execl(sub_path, "link-subscriber", (char *)0);
        _exit(1);
    }
    link_sub_started = 1;
    link_sub_pid = pid;
    link_sub_write_pid(pid);
    unified_log("shim", LOG_LEVEL_INFO,
                "Link subscriber launched: pid=%d", pid);
}

/* ============================================================================
 * Link subscriber monitor thread
 * ============================================================================ */

static uint64_t link_sub_now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)(ts.tv_nsec / 1000000ULL);
}

static void *link_sub_monitor_main(void *arg) {
    (void)arg;

    if (!host.link_audio) return NULL;

    uint32_t last_packets = host.link_audio->packets_intercepted;
    uint64_t last_packet_ms = link_sub_now_ms();
    uint64_t cooldown_until_ms = 0;
    uint64_t kill_deadline_ms = 0;
    uint64_t next_alive_check_ms = last_packet_ms + LINK_SUB_ALIVE_CHECK_MS;
    int kill_pending = 0;

    if (last_packets > link_sub_ever_received) {
        link_sub_ever_received = last_packets;
    }

    while (link_sub_monitor_running) {
        uint64_t now_ms = link_sub_now_ms();

        if (!host.link_audio->enabled || !link_audio_routing_enabled) {
            /* When routing is disabled, kill the subscriber so we stop
             * the fork()-heavy restart cycle that causes audio clicks. */
            if (link_sub_started && link_sub_pid > 0) {
                unified_log("shim", LOG_LEVEL_INFO,
                            "Link Audio routing disabled — killing subscriber pid=%d (la_en=%d rt_en=%d)",
                            (int)link_sub_pid,
                            host.link_audio->enabled,
                            link_audio_routing_enabled);
                link_sub_kill();
                usleep(100000);  /* 100ms for clean exit */
                link_sub_reap();
                if (link_sub_pid > 0) {
                    kill(link_sub_pid, SIGKILL);
                    waitpid(link_sub_pid, NULL, WNOHANG);
                }
                link_sub_pid = -1;
                link_sub_started = 0;
                unlink(link_sub_pid_path);
                link_sub_reset_state();
                kill_pending = 0;
            }
            usleep(LINK_SUB_MONITOR_POLL_US);
            continue;
        }

        /* If subscriber not running but routing just got re-enabled, launch it */
        if (!link_sub_started || link_sub_pid <= 0) {
            unified_log("shim", LOG_LEVEL_DEBUG,
                        "Link sub check: started=%d pid=%d, calling reap",
                        link_sub_started, (int)link_sub_pid);
            link_sub_reap();
            if (!link_sub_started || link_sub_pid <= 0) {
                unified_log("shim", LOG_LEVEL_INFO,
                            "Link Audio routing enabled — launching subscriber (started=%d pid=%d)",
                            link_sub_started, (int)link_sub_pid);
                launch_link_subscriber();
                cooldown_until_ms = link_sub_now_ms() + LINK_SUB_COOLDOWN_MS;
                last_packets = host.link_audio->packets_intercepted;
                last_packet_ms = link_sub_now_ms();
                next_alive_check_ms = last_packet_ms + LINK_SUB_ALIVE_CHECK_MS;
                usleep(LINK_SUB_MONITOR_POLL_US);
                continue;
            }
        }

        uint32_t packets_now = host.link_audio->packets_intercepted;
        if (packets_now != last_packets) {
            last_packets = packets_now;
            last_packet_ms = now_ms;
            if (packets_now > link_sub_ever_received) {
                link_sub_ever_received = packets_now;
            }
        }

        if (kill_pending) {
            if (now_ms >= kill_deadline_ms) {
                link_sub_reap();
                pid_t pid = link_sub_pid;
                if (pid > 0) {
                    kill(pid, SIGKILL);
                    waitpid(pid, NULL, 0);
                    link_sub_pid = -1;
                    link_sub_started = 0;
                }
                kill_pending = 0;
                link_sub_reset_state();
                launch_link_subscriber();
                link_sub_restart_count++;
                cooldown_until_ms = now_ms + LINK_SUB_COOLDOWN_MS;
                last_packets = host.link_audio->packets_intercepted;
                last_packet_ms = now_ms;
                next_alive_check_ms = now_ms + LINK_SUB_ALIVE_CHECK_MS;
                unified_log("shim", LOG_LEVEL_INFO,
                            "Link subscriber restarted after stale detection (restart #%d)",
                            (int)link_sub_restart_count);
            }
            usleep(LINK_SUB_MONITOR_POLL_US);
            continue;
        }

        /* Stale detection: only trigger if the subscriber process is NOT alive.
         * With the SDK-based subscriber, packets_intercepted only counts the
         * initial discovery packets — ongoing audio flows directly through the
         * SDK without going through the sendto() hook.  The alive check at the
         * bottom of the loop handles process crashes. */
        if (link_sub_ever_received > 0 &&
            now_ms > last_packet_ms + LINK_SUB_STALE_THRESHOLD_MS &&
            now_ms >= cooldown_until_ms &&
            !link_sub_pid_alive(link_sub_pid)) {
            pid_t pid = link_sub_pid;
            unified_log("shim", LOG_LEVEL_INFO,
                        "Link audio stale detected: la_ever=%u, subscriber pid=%d not alive, restarting",
                        link_sub_ever_received, (int)pid);
            link_sub_kill();
            kill_pending = 1;
            kill_deadline_ms = now_ms + LINK_SUB_WAIT_MS;
            usleep(LINK_SUB_MONITOR_POLL_US);
            continue;
        }

        if (now_ms >= next_alive_check_ms) {
            next_alive_check_ms = now_ms + LINK_SUB_ALIVE_CHECK_MS;
            link_sub_reap();
            pid_t pid = link_sub_pid;
            if (link_sub_started && !link_sub_pid_alive(pid) &&
                now_ms >= cooldown_until_ms) {
                unified_log("shim", LOG_LEVEL_INFO,
                            "Link subscriber died (pid=%d), restarting",
                            (int)pid);
                link_sub_pid = -1;
                link_sub_started = 0;
                link_sub_reset_state();
                launch_link_subscriber();
                link_sub_restart_count++;
                cooldown_until_ms = now_ms + LINK_SUB_COOLDOWN_MS;
                last_packets = host.link_audio->packets_intercepted;
                last_packet_ms = now_ms;
            }
        }

        usleep(LINK_SUB_MONITOR_POLL_US);
    }

    return NULL;
}

void start_link_sub_monitor(void) {
    if (link_sub_monitor_started) return;

    link_sub_monitor_running = 1;
    int rc = pthread_create(&link_sub_monitor_thread, NULL, link_sub_monitor_main, NULL);
    if (rc != 0) {
        link_sub_monitor_running = 0;
        unified_log("shim", LOG_LEVEL_WARN,
                    "Link subscriber monitor start failed: %s",
                    strerror(rc));
        return;
    }

    pthread_detach(link_sub_monitor_thread);
    link_sub_monitor_started = 1;
    unified_log("shim", LOG_LEVEL_INFO, "Link subscriber monitor started");
}

void link_sub_reset_state(void) {
    /* Delegate to link audio module for protocol state reset */
    link_audio_reset_state();
    link_sub_ever_received = 0;
}
