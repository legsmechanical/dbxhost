package main

import "testing"

// The stop's order key must reach the browser: without it a stale playing
// frame delivered after the stop restarts the browser's playhead.
func TestRuiPlayFrameKeepsTheStopOrderKey(t *testing.T) {
	cases := []struct {
		digest, want string
	}{
		{"12:1:960:120:4500", "1:960:120:4500"}, // playing: device-clock ms
		{"12:0:960:120:4501", "0:960:120:4501"}, // stopped: the stop's order key
		{"12:0:0:120", "0:0:120"},               // never ran: no key
	}
	for _, c := range cases {
		_, on, tick, bpm, devms := parseRuiPoll(c.digest)
		if got := ruiPlayFrame(on, tick, bpm, devms); got != c.want {
			t.Errorf("digest %q: rui_play %q, want %q", c.digest, got, c.want)
		}
	}
}
