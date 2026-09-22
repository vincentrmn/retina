---
paths:
  - "src/app/**/*.tsx"
  - "src/app/globals.css"
  - "src/components/**"
  - "public/**"
---

# Interface : règles et pièges vérifiés

Détail et récit : `docs/contexte/pieges-et-methode-de-test.md` (pièges 2 et 3, § Méthode de test).

## Règles absolues
- Design identique à SCOUT/VESPER : `globals.css` est celui de VESPER (tokens, primitives `.ds-*`,
  topbar, marque) ; les ajouts propres à RETINA vont en fin de fichier, section « RETINA — ajouts ».
- Zéro tiret cadratin dans les textes ; pas de `≥`, `×`, `≈` dans les chaînes : « au minimum », « fois ».
- RETINA en majuscules partout (marque, `<title>`).
- Champs de formulaire en fond blanc (un champ gris paraît désactivé).
- Bascules (statut de suivi, case d'export) optimistes : l'UI change tout de suite, la sauvegarde part
  en fond, retour arrière si échec, pas de rechargement de liste.
- Pages bien et candidat : polling 3 à 4 s tant qu'une analyse est `analyse_en_cours`.
- **Vérifier chaque rendu** : Playwright sur le vrai markup et le **vrai** `globals.css`, en 1440 et
  390 px, zéro scroll horizontal. Ne jamais reconstruire une maquette CSS à la main.
- Ne jamais afficher le domaine RETINA dans ce qui part vers un candidat (lien Tally direct).

## Pièges vérifiés
- `input[type="number"] { width: 100% }` (spécificité 0,1,1) bat une simple classe (0,1,0) : pour
  dimensionner un champ, monter en spécificité (`input.crit-num`), défini plus bas dans le fichier.
- Rangée « [contrôle] texte [contrôle] » : `display:grid; grid-template-columns:auto 1fr auto;
  align-items:center`, pas un flex où les champs flottent.
- Topbar : grille `auto 1fr auto` (`1fr auto 1fr` écrasait la colonne des boutons en escalier) ;
  titre en `justify-self:stretch` + `-webkit-line-clamp: 2` (sinon `overflow:hidden` ne coupe rien).
- Page bien : `topbar--split` (marque + boutons sur une ligne, titre du bien dessous, `.page-title-lg`).
- La case d'export vit **dans** `ds-row__main` : en 3ᵉ enfant de `.ds-row` (`space-between`) elle
  recentrait le nom.
- Un bouton dont le contenu change (check) doit avoir un gabarit figé (flex, cases fixes), sinon il
  saute avec la ligne de base.
- Puces `.ds-bullets` centrées sur la 1ʳᵉ ligne via `calc(0.75em - 3.5px)`.
- Police de marque : Poppins ExtraBold auto-hébergée (`public/fonts/`), 48 px.
