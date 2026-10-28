package main

import (
	"bytes"
	"context"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"nhooyr.io/websocket"
)

type lockedBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuf) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuf) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

// A page on iPhone/iPad asks for ?deflate=0 and must get an uncompressed
// connection; every other page keeps permessage-deflate. Both are logged, so a
// bug report says which connections were compressed and how long each held.
func TestRemoteUIDeflateOptOut(t *testing.T) {
	logs := &lockedBuf{}
	shm := &ShmParams{data: make([]byte, shmParamSize)}
	ru := NewRemoteUI(shm, nil, t.TempDir(), slog.New(slog.NewTextHandler(logs, nil)))
	srv := httptest.NewServer(ru)
	defer srv.Close()
	base := "ws" + strings.TrimPrefix(srv.URL, "http")

	dial := func(query string) string {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		conn, resp, err := websocket.Dial(ctx, base+query, &websocket.DialOptions{
			// Offer deflate the way a browser does.
			CompressionMode: websocket.CompressionContextTakeover,
		})
		if err != nil {
			t.Fatal(err)
		}
		conn.Close(websocket.StatusNormalClosure, "")
		return resp.Header.Get("Sec-WebSocket-Extensions")
	}

	if ext := dial(""); !strings.Contains(ext, "permessage-deflate") {
		t.Fatalf("default connection: extensions %q, want permessage-deflate", ext)
	}
	if ext := dial("?deflate=0"); ext != "" {
		t.Fatalf("?deflate=0: extensions %q, want none", ext)
	}

	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(logs.String(), "after=") && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	out := logs.String()
	for _, want := range []string{`msg="ws open" deflate=permessage-deflate`, `msg="ws open" deflate=none`, "after="} {
		if !strings.Contains(out, want) {
			t.Fatalf("log lacks %q:\n%s", want, out)
		}
	}
}
