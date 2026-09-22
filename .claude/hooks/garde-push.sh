#!/usr/bin/env bash
# Portique avant `git push` (hook PreToolUse sur Bash) : jamais directement
# sur main, le merge passe par une PR.
# ⚠️ Une commande Bash peut en enchainer plusieurs (`git fetch origin main &&
# git push ...`) : on n'examine que le segment qui commence a `git push`,
# sinon un simple fetch de main declenche le refus.
# ⚠️ Le `cwd` transmis par Claude Code est celui du shell AVANT la commande :
# une commande qui commence par `cd <depot> && ...` vise cet autre depot.
# Exception explicite : un depot qui contient le fichier `.claude/main-direct`
# accepte les pushes sur main (un depot de documentation sans mise en ligne,
# comme korr-workflow). C'est un choix ecrit dans le depot, pas un contournement.
set -uo pipefail
entree=$(cat)
cmd=$(printf '%s' "$entree" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
case "$cmd" in *"git push"*) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$entree" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("cwd",""))' 2>/dev/null)
cible=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^[:space:];&|]+).*/\1/p' | head -1)
[ -n "$cible" ] && cwd="$cible"
racine=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${cwd:-$PWD}")
[ -f "$racine/.claude/main-direct" ] && exit 0
segments=$(printf '%s' "$cmd" | sed -E 's/&&|\|\||;|\|/\n/g' | grep 'git push')
while IFS= read -r seg; do
  [ -z "$seg" ] && continue
  # Destination main : `origin main`, `HEAD:main`, `:main`, `refs/heads/main`.
  if printf '%s' "$seg" | grep -Eq '([[:space:]]|:|refs/heads/)main([[:space:]]|$)'; then
    echo "Push refuse : on ne pousse jamais directement sur main. Pousser la branche de session et ouvrir une PR." >&2
    exit 2
  fi
  # `git push` sans destination explicite (pas de refspec apres le remote)
  # depuis main : refuse aussi.
  if ! printf '%s' "$seg" | grep -Eq 'git push[[:space:]]+(-[a-zA-Z-]+(=[^[:space:]]+)?[[:space:]]+)*[a-zA-Z0-9_./-]+[[:space:]]+[a-zA-Z0-9_./:-]+'; then
    branche=$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)
    if [ "$branche" = "main" ]; then
      echo "Push refuse : la branche courante est main. Creer une branche de session d'abord." >&2
      exit 2
    fi
  fi
done <<< "$segments"
exit 0
