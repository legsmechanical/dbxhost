#!/usr/bin/env bash
set -euo pipefail

# The RT load signal must measure WORK, not the frame period.
#
# The SPI callback's frame total spans ioctl_start -> ioctl_end, which includes
# the ioctl that BLOCKS until the next frame boundary. That span therefore sits
# at ~one block period (~2900us at 44.1kHz/128) whether the device is saturated
# or completely idle. Comparing a budget against it is not a load measure: it
# made an idle session report tens of thousands of "overruns", and it is the
# reason nothing in the tree could answer "does more DSP fit?".
#
# The real budget is the ~900us of work left after the transfer, and the number
# that responds to load is compute = pre + post.
#
# This pins the three ways that regressed before:
#   1. the over-budget test compares COMPUTE, not the frame total
#   2. the retired frame-total threshold does not come back
#   3. no write-only latch feeding the check (spi_last_frame_total_us was
#      written every frame and read nowhere)

shim="src/schwung_shim.c"

if ! grep -q '^#define SPI_COMPUTE_BUDGET_US' "$shim"; then
  echo "FAIL: SPI_COMPUTE_BUDGET_US is gone — the work budget must stay named" >&2
  exit 1
fi

# The over-budget comparisons must be against compute.
if ! grep -q 'if (compute_us > SPI_COMPUTE_BUDGET_US)' "$shim"; then
  echo "FAIL: the over-budget counter no longer tests compute_us" >&2
  exit 1
fi
if ! grep -q 'if (spi_last_frame_compute_us > SPI_COMPUTE_BUDGET_US)' "$shim"; then
  echo "FAIL: the consecutive-overrun check no longer tests compute" >&2
  exit 1
fi

# The old threshold must not return as CODE. (Prose mentioning it is fine and
# expected — the comment explaining why it went is worth keeping, so match a
# definition or a comparison rather than the bare name.)
if grep -qE '^#define OVERRUN_THRESHOLD_US|[<>=] *OVERRUN_THRESHOLD_US' "$shim"; then
  echo "FAIL: OVERRUN_THRESHOLD_US is back in code. It was compared against the" >&2
  echo "      frame total (which includes the blocking ioctl) and fired when idle." >&2
  exit 1
fi

# No budget/overrun test may compare a *_total_us against a work-shaped number.
# Match a real condition (`if (... total_us > N)`), so the comment recording the
# old `total_us > 2000` test can stay as the explanation of why this pin exists.
if grep -nE 'if *\(.*total_us *> *[0-9]+' "$shim"; then
  echo "FAIL: something compares a frame total against a threshold again." >&2
  echo "      The frame total is the block PERIOD, not work — use compute_us." >&2
  exit 1
fi

# Write-only latch guard: every compute stat that feeds a decision must be read.
for sym in spi_last_frame_compute_us; do
  reads="$(grep -c "$sym" "$shim" || true)"
  # declaration + write + at least one read
  if [ "$reads" -lt 3 ]; then
    echo "FAIL: $sym has $reads references — it looks write-only." >&2
    echo "      A guard whose input is never read is not a guard." >&2
    exit 1
  fi
done

# The load line must be logged, or the measurement is unavailable on device.
if ! grep -q '"Compute(us): avg=' "$shim"; then
  echo "FAIL: the Compute(us) log line is gone — the budget becomes unmeasurable" >&2
  echo "      on hardware, which is what made 8-slot sizing a guess before." >&2
  exit 1
fi

echo "PASS: RT budget signal measures compute (pre+post) against SPI_COMPUTE_BUDGET_US; no frame-total threshold; no write-only latch"
exit 0
