#!/usr/bin/env bash

set -euo pipefail

TEST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$TEST_DIR/.." && pwd)

fail() {
  echo "static-checks: $*" >&2
  exit 1
}

for command_name in bash git jq node rg shellcheck; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

cd "$PROJECT_ROOT"

mapfile -t javascript_files < <(rg --files -g '*.js' | sort)
mapfile -t shell_files < <(rg --files -g '*.sh' | sort)
mapfile -t json_files < <(rg --files -g '*.json' | sort)

((${#javascript_files[@]} > 0)) || fail "no JavaScript files found"
((${#shell_files[@]} > 0)) || fail "no shell files found"
((${#json_files[@]} > 0)) || fail "no JSON files found"

for file in "${javascript_files[@]}"; do
  node --check "$file"
done

for file in "${shell_files[@]}"; do
  bash -n "$file"
done

shellcheck "${shell_files[@]}"

for file in "${json_files[@]}"; do
  jq -e . "$file" >/dev/null
done

if git grep -nI -E '[[:blank:]]+$'; then
  fail "tracked text contains trailing whitespace"
fi

git diff --check

echo "ok - static checks"
