#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/../.." && pwd)
RELEASE_SCRIPT="$PROJECT_ROOT/scripts/release-assets.sh"
EXPECTED_VERSION=$(jq -r '.version' "$PROJECT_ROOT/manifest.json")
EXPECTED_TAG="v$EXPECTED_VERSION"
TEMP_ROOT=$(mktemp -d)

cleanup() {
  rm -r -- "$TEMP_ROOT"
}
trap cleanup EXIT

fail() {
  echo "release-assets-test: $*" >&2
  exit 1
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    fail "command unexpectedly succeeded: $*"
  fi
}

first="$TEMP_ROOT/first"
second="$TEMP_ROOT/second"

bash "$RELEASE_SCRIPT" build "$EXPECTED_TAG" "$first"
bash "$RELEASE_SCRIPT" verify "$EXPECTED_TAG" "$first"
bash "$RELEASE_SCRIPT" build "$EXPECTED_TAG" "$second"

cmp "$first/intermission-$EXPECTED_VERSION.tar.gz" \
  "$second/intermission-$EXPECTED_VERSION.tar.gz" >/dev/null \
  || fail "release archives are not deterministic"
cmp "$first/intermission-$EXPECTED_VERSION.tar.gz.sha256" \
  "$second/intermission-$EXPECTED_VERSION.tar.gz.sha256" >/dev/null \
  || fail "release checksums are not deterministic"
cmp "$first/intermission-$EXPECTED_VERSION.provenance.json" \
  "$second/intermission-$EXPECTED_VERSION.provenance.json" >/dev/null \
  || fail "release provenance is not deterministic"

expect_failure bash "$RELEASE_SCRIPT" build v1.2 "$TEMP_ROOT/malformed"
expect_failure bash "$RELEASE_SCRIPT" build v999.0.0 "$TEMP_ROOT/mismatch"
expect_failure bash "$RELEASE_SCRIPT" build "$EXPECTED_TAG" "$first"

echo "ok - deterministic release assets"
