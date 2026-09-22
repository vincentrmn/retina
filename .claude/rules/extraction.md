---
paths:
  - "src/lib/extract.ts"
  - "src/lib/schemas.ts"
  - "src/lib/analyse.ts"
  - "src/app/api/candidats/**/analyze/**"
---

# Extraction : règles et pièges vérifiés

Contexte : `docs/contexte/produit-et-architecture.md` (§ Étage 1). Récit : `docs/journal/2026-07-03-*`,
`2026-07-22-*`.

## Règles absolues
- Structured outputs obligatoires (`output_config.format` json_schema) ; jamais de texte libre parsé.
- Chaque champ = `{value, confiance}` ; `value: null` si illisible, jamais inventé.
- Un appel par type de document présent, jamais un appel géant par dossier.
- Pipeline d'un fichier : classification rapide des **types présents** (`SCHEMA_TYPES_PRESENTS`, petit
  modèle), puis extraction de chaque type présent en parallèle avec son schéma « tableau »
  (`SCHEMAS_MULTI`). Stocké `type='dossier'`.
- Montants lus **tels quels dans la devise du document** (champ `devise`), jamais convertis.
- Bulletin : extraire `net_a_payer`, `avantage_en_nature`, `elements_non_recurrents` (+ détail) : ils
  servent au salaire cash récurrent de la synthèse.
- Les textes du modèle passent par `sansCadratin` ; les prompts interdisent le tiret cadratin.
- Les `remarques` du modèle restent dans l'extraction stockée (audit), elles ne s'affichent pas.

## Pièges vérifiés
- **Ne pas fusionner détection et extraction dans un seul schéma** : au-delà de 16 paramètres à union,
  l'API répond 400 (le message le dit). Pour la même raison, pas de schéma géant multi-types.
- **Un PDF de bulletins contient souvent plusieurs mois** : le schéma paie retourne un tableau
  `bulletins`, la synthèse aplatit. Ne pas revenir à un bulletin par document.
- **Réextraction forcée d'un `dossier`** : seuls les types legacy rattachés à la main (`fiche_paie`,
  `contrat`, `piece_identite`) passent par l'extraction typée ; `auto`, `autre` **et `dossier`**
  repassent par `extractDocumentAuto`. Sinon `PROMPTS['dossier']` est `undefined` et l'API répond
  400 `text: Field required`.
- Un « champ requis manquant » sur un bloc texte côté API = un prompt `undefined` en amont (clé de map
  absente), pas un problème de forme de requête ni de version du SDK.
- Le type `"adaptive"` du thinking n'existe qu'à partir du SDK 0.110.
- HEIC est accepté par Tally mais pas par l'API : le webhook l'ignore (listé dans `ignores`).
- Coût mesuré : ~0,36 $ par dossier ; le poste principal = tokens d'entrée des scans haute résolution
  (un passeport ≈ 25 k tokens), pas le thinking.
- Une extraction ancienne n'a pas les champs récents (`devise`, `net_a_payer`...) : la synthèse retombe
  sur l'ancien calcul ; relancer avec `{force: true}` pour en profiter.
