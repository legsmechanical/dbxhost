#!/usr/bin/env bash
set -euo pipefail
# P4a: the primary-surface claims engine is a pure function and every
# ownership transition must fall out of it — unit-tested off-device.
cd "$(dirname "$0")/../.."
node tests/host/test_primary_claims.mjs
