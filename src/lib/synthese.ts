import type {
  BulletinPaie,
  Champ,
  CoherenceCheck,
  CompletudeItem,
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
  /** Bulletins individuels, aplatis (un PDF scanné contient souvent plusieurs mois). */
  paies: BulletinPaie[];
  contrat: ExtractionContrat | null;
  identite: ExtractionIdentite | null;
};

function groupDocs(docs: DocumentMeta[], p: Personne): DocsByType {
  const mine = docs.filter((d) => d.personne === p && d.extraction_status === "done" && d.extraction);
  return {
    paies: mine
      .filter((d) => d.type === "fiche_paie")
      .flatMap((d) => (d.extraction as ExtractionPaie).bulletins ?? []),
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

    // Nom de repli : sans pièce d'identité, on prend le nom porté par le contrat
    // ou les bulletins (marqué « à vérifier » car pas issu d'un document officiel).
    const nomRepli =
      (contrat ? val(contrat.nom_complet) : null) ??
      paies.map((f) => val(f.nom_complet)).find((v) => v) ??
      null;

    out.push({
      personne: p,
      identite: identite
        ? {
            nom: val(identite.nom),
            prenom: val(identite.prenom),
            date_naissance: val(identite.date_naissance),
            aVerifier: douteux(identite.nom) || douteux(identite.prenom) || douteux(identite.date_naissance),
          }
        : nomRepli
        ? { nom: nomRepli, prenom: null, date_naissance: null, aVerifier: true }
        : null,
      emploi,
    });
  }

  return out;
}

