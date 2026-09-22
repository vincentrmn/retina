---
paths:
  - "src/lib/synthese.ts"
  - "src/lib/scoring.ts"
  - "src/lib/discretionnaire.ts"
  - "src/lib/types.ts"
  - "tests/**"
---

# Synthèse, cohérence, scoring : règles et pièges vérifiés

Contexte : `docs/contexte/produit-et-architecture.md` (§ Étage 2). Tests : `tests/scoring.test.ts`,
`tests/synthese.test.ts`.

## Règles absolues
- Code pur, déterministe, zéro IA. Chaque point du score a une phrase d'explication en français
  (pas de `≥`, `×`, ni tiret cadratin : « au minimum », « fois »).
- Critères d'un bien : toujours `normalizeCriteres()` ; un critère désactivé est ignoré (ratio
  désactivé = 40/40). Les anciens champs (`cdiRequis`...) sont remappés, ne pas les réutiliser.
- Un critère éliminatoire plafonne le score à 40 (`CAP_ELIMINATOIRE`) et s'affiche en rouge.
- Une incohérence `ignored` (validée à la main) ne pénalise plus ; les autres retirent 5 points.
- Recalcul du score (édition du bien, incohérence validée, synchro Apimo) depuis la `synthese` et la
  `coherence` stockées : zéro ré-extraction, zéro coût API.
- Revenus : uniquement les montants en euros (devise absente = EUR) ; un document étranger est écarté
  et signalé (aVerifier + contrôle de cohérence dédié), jamais converti.
- Salarié : salaire retenu = `net_a_payer` au prorata de la part récurrente du brut de cash
  (`recurCash`) ; bonus, avance et avantages en nature exclus.
- Indépendant (ni fiche de paie ni contrat, mais avis/bilan/KBIS) : revenu = moyenne annuelle des
  2 derniers exercices / 12, avis d'imposition prioritaire ; retenu à 80 % (`DECOTE_INDEP`) pour le
  ratio ; stabilité 18 si activité ≥ 24 mois, 8 sinon. Un gérant salarié reste un salarié.
- Personnes A/B : regroupement des items par nom (`partitionByPerson`, `sameEntity`) ; les documents
  legacy forcés A/B à la main restent honorés.
- Un défaut trouvé en prod donne un test dans `tests/` qui l'aurait vu.

## Pièges vérifiés
- Pondération par salaire seulement si **tous** les salaires sont connus, sinon moyenne simple (une
  personne sans bulletin avait un poids nul et son contrat disparaissait du score).
- Interpolation : `Personne ${p.personne}`, pas `${p}` (produisait `[object Object]`).
- « Analysés » se compte sur `score IS NOT NULL`, pas sur `statut='analyse'` (un dossier en
  `erreur_document` peut avoir un score partiel).
- Un salarié à plusieurs employeurs a légitimement plus de 12 bulletins par an (cas LANG-STREE : 12 + 3).
- Cohérence des bulletins : les 3 **derniers**, consécutifs **et** récents (< 3 mois).
- Barème indépendant et barème général = valeurs par défaut, à valider avec Shawna.
