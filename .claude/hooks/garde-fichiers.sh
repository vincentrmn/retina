#!/usr/bin/env bash
# Portique avant Edit/Write (hook PreToolUse) : refuse d'ecrire dans un
# fichier de secrets, et rappelle le laboratoire de migration quand le schema
# change. Code 2 = refus ; sortie standard = contexte ajoute pour Claude.
set -uo pipefail
entree=$(cat)
chemin=$(printf '%s' "$entree" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
base=$(basename "$chemin")
case "$base" in
  .env|.env.*|*.pem|*.key)
    echo "Ecriture refusee : $base est un fichier de secrets. Les secrets vont dans les variables de l'hebergeur ou l'environnement cloud." >&2
    exit 2 ;;
esac
case "$chemin" in
  */src/lib/db.ts)
    echo "Rappel : ce fichier porte le schema. Toute migration se rejoue avec \`npm run migration-lab\` (etats vide et mechants, plus PROD_DUMP si disponible) avant le commit, et /api/health en prod prouve qu'elle a rejoue." ;;
esac
exit 0
