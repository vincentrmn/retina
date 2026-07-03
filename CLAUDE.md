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

**Reste à faire** :
1. **Déploiement Railway** (projet + Postgres + `DATABASE_URL`, `ANTHROPIC_API_KEY`,
   `PGSSL=require`) — calquer `docs/DEPLOY.md` de Vesper.
2. **Calibration sur 2–3 dossiers réels anonymisés** (qualité d'extraction Opus sur vrais
   scans + validation du barème avec Shawna) avant mise en main.
3. **Export PDF par bien** (étape 5 du plan) — non commencé.
4. Barème/poids à valider avec Shawna (valeurs actuelles = barème indicatif du §Étage 2).

## Conventions pour Claude Code

- Développer sur la branche désignée de la session ; ne jamais pousser ailleurs.
- L'UI copie SCOUT/VESPER — en cas d'hésitation visuelle, aller lire leur code.
- Aucun score ni champ ne doit être produit par le modèle en texte libre :
  extraction = structured outputs, score = code.
- Ne jamais committer de documents réels de candidats ni de clé API.
