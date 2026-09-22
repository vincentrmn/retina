# Session du 22/07/2026 : suivi 4 états, export sélectif, salaire cash récurrent

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 698 à 746) le 22/09/2026. -->

### Retours Vincent (22/07/2026) — suivi 4 états, export sélectif persistant, salaire CASH récurrent

Livré + déployé (prod).

- **Statuts de suivi (remplacent le bouton Traité/Non traité)** : 4 pastilles **Contacté** (mauve),
  **Visite** (bleu), **Dossier déposé** (vert), **KO** (rouge). Tant qu'aucun n'est choisi, les 4 boutons
  gris s'affichent côte à côte ; un clic replie l'affichage sur le **seul** statut choisi (coloré) — les
  dossiers traités s'alignent, plus lisibles. **Recliquer la pastille désélectionne tout** (retour aux 4
  gris) pour re-choisir. Colonne `candidats.suivi` (migration one-shot depuis `traite`), PATCH `{suivi}`,
  bascule optimiste. Pastilles calées sur la boîte de `.ds-pill` (même hauteur que le tag « Analysé »).
- **Export PDF sélectif + persistant** : une case à cocher par candidat (toutes cochées par défaut),
  l'export ne génère que les cochés. État **persisté** en base (`candidats.exclu_export`, PATCH
  `{excluExport}`) — survit au refresh/retour. ⚠️ La case vit DANS `ds-row__main` : l'ajouter comme 3ᵉ
  enfant direct de `.ds-row` (`justify-content:space-between`) recentrait le nom (bug corrigé).
- **Salaire salarié = CASH RÉCURRENT, pas le « Net » gonflé (LE point important)** : un bulletin peut
  gonfler la ligne « Net » avec des éléments qui ne sont pas du salaire récurrent versé. RETINA prenait
  la ligne « Net » → surestimation. Cas réel **Lourenco** (Carrousel SA) : RETINA lisait **6 850 €** alors
  que le cash récurrent réel est **~4 111 €** (+50 % → faux positif, score 95). Deux distorsions :
  1. **Avance sur bonus 2 500 €/mois** dans le brut = avance remboursable, **pas du salaire**.
  2. **Avantage en nature voiture 945 €** ajouté au brut pour être taxé puis **retenu** (jamais viré) ;
     RETINA prenait « Net » (6 824) au lieu de « **A payer** » (5 855, le vrai virement).
  - **Extraction enrichie** (`SCHEMA_PAIE` + prompt) : `net_a_payer` (le virement réel), `avantage_en_nature`,
    `elements_non_recurrents` (+ détail). Règle Vincent : **on retient le CASH** ; on exclut bonus/avance
    (pas stable) ET tout le non-cash (avantage nature, allocations/frais).
  - **Synthèse** (`recurCash`) : salaire retenu = `net_a_payer` **au prorata de la part récurrente du
    brut de cash** = `net_a_payer × (brut − avantage − non_récurrents)/(brut − avantage)`. Repli prudent
    (soustraction directe) si brut illisible. Note « à vérifier » + `net_a_payer_moyen`/`exclusions`.
  - **Rétrocompatible** : sans les nouveaux champs (anciennes extractions), on retombe sur l'ancien calcul
    → **les dossiers existants doivent être ré-analysés** (`force:true`) pour bénéficier de la correction.
  - **Vérifié sur le vrai dossier Lourenco (prod, `force:true`)** : salaire retenu **4 111 €** (au lieu de
    6 851), net à payer moyen 5 897, exclusions affichées « avance sur bonus 2 500 €/mois » + « avantage en
    nature 946 €/mois ». Le score reste élevé (94) : le ratio était déjà confortablement au-dessus du seuil,
    donc un salaire honnête de 4 111 € couvre encore le loyer — le but était un **salaire vrai**, pas un
    score plus bas.

- **⚠️ BUG LATENT CORRIGÉ — réextraction forcée d'un document « dossier » (400 API).** Découvert en
  déclenchant `force:true` sur Lourenco : les 4 documents tombaient tous en `erreur_document` avec
  `400 messages.0.content.1.text.text: Field required`. **Ce n'était PAS le changement de salaire**
  (reverté puis re-appliqué : erreur identique sans lui). Cause racine : un fichier uploadé en batch est
  extrait par `extractDocumentAuto` puis **stocké `type='dossier'`**. À la réanalyse **forcée**,
  `analyse.ts` routait par `if (type==='auto'||type==='autre')` → un `'dossier'` retombait dans la branche
  **typée** `extractDocument('dossier')`, pour laquelle **il n'existe ni `PROMPTS['dossier']` ni
  `SCHEMAS['dossier']`** (undefined) → le bloc texte partait sans champ `text`. Latent car l'analyse
  **normale** saute les documents déjà `done` ; seul `force:true` (ou un ré-run) le déclenchait.
  **Fix** (`analyse.ts`) : seuls les types LEGACY rattachés à la main (`fiche_paie`/`contrat`/
  `piece_identite`) passent par l'extraction typée ; **`auto`, `autre` ET `dossier`** repassent par
  `extractDocumentAuto` (qui redétecte le contenu). **Leçon durable** : un « champ requis manquant » côté
  API sur un bloc texte = un **prompt `undefined`** en amont (clé de map inexistante), pas un problème de
  forme de requête ni de version SDK — le corps sérialisé était prouvé correct en local.
