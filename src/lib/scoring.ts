import type { Bien, CoherenceCheck, Criteres, Score, ScoreCritere, SynthesePersonne } from "./types";

/** Format monétaire « 1.250 € » (même rendu que le reste de l'outil). */
function eur(v: number): string {
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
}

/**
 * Étage 2 — scoring. Code pur, déterministe, zéro IA : même dossier ⇒ même
 * score, toujours, et chaque point est explicable.
 *
 * Barème (100 pts) :
 *   40  ratio revenus nets ménage / (loyer + charges) — palier : ≥ ratioMin = max
 *   30  stabilité des contrats (CDI hors essai > CDI en essai > CDD > intérim)
 *   15  ancienneté dans l'entreprise
 *   15  cohérence du dossier (contrôles croisés OK)
 *
 * Un critère éliminatoire (selon les critères du bien) plafonne le score à 40
 * et marque le dossier en rouge, quel que soit le reste.
 */

const CAP_ELIMINATOIRE = 40;

function essaiEnCours(p: SynthesePersonne, now: Date): boolean {
  const e = p.emploi;
  if (!e || e.periode_essai !== true) return false;
  if (!e.fin_periode_essai) return true; // essai prévu, fin inconnue => prudence
  const fin = new Date(e.fin_periode_essai);
  return isNaN(fin.getTime()) ? true : fin >= now;
}

function stabilitePersonne(p: SynthesePersonne, criteres: Criteres, now: Date): { pts: number; label: string } {
  const e = p.emploi;
  if (!e || !e.type_contrat) return { pts: 0, label: "contrat inconnu" };
  switch (e.type_contrat) {
    case "CDI":
      return essaiEnCours(p, now) ? { pts: 22, label: "CDI en période d'essai" } : { pts: 30, label: "CDI hors essai" };
    case "CDD":
      return criteres.cddAccepte ? { pts: 15, label: "CDD" } : { pts: 8, label: "CDD (non accepté sur ce bien)" };
    case "interim":
      return { pts: 8, label: "intérim" };
    case "independant":
      return { pts: 12, label: "indépendant" };
    default:
      return { pts: 10, label: "autre contrat" };
  }
}

function anciennetePts(mois: number | null): number {
  if (mois == null) return 0;
  if (mois >= 36) return 15;
  if (mois >= 24) return 13;
  if (mois >= 12) return 10;
  if (mois >= 6) return 6;
  return 3;
}

/**
 * Moyenne pondérée par le salaire. Uniquement quand TOUS les salaires sont
 * connus : sinon une personne sans bulletin (salaire inconnu) aurait un poids
 * nul et son contrat disparaîtrait du score — moyenne simple dans ce cas.
 */
function pondere(personnes: SynthesePersonne[], f: (p: SynthesePersonne) => number): number {
  const actifs = personnes.filter((p) => p.emploi);
  if (!actifs.length) return 0;
  const salaires = actifs.map((p) => p.emploi!.salaire_net_mensuel);
  if (salaires.some((s) => s == null || s <= 0)) {
    return actifs.reduce((a, p) => a + f(p), 0) / actifs.length;
  }
  const total = (salaires as number[]).reduce((a, b) => a + b, 0);
  return actifs.reduce((a, p, i) => a + f(p) * ((salaires[i] as number) / total), 0);
}

