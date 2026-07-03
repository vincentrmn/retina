/**
 * Types RETINA — analyse de candidats à la location.
 * Principe cardinal : l'IA lit (extraction), le code juge (scoring).
 */

// ---------------------------------------------------------------------------
// Bien & critères d'éligibilité (paramétrables par bien)
// ---------------------------------------------------------------------------

export type Criteres = {
  /** Revenus nets du ménage ≥ ratioMin × (loyer + charges). Défaut 3. */
  ratioMin: number;
  /** Le ratio insuffisant est-il éliminatoire (plafonne le score) ? */
  ratioEliminatoire: boolean;
  /** Au moins un CDI dans le ménage est-il exigé ? */
  cdiRequis: boolean;
  /** Les CDD sont-ils acceptés comme revenu stable ? (sinon pénalisant) */
  cddAccepte: boolean;
  /** La période d'essai en cours est-elle éliminatoire ? (sinon pénalisante) */
  essaiEliminatoire: boolean;
  /** Ancienneté minimale dans l'entreprise, en mois. 0 = pas d'exigence. */
  ancienneteMinMois: number;
};

export const DEFAULT_CRITERES: Criteres = {
  ratioMin: 3,
  ratioEliminatoire: false,
  cdiRequis: false,
  cddAccepte: true,
  essaiEliminatoire: false,
  ancienneteMinMois: 0,
};

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
export type Personne = "A" | "B";

export type Confiance = "haute" | "moyenne" | "basse";

/** Un champ extrait : valeur + confiance. `null` = absent/illisible. */
export type Champ<T = string> = {
  value: T | null;
  confiance: Confiance;
};

export type ExtractionPaie = {
  nom_complet: Champ;
  employeur: Champ;
  /** Période du bulletin, format YYYY-MM. */
  periode: Champ;
  salaire_net_mensuel: Champ<number>;
  salaire_brut_mensuel: Champ<number>;
  intitule_poste: Champ;
  date_entree: Champ; // YYYY-MM-DD
  remarques: string | null;
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
  intitule_poste: Champ;
  remarques: string | null;
};

export type ExtractionIdentite = {
  nom: Champ;
  prenom: Champ;
  date_naissance: Champ; // YYYY-MM-DD
  nationalite: Champ;
  type_document: Champ<"carte_identite" | "passeport" | "titre_sejour" | "autre">;
  date_expiration: Champ; // YYYY-MM-DD
  remarques: string | null;
};

export type Extraction = ExtractionPaie | ExtractionContrat | ExtractionIdentite;

export type DocumentMeta = {
  id: number;
  candidat_id: number;
  personne: Personne;
  type: DocType;
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
    /** Moyenne des bulletins fournis (net). */
    salaire_net_mensuel: number | null;
    nbBulletins: number;
    intitule_poste: string | null;
    type_contrat: "CDI" | "CDD" | "interim" | "independant" | "autre" | null;
    periode_essai: boolean | null;
    fin_periode_essai: string | null;
    date_entree: string | null;
    ancienneteMois: number | null;
    employeur: string | null;
    /** Champs à confiance basse ou manquants, à vérifier à la main. */
    aVerifier: string[];
  } | null;
};

export type CoherenceCheck = {
  personne: Personne;
  check: string;
  ok: boolean;
  detail: string;
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
