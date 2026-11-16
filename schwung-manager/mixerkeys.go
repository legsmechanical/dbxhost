package main

// Mixer wire namespace — the browser's flat, self-addressing key form for the
// 8 unified mixer positions:
//
//	chain:<0-7>:<strip key>   a track's chain position (mailbox: slot=n, "slot:<key>")
//	move_fx:<1-4>:<strip key> a Move instrument bus   (mailbox: slot=0, key unchanged)
//
// The mailbox's chain form ("slot:volume" + a separate slot field) is ambiguous
// in a flat browser kv map, so the manager normalises on the way out and
// denormalises on the way in. Both directions live in this one file with a
// round-trip test — this is exactly the kind of split-brain that rots.
//
// ⚠ Addressing law (mirrors davebox/ui/ui_engine.mjs): a track's CHAIN slot is
// its track index, but a Move bus is the track's CHANNEL (Move 1-4), never the
// index. The BROWSER derives which position a track owns from rui_index; the
// manager only translates key shapes and never guesses ownership.

import (
	"strconv"
	"strings"
)

// mixerStripKeys is the writable per-position strip surface. Deliberately a
// whitelist: the mixer wire form must not become a generic proxy for arbitrary
// slot-namespace writes.
//
// The channel strip's five (src/host/mix_strip.h, MIX_STRIP_KEYS — the EQ and
// the one-knob comp, on every position) are on it too; its read-only gain
// reduction ("comp_gr") is not a write, and reaches the page by the manager's
// own poll (mixerGrPoll), since no set ever fires for it.
var mixerStripKeys = map[string]bool{
	"volume": true, "pan": true, "send_a": true, "send_b": true,
	"muted": true, "soloed": true,
	"eq_low": true, "eq_mid": true, "eq_mid_freq": true, "eq_high": true, "comp": true,
}

// mixerSeedKeys is what a fresh mixer subscription is seeded with, one read
// each: the strip surface bar the channel strip, which is one read of its
// bulk key (mixerChannelStripKeys).
var mixerSeedKeys = []string{"volume", "pan", "send_a", "send_b", "muted", "soloed"}

// mixerChannelStripKeys is the channel strip in mix_strip.h's FIELD ORDER: the
// order of its bulk key "strip" ("low mid freq high comp", read and written
// whole — a project load restores a position's strip in that one write).
var mixerChannelStripKeys = []string{"eq_low", "eq_mid", "eq_mid_freq", "eq_high", "comp"}

// mixerExpandStrip splits a bulk "strip" value into its five wire keys under
// `prefix` ("chain:3:"). Fields missing from the end are left out rather than
// guessed.
func mixerExpandStrip(prefix, value string, into map[string]string) {
	f := strings.Fields(value)
	for i, k := range mixerChannelStripKeys {
		if i < len(f) {
			into[prefix+k] = f[i]
		}
	}
}

// mixerStripPrefix is the wire prefix a notify-ring key for the bulk "strip"
// belongs to ("slot:strip" on chain slot n → "chain:n:"; "move_fx:2:strip" →
// "move_fx:2:"), or ok=false.
func mixerStripPrefix(slot uint8, key string) (prefix string, ok bool) {
	if key == "slot:strip" {
		if slot >= maxChainSlots {
			return "", false
		}
		return "chain:" + strconv.Itoa(int(slot)) + ":", true
	}
	if rest, found := strings.CutPrefix(key, "move_fx:"); found && slot == 0 {
		busStr, k, found2 := strings.Cut(rest, ":")
		b, err := strconv.Atoi(busStr)
		if found2 && k == "strip" && err == nil && b >= 1 && b <= moveBusCount {
			return "move_fx:" + busStr + ":", true
		}
	}
	return "", false
}

// mixerShmToWireAll is mixerShmToWire for a change with its value: a bulk
// "strip" write becomes its five keys, anything else its one.
func mixerShmToWireAll(slot uint8, key, value string, into map[string]string) bool {
	if prefix, ok := mixerStripPrefix(slot, key); ok {
		mixerExpandStrip(prefix, value, into)
		return true
	}
	if wire, ok := mixerShmToWire(slot, key); ok {
		into[wire] = value
		return true
	}
	return false
}

const moveBusCount = 4 // MOVE_FX_SLOTS — Move has 4 hardware instruments

// mixerWireToShm translates a browser wire key to (slot, mailbox key).
// Returns ok=false for anything outside the whitelisted mixer surface.
func mixerWireToShm(wire string) (slot uint8, key string, ok bool) {
	if rest, found := strings.CutPrefix(wire, "chain:"); found {
		idxStr, k, found2 := strings.Cut(rest, ":")
		if !found2 || !mixerStripKeys[k] {
			return 0, "", false
		}
		n, err := strconv.Atoi(idxStr)
		if err != nil || n < 0 || n >= maxChainSlots {
			return 0, "", false
		}
		return uint8(n), "slot:" + k, true
	}
	if rest, found := strings.CutPrefix(wire, "move_fx:"); found {
		busStr, k, found2 := strings.Cut(rest, ":")
		if !found2 || !mixerStripKeys[k] {
			return 0, "", false
		}
		b, err := strconv.Atoi(busStr)
		if err != nil || b < 1 || b > moveBusCount {
			return 0, "", false
		}
		return 0, wire, true // move_fx keys are self-addressing on the mailbox
	}
	return 0, "", false
}

// mixerShmToWire translates a notify-ring change to the wire form, or
// ok=false when the change is not part of the mixer surface.
func mixerShmToWire(slot uint8, key string) (wire string, ok bool) {
	// The instrument identity, READ-ONLY on the wire (mixerWireToShm refuses
	// it): loading an instrument is a set of "synth:module", and without this
	// the page kept the name it was seeded with until a reload — the Sound
	// view stayed on the old instrument's card.
	if key == "synth:module" || key == "synth_module" {
		if slot >= maxChainSlots {
			return "", false
		}
		return "chain:" + strconv.Itoa(int(slot)) + ":synth_module", true
	}
	if k, found := strings.CutPrefix(key, "slot:"); found {
		if !mixerStripKeys[k] || slot >= maxChainSlots {
			return "", false
		}
		return "chain:" + strconv.Itoa(int(slot)) + ":" + k, true
	}
	if rest, found := strings.CutPrefix(key, "move_fx:"); found {
		busStr, k, found2 := strings.Cut(rest, ":")
		if !found2 || !mixerStripKeys[k] || slot != 0 {
			return "", false
		}
		b, err := strconv.Atoi(busStr)
		if err != nil || b < 1 || b > moveBusCount {
			return "", false
		}
		return key, true
	}
	return "", false
}
