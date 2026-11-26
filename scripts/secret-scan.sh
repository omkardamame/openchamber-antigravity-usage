#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo 'secret-scan: not a git repository — nothing was scanned' >&2
  exit 2
}

SHAPES='ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJhbGciOi[A-Za-z0-9_-]{20,}'
hits=0

report() {
  hits=1
  printf 'SECRET?  %s\n' "$1"
}

pws=$(ps eww -Ao pid,command 2>/dev/null | grep -o 'OPENCODE_PASSWORD=[^ ]*' | cut -d= -f2- | awk 'length($0) >= 16' | sort -u || true)
blobs=$(git rev-list --objects --all | awk '{print $1}')

while read -r blob; do
  [ -n "$blob" ] || continue
  [ "$(git cat-file -t "$blob" 2>/dev/null || true)" = blob ] || continue
  if git cat-file -p "$blob" 2>/dev/null | grep -aqE "$SHAPES"; then
    report "history: blob $blob"
  fi
  while IFS= read -r pw; do
    [ -n "$pw" ] || continue
    if git cat-file -p "$blob" 2>/dev/null | grep -aqF "$pw"; then
      report 'history: live OPENCODE_PASSWORD appears in a commit'
      break 2
    fi
  done <<< "$pws"
done <<< "$blobs"

while IFS= read -r file; do
  [ -f "$file" ] || continue
  grep -qE "$SHAPES" "$file" && report "working tree: $file"
  while IFS= read -r pw; do
    [ -n "$pw" ] || continue
    if grep -qF "$pw" "$file"; then
      report "working tree: $file (live OPENCODE_PASSWORD)"
      break
    fi
  done <<< "$pws"
done <<< "$(git ls-files --cached --others --exclude-standard)"

if [ "$hits" -ne 0 ]; then
  echo 'secret-scan: FAILED — remove the value and rewrite the commit before pushing.' >&2
  exit 1
fi
echo "secret-scan: clean ($(git rev-list --count HEAD) commits, $(git ls-files | wc -l | tr -d ' ') tracked files)"
