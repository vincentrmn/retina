---
paths:
  - "src/app/api/**"
  - "src/lib/apimo.ts"
  - "src/lib/mail.ts"
---

# Routes API, Tally, Apimo, mail : règles et pièges vérifiés

Référence : skills `tally` et `railway`. Récit : `docs/journal/2026-07-16-apimo-tally.md`.

## Règles absolues
- `export const dynamic = "force-dynamic"` sur toute route GET qui touche la base (sinon le build
  prérend sans base) ; try-catch et JSON d'erreur partout.
- Upload : 15 Mo max, PDF/JPEG/PNG/WebP. DELETE d'un candidat = CASCADE sur ses documents (RGPD).
- Analyse : `POST /api/candidats/[id]/analyze` répond tout de suite, pose `analyse_en_cours` (garde
  anti-double-lancement), analyse détachée (`analyseCandidat()` de `src/lib/analyse.ts`) ;
  `{force:true}` ré-extrait tout.
- **Webhook Tally** (`/api/webhooks/tally`) : signature HMAC-SHA256 base64 vérifiée
  (`TALLY_SIGNING_SECRET`, en-tête `tally-signature`), tout refusé sans secret ; idempotence par
  `tally_submission_id` ; réponse sous 10 s (analyse en fond) ; un bien inconnu répond 200.
- Le webhook apparie les noms FR **et** EN (`nom|last name`, `prénom|first name`) et prend le 1ᵉʳ
  email/téléphone **non vide** (les champs de la langue non choisie arrivent vides).
- **Apimo** : biens en location seulement (`category=2`, `status=1`) ; loyer = `price.value`,
  charges = `price.fees` ; dédoublonnage par `apimo_id`. La synchro ne met à jour les charges **que si
  Apimo en fournit** (jamais d'écrasement par un zéro), conserve critères et adresse, ne supprime
  jamais un bien, recalcule les scores si le coût change.
- **Mail de relance** : 503 propre tant que `BBI_GMAIL_*` n'est pas configuré.
- Lien de candidature = URL Tally directe (`tally.so/r/<form>?bien=&adresse=`) : pas de route qui
  expose le domaine RETINA aux candidats.

## Pièges vérifiés
- `price.fees` est souvent vide côté Apimo alors que le bien a des charges (APP025 : 0 contre 225 €).
- L'API Apimo n'expose pas l'adresse postale (`address` null) et seulement les biens où le partenaire
  « Brouwers AI » est activé à la main sur la fiche. Quota 1 000 appels.
- Tally rejoue les webhooks en échec : sans l'index unique sur `tally_submission_id`, doublons.
- `PATCH /api/biens/[id]` `{apimoId}` rattache un bien encodé à la main à sa fiche Apimo.
