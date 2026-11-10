package main

import (
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

// ShmSurfaceRing pushes the Screen view's gestures on the remote-surface ring
// (src/host/remote_surface.h). The page sends what a hand on the Move would —
// a knob turned a detent, a pad pressed, the jog held and a step pressed — and
// the shim replays each packet onto the route a hardware press takes, so a
// click runs the module's own input handlers and does what the gesture does.
//
// The ring is a shadow_midi_inject_t (src/host/shadow_constants.h), a Vyukov
// bounded MPSC queue: producers claim a position with a CAS on enqueue_pos and
// publish by storing seq = pos+1; the shim (single consumer) frees a slot by
// storing seq = pos+SLOTS. Layout, little-endian:
//
//	0   uint32 enqueue_pos
//	4   uint32 read_pos
//	8   slots[64] { uint32 seq; uint8 pkt[4] }  (8 bytes each)
const (
	surfSlots     = 64
	surfOffSlots  = 8
	surfSlotSize  = 8
	surfRingSize  = surfOffSlots + surfSlots*surfSlotSize // 520
	surfReopenGap = time.Second
)

var shmRemoteSurfacePath = shmPath("remote-surface")

var errSurfaceFull = errors.New("surface ring full")

type ShmSurfaceRing struct {
	data []byte
}

// OpenShmSurfaceRing maps the ring, or returns nil when it does not exist yet
// (the shim creates it at launch; the manager may start first).
func OpenShmSurfaceRing(path string) *ShmSurfaceRing {
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return nil
	}
	defer f.Close()
	if st, err := f.Stat(); err != nil || st.Size() < surfRingSize {
		return nil
	}
	data, err := syscall.Mmap(int(f.Fd()), 0, surfRingSize,
		syscall.PROT_READ|syscall.PROT_WRITE, syscall.MAP_SHARED)
	if err != nil {
		return nil
	}
	return &ShmSurfaceRing{data: data}
}

func (r *ShmSurfaceRing) u32(off int) *uint32 {
	return (*uint32)(unsafe.Pointer(&r.data[off]))
}

// Push enqueues one 4-byte USB-MIDI packet (shadow_midi_inject_push).
func (r *ShmSurfaceRing) Push(pkt [4]byte) error {
	enq := r.u32(0)
	pos := atomic.LoadUint32(enq)
	var slot int
	for {
		slot = surfOffSlots + int(pos%surfSlots)*surfSlotSize
		seq := atomic.LoadUint32(r.u32(slot))
		diff := int32(seq - pos)
		if diff == 0 {
			if atomic.CompareAndSwapUint32(enq, pos, pos+1) {
				break
			}
			pos = atomic.LoadUint32(enq)
		} else if diff < 0 {
			return errSurfaceFull
		} else {
			pos = atomic.LoadUint32(enq)
		}
	}
	copy(r.data[slot+4:slot+8], pkt[:])
	atomic.StoreUint32(r.u32(slot), pos+1)
	return nil
}

// surfaceNoteOK / surfaceCCOK / surfacePacket mirror remote_surface_valid in
// src/host/remote_surface.h: the Move's own surface, channel 1, nothing else.
// The shim checks again at the drain; this one turns a bad page away early.
func surfaceNoteOK(n int) bool {
	return (n >= 0 && n <= 9) || (n >= 16 && n <= 31) || (n >= 68 && n <= 99)
}

func surfaceCCOK(cc int) bool {
	switch cc {
	case 3, 14, 40, 41, 42, 43, 49, 50, 51, 52, 54, 55, 56, 58, 60, 62, 63,
		71, 72, 73, 74, 75, 76, 77, 78, 85, 86, 88, 118, 119:
		return true
	}
	return false
}

// surfacePacket turns [status, d1, d2] into a cable-0 USB-MIDI packet, or
// reports it is not a gesture the surface can make.
func surfacePacket(m []int) ([4]byte, bool) {
	var p [4]byte
	if len(m) != 3 {
		return p, false
	}
	st, d1, d2 := m[0], m[1], m[2]
	if d1 < 0 || d1 > 127 || d2 < 0 || d2 > 127 {
		return p, false
	}
	switch st {
	case 0x90, 0x80:
		if !surfaceNoteOK(d1) {
			return p, false
		}
	case 0xB0:
		if !surfaceCCOK(d1) {
			return p, false
		}
	default:
		return p, false
	}
	return [4]byte{byte(st >> 4), byte(st), byte(d1), byte(d2)}, true
}

// surfaceHeld is what one page is holding down: notes on (touches, steps,
// pads) and buttons pressed. Released for it when its socket closes, so a page
// that drops mid-press never leaves a pad sounding or Shift held on the device.
// Encoders and the jog turn are relative and hold nothing.
type surfaceHeld struct {
	mu    sync.Mutex
	notes map[int]bool
	ccs   map[int]bool
}

func (h *surfaceHeld) note(p [4]byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	switch p[1] {
	case 0x90:
		if p[3] > 0 {
			if h.notes == nil {
				h.notes = map[int]bool{}
			}
			h.notes[int(p[2])] = true
		} else {
			delete(h.notes, int(p[2]))
		}
	case 0x80:
		delete(h.notes, int(p[2]))
	case 0xB0:
		if p[2] == 14 || (p[2] >= 71 && p[2] <= 78) {
			return
		}
		if p[3] > 0 {
			if h.ccs == nil {
				h.ccs = map[int]bool{}
			}
			h.ccs[int(p[2])] = true
		} else {
			delete(h.ccs, int(p[2]))
		}
	}
}

// any reports whether the page is holding anything down.
func (h *surfaceHeld) any() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.notes) > 0 || len(h.ccs) > 0
}

// releases returns the packets that let go of everything held, and forgets it.
func (h *surfaceHeld) releases() [][4]byte {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out [][4]byte
	for n := range h.notes {
		out = append(out, [4]byte{0x08, 0x80, byte(n), 0})
	}
	for cc := range h.ccs {
		out = append(out, [4]byte{0x0B, 0xB0, byte(cc), 0})
	}
	h.notes, h.ccs = nil, nil
	return out
}

// surfaceSink owns the ring for the RemoteUI: opened on first use, and again
// (at most once a second) while the shim has not made it yet.
type surfaceSink struct {
	mu       sync.Mutex
	path     string
	ring     *ShmSurfaceRing
	lastOpen time.Time
}

func (s *surfaceSink) get() *ShmSurfaceRing {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ring == nil && time.Since(s.lastOpen) >= surfReopenGap {
		s.lastOpen = time.Now()
		s.ring = OpenShmSurfaceRing(s.path)
	}
	return s.ring
}

// push sends packets in order. A full ring (the shim drains 16 a frame, every
// ~3 ms) is waited out briefly rather than dropping a release.
func (s *surfaceSink) push(pkts [][4]byte) error {
	r := s.get()
	if r == nil {
		return errors.New("surface ring not available")
	}
	for _, p := range pkts {
		var err error
		for try := 0; try < 20; try++ {
			if err = r.Push(p); err == nil {
				break
			}
			time.Sleep(2 * time.Millisecond)
		}
		if err != nil {
			return err
		}
	}
	return nil
}
