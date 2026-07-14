import type {
  AvisImposition,
  Bilan,
  BulletinPaie,
  Champ,
  CoherenceCheck,
  CompletudeItem,
  DocumentMeta,
  ExtractionContrat,
  ExtractionIdentite,
  Kbis,
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
  // Documents de l'indépendant
  avis: AvisImposition[];
  bilans: Bilan[];
  kbis: Kbis | null;
};

// ---------------------------------------------------------------------------
// Répartition A/B au niveau de chaque document EXTRAIT (pas du fichier).
// Un fichier « dossier » peut contenir plusieurs documents et plusieurs
// personnes : on aplatit tout en « items » puis on regroupe par nom. Gère aussi
// bien « un scan par personne » (tous les items portent le même nom) que « un
// scan pour tout le couple » (les items se répartissent sur deux noms).
// ---------------------------------------------------------------------------

type RawItem = {
  kind: "paie" | "contrat" | "identite" | "avis" | "bilan" | "kbis";
  nom: string | null;
  forced: Personne | null;
  data: any;
};

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
  const addAvis = (a: AvisImposition) => out.push({ kind: "avis", nom: val(a.nom_complet), forced, data: a });
  const addBilan = (b: Bilan) => out.push({ kind: "bilan", nom: val(b.nom_complet) ?? val(b.denomination), forced, data: b });
  const addKbis = (k: Kbis) => out.push({ kind: "kbis", nom: val(k.dirigeant_nom) ?? val(k.denomination), forced, data: k });
  switch (d.type) {
    case "fiche_paie": (e.bulletins ?? []).forEach(addPaie); break;
    case "contrat": addContrat(e as ExtractionContrat); break;
    case "piece_identite": addId(e as ExtractionIdentite); break;
    case "dossier":
      (e.fiches_de_paie ?? []).forEach(addPaie);
      (e.contrats ?? []).forEach(addContrat);
      (e.pieces_identite ?? []).forEach(addId);
      (e.avis_imposition ?? []).forEach(addAvis);
      (e.bilans ?? []).forEach(addBilan);
      (e.kbis ?? []).forEach(addKbis);
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
  const empty = (): DocsByType => ({ paies: [], contrat: null, identite: null, avis: [], bilans: [], kbis: null });
  const buckets: Record<Personne, DocsByType> = { A: empty(), B: empty() };
  items.forEach((it, i) => {
    const p = who[i];
    if (!p) return;
    const bk = buckets[p];
    if (it.kind === "paie") bk.paies.push(it.data);
    else if (it.kind === "contrat") bk.contrat = bk.contrat ?? it.data;
    else if (it.kind === "identite") bk.identite = bk.identite ?? it.data;
    else if (it.kind === "avis") bk.avis.push(it.data);
    else if (it.kind === "bilan") bk.bilans.push(it.data);
    else if (it.kind === "kbis") bk.kbis = bk.kbis ?? it.data;
  });
  return buckets;
}

/** Une personne a-t-elle des documents d'indépendant (avis, bilan ou KBIS) ? */
function aDocsIndependant(b: DocsByType): boolean {
  return b.avis.length > 0 || b.bilans.length > 0 || !!b.kbis;
}

type Emploi = NonNullable<SynthesePersonne["emploi"]>;

/**
 * Emploi d'un INDÉPENDANT (pas de fiche de paie ni de contrat de travail).
 * Revenu mensuel = moyenne des revenus nets annuels des 2 derniers exercices /12
 * (source : avis d'imposition en priorité, sinon résultat net des bilans). La
 * décote de prudence est appliquée AU SCORING, pas ici (la synthèse = les faits).
 * Ancienneté = âge de l'entreprise (KBIS, sinon date de création du bilan).
 */
function emploiIndependant(b: DocsByType, now: Date, aVerifier: string[]): Emploi {
  let source: "avis_imposition" | "bilan" = "avis_imposition";
  let annuels = b.avis
    .map((a) => ({ annee: val(a.annee), montant: val(a.revenu_net_annuel) }))
    .filter((x): x is { annee: string | null; montant: number } => x.montant != null);
  if (!annuels.length) {
    source = "bilan";
    annuels = b.bilans
      .map((bi) => ({ annee: val(bi.annee), montant: val(bi.resultat_net) }))
      .filter((x): x is { annee: string | null; montant: number } => x.montant != null);
  }
  // 2 exercices les plus récents (tri par année décroissante).
  annuels.sort((x, y) => (y.annee ?? "").localeCompare(x.annee ?? ""));
  const retenus = annuels.slice(0, 2);
  const moyenne = retenus.length ? Math.round(retenus.reduce((a, x) => a + x.montant, 0) / retenus.length) : null;
  const mensuel = moyenne != null ? Math.round((moyenne / 12) * 100) / 100 : null;

  const bilansTries = [...b.bilans].sort((x, y) => (val(y.annee) ?? "").localeCompare(val(x.annee) ?? ""));
  const dateCreation =
    (b.kbis ? val(b.kbis.date_immatriculation) : null) ?? bilansTries.map((bi) => val(bi.date_creation)).find((v) => v) ?? null;
  const anciennete = dateCreation ? monthsBetween(dateCreation, now) : null;
  const formeJuridique =
    (b.kbis ? val(b.kbis.forme_juridique) : null) ?? bilansTries.map((bi) => val(bi.forme_juridique)).find((v) => v) ?? null;
  const denomination =
    (b.kbis ? val(b.kbis.denomination) : null) ?? bilansTries.map((bi) => val(bi.denomination)).find((v) => v) ?? null;
  const caDernier = bilansTries.map((bi) => val(bi.chiffre_affaires)).find((v) => v != null) ?? null;

  if (!retenus.length) aVerifier.push("revenu de l'indépendant non déterminable (ni avis d'imposition ni bilan exploitable)");
  else if (retenus.length < 2) aVerifier.push("un seul exercice de revenu fourni (2 recommandés)");
  if (!dateCreation) aVerifier.push("date de création de l'entreprise");
  if (retenus.some((r) => r.montant <= 0)) aVerifier.push("un exercice en perte");

  return {
    salaire_net_mensuel: mensuel,
    nbBulletins: 0,
    intitule_poste: null,
    type_contrat: "independant",
    periode_essai: null,
    fin_periode_essai: null,
    date_entree: dateCreation,
    ancienneteMois: anciennete,
    employeur: denomination,
    independant: {
      revenus_annuels: retenus,
      revenu_annuel_moyen: moyenne ?? 0,
      forme_juridique: formeJuridique,
      chiffre_affaires: caDernier,
      source,
    },
    aVerifier,
  };
}

