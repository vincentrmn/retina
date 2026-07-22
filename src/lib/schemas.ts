import type { DocType, DossierType } from "./types";

/**
 * Schémas JSON (structured outputs) par type de document.
 * Chaque champ = { value, confiance } : le modèle donne la valeur ET son
 * niveau de confiance. Un champ absent ou illisible => value null — jamais
 * inventé. Contraintes structured outputs : additionalProperties:false et
 * required exhaustif sur chaque objet.
 */

type Json = Record<string, unknown>;

const CONFIANCE = { type: "string", enum: ["haute", "moyenne", "basse"] };

const SANS_CADRATIN =
  " Dans les remarques, pas de tiret cadratin ni demi-cadratin : ponctue avec des virgules, points ou deux-points.";

function champ(type: "string" | "number" | "boolean", description: string, enumValues?: string[]): Json {
  const valueSchema: Json = enumValues
    ? { anyOf: [{ type, enum: enumValues }, { type: "null" }] }
    : { anyOf: [{ type }, { type: "null" }] };
  return {
    type: "object",
    description,
    properties: { value: valueSchema, confiance: CONFIANCE },
    required: ["value", "confiance"],
    additionalProperties: false,
  };
}

function objet(properties: Record<string, Json>): Json {
  return {
    type: "object",
    properties: {
      ...properties,
      remarques: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description: "Anomalies ou particularités notées sur le document (ratures, qualité, mentions inhabituelles). null si rien à signaler.",
      },
    },
    required: [...Object.keys(properties), "remarques"],
    additionalProperties: false,
  };
}

/**
 * Devise des montants d'un document. Les dossiers contiennent parfois des
 * fiches de paie ou avis étrangers (MUR, USD, CHF...) : les montants sont
 * extraits TELS QUELS dans leur devise, jamais convertis, et la synthèse
 * écarte du calcul tout ce qui n'est pas en euros (en le signalant).
 */
const DEVISE = champ(
  "string",
  "Code ISO 4217 de la devise des montants du document (EUR, MUR, USD, CHF, GBP...). EUR si les montants sont en euros. Ne convertis JAMAIS un montant dans une autre devise."
);

const BULLETIN = {
  type: "object",
  description: "Un bulletin de salaire (un mois)",
  properties: {
    nom_complet: champ("string", "Nom complet du salarié tel qu'imprimé sur le bulletin"),
    employeur: champ("string", "Nom de l'employeur / raison sociale"),
    periode: champ("string", "Période du bulletin au format YYYY-MM"),
    salaire_net_mensuel: champ("number", "Le NET imposable / ligne « Net » du bulletin (net après impôt et cotisations mais AVANT déduction des avantages en nature non versés). Devise du bulletin."),
    net_a_payer: champ("number", "Le montant réellement VERSÉ / viré au salarié : ligne « A payer », « Net à payer », « Net à verser » ou « Virement ». C'est le CASH reçu. Il peut être plus bas que le « Net » quand un avantage en nature (voiture/logement) est ajouté puis retenu. Si une seule ligne de net existe, reprends-la ici aussi. Devise du bulletin."),
    salaire_brut_mensuel: champ("number", "Salaire BRUT total (« Brut total »), dans la devise du bulletin"),
    avantage_en_nature: champ("number", "Total des AVANTAGES EN NATURE (voiture de société, logement...) : montants ajoutés au brut pour être imposés puis RETENUS en bas (non versés en cash). 0 si aucun."),
    elements_non_recurrents: champ("number", "Somme des montants BRUTS des lignes qui NE sont PAS du salaire de base récurrent : bonus, prime (toute prime ou bonus), AVANCE ou ACOMPTE (sur salaire ou sur bonus), rappel, régularisation, 13e/14e mois, indemnité exceptionnelle, heures supplémentaires exceptionnelles. N'inclus PAS le salaire de base, ni les cotisations/retenues, ni les avantages en nature. 0 si aucune."),
    elements_non_recurrents_detail: champ("string", "Libellés et montants de ces lignes non récurrentes, pour explication. Ex : « Avance sur bonus 2500 ». null si aucune."),
    devise: DEVISE,
    intitule_poste: champ("string", "Intitulé du poste / fonction si présent"),
    date_entree: champ("string", "Date d'entrée / d'ancienneté dans l'entreprise au format YYYY-MM-DD (souvent en en-tête du bulletin)"),
  },
  required: ["nom_complet", "employeur", "periode", "salaire_net_mensuel", "net_a_payer", "salaire_brut_mensuel", "avantage_en_nature", "elements_non_recurrents", "elements_non_recurrents_detail", "devise", "intitule_poste", "date_entree"],
  additionalProperties: false,
};

