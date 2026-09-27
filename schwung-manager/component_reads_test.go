// The Sound view's per-component reads (get_hierarchy with a component), end
// to end over a real WebSocket, against a goroutine playing the host's side of
// the param channel. Measured on the device (2026-09-27): every EMPTY chain
// position held the queue up by 0.4–2 s, a module's "no such key" was retried
// as if the channel had failed, a read that never got an answer went out as
// an ordinary empty one (the card said "no parameters"), and dr32's values
// never arrived because its state snapshot carries 2 of its 30 params.

package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

const (
	hostRefuse = "\x00REFUSE" // the host's error flag: not a key this module has
	hostSilent = "\x00SILENT" // no response at all: the channel failed
)

// fakeHost answers GET requests on the param channel from a table, and counts
// how often each key was asked.
type fakeHost struct {
	mu      sync.Mutex
	answers map[string]string
	asked   map[string]int
}

func (h *fakeHost) count(key string) int { h.mu.Lock(); defer h.mu.Unlock(); return h.asked[key] }

func (h *fakeHost) serve(ctx context.Context, s *ShmParams) {
	var last uint32
	for ctx.Err() == nil {
		if s.data[paramOffRequestType] != 2 {
			time.Sleep(100 * time.Microsecond)
			continue
		}
		req := binary.LittleEndian.Uint32(s.data[paramOffRequestID:])
		if req == last {
			time.Sleep(100 * time.Microsecond)
			continue
		}
		last = req
		raw := s.data[paramOffKey : paramOffKey+paramKeyLen]
		key := string(raw[:strings.IndexByte(string(raw), 0)])
		h.mu.Lock()
		h.asked[key]++
		ans, ok := h.answers[key]
		h.mu.Unlock()
		if ans == hostSilent {
			continue
		}
		if !ok || ans == hostRefuse {
			s.data[paramOffError] = 1
			binary.LittleEndian.PutUint32(s.data[paramOffResultLen:], 0)
		} else {
			copy(s.data[paramOffValue:], ans)
			binary.LittleEndian.PutUint32(s.data[paramOffResultLen:], uint32(len(ans)))
		}
		binary.LittleEndian.PutUint32(s.data[paramOffResponseID:], req)
		s.data[paramOffResponseReady] = 1
	}
}

func TestComponentReads(t *testing.T) {
	host := &fakeHost{asked: map[string]int{}, answers: map[string]string{
		"midi_fx1_module":    "",
		"synth_module":       "dr32",
		"synth:ui_hierarchy": hostRefuse,
		"synth:chain_params": `[{"key":"tune","name":"Tune"},{"key":"decay","name":"Decay"}]`,
		"synth:state":        `{"tune":0.5,"samples":{"a":1}}`,
		"synth:decay":        "0.2",
		"fx3_module":         "clap",
		"fx3:ui_hierarchy":   hostSilent,
		"fx3:chain_params":   `[]`,
	}}
	shm := &ShmParams{data: make([]byte, shmParamSize)}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go host.serve(ctx, shm)

	ru := NewRemoteUI(shm, nil, t.TempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(ru)
	defer srv.Close()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	type msg struct {
		Type      string            `json:"type"`
		Component string            `json:"component"`
		Data      json.RawMessage   `json:"data"`
		Params    map[string]string `json:"params"`
		Empty     bool              `json:"empty"`
		Failed    bool              `json:"failed"`
	}
	ask := func(comp string, want int) []msg {
		t.Helper()
		if err := wsjson.Write(ctx, conn, map[string]any{"type": "get_hierarchy", "slot": 0, "component": comp}); err != nil {
			t.Fatal(err)
		}
		var got []msg
		rctx, rcancel := context.WithTimeout(ctx, 5*time.Second)
		defer rcancel()
		for len(got) < want {
			var m msg
			if err := wsjson.Read(rctx, conn, &m); err != nil {
				t.Fatalf("%s: after %d messages: %v", comp, len(got), err)
			}
			got = append(got, m)
		}
		return got
	}
	find := func(ms []msg, typ string) msg {
		for _, m := range ms {
			if m.Type == typ {
				return m
			}
		}
		t.Fatalf("no %s in %+v", typ, ms)
		return msg{}
	}

	// An EMPTY position: answered at once, from one read of what is loaded.
	start := time.Now()
	ms := ask("midi_fx1", 2)
	if h := find(ms, "hierarchy"); !h.Empty || string(h.Data) != "{}" {
		t.Errorf("empty position: hierarchy %+v", h)
	}
	if p := find(ms, "chain_params"); !p.Empty || string(p.Data) != "[]" {
		t.Errorf("empty position: chain_params %+v", p)
	}
	if n := host.count("midi_fx1:ui_hierarchy") + host.count("midi_fx1:chain_params"); n != 0 {
		t.Errorf("empty position still read its metadata %d times", n)
	}
	if d := time.Since(start); d > 300*time.Millisecond {
		t.Errorf("empty position took %v", d)
	}

	// dr32: no hierarchy (the host says so — ONE ask), 2 declared params, a
	// state snapshot with only one of them; the other is read on its own.
	ms = ask("synth", 4)
	if h := find(ms, "hierarchy"); h.Failed || h.Empty || string(h.Data) != "{}" {
		t.Errorf("synth hierarchy %+v", h)
	}
	// Two readers ask it once each (the metadata, and the preset lookup in
	// fetchHierarchyParams); retrying the no made that six.
	if n := host.count("synth:ui_hierarchy"); n != 2 {
		t.Errorf("the host's no was asked %d times (want 2: once per reader)", n)
	}
	vals := map[string]string{}
	for _, m := range ms {
		for k, v := range m.Params {
			vals[k] = v
		}
	}
	if vals["synth:tune"] != "0.5" || vals["synth:decay"] != "0.2" {
		t.Errorf("values: %v (want tune from the snapshot, decay read on its own)", vals)
	}
	if host.count("synth:tune") != 0 {
		t.Errorf("a value the snapshot carried was read again")
	}

	// A read that never got an answer is reported as FAILED, not as empty.
	ms = ask("fx3", 2)
	if h := find(ms, "hierarchy"); !h.Failed {
		t.Errorf("an unanswered read went out as an answer: %+v", h)
	}
	if p := find(ms, "chain_params"); p.Failed {
		t.Errorf("chain_params was answered but marked failed: %+v", p)
	}
}
