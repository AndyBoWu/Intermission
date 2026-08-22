#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
RELEASE_FILES="$SCRIPT_DIR/release-files.txt"

fail() {
  echo "release-assets: $*" >&2
  exit 1
}

for command_name in git gzip jq sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

validate_tag() {
  local manifest_version package_version tag=$1

  [[ $tag =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] \
    || fail "tag must use strict semantic version form vMAJOR.MINOR.PATCH"

  VERSION=${tag#v}
  manifest_version=$(git -C "$PROJECT_ROOT" show "$COMMIT_SHA:manifest.json" | jq -er '.version') \
    || fail "manifest.json version is missing"
  package_version=$(git -C "$PROJECT_ROOT" show "$COMMIT_SHA:package.json" | jq -er '.version') \
    || fail "package.json version is missing"

  [[ $manifest_version == "$VERSION" ]] \
    || fail "tag $tag does not match manifest.json version $manifest_version"
  [[ $package_version == "$VERSION" ]] \
    || fail "tag $tag does not match package.json version $package_version"
}

load_release_files() {
  [[ -f $RELEASE_FILES ]] || fail "missing scripts/release-files.txt"
  mapfile -t FILES < <(sed '/^[[:space:]]*$/d' "$RELEASE_FILES")
  ((${#FILES[@]} > 0)) || fail "release file allowlist is empty"

  local path previous=""
  for path in "${FILES[@]}"; do
    [[ $path =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] \
      || fail "unsafe release path: $path"
    [[ $path != */../* && $path != ../* && $path != */.. ]] \
      || fail "release path escapes the repository: $path"
    [[ $path > $previous ]] || fail "release file allowlist must be unique and sorted"
    previous=$path
  done
}

resolve_commit() {
  COMMIT_SHA=$(git -C "$PROJECT_ROOT" rev-parse --verify "$1^{commit}") \
    || fail "release commit is not a commit: $1"

  local mode path
  for path in "${FILES[@]}"; do
    git -C "$PROJECT_ROOT" cat-file -e "$COMMIT_SHA:$path" 2>/dev/null \
      || fail "release path is not tracked at $COMMIT_SHA: $path"
    mode=$(git -C "$PROJECT_ROOT" ls-tree "$COMMIT_SHA" -- "$path" | cut -d' ' -f1)
    [[ $mode == 100644 ]] || fail "release path must be a regular non-executable file: $path"
  done
}

asset_paths() {
  ARCHIVE_PATH="$OUTPUT_DIR/intermission-$VERSION.tar.gz"
  CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
  PROVENANCE_PATH="$OUTPUT_DIR/intermission-$VERSION.provenance.json"
}

verify_assets() {
  local actual_files archive_digest expected_files prefix

  asset_paths
  [[ -f $ARCHIVE_PATH ]] || fail "missing release archive: $ARCHIVE_PATH"
  [[ -f $CHECKSUM_PATH ]] || fail "missing release checksum: $CHECKSUM_PATH"
  [[ -f $PROVENANCE_PATH ]] || fail "missing release provenance: $PROVENANCE_PATH"

  (
    cd "$OUTPUT_DIR"
    sha256sum --check --strict "$(basename "$CHECKSUM_PATH")"
  ) >/dev/null || fail "release checksum verification failed"

  prefix="intermission-$VERSION/"
  expected_files=$(printf '%s\n' "${FILES[@]/#/$prefix}" | LC_ALL=C sort)
  actual_files=$(tar -tzf "$ARCHIVE_PATH" | sed '/\/$/d' | LC_ALL=C sort)
  [[ $actual_files == "$expected_files" ]] \
    || fail "release archive contents do not match scripts/release-files.txt"

  archive_digest=$(sha256sum "$ARCHIVE_PATH" | cut -d' ' -f1)
  jq -e \
    --arg archive "$(basename "$ARCHIVE_PATH")" \
    --arg commit "$COMMIT_SHA" \
    --arg digest "$archive_digest" \
    --arg tag "v$VERSION" \
    --arg version "$VERSION" '
      .schemaVersion == 1 and
      .pluginId == "io.github.andybowu.intermission" and
      .tag == $tag and
      .version == $version and
      .sourceCommit == $commit and
      .archive.name == $archive and
      .archive.sha256 == $digest
    ' "$PROVENANCE_PATH" >/dev/null || fail "release provenance is invalid"

  echo "ok - release assets for v$VERSION at $COMMIT_SHA"
}

build_assets() {
  local archive_digest path prefix

  asset_paths
  mkdir -p "$OUTPUT_DIR"
  for path in "$ARCHIVE_PATH" "$CHECKSUM_PATH" "$PROVENANCE_PATH"; do
    [[ ! -e $path ]] || fail "refusing to overwrite existing asset: $path"
  done

  prefix="intermission-$VERSION/"
  git -C "$PROJECT_ROOT" archive \
    --format=tar \
    --prefix="$prefix" \
    "$COMMIT_SHA" \
    -- "${FILES[@]}" | gzip --best --no-name > "$ARCHIVE_PATH"

  archive_digest=$(sha256sum "$ARCHIVE_PATH" | cut -d' ' -f1)
  (
    cd "$OUTPUT_DIR"
    printf '%s  %s\n' "$archive_digest" "$(basename "$ARCHIVE_PATH")" \
      > "$(basename "$CHECKSUM_PATH")"
  )

  jq -n \
    --arg archive "$(basename "$ARCHIVE_PATH")" \
    --arg commit "$COMMIT_SHA" \
    --arg digest "$archive_digest" \
    --arg tag "v$VERSION" \
    --arg version "$VERSION" '{
      schemaVersion: 1,
      pluginId: "io.github.andybowu.intermission",
      tag: $tag,
      version: $version,
      sourceCommit: $commit,
      archive: {
        name: $archive,
        sha256: $digest
      }
    }' > "$PROVENANCE_PATH"

  verify_assets
}

COMMAND=${1:-build}
TAG=${2:-}
OUTPUT_DIR=${3:-$PROJECT_ROOT/dist}
COMMIT=${4:-HEAD}

load_release_files
resolve_commit "$COMMIT"
if [[ -z $TAG ]]; then
  TAG="v$(git -C "$PROJECT_ROOT" show "$COMMIT_SHA:manifest.json" | jq -er '.version')" \
    || fail "manifest.json version is missing"
fi
validate_tag "$TAG"

case $COMMAND in
  build)
    build_assets
    ;;
  verify)
    verify_assets
    ;;
  *)
    fail "usage: $0 [build|verify] [vMAJOR.MINOR.PATCH] [output-dir] [commit]"
    ;;
esac
