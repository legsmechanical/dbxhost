package main

// The channel strip's gain reduction on the mixer wire.
//
// Every other mixer key reaches the page through the notify ring, which fires
// on a SET. A compressor's gain reduction ("comp_gr", dB <= 0) is not set by
// anyone — it is what the audio is doing now — so nothing would ever push it.
// The manager polls it instead, the way the device's own screen does
// (davebox/ui/ui_sound.mjs, STRIP_GR_TICKS): only while a page is subscribed
// to the mixer, only for positions whose comp is on, and only changes go out.
// A position whose comp is turned off gets one final "0.00" so its meter
// settles rather than freezing mid-swing.

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ~8 a second: the device reads at ~12 Hz for one position; this is a
// mailbox read per comp that is on, shared with every other browser read.
const mixerGrInterval = 125 * time.Millisecond

type mixerGrState struct {
	mu     sync.Mutex
	compOn map[string]bool   // wire prefix ("chain:3:") -> its comp is above 0
	last   map[string]string // wire prefix -> the last comp_gr sent
}

var mixerGr = mixerGrState{compOn: map[string]bool{}, last: map[string]string{}}

// mixerNoteComp records which positions have their comp on, from any batch of
// wire values (the subscribe seed, a notify-ring change, a bulk strip write).
func (ru *RemoteUI) mixerNoteComp(wire map[string]string) {
	mixerGr.mu.Lock()
	defer mixerGr.mu.Unlock()
	for k, v := range wire {
		prefix, found := strings.CutSuffix(k, ":comp")
		if !found {
			continue
		}
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		mixerGr.compOn[prefix+":"] = err == nil && f > 0
	}
}

// mixerGrShm is the (slot, mailbox key) of a position's comp_gr.
func mixerGrShm(prefix string) (slot uint8, key string, ok bool) {
	if rest, found := strings.CutPrefix(prefix, "chain:"); found {
		n, err := strconv.Atoi(strings.TrimSuffix(rest, ":"))
		if err != nil || n < 0 || n >= maxChainSlots {
			return 0, "", false
		}
		return uint8(n), "slot:comp_gr", true
	}
	if strings.HasPrefix(prefix, "move_fx:") {
		b, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(prefix, "move_fx:"), ":"))
		if err != nil || b < 1 || b > moveBusCount {
			return 0, "", false
		}
		return 0, prefix + "comp_gr", true
	}
	return 0, "", false
}

// mixerGrPlan is one poll's work: the positions to read, and the ones whose
// comp went off since the last poll (each sent "0.00" once, then forgotten).
func mixerGrPlan() (read []string, settle []string) {
	mixerGr.mu.Lock()
	defer mixerGr.mu.Unlock()
	for p, on := range mixerGr.compOn {
		if on {
			read = append(read, p)
		} else {
			if last, had := mixerGr.last[p]; had && last != "0.00" {
				settle = append(settle, p)
			}
			delete(mixerGr.last, p)
			delete(mixerGr.compOn, p)
		}
	}
	return read, settle
}

// mixerGrResend forgets what was sent, so a page that subscribes now gets
// every position's reduction on the next poll, not just the next change.
func mixerGrResend() {
	mixerGr.mu.Lock()
	mixerGr.last = map[string]string{}
	mixerGr.mu.Unlock()
}

// mixerGrChanged keeps `v` as prefix's last value; true when it differs.
func mixerGrChanged(prefix, v string) bool {
	mixerGr.mu.Lock()
	defer mixerGr.mu.Unlock()
	if mixerGr.last[prefix] == v {
		return false
	}
	mixerGr.last[prefix] = v
	return true
}

func (ru *RemoteUI) mixerSubscribers() []*ruClient {
	ru.mu.Lock()
	clients := make([]*ruClient, 0, len(ru.clients))
	for c := range ru.clients {
		clients = append(clients, c)
	}
	ru.mu.Unlock()
	out := clients[:0]
	for _, c := range clients {
		c.mu.Lock()
		sub := c.mixerSub
		c.mu.Unlock()
		if sub {
			out = append(out, c)
		}
	}
	return out
}

// mixerGrLoop polls the gain reduction of every position whose comp is on.
func (ru *RemoteUI) mixerGrLoop(ctx context.Context) {
	t := time.NewTicker(mixerGrInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		subs := ru.mixerSubscribers()
		if len(subs) == 0 {
			continue
		}
		read, settle := mixerGrPlan()
		if len(read) == 0 && len(settle) == 0 {
			continue
		}
		out := make(map[string]string)
		for _, p := range settle {
			out[p+"comp_gr"] = "0.00"
		}
		if shm := ru.ensureShm(); shm != nil {
			for _, p := range read {
				slot, key, ok := mixerGrShm(p)
				if !ok {
					continue
				}
				v, err := shm.GetParam(slot, key)
				if err != nil {
					continue
				}
				v = strings.TrimSpace(v)
				if mixerGrChanged(p, v) {
					out[p+"comp_gr"] = v
				}
			}
		}
		if len(out) == 0 {
			continue
		}
		update := wsParamUpdate{Type: "param_update", Slot: 0, Params: out}
		for _, c := range subs {
			ru.writeJSONTry(ctx, c, update)
		}
	}
}
