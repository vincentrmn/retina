/** Format monétaire maison (même rendu que SCOUT/VESPER) : 1250 → « 1.250 € ». */
export function eur(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || !isFinite(n)) return "·";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  fiche_paie: "Fiche de paie",
  contrat: "Contrat de travail",
  piece_identite: "Pièce d'identité",
};

export const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  analyse: "Analysé",
  erreur_document: "Erreur document",
};

export const CONTRAT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  interim: "Intérim",
  independant: "Indépendant",
  autre: "Autre",
};

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "·";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "·" : d.toLocaleDateString("fr-FR");
}
