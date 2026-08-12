package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// A standalone session takes over the device and swaps its own project library
// over the set library path. While that is true, the folders under it are not
// the user's sets — they are the running session's projects, whose lifecycle
// the session owns through its own UI, with one of them currently open.
//
// This file is the manager's copy of the question the on-device browsers
// already ask ("should I be showing this path right now"). It is a copy rather
// than a shared helper because the manager is a separate process in a different
// language; the two must agree, so both read the same lock file and apply the
// same rule. The JS side lives in src/shared/session_state.mjs.
const (
	// Held by the session's supervisor for the life of the session, payload is
	// its pid. Must match DBX_SESSION_LOCK in standalone/config.sh.
	sessionLockPath = "/dev/shm/.dbxhost-session.lock"

	// The set library, which a live session has swapped for its own projects.
	setLibraryDir = "/data/UserData/UserLibrary/Sets"
)

// Indirection so the probe can be driven against a real file in tests. Never
// reassigned outside them.
var sessionLockPathForTest = sessionLockPath

var (
	sessionCacheMu   sync.Mutex
	sessionCacheVal  bool
	sessionCacheTime time.Time
)

// sessionCacheTTL keeps a directory listing from re-probing per entry. Short
// enough that the library reappears promptly once a session ends.
const sessionCacheTTL = 2 * time.Second

// standaloneSessionActive reports whether a standalone session is running.
//
// Liveness, not a marker: a crashed session leaves the lock file behind, and
// treating that as live would hide the library until the next reboot. An
// unreadable or garbled payload counts as LIVE — of the two wrong answers, the
// one that hides files about to reappear is better than the one that exposes a
// running session's projects to rename and delete.
func standaloneSessionActive() bool {
	sessionCacheMu.Lock()
	defer sessionCacheMu.Unlock()
	if !sessionCacheTime.IsZero() && time.Since(sessionCacheTime) < sessionCacheTTL {
		return sessionCacheVal
	}

	live := false
	if payload, err := os.ReadFile(sessionLockPathForTest); err == nil {
		pid, convErr := strconv.Atoi(strings.TrimSpace(string(payload)))
		if convErr != nil || pid <= 0 {
			live = true // garbled — assume live
		} else if _, statErr := os.Stat("/proc/" + strconv.Itoa(pid)); statErr == nil {
			live = true
		}
	}

	sessionCacheVal = live
	sessionCacheTime = time.Now()
	return live
}

// isSetLibraryPath reports whether path IS the set library or sits inside it.
// Compares on a trailing separator so a sibling that merely starts with the
// same characters ("SetsBackup") is not caught by it.
func isSetLibraryPath(path string) bool {
	clean := filepath.Clean(path)
	return clean == setLibraryDir || strings.HasPrefix(clean, setLibraryDir+string(filepath.Separator))
}

// sessionOwnsPath is the one question every file handler asks before touching a
// path: is this off-limits right now? Off-limits only DURING a session —
// outside one the set library is the user's own set list.
func sessionOwnsPath(path string) bool {
	return isSetLibraryPath(path) && standaloneSessionActive()
}
