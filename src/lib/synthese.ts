import type {
  Champ,
  CoherenceCheck,
  DocumentMeta,
  ExtractionContrat,
  ExtractionIdentite,
  ExtractionPaie,
  Personne,
  SynthesePersonne,
} from "./types";

/**
 * Agrégation en code des extractions par personne (A/B) + contrôles de
 * cohérence croisés. Zéro IA ici : tout est vérifiable et déterministe.
 */

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Deux libellés désignent-ils plausiblement la même entité ? (inclusion de tokens) */
function sameEntity(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  const ta = norm(a).split(" ").filter((t) => t.length > 1);
  const tb = norm(b).split(" ").filter((t) => t.length > 1);
  if (!ta.length || !tb.length) return null;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hits = short.filter((t) => long.includes(t)).length;
  return hits >= Math.min(2, short.length);
}

function val<T>(c: Champ<T> | undefined): T | null {
  return c && c.value != null ? c.value : null;
}
function douteux<T>(c: Champ<T> | undefined): boolean {
  return !c || c.value == null || c.confiance === "basse";
}

function monthsBetween(fromISO: string, to: Date): number | null {
  const d = new Date(fromISO);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, (to.getFullYear() - d.getFullYear()) * 12 + (to.getMonth() - d.getMonth()));
}

type DocsByType = {
  paies: ExtractionPaie[];
  contrat: ExtractionContrat | null;
  identite: ExtractionIdentite | null;
};

function groupDocs(docs: DocumentMeta[], p: Personne): DocsByType {
  const mine = docs.filter((d) => d.personne === p && d.extraction_status === "done" && d.extraction);
  return {
    paies: mine.filter((d) => d.type === "fiche_paie").map((d) => d.extraction as ExtractionPaie),
    contrat: (mine.find((d) => d.type === "contrat")?.extraction as ExtractionContrat) ?? null,
    identite: (mine.find((d) => d.type === "piece_identite")?.extraction as ExtractionIdentite) ?? null,
  };
}

export function buildSynthese(docs: DocumentMeta[], now = new Date()): SynthesePersonne[] {
  const personnes: Personne[] = ["A", "B"];
  const out: SynthesePersonne[] = [];

  for (const p of personnes) {
    const { paies, contrat, identite } = groupDocs(docs, p);
    if (!paies.length && !contrat && !identite) continue;

    const aVerifier: string[] = [];

    const nets = paies.map((f) => val(f.salaire_net_mensuel)).filter((v): v is number => v != null);
    const salaireNet = nets.length ? Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 100) / 100 : null;
    if (paies.some((f) => douteux(f.salaire_net_mensuel))) aVerifier.push("salaire net (bulletin peu lisible)");
    if (!paies.length) aVerifier.push("aucune fiche de paie fournie");
    else if (paies.length < 3) aVerifier.push(`seulement ${paies.length} bulletin${paies.length > 1 ? "s" : ""} (3 recommandés)`);

    const typeContrat = contrat ? val(contrat.type_contrat) : null;
    if (contrat && douteux(contrat.type_contrat)) aVerifier.push("type de contrat");
    if (!contrat) aVerifier.push("aucun contrat de travail fourni");

    const dateEntree = (contrat ? val(contrat.date_debut) : null) ?? paies.map((f) => val(f.date_entree)).find((v) => v) ?? null;
    const anciennete = dateEntree ? monthsBetween(dateEntree, now) : null;
    if (!dateEntree) aVerifier.push("date d'entrée dans l'entreprise");

    const essai = contrat ? val(contrat.periode_essai) : null;
    const finEssai = contrat ? val(contrat.fin_periode_essai) : null;
    if (contrat && douteux(contrat.periode_essai)) aVerifier.push("période d'essai");

    const emploi = {
      salaire_net_mensuel: salaireNet,
      nbBulletins: paies.length,
      intitule_poste: (contrat ? val(contrat.intitule_poste) : null) ?? paies.map((f) => val(f.intitule_poste)).find((v) => v) ?? null,
      type_contrat: typeContrat,
      periode_essai: essai,
      fin_periode_essai: finEssai,
      date_entree: dateEntree,
      ancienneteMois: anciennete,
      employeur: paies.map((f) => val(f.employeur)).find((v) => v) ?? (contrat ? val(contrat.employeur) : null),
      aVerifier,
    };

    out.push({
      personne: p,
      identite: identite
        ? {
            nom: val(identite.nom),
            prenom: val(identite.prenom),
            date_naissance: val(identite.date_naissance),
            aVerifier: douteux(identite.nom) || douteux(identite.prenom) || douteux(identite.date_naissance),
          }
        : null,
      emploi,
    });
  }

  return out;
}

