#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PREPROCESSOR_FIXTURES_SOURCE:-}" ]]; then
  echo "[fixtures:preprocessor:check] PREPROCESSOR_FIXTURES_SOURCE is required." >&2
  echo "[fixtures:preprocessor:check] Example: PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:check" >&2
  exit 1
fi

SOURCE_DIR="$PREPROCESSOR_FIXTURES_SOURCE"
TARGET_DIR="tests/fixtures/preprocessor"
LOCAL_CONTRACT="public-api-v1.json"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[fixtures:preprocessor:check] Using source fixture directory: $SOURCE_DIR"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "[fixtures:preprocessor:check] Source fixture directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "[fixtures:preprocessor:check] Target fixture directory not found: $TARGET_DIR" >&2
  echo "[fixtures:preprocessor:check] Run 'npm run fixtures:preprocessor:sync' first." >&2
  exit 1
fi

find "$SOURCE_DIR" -maxdepth 1 -type f -name '*.json' ! -name "$LOCAL_CONTRACT" -exec cp {} "$TMP_DIR"/ \;

if diff -ru --exclude "$LOCAL_CONTRACT" "$TMP_DIR" "$TARGET_DIR" >/dev/null; then
  echo "[fixtures:preprocessor:check] Portable fixtures are up to date."
  echo "[fixtures:preprocessor:check] Local '$LOCAL_CONTRACT' is intentionally excluded from drift checks."
  exit 0
fi

echo "[fixtures:preprocessor:check] Fixture drift detected between '$SOURCE_DIR' and '$TARGET_DIR'." >&2
echo "[fixtures:preprocessor:check] Run 'npm run fixtures:preprocessor:sync' to refresh local fixtures." >&2
echo "[fixtures:preprocessor:check] Local '$LOCAL_CONTRACT' is intentionally excluded from drift checks." >&2

diff -ru --exclude "$LOCAL_CONTRACT" "$TMP_DIR" "$TARGET_DIR" || true
exit 1
