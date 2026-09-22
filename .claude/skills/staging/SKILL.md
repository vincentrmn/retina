---
name: staging
description: Déployer une PR sur l'environnement staging du projet pour que Vincent la teste en vrai, connecté, avant le merge. Usage : /staging <numéro de PR ou branche>. Pousse la branche sur `staging`, attend le déploiement, vérifie que le site répond, donne l'adresse.
disable-model-invocation: true
---

# /staging : tester une PR en vrai avant le merge

Le projet a un environnement d'hébergement `staging` qui déploie la branche
`staging` (adresse, variables et procédure de suivi : skill d'hébergement du
projet, `railway-ops` pour Platform). La branche `staging` n'est pas une
branche de travail : c'est un pointeur que l'on déplace sur ce qu'on veut
tester. On n'y commite jamais directement.

## Procédure

1. Identifier la branche : `$ARGUMENTS` est un numéro de PR (lire la PR pour
   trouver sa branche) ou un nom de branche. Vérifier que la CI de cette
   branche est verte ; sinon le dire et s'arrêter (on ne fait pas tester du
   code qui ne passe pas les vérifications).
2. Pointer `staging` dessus :
   `git push --force origin <branche>:refs/heads/staging`
   (le force est normal ici : `staging` est un pointeur, pas un historique).
3. Attendre le déploiement de l'environnement staging jusqu'à `SUCCESS`
   (outil d'hébergement ; poller toutes les 30 s, 10 minutes au plus).
4. Vérifier : `GET <adresse staging>/api/health` à 200, et les routes gardées
   répondent comme en production (401 et 307 attendus).
5. Répondre à Vincent avec l'adresse, la PR déployée, et ce qu'il est utile de
   regarder (les critères du plan qui se testent au clic).
6. Quand Vincent a donné ses retours et que la PR est mergée, `staging` reste
   où il est : le prochain `/staging` le déplacera.

## Ce qu'il ne faut pas faire

- Ne jamais pousser `staging` sur `main`, ni merger `staging` dans quoi que ce soit.
- Ne pas déployer sur staging une branche dont la CI est rouge.
- Ne pas confondre l'adresse staging et l'adresse de production dans le message.
