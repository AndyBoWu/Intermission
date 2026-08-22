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
}
trap cleanup EXIT

wait_for_status() {
  local expected=$1
  local actual=""

  for _attempt in {1..30}; do
    actual=$(omarchy-shell shell call "$PLUGIN_ID" status '{}' 2>/dev/null || true)
    [[ $actual == "$expected" ]] && return 0
    sleep 0.1
  done

  fail "expected overlay status '$expected', got '${actual:-unavailable}'"
}

summon_result=$(omarchy-shell shell summon "$PLUGIN_ID" '{}')
[[ $summon_result == ok ]] || fail "summon failed: $summon_result"
wait_for_status open

omarchy-shell shell hide "$PLUGIN_ID"
wait_for_status closed

trap - EXIT
echo "ok - live loader transitions closed -> open -> closed"
