#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/.." && pwd)
OMARCHY_ROOT=${OMARCHY_PATH:-}

fail() {
  echo "compatibility-checks: $*" >&2
  exit 1
}

if [[ -z $OMARCHY_ROOT && -d $PROJECT_ROOT/../omarchy-core/shell ]]; then
  OMARCHY_ROOT=$(cd "$PROJECT_ROOT/../omarchy-core" && pwd)
fi

[[ -n $OMARCHY_ROOT && -d $OMARCHY_ROOT/shell ]] || fail "set OMARCHY_PATH to an Omarchy checkout"
[[ -f $OMARCHY_ROOT/bin/omarchy-plugin-validate ]] \
  || fail "Omarchy plugin validator not found under $OMARCHY_ROOT"
command -v jq >/dev/null 2>&1 || fail "jq is required"

OMARCHY_PATH=$OMARCHY_ROOT bash "$TEST_DIR/shell/scaffold-test.sh"
OMARCHY_PATH=$OMARCHY_ROOT bash "$TEST_DIR/qml-lint.sh"

probe_root=$(mktemp -d "${TMPDIR:-/tmp}/intermission-compatibility.XXXXXX")
cleanup() {
  [[ -n $probe_root && -d $probe_root ]] || return 0
  [[ $(basename "$probe_root") == intermission-compatibility.* ]] \
    || fail "refusing to clean unexpected probe path: $probe_root"
  rm -rf -- "$probe_root"
}
trap cleanup EXIT

manifest_probe=$probe_root/manifest
mkdir -p "$manifest_probe"
cp "$PROJECT_ROOT/manifest.json" "$manifest_probe/manifest.json"
while IFS= read -r entry_point; do
  mkdir -p "$manifest_probe/$(dirname "$entry_point")"
  cp "$PROJECT_ROOT/$entry_point" "$manifest_probe/$entry_point"
done < <(jq -r '.entryPoints[]' "$PROJECT_ROOT/manifest.json")

jq '.entryPoints.service = "MissingCompatibilityProbe.qml"' \
  "$manifest_probe/manifest.json" > "$manifest_probe/manifest.next.json"
mv "$manifest_probe/manifest.next.json" "$manifest_probe/manifest.json"

set +e
manifest_output=$(bash "$OMARCHY_ROOT/bin/omarchy-plugin-validate" "$manifest_probe" 2>&1)
manifest_status=$?
set -e
((manifest_status != 0)) || fail "broken manifest entry point unexpectedly passed validation"
grep -F "entry point file not found: 'MissingCompatibilityProbe.qml'" <<<"$manifest_output" >/dev/null \
  || fail "broken manifest failed without the expected actionable error"
echo "ok - broken manifest entry point is rejected"

qml_probe=$probe_root/qml
mkdir -p "$qml_probe/lib"
sed 's/^import qs\.Ui$/import qs.BrokenCompatibilityProbe/' \
  "$PROJECT_ROOT/BarWidget.qml" > "$qml_probe/BarWidget.qml"
cp "$PROJECT_ROOT/lib/Settings.js" "$qml_probe/lib/Settings.js"
grep -F 'import qs.BrokenCompatibilityProbe' "$qml_probe/BarWidget.qml" >/dev/null \
  || fail "could not create the broken QML import probe"

set +e
qml_output=$(OMARCHY_PATH=$OMARCHY_ROOT bash "$TEST_DIR/qml-lint.sh" "$qml_probe/BarWidget.qml" 2>&1)
qml_status=$?
set -e
((qml_status != 0)) || fail "broken QML import unexpectedly passed lint"
grep -F 'qs.BrokenCompatibilityProbe' <<<"$qml_output" >/dev/null \
  || fail "broken QML import failed without the expected actionable error"
echo "ok - broken QML import is rejected"

echo "ok - compatibility checks"
