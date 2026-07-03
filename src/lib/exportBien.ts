import { normalizeCriteres, type Bien, type Candidat, type Personne } from "./types";

/**
 * Export PDF de l'analyse d'un bien : page de garde (récap du bien + critères),
 * classement des candidats, puis une fiche détaillée par candidat (score,
 * synthèse A/B, contrôles de cohérence). Génération côté navigateur (imports
 * dynamiques). Logo Brouwers rasterisé depuis le SVG. Inspiré de Vesper.
 */

type CandidatComplet = Candidat & { synthese: any[] | null; coherence: any[] | null };

const INK: [number, number, number] = [17, 17, 17];
const SOFT: [number, number, number] = [107, 114, 112];
const GREEN: [number, number, number] = [7, 135, 95];
const RED: [number, number, number] = [179, 38, 30];
const LINE: [number, number, number] = [230, 232, 231];
const SUBTLE: [number, number, number] = [246, 248, 247];

const eur = (n: number | null | undefined) =>
  n == null || !isFinite(Number(n)) ? "-" : Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
/**
 * La police par défaut de jsPDF (Helvetica) n'encode QUE le jeu WinAnsi (CP1252).
 * Tout caractère hors de ce jeu n'est pas seulement absent : il casse le rendu de
 * TOUTE la ligne (espacement des lettres déréglé). Or les textes produits par le
 * modèle (français) contiennent des caractères invisibles dans le navigateur mais
 * absents de WinAnsi : espace fine insécable (U+202F), espace fine (U+2009),
 * trait d'union insécable (U+2011), flèches, ≥ ≈, etc.
 *
 * `S()` garantit qu'aucun caractère hors WinAnsi n'atteint le PDF : on garde les
 * caractères sûrs (dont les accents et « » € œ), on remplace les cas connus par un
 * équivalent lisible, et on translittère/retire le reste. Filet de sécurité ultime :
 * plus jamais de ligne cassée, quoi que renvoie l'extraction.
 */
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const inWinAnsi = (cp: number) => cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff) || WINANSI_EXTRA.has(cp);
const REMAP: Record<number, string> = {
  // Espaces exotiques -> espace normale
  0x00a0: " ", 0x2000: " ", 0x2001: " ", 0x2002: " ", 0x2003: " ", 0x2004: " ",
  0x2005: " ", 0x2006: " ", 0x2007: " ", 0x2008: " ", 0x2009: " ", 0x200a: " ",
  0x202f: " ", 0x205f: " ", 0x3000: " ", 0x200b: "", 0xfeff: "",
  // Tirets / traits d'union -> -
  0x2010: "-", 0x2011: "-", 0x2012: "-", 0x2015: "-", 0x2212: "-", 0x2043: "-",
  // Symboles maths / flèches -> ASCII lisible
  0x2192: "->", 0x2190: "<-", 0x2194: "<->", 0x21d2: "=>", 0x2265: "min.",
  0x2264: "max.", 0x2260: "!=", 0x2248: "~", 0x00d7: "x", 0x2717: "x",
  0x2713: "OK", 0x2714: "OK", 0x2217: "*", 0x2219: "-",
};
const S = (v: any): string => {
  const s = String(v ?? "").normalize("NFC");
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (inWinAnsi(cp)) { out += ch; continue; }
    if (cp in REMAP) { out += REMAP[cp]; continue; }
    // Dernier recours : décomposer (retire les diacritiques exotiques) et ne garder
    // que ce qui est représentable ; sinon on laisse tomber le caractère.
    const dec = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    for (const d of dec) { const c = d.codePointAt(0)!; if (inWinAnsi(c)) out += d; }
  }
  // Pas d'espace avant/après un « / », puis on écrase les espaces multiples.
  return out.replace(/ *\/ */g, "/").replace(/ {2,}/g, " ");
};
const CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", interim: "Intérim", independant: "Indépendant", autre: "Autre" };
const dateFr = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("fr-FR");
};
const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "retina";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const img = await loadImage("/brouwers-logo.svg");
    if (!img) return null;
    const w = img.naturalWidth || 107, h = img.naturalHeight || 45;
    const scale = 6;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), ratio: w / h };
  } catch {
    return null;
  }
}

function criteresLignes(raw: any): string[] {
  const cr = normalizeCriteres(raw);
  return [
    cr.ratioActif
      ? `Revenus nets du ménage exigés : au moins ${cr.ratioMin} fois le loyer et les charges${cr.ratioEliminatoire ? " (éliminatoire)" : ""}.`
      : "Aucune exigence de revenus sur ce bien.",
    cr.cdiActif ? `Au moins un CDI exigé dans le ménage${cr.cdiEliminatoire ? " (éliminatoire)" : ""}.` : "Pas d'exigence de CDI.",
    cr.cddAccepte ? "Les CDD sont acceptés comme revenu stable." : "Les CDD sont fortement pénalisés.",
    cr.essaiActif
      ? `Période d'essai prise en compte${cr.essaiEliminatoire ? " (éliminatoire si tout le ménage est en essai)" : ""}.`
      : "Période d'essai non prise en compte.",
    cr.ancienneteActif && cr.ancienneteMinMois > 0 ? `Ancienneté minimale exigée : ${cr.ancienneteMinMois} mois.` : "Pas d'ancienneté minimale exigée.",
  ];
}

