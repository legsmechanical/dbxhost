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

// An instrument load reaches the mixer namespace as its identity — read-only:
// the wire form is still refused as a write (TestMixerKeyRejects).
func TestMixerInstrumentIdentity(t *testing.T) {
	for _, key := range []string{"synth:module", "synth_module"} {
		if wire, ok := mixerShmToWire(6, key); !ok || wire != "chain:6:synth_module" {
			t.Errorf("shmToWire(6,%q) = (%q,%v), want (chain:6:synth_module,true)", key, wire, ok)
		}
	}
	if _, ok := mixerShmToWire(8, "synth:module"); ok {
		t.Errorf("an out-of-range position's instrument was accepted")
	}
	if _, ok := mixerShmToWire(2, "fx1:module"); ok {
		t.Errorf("an effect's module is not the instrument identity")
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

// The channel strip (mix_strip.h: the EQ and the one-knob comp) rides the
// mixer wire like the rest of the strip, on chain positions and Move buses.
func TestMixerChannelStripKeys(t *testing.T) {
	for _, k := range []string{"eq_low", "eq_mid", "eq_mid_freq", "eq_high", "comp"} {
		for _, c := range []struct {
			wire string
			slot uint8
			key  string
		}{
			{"chain:5:" + k, 5, "slot:" + k},
			{"move_fx:3:" + k, 0, "move_fx:3:" + k},
		} {
			slot, key, ok := mixerWireToShm(c.wire)
			if !ok || slot != c.slot || key != c.key {
				t.Errorf("wireToShm(%q) = (%d,%q,%v), want (%d,%q,true)", c.wire, slot, key, ok, c.slot, c.key)
			}
			if wire, ok := mixerShmToWire(c.slot, c.key); !ok || wire != c.wire {
				t.Errorf("shmToWire(%d,%q) = (%q,%v), want %q", c.slot, c.key, wire, ok, c.wire)
			}
		}
	}
	// the reduction is a READING: never a write from the page
	for _, w := range []string{"chain:1:comp_gr", "move_fx:2:comp_gr", "chain:1:strip"} {
		if _, _, ok := mixerWireToShm(w); ok {
			t.Errorf("wireToShm(%q) accepted, want reject", w)
		}
	}
}

// A project load restores a position's strip in ONE bulk write ("strip", in
// mix_strip.h's field order); the page must see all five values move.
func TestMixerBulkStripExpands(t *testing.T) {
	got := map[string]string{}
	if !mixerShmToWireAll(4, "slot:strip", "3.50 -2.00 0.7000 1.00 0.4000", got) {
		t.Fatal("slot:strip was not part of the mixer surface")
	}
	want := map[string]string{"chain:4:eq_low": "3.50", "chain:4:eq_mid": "-2.00",
		"chain:4:eq_mid_freq": "0.7000", "chain:4:eq_high": "1.00", "chain:4:comp": "0.4000"}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q (all: %v)", k, got[k], v, got)
		}
	}
	got = map[string]string{}
	if !mixerShmToWireAll(0, "move_fx:2:strip", "0 0 0.5 0 0.25", got) || got["move_fx:2:comp"] != "0.25" {
		t.Errorf("a Move bus's bulk strip did not expand: %v", got)
	}
	for _, c := range []struct {
		slot uint8
		key  string
	}{{8, "slot:strip"}, {1, "move_fx:2:strip"}, {0, "move_fx:5:strip"}} {
		if mixerShmToWireAll(c.slot, c.key, "1 2 3 4 5", map[string]string{}) {
			t.Errorf("(%d,%q) accepted, want reject", c.slot, c.key)
		}
	}
	// a short value fills what it has and guesses nothing
	got = map[string]string{}
	mixerExpandStrip("chain:0:", "1.5 2.5", got)
	if len(got) != 2 || got["chain:0:eq_mid"] != "2.5" {
		t.Errorf("short strip = %v", got)
	}
}

// The gain reduction is polled only where the comp is on; turning a comp off
// sends one 0.00 so the page's meter settles, then stops reading it.
func TestMixerGrPlan(t *testing.T) {
	mixerGr = mixerGrState{compOn: map[string]bool{}, last: map[string]string{}}
	ru := &RemoteUI{}
	ru.mixerNoteComp(map[string]string{"chain:2:comp": "0.5000", "move_fx:1:comp": "0", "chain:3:volume": "1"})
	read, settle := mixerGrPlan()
	if len(read) != 1 || read[0] != "chain:2:" || len(settle) != 0 {
		t.Fatalf("plan = %v / %v, want [chain:2:] / []", read, settle)
	}
	if !mixerGrChanged("chain:2:", "-3.20") || mixerGrChanged("chain:2:", "-3.20") {
		t.Fatal("only a change goes out")
	}
	ru.mixerNoteComp(map[string]string{"chain:2:comp": "0"})
	read, settle = mixerGrPlan()
	if len(read) != 0 || len(settle) != 1 || settle[0] != "chain:2:" {
		t.Fatalf("after comp off: plan = %v / %v, want [] / [chain:2:]", read, settle)
	}
	if read, settle = mixerGrPlan(); len(read)+len(settle) != 0 {
		t.Fatalf("an off comp is settled once, then forgotten: %v / %v", read, settle)
	}
	for p, want := range map[string]struct {
		slot uint8
		key  string
	}{"chain:7:": {7, "slot:comp_gr"}, "move_fx:4:": {0, "move_fx:4:comp_gr"}} {
		if s, k, ok := mixerGrShm(p); !ok || s != want.slot || k != want.key {
			t.Errorf("mixerGrShm(%q) = (%d,%q,%v)", p, s, k, ok)
		}
	}
	if _, _, ok := mixerGrShm("chain:8:"); ok {
		t.Error("chain:8: accepted")
	}
}
