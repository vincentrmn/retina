/**
 * Types RETINA — analyse de candidats à la location.
 * Principe cardinal : l'IA lit (extraction), le code juge (scoring).
 */

// ---------------------------------------------------------------------------
// Bien & critères d'éligibilité (paramétrables par bien)
// ---------------------------------------------------------------------------

/**
 * Chaque critère d'éligibilité a un interrupteur « actif » (le critère est-il
 * pris en compte ?) et, quand c'est pertinent, un caractère « éliminatoire »
 * (son non-respect plafonne-t-il le score ?).
 */
export type Criteres = {
  /** Le critère revenus/coût est-il appliqué ? (sinon aucune exigence de revenus) */
  ratioActif: boolean;
  /** Revenus nets du ménage ≥ ratioMin × (loyer + charges). Défaut 3. */
  ratioMin: number;
  /** Le ratio insuffisant est-il éliminatoire (plafonne le score) ? */
  ratioEliminatoire: boolean;
  /** Le critère « au moins un CDI » est-il appliqué ? */
  cdiActif: boolean;
  /** L'absence de CDI est-elle éliminatoire ? */
  cdiEliminatoire: boolean;
  /** Les CDD sont-ils acceptés comme revenu stable ? (sinon pénalisant) */
  cddAccepte: boolean;
  /** Le critère période d'essai est-il appliqué ? */
  essaiActif: boolean;
  /** La période d'essai en cours est-elle éliminatoire ? (sinon pénalisante) */
  essaiEliminatoire: boolean;
  /** Le critère d'ancienneté minimale est-il appliqué ? */
  ancienneteActif: boolean;
  /** Ancienneté minimale dans l'entreprise, en mois. */
  ancienneteMinMois: number;

  // --- Critères DISCRÉTIONNAIRES (préférences du bailleur, comparées aux
  // réponses déclarées dans le formulaire Tally). Ils ne touchent PAS le score
  // financier /100 : ils produisent une note séparée de « recommandabilité »
  // en %. Chaque critère actif compte pour une part égale de ce %.
  /** Prendre en compte la composition du ménage. */
  discrCompositionActif: boolean;
  /** Composition préférée : personne seule ou couple. */
  discrComposition: "seul" | "couple";
  /** Préférer un candidat sans animaux de compagnie. */
  discrSansAnimaux: boolean;
  /** Préférer une location de longue durée. */
  discrLongTerme: boolean;
};

export const DEFAULT_CRITERES: Criteres = {
  ratioActif: true,
  ratioMin: 3,
  ratioEliminatoire: false,
  cdiActif: false,
  cdiEliminatoire: false,
  cddAccepte: true,
  essaiActif: false,
  essaiEliminatoire: false,
  ancienneteActif: false,
  ancienneteMinMois: 0,
  discrCompositionActif: false,
  discrComposition: "couple",
  discrSansAnimaux: false,
  discrLongTerme: false,
};

/**
 * Normalise des critères venus de la base (compatibilité ascendante : les biens
 * créés avant l'ajout des interrupteurs « actif » n'ont que les anciens champs
 * `cdiRequis` / `essaiEliminatoire` / `ancienneteMinMois`).
 */
export function normalizeCriteres(c: any): Criteres {
  const cdiRequisOld = c?.cdiRequis; // ancien champ = actif + éliminatoire
  const anc = Number(c?.ancienneteMinMois ?? 0) || 0;
  return {
    ratioActif: c?.ratioActif ?? true,
    ratioMin: Number(c?.ratioMin ?? 3) || 3,
    ratioEliminatoire: !!c?.ratioEliminatoire,
    cdiActif: c?.cdiActif ?? cdiRequisOld ?? false,
    cdiEliminatoire: c?.cdiEliminatoire ?? cdiRequisOld ?? false,
    cddAccepte: c?.cddAccepte ?? true,
    essaiActif: c?.essaiActif ?? c?.essaiEliminatoire ?? false,
    essaiEliminatoire: !!c?.essaiEliminatoire,
    ancienneteActif: c?.ancienneteActif ?? anc > 0,
    ancienneteMinMois: anc,
    discrCompositionActif: !!c?.discrCompositionActif,
    discrComposition: c?.discrComposition === "seul" ? "seul" : "couple",
    discrSansAnimaux: !!c?.discrSansAnimaux,
    discrLongTerme: !!c?.discrLongTerme,
  };
}

