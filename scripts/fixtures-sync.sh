#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/fixtures-provenance.sh"

if [[ -z "${DRAFTER_FIXTURES_SOURCE:-}" ]]; then
  echo "[fixtures:sync] DRAFTER_FIXTURES_SOURCE is required." >&2
  echo "[fixtures:sync] Example: DRAFTER_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures npm run fixtures:sync" >&2
  exit 1
fi

SOURCE_DIR="$DRAFTER_FIXTURES_SOURCE"
TARGET_DIR="tests/fixtures/drafter"
echo "[fixtures:sync] Using source fixture directory: $SOURCE_DIR"
drafter_verify_source_dir_matches_expected_commit "fixtures:sync" "$SOURCE_DIR"

mkdir -p tests/fixtures
rm -rf "$TARGET_DIR"
cp -R "$SOURCE_DIR" "$TARGET_DIR"
echo "[fixtures:sync] Synced Python-owned fixture tree to '$TARGET_DIR'."
