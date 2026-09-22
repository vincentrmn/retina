---
name: railway
description: Hébergement de RETINA sur Railway (projet, services, variables, déploiement, lecture des données de prod). Charger avant de déployer, de poser une variable, de vérifier la prod ou d'inspecter un dossier réel.
---

# RETINA sur Railway

## Ce qui existe (vérifié le 03/07 et le 16/07/2026)
- URL : https://retina-production-6d72.up.railway.app (un 2ᵉ domaine `retina-production-9985`
  existe aussi, généré en double, sans conséquence).
- Projet `charming-vibrancy` (`de11fb07-1f08-4e60-b5f5-c57a855a5399`), environnement `production`
  (`28421880-…`), services `retina` (`f35c7920-…`, dépôt GitHub, branche `main`, auto-deploy) et
  `Postgres` (`1d39e419-…`).
- Variables de `retina` (noms seulement, les valeurs ne s'écrivent nulle part) : `DATABASE_URL =
  ${{Postgres.DATABASE_URL}}`, `ANTHROPIC_API_KEY` (clé dédiée au projet), `PGSSL = require`,
  `TALLY_SIGNING_SECRET`, `TALLY_FORM_ID`, `APIMO_PROVIDER`, `APIMO_AGENCY`, `APIMO_TOKEN` ;
  `BBI_GMAIL_USER`, `BBI_GMAIL_APP_PASSWORD`, `BBI_MAIL_FROM_NAME` à poser pour la relance mail.
- Pas de staging pour l'instant : `/staging` s'arrête tant qu'aucun environnement n'existe.
- Référence de temps : analyse d'un dossier réel ≈ 20 s, score identique au local.

## Procédure : suivre un déploiement
1. Pilotage **en GraphQL direct** (`https://backboard.railway.com/graphql/v2`, en-tête
   `Authorization: Bearer <token workspace>`). La CLI et le MCP rejettent ce token. Le token n'est
   pas stocké : le demander à Vincent.
2. Lister le projet pour récupérer les IDs d'environnement et de service.
3. Après le merge de la PR, **poller le déploiement jusqu'à `SUCCESS`**, vérifier que le `commitHash`
   déployé est celui du merge, puis un `GET /` en 200 et la page touchée.

## Procédure : lire les données de prod
- Le port TCP Postgres (`*.proxy.rlwy.net`) est injoignable depuis le bac à sable (sortie HTTPS
  seulement). L'app est ouverte : `GET /api/candidats/[id]` renvoie `documents[].extraction`
  complet, `GET /api/biens/[id]` la liste des candidats. Rien de ce qui est lu ne va dans le dépôt.

## Pièges
- Le MCP Railway (`railway-agent`) « stage » les variables sans les appliquer : exiger ensuite un
  commit des staged changes, puis vérifier par un appel API qui lit la variable.
- Dupliquer un service n'est pas dupliquer un environnement : la copie tourne sur la base de prod.
