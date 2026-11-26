#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

print_only=0
[ "${1:-}" = '--print' ] && { print_only=1; shift; }

version="${1:-$(python3 -c "import json;print(json.load(open('package.json'))['version'])")}"
version="${version#v}"
tag="v${version}"

if ! grep -qE "^## \[${version//./\\.}\]" CHANGELOG.md; then
  echo "gh-release: CHANGELOG.md has no entry for ${tag}" >&2
  exit 1
fi

notes=$(mktemp)
trap 'rm -f "$notes"' EXIT
awk -v v="## [${version}]" 'index($0,v)==1 {flag=1; next} /^## \[/ {flag=0} flag' CHANGELOG.md > "$notes"
[ -s "$notes" ] || { echo "gh-release: the ${tag} section is empty" >&2; exit 1; }

if [ "$print_only" -eq 1 ]; then
  sed -n '1,12p' "$notes"
  echo '…'
  exit 0
fi

if gh release view "$tag" >/dev/null 2>&1; then
  gh release edit "$tag" --notes-file "$notes" >/dev/null
  echo "gh-release: ${tag} updated"
else
  gh release create "$tag" --title "${tag}" --notes-file "$notes" >/dev/null
  echo "gh-release: ${tag} published"
fi
