#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c "import json;print(json.load(open('package.json'))['version'])")
if ! grep -qE "^## \[${version//./\\.}\]" CHANGELOG.md; then
  echo "check-changelog: CHANGELOG.md has no entry for ${version}" >&2
  exit 1
fi
section=$(awk -v v="## [${version}]" 'index($0,v)==1 {found=1; next} found && /^## \[/ {exit} found {print}' CHANGELOG.md)
if [ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
  echo "check-changelog: the ${version} section is empty" >&2
  exit 1
fi
echo "check-changelog: ${version} has an entry"
