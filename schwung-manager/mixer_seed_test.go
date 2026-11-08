// The mixer seed — every chain position's strip values and its instrument's
// display name, sent once when a page subscribes — must reach the page even
// when another write to it is in flight. It went out through writeJSONTry,
// which DROPS a write while one is in progress; nothing resends it, so the
// Sound view (which asks for every card's metadata at the same moment) kept
// "no instrument" and nameless cards until a reload happened to win the race
// (seen on the device, 2026-11-08).

package main

import (
	"context"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

func TestMixerSeedSurvivesABusyClient(t *testing.T) {
	host := &fakeHost{asked: map[string]int{}, answers: map[string]string{
		"synth_module": "obxd",
		"slot:volume":  "1.0",
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

	// the server side of this connection
	var c *ruClient
	for i := 0; i < 100 && c == nil; i++ {
		ru.mu.Lock()
		for k := range ru.clients {
			c = k
		}
		ru.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	if c == nil {
		t.Fatal("no server-side client")
	}

	// Another write is in flight for the whole time the seed is read and sent.
	c.writeMu.Lock()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe_mixer"}); err != nil {
		t.Fatal(err)
	}
	// the seed reads 8 positions x 7 keys + 4 buses x 6 keys from the fake host
	deadline := time.Now().Add(3 * time.Second)
	for host.count("move_fx:4:soloed") == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond) // past the seed's write attempt
	c.writeMu.Unlock()

	rctx, rcancel := context.WithTimeout(ctx, 3*time.Second)
	defer rcancel()
	for {
		var m struct {
			Type   string            `json:"type"`
			Params map[string]string `json:"params"`
		}
		if err := wsjson.Read(rctx, conn, &m); err != nil {
			t.Fatalf("the mixer seed never arrived (dropped while another write was in flight): %v", err)
		}
		if m.Type == "param_update" && m.Params["chain:0:synth_module"] == "obxd" {
			if m.Params["chain:0:synth_name"] == "" {
				t.Fatalf("seed arrived without the instrument's display name: %v", m.Params)
			}
			return
		}
	}
}
