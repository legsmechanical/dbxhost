package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// errParamRefused: the host ANSWERED, and the answer was "no" — the key is not
// one this module has (its error flag), or it returned no value. A definite
// reply, unlike a busy channel or a response timeout: retrying it only repeats
// the no, and cost every empty chain position about a second.
var errParamRefused = errors.New("param refused by the host")

// errRequestLost: another writer claimed the slot over this request; it
// will never be answered. Safe to ask again.
var errRequestLost = errors.New("param request lost to another writer")

// lostRetries: how many times a read asks again after errRequestLost.
const lostRetries = 3

// ShmParams provides access to the shadow_param_t shared memory segment for
// getting and setting module parameters. The protocol is request/response:
// only one request can be in-flight at a time (serialised by the Go mutex,
// with a wait-for-idle loop to handle contention with the JS shadow UI).
//
// Field offsets must match shadow_param_t in src/host/shadow_constants.h.
//
// ⚠ The HOST clears request_type when it answers (shadow_param_publish_response).
// The manager must never clear it itself: by the time it has read the answer
// the shadow UI may already have claimed the slot, and a second "idle" write
// erased that request — the UI's read then timed out. Likewise on a timeout:
// a request still in the slot is either ours (the host will answer it and
// clear it) or the UI's (not ours to cancel).
type ShmParams struct {
	data      []byte
	mu        sync.Mutex
	nextReqID atomic.Uint32
}

// Byte offsets into shadow_param_t.
// Struct layout (ARM64, packed uint8 fields then naturally aligned uint32/64):
//
//	uint8_t  request_type   @ 0
//	uint8_t  slot           @ 1
//	uint8_t  response_ready @ 2
//	uint8_t  error          @ 3
//	uint32_t request_id     @ 4
//	uint32_t response_id    @ 8
//	int32_t  result_len     @ 12
//	uint64_t trace_id       @ 16   (OTLP trace context, Phase 2b)
//	uint64_t parent_span_id @ 24   (OTLP trace context, Phase 2b)
//	char     key[64]        @ 32
//	char     value[65536]   @ 96
//
// NOTE: the two uint64 trace fields were added to shadow_param_t by the OTLP
// trace work (5a5aa645) and pushed key/value down by 16 bytes. This Go mirror
// must track that or every request's key lands at the wrong offset, the shim
// reads an empty key, and every GET returns empty (remote UI shows "no module"
// and default slot params).
const (
	paramOffRequestType   = 0
	paramOffSlot          = 1
	paramOffResponseReady = 2
	paramOffError         = 3
	paramOffRequestID     = 4
	paramOffResponseID    = 8
	paramOffResultLen     = 12
	paramOffTraceID       = 16
	paramOffParentSpanID  = 24
	paramOffKey           = 32
	paramOffValue         = 96

	paramKeyLen   = 64
	paramValueLen = 65536

	// SHADOW_PARAM_BUFFER_SIZE from shadow_constants.h
	shmParamSize = 65664

	// Timeouts — kept short to avoid blocking the poll loop when
	// contending with shadow_ui.js for the single param channel.
	paramIdleTimeout     = 200 * time.Millisecond
	paramResponseTimeout = 500 * time.Millisecond
	paramPollInterval    = 500 * time.Microsecond
)

var shmParamPath = shmPath("param")

// OpenShmParams opens and mmaps the param shared memory segment.
// Returns nil if the segment doesn't exist (not running on device).
func OpenShmParams() *ShmParams {
	f, err := os.OpenFile(shmParamPath, os.O_RDWR, 0)
	if err != nil {
		return nil
	}
	defer f.Close()

	data, err := syscall.Mmap(int(f.Fd()), 0, shmParamSize,
		syscall.PROT_READ|syscall.PROT_WRITE, syscall.MAP_SHARED)
	if err != nil {
		return nil
	}

	return &ShmParams{data: data}
}

