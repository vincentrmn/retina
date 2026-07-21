"use client";
import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/format";
import { normalizeCriteres, type Score } from "@/lib/types";

type CandidatRow = {
  id: number;
  nom: string;
  statut: string;
  score: Score | null;
  analysed_at: string | null;
  nb_documents: number;
  source: string | null;
  email: string | null;
  suivi: SuiviKey | null;
  discr_pct: number | null;
};

/** Statuts de suivi de Shawna, dans l'ordre du parcours d'un dossier. */
type SuiviKey = "contacte" | "visite" | "dossier_depose" | "ko";
const SUIVIS: { key: SuiviKey; label: string; fg: string; bg: string; border: string }[] = [
  { key: "contacte", label: "Contacté", fg: "#6d28d9", bg: "#f3ebff", border: "#c9b3f5" }, // mauve
  { key: "visite", label: "Visite", fg: "#1d4ed8", bg: "#e6efff", border: "#aecbfa" }, // bleu
  { key: "dossier_depose", label: "Dossier déposé", fg: "#07875f", bg: "#e3f7f0", border: "#9fe0c9" }, // vert
  { key: "ko", label: "KO", fg: "#b3261e", bg: "#fbeaea", border: "#f2b8b5" }, // rouge
];

type BienDetail = {
  id: number;
  adresse: string;
  loyer: string;
  charges: string;
  criteres: any;
  candidats: CandidatRow[];
  nb_candidats: number;
  nb_analyses: number;
  tally_url: string | null;
  error?: string;
};

/** Couleur du score en un coup d'œil : rouge si éliminatoire/faible, vert si solide. */
function scoreStyle(score: Score | null): { bg: string; fg: string; label: string } {
  if (!score) return { bg: "var(--ds-bg-subtle)", fg: "var(--ds-ink-soft)", label: "non analysé" };
  const t = score.total;
  if (score.eliminatoire || t < 45) return { bg: "#fbeaea", fg: "#b3261e", label: `${t}/100` };
  if (t >= 70) return { bg: "#e3f7f0", fg: "#07875f", label: `${t}/100` };
  return { bg: "#fff4e0", fg: "#9a6700", label: `${t}/100` };
}

/** Icône PDF (document avec coin plié), pour le bouton d'export. */
function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6 2h8l4 4v16H6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 2v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8.5 16.5v-4h1.2a1.4 1.4 0 010 2.8H8.5M13 16.5v-4h1.6M13 14.4h1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScorePill({ score }: { score: Score | null }) {
  const s = scoreStyle(score);
  return (
    <span
      className="ds-pill ds-num"
      style={{ background: s.bg, color: s.fg, fontWeight: 700, border: "none" }}
    >
      {s.label}{score?.eliminatoire ? " · éliminatoire" : ""}
    </span>
  );
}

/** Statut du dossier en une pastille discrète accolée au nom. */
function StatutPill({ statut, score }: { statut: string; score: Score | null }) {
  const s =
    statut === "analyse_en_cours"
      ? { bg: "#fff4e0", fg: "#9a6700", label: "Analyse en cours…" }
      : score != null
      ? { bg: "#e3f7f0", fg: "#07875f", label: "Analysé" }
      : statut === "erreur_document"
      ? { bg: "#fbeaea", fg: "#b3261e", label: "Erreur document" }
      : { bg: "var(--ds-bg-subtle)", fg: "var(--ds-ink-soft)", label: "En attente" };
  return (
    <span
      className="ds-pill"
      style={{ background: s.bg, color: s.fg, border: "none", fontWeight: 600, marginLeft: 10, verticalAlign: "2px" }}
    >
      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: s.fg, marginRight: 6 }} />
      {s.label}
    </span>
  );
}

/** Un bouton-pastille de statut (géométrie figée, hauteur constante). */
function suiviPillStyle(actif: boolean, s: (typeof SUIVIS)[number]): CSSProperties {
  return {
    cursor: "pointer",
    height: 26,
    padding: "0 12px",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    whiteSpace: "nowrap",
    borderRadius: 999,
    fontWeight: 600,
    border: `1px solid ${actif ? s.border : "var(--ds-line-2, var(--ds-line))"}`,
    background: actif ? s.bg : "transparent",
    color: actif ? s.fg : "var(--ds-ink-soft)",
  };
}

