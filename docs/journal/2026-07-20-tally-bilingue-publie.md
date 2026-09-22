# Session du 20/07/2026 : formulaire Tally bilingue publié

<!-- Déplacé verbatim de l'ancien CLAUDE.md (lignes 660 à 696) le 22/09/2026. -->

### Formulaire Tally bilingue FR/EN (20/07/2026) — LIVRÉ + PUBLIÉ (voie 2, API un champ à la fois)

Le formulaire bilingue est **terminé, vérifié au ledger et publié** sur `ob1NPX`
(`https://tally.so/r/ob1NPX`, 274 blocs, 14 pages). Le parcours FR est identique à avant, seule
l'étape « choix de langue » s'ajoute en tête. Webhook + `discretionnaire.ts` étendus à l'anglais
(commit sur la branche de session).

- **Structure** : page 1 = intro + **sélecteur de langue** (Français / English, requis) ; pages 2‑7
  FR (consentement, identité, situation, projet, à propos, documents) ; pages 8‑13 EN (mêmes 6 pages
  jumelles) ; page 14 = remerciement partagé. Les pages EN répliquent exactement le FR (champs du
  2ᵉ co‑titulaire cachés + 16 règles de révélation, animaux → « précisez », upload multiple configuré).
- **Visibilité conditionnelle (jamais 2 langues empilées)** : intro FR et intro EN toutes deux
  `isHidden` par défaut + règle `SHOW` selon la langue ; idem pour les 2 blocs de remerciement (FR+EN)
  qui cohabitent sur la page 14 mais ne s'affichent qu'un à la fois.
- **Routage par sauts de page (LE piège)** : un `JUMP TO PAGE` créé via `apply_logic` **s'ancre sur la
  page de la question de la condition**, PAS sur une page choisie. Donc :
  - « langue IS English → JUMP page 8 » est sur la page 1 (la question langue y est) → OK, saute les
    pages FR.
  - « langue IS Français → JUMP page 14 » se serait AUSSI ancré page 1 → le candidat FR sautait tout le
    formulaire dès la page 1. ❌ À la place, le saut FR est conditionné sur une question de la **page 7**
    (le champ upload FR `c72214ff` **IS NOT EMPTY**, toujours vrai car requis) → il s'ancre page 7 et
    saute les pages EN après les documents FR. Les candidats EN ne voient jamais la page 7 (ils ont
    sauté en page 8), donc ce saut ne les touche pas.
- **Méthode qui a marché** : création des blocs déléguée à un **sous‑agent** (isole les ~15‑25k tokens
  de ledger renvoyés à chaque `create_blocks`), champs de saisie nus créés **un par un** (le bug de lot
  n'a jamais frappé), puis reposition + `configure_blocks` (visibilité/optional/upload) + `apply_logic`
  faits par l'agent principal en extrayant les uuids du ledger (`jq` sur le fichier de résultat).
- ⚠️ **PIÈGE MAJEUR — le working draft Tally est en mémoire de session et se perd sur reconnexion MCP.**
  Une première version complète a été **perdue** parce qu'on a attendu (question à Vincent) avant de
  sauver, et le serveur MCP s'est reconnecté entre‑temps → `list_blocks` a renvoyé `{}` et `save_form`
  « does not have any blocks ». La prod `ob1NPX` n'a jamais été touchée (rien de sauvé), mais tout le
  build a dû être refait. **Leçon : dès que la structure est complète et vérifiée au ledger, appeler
  `save_form` immédiatement** — ne pas laisser un brouillon non sauvé traverser une pause.
- **Webhook** (`nomDossier`) apparie aussi `^(nom|last name)$` / `^(pr[ée]nom|first name)$`, et prend
  le **1ᵉʳ email/téléphone NON vide** (les champs de la langue non choisie arrivent vides et pouvaient
  masquer les vrais). `discretionnaire.ts` : matchers composition (`second co-tenant`, `Yes/No`),
  animaux (`pets`, `No`), durée (`expected rental duration`, `2 and 5` / `more than 5` / `long term`).
