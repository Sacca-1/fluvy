#!/usr/bin/env bash
# The measurer over the Activity page's matrix (the playground at $PLAYGROUND, else :5183), one report per moment × width × language:
#   tools/render/activity-measure.sh apps/playground/out/activity-rN/measure
# Prints the reports that are not "0 violations".
set -uo pipefail
out=$(realpath -m "$1")
mkdir -p "$out"
cd "$(dirname "$0")"
export PLAYGROUND="${PLAYGROUND:-http://127.0.0.1:5183/}"
jobs=()
add() { # moments widths languages [card]
  for m in $1; do for w in $2; do for l in $3; do
    q="activity=1&live=0&at=2026-09-17T21:47:12&lang=$l"
    case $m in top) ;; linked) q="$q&entity_id=light.kitchen&start_date=2026-09-16T21%3A47%3A12" ;; *) q="$q&moment=$m" ;; esac
    [ -n "${4:-}" ] && q="$q&card=1"
    jobs+=("$q|$w|$out/$m-$w-$l${4:+-card}.md")
  done; done; done
}
add "top detail burst dates sources week linked empty nomatch fresh drop loading lights end" "320 360 412 600 640 736 900 1152 1440" "en es"
add "top detail burst dates week linked end" "320 360 412 640 736 1440" "en es" card
printf '%s\n' "${jobs[@]}" | xargs -P 6 -I{} bash -c 'IFS="|" read -r q w md <<< "{}"; node measure.mjs --page "${PLAYGROUND%/}/?$q" --frame fluvy-activity --width $w --dpr 1,2 --md "$md" >/dev/null 2>&1; grep -q "\*\*0 violations\*\*" "$md" || echo "$(basename "$md" .md): $(grep -o "\*\*[0-9]* violations\*\*" "$md")"'
echo "$(ls "$out"/*.md | wc -l) reports"
