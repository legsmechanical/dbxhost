package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The manager's param mailbox is its OWN file, created on first use at the
// size the shim maps, and removed when idle — so with no remote page open it
// does not exist (and Move, which locks all its memory, holds nothing for it).
// It used to share shadow_ui's mailbox; two producers lost requests and read
// each other's answers.
func TestManagerMailboxIsClaimedOnUseAndReleasedWhenIdle(t *testing.T) {
	path := filepath.Join(t.TempDir(), "web-param")
	s := &ShmParams{privPath: path}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("mailbox exists before any use")
	}
	s.mu.Lock()
	err := s.claimLocked()
	s.mu.Unlock()
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	st, err := os.Stat(path)
	if err != nil {
		t.Fatalf("claim made no file: %v", err)
	}
	if st.Size() != shmPrivMailboxSize {
		t.Fatalf("file is %d bytes; the shim refuses less than %d", st.Size(), shmPrivMailboxSize)
	}

	// Not idle yet: kept.
	if s.releaseIfIdle(time.Now()) {
		t.Fatalf("released while in use")
	}
	// Mid-request: kept, however old.
	s.data[paramOffRequestType] = 2
	if s.releaseIfIdle(time.Now().Add(time.Hour)) {
		t.Fatalf("released with a request in flight")
	}
	s.data[paramOffRequestType] = 0
	// Idle: released, file gone.
	if !s.releaseIfIdle(time.Now().Add(mailboxIdleRelease + time.Second)) {
		t.Fatalf("not released when idle")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("file left behind after release")
	}
	// Next use claims it again.
	s.mu.Lock()
	err = s.claimLocked()
	s.mu.Unlock()
	if err != nil || s.data == nil {
		t.Fatalf("reclaim: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("reclaim made no file")
	}
	s.releaseIfIdle(time.Now().Add(time.Hour))
}

// A left-over mailbox (a manager that crashed mid-request) is reset on claim:
// this process is its only producer, so a stale request flag would only make
// the first read wait for an answer nobody asked for.
func TestManagerMailboxResetsALeftOverRequest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "web-param")
	stale := make([]byte, shmPrivMailboxSize)
	stale[paramOffRequestType] = 2
	stale[paramOffResponseReady] = 1
	if err := os.WriteFile(path, stale, 0o666); err != nil {
		t.Fatal(err)
	}
	s := &ShmParams{privPath: path}
	s.mu.Lock()
	err := s.claimLocked()
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if s.data[paramOffRequestType] != 0 || s.data[paramOffResponseReady] != 0 {
		t.Fatalf("stale request flags kept: type=%d ready=%d", s.data[paramOffRequestType], s.data[paramOffResponseReady])
	}
	s.releaseIfIdle(time.Now().Add(time.Hour))
}

// The read counters tell a clean read from one whose answer may be someone
// else's: raced = a new request was posted before the copy ended, clobbered =
// a new response was published.
func TestMailboxReadStatsClassifyACopy(t *testing.T) {
	s := &ShmParams{data: make([]byte, shmParamSize)}
	put := func(off int, v uint32) { binary.LittleEndian.PutUint32(s.data[off:], v) }

	put(paramOffRequestID, 7)
	put(paramOffResponseID, 7)
	s.noteCopied(7)
	put(paramOffRequestID, 8)
	s.noteCopied(7)
	put(paramOffResponseID, 8)
	s.noteCopied(7)

	c := s.stats.snapshot()
	if c[0] != 3 || c[4] != 1 || c[5] != 1 {
		t.Fatalf("total/raced/clobbered = %d/%d/%d, want 3/1/1", c[0], c[4], c[5])
	}
}
