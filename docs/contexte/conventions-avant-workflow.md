# Conventions de l'ancien CLAUDE.md

> Remplacées le 22/09/2026 par le `CLAUDE.md` court et le workflow korr. En particulier, on ne pousse
> plus sur `main` : tout passe par une PR (le portique `garde-push.sh` le refuse).

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 766 à 784). -->

## Conventions pour Claude Code

- Développer sur la branche désignée de la session ; ne jamais pousser ailleurs.
- L'UI copie SCOUT/VESPER — en cas d'hésitation visuelle, aller lire leur code.
- Aucun score ni champ ne doit être produit par le modèle en texte libre :
  extraction = structured outputs, score = code.
- Ne jamais committer de documents réels de candidats ni de clé API.
- **`npm run build` passe avant tout commit.** Commit clair en français, puis push branche + `main`
  (Railway auto-déploie), puis **poller le déploiement jusqu'à `SUCCESS`** avant de rendre la main.
- **Vérifier les rendus, ne pas deviner** : captures Playwright sur le vrai `globals.css` (desktop +
  mobile) pour l'UI, génération + rastérisation pour le PDF (cf. §Méthode de test). Les bugs
  d'affichage remontés par Vincent venaient tous de suppositions non vérifiées.
- **Critères d'un bien** : le modèle de données a évolué (interrupteur `actif` + `éliminatoire` par
  critère). Toujours passer par **`normalizeCriteres()`** en lecture/persistance/scoring ; la
  description « §Scoring » plus haut (`cdiRequis`, etc.) est l'ancien modèle, conservé pour l'histoire
  mais **remappé** par `normalizeCriteres`.
- Ces pièges (WinAnsi jsPDF, spécificité CSS, grille d'alignement, méthode de test, pilotage Railway
  GraphQL) sont **transférables à SCOUT et VESPER** : même stack, même `globals.css`, même export
  jsPDF. Les y appliquer quand on y touche.
