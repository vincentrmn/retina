import type { DocType } from "./types";

/**
 * Schémas JSON (structured outputs) par type de document.
 * Chaque champ = { value, confiance } : le modèle donne la valeur ET son
 * niveau de confiance. Un champ absent ou illisible => value null — jamais
 * inventé. Contraintes structured outputs : additionalProperties:false et
 * required exhaustif sur chaque objet.
 */

type Json = Record<string, unknown>;

const CONFIANCE = { type: "string", enum: ["haute", "moyenne", "basse"] };

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

const BULLETIN = {
  type: "object",
  description: "Un bulletin de salaire (un mois)",
  properties: {
    nom_complet: champ("string", "Nom complet du salarié tel qu'imprimé sur le bulletin"),
    employeur: champ("string", "Nom de l'employeur / raison sociale"),
    periode: champ("string", "Période du bulletin au format YYYY-MM"),
    salaire_net_mensuel: champ("number", "Salaire NET mensuel en euros (net à payer avant impôt si distinction, sinon net à payer)"),
    salaire_brut_mensuel: champ("number", "Salaire BRUT mensuel en euros"),
    intitule_poste: champ("string", "Intitulé du poste / fonction si présent"),
    date_entree: champ("string", "Date d'entrée / d'ancienneté dans l'entreprise au format YYYY-MM-DD (souvent en en-tête du bulletin)"),
  },
  required: ["nom_complet", "employeur", "periode", "salaire_net_mensuel", "salaire_brut_mensuel", "intitule_poste", "date_entree"],
  additionalProperties: false,
};

export const SCHEMA_PAIE = objet({
  bulletins: {
    type: "array",
    description: "Un élément PAR bulletin présent dans le document (un scan contient souvent plusieurs mois)",
    items: BULLETIN,
  },
});

export const SCHEMA_CONTRAT = objet({
  nom_complet: champ("string", "Nom complet du salarié"),
  employeur: champ("string", "Nom de l'employeur / raison sociale"),
  type_contrat: champ("string", "Type de contrat", ["CDI", "CDD", "interim", "independant", "autre"]),
  date_debut: champ("string", "Date de début du contrat, YYYY-MM-DD"),
  date_fin: champ("string", "Date de fin (CDD/intérim), YYYY-MM-DD. null si CDI"),
  periode_essai: champ("boolean", "Le contrat prévoit-il une période d'essai ?"),
  fin_periode_essai: champ("string", "Date de fin de la période d'essai, YYYY-MM-DD, si calculable depuis le contrat"),
  salaire_mensuel: champ("number", "Salaire mensuel indiqué au contrat, en euros"),
  salaire_est_brut: champ("boolean", "true si le salaire du contrat est exprimé en BRUT"),
  intitule_poste: champ("string", "Intitulé du poste"),
});

export const SCHEMA_IDENTITE = objet({
  nom: champ("string", "Nom de famille"),
  prenom: champ("string", "Prénom(s)"),
  date_naissance: champ("string", "Date de naissance, YYYY-MM-DD"),
  nationalite: champ("string", "Nationalité"),
  type_document: champ("string", "Type de pièce", ["carte_identite", "passeport", "titre_sejour", "autre"]),
  date_expiration: champ("string", "Date d'expiration du document, YYYY-MM-DD"),
});

export const SCHEMAS: Record<DocType, Json> = {
  fiche_paie: SCHEMA_PAIE,
  contrat: SCHEMA_CONTRAT,
  piece_identite: SCHEMA_IDENTITE,
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


const SANS_CADRATIN =
  " Dans les remarques, pas de tiret cadratin ni demi-cadratin : ponctue avec des virgules, points ou deux-points.";

export const PROMPTS: Record<DocType, string> = {
  fiche_paie:
    "Ce document contient une ou plusieurs fiches de paie (bulletins de salaire), possiblement des scans de " +
    "qualité variable. Produis un élément de `bulletins` PAR bulletin/mois présent dans le document. Règles " +
    "strictes : n'invente JAMAIS une valeur — si un champ est absent, illisible ou douteux, mets value=null ou " +
    "baisse la confiance. Les montants sont en euros ; convertis les formats locaux (1.234,56 ou 1 234,56 → " +
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
