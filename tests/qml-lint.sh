#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/.." && pwd)
OMARCHY_ROOT=${OMARCHY_PATH:-}

fail() {
  echo "qml-lint: $*" >&2
  exit 1
}

if [[ -z $OMARCHY_ROOT && -d $PROJECT_ROOT/../omarchy-core/shell ]]; then
  OMARCHY_ROOT=$(cd "$PROJECT_ROOT/../omarchy-core" && pwd)
fi

[[ -n $OMARCHY_ROOT && -d $OMARCHY_ROOT/shell ]] || fail "set OMARCHY_PATH to an Omarchy checkout"
command -v qmllint >/dev/null 2>&1 || fail "qmllint is required; run this check in the Omarchy development environment"

qmllint -I "$OMARCHY_ROOT/shell" \
  "$PROJECT_ROOT/Service.qml" \
  "$PROJECT_ROOT/BarWidget.qml" \
  "$PROJECT_ROOT/Overlay.qml"
