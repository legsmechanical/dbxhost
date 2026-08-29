# Host-side unit tests for code that's worth testing standalone, on the
# dev machine, without the Move device or its toolchain.
#
# Currently:
#   - test_midi_coalesce — relative-encoder CC merging: lossless for knobs,
#     and provably inert for notes/buttons (merging those would DELETE a
#     press or release, the bug it exists to make rarer).
#   - test_timespec_delta — elapsed-microsecond maths across a second boundary,
#     where the obvious inline version wraps to ~1.8e16 and poisons a max tracker.
#   - test_ui_midi_policy — which events may be dropped from the shim ->
#     shadow_ui ring when it is full: knob detents yes, presses/releases never.
#   - test_midi_inject_writer — exercises the lock-free MPSC helper for
#     the /schwung-midi-inject ring with multi-threaded producers.
#   - test_sa_master_volume — the session's own master volume, which Move's
#     Settings.json cannot carry (see src/host/sa_master_volume.h).
#   - test_spawn_command — the exit-status/PATH contract of the process
#     launcher that replaced fork + execvp (see src/host/spawn_command.h).
#   - test_stipple — the checkerboard parity rule behind stipple_rect: 50%
#     coverage, complementary phases, a CHECKERBOARD rather than stripes (a
#     row-parity bug passes the first two), and no seam across a call boundary.
#
# Usage: `make -C tests/host test`

CC ?= cc
CFLAGS ?= -O2 -g -Wall -Wextra -Wno-unused-parameter -std=c11
INCLUDES = -I../../src/host
LDFLAGS = -lpthread

BUILD_DIR = ../../build/tests/host

TARGETS = $(BUILD_DIR)/test_timespec_delta \
          $(BUILD_DIR)/test_midi_coalesce \
          $(BUILD_DIR)/test_ui_midi_policy \
          $(BUILD_DIR)/test_midi_inject_writer \
          $(BUILD_DIR)/test_sa_master_volume \
          $(BUILD_DIR)/test_spawn_command \
          $(BUILD_DIR)/test_stipple \
          $(BUILD_DIR)/test_shadow_midi_out_capacity \
          $(BUILD_DIR)/test_midi_in_compact

.PHONY: all test clean

all: $(TARGETS)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

# -MMD -MP emits a .d file per target listing the HEADERS it included, and the
# -include below feeds those back to make.
#
# ⚠⚠ Without this, editing a header-only unit does NOT rebuild its test: make
# sees the .c unchanged and reuses the old binary, so the suite passes against
# the PREVIOUS code. Found 2026-08-25 by mutation-testing shadow_midi_coalesce.h
# — two mutations "survived" that the tests do in fact catch, because the binary
# under test was stale. A green run meant nothing for every header-only unit
# here (sa_master_volume.h, spawn_command.h, surface_trace.h included).
#
# ⚠ The .d files only exist AFTER one build, so the very first run in a clean
# tree still cannot know its headers — that is inherent to this scheme, not a
# bug. It cost a confused round here: two mutations reported SURVIVED, were
# diagnosed as stale, and still reported SURVIVED until a bootstrap build had
# generated the deps. If a mutation on a header-only unit survives, run
# `make -C tests/host all` once and try again before believing it.
$(BUILD_DIR)/%: %.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -MMD -MP $< -o $@ $(LDFLAGS)

# Links the unit under test rather than re-declaring it: a test that copies the
# implementation passes forever after the real one changes.
$(BUILD_DIR)/test_sa_master_volume: test_sa_master_volume.c ../../src/host/sa_master_volume.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -MMD -MP $^ -o $@ $(LDFLAGS) -lm

$(BUILD_DIR)/test_spawn_command: test_spawn_command.c ../../src/host/spawn_command.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -MMD -MP $^ -o $@ $(LDFLAGS)

$(BUILD_DIR)/test_midi_in_compact: test_midi_in_compact.c ../../src/host/shadow_midi_filter.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -MMD -MP -MF $@.d $^ -o $@ $(LDFLAGS)

-include $(TARGETS:=.d)

test: $(TARGETS)
	@for t in $(TARGETS); do \
		echo "==> $$t"; \
		$$t || exit 1; \
	done

clean:
	rm -rf $(BUILD_DIR)
