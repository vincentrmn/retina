# RETINA — Analyse de candidats à la location (BBI)

> **R**ental **E**ligibility & **T**enant **I**ncome **N**et **A**nalysis
> Troisième outil de la suite BBI, aux côtés de SCOUT et VESPER.

## Objectif produit

Shawna encode un **bien à la location** (adresse, montant du loyer, charges, critères
financiers d'éligibilité). Pour chaque bien, elle ajoute des **candidats à analyser**
(généralement un couple). À l'ajout d'un candidat, elle uploade les documents du dossier :

- fiches de paie (idéalement les 3 dernières par personne),
- contrats de travail,
- pièces d'identité.

Le moteur analyse ces documents — **souvent des scans de qualité variable** — et en
extrait des informations **déterministes** pour chaque membre du couple (A et B) :

| Champ extrait | Exemple |
|---|---|
| Salaire mensuel net | 2 260 € (moyenne des 3 derniers bulletins) |
| Intitulé du poste | Infirmière |
| Type de contrat | CDI / CDD / intérim / indépendant |
| Période d'essai | Oui/non + date de fin |
| Date d'entrée dans l'entreprise | 2021-03-01 |
| Nom de l'entreprise | CHU de Liège |
| Identité (nom, prénom, date de naissance) | depuis la pièce d'identité |

Il en sort une **fiche signalétique par candidat** avec un **score d'éligibilité**,
et Shawna peut **exporter l'analyse par bien** : récap du bien + analyse de tous
les candidats, pour comparaison et archivage.

## Contrainte design — NON NÉGOCIABLE

RETINA doit utiliser **EXACTEMENT le même design/UI que SCOUT et VESPER** : même
stack front, mêmes composants, mêmes couleurs, même typographie, même layout, même
navigation. Avant d'écrire la moindre ligne d'UI :

1. Demander l'accès aux repos SCOUT et VESPER (via `add_repo`) — l'accès sera
   donné dans une prochaine session.
2. En extraire le design system : stack (framework, CSS), palette, composants
   partagés, structure des pages, conventions de nommage.
3. Répliquer à l'identique. En cas de doute sur un choix visuel, copier ce que
   font SCOUT/VESPER plutôt qu'inventer.

## Architecture

### Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│  Front (même stack/design que SCOUT & VESPER)                │
│  Biens → Candidats → Upload docs → Fiche signalétique → Export │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  Backend RETINA                                              │
│  ┌─────────────────┐   ┌──────────────────┐   ┌───────────┐  │
│  │ 1. EXTRACTION   │ → │ 2. SCORING       │ → │ 3. EXPORT │  │
│  │ Claude API      │   │ Code déterministe│   │ PDF       │  │
│  │ (vision + JSON) │   │ (zéro IA)        │   │           │  │
│  └─────────────────┘   └──────────────────┘   └───────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Principe cardinal : l'IA lit, le code juge.** Le modèle ne fait que de
l'extraction structurée ; le score est calculé par du code classique à partir des
champs extraits et des critères du bien. Même dossier ⇒ même score, toujours, et
chaque point du score est explicable.

### Modèle de données

```
Bien
├── adresse
├── loyer (€/mois)
├── charges (€/mois)
├── criteres_eligibilite        # paramétrables par bien
│   ├── ratio_revenus_min       # ex: revenus nets ≥ 3 × (loyer + charges)
│   ├── cdi_requis / cdd_accepte
│   ├── periode_essai           # éliminatoire ou pénalisante
│   └── anciennete_min          # optionnel
└── candidats[]

Candidat (= un dossier, généralement un couple)
├── personnes[]                 # A et B (ou une seule personne)
│   ├── identite                # extraite de la pièce d'identité
│   └── emploi                  # extrait paie + contrat
│       ├── salaire_net_mensuel (moyenne des bulletins fournis)
│       ├── intitule_poste
│       ├── type_contrat        # CDI / CDD / intérim / autre
│       ├── periode_essai       # bool + date de fin
│       ├── date_entree
│       └── employeur
├── documents[]                 # fichiers uploadés (PDF/images, souvent scans)
│   ├── type                    # fiche_paie / contrat / piece_identite
│   ├── personne                # A ou B
│   └── extraction              # JSON brut retourné par le modèle + confiance
├── coherence[]                 # contrôles croisés (voir plus bas)
├── score                       # calculé, avec détail par critère
└── statut                      # en_attente / analysé / erreur_document
```

### Étage 1 — Extraction (Claude API)

- **Modèle : `claude-opus-4-8`** (Claude Opus 4.8). Choisi pour sa vision haute
  résolution (jusqu'à 2576 px de grand côté) : décisif sur des scans médiocres,
  bulletins photographiés au téléphone, documents de travers. Pas d'OCR séparé
  (Tesseract & co) — les PDF/images passent directement à l'API en base64.
  - Alternative volume : `claude-sonnet-5` (~2× moins cher). Démarrer sur Opus,
    mesurer la qualité sur de vrais dossiers, descendre si ça tient.
- **Structured outputs obligatoires** : chaque appel utilise
  `output_config: {format: {type: "json_schema", schema: ...}}` avec un schéma
  strict par type de document (fiche de paie, contrat, pièce d'identité).
  La réponse est garantie valide et parseable — jamais de texte libre.
- **Un appel par document** (pas un appel géant par dossier) : meilleure
  traçabilité, retry unitaire, coût maîtrisé, et le JSON extrait est stocké
  tel quel à côté du fichier pour audit.
- **Champ de confiance** : le schéma inclut pour chaque champ un niveau de
  confiance + un flag `illisible`. Un champ douteux est affiché comme "à
  vérifier" dans la fiche, jamais inventé.
- **Contrôles de cohérence croisés** (calculés en code après extraction) :
  - nom sur la fiche de paie == nom sur la pièce d'identité,
  - employeur du contrat == employeur du bulletin,
  - salaire du contrat ≈ salaire des bulletins,
  - bulletins consécutifs et récents (< 3 mois).
  Toute incohérence est signalée sur la fiche (utile aussi contre les faux documents).

### Étage 2 — Scoring (code pur, déterministe)

Calculé à partir des champs extraits et des `criteres_eligibilite` du bien.
Barème indicatif (à valider avec Shawna, paramétrable par bien) :

| Critère | Poids indicatif |
|---|---|
| Ratio revenus nets du ménage / (loyer + charges) | 40 pts (palier : ≥3× = max) |
| Stabilité contrat (CDI hors essai > CDI en essai > CDD > intérim) | 30 pts |
| Ancienneté dans l'entreprise | 15 pts |
| Cohérence du dossier (contrôles croisés OK) | 15 pts |
| **Total** | **100 pts** |

Sortie : score global + détail par critère avec la valeur mesurée et le seuil
("revenus 4 520 € = 3,4× le loyer → 40/40"). Un critère marqué *éliminatoire*
dans le bien plafonne le score et l'affiche en rouge, quel que soit le reste.

### Étage 3 — Fiche signalétique & export

- **Fiche signalétique par candidat** : identités A/B, tableau des champs
  extraits, contrôles de cohérence, score détaillé, liens vers les documents
  sources. Champs douteux surlignés.
- **Export par bien** (PDF) : page récap du bien (adresse, loyer, charges,
  critères) + classement des candidats par score + une fiche par candidat.
  Génération serveur par templating (même rendu que l'UI).

## Coûts (ordre de grandeur, mesuré à affiner)

Dossier couple typique : 6 fiches de paie + 2 contrats (5–10 pages) + 2 pièces
d'identité ≈ 15–25 pages scannées ≈ 1 500–3 000 tokens/page en entrée, sortie
JSON faible.

| Modèle | Tarif in/out par M tokens | Coût par dossier candidat |
|---|---|---|
| Opus 4.8 | 5 $ / 25 $ | ~0,30–0,60 $ |
| Sonnet 5 | 3 $ / 15 $ (intro 2 $/10 $) | ~0,10–0,30 $ |

À 100 candidats/mois : < 50 €/mois d'API. Plafonner la résolution des scans
uploadés (côté serveur) pour contrôler le coût token des images.

## Décisions techniques à trancher en session de build

1. **Stack** : celle de SCOUT/VESPER, découverte à l'ouverture de leurs repos.
   Ne rien choisir avant de les avoir lus.
2. **Barème de scoring** : valider les poids et les critères éliminatoires avec
   Shawna (ratio exact, CDD acceptés ou non, essai éliminatoire ?).
3. **Stockage des documents** : suivre ce que font SCOUT/VESPER (fs local, S3,
   DB). Attention RGPD : pièces d'identité et bulletins = données sensibles ⇒
   rétention limitée, accès restreint, suppression du dossier candidat possible.
4. **Clé API Anthropic** : variable d'environnement `ANTHROPIC_API_KEY` côté
   serveur uniquement, jamais côté front.

## Plan de build (prochaines sessions)

1. Ajouter les repos SCOUT et VESPER à la session (`add_repo`) → extraire le
   design system et la stack.
2. Scaffolding RETINA sur cette stack : CRUD Biens + Candidats + upload docs.
3. Moteur d'extraction (schémas JSON par type de document, appels Claude,
   stockage des extractions, contrôles de cohérence).
4. Scoring paramétrable + fiche signalétique.
5. Export PDF par bien.
6. Calibration sur 2–3 dossiers réels anonymisés avant mise en main de Shawna.

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

**Reste à faire** :
1. **Calibration de l'extraction dossier sur de VRAIS scans mixtes** de Shawna (un seul gros PDF avec
   plusieurs documents et/ou deux personnes) : vérifier que Haiku détecte bien les types présents et
   qu'Opus + le regroupement par nom séparent correctement A/B. Aujourd'hui validé sur dossiers fictifs.
   **Inclut le profil indépendant** : caler l'extraction avis d'imposition / bilan / KBIS + valider le
   barème indépendant (décote 20 %, ancienneté 2 ans, revenu = moyenne 2 ans) avec Shawna.
2. **Calibration élargie** (autres dossiers réels du Drive) + validation du barème avec Shawna.
3. Barème/poids à valider avec Shawna (valeurs actuelles = barème indicatif du §Étage 2).
4. Éventuel plafonnement de la résolution des scans (levier coût, si le volume grimpe).

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
