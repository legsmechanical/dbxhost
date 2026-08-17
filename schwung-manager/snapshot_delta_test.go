package main

import (
	"reflect"
	"testing"
)

func TestSnapshotDelta(t *testing.T) {
	last := map[string]string{"a": "1", "b": "2", "gone": "x"}
	cur := map[string]string{"a": "1", "b": "3", "new": "9"}

	got := snapshotDelta(last, cur)
	want := map[string]string{
		"b":    "3", // changed
		"new":  "9", // added
		"gone": "",  // removed → explicit empty write (sticky browser kv)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("delta = %v, want %v", got, want)
	}
	if _, ok := got["a"]; ok {
		t.Fatal("unchanged key leaked into delta")
	}
}

// nil last (fresh subscribe, resubscribe, tool arrival) must yield the FULL
// map — a client with no acked snapshot can never be served a delta.
func TestSnapshotDeltaFullOnReset(t *testing.T) {
	cur := map[string]string{"a": "1", "b": "2"}
	if got := snapshotDelta(nil, cur); !reflect.DeepEqual(got, cur) {
		t.Fatalf("nil last: got %v, want full map", got)
	}
}

func TestSnapshotDeltaNoChange(t *testing.T) {
	m := map[string]string{"a": "1"}
	if got := snapshotDelta(m, map[string]string{"a": "1"}); len(got) != 0 {
		t.Fatalf("identical snapshots: got %v, want empty", got)
	}
}