export type Bien = {
  id: number;
  adresse: string;
  loyer: number;
  charges: number;
  criteres: Criteres;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Documents & extraction (JSON retourné par le modèle, champ par champ)
// ---------------------------------------------------------------------------

export type DocType = "fiche_paie" | "contrat" | "piece_identite";
/**
 * Types de documents reconnus dans un fichier « dossier ». En plus des trois
 * documents du salarié, on gère l'indépendant : avis d'imposition, bilan /
 * comptes de résultat, extrait KBIS (immatriculation de l'entreprise).
 */
export type DossierType = DocType | "avis_imposition" | "bilan" | "kbis";
export const DOSSIER_TYPES: DossierType[] = [
  "fiche_paie",
  "contrat",
  "piece_identite",
  "avis_imposition",
  "bilan",
  "kbis",
];
/**
 * Type stocké en base : `auto` avant extraction, `autre` si non reconnu,
 * `dossier` = un seul fichier contenant plusieurs documents (paie + contrat +
 * pièce d'identité + docs indépendant, éventuellement pour plusieurs personnes).
 */
export type DocTypeStocke = DocType | "auto" | "autre" | "dossier";
export type Personne = "A" | "B";
/** Personne stockée en base : `?` tant que le doc n'est pas rattaché. */
export type PersonneDoc = Personne | "?";

export type Confiance = "haute" | "moyenne" | "basse";

/** Un champ extrait : valeur + confiance. `null` = absent/illisible. */
export type Champ<T = string> = {
  value: T | null;
  confiance: Confiance;
};

/** Un bulletin individuel — un PDF scanné contient souvent plusieurs mois. */
export type BulletinPaie = {
  nom_complet: Champ;
  employeur: Champ;
  /** Période du bulletin, format YYYY-MM. */
  periode: Champ;
  salaire_net_mensuel: Champ<number>;
  salaire_brut_mensuel: Champ<number>;
  /** Code ISO de la devise des montants (EUR, MUR...). Absent sur les anciennes extractions = EUR. */
  devise?: Champ;
  intitule_poste: Champ;
  date_entree: Champ; // YYYY-MM-DD
};

export type ExtractionPaie = {
  bulletins: BulletinPaie[];
  remarques?: string | null;
};

export type ExtractionContrat = {
  nom_complet: Champ;
  employeur: Champ;
  type_contrat: Champ<"CDI" | "CDD" | "interim" | "independant" | "autre">;
  date_debut: Champ; // YYYY-MM-DD
  date_fin: Champ; // YYYY-MM-DD (CDD), null si CDI
  periode_essai: Champ<boolean>;
  fin_periode_essai: Champ; // YYYY-MM-DD
  salaire_mensuel: Champ<number>;
  salaire_est_brut: Champ<boolean>;
  /** Code ISO de la devise du salaire du contrat. Absent sur les anciennes extractions = EUR. */
  devise?: Champ;
  intitule_poste: Champ;
  remarques?: string | null;
};

export type ExtractionIdentite = {
  nom: Champ;
  prenom: Champ;
  date_naissance: Champ; // YYYY-MM-DD
  nationalite: Champ;
  type_document: Champ<"carte_identite" | "passeport" | "titre_sejour" | "autre">;
  date_expiration: Champ; // YYYY-MM-DD
  remarques?: string | null;
};

// --- Documents de l'INDÉPENDANT --------------------------------------------

/** Avis / bulletin d'imposition : la preuve de revenu la plus fiable (fiscale). */
export type AvisImposition = {
  nom_complet: Champ;
  annee: Champ; // année des revenus (AAAA)
  revenu_net_annuel: Champ<number>; // revenu net imposable / revenu fiscal de référence, par an
  /** Code ISO de la devise. Absent sur les anciennes extractions = EUR. */
  devise?: Champ;
};

/** Bilan + compte de résultat d'un exercice. */
export type Bilan = {
  nom_complet: Champ; // exploitant / gérant si présent
  denomination: Champ; // raison sociale de l'entreprise
  forme_juridique: Champ; // ex : SARL, SAS, entreprise individuelle, profession libérale
  annee: Champ; // exercice (AAAA)
  chiffre_affaires: Champ<number>; // par an, dans la devise du document
  resultat_net: Champ<number>; // bénéfice (ou perte, négatif) net, par an
  /** Code ISO de la devise. Absent sur les anciennes extractions = EUR. */
  devise?: Champ;
  date_creation: Champ; // YYYY-MM-DD si présent
};

/** Extrait KBIS / immatriculation : existence + ancienneté de l'entreprise. */
export type Kbis = {
  denomination: Champ;
  forme_juridique: Champ;
  date_immatriculation: Champ; // YYYY-MM-DD
  dirigeant_nom: Champ; // gérant / président
  numero: Champ; // SIREN / numéro d'immatriculation
};

/**
 * Extraction d'un fichier « dossier » : un seul scan contenant plusieurs
 * documents (et parfois plusieurs personnes). Chaque tableau = tous les
 * éléments de ce type trouvés dans le fichier. La synthèse répartit ensuite les
 * éléments par personne (A/B) selon le nom extrait.
 */
export type ExtractionDossier = {
  fiches_de_paie: BulletinPaie[];
  contrats: ExtractionContrat[];
  pieces_identite: ExtractionIdentite[];
  avis_imposition: AvisImposition[];
  bilans: Bilan[];
  kbis: Kbis[];
};

export type Extraction =
  | ExtractionPaie
  | ExtractionContrat
  | ExtractionIdentite
  | ExtractionDossier;

export type DocumentMeta = {
  id: number;
  candidat_id: number;
  personne: PersonneDoc;
  type: DocTypeStocke;
  filename: string;
  mime: string;
  size_bytes: number;
  extraction: Extraction | null;
  extraction_status: "pending" | "done" | "error";
  extraction_error: string | null;
  uploaded_at: string;
};

// ---------------------------------------------------------------------------
// Synthèse par personne (agrégée en code depuis les extractions)
// ---------------------------------------------------------------------------

export type SynthesePersonne = {
  personne: Personne;
  identite: {
    nom: string | null;
    prenom: string | null;
    date_naissance: string | null;
    aVerifier: boolean;
  } | null;
  emploi: {
    /**
     * Revenu mensuel net de la personne. Salarié : moyenne des bulletins.
     * Indépendant : revenu net annuel moyen / 12 (AVANT toute décote de
     * prudence, appliquée au scoring). Sert de base au ratio revenus/loyer.
     */
    salaire_net_mensuel: number | null;
    nbBulletins: number;
    intitule_poste: string | null;
    type_contrat: "CDI" | "CDD" | "interim" | "independant" | "autre" | null;
    periode_essai: boolean | null;
    fin_periode_essai: string | null;
    date_entree: string | null;
    ancienneteMois: number | null;
    employeur: string | null;
    /** Détail indépendant (null pour un salarié). */
    independant: {
      /** Revenus nets annuels retenus, par année (source : avis d'imposition ou bilans). */
      revenus_annuels: { annee: string | null; montant: number }[];
      /** Moyenne annuelle des revenus retenus, en €/an. */
      revenu_annuel_moyen: number;
      forme_juridique: string | null;
      /** Chiffre d'affaires du dernier exercice connu. */
      chiffre_affaires: number | null;
      /** D'où vient le revenu : avis d'imposition (préféré) ou résultat des bilans. */
      source: "avis_imposition" | "bilan";
    } | null;
    /** Champs à confiance basse ou manquants, à vérifier à la main. */
    aVerifier: string[];
  } | null;
};

/** Check de complétude du dossier (calculé en code après analyse). */
export type CompletudeItem = {
  personne: PersonneDoc;
  label: string;
  statut: "ok" | "partiel" | "manquant";
  detail: string;
};

export type CoherenceCheck = {
  personne: Personne;
  check: string;
  ok: boolean;
  detail: string;
  /** Incohérence validée à la main par l'agent : n'affecte plus la note. */
  ignored?: boolean;
};

// ---------------------------------------------------------------------------
// Scoring (code pur, déterministe)
// ---------------------------------------------------------------------------

export type ScoreCritere = {
  key: "ratio" | "stabilite" | "anciennete" | "coherence";
  label: string;
  points: number;
  max: number;
  detail: string;
  eliminatoire: boolean;
};

export type Score = {
  total: number;
  max: number;
  criteres: ScoreCritere[];
  /** Un critère éliminatoire a plafonné le score. */
  eliminatoire: boolean;
  revenusMenage: number | null;
  ratio: number | null;
};

export type CandidatStatut = "en_attente" | "analyse" | "erreur_document";

export type Candidat = {
  id: number;
  bien_id: number;
  nom: string;
  statut: CandidatStatut;
  synthese: SynthesePersonne[] | null;
  coherence: CoherenceCheck[] | null;
  score: Score | null;
  analysed_at: string | null;
  created_at: string;
};
