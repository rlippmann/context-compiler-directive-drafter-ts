#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PREPROCESSOR_FIXTURES_SOURCE:-}" ]]; then
  echo "[fixtures:preprocessor:check] PREPROCESSOR_FIXTURES_SOURCE is required." >&2
  echo "[fixtures:preprocessor:check] Example: PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:check" >&2
  exit 1
fi

SOURCE_DIR="$PREPROCESSOR_FIXTURES_SOURCE"
TARGET_DIR="tests/fixtures/preprocessor"
PIN_FILE=".source-commit"
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

if [[ ! -f "$TARGET_DIR/$PIN_FILE" ]]; then
  echo "[fixtures:preprocessor:check] Pin file not found: $TARGET_DIR/$PIN_FILE" >&2
  echo "[fixtures:preprocessor:check] Run 'npm run fixtures:preprocessor:sync' first." >&2
  exit 1
fi

if ! SOURCE_COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null)"; then
  echo "[fixtures:preprocessor:check] Could not resolve source commit from: $SOURCE_DIR" >&2
  echo "[fixtures:preprocessor:check] Source must be inside a git checkout of context-compiler-directive-drafter." >&2
  exit 1
fi

RECORDED_COMMIT="$(tr -d '\n' < "$TARGET_DIR/$PIN_FILE")"

if [[ "$RECORDED_COMMIT" != "$SOURCE_COMMIT" ]]; then
  echo "[fixtures:preprocessor:check] Recorded upstream commit does not match source checkout." >&2
  echo "[fixtures:preprocessor:check] Recorded: $RECORDED_COMMIT" >&2
  echo "[fixtures:preprocessor:check] Source:   $SOURCE_COMMIT" >&2
  echo "[fixtures:preprocessor:check] Run 'npm run fixtures:preprocessor:sync' to refresh local fixtures and pin." >&2
  exit 1
fi

find "$SOURCE_DIR" -maxdepth 1 -type f -name '*.json' -exec cp {} "$TMP_DIR"/ \;

if diff -ru --exclude "$PIN_FILE" "$TMP_DIR" "$TARGET_DIR" >/dev/null; then
  echo "[fixtures:preprocessor:check] Portable fixtures are up to date."
  echo "[fixtures:preprocessor:check] Recorded upstream source commit matches: $RECORDED_COMMIT"
  exit 0
fi

echo "[fixtures:preprocessor:check] Fixture drift detected between '$SOURCE_DIR' and '$TARGET_DIR'." >&2
echo "[fixtures:preprocessor:check] Run 'npm run fixtures:preprocessor:sync' to refresh local fixtures." >&2

diff -ru --exclude "$PIN_FILE" "$TMP_DIR" "$TARGET_DIR" || true
exit 1
