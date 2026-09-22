#!/usr/bin/env bash
# Apres Edit/Write d'un fichier TypeScript (hook PostToolUse) : typecheck
# du projet. Les erreurs reviennent a Claude (code 2), sinon silence.
set -uo pipefail
entree=$(cat)
chemin=$(printf '%s' "$entree" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
case "$chemin" in *.ts|*.tsx) ;; *) exit 0 ;; esac
# Le depot vise est celui du fichier edite, pas celui de la session.
racine=$(git -C "$(dirname "$chemin")" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}")
cd "$racine" || exit 0
[ -f tsconfig.json ] && [ -d node_modules ] || exit 0
if ! sortie=$(npx tsc --noEmit --pretty false 2>&1); then
  echo "Typecheck en echec apres l'edition de $(basename "$chemin") :" >&2
  printf '%s\n' "$sortie" | head -30 >&2
  exit 2
fi
exit 0
