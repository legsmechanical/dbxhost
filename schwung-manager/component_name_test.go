// A card's metadata names the module loaded there by its module.json "name",
// so the Sound view's header can say "Tape Echo 2" for an effect. Effects
// carry no other source of a name: their hierarchies rarely label the root,
// and the mixer seed names only the instrument (seen on the device,
// 2026-11-08: every effect card's header was blank).

package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

func TestComponentMetadataCarriesTheModuleName(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "modules", "audio_fx", "tape-echo2")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "module.json"), []byte(`{"id":"tape-echo2","name":"Tape Echo 2"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	host := &fakeHost{asked: map[string]int{}, answers: map[string]string{
		"fx1_module":       "tape-echo2",
		"fx1:ui_hierarchy": `{"levels":{"root":{"params":["time"]}}}`,
		"fx1:chain_params": `[{"key":"time","name":"Time"}]`,
		"fx1:time":         "0.4",
	}}
	shm := &ShmParams{data: make([]byte, shmParamSize)}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go host.serve(ctx, shm)

	ru := NewRemoteUI(shm, nil, base, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(ru)
	defer srv.Close()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := wsjson.Write(ctx, conn, map[string]any{"type": "get_hierarchy", "slot": 0, "component": "fx1"}); err != nil {
		t.Fatal(err)
	}
	rctx, rcancel := context.WithTimeout(ctx, 5*time.Second)
	defer rcancel()
	for {
		var m struct {
			Type, Component, Module, Name string
			Data                          json.RawMessage
		}
		if err := wsjson.Read(rctx, conn, &m); err != nil {
			t.Fatalf("no hierarchy for fx1: %v", err)
		}
		if m.Type == "hierarchy" && m.Component == "fx1" {
			if m.Module != "tape-echo2" || m.Name != "Tape Echo 2" {
				t.Fatalf("module %q name %q, want tape-echo2 / Tape Echo 2", m.Module, m.Name)
			}
			return
		}
	}
}