export async function exportBienPdf(bien: Bien, candidats: CandidatComplet[]) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Filet de sécurité global : on assainit TOUT texte dessiné, y compris les
  // cellules rendues en interne par autotable. Ainsi aucun caractère hors WinAnsi
  // (espaces fines, flèches, tirets exotiques du texte extrait) ne peut casser une
  // ligne, même si on oublie un S() quelque part.
  const _text = (doc as any).text.bind(doc);
  (doc as any).text = (txt: any, ...rest: any[]) =>
    _text(Array.isArray(txt) ? txt.map(S) : S(txt), ...rest);

  const W = 182;
  const PW = 210;
  const bold = () => doc.setFont("helvetica", "bold");
  const reg = () => doc.setFont("helvetica", "normal");

  // --- En-tête ---
  let y = 13;
  const logo = await loadLogo();
  if (logo) {
    const lh = 12, lw = lh * logo.ratio;
    try { doc.addImage(logo.dataUrl, "PNG", 14, y, lw, lh); } catch {}
  }
  doc.setFontSize(8.5); doc.setTextColor(...SOFT); reg();
  doc.text(`Analyse générée le ${new Date().toLocaleDateString("fr-FR")}`, PW - 14, y + 4, { align: "right" });
  doc.text("RETINA - analyse de candidats à la location", PW - 14, y + 9, { align: "right" });

  y += 24;
  doc.setTextColor(...INK); bold(); doc.setFontSize(17);
  doc.text("Analyse du bien", 14, y);
  y += 8;
  doc.setFontSize(12); reg(); doc.setTextColor(...SOFT);
  doc.text(bien.adresse, 14, y);
  y += 9;

  // --- Récap KPI ---
  const cout = Number(bien.loyer) + Number(bien.charges);
  const kpis: [string, string][] = [
    ["Loyer", eur(bien.loyer)],
    ["Charges", eur(bien.charges)],
    ["Coût mensuel", eur(cout)],
    ["Revenus exigés", `min. ${eur(cout * (bien.criteres?.ratioMin ?? 3))}`],
  ];
  const kw = W / kpis.length;
  kpis.forEach(([k, v], i) => {
    const x = 14 + i * kw;
    doc.setDrawColor(...LINE); doc.setFillColor(...SUBTLE);
    doc.roundedRect(x, y, kw - 4, 18, 2, 2, "FD");
    doc.setTextColor(...SOFT); reg(); doc.setFontSize(7.5);
    doc.text(k.toUpperCase(), x + 4, y + 6);
    doc.setTextColor(...INK); bold(); doc.setFontSize(12);
    doc.text(v, x + 4, y + 13.5);
  });
  y += 25;

  // --- Critères d'éligibilité (bullets) ---
  doc.setTextColor(...INK); bold(); doc.setFontSize(11);
  doc.text("Critères d'éligibilité du bien", 14, y);
  y += 6;
  doc.setFontSize(9.5); reg(); doc.setTextColor(...INK);
  for (const ligne of criteresLignes(bien.criteres ?? {})) {
    doc.setTextColor(...GREEN); doc.text("•", 15, y);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(ligne, W - 6);
    doc.text(lines, 19, y);
    y += lines.length * 5 + 1.5;
  }
  y += 4;

  // --- Classement des candidats ---
  const classés = [...candidats].sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));
  doc.setTextColor(...INK); bold(); doc.setFontSize(11);
  doc.text("Classement des candidats", 14, y);
  y += 3;
  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Candidat", "Score", "Revenus ménage", "Ratio", "Statut"]],
    body: classés.map((c, i) => [
      c.score ? String(i + 1) : "-",
      S(c.nom),
      c.score ? `${c.score.total}/100${c.score.eliminatoire ? " (élim.)" : ""}` : "non analysé",
      c.score?.revenusMenage ? eur(c.score.revenusMenage) : "-",
      c.score?.ratio != null ? `${c.score.ratio}x` : "-",
      c.statut === "analyse" ? "Analysé" : c.statut === "erreur_document" ? "Erreur document" : "En attente",
    ]),
    styles: { fontSize: 9, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: [17, 17, 17], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: SUBTLE },
    columnStyles: { 0: { cellWidth: 10, halign: "center" }, 2: { fontStyle: "bold" } },
    margin: { left: 14, right: 14 },
  });

  // --- Une fiche par candidat (toutes, même non analysées) ---
  for (const c of classés) {
   try {
    doc.addPage();
    y = 16;
    doc.setTextColor(...INK); bold(); doc.setFontSize(14);
    doc.text(S(c.nom || "Candidat sans nom"), 14, y);
    if (c.score) {
      const col = c.score.eliminatoire ? RED : GREEN;
      doc.setTextColor(...col); doc.setFontSize(14);
      doc.text(`${c.score.total}/100`, PW - 14, y, { align: "right" });
    } else {
      doc.setTextColor(...SOFT); reg(); doc.setFontSize(10);
      doc.text("non analysé", PW - 14, y, { align: "right" });
    }
    y += 4;
    doc.setDrawColor(...LINE); doc.line(14, y, PW - 14, y);
    y += 8;

    if (!c.score && !(c.synthese && c.synthese.length)) {
      doc.setTextColor(...SOFT); reg(); doc.setFontSize(9.5);
      doc.text(doc.splitTextToSize("Ce candidat n'a pas encore été analysé, ou ses documents ne permettent pas d'établir une fiche détaillée.", W), 14, y);
      continue;
    }

    // Score détaillé
    if (c.score) {
      doc.setTextColor(...INK); bold(); doc.setFontSize(10.5);
      doc.text("Score d'éligibilité", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 2,
        head: [["Critère", "Note", "Explication"]],
        body: c.score.criteres.map((cr) => [S(cr.label) + (cr.eliminatoire ? " (éliminatoire)" : ""), `${cr.points}/${cr.max}`, S(cr.detail)]),
        styles: { fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: 0.1, valign: "top" },
        headStyles: { fillColor: SUBTLE, textColor: SOFT, fontStyle: "bold", fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 48, fontStyle: "bold" }, 1: { cellWidth: 16, halign: "center", fontStyle: "bold" } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Fiche signalétique A/B
    const personnes: Personne[] = ["A", "B"];
    for (const p of personnes) {
      const s = (c.synthese ?? []).find((x: any) => x.personne === p);
      if (!s) continue;
      if (y > 250) { doc.addPage(); y = 16; }
      const nom = s.identite && (s.identite.prenom || s.identite.nom) ? [s.identite.prenom, s.identite.nom].filter(Boolean).join(" ") : null;
      doc.setTextColor(...INK); bold(); doc.setFontSize(10);
      doc.text(`Personne ${p}${nom ? " · " + nom : ""}`, 14, y);
      y += 2;
      const e: any = s.emploi ?? {};
      autoTable(doc, {
        startY: y + 2,
        body: [
          ["Date de naissance", dateFr(s.identite?.date_naissance)],
          ["Salaire net mensuel", e.salaire_net_mensuel != null ? `${eur(e.salaire_net_mensuel)} (moyenne de ${e.nbBulletins ?? 0} bulletin(s))` : "-"],
          ["Poste", S(e.intitule_poste ?? "-")],
          ["Type de contrat", e.type_contrat ? CONTRAT[e.type_contrat] ?? e.type_contrat : "-"],
          ["Période d'essai", e.periode_essai == null ? "-" : e.periode_essai ? `oui${e.fin_periode_essai ? ", jusqu'au " + dateFr(e.fin_periode_essai) : ""}` : "non"],
          ["Employeur", S(e.employeur ?? "-")],
          ["Dans l'entreprise depuis", e.date_entree ? `${dateFr(e.date_entree)}${e.ancienneteMois != null ? ` (${e.ancienneteMois} mois)` : ""}` : "-"],
        ],
        styles: { fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
        columnStyles: { 0: { cellWidth: 55, textColor: SOFT }, 1: { fontStyle: "bold" } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Contrôles de cohérence
    if (c.coherence && c.coherence.length) {
      if (y > 250) { doc.addPage(); y = 16; }
      doc.setTextColor(...INK); bold(); doc.setFontSize(10);
      doc.text("Contrôles de cohérence", 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 2,
        body: c.coherence.map((ch: any) => {
          // Une incohérence validée à la main (ignored) est considérée comme OK.
          const resolved = ch.ok || ch.ignored;
          const detail = !ch.ok && ch.ignored ? `${ch.detail} Validé à la main : sans effet sur la note.` : ch.detail;
          return [resolved ? "OK" : "!", S(`${ch.personne} · ${ch.check}`), S(detail)];
        }),
        styles: { fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.1, valign: "top" },
        columnStyles: { 0: { cellWidth: 10, halign: "center", fontStyle: "bold" }, 1: { cellWidth: 55, fontStyle: "bold" } },
        didParseCell: (data: any) => {
          if (data.column.index === 0 && data.cell.raw === "!") data.cell.styles.textColor = RED;
          if (data.column.index === 0 && data.cell.raw === "OK") data.cell.styles.textColor = GREEN;
        },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
   } catch (e) {
     // Un candidat au format inattendu ne doit jamais empêcher le téléchargement du PDF.
     doc.setTextColor(...SOFT); reg(); doc.setFontSize(9);
     doc.text("Fiche indisponible pour ce candidat.", 14, y + 6);
   }
  }

  // Fiche signalétique : appliquer S() sur les valeurs texte est inutile (déjà propre),
  // mais le nom du candidat et les libellés passent par S() ci-dessus.

  // Pied de page sur toutes les pages
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setTextColor(...SOFT); reg();
    doc.text(`RETINA - ${bien.adresse}`, 14, 290);
    doc.text(`${i} / ${pages}`, PW - 14, 290, { align: "right" });
  }

  doc.save(`RETINA_${safeName(bien.adresse)}.pdf`);
}
