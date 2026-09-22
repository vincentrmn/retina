# CLAUDE.md : RETINA

Lu au début de chaque session. **Tenu sous 200 lignes** : ici les règles de tous
les jours et la carte de la mémoire. Le récit des sessions est dans
`docs/journal/`, les leçons par zone de code dans `.claude/rules/`, les
références dans `.claude/skills/`.

## 1. Le projet en dix lignes

**R**ental **E**ligibility & **T**enant **I**ncome **N**et **A**nalysis : troisième outil BBI,
à côté de SCOUT et VESPER. Utilisatrice : Shawna (BBI, location).
- Un **bien à louer** (loyer, charges, critères d'éligibilité paramétrables), importé d'Apimo ou encodé.
- Des **candidats** par bien (souvent un couple), arrivés par le formulaire Tally ou créés à la main.
- Leurs documents (fiches de paie, contrats, pièces d'identité ; avis d'imposition, bilans, KBIS
  pour un indépendant), souvent des scans médiocres, parfois un seul gros scan « tout dedans ».
- Sortie : une **fiche signalétique** par candidat (A/B), des contrôles de cohérence, un **score /100**
  déterministe, une **recommandabilité** (préférences du bailleur), un **export PDF** par bien.
- **En prod** : https://retina-production-6d72.up.railway.app (ouverte, sans auth : ne jamais diffuser ce
  domaine aux candidats). Ce qui vient : `docs/feuille-de-route.md`.

## 2. Stack et commandes

- Next.js 14.2 App Router sous `src/`, TypeScript, CSS maison (`globals.css` copié de VESPER),
  Postgres via `pg` + `ensureSchema()` idempotent, `@anthropic-ai/sdk` (≥ 0.110), jsPDF client-side.
- Hébergement Railway, déploiement automatique de `main`.
- `npm run check` : typecheck, lint, tests (`tests/**/*.test.ts`, vitest), build. DOIT passer avant tout
  commit (le portique le refuse sinon).
- `package-lock.json` n'est pas suivi (généré au build Railway) : la CI fait `npm install`.
- Local : Postgres 16 dans le bac à sable, `DATABASE_URL` en variable d'environnement.
- Arrêter le serveur local : `pkill -f '[n]ext-server'` (un `pkill -f "next start"` tue le shell lui-même).

## 3. Règles absolues

- **L'IA lit, le code juge.** Le modèle ne fait que de l'extraction en structured outputs
  (`output_config.format` json_schema) ; score, synthèse et cohérence sont du code pur. Même dossier,
  même score.
- Un champ illisible reste `null` avec sa confiance, affiché « à vérifier » : jamais inventé.
- Aucun montant converti d'une devise à l'autre : un document hors euros est écarté et signalé.
- Salaire d'un salarié = **cash récurrent** (net à payer, hors bonus/avance et avantages en nature).
- L'UI copie SCOUT/VESPER à l'identique : en cas de doute visuel, lire leur code, ne pas inventer.
- Zéro tiret cadratin dans l'UI (chaînes de code et textes du modèle).
- Critères d'un bien : toujours via `normalizeCriteres()` (lecture, persistance, scoring).
- Données de candidats = données sensibles (RGPD) : jamais de document réel ni d'extraction réelle
  dans le dépôt, les tests ou les captures commitées.
- Clé Anthropic côté serveur uniquement (`ANTHROPIC_API_KEY`), jamais côté front.
- Aucun secret dans le code, les commits, les docs ou ce fichier.
- Aucun identifiant de modèle dans les commits, PR, code ou commentaires.
- **Vérifier les rendus, ne pas deviner** : capture Playwright sur le vrai `globals.css` (1440 et 390 px)
  pour l'UI, génération puis rastérisation pour le PDF.

## 4. Architecture, en bref

```
Bien ─┬─ criteres (JSONB, normalizeCriteres)        Apimo ──sync──▶ biens
      └─ candidats ─┬─ synthese / coherence / score (JSONB, calculés en code)
                    ├─ tally_answers (JSONB)         Tally ──webhook──▶ candidat + documents
                    └─ documents (BYTEA + extraction JSONB brute, pour audit)
```

