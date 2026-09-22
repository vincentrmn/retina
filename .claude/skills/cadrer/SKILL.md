---
name: cadrer
description: Cadrer une fonctionnalité avant de la coder. Usage : /cadrer <sujet>. Relit les décisions et le journal, interviewe Vincent, délègue l'exploration à l'architecte, écrit docs/plans/<slug>.md avec des critères vérifiables, le soumet à Vincent, l'amène sur main par une petite PR. Rien n'est codé.
argument-hint: <sujet en quelques mots>
disable-model-invocation: true
---

# /cadrer : réfléchir avant de construire

Sujet : $ARGUMENTS

Cette session ne code rien. Elle produit un plan d'une page dans
`docs/plans/<slug>.md`, validé par Vincent, que `/construire` exécutera dans
une session neuve. C'est le moment où la connaissance du métier de Vincent
compte le plus : on lui pose de vraies questions.

## Procédure

1. **Lire ce qui existe.** `docs/decisions.md` en entier,
   `docs/feuille-de-route.md`, les entrées de `docs/journal/` qui parlent
   du sujet (`grep -ril` sur deux ou trois mots clés), et un premier coup
   d'oeil au code concerné pour poser des questions précises. Si une
   décision datée contredit le sujet, le dire à Vincent avant tout.
2. **Interviewer Vincent** avec l'outil de questions, en une ou deux
   salves, quatre questions au plus par salve, chacune avec des options
   concrètes tirées du code. Toujours couvrir : les cas limites (que se
   passe-t-il quand la donnée manque, quand l'API échoue, pour un client
   sans droit) ; ce qui est hors périmètre ; comment on saura que c'est fini
   (ce qu'il regardera, sur quelle page, avec quel compte) ; ce qui est
   prioritaire si tout ne tient pas dans une session. Ne pas demander ce
   que le code ou les décisions disent déjà.
3. **Déléguer à l'architecte** (sous-agent `architecte`, contexte vierge,
   lecture seule) : lui donner le sujet, les réponses de Vincent, les
   décisions applicables. Il rend un projet de plan structuré comme le
   gabarit `docs/plans/.gabarit.md`.
4. **Écrire `docs/plans/<slug>.md`** à partir du gabarit et du projet de
   l'architecte : contexte, décision, périmètre, hors périmètre, critères
   vérifiables (chacun avec sa commande, sa réponse HTTP ou sa capture, et
   une colonne « État » à « échec »), lots d'une session, vérification de
   bout en bout par Vincent, questions ouvertes. Une page. Un critère sans
   preuve possible est reformulé ou retiré.
5. **Soumettre le plan à Vincent** dans la conversation, en le résumant en
   cinq lignes et en pointant les questions ouvertes. Corriger le fichier à
   chaque retour. S'arrêter quand il dit que le plan lui convient.
6. **L'amener sur `main`** : sous-agent `documentaliste` pour la ligne de
   `docs/decisions.md` si un arbitrage a été pris et une courte entrée de
   journal ; commit sur la branche de session (« Plan : <titre> ») ; PR ;
   merge dès que la CI est verte (une PR de plan ne contient que des
   fichiers Markdown). Dire à Vincent la phrase à taper dans une session
   neuve : `/construire docs/plans/<slug>.md`.

## Ce qu'on ne fait pas

- Coder, même « juste pour voir ». Un banc d'essai jetable dans le bac à
  sable est admis s'il sert à répondre à une question du plan et n'est pas
  commité.
- Écrire un plan de plus d'une page, ou un critère qu'aucune commande ni
  capture ne peut prouver.
- Décider à la place de Vincent sur une question de métier : la poser.
