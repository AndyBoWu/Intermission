#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/.." && pwd)
OMARCHY_ROOT=${OMARCHY_PATH:-}
QMLLINT_COMMAND=${QMLLINT_BIN:-}

fail() {
  echo "qml-lint: $*" >&2
  exit 1
}

if [[ -z $OMARCHY_ROOT && -d $PROJECT_ROOT/../omarchy-core/shell ]]; then
  OMARCHY_ROOT=$(cd "$PROJECT_ROOT/../omarchy-core" && pwd)
fi

[[ -n $OMARCHY_ROOT && -d $OMARCHY_ROOT/shell ]] || fail "set OMARCHY_PATH to an Omarchy checkout"
command -v jq >/dev/null 2>&1 || fail "jq is required to summarize qmllint diagnostics"
[[ -f $OMARCHY_ROOT/shell/Ui/qmldir ]] || fail "Omarchy qs.Ui module is missing under $OMARCHY_ROOT/shell/Ui"
[[ -f $OMARCHY_ROOT/shell/Commons/qmldir ]] || fail "Omarchy qs.Commons module is missing under $OMARCHY_ROOT/shell/Commons"
grep -Eq '^module[[:space:]]+qs\.Ui[[:space:]]*$' "$OMARCHY_ROOT/shell/Ui/qmldir" \
  || fail "Omarchy Ui/qmldir does not declare qs.Ui"
grep -Eq '^module[[:space:]]+qs\.Commons[[:space:]]*$' "$OMARCHY_ROOT/shell/Commons/qmldir" \
  || fail "Omarchy Commons/qmldir does not declare qs.Commons"

if [[ -z $QMLLINT_COMMAND ]]; then
  if command -v qmllint >/dev/null 2>&1; then
    QMLLINT_COMMAND=$(command -v qmllint)
  elif [[ -x /usr/lib/qt6/bin/qmllint ]]; then
    QMLLINT_COMMAND=/usr/lib/qt6/bin/qmllint
  else
    fail "qmllint is required; install the Qt declarative tools or set QMLLINT_BIN"
  fi
fi
[[ -x $QMLLINT_COMMAND ]] || fail "QMLLINT_BIN is not executable: $QMLLINT_COMMAND"

if (($# > 0)); then
  qml_files=("$@")
else
  qml_files=(
    "$PROJECT_ROOT/Service.qml"
    "$PROJECT_ROOT/BarWidget.qml"
    "$PROJECT_ROOT/Panel.qml"
    "$PROJECT_ROOT/Overlay.qml"
  )
fi

for qml_file in "${qml_files[@]}"; do
  [[ -f $qml_file ]] || fail "QML input is missing: $qml_file"
done

# Quickshell exposes these source modules as qs.Ui and qs.Commons even though
# the checkout stores them directly under shell/. Build the URI-shaped import
# root expected by qmllint without modifying the upstream checkout.
qml_import_root=$(mktemp -d "${TMPDIR:-/tmp}/intermission-qml-imports.XXXXXX")
cleanup() {
  unlink "$qml_import_root/qmllint.json" 2>/dev/null || true
  unlink "$qml_import_root/qs/Ui" 2>/dev/null || true
  unlink "$qml_import_root/qs/Commons" 2>/dev/null || true
  rmdir "$qml_import_root/qs" 2>/dev/null || true
  rmdir "$qml_import_root" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$qml_import_root/qs"
ln -s "$OMARCHY_ROOT/shell/Ui" "$qml_import_root/qs/Ui"
ln -s "$OMARCHY_ROOT/shell/Commons" "$qml_import_root/qs/Commons"

cd "$PROJECT_ROOT"
set +e
"$QMLLINT_COMMAND" \
  --ignore-settings \
  --json "$qml_import_root/qmllint.json" \
  --import error \
  --missing-type error \
  --unresolved-type error \
  --inheritance-cycle error \
  -I "$qml_import_root" \
  "${qml_files[@]}"
qml_status=$?
set -e

[[ -s $qml_import_root/qmllint.json ]] \
  || fail "qmllint did not produce a diagnostic report"

if ((qml_status != 0)); then
  jq -r '
    .files[] as $file
    | $file.warnings[]
    | select(.type == "error" or .type == "critical")
    | "\($file.filename):\(.line):\(.column): \(.message) [\(.id)]"
  ' "$qml_import_root/qmllint.json" >&2
  fail "qmllint rejected an import, type, inheritance, or syntax error"
fi

warning_count=$(jq '[.files[].warnings[] | select(.type == "warning")] | length' \
  "$qml_import_root/qmllint.json")
echo "ok - QML imports and types (${#qml_files[@]} files; $warning_count non-blocking context warnings)"