export const SCHEMA_PAIE = objet({
  bulletins: {
    type: "array",
    description: "Un élément PAR bulletin présent dans le document (un scan contient souvent plusieurs mois)",
    items: BULLETIN,
  },
});

const CONTRAT_PROPS: Record<string, Json> = {
  nom_complet: champ("string", "Nom complet du salarié"),
  employeur: champ("string", "Nom de l'employeur / raison sociale"),
  type_contrat: champ("string", "Type de contrat", ["CDI", "CDD", "interim", "independant", "autre"]),
  date_debut: champ("string", "Date de début du contrat, YYYY-MM-DD"),
  date_fin: champ("string", "Date de fin (CDD/intérim), YYYY-MM-DD. null si CDI"),
  periode_essai: champ("boolean", "Le contrat prévoit-il une période d'essai ?"),
  fin_periode_essai: champ("string", "Date de fin de la période d'essai, YYYY-MM-DD, si calculable depuis le contrat"),
  salaire_mensuel: champ("number", "Salaire mensuel indiqué au contrat, dans la devise du contrat"),
  salaire_est_brut: champ("boolean", "true si le salaire du contrat est exprimé en BRUT"),
  devise: DEVISE,
  intitule_poste: champ("string", "Intitulé du poste"),
};

const IDENTITE_PROPS: Record<string, Json> = {
  nom: champ("string", "Nom de famille"),
  prenom: champ("string", "Prénom(s)"),
  date_naissance: champ("string", "Date de naissance, YYYY-MM-DD"),
  nationalite: champ("string", "Nationalité"),
  type_document: champ("string", "Type de pièce", ["carte_identite", "passeport", "titre_sejour", "autre"]),
  date_expiration: champ("string", "Date d'expiration du document, YYYY-MM-DD"),
};

export const SCHEMA_CONTRAT = objet(CONTRAT_PROPS);
export const SCHEMA_IDENTITE = objet(IDENTITE_PROPS);