/**
 * Suivi de Shawna : statut du dossier (appel, visite, dépôt, refus).
 * Tant qu'aucun statut n'est choisi, les 4 boutons gris s'affichent côte à côte.
 * Dès qu'on en clique un, il s'affiche SEUL (coloré) — les dossiers traités
 * s'alignent ainsi, plus lisibles. Recliquer sur le statut rouvre les 4 boutons
 * pour le corriger (recliquer sur le statut actif le retire). Aucun effet score.
 */
function SuiviControl({ suivi, onSet }: { suivi: SuiviKey | null; onSet: (v: SuiviKey | null) => void }) {
  const [editing, setEditing] = useState(false);
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const courant = SUIVIS.find((s) => s.key === suivi);
  const toutMontrer = suivi == null || editing;

  if (!toutMontrer && courant) {
    return (
      <button
        title="Cliquer pour modifier le statut de suivi"
        onClick={(e) => {
          stop(e);
          setEditing(true);
        }}
        style={suiviPillStyle(true, courant)}
      >
        {courant.label}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {SUIVIS.map((s) => {
        const actif = s.key === suivi;
        return (
          <button
            key={s.key}
            title={actif ? "Retirer ce statut" : `Marquer « ${s.label} »`}
            onClick={(e) => {
              stop(e);
              onSet(actif ? null : s.key); // recliquer l'actif = retirer le statut
              setEditing(false);
            }}
            style={suiviPillStyle(actif, s)}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function criteresLignes(raw: any): string[] {
  const cr = normalizeCriteres(raw);
  const lignes = [
    cr.ratioActif
      ? `Revenus nets du ménage exigés : au moins ${cr.ratioMin} fois le montant du loyer et des charges${cr.ratioEliminatoire ? " (critère éliminatoire)" : ""}.`
      : "Aucune exigence de revenus sur ce bien.",
    cr.cdiActif ? `Au moins un CDI est exigé dans le ménage${cr.cdiEliminatoire ? " (critère éliminatoire)" : ""}.` : "Aucune exigence de CDI.",
    cr.cddAccepte ? "Les CDD sont acceptés comme revenu stable." : "Les CDD sont fortement pénalisés.",
    cr.essaiActif
      ? cr.essaiEliminatoire
        ? "Une période d'essai en cours est éliminatoire lorsque tout le ménage est concerné."
        : "Une période d'essai en cours est pénalisante mais pas éliminatoire."
      : "Les périodes d'essai ne sont pas prises en compte.",
    cr.ancienneteActif && cr.ancienneteMinMois > 0 ? `Ancienneté minimale exigée dans l'entreprise : ${cr.ancienneteMinMois} mois.` : "Aucune ancienneté minimale exigée.",
  ];
  // Préférences discrétionnaires (recommandabilité), affichées seulement si actives.
  if (cr.discrCompositionActif) lignes.push(`Préférence de composition : ${cr.discrComposition === "seul" ? "une personne seule" : "un couple"} (recommandabilité).`);
  if (cr.discrSansAnimaux) lignes.push("Préférence : candidat sans animaux (recommandabilité).");
  if (cr.discrLongTerme) lignes.push("Préférence : location longue durée, 2 ans et plus (recommandabilité).");
  return lignes;
}

export default function BienPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [bien, setBien] = useState<BienDetail | null>(null);
  const [err, setErr] = useState("");
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  // Candidats DÉCOCHÉS pour l'export PDF (par défaut tous inclus). Set d'ids :
  // survit aux rechargements, un nouveau candidat est inclus d'office.
  const [exclus, setExclus] = useState<Set<number>>(new Set());
  const router = useRouter();

  const load = useCallback(async () => {
    const b = await fetch(`/api/biens/${id}`).then((x) => x.json());
    if (b.error) setErr(b.error);
    else setBien(b);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Une analyse tourne en arrière-plan (lancée ici ou par une candidature en
  // ligne) : on rafraîchit la liste jusqu'à ce qu'elle se termine.
  const enCours = bien?.candidats.some((c) => c.statut === "analyse_en_cours") ?? false;
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [enCours, load]);

  // Bascule optimiste : l'état change à l'écran immédiatement, la sauvegarde
  // part en arrière-plan (retour en arrière silencieux si elle échoue).
  async function setSuivi(c: CandidatRow, valeur: SuiviKey | null) {
    const poser = (v: SuiviKey | null) =>
      setBien((prev) =>
        prev ? { ...prev, candidats: prev.candidats.map((x) => (x.id === c.id ? { ...x, suivi: v } : x)) } : prev
      );
    const avant = c.suivi;
    poser(valeur);
    const res = await fetch(`/api/candidats/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suivi: valeur }),
    }).catch(() => null);
    if (!res || !res.ok) poser(avant);
  }

  function toggleExport(cid: number) {
    setExclus((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  async function ajouterCandidat() {
    if (!nom.trim()) return;
    setBusy(true);
    const res = await fetch("/api/candidats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bienId: id, nom: nom.trim() }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.id) router.push(`/candidats/${data.id}`);
    else setErr(data.error || "Erreur");
  }

  async function supprimerCandidat(cid: number) {
    if (!confirm("Supprimer ce dossier candidat et tous ses documents ?")) return;
    await fetch(`/api/candidats/${cid}`, { method: "DELETE" });
    load();
  }

  async function exporterPdf() {
    if (!bien) return;
    // Seulement les candidats cochés (Shawna exclut les mauvaises notes).
    const aExporter = bien.candidats.filter((c) => !exclus.has(c.id));
    if (!aExporter.length) return;
    setExporting(true);
    try {
      // On récupère la fiche complète de chaque candidat retenu (synthèse +
      // cohérence) pour l'inclure dans le PDF.
      const complets = await Promise.all(
        aExporter.map((c) => fetch(`/api/candidats/${c.id}`).then((r) => r.json()))
      );
      const { exportBienPdf } = await import("@/lib/exportBien");
      await exportBienPdf(bien as any, complets as any);
    } catch (e: any) {
      setErr("Export PDF impossible : " + (e?.message ?? e));
    } finally {
      setExporting(false);
    }
  }

  if (err) return <div className="wrap ds-scope"><div className="ds-error">{err}</div></div>;
  if (!bien) return <div className="wrap ds-scope"><div className="ds-empty"><span className="ds-empty__hint">Chargement…</span></div></div>;

  const cout = Number(bien.loyer) + Number(bien.charges);
  const cr = bien.criteres ?? {};
  const nbAnalyses = bien.candidats.filter((c) => c.score != null).length;
  const nbExport = bien.candidats.filter((c) => !exclus.has(c.id)).length;

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar topbar--split">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <div className="topbar-nav">
          <button
            className="ds-btn ds-btn--secondary"
            onClick={exporterPdf}
            disabled={exporting || nbAnalyses === 0 || nbExport === 0}
            title={nbExport === 0 ? "Cochez au moins un candidat à exporter" : "Exporter les candidats cochés en PDF"}
          >
            <PdfIcon /> {exporting ? "Export…" : nbExport < bien.candidats.length ? `Exporter (${nbExport})` : "Exporter"}
          </button>
          <a className="ds-btn ds-btn--ghost" href={`/biens/${id}/edit`}>Modifier</a>
          <a className="ds-btn ds-btn--ghost" href="/">← Accueil</a>
        </div>
      </div>
      <h1 className="page-title-lg">{bien.adresse}</h1>

      <div className="ds-stats">
        <div className="ds-stat"><span className="ds-stat__k">Loyer</span><span className="ds-stat__v ds-num">{eur(bien.loyer)}</span></div>
        <div className="ds-stat"><span className="ds-stat__k">Charges</span><span className="ds-stat__v ds-num">{eur(bien.charges)}</span></div>
        <div className="ds-stat"><span className="ds-stat__k">Coût mensuel</span><span className="ds-stat__v ds-num">{eur(cout)}</span></div>
        <div className="ds-stat"><span className="ds-stat__k">Revenus nets exigés</span><span className="ds-stat__v ds-num">≥ {eur(cout * (cr.ratioMin ?? 3))}</span></div>
      </div>

      {/* Critères en vrais bullet points */}
      <div className="ds-card" style={{ marginTop: 14 }}>
        <div className="ds-card__head">Critères d&apos;éligibilité du bien</div>
        <div className="ds-card__body">
          <ul className="ds-bullets">
            {criteresLignes(cr).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Lien de candidature en ligne (formulaire Tally rattaché à ce bien) */}
      {bien.tally_url && (
        <div className="ds-card" style={{ marginTop: 14 }}>
          <div className="ds-card__head">Candidature en ligne</div>
          <div className="ds-card__body">
            <p className="ds-hint" style={{ marginTop: 0, marginBottom: 14 }}>
              Envoyez ce lien aux candidats intéressés par ce bien : ils remplissent leurs coordonnées et déposent
              leurs documents eux-mêmes. Le dossier apparaît ici automatiquement, déjà analysé.
            </p>
            <div className="ds-toolbar">
              <input className="ds-input" style={{ flex: 1, minWidth: 200 }} type="text" readOnly value={bien.tally_url} onFocus={(e) => e.target.select()} />
              <button
                className="ds-btn ds-btn--secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(bien.tally_url!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copié !" : "Copier le lien"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ds-section">
        <span className="ds-h2">Candidats{bien.candidats.length ? ` (${bien.candidats.length}, dont ${nbAnalyses} analysé${nbAnalyses > 1 ? "s" : ""})` : ""}</span>
        <span className="ds-rule" />
      </div>

      <p className="ds-hint" style={{ marginTop: 0, marginBottom: 8 }}>
        Saisissez le nom du dossier (un couple ou une personne seule) pour créer le candidat, puis vous déposerez ses documents.
      </p>
      <div className="ds-toolbar" style={{ marginBottom: 14 }}>
        <input
          className="ds-input"
          style={{ flex: 1, minWidth: 200 }}
          type="text"
          value={nom}
          placeholder="Nom du candidat, par exemple : M. et Mme Dupont"
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouterCandidat()}
        />
        <button className="ds-btn ds-btn--primary" onClick={ajouterCandidat} disabled={busy || !nom.trim()}>
          + Ajouter ce candidat
        </button>
      </div>

      {bien.candidats.length === 0 && (
        <div className="ds-empty"><span className="ds-empty__hint">Aucun candidat pour ce bien. Ajoutez un dossier ci-dessus, puis déposez ses documents pour lancer l&apos;analyse.</span></div>
      )}

      {bien.candidats.length > 0 && (
        <p className="ds-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          Cochez à gauche les candidats à inclure dans l&apos;export PDF (tous cochés par défaut, décochez les dossiers à écarter).
        </p>
      )}

      {bien.candidats.map((c, i) => (
        <a className="ds-row" key={c.id} href={`/candidats/${c.id}`}>
          {/* Case d'inclusion dans l'export PDF (cochée par défaut). */}
          <input
            type="checkbox"
            checked={!exclus.has(c.id)}
            title={exclus.has(c.id) ? "Cliquer pour inclure ce candidat dans l'export PDF" : "Inclus dans l'export PDF (décocher pour l'exclure)"}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleExport(c.id)}
            style={{ width: 17, height: 17, flex: "0 0 auto", alignSelf: "center", marginRight: 12, cursor: "pointer", accentColor: "var(--ds-accent, #07875f)" }}
          />
          <div className="ds-row__main">
            <div className="ds-row__title">
              {c.score ? `${i + 1}. ` : ""}{c.nom}
              <StatutPill statut={c.statut} score={c.score} />
            </div>
            {c.score?.eliminatoire && (
              <div className="ds-row__sub" style={{ color: "#b3261e", fontWeight: 600 }}>
                Éliminé sur : {c.score.criteres.filter((cr) => cr.eliminatoire).map((cr) => cr.label.toLowerCase()).join(", ")}
              </div>
            )}
            {/* Statut de suivi (4 boutons ou pastille seule). display:flex pour
                détacher de la ligne de base du texte au-dessus. */}
            <div style={{ marginTop: 6, display: "flex" }}>
              <SuiviControl suivi={c.suivi} onSet={(v) => setSuivi(c, v)} />
            </div>
          </div>
          <div className="ds-row__actions">
            {c.discr_pct != null && (
              <span className="discr-pill" title="Recommandabilité d'après les réponses au questionnaire">
                ♥ {c.discr_pct}%
              </span>
            )}
            <ScorePill score={c.score} />
            <button
              className="ds-btn ds-btn--danger ds-btn--sm"
              title="Supprimer ce candidat"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                supprimerCandidat(c.id);
              }}
            >✕</button>
          </div>
        </a>
      ))}
    </div>
  );
}
