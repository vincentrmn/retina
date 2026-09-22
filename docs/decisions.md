# Décisions tranchées

Une ligne par arbitrage, daté, avec la raison en quelques mots. Le récit est
dans `docs/journal/`. On n'y revient pas sans une raison nouvelle.

- **03/07** Stack et design repris de VESPER (Next.js 14, `globals.css` copié tel quel) : RETINA doit être identique à SCOUT/VESPER.
- **03/07** L'IA lit, le code juge : extraction en structured outputs, score en code pur : même dossier, même score, chaque point explicable.
- **03/07** Documents stockés en BYTEA dans Postgres : le système de fichiers Railway est éphémère.
- **03/07** Détection des types (petit modèle) puis extraction par type, jamais un schéma unique : limite API des 16 paramètres à union.
- **03/07** Un scan peut contenir plusieurs documents et plusieurs personnes ; les personnes A/B se séparent par le nom : cas réel de Shawna.
- **03/07** Indépendant : revenu retenu à 80 %, stabilité selon 2 ans d'activité, revenu = moyenne 2 ans : valeurs par défaut, à valider avec Shawna.
- **16/07** Un seul formulaire Tally pour tous les biens, rattaché par champs cachés : zéro dérive, un seul webhook.
- **16/07** Pas d'authentification avant le passage de BBI sur Google Workspace ; lien Tally direct, domaine RETINA jamais montré aux candidats.
- **16/07** Montants jamais convertis entre devises ; un document hors euros est écarté et signalé : déterminisme.
- **17/07** Recommandabilité = % séparé du score /100, depuis les réponses Tally : préférence du bailleur, pas éligibilité.
- **17/07** Formulaire bilingue = un seul formulaire, choix de langue en tête, pages jumelles, jamais deux langues empilées : demande de Vincent.
- **22/07** Salaire d'un salarié = cash récurrent (net à payer hors bonus, avance, avantages en nature) : cas Lourenco surestimé de 50 %.
- **22/09** Workflow korr installé : PR vers `main` au lieu du push direct, `npm run check` avant commit, CLAUDE.md sous 200 lignes.
- **22/09** `package-lock.json` reste non suivi (choix du projet, généré au build) : la CI fait `npm install`, pas `npm ci`.
