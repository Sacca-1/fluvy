#!/usr/bin/env bash
# The last gate before anything is pushed: nothing of a private installation, nothing of the past, nothing in
# another language leaves this tree. Exit 0 only when every check is clean.
#
#   bash tools/release/leak-scan.sh
#
# Runs over the working tree (so it also catches what is not committed yet), skipping dependencies, builds and git.
set -uo pipefail
cd "$(dirname "$0")/../.."
fail=0
say() { printf '\n%s\n' "$1"; }

files() {
  find . -type f \
    -not -path './node_modules/*' -not -path '*/node_modules/*' -not -path './.git/*' -not -path './.claude/*' -not -path './.idea/*' -not -path './.vscode/*' -not -path '*/dist/*' \
    -not -path './custom_components/fluvy/frontend/*' -not -path './custom_components/fluvy/themes/*' \
    -not -path './apps/*/out/*' -not -path './.local/*' -not -path './tools/dev/ha-config/*' -not -name '*.png' -not -name '*.gif' -not -name '*.mp4' -not -name '*.woff2' -not -name 'pnpm-lock.yaml'
}

# 1. Words that belong to a private installation, to the paid-product past, or to the developer's machine.
#    Home Assistant's own vocabulary is allowed where the code speaks it (the allow-list below).
WORDS='192\.168\.|proxmox|qm guest|vokse|/tmp/claude|\.local/|\.context/|\bbuyers?\b|19\.99|licen[cs]e key|\bstripe\b|railway|fluvy-casa|dashboard-home2|aerotermia|lampara_sala|fuga_agua|precio_luz|secadora|person\.alex|ha-theme-premium|fluvy\.io|sold as|signed artefact|\bthe client\b|design/(candidates|reviews)|tools/deploy|ha-session|ha-shell-health|co-authored-by|anthropic|\bclaude\b'
say "1. forbidden words"
if files | grep -vE '^\./(tools/release/leak-scan\.sh|\.gitignore|\.prettierignore|eslint\.config\.js)$' | xargs grep -nIiE "$WORDS"; then fail=1; fi

# 2. `hassio` is a Home Assistant domain and `aemet` a public weather integration: allowed only where the code lists them.
say "2. vocabulary outside its allow-list"
if files | grep -vE '^\./(packages/core/src/activity/classify\.ts|packages/theme/src/__tests__/ha-vars\.json|tools/release/leak-scan\.sh)$' | xargs grep -nIiw 'hassio'; then fail=1; fi
if files | grep -vE '^\./(packages/cards/src/strategy/home-registry\.ts|tools/release/leak-scan\.sh)$' | xargs grep -nIi 'aemet'; then fail=1; fi

# 3. Absolute paths of a developer's machine.
say "3. absolute paths"
if files | grep -vE '^\./tools/release/leak-scan\.sh$' | xargs grep -nIE '/home/[a-z]+/|/Users/[A-Za-z]+/|scratchpad'; then fail=1; fi

# 4. Anything shaped like a secret.
say "4. secrets"
if files | xargs grep -nIE 'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ssh-(rsa|ed25519) AAAA'; then fail=1; fi
if command -v gitleaks >/dev/null; then gitleaks detect --no-git --source . --redact --exit-code 1 || fail=1; fi

# 5. Prose in Spanish (translations live in .ts sources and translations/es.json; everything else is English).
say "5. spanish prose"
for f in $(files | grep -E '\.(md|ya?ml|html)$'); do
  n=$(grep -oiwE 'el|la|los|las|para|con|que|una|del|por|como|pero|también|según|esto|está' "$f" | wc -l)
  if [ "$n" -gt 5 ]; then echo "$f: $n Spanish stop words"; fail=1; fi
done

# 6. Files that must not be here at all.
say "6. forbidden files"
if files | grep -E '^\./(\.context|design/(candidates|reviews)|tools/(deploy|naming))/|^\./tools/render/ha-[a-z-]+\.mjs$|ha-session\.mjs$|naming\.md$|\.pyc$|\.log$|JUDGE'; then fail=1; fi
if find design/approved -name '*.md' | grep .; then fail=1; fi

if [ "$fail" -ne 0 ]; then say "✗ the tree is not clean"; exit 1; fi
say "✓ no leaks found"
