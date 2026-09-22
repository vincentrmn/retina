# Sessions du 17/07/2026 : lot UI, recommandabilité, relance mail, Tally bilingue bloqué

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 577 à 658) le 22/09/2026. -->

### Retours Vincent (17/07/2026) — lot UI + 2 features (recommandabilité, relance mail)

Livré et déployé. **UI** : marque RETINA en Poppins ExtraBold (auto-hébergée, `public/fonts/`),
réglée à 48px après retour « trop gros » ; header de la page bien restructuré (`topbar--split` : marque
+ boutons sur une ligne, **titre du bien sur sa propre ligne** en dessous, `.page-title-lg`) ; bouton
export raccourci « Exporter » + icône PDF (hauteur identique aux autres, 38px) ; icône de synchro
(tournante) sur « Synchroniser Apimo » ; cartes de la liste des biens réduites à **loyer + charges**
(ratio retiré) ; **tag Apimo remplacé par le logo officiel** (`public/apimo-logo.svg`, wordmark teal
`#223d46` assemblé depuis les vecteurs de marque `logo-a` + `logo-pimo` d'apimo.com, alignement calé
visuellement) ; bouton « Traité » à gabarit ENTIÈREMENT figé (le décalage venait de l'alignement sur
la ligne de base du texte : hauteur de ligne variable selon le check → bouton sorti du flux, flex,
cases fixes) ; bascule optimiste (pas de rechargement).

- **Bulletins « les 3 derniers »** (pas « récents ») : cohérence + complétude reformulées, la cohérence
  exige désormais 3 bulletins consécutifs ET récents.
- **Feature RECOMMANDABILITÉ (score discrétionnaire, séparé du /100)** : `src/lib/discretionnaire.ts`
  compare les **préférences du bailleur** (nouveaux critères du bien : composition seul/couple, sans
  animaux, longue durée — dans `Criteres`, `normalizeCriteres`, `BienForm` section « Préférences
  discrétionnaires ») aux **réponses déclarées dans Tally** (`candidats.tally_answers`). `% = part des
  préférences satisfaites`, `null` si aucune préférence active OU candidat sans questionnaire (encodé à
  la main). Affiché : pastille `♥ %` sur la liste des candidats (`discr_pct` dans `GET biens/[id]`),
  carte « Recommandabilité » détaillée sur la fiche candidat (`discretionnaire` dans `GET candidats/[id]`),
  préférences listées sur la carte critères du bien. Testé : 100 % (3/3), 67 % (2/3), 33 % (1/3), null.
- **Feature RELANCE MAIL** (`src/lib/mail.ts` + `POST /api/candidats/[id]/relance`) : bouton « Relancer
  par mail pour compléter le dossier » sous la carte complétude (visible seulement si dossier incomplet
  ET email présent). Liste les documents manquants (`buildCompletude`, items ≠ ok) et envoie un mail au
  candidat via **Gmail SMTP BBI** (nodemailer, env `BBI_GMAIL_USER` / `BBI_GMAIL_APP_PASSWORD` /
  `BBI_MAIL_FROM_NAME`). **Gated** : 503 propre si non configuré (comme la clé Anthropic). ⚠️ **À
  brancher** : il faut un **mot de passe d'application Google** sur un compte BBI (2FA requise), posé
  sur Railway, puis un test réel — non testé bout-en-bout faute d'identifiants.
- **Tally** : texte d'accueil enrichi d'une prévention « À préparer dès maintenant » (pièce d'identité,
  3 dernières fiches de salaire, contrat / ou docs indépendant), pour que les candidats aient les
  fichiers prêts avant la page upload.
- **Formulaire Tally bilingue (choix de langue au début)** : décision prise + tentative de build +
  blocage tooling découvert, détaillés dans la section « Formulaire Tally bilingue » juste ci-dessous.

### Formulaire Tally bilingue FR/EN (17/07/2026) — décision, build tenté, BLOQUÉ par un bug tooling