export function scoreCandidat(
  bien: Pick<Bien, "loyer" | "charges" | "criteres">,
  synthese: SynthesePersonne[],
  coherence: CoherenceCheck[],
  now = new Date()
): Score {
  const criteres = bien.criteres;
  const criteresOut: ScoreCritere[] = [];
  const cout = Number(bien.loyer) + Number(bien.charges);
  const actifs = synthese.filter((p) => p.emploi);

  // --- 1. Ratio revenus (40 pts) --------------------------------------------
  const revenus = actifs
    .map((p) => p.emploi!.salaire_net_mensuel)
    .filter((v): v is number => v != null)
    .reduce((a, b) => a + b, 0);
  const ratio = revenus > 0 && cout > 0 ? revenus / cout : null;
  let ratioPts = 0;
  let ratioElim = false;
  if (ratio != null) {
    ratioPts = ratio >= criteres.ratioMin ? 40 : Math.max(0, Math.round((ratio / criteres.ratioMin) * 40));
    ratioElim = criteres.ratioEliminatoire && ratio < criteres.ratioMin;
  }
  criteresOut.push({
    key: "ratio",
    label: "Ratio revenus/coût du logement",
    points: ratioPts,
    max: 40,
    detail:
      ratio != null
        ? `Les revenus nets du ménage (${eur(revenus)}) représentent ${ratio.toFixed(1)} fois le coût du logement (${eur(cout)} de loyer et charges). Le bien exige au minimum ${criteres.ratioMin} fois ce coût.`
        : "Revenus non déterminables : aucun salaire net n'a pu être extrait des bulletins.",
    eliminatoire: ratioElim,
  });

  // --- 2. Stabilité contrat (30 pts) ----------------------------------------
  const stabParts = actifs.map((p) => ({ p, s: stabilitePersonne(p, criteres, now) }));
  const stabPts = Math.round(pondere(actifs, (p) => stabilitePersonne(p, criteres, now).pts));
  const aucunCdi = actifs.length > 0 && !actifs.some((p) => p.emploi!.type_contrat === "CDI");
  const cdiElim = criteres.cdiRequis && aucunCdi;
  const tousEnEssai = actifs.length > 0 && actifs.every((p) => essaiEnCours(p, now));
  const essaiElim = criteres.essaiEliminatoire && tousEnEssai;
  criteresOut.push({
    key: "stabilite",
    label: "Stabilité des contrats",
    points: stabPts,
    max: 30,
    detail:
      (stabParts.length
        ? stabParts.map(({ p, s }) => `Personne ${p.personne} : ${s.label}`).join(". ") + "."
        : "Aucun contrat exploitable dans le dossier.") +
      (cdiElim ? " Ce bien exige au moins un CDI, or le dossier n'en comporte aucun." : "") +
      (essaiElim ? " Tout le ménage est en période d'essai, ce qui est éliminatoire sur ce bien." : ""),
    eliminatoire: cdiElim || essaiElim,
  });

  // --- 3. Ancienneté (15 pts) ------------------------------------------------
  let anciennetePoints = Math.round(pondere(actifs, (p) => anciennetePts(p.emploi!.ancienneteMois)));
  const maxAnc = Math.max(0, ...actifs.map((p) => p.emploi!.ancienneteMois ?? 0));
  const sousMin = criteres.ancienneteMinMois > 0 && maxAnc < criteres.ancienneteMinMois;
  if (sousMin) anciennetePoints = 0;
  criteresOut.push({
    key: "anciennete",
    label: "Ancienneté dans l'entreprise",
    points: anciennetePoints,
    max: 15,
    detail:
      (actifs.length
        ? actifs
            .map(
              (p) =>
                `Personne ${p.personne} : ${p.emploi!.ancienneteMois != null ? `${p.emploi!.ancienneteMois} mois d'ancienneté` : "ancienneté inconnue"}`
            )
            .join(". ") + "."
        : "Ancienneté non déterminable.") +
      (sousMin ? ` L'ancienneté reste sous le minimum exigé sur ce bien (${criteres.ancienneteMinMois} mois).` : ""),
    eliminatoire: false,
  });

  // --- 4. Cohérence du dossier (15 pts) --------------------------------------
  // Une incohérence validée à la main par l'agent (ignored) ne pénalise plus.
  const ko = coherence.filter((c) => !c.ok && !c.ignored);
  const valides = coherence.filter((c) => !c.ok && c.ignored).length;
  const cohPts = Math.max(0, 15 - ko.length * 5);
  criteresOut.push({
    key: "coherence",
    label: "Cohérence du dossier",
    points: cohPts,
    max: 15,
    detail: coherence.length
      ? ko.length
        ? `${ko.length} incohérence${ko.length > 1 ? "s" : ""} détectée${ko.length > 1 ? "s" : ""} dans le dossier ; chacune retire 5 points.${valides ? ` (${valides} autre${valides > 1 ? "s" : ""} incohérence${valides > 1 ? "s" : ""} validée${valides > 1 ? "s" : ""} à la main, sans effet sur la note.)` : ""}`
        : `Les ${coherence.length} contrôles croisés sont cohérents (noms, employeurs, salaires et dates concordent).${valides ? ` ${valides} incohérence${valides > 1 ? "s" : ""} a été validée à la main.` : ""}`
      : "Le dossier ne contient pas assez de documents pour croiser les informations.",
    eliminatoire: false,
  });

  const eliminatoire = criteresOut.some((c) => c.eliminatoire);
  let total = criteresOut.reduce((a, c) => a + c.points, 0);
  if (eliminatoire) total = Math.min(total, CAP_ELIMINATOIRE);

  return {
    total,
    max: 100,
    criteres: criteresOut,
    eliminatoire,
    revenusMenage: revenus > 0 ? Math.round(revenus) : null,
    ratio: ratio != null ? Math.round(ratio * 100) / 100 : null,
  };
}
