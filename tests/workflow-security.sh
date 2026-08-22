#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/.." && pwd)
ACTIONLINT_IMAGE='rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667'
ZIZMOR_IMAGE='ghcr.io/zizmorcore/zizmor@sha256:863026d54f91271b10b60b67ad8054cb37120167e162482597db102b3026a284'

fail() {
  echo "workflow-security: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker is required"

docker run --rm \
  --workdir /repo \
  --volume "$PROJECT_ROOT:/repo:ro" \
  "$ACTIONLINT_IMAGE" -color

docker run --rm \
  --workdir /repo \
  --volume "$PROJECT_ROOT:/repo:ro" \
  "$ZIZMOR_IMAGE" \
  --offline \
  --strict-collection \
  --color=never \
  .

echo "ok - workflow security"