// TryGetParam is like GetParam but returns immediately if the mutex is held
// (e.g., by a concurrent SetParam from user interaction). Used by the poll loop
// so background polling never blocks user-initiated param changes.
func (s *ShmParams) TryGetParam(slot uint8, key string) (string, bool, error) {
	if !s.mu.TryLock() {
		return "", false, nil // busy, skip
	}
	defer s.mu.Unlock()

	if len(key) >= paramKeyLen {
		return "", true, fmt.Errorf("key too long (%d >= %d)", len(key), paramKeyLen)
	}

	if err := s.waitIdle(); err != nil {
		return "", true, err
	}

	reqID := s.nextReqID.Add(1)

	s.data[paramOffSlot] = slot
	s.data[paramOffResponseReady] = 0
	s.data[paramOffError] = 0
	binary.LittleEndian.PutUint32(s.data[paramOffRequestID:], reqID)

	copy(s.data[paramOffKey:paramOffKey+paramKeyLen], make([]byte, paramKeyLen))
	copy(s.data[paramOffKey:], key)

	s.data[paramOffRequestType] = 2

	if err := s.waitResponse(reqID); err != nil {
		return "", true, err
	}

	if s.data[paramOffError] != 0 {
		return "", true, fmt.Errorf("param get error (slot=%d key=%q)", slot, key)
	}

	resultLen := int32(binary.LittleEndian.Uint32(s.data[paramOffResultLen:]))
	if resultLen < 0 {
		return "", true, fmt.Errorf("param get failed (result_len=%d)", resultLen)
	}
	if int(resultLen) > paramValueLen {
		resultLen = int32(paramValueLen)
	}

	value := string(s.data[paramOffValue : paramOffValue+int(resultLen)])
	return value, true, nil
}

