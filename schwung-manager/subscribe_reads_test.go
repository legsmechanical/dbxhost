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
			host.frame = 30 * time.Millisecond // a chunk a frame: slow enough to leave mid-read
			conn, done := dialRU(t, ctx, host)
			defer done()
			if err := wsjson.Write(ctx, conn, req); err != nil {
				t.Fatal(err)
			}
			// wait until the read is under way, then leave
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

// collect reads param_updates until every synth value has arrived.
func collectSynth(ctx context.Context, conn *websocket.Conn) (int, error) {
	got := map[string]bool{}
	for len(got) < manyParams {
		var m struct {
			Type   string
			Params map[string]string
		}
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			return len(got), err
		}
		if m.Type == "param_update" {
			for k := range m.Params {
				if strings.HasPrefix(k, "synth:p") {
					got[k] = true
				}
			}
		}
	}
	return len(got), nil
}

// Two pages asking for one component's values share one read: each value is
// read once, both pages get all of them — the second one joined mid-read, and
// the first one leaves before the end without stopping it for the second.
func TestPagesAskingForOneComponentShareOneRead(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	host := bigSynthHost()
	host.frame = 30 * time.Millisecond // a chunk a frame: the second page joins mid-read
	shm := &ShmParams{data: make([]byte, shmParamSize)}
	go host.serve(ctx, shm)
	ru := NewRemoteUI(shm, nil, t.TempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(ru)
	defer srv.Close()
	dial := func() *websocket.Conn {
		conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
		if err != nil {
			t.Fatal(err)
		}
		conn.SetReadLimit(1 << 20)
		return conn
	}
	first, second := dial(), dial()
	defer second.Close(websocket.StatusNormalClosure, "")
	req := map[string]any{"type": "subscribe", "slot": 0, "component": "synth"}
	if err := wsjson.Write(ctx, first, req); err != nil {
		t.Fatal(err)
	}
	for synthReads(host) < 40 {
		if ctx.Err() != nil {
			t.Fatal("the read never started")
		}
		time.Sleep(time.Millisecond)
	}
	if err := wsjson.Write(ctx, second, req); err != nil {
		t.Fatal(err)
	}
	// The second page has joined once it holds some values; the first leaves
	// then, mid-read.
	got := map[string]bool{}
	left := false
	for len(got) < manyParams {
		var m struct {
			Type   string
			Params map[string]string
		}
		if err := wsjson.Read(ctx, second, &m); err != nil {
			t.Fatalf("the page that joined got %d of %d values: %v", len(got), manyParams, err)
		}
		if m.Type != "param_update" {
			continue
		}
		for k := range m.Params {
			if strings.HasPrefix(k, "synth:p") {
				got[k] = true
			}
		}
		if !left && len(got) > 0 {
			if len(got) >= manyParams {
				t.Fatal("the read ended before the first page could leave mid-read")
			}
			first.CloseNow()
			left = true
		}
	}
	for i := 0; i < manyParams; i++ {
		if c := host.count(fmt.Sprintf("synth:p%d", i)); c != 1 {
			t.Fatalf("synth:p%d read %d times; want once for both pages", i, c)
		}
	}
}

// A panel's first read of a chain component costs one request per chunk, not
// one per value: Josh, 2026-11-08 — the first open of a module's editor was
// slow because its values were read one at a time.
func TestFirstReadIsOneRequestPerChunk(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	host := bigSynthHost()
	conn, done := dialRU(t, ctx, host)
	defer done()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe", "slot": 0, "component": "synth"}); err != nil {
		t.Fatal(err)
	}
	if n, err := collectSynth(ctx, conn); err != nil {
		t.Fatalf("got %d of %d values: %v", n, manyParams, err)
	}
	// the values' chunks, plus one for the instrument's slot settings
	want := (manyParams+initialBulkChunk-1)/initialBulkChunk + 1
	if got := host.bulkCount(); got != want {
		t.Fatalf("%d bulk requests for %d values; want %d", got, manyParams, want)
	}
	if n := synthReads(host); n != manyParams {
		t.Fatalf("%d reads of %d values; want each read once", n, manyParams)
	}
}

