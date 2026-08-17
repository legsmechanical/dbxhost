package main

import "testing"

func TestMixerKeyRoundTrip(t *testing.T) {
	cases := []struct {
		wire string
		slot uint8
		key  string
	}{
		{"chain:0:volume", 0, "slot:volume"},
		{"chain:7:soloed", 7, "slot:soloed"},
		{"chain:3:send_b", 3, "slot:send_b"},
		{"move_fx:1:volume", 0, "move_fx:1:volume"},
		{"move_fx:4:muted", 0, "move_fx:4:muted"},
	}
	for _, c := range cases {
		slot, key, ok := mixerWireToShm(c.wire)
		if !ok || slot != c.slot || key != c.key {
			t.Errorf("wireToShm(%q) = (%d,%q,%v), want (%d,%q,true)",
				c.wire, slot, key, ok, c.slot, c.key)
			continue
		}
		wire, ok := mixerShmToWire(slot, key)
		if !ok || wire != c.wire {
			t.Errorf("shmToWire(%d,%q) = (%q,%v), want (%q,true)", slot, key, wire, ok, c.wire)
		}
	}
}

func TestMixerKeyRejects(t *testing.T) {
	badWire := []string{
		"chain:8:volume",       // beyond SHADOW_CHAIN_INSTANCES
		"chain:-1:volume",      // negative
		"chain:2:state",        // not a strip key — no generic slot: proxy
		"chain:2:synth_module", // read-only identity, not writable
		"move_fx:0:volume",     // buses are 1-based
		"move_fx:5:volume",     // Move has 4 instruments
		"move_fx:2:module",     // insert-FX config is not the mixer surface
		"slot:volume",          // mailbox form is not a wire form
	}
	for _, w := range badWire {
		if _, _, ok := mixerWireToShm(w); ok {
			t.Errorf("wireToShm(%q) accepted, want reject", w)
		}
	}
	badShm := []struct {
		slot uint8
		key  string
	}{
		{8, "slot:volume"},          // out of range
		{0, "slot:synth_volume"},    // Module Level is not the strip surface
		{1, "move_fx:2:volume"},     // move_fx rides slot 0 only
		{0, "move_fx:2:fx1:cutoff"}, // insert-FX params are not strip keys
	}
	for _, c := range badShm {
		if _, ok := mixerShmToWire(c.slot, c.key); ok {
			t.Errorf("shmToWire(%d,%q) accepted, want reject", c.slot, c.key)
		}
	}
}
