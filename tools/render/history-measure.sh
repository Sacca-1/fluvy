#!/usr/bin/env bash
# The measurer over the History page's matrix (the playground at $PLAYGROUND, else :5183), one report per moment × width × language:
#   tools/render/history-measure.sh apps/playground/out/history-rN/measure
# Prints the reports that are not "0 violations".
set -uo pipefail
out=$(realpath -m "$1")
mkdir -p "$out"
cd "$(dirname "$0")"
export PLAYGROUND="${PLAYGROUND:-http://127.0.0.1:5183/}"
jobs=()
add() { # moments widths languages
  for m in $1; do for w in $2; do for l in $3; do
    q="history=1&live=0&lang=$l&moment=$m"
    jobs+=("$q|$w|$out/$m-$w-$l.md")
  done; done; done
}
add "plain week month states many empty loading sources dates scrub" "320 360 412 600 640 736 900 1152 1440" "en es"
printf '%s\n' "${jobs[@]}" | xargs -P 6 -I{} bash -c 'IFS="|" read -r q w md <<< "{}"; node measure.mjs --page "${PLAYGROUND%/}/?$q" --frame fluvy-history --width $w --dpr 1,2 --md "$md" >/dev/null 2>&1; grep -q "\*\*0 violations\*\*" "$md" || echo "$(basename "$md" .md): $(grep -o "\*\*[0-9]* violations\*\*" "$md")"'
echo "$(ls "$out"/*.md | wc -l) reports"
