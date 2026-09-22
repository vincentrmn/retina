---
name: construire
description: Construire un lot d'un plan validé, dans une session neuve, sans intervention de Vincent entre le plan et la PR. Usage : /construire docs/plans/<slug>.md [lot]. Un critère à la fois avec sa preuve, check à chaque pas, relecteur jusqu'à RAS, migrateur si le schéma change, vérificateur pour l'e2e, PR avec le plan et les preuves.
argument-hint: docs/plans/<slug>.md [numéro de lot]
disable-model-invocation: true
---

# /construire : du plan à la PR, avec preuves

Plan : $0
Lot : $1 (vide = le premier lot dont un critère est encore à « échec »)

Cette session construit UN lot et s'arrête à la PR. Elle ne merge pas, ne
déploie pas sur staging : Vincent teste (`/staging`) puis livre (`/livrer`).
Quand une question de métier bloque, on la pose à Vincent et on attend ;
tout le reste se décide ici.

## Condition d'arrêt

Le lot est terminé quand, et seulement quand :

- chaque critère du lot est à « réussi » dans le plan, avec sa preuve écrite
  dans la colonne « État » ;
- `npm run check` sort 0 ;
- le `relecteur` a rendu `RAS` sur le diff final ;
- le `migrateur` a rendu `PASS` si le fichier de schéma est dans le diff ;
- le `verificateur` a rendu `PASS` (avec l'e2e si l'interface ou une route
  est touchée) ;
- tout est commité, poussé, et la PR est ouverte avec le plan et les preuves.

Sinon, on s'arrête après **25 tours** ou après **trois relances** du
relecteur ou du vérificateur sur le même écart, et on dit exactement où on
en est : ce qui est prouvé, ce qui ne l'est pas, ce qui bloque.

Un skill ne peut pas poser `/goal` lui-même. Au premier tour, afficher à
Vincent la ligne suivante, qu'il peut coller pour qu'un juge séparé tienne
la session jusqu'à la preuve (facultatif, la procédure ci-dessous tient
seule) :

`/goal Le lot de $0 est terminé : chaque critère du lot est à réussi dans le plan avec sa preuve, npm run check sort 0, le relecteur a rendu RAS, le vérificateur a rendu PASS, tout est commité et la PR est ouverte. Sinon arrêt après 25 tours.`

## Procédure

1. **Se placer.** Lire le plan en entier, les décisions et les règles de
   `.claude/rules/` qui couvrent les fichiers du périmètre. Vérifier qu'on
   est sur une branche de session partie de `main` à jour
   (`git fetch origin main`, `git log --oneline -1 origin/main`). Un lot
   commence toujours depuis un contexte neuf : si cette session a déjà
   servi à autre chose, le dire et s'arrêter.
2. **Un critère à la fois**, dans l'ordre du plan :
   - implémenter le strict nécessaire, dans le périmètre ;
   - `mkdir -p .verif && npm run check > .verif/check.log 2>&1` puis lire
     le fichier (jamais de `| head`) ;
   - produire la preuve demandée par le critère (commande, réponse HTTP,
     capture) et l'écrire dans la colonne « État » du plan :
     `réussi : <preuve>` ;
   - commit en français, une phrase, sur ce critère (le portique relance
     `check` : c'est voulu).
   Un critère qui résiste deux fois de suite est reformulé dans le plan
   (colonne « État » : `bloqué : <raison>`) et on passe au suivant ; il
   revient dans le compte rendu final.
3. **Fin du lot, relecture.** Écrire le diff dans un fichier que le
   relecteur lira (il n'a pas Bash) :
   `{ git log --oneline origin/main..HEAD; git diff origin/main...HEAD; } > .verif/diff.patch`
   puis sous-agent `relecteur` avec ce chemin et celui du plan. Corriger
   chaque écart bloquant, réécrire le fichier, relancer jusqu'à `RAS`. Un
   écart mineur est corrigé s'il tient en quelques lignes, sinon noté dans
   la PR.
4. **Migration.** Si le fichier de schéma est dans `git diff --stat
   origin/main...HEAD` : sous-agent `migrateur` jusqu'à `PASS`.
5. **Vérification.** Sous-agent `verificateur` avec la liste des critères
   du lot. Il rend `PASS` ou `NEEDS_WORK` avec les preuves ; corriger et
   relancer. Regarder soi-même les captures qu'il cite avant de les
   joindre. Après le migrateur et le vérificateur, `git status --short`
   ne doit rien montrer hors `.verif/` : ils ne corrigent pas. Si quelque
   chose a bougé, lire le diff avant de continuer et le dire dans la PR.
6. **Journal.** Sous-agent `documentaliste` : entrée de journal du lot,
   décisions s'il y en a, feuille de route, au plus une leçon. Commit.
7. **PR.** Pousser la branche (`git push -u origin <branche>`). Ouvrir la
   PR vers `main` avec : le titre en français ; le lien du plan ; le
   tableau des critères avec l'état et la preuve ; les captures 1440 px et
   390 px des pages touchées ; le verdict du relecteur, du migrateur et du
   vérificateur ; ce qui reste bloqué ou non vérifié. S'abonner aux
   événements de la PR (CI, commentaires) pour corriger sans qu'on le
   demande. Dire à Vincent : le numéro de PR, ce qu'il peut tester avec
   `/staging <PR>`, et que `/livrer <PR>` fera le reste.

## Ce qu'on ne fait pas

- Élargir le périmètre (« tant qu'on y est »). Une idée en passant va dans
  le compte rendu, pas dans le diff.
- Cocher un critère sans preuve, ou présenter comme vérifié ce que le bac à
  sable ne permet pas de vérifier (réseau sortant du navigateur, codecs,
  session connectée) : on l'écrit tel quel.
- Merger, déployer sur staging, pousser sur `main`.
- Désactiver un test, un lint ou un portique pour passer.
