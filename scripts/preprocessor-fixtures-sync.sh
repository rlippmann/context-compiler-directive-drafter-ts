#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PREPROCESSOR_FIXTURES_SOURCE:-}" ]]; then
  echo "[fixtures:preprocessor:sync] PREPROCESSOR_FIXTURES_SOURCE is required." >&2
  echo "[fixtures:preprocessor:sync] Example: PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:sync" >&2
  exit 1
fi

SOURCE_DIR="$PREPROCESSOR_FIXTURES_SOURCE"
TARGET_DIR="tests/fixtures/preprocessor"
PIN_FILE=".source-commit"

echo "[fixtures:preprocessor:sync] Using source fixture directory: $SOURCE_DIR"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "[fixtures:preprocessor:sync] Source fixture directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if ! SOURCE_COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null)"; then
  echo "[fixtures:preprocessor:sync] Could not resolve source commit from: $SOURCE_DIR" >&2
  echo "[fixtures:preprocessor:sync] Source must be inside a git checkout of context-compiler-directive-drafter." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

find "$TARGET_DIR" -maxdepth 1 -type f -name '*.json' -delete
find "$SOURCE_DIR" -maxdepth 1 -type f -name '*.json' -exec cp {} "$TARGET_DIR"/ \;
printf '%s\n' "$SOURCE_COMMIT" > "$TARGET_DIR/$PIN_FILE"

echo "[fixtures:preprocessor:sync] Synced parse/validator/heuristic fixtures from '$SOURCE_DIR' to '$TARGET_DIR'."
echo "[fixtures:preprocessor:sync] Recorded upstream source commit in '$TARGET_DIR/$PIN_FILE': $SOURCE_COMMIT"
