#!/usr/bin/env bash
# Au demarrage d'une session cloud (hook SessionStart) : installer les
# dependances si elles manquent, pour que typecheck, lint, tests et build
# fonctionnent. Idempotent ; le conteneur est mis en cache apres.
set -uo pipefail
racine=${CLAUDE_PROJECT_DIR:-$(pwd)}
cd "$racine" || exit 0
if [ -f package.json ] && [ ! -d node_modules ]; then
  npm install --no-audit --no-fund >/dev/null 2>&1 || echo "npm install a echoue : lancer npm install a la main" >&2
fi
exit 0
