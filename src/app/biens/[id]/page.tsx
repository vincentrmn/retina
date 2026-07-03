"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, STATUT_LABELS } from "@/lib/format";
import type { Score } from "@/lib/types";

type CandidatRow = {
  id: number;
  nom: string;
  statut: string;
  score: Score | null;
  analysed_at: string | null;
  nb_documents: number;
};

type BienDetail = {
  id: number;
  adresse: string;
  loyer: string;
  charges: string;
  criteres: any;
  candidats: CandidatRow[];
  error?: string;
};

function ScorePill({ score }: { score: Score | null }) {
  if (!score) return <span className="ds-pill">non analysé</span>;
  const color = score.eliminatoire ? "var(--ds-danger, #c0392b)" : score.total >= 75 ? "var(--green-ink)" : undefined;
  return (
    <span className="ds-pill ds-num" style={color ? { color, fontWeight: 700 } : { fontWeight: 700 }}>
      {score.total}/100{score.eliminatoire ? " · éliminatoire" : ""}
    </span>
  );
}

export default function BienPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [bien, setBien] = useState<BienDetail | null>(null);
  const [err, setErr] = useState("");
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
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

  if (err) return <div className="wrap ds-scope"><div className="ds-error">{err}</div></div>;
  if (!bien) return <div className="wrap ds-scope"><div className="ds-empty"><span className="ds-empty__hint">Chargement…</span></div></div>;

  const cout = Number(bien.loyer) + Number(bien.charges);
  const cr = bien.criteres ?? {};

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <h1 className="page-title">{bien.adresse}</h1>
        <div className="topbar-nav">
          <a className="ds-btn ds-btn--ghost" href={`/biens/${id}/edit`}>Modifier</a>
          <a className="ds-btn ds-btn--ghost" href="/">← Retour</a>
        </div>
      </div>

      <div className="ds-stats">
        <div className="ds-stat"><span className="ds-stat__k">Loyer</span><span className="ds-stat__v ds-num">{eur(bien.loyer)}</span></div>
        <div className="ds-stat"><span className="ds-stat__k">Charges</span><span className="ds-stat__v ds-num">{eur(bien.charges)}</span></div>
        <div className="ds-stat"><span className="ds-stat__k">Revenus nets exigés</span><span className="ds-stat__v ds-num">≥ {eur(cout * (cr.ratioMin ?? 3))}</span></div>
        <div className="ds-stat"><span className="ds-stat__k">Critères</span><span className="ds-stat__v" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
          {[
            `ratio ≥ ${cr.ratioMin ?? 3}×${cr.ratioEliminatoire ? " (élim.)" : ""}`,
            cr.cdiRequis ? "CDI exigé" : null,
            cr.cddAccepte ? "CDD acceptés" : "CDD pénalisés",
            cr.essaiEliminatoire ? "essai élim." : null,
            cr.ancienneteMinMois > 0 ? `ancienneté ≥ ${cr.ancienneteMinMois} mois` : null,
          ].filter(Boolean).join(" · ")}
        </span></div>
      </div>

      <div className="ds-section">
        <span className="ds-h2">Candidats{bien.candidats.length ? ` (${bien.candidats.length})` : ""}</span>
        <span className="ds-rule" />
      </div>

      <div className="ds-toolbar" style={{ marginBottom: 14 }}>
        <input
          className="ds-input"
          style={{ flex: 1, minWidth: 200 }}
          type="text"
          value={nom}
          placeholder="Ex : M. et Mme Dupont"
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouterCandidat()}
        />
        <button className="ds-btn ds-btn--primary" onClick={ajouterCandidat} disabled={busy || !nom.trim()}>
          + Ajouter un candidat
        </button>
      </div>

      {bien.candidats.length === 0 && (
        <div className="ds-empty"><span className="ds-empty__hint">Aucun candidat pour ce bien. Ajoute un dossier ci-dessus, puis uploade ses documents.</span></div>
      )}

      {bien.candidats.map((c, i) => (
        <a className="ds-row" key={c.id} href={`/candidats/${c.id}`}>
          <div className="ds-row__main">
            <div className="ds-row__title">
              {c.score ? `${i + 1}. ` : ""}{c.nom}
            </div>
            <div className="ds-row__sub">
              {STATUT_LABELS[c.statut] ?? c.statut} · {c.nb_documents} document{c.nb_documents > 1 ? "s" : ""}
              {c.score?.ratio != null ? ` · revenus ${c.score.ratio}× le coût` : ""}
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
