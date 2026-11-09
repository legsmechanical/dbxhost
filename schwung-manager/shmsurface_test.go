package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

// newSurfaceFile makes a ring the way the shim does (shadow_midi_inject_init:
// cursors 0, seq[i] = i) and maps it.
func newSurfaceFile(t *testing.T) (*ShmSurfaceRing, string) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "remote-surface")
	b := make([]byte, surfRingSize)
	for i := 0; i < surfSlots; i++ {
		binary.LittleEndian.PutUint32(b[surfOffSlots+i*surfSlotSize:], uint32(i))
	}
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
	r := OpenShmSurfaceRing(p)
	if r == nil {
		t.Fatal("ring did not open")
	}
	return r, p
}

// pop is the shim's consumer (shadow_midi_inject_peek + _pop).
func pop(r *ShmSurfaceRing) ([4]byte, bool) {
	var out [4]byte
	rp := binary.LittleEndian.Uint32(r.data[4:])
	slot := surfOffSlots + int(rp%surfSlots)*surfSlotSize
	if binary.LittleEndian.Uint32(r.data[slot:]) != rp+1 {
		return out, false
	}
	copy(out[:], r.data[slot+4:slot+8])
	binary.LittleEndian.PutUint32(r.data[slot:], rp+surfSlots)
	binary.LittleEndian.PutUint32(r.data[4:], rp+1)
	return out, true
}

func TestSurfaceRingLayoutMatchesTheShim(t *testing.T) {
	// sizeof(shadow_midi_inject_t): two uint32 cursors + 64 slots of 8 bytes
	if surfRingSize != 520 {
		t.Fatalf("ring size %d, the shim's struct is 520", surfRingSize)
	}
	if shmRemoteSurfacePath != "/dev/shm"+shmPrefix+"remote-surface" {
		t.Fatalf("path %q does not name SHM_REMOTE_SURFACE", shmRemoteSurfacePath)
	}
}

func TestSurfaceRingPushThenTheShimReadsInOrder(t *testing.T) {
	r, _ := newSurfaceFile(t)
	in := [][4]byte{{0x0B, 0xB0, 3, 127}, {0x09, 0x90, 20, 127}, {0x08, 0x80, 20, 0}, {0x0B, 0xB0, 3, 0}}
	for _, p := range in {
		if err := r.Push(p); err != nil {
			t.Fatal(err)
		}
	}
	for i, want := range in {
		got, ok := pop(r)
		if !ok || got != want {
			t.Fatalf("packet %d: got %v %v, want %v", i, got, ok, want)
		}
	}
	if _, ok := pop(r); ok {
		t.Fatal("the shim read a packet nobody pushed")
	}
}

func TestSurfaceRingFullRefusesThenRecoversAcrossLaps(t *testing.T) {
	r, _ := newSurfaceFile(t)
	for i := 0; i < surfSlots; i++ {
		if err := r.Push([4]byte{0x0B, 0xB0, 71, byte(i % 128)}); err != nil {
			t.Fatalf("push %d: %v", i, err)
		}
	}
	if err := r.Push([4]byte{0x0B, 0xB0, 71, 1}); err != errSurfaceFull {
		t.Fatalf("a 65th packet into 64 slots: %v, want full", err)
	}
	for lap := 0; lap < 3; lap++ {
		for i := 0; i < surfSlots; i++ {
			got, ok := pop(r)
			if !ok {
				t.Fatalf("lap %d: slot %d empty", lap, i)
			}
			if lap == 0 && got[3] != byte(i%128) {
				t.Fatalf("lap 0 slot %d: %v", i, got)
			}
			if err := r.Push([4]byte{0x09, 0x90, 68, byte(lap + 1)}); err != nil {
				t.Fatalf("lap %d push %d: %v", lap, i, err)
			}
		}
	}
}

func TestSurfacePacketIsTheMovesOwnSurface(t *testing.T) {
	good := [][]int{
		{0xB0, 71, 1}, {0xB0, 78, 127}, {0x90, 0, 127}, {0x80, 7, 0}, {0x90, 9, 127},
		{0x90, 68, 100}, {0x90, 99, 100}, {0x90, 16, 127}, {0x90, 31, 0},
		{0xB0, 14, 1}, {0xB0, 3, 127}, {0xB0, 49, 127}, {0xB0, 51, 0}, {0xB0, 85, 127}, {0xB0, 119, 127},
	}
	for _, m := range good {
		p, ok := surfacePacket(m)
		if !ok {
			t.Errorf("%v refused", m)
		}
		if p[0] != byte(m[0]>>4) || p[1] != byte(m[0]) {
			t.Errorf("%v: header %v", m, p)
		}
	}
	bad := [][]int{
		{0xB0, 79, 1},   // master knob: Move's own
		{0xB0, 114, 0},  // plug detect
		{0x90, 10, 127}, // no such sensor
		{0x90, 67, 100}, {0x90, 100, 100}, {0x90, 32, 1},
		{0x91, 68, 100}, // channel 2
		{0xA0, 68, 64},  // aftertouch
		{0xE0, 0, 64},
		{0x90, 68, 128}, {0x90, -1, 1},
		{0x90, 68}, {},
	}
	for _, m := range bad {
		if _, ok := surfacePacket(m); ok {
			t.Errorf("%v accepted", m)
		}
	}
}

func TestSurfaceHeldReleasesWhatTheLeavingPageHeld(t *testing.T) {
	var h surfaceHeld
	for _, m := range [][]int{
		{0xB0, 49, 127},                // Shift down
		{0x90, 70, 100},                // a pad down
		{0x90, 72, 100}, {0x80, 72, 0}, // a pad pressed and let go
		{0x90, 2, 127},                 // knob 3 touched
		{0xB0, 73, 1}, {0xB0, 14, 127}, // turns hold nothing
		{0xB0, 3, 127}, {0xB0, 3, 0}, // a jog click, complete
		{0x90, 20, 127}, {0x90, 20, 0}, // a step, released by velocity 0
	} {
		p, ok := surfacePacket(m)
		if !ok {
			t.Fatalf("%v refused", m)
		}
		h.note(p)
	}
	var got []string
	for _, p := range h.releases() {
		got = append(got, string([]byte{p[1], p[2], p[3]}))
	}
	sort.Strings(got)
	want := []string{string([]byte{0x80, 2, 0}), string([]byte{0x80, 70, 0}), string([]byte{0xB0, 49, 0})}
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("released %q, want %q", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("released %q, want %q", got, want)
		}
	}
	if len(h.releases()) != 0 {
		t.Fatal("a second release let go of something twice")
	}
}

func TestSurfaceSinkPushesThroughTheRing(t *testing.T) {
	r, p := newSurfaceFile(t)
	s := &surfaceSink{path: p}
	if err := s.push([][4]byte{{0x09, 0x90, 68, 100}, {0x08, 0x80, 68, 0}}); err != nil {
		t.Fatal(err)
	}
	a, ok1 := pop(r)
	b, ok2 := pop(r)
	if !ok1 || !ok2 || a[2] != 68 || a[1] != 0x90 || b[1] != 0x80 {
		t.Fatalf("got %v %v", a, b)
	}
	none := &surfaceSink{path: filepath.Join(t.TempDir(), "absent")}
	if err := none.push([][4]byte{{0x09, 0x90, 68, 100}}); err == nil {
		t.Fatal("pushed into a ring that does not exist")
	}
}