/** Montant lisible « 2.000 € » pour les phrases de cohérence. */
function money(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
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
          check: "Le nom est le même sur la pièce d'identité et les fiches de paie",
          ok: same,
          detail: same
            ? `Le nom « ${paieNom} » qui figure sur les fiches de paie correspond bien à celui de la pièce d'identité.`
            : `Les fiches de paie sont au nom de « ${paieNom} », alors que la pièce d'identité indique « ${idFull} ». À vérifier.`,
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
          check: "L'employeur est le même sur le contrat et les fiches de paie",
          ok: same,
          detail: same
            ? `L'employeur « ${empP} » est identique sur le contrat de travail et sur les fiches de paie.`
            : `Le contrat de travail indique l'employeur « ${empC} », alors que les fiches de paie mentionnent « ${empP} ». À vérifier.`,
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
        const nature = brut ? "brut" : "net";
        checks.push({
          personne: p,
          check: "Le salaire du contrat correspond aux fiches de paie",
          ok,
          detail: ok
            ? `Le salaire prévu au contrat (${money(sc)} ${nature}) est cohérent avec la moyenne des fiches de paie (${money(avg)}).`
            : `Le salaire prévu au contrat (${money(sc)} ${nature}) s'écarte de plus de 15 % de la moyenne des fiches de paie (${money(avg)}). À vérifier.`,
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
        const liste = periods.join(", ");
        const soucis: string[] = [];
        if (!recent) soucis.push(`la fiche de paie la plus récente (${last}) date de plus de 3 mois`);
        if (!consecutifs) soucis.push("les mois fournis ne se suivent pas");
        checks.push({
          personne: p,
          check: "Les fiches de paie sont récentes et se suivent",
          ok,
          detail: ok
            ? `Fiches de paie fournies : ${liste}. Elles sont récentes et se suivent mois par mois.`
            : `Fiches de paie fournies : ${liste}. Attention : ${soucis.join(" et ")}.`,
        });
      }
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Rattachement automatique des documents aux personnes A/B (upload en batch)
// ---------------------------------------------------------------------------

/** Nom lisible sur un document extrait (sert au regroupement par personne). */
export function nomDuDoc(d: DocumentMeta): string | null {
  if (d.extraction_status !== "done" || !d.extraction) return null;
  if (d.type === "fiche_paie") {
    const b = (d.extraction as ExtractionPaie).bulletins ?? [];
    return b.map((x) => val(x.nom_complet)).find((v) => v) ?? null;
  }
  if (d.type === "contrat") return val((d.extraction as ExtractionContrat).nom_complet);
  if (d.type === "piece_identite") {
    const i = d.extraction as ExtractionIdentite;
    return [val(i.prenom), val(i.nom)].filter(Boolean).join(" ") || null;
  }
  return null;
}

/**
 * Regroupe les documents par personne à partir des noms extraits. Les docs
 * déjà rattachés (A/B) ancrent leur groupe ; les docs `?` rejoignent le
 * groupe dont le nom correspond, ou ouvrent un nouveau groupe (A puis B).
 * Retourne la liste { docId, personne } des rattachements à écrire.
 */
export function assignPersonnes(docs: DocumentMeta[]): { docId: number; personne: Personne }[] {
  type Groupe = { noms: string[]; lettre: Personne | null; docIds: number[] };
  const groupes: Groupe[] = [];
  const ordered = [...docs].sort((a, b) => a.id - b.id);

  for (const d of ordered) {
    const nom = nomDuDoc(d);
    if (!nom) continue; // sans nom lisible : reste tel quel
    let g = groupes.find((x) => x.noms.some((n) => sameEntity(n, nom)));
    if (!g) {
      g = { noms: [], lettre: null, docIds: [] };
      groupes.push(g);
    }
    g.noms.push(nom);
    g.docIds.push(d.id);
    if (d.personne === "A" || d.personne === "B") g.lettre = g.lettre ?? d.personne;
  }

  // Attribue les lettres libres aux groupes sans ancre, dans l'ordre d'apparition.
  const prises = new Set(groupes.map((g) => g.lettre).filter(Boolean) as Personne[]);
  for (const g of groupes) {
    if (g.lettre) continue;
    const libre = (["A", "B"] as Personne[]).find((l) => !prises.has(l));
    if (!libre) break; // plus de 2 personnes détectées : on laisse en `?`
    g.lettre = libre;
    prises.add(libre);
  }

  const out: { docId: number; personne: Personne }[] = [];
  for (const g of groupes) {
    if (!g.lettre) continue;
    for (const id of g.docIds) {
      const d = docs.find((x) => x.id === id)!;
      if (d.personne === "?") out.push({ docId: id, personne: g.lettre });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Complétude du dossier (check après analyse)
// ---------------------------------------------------------------------------

export function buildCompletude(docs: DocumentMeta[], now = new Date()): CompletudeItem[] {
  const items: CompletudeItem[] = [];
  const personnes: Personne[] = ["A", "B"];

  for (const p of personnes) {
    const { paies, contrat, identite } = groupDocs(docs, p);
    const desDocs = docs.some((d) => d.personne === p);
    if (!desDocs && !paies.length) continue;

    // Pièce d'identité
    items.push({
      personne: p,
      label: "Pièce d'identité",
      statut: identite ? "ok" : "manquant",
      detail: identite ? "présente" : "à uploader",
    });

    // Contrat de travail
    items.push({
      personne: p,
      label: "Contrat de travail",
      statut: contrat ? "ok" : "manquant",
      detail: contrat ? "présent" : "à uploader",
    });

    // Bulletins : 3 attendus, le dernier < 3 mois
    const periods = paies
      .map((f) => val(f.periode))
      .filter((v): v is string => !!v && /^\d{4}-\d{2}$/.test(v))
      .sort();
    let statut: CompletudeItem["statut"] = "manquant";
    let detail = "aucun bulletin";
    if (paies.length) {
      const last = periods[periods.length - 1];
      let recent = false;
      if (last) {
        const [y, m] = last.split("-").map(Number);
        recent = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) <= 3;
      }
      if (paies.length >= 3 && recent) {
        statut = "ok";
        detail = `${paies.length} bulletins, le dernier est récent`;
      } else {
        statut = "partiel";
        detail = `${paies.length} bulletin${paies.length > 1 ? "s" : ""} sur 3 attendus${last && !recent ? ", le dernier date de " + last : ""}`;
      }
    }
    items.push({ personne: p, label: "3 derniers bulletins de salaire", statut, detail });
  }

  // Documents non rattachés ou non reconnus
  const orphelins = docs.filter((d) => d.personne === "?" && d.extraction_status === "done");
  if (orphelins.length) {
    items.push({
      personne: "?",
      label: "Documents à rattacher",
      statut: "partiel",
      detail: `${orphelins.length} document${orphelins.length > 1 ? "s" : ""} sans personne identifiée (choisir A ou B à la main)`,
    });
  }
  const inconnus = docs.filter((d) => d.type === "autre");
  if (inconnus.length) {
    items.push({
      personne: "?",
      label: "Documents non reconnus",
      statut: "partiel",
      detail: inconnus.map((d) => d.filename).join(", "),
    });
  }
  return items;
}