export function buildSynthese(docs: DocumentMeta[], now = new Date()): SynthesePersonne[] {
  const personnes: Personne[] = ["A", "B"];
  const parts = partitionByPerson(docs);
  const out: SynthesePersonne[] = [];

  for (const p of personnes) {
    const b = parts[p];
    const { paies, contrat, identite } = b;
    if (!paies.length && !contrat && !identite && !aDocsIndependant(b)) continue;

    const aVerifier: string[] = [];

    // Indépendant : pas de fiche de paie ni de contrat de travail, mais des
    // documents d'activité (avis d'imposition, bilan, KBIS). Un gérant qui se
    // verse un salaire (fiches de paie présentes) reste traité en salarié.
    const estIndependant = !paies.length && !contrat && aDocsIndependant(b);

    let emploi: Emploi;
    if (estIndependant) {
      emploi = emploiIndependant(b, now, aVerifier);
    } else {
      const nets = paies.map((f) => val(f.salaire_net_mensuel)).filter((v): v is number => v != null);
      const salaireNet = nets.length ? Math.round((nets.reduce((a, x) => a + x, 0) / nets.length) * 100) / 100 : null;
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

      emploi = {
        salaire_net_mensuel: salaireNet,
        nbBulletins: paies.length,
        intitule_poste: (contrat ? val(contrat.intitule_poste) : null) ?? paies.map((f) => val(f.intitule_poste)).find((v) => v) ?? null,
        type_contrat: typeContrat,
        periode_essai: essai,
        fin_periode_essai: finEssai,
        date_entree: dateEntree,
        ancienneteMois: anciennete,
        employeur: paies.map((f) => val(f.employeur)).find((v) => v) ?? (contrat ? val(contrat.employeur) : null),
        independant: null,
        aVerifier,
      };
    }

    // Nom de repli : sans pièce d'identité, on prend le nom porté par un autre
    // document (contrat, bulletin, avis d'imposition, bilan, KBIS) — marqué
    // « à vérifier » car pas issu d'un document officiel d'identité.
    const nomRepli =
      (contrat ? val(contrat.nom_complet) : null) ??
      paies.map((f) => val(f.nom_complet)).find((v) => v) ??
      b.avis.map((a) => val(a.nom_complet)).find((v) => v) ??
      b.bilans.map((bi) => val(bi.nom_complet)).find((v) => v) ??
      (b.kbis ? val(b.kbis.dirigeant_nom) : null) ??
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
    const b = parts[p];
    const { paies, contrat, identite } = b;
    if (!paies.length && !contrat && !identite && !aDocsIndependant(b)) continue;

    // Pièce d'identité (commune aux deux profils)
    items.push({
      personne: p,
      label: "Pièce d'identité",
      statut: identite ? "ok" : "manquant",
      detail: identite ? "présente" : "à uploader",
    });

    const estIndependant = !paies.length && !contrat && aDocsIndependant(b);
    if (estIndependant) {
      // Avis d'imposition : 2 années attendues
      const nAvis = b.avis.length;
      items.push({
        personne: p,
        label: "Avis d'imposition (2 dernières années)",
        statut: nAvis >= 2 ? "ok" : nAvis === 1 ? "partiel" : "manquant",
        detail: nAvis ? `${nAvis} avis fourni${nAvis > 1 ? "s" : ""} sur 2 attendus` : "à uploader",
      });
      // Bilan / comptes de résultat
      const nBil = b.bilans.length;
      items.push({
        personne: p,
        label: "Bilan / comptes de résultat",
        statut: nBil >= 2 ? "ok" : nBil === 1 ? "partiel" : "manquant",
        detail: nBil ? `${nBil} exercice${nBil > 1 ? "s" : ""} fourni${nBil > 1 ? "s" : ""}` : "à uploader",
      });
      // Extrait KBIS / immatriculation
      items.push({
        personne: p,
        label: "Extrait KBIS / immatriculation",
        statut: b.kbis ? "ok" : "manquant",
        detail: b.kbis ? "présent" : "à uploader (prouve l'ancienneté de l'entreprise)",
      });
      continue;
    }

    // --- Salarié ---
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