export function buildCoherence(docs: DocumentMeta[], now = new Date()): CoherenceCheck[] {
  const checks: CoherenceCheck[] = [];
  const personnes: Personne[] = ["A", "B"];

  for (const p of personnes) {
    const { paies, contrat, identite } = groupDocs(docs, p);
    if (!paies.length && !contrat && !identite) continue;

    // 1. Nom sur la fiche de paie == nom sur la pièce d'identité
    if (identite && paies.length) {
      const idFull = [val(identite.prenom), val(identite.nom)].filter(Boolean).join(" ") || null;
      const paieNom = paies.map((f) => val(f.nom_complet)).find((v) => v) ?? null;
      const same = sameEntity(idFull, paieNom);
      if (same != null) {
        checks.push({
          personne: p,
          check: "Identité ↔ fiche de paie",
          ok: same,
          detail: same
            ? `« ${paieNom} » correspond à la pièce d'identité`
            : `Le bulletin est au nom de « ${paieNom} », la pièce d'identité indique « ${idFull} »`,
        });
      }
    }

    // 2. Employeur du contrat == employeur du bulletin
    if (contrat && paies.length) {
      const empC = val(contrat.employeur);
      const empP = paies.map((f) => val(f.employeur)).find((v) => v) ?? null;
      const same = sameEntity(empC, empP);
      if (same != null) {
        checks.push({
          personne: p,
          check: "Employeur contrat ↔ bulletins",
          ok: same,
          detail: same ? `« ${empP} » sur les deux documents` : `Contrat : « ${empC} » / bulletins : « ${empP} »`,
        });
      }
    }

    // 3. Salaire du contrat ≈ salaire des bulletins (±15 %)
    if (contrat && paies.length) {
      const sc = val(contrat.salaire_mensuel);
      const brut = val(contrat.salaire_est_brut);
      const ref = brut
        ? paies.map((f) => val(f.salaire_brut_mensuel)).filter((v): v is number => v != null)
        : paies.map((f) => val(f.salaire_net_mensuel)).filter((v): v is number => v != null);
      if (sc != null && ref.length) {
        const avg = ref.reduce((a, b) => a + b, 0) / ref.length;
        const ok = Math.abs(sc - avg) / Math.max(sc, avg) <= 0.15;
        checks.push({
          personne: p,
          check: "Salaire contrat ↔ bulletins",
          ok,
          detail: `Contrat : ${Math.round(sc)} € ${brut ? "brut" : "net"} / bulletins : ${Math.round(avg)} € en moyenne`,
        });
      }
    }

    // 4. Bulletins consécutifs et récents (< 3 mois)
    if (paies.length) {
      const periods = paies
        .map((f) => val(f.periode))
        .filter((v): v is string => !!v && /^\d{4}-\d{2}$/.test(v))
        .sort();
      if (periods.length) {
        const last = periods[periods.length - 1];
        const [y, m] = last.split("-").map(Number);
        const ageMois = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
        const recent = ageMois <= 3;
        let consecutifs = true;
        for (let i = 1; i < periods.length; i++) {
          const [py, pm] = periods[i - 1].split("-").map(Number);
          const [cy, cm] = periods[i].split("-").map(Number);
          if ((cy - py) * 12 + (cm - pm) !== 1) consecutifs = false;
        }
        const ok = recent && (periods.length < 2 || consecutifs);
        checks.push({
          personne: p,
          check: "Bulletins consécutifs et récents",
          ok,
          detail: `${periods.join(", ")}${recent ? "" : ` — dernier bulletin vieux de ${ageMois} mois`}${consecutifs ? "" : " — périodes non consécutives"}`,
        });
      }
    }
  }

  return checks;
}
