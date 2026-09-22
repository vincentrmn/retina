---
name: livrer
description: Livrer une PR testée. Usage : /livrer <numéro de PR>. Vérifie que la CI est verte et que les retours sont traités, squash-merge, attend le déploiement, vérifie le site en ligne, consigne dans le journal. Si le smoke échoue, ne masque rien et ouvre un correctif.
argument-hint: <numéro de PR>
disable-model-invocation: true
---

# /livrer : merger, déployer, vérifier, consigner

PR : $ARGUMENTS

Une PR ne se livre que verte, testée par Vincent quand le lot le méritait, et
sans retour ouvert. La livraison n'est finie que quand le site en ligne a
répondu correctement et que le journal le dit.

## Procédure

1. **L'état de la PR** (outils GitHub) : la CI `check` est verte sur le
   dernier commit ; aucun conflit avec `main` ; aucun fil de relecture
   ouvert ; les retours de Vincent donnés sur le staging sont dans le diff.
   Si un point manque, le traiter d'abord (corriger, pousser, attendre le
   vert) ou s'arrêter en disant lequel.
2. **Squash-merge** vers `main`, titre en français, corps repris de la PR.
   Jamais de push direct sur `main` (le portique le refuse de toute façon).
3. **Attendre le déploiement** de la production jusqu'à `SUCCESS`, selon le
   skill d'hébergement du projet (`railway-ops` pour Platform : poller
   toutes les 30 s, 10 minutes au plus). Un déploiement en échec se lit
   dans ses logs avant toute autre action.
4. **Smoke en ligne** : sous-agent `verificateur` avec l'adresse de
   production. Au minimum `GET /api/health` à 200 (prouve que le schéma a
   rejoué) et les routes gardées qui répondent comme attendu ; le hash du
   CSS servi si la feuille de style a changé ; ce que le plan demandait de
   vérifier en ligne.
5. **Si le smoke échoue** : le dire à Vincent tout de suite, sans
   attendre. Si la production est cassée (500, page blanche), remettre en
   ligne la version d'avant (redéploiement du dernier déploiement sain, ou
   PR de revert mergée sans délai), puis corriger dans une nouvelle PR.
   Jamais de correctif « à chaud » qui contourne la PR et la CI.
6. **Consigner** : sous-agent `documentaliste` (entrée de journal ou
   complément de celle du lot : livré le, vérifié en ligne comment ;
   décisions ; feuille de route ; au plus une leçon dans une règle). Ces
   fichiers partent dans une petite PR « Journal : <sujet> livré », mergée
   dès que la CI est verte.
7. **Dire à Vincent** ce qui est en ligne, ce qui a été vérifié, ce qui ne
   peut l'être que par lui (le rendu connecté), et la prochaine étape de la
   feuille de route.

## Ce qu'on ne fait pas

- Merger une PR rouge, en conflit, ou avec un fil de relecture ouvert.
- Considérer livré ce qui n'a pas répondu en ligne.
- Masquer un échec de déploiement ou de smoke, même partiel.
