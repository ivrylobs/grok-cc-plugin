#!/usr/bin/env bash
# Anonymize delivered trees for blind design grading (RUBRIC.md §Anonymization).
# Usage: ./anonymize.sh <out-dir> <tree1> <tree2> ... (5 trees: S0a S0b S2p DC DG)
# Shuffles to letters A..E, strips tells, normalizes formatting, seals the mapping.
set -euo pipefail
OUT="$1"; shift
[ "$#" -ge 2 ] || { echo "need >=2 trees"; exit 1; }
mkdir -p "$OUT"
LETTERS=(A B C D E F G H)
# shuffle input order
TREES=$(printf '%s\n' "$@" | sort -R)
i=0
: > "$OUT/MAPPING.sealed.txt"
while IFS= read -r tree; do
  L="${LETTERS[$i]}"; i=$((i+1))
  dest="$OUT/$L"
  mkdir -p "$dest"
  [ -d "$tree/src" ] && cp -R "$tree/src" "$dest/src"
  [ -f "$tree/NOTES.md" ] && cp "$tree/NOTES.md" "$dest/NOTES.md"
  # strip tell lines
  find "$dest" -type f \( -name '*.ts' -o -name '*.md' \) | while IFS= read -r f; do
    LC_ALL=C sed -E -i '' '/[Cc]laude|[Aa]nthropic|[Gg]rok|[Xx][Aa][Ii]|x\.ai|[Gg][Pp][Tt]|LLM|llm|[Gg]enerated|[Aa]ssistant|[Ss]ession/d' "$f"
  done
  echo "$L -> $tree" >> "$OUT/MAPPING.sealed.txt"
done <<< "$TREES"
chmod 000 "$OUT/MAPPING.sealed.txt" || true
# normalize formatting so style isn't a fingerprint (best-effort)
bunx prettier --write "$OUT/**/*.ts" "$OUT/**/*.md" >/dev/null 2>&1 || echo "WARN: prettier unavailable; formatting not normalized"
echo "Anonymized $((i)) trees into $OUT (mapping sealed; chmod 400 to unseal after grading)"
