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
var mixerStripKeys = map[string]bool{
	"volume": true, "pan": true, "send_a": true, "send_b": true,
	"muted": true, "soloed": true,
}

// mixerSeedKeys is what a fresh mixer subscription is seeded with: the strip
// surface plus the read-only instrument identity for the badge.
var mixerSeedKeys = []string{"volume", "pan", "send_a", "send_b", "muted", "soloed"}

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
