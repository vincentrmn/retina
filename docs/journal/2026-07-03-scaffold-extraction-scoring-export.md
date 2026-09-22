# Sessions du 03/07/2026 : scaffold, extraction, scoring, export PDF, indépendants

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 192 à 421) le 22/09/2026. -->

## État d'implémentation (03/07/2026)

**Scaffold complet livré et buildable** (`npm run build` passe). Stack répliquée de VESPER
(le plus récent des deux) : Next.js 14.2 App Router sous `src/`, CSS maison — `globals.css`
copié tel quel de Vesper (tokens + primitives `.ds-*` « BBI tools », topbar/brand identiques,
logo Brouwers) —, Postgres via `pg` + `ensureSchema()` idempotent, mêmes conventions
(`force-dynamic` sur toute route GET qui touche la DB, try-catch + JSON d'erreur partout).

- **Schéma** (`src/lib/db.ts`) : `biens` (adresse, loyer, charges, `criteres` JSONB) →
  `candidats` (nom, statut, `synthese`/`coherence`/`score` JSONB) → `documents`
  (personne A/B, type, fichier en **BYTEA** + `extraction` JSONB brute pour audit).
  Stockage des documents en base (le fs Railway est éphémère) ; DELETE candidat = CASCADE
  documents (RGPD).
- **Extraction** (`src/lib/extract.ts` + `schemas.ts`) : SDK `@anthropic-ai/sdk`,
  `claude-opus-4-8`, un appel par document, **structured outputs**
  (`output_config.format` json_schema) — chaque champ = `{value, confiance}`, `value:null`
  si illisible, jamais inventé. PDF → bloc `document` base64, images → bloc `image`.
  Adaptive thinking activé (scans sales). ⚠️ SDK ≥ 0.110 requis (`"adaptive"` inconnu des vieux types).
- **Synthèse + cohérence** (`src/lib/synthese.ts`, code pur) : agrégation par personne
  (salaire net = moyenne des bulletins, ancienneté, essai…) + 4 contrôles croisés
  (nom paie↔identité, employeur contrat↔paie, salaire contrat↔paie ±15 %, bulletins
  consécutifs et < 3 mois).
- **Scoring** (`src/lib/scoring.ts`, code pur) : 40 ratio (palier ≥ ratioMin) + 30 stabilité
  (CDI 30 / CDI en essai 22 / CDD 15 ou 8 selon `cddAccepte` / intérim 8, pondérée par
  salaire) + 15 ancienneté + 15 cohérence (−5 par incohérence). Éliminatoires paramétrables
  par bien (`ratioEliminatoire`, `cdiRequis`, `essaiEliminatoire` si tout le ménage est en
  essai) → **score plafonné à 40/100** + affiché en rouge. Testé sur dossier fictif
  (couple, incohérence de nom détectée, cap éliminatoire vérifié).
- **Pages** : `/` (biens), `/biens/new` + `/biens/[id]/edit` (formulaire commun
  `BienForm`), `/biens/[id]` (KPI + candidats classés par score), `/candidats/[id]`
  (upload par personne/type, bouton Analyser avec spinner, fiche signalétique, cohérence,
  score détaillé, champs douteux « à vérifier »).
- **API** : `biens`, `biens/[id]`, `candidats`, `candidats/[id]`,
  `candidats/[id]/analyze` (extrait les docs manquants → synthèse → score, `{force:true}`
  pour tout ré-extraire), `documents` (upload multipart 15 Mo max, PDF/JPEG/PNG/WebP),
  `documents/[id]/file` (sert le scan).

### Session POC (03/07/2026) — testé sur documents réels

- **Multi-bulletins** : un PDF scanné contient souvent plusieurs mois (cas réel « fiche de
  salaire nico 04-05-06 ») → `SCHEMA_PAIE` retourne un **tableau `bulletins`**, la synthèse
  aplatit. Ne pas revenir à un bulletin par document.
- **Extraction validée sur vrais scans** (bulletins LUXFUEL, contrat CGI, passeport tunisien) :
  montants exacts, nuances captées (CDI signé sans date de début — liée à l'autorisation de
  travail —, essai 6 mois non calculable, nom d'épouse « HAMDI EP KARAA »). Les **`remarques`**
  du modèle sont précieuses → affichées dans la carte Documents.
- **Fix scoring** : la pondération par salaire ne s'applique que si TOUS les salaires sont
  connus (sinon une personne sans bulletin avait un poids nul et son contrat disparaissait
  du score) — moyenne simple à défaut.
- **Responsive mobile vérifié** (Playwright 390 px, zéro overflow) : ajouts CSS `.ds-grid--cards`
  (cartes A/B empilées) et `.upload-file` en fin de `globals.css`, section « RETINA — ajouts ».
- Flux complet testé end-to-end en local (Postgres 16 local) : bien → candidat → upload 3
  vrais PDF → analyse 19 s → score 55/100 cohérent (bulletins 2024 signalés trop vieux).

### Retours Vincent (03/07/2026 soir) — upload batch + polish, livré

- **Upload en batch (feature clé)** : une seule dropzone, tous les documents en vrac, sans
  choisir type ni personne. Pipeline en 2 temps : **classification Haiku**
  (`claude-haiku-4-5`, `SCHEMA_CLASSIFICATION` minuscule) puis extraction typée Opus.
  ⚠️ Un schéma unique type+extraction dépasse la limite API de 16 paramètres à union
  (l'erreur 400 le dit explicitement) : ne PAS re-fusionner les deux étapes.
- **Rattachement automatique A/B** (`assignPersonnes`, code pur) : regroupement des docs par
  nom extrait (`sameEntity`), les docs déjà rattachés ancrent leur groupe, badge A/B cliquable
  pour corriger à la main (PATCH `/api/documents`). `documents.personne = '?'` tant que non
  rattaché, `documents.type = 'auto'|'autre'` possibles.
- **Complétude** (`buildCompletude`) : par personne, pièce d'identité / contrat / 3 bulletins
  récents, affichée en carte « Le dossier est-il complet ? » (ok/partiel/manquant).
- **Zéro tiret cadratin** dans l'UI (exigence Vincent) : chaînes de code nettoyées, remarques
  du modèle sanitisées (`sansCadratin` dans extract.ts) + consigne dans les prompts.
- **Typo/responsive** : KPI `.ds-stat` empilés (libellé au-dessus, valeur en `--ds-fs-lg` au
  lieu de xl), boutons sans débordement (wrap sur mobile), section « RETINA — ajouts » de
  `globals.css`.

**Déploiement Railway — FAIT (03/07/2026), testé end-to-end en prod** :
- **URL : https://retina-production-6d72.up.railway.app** (un 2ᵉ domaine `retina-production-9985`
  existe aussi, généré en double — sans conséquence). Analyse d'un dossier réel en prod : 21 s,
  score identique au local.
- Projet `charming-vibrancy` (`de11fb07-1f08-4e60-b5f5-c57a855a5399`), env `production`
  (`28421880-…`), services `retina` (`f35c7920-…`, repo GitHub branche `main`, auto-deploy)
  et `Postgres` (`1d39e419-…`).
- Variables posées sur `retina` : `DATABASE_URL = ${{Postgres.DATABASE_URL}}`,
  `ANTHROPIC_API_KEY` (clé dédiée au projet, doc « Clé API » du Drive), `PGSSL = require`.
- Pilotage Railway depuis Claude **en GraphQL direct** (`backboard.railway.com`,
  `Authorization: Bearer <workspace token>`) — même méthode que Vesper ; la CLI/MCP
  rejettent ce token. Le token n'est PAS stocké : le redemander à Vincent au besoin.

### Retours Vincent (03/07/2026 nuit) — polish + export PDF, livré

- **Export PDF par bien** (`src/lib/exportBien.ts`, client-side jsPDF + autotable, logo Brouwers
  rasterisé du SVG comme Vesper) : page de garde (récap bien + KPI + critères en bullets) +
  classement des candidats + une fiche par candidat (score détaillé, synthèse A/B, cohérence).
  Bouton « Exporter en PDF » sur la page bien (récupère la fiche complète de chaque candidat).
  ⚠️ Police Helvetica de jsPDF = WinAnsi : pas de `≥ × ≈ —`. Fonction `S()` les remplace
  (`min.`, `x`, `~`, `-`). Le `€` passe.
- **Recalcul des scores à l'édition du bien** (`PATCH /api/biens/[id]`) : si loyer/charges/critères
  changent, on recalcule le score de chaque candidat depuis sa `synthese`/`coherence` déjà stockées
  (aucune ré-extraction, **zéro coût API**). Retourne `{rescored}`.
- **Comptage « analysés »** : compté sur `score IS NOT NULL` (et non `statut='analyse'`), sinon un
  candidat en `erreur_document` mais avec un score partiel n'était pas compté (bug remonté par Vincent).
- **Coût API mesuré** (`count_tokens` sur les vrais docs) : ~0,36 $/dossier, conforme à l'estimation.
  Le driver = tokens d'entrée des scans haute résolution (passeport = 25k tokens, pages de visa
  vierges incluses), PAS le thinking (mesuré : qualité identique avec/sans, coût quasi identique).
  Levier futur : plafonner la résolution (pas de `sharp` dispo, à faire proprement).
- **Bug scoring corrigé** : `Personne ${p}` au lieu de `${p.personne}` produisait `[object Object]`.
- **Français plus soigné** partout (détails de score en vraies phrases), plus de `×`/`≥` dans les
  chaînes UI (formulations « fois », « au minimum »).
- **UI** : carte d'intro Retina sur l'accueil (3 étapes) ; critères du bien en **vrais bullets**
  (hors KPI) ; **scores colorés** dans la liste candidats (rouge si éliminatoire/faible, vert si
  solide, ambre entre les deux) ; **notes du score alignées** en colonne fixe (`.score-row`) ;
  **fiche synthèse A/B à lignes constantes** (tiret si absent) ; **carte ratio en rouge léger** si
  revenus insuffisants ; **champs en fond blanc** (un champ gris paraissait désactivé) ; **badge
  A/B des documents** clairement cliquable (`.doc-person`) + hint expliquant la détection auto ;
  explication de la méthode + paliers dans le formulaire du bien.
- **Favicon** : `src/app/icon.svg`, motif d'œil (rétine) dans le vert BBI.

### Retours Vincent (03/07/2026, session fiabilisation UI + export PDF)

Gros lot de polish + corrections, tout livré et déployé (prod testée à chaque fois).

- **Export PDF fiabilisé (le morceau clé)** : le PDF sortait des lignes cassées / caractères
  parasites (`!`, espacement des lettres déréglé). **Cause racine trouvée en générant puis en
  RASTERISANT le PDF** (jsPDF en Node + `pdf.js`, cf. §Méthode de test) : la police Helvetica de
  jsPDF n'encode que **WinAnsi (CP1252)**. Détail complet dans les Pièges ci-dessous. `S()` dans
  `exportBien.ts` réécrit → ne laisse QUE du WinAnsi atteindre le PDF, appliqué globalement via un
  **override de `doc.text`** (couvre aussi les cellules autotable) + sur les champs libres des
  tableaux (mesure de largeur). Plus d'espace autour des `/`.
- **Incohérences validables à la main** : bouton « Marquer OK » sur chaque incohérence →
  `CoherenceCheck.ignored`, le scoring ne pénalise plus (`!c.ok && !c.ignored`), recalcul depuis la
  synthèse stockée (`PATCH /api/candidats/[id]` avec `ignoreCoherence`, **zéro coût API**). Le PDF
  affiche alors « OK » vert + « validé à la main », plus le rouge.
- **Contrôles de cohérence réécrits en français clair** (phrases complètes, fini le style
  télégraphique `Contrat : « X » / bulletins : « Y »`).
- **Nom de repli** (`buildSynthese`) : sans pièce d'identité, on prend le nom porté par le contrat
  ou les fiches de paie (marqué « à vérifier »), au lieu de n'afficher aucun nom.
- **Critères d'éligibilité repensés** (`BienForm`) : chaque critère a un **interrupteur « activer »**
  + une **puce « Éliminatoire »** (toggle rouge). Nouveaux champs `Criteres` (`ratioActif`,
  `cdiActif`/`cdiEliminatoire`, `essaiActif`, `ancienneteActif`) + **`normalizeCriteres()`** pour la
  compat ascendante des biens existants (ancien `cdiRequis` = actif+éliminatoire, etc.). Un critère
  désactivé = grisé, ignoré au calcul (ratio désactivé ⇒ 40/40, pas d'exigence de revenus).
  `normalizeCriteres` appliqué à la persistance (POST/PATCH biens) et au scoring.
- **« Comment le score est-il calculé ? »** en **tableau à hauteur de ligne constante** (Critère /
  Points / Comment) au lieu d'une liste à puces.
- **Topbar** : grille `auto 1fr auto` (au lieu de `1fr auto 1fr` qui écrasait la colonne des boutons
  et les cassait en escalier) → les boutons tiennent sur une ligne, le titre tronque proprement.
- **Divers** : RETINA en majuscule partout (dont `<title>`) ; suppression du paragraphe « Le
  principe » de l'accueil ; carte de cohérence et carte de complétude passées en layout `.score-row`
  empilé (libellé au-dessus, phrase dessous) — plus de tassement sur mobile ; puces `.ds-bullets`
  centrées sur la 1ʳᵉ ligne via `calc(0.75em - 3.5px)`.

### Retours Shawna (03/07/2026) — premiers retours utilisateur, livrés + déployés

- **Titre trop long qui chevauchait la marque** (`.page-title`) : cause = `justify-self:center`
  dimensionnait le titre à son contenu, donc `overflow:hidden` ne coupait rien. Passage en
  `justify-self:stretch` + rognage sur 2 lignes (`-webkit-line-clamp`). Le nom long passe sur une 2ᵉ
  ligne, plus de chevauchement.
- **Fiche candidat trop bavarde** : suppression de l'affichage des `remarques` libres du modèle
  (numéros de passeport, fautes, matériel reçu, mentions manuscrites…) — du bruit pour Shawna. Elles
  restent dans l'extraction stockée (audit), juste plus affichées.
- **Un seul gros scan « tout dedans » (LE gros point)** : avant, chaque fichier était classé en UN
  type et extrait comme tel → un scan mélangeant contrat + fiches de paie + pièce d'identité perdait
  tout sauf un type. Refonte de l'extraction batch :
  - `extract.ts` → **extraction dossier** : Haiku détecte les **types présents** (`SCHEMA_TYPES_PRESENTS`,
    3 booléens), puis Opus extrait **en parallèle** chaque type présent avec son schéma **« tableau »**
    (`SCHEMA_CONTRATS`, `SCHEMA_IDENTITES` — un par appel, réutilise le pattern éprouvé des bulletins ;
    ⚠️ **ne pas** fabriquer un schéma géant unique, ça retombe sur la limite des unions). Stocké
    `type='dossier'` avec `fiches_de_paie[]/contrats[]/pieces_identite[]`.
  - `synthese.ts` → **`partitionByPerson`** : on aplatit tous les documents extraits en « items »
    (paie/contrat/identité, chacun avec son nom) puis on regroupe **par nom** (sameEntity). Gère
    « un scan par personne » (un seul nom) ET « un scan pour tout le couple » (items répartis sur 2
    noms). Les documents typés legacy forcés A/B à la main restent honorés. `assignPersonnes` (ancien
    rattachement par fichier) supprimé.
  - UI : un fichier dossier affiche son contenu (« Dossier · 3 fiches de paie, 1 contrat, 1 pièce
    d'identité »), plus de badge A/B par fichier.
  - **Testé sur dossiers fictifs** (couple mélangé → A/B séparés, personne seule → 1 personne, legacy
    forcé → inchangé, cohérence par personne OK). ⚠️ **Calibration sur vrais scans mixtes de Shawna =
    étape suivante** (l'extraction Haiku+Opus n'est validée que sur des dossiers fabriqués).

### Candidats INDÉPENDANTS (03/07/2026) — livré + déployé, barème par défaut à valider

Nouveau profil, branché sur la même architecture (l'IA lit, le code juge) et sur l'extraction
dossier multi-documents. **Barème = valeurs par défaut, à caler avec Shawna sur un vrai dossier.**

- **Documents** : 3 nouveaux types (`avis_imposition`, `bilan`, `kbis`), chacun avec son schéma
  « tableau » (plusieurs années/exercices, plusieurs personnes). Ajoutés à `SCHEMA_TYPES_PRESENTS`
  (Haiku) et `SCHEMAS_MULTI`/`PROMPTS_MULTI` (Opus). `DossierType` = `DocType` + ces 3 types,
  `DOSSIER_TYPES` boucle l'extraction. `ExtractionDossier` gagne `avis_imposition[]/bilans[]/kbis[]`.
- **Synthèse** (`emploiIndependant`) : une personne SANS fiche de paie NI contrat mais AVEC des
  documents d'activité → profil indépendant. Revenu mensuel = **revenu net annuel moyen des 2 derniers
  exercices / 12** (avis d'imposition **prioritaire**, sinon `resultat_net` des bilans). Ancienneté =
  âge de l'entreprise (KBIS `date_immatriculation`, sinon `date_creation` du bilan). ⚠️ Un **gérant qui
  se verse un salaire** (fiches de paie présentes) reste traité en **salarié**. `SynthesePersonne.emploi`
  gagne un sous-objet `independant` (revenus annuels retenus, moyenne, forme juridique, CA, source).
- **Scoring** (`scoring.ts`, constantes en tête) : `DECOTE_INDEP = 0.2` → le revenu de l'indépendant
  n'est retenu qu'à **80 %** pour le ratio (revenu moins régulier ; note explicite dans le détail :
  « X retenus sur Y de revenu réel »). Stabilité : `ANCIENNETE_INDEP_MIN_MOIS = 24` → **18 pts** si
  activité ≥ 2 ans, **8 pts** sinon. `revenusMenage` du score = revenu **retenu** (cohérent avec le ratio).
- **Complétude** indépendant : pièce d'identité, avis d'imposition (×2), bilans, KBIS.
- **UI** : fiche signalétique « indépendant » dédiée (statut, forme juridique, revenu mensuel + moyenne
  annuelle + source, revenus annuels retenus, CA, entreprise, activité depuis) ; dropzone, export PDF et
  explication du calcul dans le formulaire du bien à jour.
- **Testé sur dossiers fictifs** : indépendant seul (avis 2 ans + bilan + KBIS) → revenu, décote,
  ancienneté OK ; couple **salariée CDI + indépendant mélangés dans un seul scan** → séparation A/B par
  le nom + revenu ménage retenu corrects. ⚠️ **Calibration sur un vrai dossier d'indépendant = étape
  suivante** (l'extraction avis/bilan/KBIS n'est validée que sur des dossiers fabriqués).

### Première calibration sur un VRAI dossier (03/07/2026) — Shawna, dossier « LANG-STREE »

Premier test utilisateur du profil indépendant sur un vrai scan. Shawna a signalé « 15 bulletins
alors que le document présente 12 salaires 2025 ». **Diagnostic (données réelles inspectées) : ce
n'est PAS un bug.**

- **Le « 15 » est correct** : la personne **Strée Florian** a eu **deux employeurs** en 2025 —
  **Amplo Liège** (12 bulletins, janvier→décembre) + **NV ERGOFLEX** (3 bulletins : mars, sept, oct).
  12 + 3 = 15. Le modèle a tout lu ; Shawna n'avait compté que l'employeur principal.
- **Le couple a été correctement séparé** depuis le seul gros scan : **Strée Florian = salarié**
  (15 bulletins, 2 employeurs), **Lang Jessie = indépendante** détectée via son **avis d'imposition
  2024** (36 048 €/an → 3 004 €/mois). Donc la détection couple + le profil indépendant tiennent sur
  du réel. 👍
- **Deux vrais points relevés au passage → SPRINT 2** :
  1. **Employeur affiché = le 1ᵉʳ bulletin trouvé** (`paies.map(...).find`) = « NV ERGOFLEX » (mineur,
     3 mois) au lieu d'« Amplo Liège » (principal, 12 mois). Afficher l'employeur **dominant** (le plus
     fréquent) et/ou signaler « 2 employeurs ». Cosmétique, sûr.
  2. **Salarié SANS contrat de travail** → `type_contrat = null` → **0 pt de stabilité**, ce qui plombe
     la note malgré un an de fiches de paie. Piste (à valider avec Shawna) : sans contrat, retenir une
     stabilité « salarié, contrat non fourni » (~15/30) au lieu de 0, avec une note « contrat manquant ».
- **Méthode — accès aux données de prod** : le port TCP Postgres (`hayabusa.proxy.rlwy.net:30422`) est
  **injoignable** (egress limité au HTTPS via le proxy) → `psql` timeout. Contournement : l'app RETINA
  est **ouverte (sans auth)**, donc on inspecte l'extraction stockée directement via l'**API prod**
  (`GET /api/candidats/[id]` renvoie `documents[].extraction` complet). Réutilisable pour tout debug data.
