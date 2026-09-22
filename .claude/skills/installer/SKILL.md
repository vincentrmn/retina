---
name: installer
description: Installer le workflow korr dans un projet, ou le mettre à jour quand la méthode a évolué. Usage : /installer (dans une session ouverte sur le projet). Clone vincentrmn/korr-workflow, recopie la partie commune (agents, skills-boucles, portiques), crée ce qui manque depuis les gabarits sans écraser ce qui est propre au projet, adapte le CLAUDE.md, ouvre une PR.
disable-model-invocation: true
---

# /installer : la partie commune du workflow korr dans ce projet

Nouveau projet ou projet existant, première installation ou mise à jour :
c'est la même procédure. Le script est idempotent, il ne fait que ce qui
manque ou a changé.

## Procédure

1. **Obtenir korr-workflow** à jour dans le bac à sable : cloner
   `vincentrmn/korr-workflow` dans le répertoire de brouillon de la session
   (branche `main`). Si le dépôt n'est pas accessible depuis la session,
   l'ajouter d'abord avec l'outil d'ajout de dépôt, puis cloner.
2. **Lancer le script** depuis ce clone, en visant la racine du projet :
   `bash <clone>/scripts/installer.sh <racine du projet>`
   Il recopie la partie commune (`.claude/agents/`, les skills `cadrer`,
   `construire`, `livrer`, `journal`, `installer`, `staging`, les portiques
   de `.claude/hooks/`), crée depuis les gabarits ce qui manque
   (`.claude/settings.json`, `.github/workflows/ci.yml`, `CLAUDE.md`,
   `docs/decisions.md`, `docs/journal/`, `docs/plans/`), sans jamais
   écraser un fichier propre au projet, et note la version installée dans
   `.claude/workflow-version`. Lire sa sortie : il liste ce qu'il a copié,
   créé, laissé, et ce qui diffère du modèle et mérite un coup d'oeil.
3. **Première installation seulement** : remplir le `CLAUDE.md` créé depuis
   le gabarit (le projet en dix lignes, stack, règles absolues, carte de la
   mémoire), sous 200 lignes ; poser les scripts `check`, `typecheck`,
   `lint`, `test` dans `package.json` selon
   `docs/conventions/verification.md` du dépôt commun ; écrire les
   premières règles par chemin ; ranger un éventuel ancien `CLAUDE.md`
   long selon `docs/conventions/memoire.md` (déplacement verbatim dans
   le journal et le contexte, vérifié ligne à ligne).
4. **Mise à jour** : comparer ce que le script signale comme différent du
   modèle (`settings.json`, `ci.yml`) et reporter ce qui a changé côté
   commun, à la main, sans perdre ce que le projet y a ajouté. Ajouter au
   `CLAUDE.md` du projet ce que la méthode attend désormais de lui (une ou
   deux lignes, jamais plus).
5. **Vérifier** : `npm run check` sort 0 ; les portiques répondent (tenter
   un commit avec un message qui contient un identifiant de modèle : il
   doit être refusé) ; `ls .claude/agents .claude/skills` montre la partie
   commune.
6. **Commit, PR** (« Workflow korr : installation » ou « mise à jour vers
   korr-workflow <version> »), merge dès que la CI est verte, puis dire à
   Vincent ce qui lui revient : protéger `main` sur GitHub, créer le
   staging si le projet est en ligne, les routines (voir `docs/guide.md`
   du dépôt commun, § 7).

## Ce qu'on ne fait pas

- Écraser `CLAUDE.md`, `settings.json`, `ci.yml`, une règle ou un skill
  propre au projet. Le script ne le fait pas ; on ne le fait pas à la main
  non plus.
- Copier dans le projet une leçon d'un autre projet. Un projet n'hérite
  jamais des pièges d'un autre.
- Modifier korr-workflow depuis le projet : une évolution de la méthode se
  fait dans une session ouverte sur korr-workflow.
