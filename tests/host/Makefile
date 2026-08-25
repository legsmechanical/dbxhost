# Host-side unit tests for code that's worth testing standalone, on the
# dev machine, without the Move device or its toolchain.
#
# Currently:
#   - test_midi_inject_writer — exercises the lock-free MPSC helper for
#     the /schwung-midi-inject ring with multi-threaded producers.
#   - test_sa_master_volume — the session's own master volume, which Move's
#     Settings.json cannot carry (see src/host/sa_master_volume.h).
#   - test_spawn_command — the exit-status/PATH contract of the process
#     launcher that replaced fork + execvp (see src/host/spawn_command.h).
#
# Usage: `make -C tests/host test`

CC ?= cc
CFLAGS ?= -O2 -g -Wall -Wextra -Wno-unused-parameter -std=c11
INCLUDES = -I../../src/host
LDFLAGS = -lpthread

BUILD_DIR = ../../build/tests/host

TARGETS = $(BUILD_DIR)/test_midi_inject_writer \
          $(BUILD_DIR)/test_sa_master_volume \
          $(BUILD_DIR)/test_spawn_command

.PHONY: all test clean

all: $(TARGETS)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/%: %.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) $< -o $@ $(LDFLAGS)

# Links the unit under test rather than re-declaring it: a test that copies the
# implementation passes forever after the real one changes.
$(BUILD_DIR)/test_sa_master_volume: test_sa_master_volume.c ../../src/host/sa_master_volume.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) $^ -o $@ $(LDFLAGS) -lm

$(BUILD_DIR)/test_spawn_command: test_spawn_command.c ../../src/host/spawn_command.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) $^ -o $@ $(LDFLAGS)

test: $(TARGETS)
	@for t in $(TARGETS); do \
		echo "==> $$t"; \
		$$t || exit 1; \
	done

clean:
	rm -rf $(BUILD_DIR)