- **Extraction** (`src/lib/extract.ts`, `schemas.ts`) : un fichier = Haiku détecte les types présents,
  puis un appel Opus par type présent, en parallèle, avec un schéma « tableau ». Stocké `type='dossier'`.
- **Analyse** (`src/lib/analyse.ts`) : partagée par le bouton Analyser et le webhook Tally, lancée en
  arrière-plan (statut `analyse_en_cours`, les pages pollent).
- **Synthèse** (`src/lib/synthese.ts`) : aplatit les documents en items, les regroupe par nom (A/B),
  profil salarié ou indépendant, 4+ contrôles de cohérence, complétude.
- **Scoring** (`src/lib/scoring.ts`) : 40 ratio, 30 stabilité, 15 ancienneté, 15 cohérence ; un critère
  éliminatoire plafonne à 40. **Recommandabilité** (`discretionnaire.ts`) : % séparé, depuis Tally.
- **Export** (`src/lib/exportBien.ts`) : PDF client-side, candidats cochés seulement.
- **Mail de relance** (`src/lib/mail.ts`) : Gmail SMTP BBI, 503 propre si non configuré.
- Détail produit, modèle de données, barème : `docs/contexte/produit-et-architecture.md`.

## 5. Infra

Railway, projet `charming-vibrancy`, services `retina` (auto-deploy de `main`) et `Postgres`. Pilotage
en GraphQL direct avec un token workspace que Vincent fournit à la demande (jamais stocké). Tout le
détail (IDs, variables, accès aux données de prod) : skill `railway`.

## 6. Conventions de travail avec Vincent (strictes)

- Vincent ne tape aucune commande ; il travaille depuis claude.ai/code.
- Français concis, décisions tranchées, seulement les questions bloquantes.
  Proposition validée avant de coder les gros morceaux.
- Branche de session, PR squash-merge vers `main` (jamais de push direct sur `main`), puis attendre le
  déploiement Railway en `SUCCESS` et vérifier la prod avant de rendre la main.
- Barème et critères : les valeurs par défaut se valident avec Shawna, pas en session.
- En fin de session : entrée de journal ; leçon durable dans la règle du
  chemin ; décision dans `docs/decisions.md`. Ce fichier ne grandit pas.
- Procédures : `/cadrer`, `/construire`, `/livrer`, `/journal`, `/staging`, `/installer`.

## 7. Carte de la mémoire

| Où | Quoi |
|---|---|
| `.claude/rules/extraction.md` | appels Claude, schémas, prompts, analyse (`extract.ts`, `schemas.ts`, `analyse.ts`) |
| `.claude/rules/scoring.md` | synthèse, cohérence, scoring, recommandabilité, types |
| `.claude/rules/export-pdf.md` | jsPDF, WinAnsi, `exportBien.ts` |
| `.claude/rules/ui.md` | pages, composants, `globals.css`, vérification visuelle |
| `.claude/rules/api.md` | routes API, webhook Tally, Apimo, mail |
| `.claude/rules/db.md` | schéma Postgres (`db.ts`) |
| skill `railway` | hébergement, variables, déploiement, données de prod |
| skill `tally` | formulaire de candidature, pièges du MCP Tally |
| `docs/contexte/` | produit et architecture, pièges et méthode de test, anciennes conventions |
| `docs/decisions.md` | arbitrages datés |
| `docs/feuille-de-route.md` | à faire, prochaine étape |
| `docs/journal/` | une entrée par session, jamais chargée |

## 8. Où on en est (22/09/2026)

- En prod depuis juillet : extraction dossier, indépendants, Apimo, Tally bilingue, suivi 4 états,
  export sélectif, salaire cash récurrent. Dernier lot : 22/07/2026.
- Workflow korr installé le 22/09/2026 (agents, procédures, portiques, CI, 13 tests ciblés).
- Ouvert : employeur dominant, salarié sans contrat, calibration sur d'autres vrais dossiers, relance
  mail à brancher (mot de passe d'application Google), auth quand BBI passe sur Workspace.
