package main

import "testing"

// The compiled-in default must stay the STOCK prefix: an unstamped binary
// launched into a dbxhost session has to fail loudly (ENOENT on every open)
// rather than silently attach to another install's segments. The dbxhost
// value arrives only via -ldflags "-X main.shmPrefix=..." or -shm-prefix.
func TestShmPrefixDefaultIsStock(t *testing.T) {
	if shmPrefix != "/schwung-" {
		t.Fatalf("compiled-in shmPrefix = %q, want the stock \"/schwung-\"", shmPrefix)
	}
	if got := shmPath("control"); got != "/dev/shm/schwung-control" {
		t.Fatalf("shmPath(control) = %q", got)
	}
}

func TestSetShmPrefixRederivesAllPaths(t *testing.T) {
	old := shmPrefix
	defer setShmPrefix(old)

	setShmPrefix("/dbxhost-")
	want := map[string]string{
		shmParamPath:          "/dev/shm/dbxhost-param",
		shmWebParamSetPath:    "/dev/shm/dbxhost-web-param-set",
		shmWebParamNotifyPath: "/dev/shm/dbxhost-web-param-notify",
		dispSHM:               "/dev/shm/dbxhost-display-live",
	}
	for got, exp := range want {
		if got != exp {
			t.Errorf("derived path = %q, want %q", got, exp)
		}
	}
	if got := shmPath("control"); got != "/dev/shm/dbxhost-control" {
		t.Errorf("shmPath(control) after set = %q", got)
	}
}
