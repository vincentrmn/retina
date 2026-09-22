---
name: journal
description: Consigner la session en cours. Usage : /journal [sujet]. Délègue au documentaliste l'entrée de journal, les décisions, la feuille de route et au plus une leçon durable dans la règle du chemin concerné. Rien dans CLAUDE.md. Le commit part avec la PR de la session.
argument-hint: [sujet en quelques mots]
disable-model-invocation: true
---

# /journal : la mémoire de la session, au bon endroit

Sujet : $ARGUMENTS (vide = déduire du travail de la session)

## Procédure

1. **Rassembler** ce que le documentaliste ne peut pas deviner : ce qui a
   été décidé et pourquoi, ce qui a été fait, ce qui a été vérifié et
   comment, ce qui ne l'a pas été, les leçons, la prochaine étape, ce qui
   attend Vincent. Lui donner tout cela en clair.
2. **Sous-agent `documentaliste`** : entrée `docs/journal/AAAA-MM-JJ-<sujet>.md`
   selon le gabarit, lignes de `docs/decisions.md`, feuille de route, au
   plus une leçon dans `.claude/rules/`. Il n'écrit que dans `docs/` et
   `.claude/rules/`.
3. **Relire** ce qu'il a écrit : rien de présenté comme vérifié sans le
   comment ; aucun secret ; « korr » en minuscule ; aucun emoji ni tiret
   cadratin.
4. **Commit** (« Journal : <sujet> ») sur la branche de session. L'entrée
   part avec la PR de la session. Si la session n'a pas de PR, en ouvrir une
   petite et la merger dès que la CI est verte.
5. Si le documentaliste a signalé une leçon commune à tous les projets
   korr, la proposer à Vincent pour `vincentrmn/korr-workflow` plutôt que
   de l'écrire dans le projet.

## Ce qu'on ne fait pas

- Écrire dans `CLAUDE.md` : il ne grandit pas. Une règle absolue nouvelle
  se propose à Vincent, elle remplace une ligne, elle ne s'ajoute pas.
- Reporter une leçon dans une règle sans `paths:`, ou dans une règle qui ne
  couvre pas les fichiers concernés.
