package main

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// The path rule is the half that can be tested without touching /dev/shm.
func TestIsSetLibraryPath(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{setLibraryDir, true},
		{setLibraryDir + "/a1b2-uuid", true},
		{setLibraryDir + "/a1b2-uuid/dAVEBOx/host/slot_0.json", true},
		{"/data/UserData/UserLibrary", false},
		{"/data/UserData/UserLibrary/Samples", false},
		// A sibling whose name merely starts with the same characters must not
		// be caught — that is what the trailing separator is for.
		{"/data/UserData/UserLibrary/SetsBackup", false},
		{"/data/UserData/UserLibrary/SetsBackup/x", false},
		// Cleaned before comparison, so an unnormalised path cannot slip past.
		{"/data/UserData/UserLibrary/Sets/", true},
		{"/data/UserData/UserLibrary/./Sets/x", true},
	}
	for _, c := range cases {
		if got := isSetLibraryPath(c.path); got != c.want {
			t.Errorf("isSetLibraryPath(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

// The liveness probe, driven through a real lock file. Its fallbacks are the
// interesting part: they must fail toward "a session is live", because the
// wrong answer in that direction only hides files, while the other exposes a
// running session's projects to rename and delete.
func TestStandaloneSessionActive(t *testing.T) {
	dir := t.TempDir()
	lock := filepath.Join(dir, "session.lock")

	orig := sessionLockPathForTest
	sessionLockPathForTest = lock
	t.Cleanup(func() { sessionLockPathForTest = orig })

	reset := func() {
		sessionCacheMu.Lock()
		sessionCacheTime = time.Time{}
		sessionCacheMu.Unlock()
	}

	// No lock file at all: no session.
	reset()
	if standaloneSessionActive() {
		t.Error("no lock file should mean no session")
	}

	// A lock naming THIS process, which is certainly alive. Needs /proc, so it
	// only runs where /proc exists — the device and CI are Linux; a dev machine
	// may not be, and a test that fails there teaches people to ignore it.
	if _, err := os.Stat("/proc/self"); err == nil {
		reset()
		if err := os.WriteFile(lock, []byte(strconv.Itoa(os.Getpid())+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		if !standaloneSessionActive() {
			t.Error("a lock naming a live pid should mean a session is live")
		}
	} else {
		t.Log("no /proc — skipping the live-pid case")
	}

	// A lock left behind by a crashed session: readable payload, dead pid.
	// This must NOT read as live, or the library stays hidden until reboot.
	reset()
	if err := os.WriteFile(lock, []byte("2147483646\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if standaloneSessionActive() {
		t.Error("a stale lock from a crashed session must not count as live")
	}

	// Garbled payload: assume live.
	reset()
	if err := os.WriteFile(lock, []byte("not-a-pid"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !standaloneSessionActive() {
		t.Error("a garbled payload must be assumed live — the safe direction")
	}
}