// A key the bulk path cannot resolve is read on its own — the bulk reply's
// "?" never becomes an empty value.
func TestUnresolvedBulkKeysAreReadOneByOne(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	host := bigSynthHost()
	host.answers["synth:p7"] = "0.77"
	host.answers["synth:p150"] = "0.15"
	host.singleOnly = map[string]bool{"synth:p7": true, "synth:p150": true}
	conn, done := dialRU(t, ctx, host)
	defer done()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe", "slot": 0, "component": "synth"}); err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for len(got) < manyParams {
		var m struct {
			Type   string
			Params map[string]string
		}
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			t.Fatalf("got %d of %d values: %v", len(got), manyParams, err)
		}
		if m.Type != "param_update" {
			continue
		}
		for k, v := range m.Params {
			if strings.HasPrefix(k, "synth:p") {
				got[k] = v
			}
		}
	}
	if got["synth:p7"] != "0.77" || got["synth:p150"] != "0.15" {
		t.Fatalf("unresolved keys arrived as %q / %q; want 0.77 / 0.15", got["synth:p7"], got["synth:p150"])
	}
	if host.count("synth:p7") != 2 || host.count("synth:p150") != 2 {
		t.Fatalf("unresolved keys read %d / %d times; want bulk + one single", host.count("synth:p7"), host.count("synth:p150"))
	}
}

// A chunk the host refuses whole is read one by one: every value still arrives.
func TestARefusedBulkChunkFallsBackToSingleReads(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	host := bigSynthHost()
	host.refuseBulk = true
	conn, done := dialRU(t, ctx, host)
	defer done()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe", "slot": 0, "component": "synth"}); err != nil {
		t.Fatal(err)
	}
	if n, err := collectSynth(ctx, conn); err != nil {
		t.Fatalf("got %d of %d values: %v", n, manyParams, err)
	}
}

// An instrument panel's slot settings and knob names are one request, not 43:
// one by one they held the first values back ~3.5 s on the device.
func TestSlotSettingsAreOneBulkRead(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	host := bigSynthHost()
	keys := append([]string{}, slotSettingKeys...)
	for i := 1; i <= 8; i++ {
		keys = append(keys, fmt.Sprintf("knob_%d_name", i), fmt.Sprintf("knob_%d_value", i))
	}
	for _, k := range keys {
		host.answers[k] = "1"
	}
	host.answers["slot:volume"] = "0.8"
	conn, done := dialRU(t, ctx, host)
	defer done()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe", "slot": 0, "component": "synth"}); err != nil {
		t.Fatal(err)
	}
	for {
		var m struct {
			Type   string
			Params map[string]string
		}
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			t.Fatalf("slot settings never arrived: %v", err)
		}
		if m.Type == "param_update" && m.Params["slot:volume"] != "" {
			if m.Params["slot:volume"] != "0.8" || m.Params["knob_8_value"] != "1" {
				t.Fatalf("slot settings arrived as %v", m.Params)
			}
			break
		}
	}
	host.mu.Lock()
	defer host.mu.Unlock()
	for _, k := range keys {
		if host.singles[k] != 0 || host.asked[k] != 1 {
			t.Fatalf("%s: %d single reads of %d; want one bulk read", k, host.singles[k], host.asked[k])
		}
	}
}

// A key neither path can read — bulk says "?", the single read is refused —
// never reaches the page as an empty value: "" would set its control to zero.
func TestAKeyNoPathCanReadIsLeftOut(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	host := &fakeHost{asked: map[string]int{}, answers: map[string]string{
		"synth_module":       "small-synth",
		"synth:ui_hierarchy": `{"levels":{"root":{"params":["cut"]}}}`,
		"synth:chain_params": `[{"key":"cut","name":"Cut"},{"key":"gone","name":"Gone"},{"key":"res","name":"Res"}]`,
		"synth:cut":          "0.3",
		"synth:res":          "0.6",
	}}
	conn, done := dialRU(t, ctx, host)
	defer done()
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "subscribe", "slot": 0, "component": "synth"}); err != nil {
		t.Fatal(err)
	}
	seen := map[string]string{}
	for seen["synth:cut"] == "" || seen["synth:res"] == "" {
		var m struct {
			Type   string
			Params map[string]string
		}
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			t.Fatalf("values never arrived: %v (have %v)", err, seen)
		}
		if m.Type != "param_update" {
			continue
		}
		for k, v := range m.Params {
			seen[k] = v
		}
	}
	if v, ok := seen["synth:gone"]; ok {
		t.Fatalf("an unreadable key reached the page as %q", v)
	}
	if host.count("synth:gone") != 2 {
		t.Fatalf("synth:gone asked %d times; want the bulk read and one single", host.count("synth:gone"))
	}
}
