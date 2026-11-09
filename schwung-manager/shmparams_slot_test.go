package main

import (
	"context"
	"encoding/binary"
	"testing"
	"time"
)

// uiClaim is what the shadow UI writes when it takes the slot.
func uiClaim(s *ShmParams, id uint32) {
	binary.LittleEndian.PutUint32(s.data[paramOffRequestID:], id)
	s.data[paramOffResponseReady] = 0
	s.data[paramOffRequestType] = 2
}

// answer is the host answering request id with val and clearing the slot.
func answer(s *ShmParams, id uint32, val string) {
	copy(s.data[paramOffValue:], val+"\x00")
	binary.LittleEndian.PutUint32(s.data[paramOffResultLen:], uint32(len(val)))
	binary.LittleEndian.PutUint32(s.data[paramOffResponseID:], id)
	s.data[paramOffResponseReady] = 1
	s.data[paramOffRequestType] = 0
}

func waitRequest(ctx context.Context, s *ShmParams) (uint32, bool) {
	for ctx.Err() == nil {
		if s.data[paramOffRequestType] != 0 {
			return binary.LittleEndian.Uint32(s.data[paramOffRequestID:]), true
		}
		time.Sleep(50 * time.Microsecond)
	}
	return 0, false
}

// The host clears the slot as it answers; the shadow UI may claim it before
// the manager has read its answer. So the manager never writes "idle" itself
// — the old reader did, after every read and on every timeout, and that write
// erased a UI request that had claimed the slot in between (2026-11-09).
// Pinned with a host that answers WITHOUT clearing: whatever stays in the
// slot after the read is not the manager's to touch.
func TestAReadNeverClearsTheSlot(t *testing.T) {
	s := &ShmParams{data: make([]byte, shmParamSize)}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	go func() {
		id, ok := waitRequest(ctx, s)
		if !ok {
			return
		}
		answer(s, id, "0.5")
		s.data[paramOffRequestType] = 2 // still taken — by whoever claimed it next
	}()
	v, err := s.GetParam(0, "synth:cut")
	if err != nil || v != "0.5" {
		t.Fatalf("read %q, %v", v, err)
	}
	if s.data[paramOffRequestType] == 0 {
		t.Fatal("the manager cleared the slot after its read")
	}
}

// A request the UI's claim wrote over is asked again at once, not after the
// 500 ms response timeout.
func TestALostRequestIsAskedAgain(t *testing.T) {
	s := &ShmParams{data: make([]byte, shmParamSize)}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	go func() {
		if _, ok := waitRequest(ctx, s); !ok {
			return
		}
		uiClaim(s, 0xABCD)            // written over ours before the host saw it
		answer(s, 0xABCD, "ui")       // the host answers the UI
		id, ok := waitRequest(ctx, s) // the manager asks again
		if ok {
			answer(s, id, "0.5")
		}
	}()
	t0 := time.Now()
	v, err := s.GetParam(0, "synth:cut")
	if err != nil || v != "0.5" {
		t.Fatalf("read %q, %v", v, err)
	}
	if d := time.Since(t0); d > 200*time.Millisecond {
		t.Fatalf("took %v: waited out the timeout instead of asking again", d)
	}
}