/** Versions « item de tableau » (sans remarques) pour l'extraction dossier. */
function itemObjet(properties: Record<string, Json>): Json {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const CONTRAT_ITEM = itemObjet(CONTRAT_PROPS);
const IDENTITE_ITEM = itemObjet(IDENTITE_PROPS);

/** Un fichier peut contenir PLUSIEURS contrats / pièces (couple) → tableaux. */
export const SCHEMA_CONTRATS = objet({
  contrats: { type: "array", description: "Un élément PAR contrat de travail présent dans le document (toutes personnes confondues).", items: CONTRAT_ITEM },
});
export const SCHEMA_IDENTITES = objet({
  pieces_identite: { type: "array", description: "Un élément PAR pièce d'identité présente dans le document (toutes personnes confondues).", items: IDENTITE_ITEM },
});

export const SCHEMAS: Record<DocType, Json> = {
  fiche_paie: SCHEMA_PAIE,
  contrat: SCHEMA_CONTRAT,
  piece_identite: SCHEMA_IDENTITE,
};

// --- Documents de l'INDÉPENDANT (schémas « tableau », un item par année/exercice) ---

const AVIS_PROPS: Record<string, Json> = {
  nom_complet: champ("string", "Nom complet du contribuable"),
  annee: champ("string", "Année des revenus concernés, format AAAA"),
  revenu_net_annuel: champ("number", "Revenu net imposable OU revenu fiscal de référence, par an, dans la devise du document"),
  devise: DEVISE,
};
const BILAN_PROPS: Record<string, Json> = {
  nom_complet: champ("string", "Nom de l'exploitant ou du gérant si présent"),
  denomination: champ("string", "Raison sociale / nom de l'entreprise"),
  forme_juridique: champ("string", "Forme juridique (SARL, SAS, entreprise individuelle, profession libérale, etc.)"),
  annee: champ("string", "Exercice concerné, format AAAA"),
  chiffre_affaires: champ("number", "Chiffre d'affaires de l'exercice, dans la devise du document"),
  resultat_net: champ("number", "Résultat net de l'exercice (bénéfice positif, perte négative), dans la devise du document"),
  devise: DEVISE,
  date_creation: champ("string", "Date de création de l'entreprise, YYYY-MM-DD, si présente"),
};
const KBIS_PROPS: Record<string, Json> = {
  denomination: champ("string", "Raison sociale / dénomination"),
  forme_juridique: champ("string", "Forme juridique"),
  date_immatriculation: champ("string", "Date d'immatriculation / de création, YYYY-MM-DD"),
  dirigeant_nom: champ("string", "Nom du dirigeant (gérant, président)"),
  numero: champ("string", "Numéro d'immatriculation (SIREN, RCS, etc.)"),
};

export const SCHEMA_AVIS = objet({
  avis_imposition: { type: "array", description: "Un élément PAR avis/bulletin d'imposition (souvent un par année, éventuellement pour deux personnes).", items: itemObjet(AVIS_PROPS) },
});
export const SCHEMA_BILANS = objet({
  bilans: { type: "array", description: "Un élément PAR exercice de bilan/compte de résultat présent.", items: itemObjet(BILAN_PROPS) },
});
export const SCHEMA_KBIS = objet({
  kbis: { type: "array", description: "Un élément PAR extrait KBIS / avis d'immatriculation présent.", items: itemObjet(KBIS_PROPS) },
});

/** Schémas « tableau » par type, pour l'extraction d'un fichier dossier. */
export const SCHEMAS_MULTI: Record<DossierType, Json> = {
  fiche_paie: SCHEMA_PAIE,
  contrat: SCHEMA_CONTRATS,
  piece_identite: SCHEMA_IDENTITES,
  avis_imposition: SCHEMA_AVIS,
  bilan: SCHEMA_BILANS,
  kbis: SCHEMA_KBIS,
};

/**
 * Étape 1 de l'extraction dossier (Haiku) : quels types de documents le fichier
 * contient-il ? Schéma minuscule (3 booléens, aucune union). On n'extrait
 * ensuite (Opus) que les types présents.
 */
export const SCHEMA_TYPES_PRESENTS: Json = {
  type: "object",
  properties: {
    fiche_paie: { type: "boolean", description: "Au moins une fiche de paie (bulletin de salaire) ?" },
    contrat: { type: "boolean", description: "Au moins un contrat de travail ?" },
    piece_identite: { type: "boolean", description: "Au moins une pièce d'identité (CNI, passeport, titre de séjour) ?" },
    avis_imposition: { type: "boolean", description: "Au moins un avis ou bulletin d'imposition (document des impôts indiquant un revenu) ?" },
    bilan: { type: "boolean", description: "Au moins un bilan comptable ou compte de résultat d'une entreprise ?" },
    kbis: { type: "boolean", description: "Au moins un extrait KBIS ou avis d'immatriculation d'entreprise ?" },
  },
  required: ["fiche_paie", "contrat", "piece_identite", "avis_imposition", "bilan", "kbis"],
  additionalProperties: false,
};

export const PROMPT_TYPES_PRESENTS =
  "Ce fichier fait partie d'un dossier de candidature à la location. Il peut contenir UN SEUL document ou PLUSIEURS " +
  "documents différents dans le même scan (fiches de paie, contrat de travail, pièce d'identité pour un salarié ; " +
  "avis d'imposition, bilan/compte de résultat, extrait KBIS pour un indépendant), éventuellement pour deux " +
  "personnes. Indique, pour chaque type, s'il est présent au moins une fois dans le fichier.";

/** Prompts « tableau » (tous les documents du type dans le fichier, toutes personnes). */
export const PROMPTS_MULTI: Record<DossierType, string> = {
  fiche_paie:
    "Ce fichier contient une ou plusieurs fiches de paie (bulletins de salaire), possiblement pour DEUX personnes " +
    "différentes et sur plusieurs mois, en scans de qualité variable. Produis un élément de `bulletins` PAR bulletin " +
    "présent, en conservant le nom exact du salarié de chaque bulletin (c'est lui qui permet de rattacher le bulletin " +
    "à la bonne personne). N'invente JAMAIS une valeur : champ absent ou illisible => value=null ou confiance basse. " +
    "Donne les montants TELS QUELS dans la devise du bulletin et renseigne `devise` (code ISO : EUR, MUR, USD...) : ne " +
    "convertis JAMAIS en euros. Normalise seulement l'écriture (1.234,56 ou 1 234,56 => 1234.56). " +
    "IMPORTANT pour distinguer le vrai salaire versé : `net_a_payer` = le montant réellement VIRÉ (ligne « A payer », " +
    "« Net à payer », « Virement »), qui peut être plus bas que le « Net » quand un avantage en nature (voiture/logement) " +
    "est ajouté au brut puis retenu. `avantage_en_nature` = total de ces avantages ajoutés-puis-retenus (0 si aucun). " +
    "`elements_non_recurrents` = somme BRUTE des lignes qui ne sont pas du salaire de base récurrent (bonus, prime, " +
    "AVANCE ou ACOMPTE sur salaire/bonus, rappel, régularisation, 13e/14e mois, indemnité, heures sup exceptionnelles), " +
    "avec leurs libellés dans `elements_non_recurrents_detail` (0 et null si aucune). Ne compte JAMAIS une avance, un " +
    "acompte ou un bonus comme du salaire de base." + SANS_CADRATIN,
  contrat:
    "Ce fichier peut contenir un ou plusieurs contrats de travail (parfois deux personnes), en scans de qualité " +
    "variable. Produis un élément de `contrats` PAR contrat présent, avec le nom exact du salarié de chaque contrat. " +
    "N'invente JAMAIS une valeur. Pour la période d'essai, calcule la date de fin depuis la date de début si une durée " +
    "est indiquée. Ne déduis pas le type de contrat s'il n'est pas explicite." + SANS_CADRATIN,
  piece_identite:
    "Ce fichier peut contenir une ou plusieurs pièces d'identité (parfois deux personnes), en scans ou photos. Produis " +
    "un élément de `pieces_identite` PAR pièce présente, avec nom et prénom exacts. N'invente JAMAIS une valeur. " +
    "Attention à l'ordre nom/prénom selon le pays." + SANS_CADRATIN,
  avis_imposition:
    "Ce fichier contient un ou plusieurs avis / bulletins d'imposition (documents des impôts), pour une ou deux " +
    "personnes, sur une ou plusieurs années. Produis un élément de `avis_imposition` PAR avis, avec le nom exact du " +
    "contribuable, l'année des revenus et le revenu net imposable (ou, à défaut, le revenu fiscal de référence) par an, " +
    "dans la devise du document avec `devise` renseignée (jamais de conversion). N'invente JAMAIS une valeur : champ " +
    "absent ou illisible => value=null ou confiance basse." + SANS_CADRATIN,
  bilan:
    "Ce fichier contient un ou plusieurs bilans comptables / comptes de résultat d'entreprise, possiblement sur " +
    "plusieurs exercices. Produis un élément de `bilans` PAR exercice, avec la raison sociale, la forme juridique, " +
    "l'année de l'exercice, le chiffre d'affaires, le résultat net (bénéfice positif, perte négative) et le nom de " +
    "l'exploitant/gérant si présent. N'invente JAMAIS une valeur. Montants dans la devise du document, `devise` " +
    "renseignée, jamais de conversion." + SANS_CADRATIN,
  kbis:
    "Ce fichier contient un ou plusieurs extraits KBIS / avis d'immatriculation d'entreprise. Produis un élément de " +
    "`kbis` PAR extrait, avec la dénomination, la forme juridique, la date d'immatriculation (création), le nom du " +
    "dirigeant et le numéro d'immatriculation. N'invente JAMAIS une valeur." + SANS_CADRATIN,
};

/**
 * Classification (étape 1 de l'upload en batch) : schéma minuscule, sans
 * union, passé à un modèle rapide (Haiku). L'extraction typée (Opus) vient
 * ensuite. NB : un schéma unique type+extraction dépasse la limite de l'API
 * sur les paramètres à union (16 max) — ne pas re-fusionner les deux étapes.
 */
export const SCHEMA_CLASSIFICATION: Json = {
  type: "object",
  properties: {
    type_detecte: {
      type: "string",
      enum: ["fiche_paie", "contrat", "piece_identite", "autre"],
      description:
        "Nature du document : fiche_paie (bulletin(s) de salaire), contrat (contrat de travail), piece_identite (CNI/passeport/titre de séjour), autre si rien de tout ça.",
    },
  },
  required: ["type_detecte"],
  additionalProperties: false,
};


export const PROMPTS: Record<DocType, string> = {
  fiche_paie:
    "Ce document contient une ou plusieurs fiches de paie (bulletins de salaire), possiblement des scans de " +
    "qualité variable. Produis un élément de `bulletins` PAR bulletin/mois présent dans le document. Règles " +
    "strictes : n'invente JAMAIS une valeur — si un champ est absent, illisible ou douteux, mets value=null ou " +
    "baisse la confiance. Donne les montants TELS QUELS dans la devise du bulletin et renseigne `devise` (code ISO : " +
    "EUR, MUR, USD...) : ne convertis JAMAIS en euros. Normalise seulement l'écriture (1.234,56 ou 1 234,56 → " +
    "1234.56). Si un bulletin couvre une période non mensuelle, ramène les salaires au mensuel et signale-le en " +
    "remarques." + SANS_CADRATIN,
  contrat:
    "Ce document est un contrat de travail (possiblement plusieurs pages, scan de qualité variable). " +
    "Extrais les informations demandées. Règles strictes : n'invente JAMAIS une valeur — si un champ est absent " +
    "ou illisible, mets value=null ou baisse la confiance. Pour la période d'essai : si une durée est indiquée, " +
    "calcule la date de fin depuis la date de début. Ne déduis pas le type de contrat s'il n'est pas explicite." + SANS_CADRATIN,
  piece_identite:
    "Ce document est une pièce d'identité (carte d'identité, passeport ou titre de séjour), possiblement un scan " +
    "ou une photo. Extrais les informations demandées. Règles strictes : n'invente JAMAIS une valeur — si un champ " +
    "est absent ou illisible, mets value=null ou baisse la confiance. Attention à l'ordre nom/prénom selon le pays." + SANS_CADRATIN,
};

export const PROMPT_CLASSIFICATION =
  "Ce document fait partie d'un dossier de candidature à la location, possiblement un scan ou une photo de qualité " +
  "variable. Détermine sa nature : fiche_paie (un ou plusieurs bulletins de salaire), contrat (contrat de travail), " +
  "piece_identite (carte d'identité, passeport ou titre de séjour), ou autre si ce n'est rien de tout ça.";
