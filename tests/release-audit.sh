#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/.." && pwd)

fail() {
  echo "release-audit: $*" >&2
  exit 1
}

for command_name in file jq node rg; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

for required_path in \
  manifest.json README.md LICENSE preview.png \
  docs/ReleaseEvidence.md docs/MarketplaceChecklist.md \
  docs/previews/intermission-preview.svg \
  docs/previews/multi-display-preview.svg \
  docs/previews/multi-display-preview.png; do
  [[ -f $PROJECT_ROOT/$required_path ]] || fail "missing $required_path"
done

jq -e '.schemaVersion == 1 and .id == "io.github.andybowu.intermission"' \
  "$PROJECT_ROOT/manifest.json" >/dev/null || fail "manifest identity is invalid"

link=$(find "$PROJECT_ROOT" -path "$PROJECT_ROOT/.git" -prune -o \
  -path "$PROJECT_ROOT/node_modules" -prune -o -type l -print -quit)
[[ -z $link ]] || fail "symlinks are not allowed: $link"

while IFS= read -r -d '' path; do
  mime_type=$(file -b --mime-type "$path")
  case "$mime_type" in
    application/x-executable|application/x-mach-binary|application/vnd.microsoft.portable-executable)
      fail "unexpected executable binary: ${path#"$PROJECT_ROOT/"}"
      ;;
  esac
done < <(find "$PROJECT_ROOT" -path "$PROJECT_ROOT/.git" -prune -o \
  -path "$PROJECT_ROOT/node_modules" -prune -o -type f -print0)

[[ $(file -b --mime-type "$PROJECT_ROOT/preview.png") == image/png ]] \
  || fail "preview.png must be a PNG"

PREVIEW_PATH="$PROJECT_ROOT/preview.png" node -e '
  const fs = require("node:fs");
  const buffer = fs.readFileSync(process.env.PREVIEW_PATH);
  if (buffer.length > 50 * 1024 * 1024) process.exit(1);
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") process.exit(1);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width * height > 40000000) process.exit(1);
' || fail "preview.png exceeds marketplace image bounds"

secret_pattern='-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}'
if rg -l --glob '!node_modules/**' --glob '!.git/**' -- \
    "$secret_pattern" "$PROJECT_ROOT" >/dev/null; then
  fail "possible committed secret format detected"
else
  scan_code=$?
  [[ $scan_code == 1 ]] || fail "secret scan could not complete"
fi

runtime_files=(
  "$PROJECT_ROOT/manifest.json"
  "$PROJECT_ROOT/Service.qml"
  "$PROJECT_ROOT/BarWidget.qml"
  "$PROJECT_ROOT/Panel.qml"
  "$PROJECT_ROOT/Overlay.qml"
  "$PROJECT_ROOT/Engine.js"
  "$PROJECT_ROOT/Settings.js"
  "$PROJECT_ROOT/BreakViewModel.js"
  "$PROJECT_ROOT/StateStore.js"
)
runtime_pattern='(^|[^[:alnum:]_])(sudo|pkexec|systemctl|curl|wget)([^[:alnum:]_]|$)|https?://|execDetached|Process[[:space:]]*\{'
if rg -l -i "$runtime_pattern" "${runtime_files[@]}" >/dev/null; then
  fail "runtime contains an unnecessary external or privileged operation"
else
  scan_code=$?
  [[ $scan_code == 1 ]] || fail "runtime operation scan could not complete"
fi

blocked_term=$(printf '%s%s' 'desk' 'rest')
if rg -l -i "$blocked_term" "$PROJECT_ROOT" \
    --glob '!node_modules/**' --glob '!.git/**' >/dev/null; then
  fail "prohibited reference material detected"
else
  scan_code=$?
  [[ $scan_code == 1 ]] || fail "reference scan could not complete"
fi

echo "ok - release audit"
