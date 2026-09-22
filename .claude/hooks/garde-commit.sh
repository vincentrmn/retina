#!/usr/bin/env bash
# Portique avant `git commit` (hook PreToolUse sur Bash).
# Refuse le commit si : le check du projet echoue, le CLAUDE.md depasse
# 200 lignes, ou le message contient un identifiant de modele.
# Ne fait rien pour toute autre commande. Code 2 = refus, le message sur
# stderr revient a Claude.
# ⚠️ Le depot vise est celui de la commande, pas celui de la session : une
# session peut travailler sur deux depots. Le `cwd` transmis est celui du
# shell AVANT la commande ; une commande qui commence par `cd <depot> && ...`
# vise cet autre depot.
# ⚠️ La ligne d'attribution `Co-Authored-By: Claude ...` est imposee par
# l'outil et n'est pas un identifiant de modele : on l'ignore. Ce qu'on
# refuse, c'est un identifiant technique (`claude-<nom>-<version>`).
# ⚠️ Le hook lit la commande ENTIERE : une commande qui ecrit ce script ou
# qui contient un exemple de message serait refusee aussi. Pour editer un
# hook, passer par l'outil d'ecriture de fichiers, pas par un heredoc Bash.
set -uo pipefail
entree=$(cat)
cmd=$(printf '%s' "$entree" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$entree" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("cwd",""))' 2>/dev/null)
cible=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^[:space:];&|]+).*/\1/p' | head -1)
[ -n "$cible" ] && cwd="$cible"
racine=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}")
cd "$racine" || exit 0

if [ -f CLAUDE.md ] && [ "$(wc -l < CLAUDE.md)" -gt 200 ]; then
  echo "Commit refuse : CLAUDE.md fait $(wc -l < CLAUDE.md) lignes (maximum 200). Deplacer le surplus dans .claude/rules/, un skill ou docs/journal/." >&2
  exit 2
fi
if printf '%s' "$cmd" | grep -v -i 'co-authored-by' | grep -Eqi 'claude-[a-z]+-[0-9]|claude-[0-9]-[0-9]'; then
  echo "Commit refuse : le message contient un identifiant de modele. Retirer l'identifiant du message de commit." >&2
  exit 2
fi
if [ -f package.json ] && grep -q '"check"' package.json; then
  if ! npm run --silent check > .verif-check.log 2>&1; then
    echo "Commit refuse : npm run check echoue. Les dernieres lignes :" >&2
    tail -40 .verif-check.log >&2
    exit 2
  fi
fi
exit 0
