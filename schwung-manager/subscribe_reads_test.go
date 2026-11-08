// What a page's subscribe costs the shared param channel. Seen on the device
// (2026-11-08): the editor stopped responding to transport and mode changes
// while the manager log ran one overlapping 100–430-value read after another.
// Every embedded module editor subscribed to its WHOLE slot, so an effect's
// page read the instrument's 150 values one by one, and a page that dropped
// and reconnected left its old read running beside the new one.

package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

const manyParams = 200

func bigSynthHost() *fakeHost {
	ans := map[string]string{
		"synth_module":       "big-synth",
		"synth:ui_hierarchy": `{"levels":{"root":{"params":["p0"]}}}`,
		"fx1_module":         "tape-echo2",
		"fx1:ui_hierarchy":   `{"levels":{"root":{"params":["time"]}}}`,
		"fx1:chain_params":   `[{"key":"time","name":"Time"}]`,
		"fx1:time":           "0.4",
	}
	var cp []string
	for i := 0; i < manyParams; i++ {
		cp = append(cp, fmt.Sprintf(`{"key":"p%d","name":"P%d"}`, i, i))
		ans[fmt.Sprintf("synth:p%d", i)] = "0.5"
	}
	ans["synth:chain_params"] = "[" + strings.Join(cp, ",") + "]"
	return &fakeHost{asked: map[string]int{}, answers: ans}
}

func dialRU(t *testing.T, ctx context.Context, host *fakeHost) (*websocket.Conn, func()) {
	t.Helper()
	shm := &ShmParams{data: make([]byte, shmParamSize)}
	hctx, hcancel := context.WithCancel(ctx)
	go host.serve(hctx, shm)
	ru := NewRemoteUI(shm, nil, t.TempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(ru)
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	return conn, func() { conn.Close(websocket.StatusNormalClosure, ""); srv.Close(); hcancel() }
}

func synthReads(h *fakeHost) int {
	n := 0
	for i := 0; i < manyParams; i++ {
		n += h.count(fmt.Sprintf("synth:p%d", i))
	}
	return n
}

// An effect's page asks for its own component: it gets that one's values and
// never reads the instrument's.
func TestSubscribeToOneComponentReadsOnlyThatOne(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	host := bigSynthHost()
	conn, done := dialRU(t, ctx, host)
	defer done()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe", "slot": 0, "component": "fx1"}); err != nil {
		t.Fatal(err)
	}
	for {
		var m struct {
			Type   string
			Params map[string]string
		}
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			t.Fatalf("fx1's value never arrived: %v", err)
		}
		if m.Type == "param_update" && m.Params["fx1:time"] == "0.4" {
			break
		}
	}
	time.Sleep(200 * time.Millisecond)
	if n := synthReads(host); n != 0 {
		t.Fatalf("an fx1 page read %d of the instrument's values; want 0", n)
	}
	if host.count("synth:chain_params") != 0 {
		t.Fatalf("an fx1 page read the instrument's param list")
	}
}

// A page that goes away mid-read stops costing the channel: the one-by-one
// read made for it ends with it, on both the whole-slot subscribe and the
// per-component request.
func TestAReadStopsWhenItsPageGoes(t *testing.T) {
	for _, req := range []map[string]any{
		{"type": "subscribe", "slot": 0},
		{"type": "get_hierarchy", "slot": 0, "component": "synth"},
	} {
		t.Run(req["type"].(string), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			host := bigSynthHost()
			conn, done := dialRU(t, ctx, host)
			defer done()
			if err := wsjson.Write(ctx, conn, req); err != nil {
				t.Fatal(err)
			}
			// wait until the one-by-one read is under way, then leave
			for synthReads(host) < 8 {
				if ctx.Err() != nil {
					t.Fatal("the read never started")
				}
				time.Sleep(time.Millisecond)
			}
			conn.CloseNow()
			time.Sleep(300 * time.Millisecond)
			settled := synthReads(host)
			time.Sleep(700 * time.Millisecond)
			if n := synthReads(host); n != settled || n >= manyParams {
				t.Fatalf("reads went on after the page left: %d, then %d of %d", settled, n, manyParams)
			}
		})
	}
}
