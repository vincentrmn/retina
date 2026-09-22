# Feuille de route

<!-- Le « Reste à faire » est déplacé verbatim de l'ancien CLAUDE.md (lignes 748 à 764) le 22/09/2026. -->

**Reste à faire / SPRINT 2 (ouvert par Vincent le 03/07/2026)** :
1. **Employeur dominant** (constat dossier LANG-STREE) : afficher l'employeur le plus fréquent des
   bulletins (et signaler « plusieurs employeurs ») au lieu du premier trouvé. Cosmétique, sûr.
2. **Salarié sans contrat de travail** : ne plus mettre 0 de stabilité quand `type_contrat=null` mais
   qu'il y a des fiches de paie récurrentes → stabilité « salarié, contrat non fourni » (~15/30) + note
   « contrat manquant ». À valider avec Shawna (barème).
3. **Calibration élargie** de l'extraction dossier + profil indépendant sur d'autres vrais dossiers du
   Drive (avis d'imposition / bilan / KBIS) ; valider le barème indépendant (décote 20 %, ancienneté
   2 ans, revenu = moyenne 2 ans) et le barème général avec Shawna.
4. Éventuel plafonnement de la résolution des scans (levier coût, si le volume grimpe).
5. **(16/07)** Synchronisation des candidats vers **Pipedrive** (email/téléphone déjà en base) ;
   **envoi automatique du lien Tally** aux candidats entrants (via Make, comme le parcours achat) ;
   **authentification RETINA** quand BBI passe sur Google Workspace ; **cron de synchro Apimo**
   (aujourd'hui bouton manuel) ; conversion HEIC si des candidats en envoient beaucoup.
6. ~~**(17/07)** Terminer le formulaire Tally bilingue~~ → **FAIT le 20/07** (voie 2, un champ à la
   fois), publié sur `ob1NPX`, webhook + `discretionnaire.ts` étendus à l'anglais. Cf. section
   « Formulaire Tally bilingue FR/EN (20/07/2026) — LIVRÉ + PUBLIÉ ».

## Ajouté à l'installation du workflow korr (22/09/2026)

- **Ce qui revient à Vincent** : protéger `main` sur GitHub (Settings, Branches, « Require status checks
  to pass », check `check`) ; créer un environnement staging Railway si on veut tester avant merge ;
  la routine de surveillance (`docs/guide.md` de korr-workflow, § 7).
- `scripts/e2e.sh` (Postgres local, parcours au navigateur 1440 et 390 px) et `npm run migration-lab`
  (`ensureSchema()` sur base vide, base migrée, états méchants) : pas encore écrits pour RETINA.
