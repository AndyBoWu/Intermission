#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/../.." && pwd)
PLUGIN_ID=$(jq -r '.id' "$PROJECT_ROOT/manifest.json")

fail() {
  echo "live-lifecycle-test: $*" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || fail "jq is required"
command -v omarchy-shell >/dev/null 2>&1 || fail "omarchy-shell is required; run this test inside Omarchy"

plugins=$(omarchy-shell shell listPlugins)
jq -e --arg id "$PLUGIN_ID" '.[] | select(.id == $id and .enabled == true)' <<<"$plugins" >/dev/null \
  || fail "$PLUGIN_ID is not installed and enabled"

cleanup() {
  omarchy-shell shell hide "$PLUGIN_ID" >/dev/null 2>&1 || true
  omarchy-shell "$PLUGIN_ID" hideOverlay '{"reason":"ipc"}' >/dev/null 2>&1 || true
  omarchy-shell "$PLUGIN_ID" completeBreak '{"source":"ipc"}' >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_status() {
  local expected=$1
  local attempts=${2:-30}
  local actual=""

  for ((attempt = 0; attempt < attempts; attempt += 1)); do
    actual=$(omarchy-shell shell call "$PLUGIN_ID" status '{}' 2>/dev/null || true)
    [[ $actual == "$expected" ]] && return 0
    sleep 0.1
  done

  fail "expected overlay status '$expected', got '${actual:-unavailable}'"
}

call_service() {
  local method=$1
  local payload=$2
  local result=""

  result=$(omarchy-shell "$PLUGIN_ID" "$method" "$payload")
  jq -e '.ok == true' <<<"$result" >/dev/null || fail "$method failed: $result"
}

# Normalize any existing live cadence before the test. In particular, start is
# intentionally idempotent while idle, but startBreak requires an active phase.
call_service stopCadence '{}'
call_service start '{}'
call_service startBreak '{"kind":"short"}'
wait_for_status open

call_service hideOverlay '{"reason":"ipc"}'
wait_for_status closed 10

call_service openOverlay '{}'
call_service openOverlay '{}'
wait_for_status open

call_service completeBreak '{"source":"ipc"}'
wait_for_status closed 10

trap - EXIT
echo "ok - live break lifecycle opens, hides, reopens, and completes"