// SetParamFast writes a param without waiting for the shim's response.
// Latency: ~5ms idle wait + ~3ms shim processing = ~8ms total.
// Safe for knob dragging where the next value overwrites the previous.
func (s *ShmParams) SetParamFast(slot uint8, key, value string) error {
	if len(key) >= paramKeyLen {
		return fmt.Errorf("key too long (%d >= %d)", len(key), paramKeyLen)
	}
	if len(value) >= paramValueLen {
		return fmt.Errorf("value too long (%d >= %d)", len(value), paramValueLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Short idle wait — if shadow_ui.js is mid-request, bail quickly.
	deadline := time.Now().Add(10 * time.Millisecond)
	for s.data[paramOffRequestType] != 0 {
		if time.Now().After(deadline) {
			return fmt.Errorf("param channel busy")
		}
		time.Sleep(paramPollInterval)
	}

	reqID := s.nextReqID.Add(1)

	s.data[paramOffSlot] = slot
	s.data[paramOffResponseReady] = 0
	s.data[paramOffError] = 0
	binary.LittleEndian.PutUint32(s.data[paramOffRequestID:], reqID)

	copy(s.data[paramOffKey:paramOffKey+paramKeyLen], make([]byte, paramKeyLen))
	copy(s.data[paramOffKey:], key)

	copy(s.data[paramOffValue:paramOffValue+len(value)], value)
	s.data[paramOffValue+len(value)] = 0

	// Fire and forget — shim processes on next audio block (~3ms).
	s.data[paramOffRequestType] = 1
	return nil
}

// GetParam reads a parameter from the given chain slot, asking again when
// the request was lost to the shadow UI's claim of the slot.
func (s *ShmParams) GetParam(slot uint8, key string) (string, error) {
	for try := 0; ; try++ {
		v, err := s.getParamOnce(slot, key)
		if !errors.Is(err, errRequestLost) || try >= lostRetries {
			return v, err
		}
	}
}

func (s *ShmParams) getParamOnce(slot uint8, key string) (string, error) {
	if len(key) >= paramKeyLen {
		return "", fmt.Errorf("key too long (%d >= %d)", len(key), paramKeyLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.waitIdle(); err != nil {
		return "", err
	}

	reqID := s.nextReqID.Add(1)

	// Write fields (request_type last to signal the request).
	s.data[paramOffSlot] = slot
	s.data[paramOffResponseReady] = 0
	s.data[paramOffError] = 0
	binary.LittleEndian.PutUint32(s.data[paramOffRequestID:], reqID)

	// Write null-terminated key.
	copy(s.data[paramOffKey:paramOffKey+paramKeyLen], make([]byte, paramKeyLen))
	copy(s.data[paramOffKey:], key)

	// Signal: get request.
	s.data[paramOffRequestType] = 2

	// Wait for response.
	if err := s.waitResponse(reqID); err != nil {
		return "", err
	}

	// Check error flag.
	if s.data[paramOffError] != 0 {
		return "", fmt.Errorf("param get error (slot=%d key=%q): %w", slot, key, errParamRefused)
	}

	// Read result.
	resultLen := int32(binary.LittleEndian.Uint32(s.data[paramOffResultLen:]))
	if resultLen < 0 {
		return "", fmt.Errorf("param get failed (result_len=%d): %w", resultLen, errParamRefused)
	}
	if int(resultLen) > paramValueLen {
		resultLen = int32(paramValueLen)
	}

	value := string(s.data[paramOffValue : paramOffValue+int(resultLen)])

	return value, nil
}

// SetParam writes a parameter to the given chain slot.
func (s *ShmParams) SetParam(slot uint8, key, value string) error {
	if len(key) >= paramKeyLen {
		return fmt.Errorf("key too long (%d >= %d)", len(key), paramKeyLen)
	}
	if len(value) >= paramValueLen {
		return fmt.Errorf("value too long (%d >= %d)", len(value), paramValueLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.waitIdle(); err != nil {
		return err
	}

	reqID := s.nextReqID.Add(1)

	// Write fields (request_type last to signal the request).
	s.data[paramOffSlot] = slot
	s.data[paramOffResponseReady] = 0
	s.data[paramOffError] = 0
	binary.LittleEndian.PutUint32(s.data[paramOffRequestID:], reqID)

	// Write null-terminated key.
	copy(s.data[paramOffKey:paramOffKey+paramKeyLen], make([]byte, paramKeyLen))
	copy(s.data[paramOffKey:], key)

	// Write null-terminated value.
	copy(s.data[paramOffValue:paramOffValue+len(value)], value)
	s.data[paramOffValue+len(value)] = 0

	// Signal: set request.
	s.data[paramOffRequestType] = 1

	// Wait for response.
	if err := s.waitResponse(reqID); err != nil {
		return err
	}

	if s.data[paramOffError] != 0 {
		return fmt.Errorf("param set error (slot=%d key=%q)", slot, key)
	}

	return nil
}

// waitIdle spins until request_type == 0, indicating the channel is free.
// Must be called with s.mu held.
func (s *ShmParams) waitIdle() error {
	deadline := time.Now().Add(paramIdleTimeout)
	for s.data[paramOffRequestType] != 0 {
		if time.Now().After(deadline) {
			return fmt.Errorf("param channel busy (timeout waiting for idle)")
		}
		time.Sleep(paramPollInterval)
	}
	return nil
}

// waitResponse spins until response_ready != 0 and response_id matches reqID.
// Must be called with s.mu held.
//
// errRequestLost: the slot's request_id is no longer ours — the shadow UI
// claimed the slot over this request (nothing makes the two writers'
// claims atomic), so it will never be answered. Reported at once rather
// than after the 500 ms timeout, so the caller can simply ask again. (Also
// reported when ours WAS answered and the slot re-claimed before this poll
// saw it — asking again costs one more read.)
func (s *ShmParams) waitResponse(reqID uint32) error {
	deadline := time.Now().Add(paramResponseTimeout)
	for {
		if s.data[paramOffResponseReady] != 0 {
			respID := binary.LittleEndian.Uint32(s.data[paramOffResponseID:])
			if respID == reqID {
				return nil
			}
		}
		if binary.LittleEndian.Uint32(s.data[paramOffRequestID:]) != reqID {
			return errRequestLost
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("param response timeout (reqID=%d)", reqID)
		}
		time.Sleep(paramPollInterval)
	}
}

// bulkMaxItems mirrors SHADOW_BULK_MAX_ITEMS in src/schwung_shim.c: the most
// keys one bulk request may carry. The host refuses a longer one outright.
const bulkMaxItems = 64

// errBulkUnresolved marks a key the bulk resolver did not understand (the
// host's "?" record) — NOT an empty value. The caller reads it one by one.
var errBulkUnresolved = errors.New("bulk: key not resolved")

// GetParamsBulk reads up to bulkMaxItems keys of one chain slot in ONE
// request (the host's `chain:` BULK GET, request type 3), so a panel's values
// cost one audio frame per chunk instead of one frame per value.
//
// The result holds one entry per key, in order: the value, or err set to
// errBulkUnresolved for a key the bulk path cannot resolve. ⚠ The bulk and
// single resolvers do not cover the same keys, and an unresolved key used to
// come back as an empty value with the count still right — so a caller MUST
// read a "?" key with GetParam, never treat it as "".
//
// Chain components only: master_fx: keys resolve only on the single path.
func (s *ShmParams) GetParamsBulk(slot uint8, keys []string) ([]BulkValue, error) {
	for try := 0; ; try++ {
		v, err := s.getParamsBulkOnce(slot, keys)
		if !errors.Is(err, errRequestLost) || try >= lostRetries {
			return v, err
		}
	}
}

func (s *ShmParams) getParamsBulkOnce(slot uint8, keys []string) ([]BulkValue, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	if len(keys) > bulkMaxItems {
		return nil, fmt.Errorf("bulk: %d keys (max %d)", len(keys), bulkMaxItems)
	}
	req := make([]byte, 0, 16+len(keys)*24)
	req = fmt.Appendf(req, "%d\n", len(keys))
	for _, k := range keys {
		if len(k) == 0 || len(k) >= paramKeyLen {
			return nil, fmt.Errorf("bulk: bad key %q", k)
		}
		req = fmt.Appendf(req, "%d\n%s", len(k), k)
	}
	if len(req) >= paramValueLen {
		return nil, fmt.Errorf("bulk: request too long (%d)", len(req))
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.waitIdle(); err != nil {
		return nil, err
	}
	reqID := s.nextReqID.Add(1)
	s.data[paramOffSlot] = slot
	s.data[paramOffResponseReady] = 0
	s.data[paramOffError] = 0
	binary.LittleEndian.PutUint32(s.data[paramOffRequestID:], reqID)
	copy(s.data[paramOffKey:paramOffKey+paramKeyLen], make([]byte, paramKeyLen))
	copy(s.data[paramOffKey:], "chain:")
	copy(s.data[paramOffValue:], req)
	s.data[paramOffValue+len(req)] = 0 // the host finds the payload's end by strnlen
	s.data[paramOffRequestType] = 3

	if err := s.waitResponse(reqID); err != nil {
		return nil, err
	}
	if s.data[paramOffError] != 0 {
		return nil, fmt.Errorf("bulk get error %d (slot=%d)", s.data[paramOffError], slot)
	}
	n := int32(binary.LittleEndian.Uint32(s.data[paramOffResultLen:]))
	if n < 0 || int(n) > paramValueLen {
		return nil, fmt.Errorf("bulk get failed (result_len=%d)", n)
	}
	resp := string(s.data[paramOffValue : paramOffValue+int(n)])
	return parseBulkResponse(resp, len(keys))
}

// BulkValue is one key's answer in a bulk read.
type BulkValue struct {
	Value string
	Err   error // errBulkUnresolved, or nil
}

// parseBulkResponse walks "<n>\n" then n records, each "<len>\n<bytes>" or
// "?\n" (unresolved). Lengths are BYTES. A reply whose count differs from the
// request is refused whole — not trusted record by record.
func parseBulkResponse(resp string, want int) ([]BulkValue, error) {
	num := func(s string) (int, string, bool) {
		i, v := 0, 0
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			v = v*10 + int(s[i]-'0')
			i++
		}
		if i == 0 || i >= len(s) || s[i] != '\n' {
			return 0, s, false
		}
		return v, s[i+1:], true
	}
	count, rest, ok := num(resp)
	if !ok || count != want {
		return nil, fmt.Errorf("bulk: reply count %d, asked %d", count, want)
	}
	out := make([]BulkValue, 0, count)
	for i := 0; i < count; i++ {
		if len(rest) >= 2 && rest[0] == '?' && rest[1] == '\n' {
			out = append(out, BulkValue{Err: errBulkUnresolved})
			rest = rest[2:]
			continue
		}
		l, r, ok := num(rest)
		if !ok || l > len(r) {
			return nil, fmt.Errorf("bulk: malformed record %d", i)
		}
		out = append(out, BulkValue{Value: r[:l]})
		rest = r[l:]
	}
	return out, nil
}
