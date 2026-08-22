#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/../.." && pwd)
OMARCHY_ROOT=${OMARCHY_PATH:-}

fail() {
  echo "scaffold-test: $*" >&2
  exit 1
}

if [[ -z $OMARCHY_ROOT && -f $PROJECT_ROOT/../omarchy-core/bin/omarchy-plugin-validate ]]; then
  OMARCHY_ROOT=$(cd "$PROJECT_ROOT/../omarchy-core" && pwd)
fi

[[ -n $OMARCHY_ROOT ]] || fail "set OMARCHY_PATH to an Omarchy checkout"
[[ -f $OMARCHY_ROOT/bin/omarchy-plugin-validate ]] || fail "Omarchy plugin validator not found under $OMARCHY_ROOT"
command -v jq >/dev/null 2>&1 || fail "jq is required"

bash "$OMARCHY_ROOT/bin/omarchy-plugin-validate" "$PROJECT_ROOT"

manifest_count=$(find "$PROJECT_ROOT" -path "$PROJECT_ROOT/.git" -prune -o -name manifest.json -type f -print | wc -l | tr -d ' ')
[[ $manifest_count == 1 ]] || fail "expected exactly one manifest.json, found $manifest_count"

for required in README.md LICENSE; do
  [[ -f $PROJECT_ROOT/$required ]] || fail "missing root $required"
done

plugin_id=$(jq -r '.id' "$PROJECT_ROOT/manifest.json")
[[ $plugin_id == io.github.andybowu.intermission ]] || fail "unexpected plugin id: $plugin_id"
jq -e '.barWidget.allowMultiple == false' "$PROJECT_ROOT/manifest.json" >/dev/null

for mapping in service:service bar-widget:barWidget overlay:overlay; do
  kind=${mapping%%:*}
  entry_key=${mapping##*:}
  jq -e --arg kind "$kind" '.kinds | index($kind) != null' "$PROJECT_ROOT/manifest.json" >/dev/null
  entry_path=$(jq -r --arg key "$entry_key" '.entryPoints[$key] // empty' "$PROJECT_ROOT/manifest.json")
  [[ -n $entry_path && -f $PROJECT_ROOT/$entry_path ]] || fail "$kind entry point is missing"
done

link=$(find "$PROJECT_ROOT" -path "$PROJECT_ROOT/.git" -prune -o -type l -print -quit)
[[ -z $link ]] || fail "symlinks are not allowed: $link"

grep -Eq 'function[[:space:]]+open\(' "$PROJECT_ROOT/Overlay.qml" || fail "overlay open lifecycle is missing"
grep -Eq 'function[[:space:]]+close\(' "$PROJECT_ROOT/Overlay.qml" || fail "overlay close lifecycle is missing"
grep -Eq 'function[[:space:]]+status\(' "$PROJECT_ROOT/Overlay.qml" || fail "overlay status probe is missing"
grep -Eq 'function[[:space:]]+open\(' "$PROJECT_ROOT/BarWidget.qml" || fail "bar open lifecycle is missing"
grep -Eq 'function[[:space:]]+close\(' "$PROJECT_ROOT/BarWidget.qml" || fail "bar close lifecycle is missing"
grep -Eq 'function[[:space:]]+toggle\(' "$PROJECT_ROOT/BarWidget.qml" || fail "bar toggle lifecycle is missing"

runtime_files=(
  "$PROJECT_ROOT/manifest.json"
  "$PROJECT_ROOT/Service.qml"
  "$PROJECT_ROOT/BarWidget.qml"
  "$PROJECT_ROOT/Overlay.qml"
)

if grep -Eni '(^|[^[:alnum:]_])(sudo|systemctl|curl|wget)([^[:alnum:]_]|$)|https?://|execDetached|Process[[:space:]]*\{' "${runtime_files[@]}"; then
  fail "runtime scaffold contains a prohibited dependency"
fi

echo "ok - scaffold contract"
