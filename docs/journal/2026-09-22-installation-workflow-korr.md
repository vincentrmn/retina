# Session « installation du workflow korr » (22/09/2026)

## Ce qui a été décidé
- Installer la partie commune de `vincentrmn/korr-workflow` (version `c5a7ef3`) dans RETINA.
- Désormais, tout passe par une PR vers `main`, plus de push direct (le portique le refuse).
- `package-lock.json` reste non suivi : la CI fait `npm install`.

## Ce qui a été fait
- `scripts/installer.sh` : cinq agents, skills `cadrer`, `construire`, `livrer`, `journal`,
  `installer`, `staging`, portiques, `.claude/settings.json`, `.github/workflows/ci.yml`.
- Scripts `typecheck`, `lint` (ESLint `next/core-web-vitals`, `no-img-element` coupé : logos SVG),
  `test` (vitest), `check`. Treize tests ciblés : `normalizeCriteres` (compat), déterminisme,
  plafond éliminatoire, incohérence validée, décote indépendant, ratio désactivé, salaire cash
  récurrent (avantage en nature, avance sur bonus), devise étrangère écartée.
- Ancien `CLAUDE.md` de 784 lignes rangé : déplacé mot pour mot dans `docs/contexte/` (produit et
  architecture, pièges et méthode de test, anciennes conventions), `docs/journal/` (une entrée par
  date de juillet) et `docs/feuille-de-route.md`. Nouveau `CLAUDE.md` de 113 lignes, six règles par
  chemin, skills `railway` et `tally`, `docs/decisions.md` rempli depuis l'historique.
- La branche de session, en retard sur `main`, a été repartie de `main`.

## Ce qui a été vérifié (et comment)
- `npm run check` sort 0 (typecheck, lint, 13 tests, build).
- Chaque ligne non vide de l'ancien `CLAUDE.md` (700) se retrouve dans les nouveaux fichiers (script).
- Portiques : un commit dont le message contient un identifiant de modèle est refusé ; un push vers
  `main` est refusé.

## Ce qui n'a pas pu être vérifié
- La CI GitHub sur la PR (vérifiée au moment du merge).
- Pas de `scripts/e2e.sh` ni de laboratoire de migration pour RETINA : à écrire (feuille de route).

## Leçons durables (reportées dans les règles ou les skills)
- Aucune nouvelle : les leçons de juillet sont reportées dans `.claude/rules/` et les skills.

## Prochaine étape
- Vincent protège `main` sur GitHub ; reprise du Sprint 2 (employeur dominant, salarié sans contrat).
