---
paths:
  - "src/lib/db.ts"
---

# Base Postgres : règles et pièges vérifiés

Référence : skill `railway` (accès aux données de prod).

## Règles absolues
- Le schéma vit dans `ensureSchema()` : `CREATE TABLE IF NOT EXISTS` puis `ALTER TABLE ... ADD COLUMN
  IF NOT EXISTS`, idempotent, rejoué au démarrage. Jamais de migration destructive.
- Une migration de données (ex. `traite` vers `suivi`) doit être rejouable sans effet au 2ᵉ passage.
- Documents stockés en **BYTEA** dans la base (le système de fichiers Railway est éphémère), avec
  l'extraction JSONB brute à côté, pour audit.
- Index uniques partiels : `biens.apimo_id`, `candidats.tally_submission_id`.
- `PGSSL=require` en prod.
- Le laboratoire de migration (`npm run migration-lab`) n'existe pas encore dans ce projet : tant qu'il
  manque, rejouer `ensureSchema()` à la main sur une base vide **et** sur une base déjà migrée avant de
  committer un changement de ce fichier.

## Pièges vérifiés
- Le port TCP Postgres de prod n'est pas joignable depuis le bac à sable (sortie HTTPS seulement) :
  lire les données de prod par l'API de l'app (skill `railway`).
