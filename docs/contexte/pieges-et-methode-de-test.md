# Pièges durables et méthode de test

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 422 à 465) le 22/09/2026. Les règles courtes qui en découlent sont dans .claude/rules/. -->

### Pièges durables (valables aussi pour SCOUT & VESPER — même stack, même `globals.css`, même jsPDF)

1. **jsPDF + police standard = WinAnsi (CP1252) UNIQUEMENT.** Un caractère hors de ce jeu ne rate
   pas qu'un glyphe : **il dérègle l'espacement de TOUTE la ligne**. Les textes produits par le
   modèle (français) en contiennent, **invisibles dans le navigateur** donc jamais soupçonnés :
   **espace fine insécable `U+202F`** et **espace fine `U+2009`** (avant `€ % : ;` et dans « 3 900 »),
   **trait d'union insécable `U+2011`** (dates « 2026‑02 »), **flèches `→`** (rendue « !' »), `≥ ≈`.
   ⇒ Tout texte qui part dans un PDF jsPDF doit passer par un assainisseur qui **ne laisse que du
   WinAnsi** (garder accents, `« » € œ` ; remplacer espaces exotiques → espace, tirets → `-`,
   flèches/maths → ASCII ; translittérer/retirer le reste). L'appliquer **globalement via un override
   de `doc.text`** (sinon on en oublie, et autotable dessine ses cellules avec `doc.text` aussi).
   Voir `S()` dans `exportBien.ts` — réutilisable tel quel.
2. **Spécificité CSS : `globals.css` a une règle générique `input[type="number"] { width: 100% }`
   (sélecteur d'attribut, 0,1,1) qui BAT une simple classe (0,1,0).** Un petit champ inline stylé par
   une classe restait donc en pleine largeur (coupait la phrase, désalignait tout). ⇒ pour surcharger,
   monter en spécificité (`input.crit-num`, 0,1,1, défini plus bas). Vaut pour tout champ qu'on veut
   dimensionner autrement que par défaut.
3. **Layout robuste = grille alignée**, pas des champs qui flottent dans un flex. Pour une rangée
   « [contrôle] texte [contrôle] », utiliser `display:grid; grid-template-columns: auto 1fr auto;
   align-items:center` → tout s'aligne quelle que soit la longueur du texte.
4. **MCP Tally `create_blocks` abandonne silencieusement des champs de saisie « nus » créés en lot.**
   Un lot contenant plusieurs `INPUT_DATE`/`INPUT_EMAIL`/`INPUT_PHONE_NUMBER`/`MULTIPLE_CHOICE_OPTION`
   sans TITLE (label en placeholder) en perd une partie **sans erreur** (déterministe, reproduit en
   insertion ET en append). Un champ nu créé SEUL passe. ⇒ créer ces champs **un par un** et **vérifier
   le nombre créé** (`blockUuids.length` du retour) après chaque appel. Les questions TITLE + options
   se créent en lot sans souci. Corollaire : **rien n'est live tant que `save_form` n'est pas appelé**
   (le working draft est en mémoire) → on peut expérimenter sans risque pour le formulaire de prod, mais
   **impossible de vérifier visuellement** le rendu (le proxy egress bloque `tally.so` dans Playwright) :
   se fier au ledger (types, `## Page flow`, `## Logic rules`).

### Méthode de test (à réutiliser partout)

- **Ne jamais « deviner » un rendu visuel.** Rendre le vrai markup + le VRAI `globals.css` avec
  Playwright/Chromium (desktop **et** 390 px), puis regarder la capture. ⚠️ **Ne pas reconstruire une
  maquette CSS à la main** : elle peut « marcher » à tort en omettant la règle générique qui casse
  tout en prod (leçon vécue avec le champ `input[type=number]`). Copier `globals.css` tel quel.
- **PDF : le générer ET le rasteriser pour le VOIR.** jsPDF tourne aussi en Node (bundler `esbuild`,
  stub du chargement du logo, capter `doc.save` via `output('arraybuffer')`), puis rendre les pages
  avec `pdfjs-dist` dans Chromium et screenshoter. C'est ce qui a permis d'isoler le bug WinAnsi
  caractère par caractère au lieu de tâtonner.
- **Piloter Railway en GraphQL direct** (`backboard.railway.com`, `Authorization: Bearer <token
  workspace>`) : lister le projet pour récupérer les IDs env/service, puis **poller le déploiement
  jusqu'à `SUCCESS`** et vérifier le `commitHash` déployé + un `GET /` en 200. Le token n'est pas
  stocké (le redemander à Vincent).
