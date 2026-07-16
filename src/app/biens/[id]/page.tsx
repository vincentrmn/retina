"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, STATUT_LABELS } from "@/lib/format";
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
};

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

function criteresLignes(raw: any): string[] {
  const cr = normalizeCriteres(raw);
  return [
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
}

export default function BienPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [bien, setBien] = useState<BienDetail | null>(null);
  const [err, setErr] = useState("");
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const b = await fetch(`/api/biens/${id}`).then((x) => x.json());
    if (b.error) setErr(b.error);
    else setBien(b);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
    setExporting(true);
    try {
      // On récupère la fiche complète de chaque candidat (synthèse + cohérence)
      // pour l'inclure dans le PDF.
      const complets = await Promise.all(
        bien.candidats.map((c) => fetch(`/api/candidats/${c.id}`).then((r) => r.json()))
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

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <h1 className="page-title">{bien.adresse}</h1>
        <div className="topbar-nav">
          <button className="ds-btn ds-btn--secondary" onClick={exporterPdf} disabled={exporting || nbAnalyses === 0}>
            {exporting ? "Export…" : "Exporter en PDF"}
          </button>
          <a className="ds-btn ds-btn--ghost" href={`/biens/${id}/edit`}>Modifier</a>
          <a className="ds-btn ds-btn--ghost" href="/">← Accueil</a>
        </div>
      </div>

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
      {!nom.trim() && (
        <p className="ds-hint" style={{ marginTop: -6, marginBottom: 14 }}>
          Saisissez le nom du dossier (un couple ou une personne seule) pour créer le candidat, puis vous déposerez ses documents.
        </p>
      )}

      {bien.candidats.length === 0 && (
        <div className="ds-empty"><span className="ds-empty__hint">Aucun candidat pour ce bien. Ajoutez un dossier ci-dessus, puis déposez ses documents pour lancer l&apos;analyse.</span></div>
      )}

      {bien.candidats.map((c, i) => (
        <a className="ds-row" key={c.id} href={`/candidats/${c.id}`}>
          <div className="ds-row__main">
            <div className="ds-row__title">
              {c.score ? `${i + 1}. ` : ""}{c.nom}
            </div>
            <div className="ds-row__sub">
              {STATUT_LABELS[c.statut] ?? c.statut} · {c.nb_documents} document{c.nb_documents > 1 ? "s" : ""}
              {c.source === "tally" ? " · candidature en ligne" : ""}
              {c.email ? ` · ${c.email}` : ""}
              {c.score?.ratio != null ? ` · revenus ${c.score.ratio} fois le coût du logement` : ""}
              {c.score?.eliminatoire ? (
                <span style={{ color: "#b3261e", fontWeight: 600 }}>
                  {" · éliminé sur : "}
                  {c.score.criteres.filter((cr) => cr.eliminatoire).map((cr) => cr.label.toLowerCase()).join(", ")}
                </span>
              ) : ""}
            </div>
          </div>
          <div className="ds-row__actions">
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
