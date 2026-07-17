import type { Criteres } from "./types";

/**
 * Score DISCRÉTIONNAIRE : une note de « recommandabilité » (%) séparée du score
 * financier /100. Elle compare les préférences du bailleur (critères
 * discrétionnaires du bien) aux réponses DÉCLARÉES par le candidat dans le
 * formulaire Tally (`tally_answers`). Purement indicatif : le bailleur choisit
 * ce qu'il valorise (personne seule ou couple, sans animaux, longue durée), et
 * plus le candidat correspond, plus le % est élevé.
 *
 * Zéro IA, déterministe. Renvoie null s'il n'y a aucun critère discrétionnaire
 * actif ou aucune réponse Tally exploitable (candidat encodé à la main).
 */

export type TallyAnswer = { label: string; value: string };

export type DiscretionnaireDetail = {
  label: string;
  attendu: string;
  declare: string | null;
  ok: boolean;
};

export type ScoreDiscretionnaire = {
  pct: number;
  details: DiscretionnaireDetail[];
};

function trouve(answers: TallyAnswer[], motif: RegExp): string | null {
  const a = answers.find((x) => motif.test(x.label));
  return a ? a.value.trim() : null;
}

export function scoreDiscretionnaire(
  criteres: Criteres,
  answers: TallyAnswer[] | null | undefined
): ScoreDiscretionnaire | null {
  const rep = Array.isArray(answers) ? answers : [];
  const details: DiscretionnaireDetail[] = [];

  // Composition du ménage : « second co-titulaire ? » Oui => couple, Non => seul.
  if (criteres.discrCompositionActif) {
    const second = trouve(rep, /second.*co-?titulaire|deuxi[eè]me (candidat|personne)/i);
    const declare = second == null ? null : /^oui/i.test(second) ? "couple" : "seul";
    const attendu = criteres.discrComposition;
    details.push({
      label: attendu === "seul" ? "Personne seule" : "Couple",
      attendu: attendu === "seul" ? "une personne seule" : "un couple",
      declare: declare === "couple" ? "couple / colocation" : declare === "seul" ? "personne seule" : null,
      ok: declare != null && declare === attendu,
    });
  }

  // Animaux de compagnie : « Avez-vous des animaux ? » Non => pas d'animaux.
  if (criteres.discrSansAnimaux) {
    const anim = trouve(rep, /animaux/i);
    const declare = anim == null ? null : /^non/i.test(anim) ? "aucun" : "au moins un";
    details.push({
      label: "Sans animaux",
      attendu: "pas d'animaux",
      declare,
      ok: declare === "aucun",
    });
  }

  // Durée envisagée : longue durée = 2 ans et plus.
  if (criteres.discrLongTerme) {
    const duree = trouve(rep, /dur[ée]e.*location|dur[ée]e envisag/i);
    const longue = duree != null && /(2 et 5|plus de 5|long terme)/i.test(duree);
    details.push({
      label: "Location longue durée",
      attendu: "2 ans et plus",
      declare: duree,
      ok: longue,
    });
  }

  if (!details.length) return null; // aucun critère discrétionnaire actif
  // Aucune réponse exploitable (candidat manuel sans questionnaire) : pas de note.
  if (details.every((d) => d.declare == null)) return null;

  const oks = details.filter((d) => d.ok).length;
  return { pct: Math.round((oks / details.length) * 100), details };
}
