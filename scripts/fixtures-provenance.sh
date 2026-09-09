#!/usr/bin/env bash
set -euo pipefail

DRAFTER_FIXTURE_PROVENANCE_FILE="tests/fixtures/drafter/.source-commit"

drafter_fixture_provenance_file() {
  printf '%s\n' "$DRAFTER_FIXTURE_PROVENANCE_FILE"
}

drafter_load_expected_fixture_source_commit() {
  local provenance_file
  provenance_file="$(drafter_fixture_provenance_file)"
  if [[ ! -f "$provenance_file" ]]; then
    echo "[fixtures:provenance] Missing provenance file: $provenance_file" >&2
    return 1
  fi
  local line_count
  line_count="$(awk 'END { print NR }' "$provenance_file")"
  if [[ "$line_count" != "1" ]]; then
    echo "[fixtures:provenance] Provenance file must contain exactly one line: $provenance_file" >&2
    return 1
  fi
  if [[ "$(tail -c 1 "$provenance_file" | wc -l | tr -d '[:space:]')" != "1" ]]; then
    echo "[fixtures:provenance] Provenance file must end with a newline: $provenance_file" >&2
    return 1
  fi
  local commit
  commit="$(tr -d '\r\n' < "$provenance_file")"
  if [[ -z "$commit" ]]; then
    echo "[fixtures:provenance] Provenance file is empty: $provenance_file" >&2
    return 1
  fi
  if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
    echo "[fixtures:provenance] Provenance file must contain one lowercase 40-character commit SHA: $provenance_file" >&2
    return 1
  fi
  printf '%s\n' "$commit"
}

drafter_verify_source_dir_matches_expected_commit() {
  if [[ $# -ne 2 ]]; then
    echo "[fixtures:provenance] internal error: expected label and source directory" >&2
    return 1
  fi
  local label="$1"
  local source_dir="$2"
  local expected_commit
  expected_commit="$(drafter_load_expected_fixture_source_commit)"
  if [[ ! -d "$source_dir" ]]; then
    echo "[$label] Source fixture directory not found: $source_dir" >&2
    return 1
  fi
  local repo_root
  if ! repo_root="$(git -C "$source_dir" rev-parse --show-toplevel 2>/dev/null)"; then
    echo "[$label] Source fixture directory is not inside a Git checkout: $source_dir" >&2
    echo "[$label] Use a context-compiler-directive-drafter checkout at commit $expected_commit." >&2
    return 1
  fi
  local actual_commit
  if ! actual_commit="$(git -C "$source_dir" rev-parse HEAD 2>/dev/null)"; then
    echo "[$label] Unable to determine source checkout revision for: $source_dir" >&2
    return 1
  fi
  if [[ "$actual_commit" != "$expected_commit" ]]; then
    echo "[$label] Source checkout commit mismatch." >&2
    echo "[$label] Expected: $expected_commit" >&2
    echo "[$label] Actual:   $actual_commit" >&2
    echo "[$label] Checkout root: $repo_root" >&2
    return 1
  fi
}
