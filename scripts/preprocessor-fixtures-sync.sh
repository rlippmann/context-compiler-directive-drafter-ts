#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PREPROCESSOR_FIXTURES_SOURCE:-}" ]]; then
  echo "[fixtures:preprocessor:sync] PREPROCESSOR_FIXTURES_SOURCE is required." >&2
  echo "[fixtures:preprocessor:sync] Example: PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:sync" >&2
  exit 1
fi

SOURCE_DIR="$PREPROCESSOR_FIXTURES_SOURCE"
TARGET_DIR="tests/fixtures/preprocessor"
LOCAL_CONTRACT="public-api-v1.json"

echo "[fixtures:preprocessor:sync] Using source fixture directory: $SOURCE_DIR"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "[fixtures:preprocessor:sync] Source fixture directory not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

# Keep this package's API-contract fixture local because its module name and
# export surface intentionally differ from the Python package.
find "$TARGET_DIR" -maxdepth 1 -type f -name '*.json' ! -name "$LOCAL_CONTRACT" -delete
find "$SOURCE_DIR" -maxdepth 1 -type f -name '*.json' ! -name "$LOCAL_CONTRACT" -exec cp {} "$TARGET_DIR"/ \;

echo "[fixtures:preprocessor:sync] Synced parse/validator/heuristic fixtures from '$SOURCE_DIR' to '$TARGET_DIR'."
echo "[fixtures:preprocessor:sync] Preserved local '$LOCAL_CONTRACT' for package-specific API-contract differences."
