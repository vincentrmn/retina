import type { BulletinPaie, Champ, DocumentMeta, ExtractionDossier, SynthesePersonne } from "../src/lib/types";

/** Champ lisible, confiance haute. */
export const c = <T>(value: T | null): Champ<T> => ({ value, confiance: "haute" });

export function bulletin(periode: string, montants: Partial<Record<"net" | "aPayer" | "brut" | "avantage" | "nonRecur", number>>, devise = "EUR"): BulletinPaie {
  return {
    nom_complet: c("DUPONT Marie"),
    employeur: c("CHU de Liège"),
    periode: c(periode),
    salaire_net_mensuel: c(montants.net ?? null),
    net_a_payer: montants.aPayer != null ? c(montants.aPayer) : undefined,
    salaire_brut_mensuel: c(montants.brut ?? null),
    avantage_en_nature: montants.avantage != null ? c(montants.avantage) : undefined,
    elements_non_recurrents: montants.nonRecur != null ? c(montants.nonRecur) : undefined,
    devise: c(devise),
    intitule_poste: c("Infirmière"),
    date_entree: c("2021-03-01"),
  };
}

/** Un fichier « dossier » (scan tout-en-un) ne contenant que des bulletins. */
export function dossier(fiches: BulletinPaie[]): DocumentMeta {
  const extraction: ExtractionDossier = {
    fiches_de_paie: fiches,
    contrats: [],
    pieces_identite: [],
    avis_imposition: [],
    bilans: [],
    kbis: [],
  };
  return {
    id: 1,
    candidat_id: 1,
    personne: "?",
    type: "dossier",
    filename: "dossier.pdf",
    mime: "application/pdf",
    size_bytes: 1,
    extraction,
    extraction_status: "done",
    extraction_error: null,
    uploaded_at: "2026-09-01T00:00:00Z",
  };
}

/** Personne salariée de synthèse, prête pour le scoring. */
export function salarie(
  personne: "A" | "B",
  salaire: number,
  type_contrat: NonNullable<SynthesePersonne["emploi"]>["type_contrat"] = "CDI",
  ancienneteMois = 48
): SynthesePersonne {
  return {
    personne,
    identite: null,
    emploi: {
      salaire_net_mensuel: salaire,
      nbBulletins: 3,
      intitule_poste: null,
      type_contrat,
      periode_essai: false,
      fin_periode_essai: null,
      date_entree: null,
      ancienneteMois,
      employeur: null,
      independant: null,
      aVerifier: [],
    },
  };
}
