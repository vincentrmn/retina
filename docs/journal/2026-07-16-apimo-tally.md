# Sessions du 16/07/2026 : Apimo, Tally, analyse en fond

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 467 à 575) le 22/09/2026. -->

### Intégration Apimo + Tally (16/07/2026) — candidatures en ligne automatisées

Pipeline complet livré et déployé : **Apimo (biens) → RETINA → lien Tally par bien → le candidat
remplit et uploade → webhook → candidat créé + documents téléchargés + analyse automatique**.
Le Google Sheets sort du circuit : les données Tally vivent dans le Postgres RETINA (et pourront
être synchronisées vers Pipedrive demain — email/téléphone déjà stockés).

- **Import Apimo** (`src/lib/apimo.ts` + `POST /api/apimo/sync` + bouton « Synchroniser Apimo » sur
  l'accueil) : biens à la location uniquement (`category=2`, `status=1`). Mapping : loyer =
  `price.value` (period 4 = mensuel), **charges = `price.fees`**, libellé = titre FR de l'annonce +
  ville (l'API n'expose PAS l'adresse postale, `address` est null). Dédoublonnage par `apimo_id`
  (upsert : critères ET adresse d'un bien existant conservés — l'adresse a pu être précisée à la
  main —, seuls loyer/charges se rafraîchissent, avec recalcul des scores si le coût change — zéro
  coût API). ⚠️ `price.fees` est
  souvent vide côté Apimo alors que le bien a des charges (constaté sur APP025 : 0 vs 225 € encodés
  par Shawna) → la synchro **ne met à jour les charges que si Apimo en fournit** (jamais d'écrasement
  par un zéro). Un bien encodé à la main peut être **rattaché à sa fiche Apimo** via
  `PATCH /api/biens/[id]` `{apimoId}` (fait pour le bien LANG-STREE ↔ APP025, doublon supprimé).
  Un bien retiré d'Apimo n'est jamais supprimé. Identifiants : clé « Brouwers AI » (`APIMO_PROVIDER=4764`,
  `APIMO_AGENCY=16579`, `APIMO_TOKEN` — doc Sprint 1 BBI Launchpad du Drive). ⚠️ Apimo n'expose que
  les biens où le partenaire « Brouwers AI » est activé MANUELLEMENT sur la fiche (4 biens location
  exposés au 16/07). Quota 1000 appels.
- **Formulaire Tally unique** : `https://tally.so/r/ob1NPX` (compte vincent@korr.lu, créé via MCP
  Tally). UN formulaire pour tous les biens, rattaché par **champs cachés `bien`** (id RETINA) et
  **`adresse`** (affichée dans le texte d'accueil par mention) portés par l'URL — PAS un formulaire
  par bien (zéro dérive, un seul webhook). **Refondu (16/07 soir) sur le modèle exact du
  « Questionnaire candidat location » existant (`XxyprV`, celui qui alimentait le Google Sheets)** :
  même branding (logo Brouwers, cover, bouton « Commencer »), mêmes pages — consentement RGPD
  (case obligatoire), identité complète par candidat (nom, prénom, naissance, email, téléphone,
  adresse postale ; section « second co-titulaire » en logique conditionnelle), situation
  professionnelle et revenus déclarés (x2), projet locatif (motif, date d'entrée, durée, occupants,
  animaux), « à propos » — PLUS la page « 05. Documents » : **upload multiple** (PDF/JPEG/PNG/WebP/
  HEIC, 10 Mo max par fichier = plafond du plan Tally gratuit, 20 fichiers max) et CAPTCHA anti-spam.
  ⚠️ create_blocks du MCP : max 10 groupes par appel. La page bien affiche le lien copiable (carte
  « Candidature en ligne », construite depuis `TALLY_FORM_ID` côté serveur).
- **Toutes les réponses du questionnaire sont archivées** dans `candidats.tally_answers` (JSONB,
  libellé + valeur lisible, ids d'options résolus en texte) et affichées en carte « Réponses du
  questionnaire » sur la fiche candidat — le Google Sheets est entièrement remplacé. Le webhook
  apparie les personnes par les paires de questions « Nom »/« Prénom » (candidat principal puis
  second co-titulaire) pour nommer le dossier.
- **Webhook** (`POST /api/webhooks/tally`) : signature **HMAC-SHA256 base64 vérifiée**
  (`TALLY_SIGNING_SECRET`, en-tête `tally-signature`) — sans secret configuré, tout est refusé.
  **Idempotence** par `tally_submission_id` (index unique : Tally rejoue les webhooks en échec).
  Crée le candidat (nom = les 2 noms joints par « et », email, téléphone, `source='tally'`),
  télécharge les fichiers depuis le stockage Tally (URLs à token du payload), les insère en
  `documents` (`type='auto'`, `personne='?'` → pipeline batch existant), puis lance
  **`analyseCandidat()` en arrière-plan** (réponse à Tally < 10 s, timeout webhook Tally). Un bien
  inconnu répond 200 (inutile que Tally rejoue). L'analyse est factorisée dans **`src/lib/analyse.ts`**
  (partagée avec le bouton Analyser).
- **Schéma** : `biens.apimo_id` (unique partiel), `candidats.email/telephone/source/
  tally_submission_id` (unique partiel). HEIC accepté à l'upload Tally mais pas par l'API Anthropic :
  le webhook l'ignore proprement (listé dans `ignores`), à convertir si ça devient fréquent.
- **Config webhook côté Tally = MANUEL** (ni le MCP ni l'API publique sans clé ne le permettent) :
  Tally → formulaire → Integrations → Webhooks → endpoint
  `https://retina-production-6d72.up.railway.app/api/webhooks/tally` + signing secret = valeur de
  `TALLY_SIGNING_SECRET` sur Railway. Fait une fois, vaut pour tous les biens.
- **Variables Railway** posées sur `retina` : `TALLY_SIGNING_SECRET`, `TALLY_FORM_ID=ob1NPX`,
  `APIMO_PROVIDER/TOKEN/AGENCY`. ⚠️ Piège : le **MCP Railway** (`railway-agent`) « stage » les
  variables sans les appliquer — exiger ensuite un **commit des staged changes** (sinon le déploiement
  suivant part sans). Vérifier avec un appel API qui lit la variable.
- **RGPD** : la rétention auto des soumissions Tally (30 j) exige **Tally Business** — pas actif.
  Les documents vivent donc EN DOUBLE (Tally + Postgres RETINA) tant qu'on n'efface pas les
  soumissions Tally à la main (ou upgrade). RETINA reste la base de référence.
- **Sécurité coût API** : CAPTCHA sur le formulaire + idempotence par soumission. Pas de plafond
  d'analyses par bien pour l'instant.
- ⚠️ Piège shell : `pkill -f "next start"` dans une commande Bash se tue lui-même (le motif matche
  la ligne de commande du shell). Utiliser `pkill -f '[n]ext-server'`.
- **Auth reportée** (décision Vincent 16/07) : à faire quand BBI passera sur Workspace. D'ici là,
  l'app reste ouverte — ne pas diffuser l'URL RETINA au-delà de Shawna.

### Retours Vincent (16/07/2026 soir) — lien court, devises étrangères, zip

- **Lien court de candidature** (`/c/<id>`, redirection 302 vers Tally) : livré ce soir-là puis
  **SUPPRIMÉ dans la foulée** (voir « Retours Vincent, suite » plus bas) — il exposait le domaine
  RETINA aux candidats. La carte « Candidature en ligne » affiche l'URL Tally directe.
- **Devises étrangères (bug réel remonté par Vincent : fiche de paie en MUR comptée en euros)** :
  champ `devise` (code ISO, `{value, confiance}`) ajouté aux schémas bulletins/contrat/avis/bilans,
  prompts explicites « montants TELS QUELS dans la devise du document, ne convertis JAMAIS en
  euros ». La synthèse n'additionne que les montants EUR (devise absente = EUR, compat anciennes
  extractions), signale les documents écartés dans `aVerifier` ET dans un contrôle de cohérence
  dédié « Les montants du dossier sont en euros » (rouge, validable à la main). Jamais de conversion
  (déterminisme). ⚠️ Les documents étrangers déjà extraits AVANT ce champ n'ont pas de devise →
  comptés en EUR : utiliser « tout ré-extraire » sur les dossiers suspects.
- **Zip des documents** : bouton « Télécharger tous les documents » sur la fiche candidat →
  `GET /api/candidats/[id]/zip` (jszip, noms dédoublonnés, `dossier-<nom>.zip`). Permet à Shawna
  d'archiver un dossier ailleurs d'un clic.
- **Doublon Mondercange (question Vincent)** : déjà traité à la synchro initiale — le bien manuel de
  Shawna (adresse postale + 225 € de charges conservées, 5 candidats) a été rattaché à APP025 via
  `{apimoId}` et le doublon créé par l'import supprimé ; la synchro ne recrée rien (0 créés).

### Retours Vincent (16/07/2026, suite) — Traité, analyse en fond, Basic Auth

- **Bouton « Traité »** sur chaque candidat de la page bien (suivi de Shawna : appelé, mail envoyé...) :
  colonne `candidats.traite` (bool), `PATCH /api/candidats/[id]` `{traite}`, toggle propre sous le nom
  (« Non traité » pointillé → « ✓ Traité » vert, cliquable dans les deux sens). **Bascule optimiste**
  (l'UI change immédiatement, la sauvegarde part en fond, retour arrière si échec) : pas de
  rechargement de la liste, donc pas de lag. Aucun effet score.
- **Analyse en arrière-plan** : `POST /api/candidats/[id]/analyze` répond immédiatement, statut
  `analyse_en_cours` (garde anti-double-lancement), analyse détachée côté serveur (Railway = process
  persistant). Pages candidat ET bien pollent (3-4 s) tant qu'une analyse tourne ; pastille ambre
  « Analyse en cours… ». Le webhook Tally pose aussi ce statut. On peut quitter la page, l'analyse
  continue et le score apparaît seul.
- **Lien court /c/ SUPPRIMÉ, Basic Auth SUPPRIMÉE (décision Vincent, même soir)** : le lien court
  exposait le domaine RETINA aux candidats (app ouverte). Première réponse = middleware Basic Auth,
  mais Vincent a tranché : pas d'auth avant Workspace, le vrai souci était l'URL. Donc retour au
  lien Tally DIRECT (`tally.so/r/<form>?bien=&adresse=`, long mais domaine neutre) sur la page bien,
  route `/c/[id]` et `src/middleware.ts` supprimés, variables `RETINA_USER`/`RETINA_PASSWORD`
  retirées de Railway. L'app reste ouverte : ne pas diffuser le domaine RETINA aux candidats.
- **Cadratins** : les 2 derniers `—` de textes UI (hint documents + dropzone) remplacés par des virgules.
