#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

failed=()

section() {
  printf '\n=== %s ===\n' "$1"
}

run_step() {
  local name=$1
  shift
  section "$name"
  local code=0
  "$@" || code=$?
  [ "$code" -eq 0 ] || failed+=("$name (exit $code)")
}

section 'build'
code=0
bun run build || code=$?
if [ "$code" -ne 0 ]; then
  printf '\nverify: FAILED — build exited %s\n' "$code"
  exit 1
fi

run_step 'check' bun run check
run_step 'quota-test' node --test scripts/quota-test.mjs
run_step 'secret-scan' bash scripts/secret-scan.sh
run_step 'check-changelog' bash scripts/check-changelog.sh

if [ "${#failed[@]}" -ne 0 ]; then
  printf '\nverify: FAILED\n'
  for entry in "${failed[@]}"; do
    printf '  - %s\n' "$entry"
  done
  exit 1
fi

printf '\nverify: every step passed\n'
