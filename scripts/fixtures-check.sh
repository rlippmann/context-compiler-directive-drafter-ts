#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/fixtures-provenance.sh"

if [[ -z "${DRAFTER_FIXTURES_SOURCE:-}" ]]; then
  echo "[fixtures:check] DRAFTER_FIXTURES_SOURCE is required." >&2
  echo "[fixtures:check] Example: DRAFTER_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures npm run fixtures:check" >&2
  exit 1
fi

SOURCE_DIR="$DRAFTER_FIXTURES_SOURCE"
TARGET_DIR="tests/fixtures/drafter"
TMP_DIR="$(mktemp -d)"
SOURCE_COPY="$TMP_DIR/source"
TARGET_COPY="$TMP_DIR/target"
trap 'rm -rf "$TMP_DIR"' EXIT
echo "[fixtures:check] Using source fixture directory: $SOURCE_DIR"
drafter_verify_source_dir_matches_expected_commit "fixtures:check" "$SOURCE_DIR"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "[fixtures:check] Target fixture directory not found: $TARGET_DIR" >&2
  echo "[fixtures:check] Run 'npm run fixtures:sync' first." >&2
  exit 1
fi

cp -R "$SOURCE_DIR"/. "$SOURCE_COPY"/
cp -R "$TARGET_DIR"/. "$TARGET_COPY"/
rm -f "$TARGET_COPY/.source-commit"
if diff -ru "$SOURCE_COPY" "$TARGET_COPY" >/dev/null; then
  echo "[fixtures:check] Python-owned fixtures are up to date."
  exit 0
fi

echo "[fixtures:check] Fixture drift detected between '$SOURCE_DIR' and '$TARGET_DIR'." >&2
echo "[fixtures:check] Run 'npm run fixtures:sync' to refresh local fixtures." >&2
diff -ru "$SOURCE_COPY" "$TARGET_COPY" || true
exit 1