**Décision Vincent** : **Option 1** — UN seul formulaire (`ob1NPX`), choix de langue au tout début,
chaque bloc dupliqué FR/EN, un seul lien, un seul webhook. (Écarté : 2 formulaires séparés.) Vincent
a validé « le formulaire est stable, on maintiendra les 2 langues ». Design retenu :

- **Sélecteur de langue** en tête de page 1 (« Dans quelle langue... / In which language... » →
  `Français` / `English`), avant l'intro.
- **Deux blocs partagés (intro page 1, page de remerciement) gérés par visibilité conditionnelle**
  selon la langue (JAMAIS les deux langues empilées — Vincent a explicitement refusé l'empilement :
  une 1ʳᵉ tentative qui fusionnait FR+EN dans un même bloc d'intro a été rejetée).
- **Pages EN jumelles** (consentement, identité, situation, projet, à propos, documents) placées
  après les pages FR ; **saut de page par langue** : page 1 → si English, `JUMP TO` la 1ʳᵉ page EN ;
  page documents FR → `JUMP TO` la page de remerciement (repositionnée en toute fin) pour sauter les
  pages EN. Les pages EN répliquent EXACTEMENT la structure FR (champs secondaires cachés + 17 règles
  de révélation `co-titulaire = Oui`), pattern éprouvé du FR.

**⚠️ BLOCAGE MAJEUR — bug déterministe de `create_blocks` (MCP Tally)** : lors de la création de
plusieurs **champs de saisie « nus »** (sans TITLE, label en placeholder — le style imposé par Vincent
« nom du champ DANS le champ ») dans un même appel, l'API **abandonne silencieusement** certains blocs.
Reproduit 3 fois (insertion au milieu ET append en fin) : la page identité perdait **12 blocs sur 26**
à chaque fois — systématiquement les `INPUT_DATE`, `INPUT_EMAIL`, `INPUT_PHONE_NUMBER`, les options
`MULTIPLE_CHOICE_OPTION` (Oui/Non) et les 2 premiers `INPUT_TEXT` après un heading (Nom/Prénom) ;
survivaient Rue/Ville/Code postal/Pays. Les pages faites d'un TITLE + options (situation, projet,
documents) se créaient parfaitement. **Diagnostic confirmé** : un `INPUT_EMAIL` nu créé SEUL passe
sans problème → le bug ne touche que les **lots** de champs nus. **Contournement = créer ces champs
UN PAR UN** (fastidieux : ~10 appels rien que pour l'identité, chacun renvoyant tout le ledger ~15k
tokens).

**État à la fin de la session** : build **NON terminé et NON sauvegardé**. Le formulaire de prod
`ob1NPX` est **INTACT** (seul `save_form` persiste, jamais appelé — tout le brouillon bilingue vivait
dans le working draft en mémoire, abandonné). La version FR live reste celle validée par Shawna.

**Pour finir proprement (prochaine session)** — deux voies :
1. **Dupliquer les pages FR dans l'UI Tally** (fonction « duplicate page » de l'app, qui clone les
   champs de façon fiable, ce que l'API ne sait pas faire), puis traduire les libellés en EN. Le plus
   sûr, mais manuel.
2. **Reprendre le build API un champ à la fois** (contournement prouvé ci-dessus), avec un budget de
   contexte dédié, puis câbler : sauts de langue + visibilité intro/remerciement + révélations EN +
   `configure_blocks` file upload (multiple, 20 fichiers, 10 Mo, types PDF/JPEG/PNG/WebP/HEIC) +
   `reposition_pages` (identité en slot 9, remerciement en dernier).
- **Dans les deux cas**, étendre ensuite le **webhook** (`src/app/api/webhooks/tally/route.ts` :
  `nomDossier`/`valeurLisible`/`reponses` matchent des libellés FR par regex → ajouter les libellés EN
  « Last name »/« First name », options Yes/No, etc.) ET **`src/lib/discretionnaire.ts`** (matchers
  composition/animaux/durée à étendre aux libellés + valeurs EN). Sans ça, une candidature en anglais
  serait mal nommée / mal scorée en recommandabilité.
