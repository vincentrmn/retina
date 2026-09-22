---
name: tally
description: Formulaire de candidature Tally de RETINA (structure bilingue, webhook, pièges du MCP Tally). Charger avant de modifier le formulaire, le webhook `src/app/api/webhooks/tally` ou les matchers de `src/lib/discretionnaire.ts`.
---

# Formulaire de candidature Tally

## Ce qui existe (vérifié le 20/07/2026)
- UN formulaire pour tous les biens : `https://tally.so/r/ob1NPX` (compte vincent@korr.lu), rattaché
  au bien par les champs cachés `bien` (id RETINA) et `adresse`, portés par l'URL.
- Bilingue, 274 blocs, 14 pages : page 1 = intro + choix de langue (requis) ; pages 2 à 7 FR
  (consentement, identité, situation, projet, à propos, documents) ; pages 8 à 13 EN jumelles ;
  page 14 = remerciement partagé. Intro et remerciement FR/EN cachés par défaut, révélés selon la
  langue : jamais deux langues empilées (refusé par Vincent).
- Champs de saisie « nus » (libellé dans le champ, choix de Vincent). Upload multiple : PDF, JPEG,
  PNG, WebP, HEIC, 10 Mo par fichier (plafond du plan gratuit), 20 fichiers. CAPTCHA.
- Webhook configuré **à la main** dans Tally (Integrations, Webhooks) vers
  `/api/webhooks/tally` de la prod, avec le signing secret égal à `TALLY_SIGNING_SECRET`.
- Toutes les réponses sont archivées dans `candidats.tally_answers` ; `discretionnaire.ts` les lit
  (composition, animaux, durée) en FR et en EN.
- RGPD : la rétention automatique (30 j) demande Tally Business, non actif ; les documents existent
  en double (Tally et RETINA) tant qu'on n'efface pas les soumissions à la main.

## Procédure : modifier le formulaire par le MCP
1. `load_form` sur `ob1NPX` : tout se fait dans un brouillon en mémoire ; rien n'est en ligne avant
   `save_form`.
2. Créer les champs nus **un par un** et vérifier `blockUuids.length` après chaque appel ; les
   questions TITLE + options passent en lot (10 groupes max par appel).
3. Déléguer les créations à un sous-agent (chaque retour renvoie 15 à 25 k tokens de ledger).
4. Vérifier au ledger (types, `## Page flow`, `## Logic rules`) : le rendu n'est pas visible au
   navigateur (le proxy bloque `tally.so`).
5. **`save_form` dès que la structure est vérifiée**, sans pause ni question entre les deux.
6. Si un libellé change : étendre les regex du webhook et de `discretionnaire.ts`.

## Pièges
- `create_blocks` **perd silencieusement** des champs nus créés en lot (`INPUT_DATE`, `INPUT_EMAIL`,
  `INPUT_PHONE_NUMBER`, `MULTIPLE_CHOICE_OPTION`...), de façon déterministe ; un champ nu seul passe.
- Le brouillon se **perd à la reconnexion du MCP** (`list_blocks` renvoie `{}`) : une version complète
  a été perdue le 20/07 en attendant une réponse avant de sauver.
- Un `JUMP TO PAGE` d'`apply_logic` s'ancre sur la page de la question de la condition. Le saut FR
  vers le remerciement est donc conditionné sur l'upload FR de la page 7 (`IS NOT EMPTY`), pas sur
  la langue de la page 1 (le candidat FR aurait tout sauté).
