import type { Bien, Candidat, Personne } from "./types";

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
/** La police par défaut de jsPDF (Helvetica/WinAnsi) ne connaît pas ≥ × ≈ — : on les remplace. */
const S = (v: any) =>
  String(v ?? "")
    .replace(/≥/g, "min. ")
    .replace(/≤/g, "max. ")
    .replace(/[×✕]/g, "x")
    .replace(/≈/g, "~")
    .replace(/[—–]/g, "-");
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

function criteresLignes(cr: any): string[] {
  return [
    `Revenus nets du ménage exigés : au moins ${cr.ratioMin ?? 3} fois le loyer + charges${cr.ratioEliminatoire ? " (éliminatoire)" : ""}.`,
    cr.cdiRequis ? "Au moins un CDI exigé dans le ménage." : "Pas d'exigence de CDI.",
    cr.cddAccepte ? "Les CDD sont acceptés." : "Les CDD sont fortement pénalisés.",
    cr.essaiEliminatoire ? "Une période d'essai en cours est éliminatoire si tout le ménage est concerné." : "La période d'essai est pénalisante mais pas éliminatoire.",
    cr.ancienneteMinMois > 0 ? `Ancienneté minimale exigée : ${cr.ancienneteMinMois} mois.` : "Pas d'ancienneté minimale exigée.",
  ];
}

export async function exportBienPdf(bien: Bien, candidats: CandidatComplet[]) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
      c.nom,
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

  // --- Une fiche par candidat ---
  for (const c of classés) {
    if (!c.score && !c.synthese) continue;
    doc.addPage();
    y = 16;
    doc.setTextColor(...INK); bold(); doc.setFontSize(14);
    doc.text(c.nom, 14, y);
    if (c.score) {
      const col = c.score.eliminatoire ? RED : GREEN;
      doc.setTextColor(...col); doc.setFontSize(14);
      doc.text(`${c.score.total}/100`, PW - 14, y, { align: "right" });
    }
    y += 4;
    doc.setDrawColor(...LINE); doc.line(14, y, PW - 14, y);
    y += 8;

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
          ["Poste", e.intitule_poste ?? "-"],
          ["Type de contrat", e.type_contrat ? CONTRAT[e.type_contrat] ?? e.type_contrat : "-"],
          ["Période d'essai", e.periode_essai == null ? "-" : e.periode_essai ? `oui${e.fin_periode_essai ? ", jusqu'au " + dateFr(e.fin_periode_essai) : ""}` : "non"],
          ["Employeur", e.employeur ?? "-"],
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
        body: c.coherence.map((ch: any) => [ch.ok ? "OK" : "!", S(`${ch.personne} · ${ch.check}`), S(ch.detail)]),
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
  }

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
