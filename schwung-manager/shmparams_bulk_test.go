package main

import (
	"errors"
	"testing"
)

func TestParseBulkResponse(t *testing.T) {
	got, err := parseBulkResponse("4\n3\n0.50\n?\n5\na\nb c", 4)
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Value != "0.5" || got[1].Value != "" || got[1].Err != nil ||
		!errors.Is(got[2].Err, errBulkUnresolved) || got[3].Value != "a\nb c" {
		t.Fatalf("parsed %+v", got)
	}
	for _, bad := range []string{"3\n1\na", "2\n1\na", "2\n9\nab\n1\nc", "x"} {
		if _, err := parseBulkResponse(bad, 2); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
