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

// ---------------------------------------------------------------------------
// Répartition A/B au niveau de chaque document EXTRAIT (pas du fichier).
// Un fichier « dossier » peut contenir plusieurs documents et plusieurs
// personnes : on aplatit tout en « items » puis on regroupe par nom. Gère aussi
// bien « un scan par personne » (tous les items portent le même nom) que « un
// scan pour tout le couple » (les items se répartissent sur deux noms).
// ---------------------------------------------------------------------------

type RawItem = { kind: "paie" | "contrat" | "identite"; nom: string | null; forced: Personne | null; data: any };

function nomOfIdentite(i: ExtractionIdentite): string | null {
  return [val(i.prenom), val(i.nom)].filter(Boolean).join(" ") || null;
}

function itemsOfDoc(d: DocumentMeta): RawItem[] {
  if (d.extraction_status !== "done" || !d.extraction) return [];
  const e: any = d.extraction;
  // Fichier « dossier » = possiblement plusieurs personnes → jamais de forçage
  // par fichier. Un document typé (legacy) peut, lui, être forcé à la main (A/B).
  const forced: Personne | null = d.type !== "dossier" && (d.personne === "A" || d.personne === "B") ? d.personne : null;
  const out: RawItem[] = [];
  const addPaie = (b: BulletinPaie) => out.push({ kind: "paie", nom: val(b.nom_complet), forced, data: b });
  const addContrat = (c: ExtractionContrat) => out.push({ kind: "contrat", nom: val(c.nom_complet), forced, data: c });
  const addId = (i: ExtractionIdentite) => out.push({ kind: "identite", nom: nomOfIdentite(i), forced, data: i });
  switch (d.type) {
    case "fiche_paie": (e.bulletins ?? []).forEach(addPaie); break;
    case "contrat": addContrat(e as ExtractionContrat); break;
    case "piece_identite": addId(e as ExtractionIdentite); break;
    case "dossier":
      (e.fiches_de_paie ?? []).forEach(addPaie);
      (e.contrats ?? []).forEach(addContrat);
      (e.pieces_identite ?? []).forEach(addId);
      break;
  }
  return out;
}

/** Attribue chaque item à A ou B (regroupement par nom, forçage manuel prioritaire). */
function assignItems(items: RawItem[]): (Personne | null)[] {
  type Cluster = { noms: string[]; lettre: Personne | null; idx: number[] };
  const clusters: Cluster[] = [];
  items.forEach((it, i) => {
    if (!it.nom) return;
    let c = clusters.find((x) => x.noms.some((n) => sameEntity(n, it.nom)));
    if (!c) { c = { noms: [], lettre: null, idx: [] }; clusters.push(c); }
    c.noms.push(it.nom);
    c.idx.push(i);
    if (it.forced) c.lettre = c.lettre ?? it.forced;
  });
  const prises = new Set(clusters.map((c) => c.lettre).filter(Boolean) as Personne[]);
  for (const c of clusters) {
    if (c.lettre) continue;
    const libre = (["A", "B"] as Personne[]).find((l) => !prises.has(l));
    if (!libre) break; // plus de 2 personnes : les suivantes restent non attribuées
    c.lettre = libre;
    prises.add(libre);
  }
  const res: (Personne | null)[] = items.map(() => null);
  for (const c of clusters) for (const i of c.idx) if (c.lettre) res[i] = c.lettre;
  // Items sans nom lisible : forçage d'abord ; sinon, s'il n'y a qu'une personne
  // dans le dossier, on les lui rattache (sinon on ne peut pas trancher).
  const lettres = [...prises];
  items.forEach((it, i) => {
    if (res[i]) return;
    if (it.forced) { res[i] = it.forced; return; }
    if (!it.nom) {
      if (lettres.length === 1) res[i] = lettres[0];
      else if (clusters.length === 0) res[i] = "A";
    }
  });
  return res;
}

function partitionByPerson(docs: DocumentMeta[]): Record<Personne, DocsByType> {
  const items = docs.flatMap(itemsOfDoc);
  const who = assignItems(items);
  const buckets: Record<Personne, DocsByType> = {
    A: { paies: [], contrat: null, identite: null },
    B: { paies: [], contrat: null, identite: null },
  };
  items.forEach((it, i) => {
    const p = who[i];
    if (!p) return;
    const bk = buckets[p];
    if (it.kind === "paie") bk.paies.push(it.data);
    else if (it.kind === "contrat") bk.contrat = bk.contrat ?? it.data;
    else if (it.kind === "identite") bk.identite = bk.identite ?? it.data;
  });
  return buckets;
}

export function buildSynthese(docs: DocumentMeta[], now = new Date()): SynthesePersonne[] {
  const personnes: Personne[] = ["A", "B"];
  const parts = partitionByPerson(docs);
  const out: SynthesePersonne[] = [];

  for (const p of personnes) {
    const { paies, contrat, identite } = parts[p];
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
  const parts = partitionByPerson(docs);

  for (const p of personnes) {
    const { paies, contrat, identite } = parts[p];
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
// Complétude du dossier (check après analyse)
// ---------------------------------------------------------------------------

export function buildCompletude(docs: DocumentMeta[], now = new Date()): CompletudeItem[] {
  const items: CompletudeItem[] = [];
  const personnes: Personne[] = ["A", "B"];
  const parts = partitionByPerson(docs);

  for (const p of personnes) {
    const { paies, contrat, identite } = parts[p];
    if (!paies.length && !contrat && !identite) continue;

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

  // Documents non reconnus (aucun document exploitable trouvé dans le fichier)
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
