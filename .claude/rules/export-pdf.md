---
paths:
  - "src/lib/exportBien.ts"
---

# Export PDF : règles et pièges vérifiés

Détail et récit : `docs/contexte/pieges-et-methode-de-test.md` (piège 1, § Méthode de test).

## Règles absolues
- Tout texte qui part dans le PDF passe par `S()`, appliqué **globalement via l'override de
  `doc.text`** (autotable dessine ses cellules avec `doc.text` aussi), et sur les champs libres des
  tableaux avant mesure de largeur.
- L'export ne contient que les candidats cochés (`exclu_export = false`).
- Même contenu que l'UI : page de garde (bien, KPI, critères en puces), classement, une fiche par
  candidat ; une incohérence validée à la main s'affiche « OK » vert, « validé à la main ».
- Vérifier un changement en **générant puis en rastérisant** le PDF (jsPDF en Node via esbuild, stub du
  logo, `output('arraybuffer')`, pages rendues avec `pdfjs-dist` dans Chromium), jamais à l'œil sur le code.

## Pièges vérifiés
- La police Helvetica de jsPDF n'encode que **WinAnsi (CP1252)**. Un caractère hors jeu ne rate pas
  qu'un glyphe : il dérègle l'espacement de **toute la ligne**.
- Les coupables sont invisibles dans le navigateur : espaces fines `U+202F` et `U+2009` (avant `€ % : ;`,
  dans « 3 900 »), trait d'union insécable `U+2011`, flèche `→` (rendue « !' »), `≥ ≈ ×`.
- `S()` garde accents, `« » € œ`, remplace espaces exotiques par une espace, tirets par `-`,
  flèches et signes mathématiques par de l'ASCII, et retire le reste. Pas d'espace autour des `/`.
- Le logo Brouwers est un SVG rasterisé au moment de l'export (même méthode que VESPER).
