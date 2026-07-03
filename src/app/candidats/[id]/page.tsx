"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTRAT_LABELS, DOC_TYPE_LABELS, STATUT_LABELS, dateFr, eur } from "@/lib/format";
import type { CoherenceCheck, DocumentMeta, Personne, Score, SynthesePersonne } from "@/lib/types";

type CandidatDetail = {
  id: number;
  bien_id: number;
  nom: string;
  statut: string;
  synthese: SynthesePersonne[] | null;
  coherence: CoherenceCheck[] | null;
  score: Score | null;
  analysed_at: string | null;
  adresse: string;
  loyer: string;
  charges: string;
  criteres: any;
  documents: DocumentMeta[];
  error?: string;
};

function Kv({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className="ds-kv">
      <span className="ds-kv__k">{k}</span>
      <span className="ds-kv__v" style={warn ? { color: "#b3261e", fontWeight: 600 } : undefined}>{v}</span>
    </div>
  );
}

function DocStatus({ d }: { d: DocumentMeta }) {
  if (d.extraction_status === "done") return <span className="ds-dot" title="Extrait" />;
  if (d.extraction_status === "error")
    return <span className="ds-dot ds-dot--warn" title={d.extraction_error ?? "Erreur d'extraction"} />;
  return <span className="ds-dot ds-dot--low" title="En attente d'analyse" />;
}

function UploadZone({ candidatId, personne, onDone }: { candidatId: number; personne: Personne; onDone: () => void }) {
  const [type, setType] = useState("fiche_paie");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setErr("");
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("candidatId", String(candidatId));
      fd.set("personne", personne);
      fd.set("type", type);
      fd.set("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(`${file.name} : ${data.error || "erreur d'upload"}`);
        break;
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    onDone();
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="ds-toolbar" style={{ padding: 8 }}>
        <select className="ds-select" style={{ maxWidth: 190 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="fiche_paie">Fiche de paie</option>
          <option value="contrat">Contrat de travail</option>
          <option value="piece_identite">Pièce d&apos;identité</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          className="upload-file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
        />
        {busy && <span className="ds-spinner" />}
      </div>
      {err && <div className="ds-error" style={{ marginTop: 8 }}>{err}</div>}
      <p className="ds-hint">PDF ou photo (JPEG/PNG/WebP), 15 Mo max. Idéalement les 3 derniers bulletins + contrat + pièce d&apos;identité.</p>
    </div>
  );
}

export default function CandidatPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [cand, setCand] = useState<CandidatDetail | null>(null);
  const [err, setErr] = useState("");
  const [analysing, setAnalysing] = useState(false);

  const load = useCallback(async () => {
    const c = await fetch(`/api/candidats/${id}`).then((x) => x.json());
    if (c.error) setErr(c.error);
    else setCand(c);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function analyser(force: boolean) {
    setAnalysing(true);
    setErr("");
    try {
      const res = await fetch(`/api/candidats/${id}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error || "Erreur pendant l'analyse");
      await load();
    } finally {
      setAnalysing(false);
    }
  }

  async function supprimerDoc(docId: number) {
    if (!confirm("Supprimer ce document ?")) return;
    await fetch(`/api/documents?id=${docId}`, { method: "DELETE" });
    load();
  }

  if (err && !cand) return <div className="wrap ds-scope"><div className="ds-error">{err}</div></div>;
  if (!cand) return <div className="wrap ds-scope"><div className="ds-empty"><span className="ds-empty__hint">Chargement…</span></div></div>;

  const personnes: Personne[] = ["A", "B"];
  const docsDe = (p: Personne) => cand.documents.filter((d) => d.personne === p);
  const nbDocs = cand.documents.length;
  const dejaExtraits = cand.documents.filter((d) => d.extraction_status === "done").length;
  const syntheseDe = (p: Personne) => cand.synthese?.find((s) => s.personne === p) ?? null;

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <h1 className="page-title">{cand.nom}</h1>
        <div className="topbar-nav">
          <a className="ds-btn ds-btn--ghost" href={`/biens/${cand.bien_id}`}>← {cand.adresse}</a>
        </div>
      </div>

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      <div className="ds-section" style={{ marginTop: 0 }}>
        <span className="ds-h2">Documents du dossier</span>
        <span className="ds-rule" />
        <button className="ds-btn ds-btn--primary" onClick={() => analyser(false)} disabled={analysing || nbDocs === 0}>
          {analysing ? <>Analyse en cours… <span className="ds-spinner" /></> : dejaExtraits ? "Ré-analyser le dossier" : "Analyser le dossier"}
        </button>
      </div>
      {err && <div className="ds-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="ds-grid ds-grid--cards">
        {personnes.map((p) => (
          <div className="ds-card" key={p}>
            <div className="ds-card__head">Personne {p}{p === "B" ? " (laisser vide si candidat seul)" : ""}</div>
            <div className="ds-card__body">
              {docsDe(p).length === 0 && <p className="ds-muted" style={{ margin: 0 }}>Aucun document.</p>}
              {docsDe(p).map((d) => (
                <div className="ds-kv" key={d.id} style={{ alignItems: "center" }}>
                  <span className="ds-kv__k" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <DocStatus d={d} /> {DOC_TYPE_LABELS[d.type]}
                  </span>
                  <span className="ds-kv__v" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" title={d.filename}>
                      {d.filename.length > 28 ? d.filename.slice(0, 26) + "…" : d.filename}
                    </a>
                    <button className="ds-btn ds-btn--danger ds-btn--sm" title="Supprimer" onClick={() => supprimerDoc(d.id)}>✕</button>
                  </span>
                </div>
              ))}
              {docsDe(p)
                .filter((d) => (d.extraction as any)?.remarques)
                .map((d) => (
                  <p className="ds-hint" key={`rq-${d.id}`}>
                    <strong>{DOC_TYPE_LABELS[d.type]}</strong> — {(d.extraction as any).remarques}
                  </p>
                ))}
              {docsDe(p).some((d) => d.extraction_status === "error") && (
                <p className="ds-hint" style={{ color: "#b3261e" }}>
                  {docsDe(p).filter((d) => d.extraction_status === "error").map((d) => `${d.filename} : ${d.extraction_error}`).join(" · ")}
                </p>
              )}
              <UploadZone candidatId={cand.id} personne={p} onDone={load} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Score ─────────────────────────────────────────────────────────── */}
      {cand.score && (
        <>
          <div className="ds-section"><span className="ds-h2">Score d&apos;éligibilité</span><span className="ds-rule" />
            <span className="ds-muted" style={{ fontSize: "var(--ds-fs-sm)" }}>
              {STATUT_LABELS[cand.statut]} · {dateFr(cand.analysed_at)}
            </span>
          </div>
          <div className={`ds-card${cand.score.eliminatoire ? "" : " ds-card--accent"}`}>
            <div className="ds-card__body">
              <div className="ds-stats" style={{ marginBottom: 14 }}>
                <div className="ds-stat">
                  <span className="ds-stat__k">Score global</span>
                  <span className={`ds-stat__v ds-num${cand.score.eliminatoire ? "" : " ds-stat__v--accent"}`}
                    style={cand.score.eliminatoire ? { color: "#b3261e" } : undefined}>
                    {cand.score.total}/100{cand.score.eliminatoire ? " ⚠" : ""}
                  </span>
                </div>
                <div className="ds-stat"><span className="ds-stat__k">Revenus nets ménage</span><span className="ds-stat__v ds-num">{cand.score.revenusMenage ? eur(cand.score.revenusMenage) : "·"}</span></div>
                <div className="ds-stat"><span className="ds-stat__k">Ratio revenus / coût</span><span className="ds-stat__v ds-num">{cand.score.ratio != null ? `${cand.score.ratio}×` : "·"}</span></div>
                <div className="ds-stat"><span className="ds-stat__k">Coût mensuel</span><span className="ds-stat__v ds-num">{eur(Number(cand.loyer) + Number(cand.charges))}</span></div>
              </div>
              {cand.score.eliminatoire && (
                <div className="ds-error" style={{ marginBottom: 12 }}>
                  Critère éliminatoire déclenché : le score est plafonné à 40/100 (voir le détail ci-dessous).
                </div>
              )}
              {cand.score.criteres.map((c) => (
                <div className="ds-kv" key={c.key}>
                  <span className="ds-kv__k" style={c.eliminatoire ? { color: "#b3261e", fontWeight: 700 } : undefined}>
                    {c.label}{c.eliminatoire ? " — ÉLIMINATOIRE" : ""}
                  </span>
                  <span className="ds-kv__v">
                    <strong className="ds-num">{c.points}/{c.max}</strong>
                    <span className="ds-muted"> — {c.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Fiche signalétique ────────────────────────────────────────────── */}
      {cand.synthese && cand.synthese.length > 0 && (
        <>
          <div className="ds-section"><span className="ds-h2">Fiche signalétique</span><span className="ds-rule" /></div>
          <div className="ds-grid ds-grid--cards">
            {personnes.map((p) => {
              const s = syntheseDe(p);
              if (!s) return null;
              const e = s.emploi;
              return (
                <div className="ds-card" key={p}>
                  <div className="ds-card__head">
                    Personne {p}
                    {s.identite && (s.identite.prenom || s.identite.nom)
                      ? ` — ${[s.identite.prenom, s.identite.nom].filter(Boolean).join(" ")}`
                      : ""}
                  </div>
                  <div className="ds-card__body">
                    {s.identite && (
                      <>
                        <Kv k="Date de naissance" v={dateFr(s.identite.date_naissance)} warn={s.identite.aVerifier} />
                      </>
                    )}
                    {e && (
                      <>
                        <Kv k="Salaire net mensuel" v={e.salaire_net_mensuel != null ? `${eur(e.salaire_net_mensuel)} (moyenne de ${e.nbBulletins} bulletin${e.nbBulletins > 1 ? "s" : ""})` : "·"} />
                        <Kv k="Poste" v={e.intitule_poste ?? "·"} />
                        <Kv k="Contrat" v={e.type_contrat ? CONTRAT_LABELS[e.type_contrat] : "·"} />
                        <Kv
                          k="Période d'essai"
                          v={e.periode_essai == null ? "·" : e.periode_essai ? `oui${e.fin_periode_essai ? `, jusqu'au ${dateFr(e.fin_periode_essai)}` : ""}` : "non"}
                        />
                        <Kv k="Employeur" v={e.employeur ?? "·"} />
                        <Kv k="Dans l'entreprise depuis" v={e.date_entree ? `${dateFr(e.date_entree)}${e.ancienneteMois != null ? ` (${e.ancienneteMois} mois)` : ""}` : "·"} />
                        {e.aVerifier.length > 0 && (
                          <p className="ds-hint" style={{ color: "#9a6700" }}>À vérifier : {e.aVerifier.join(" · ")}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Cohérence ─────────────────────────────────────────────────────── */}
      {cand.coherence && cand.coherence.length > 0 && (
        <>
          <div className="ds-section"><span className="ds-h2">Contrôles de cohérence</span><span className="ds-rule" /></div>
          <div className="ds-card"><div className="ds-card__body">
            {cand.coherence.map((c, i) => (
              <div className="ds-kv" key={i}>
                <span className="ds-kv__k" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={`ds-dot${c.ok ? "" : " ds-dot--warn"}`} /> {c.personne} · {c.check}
                </span>
                <span className="ds-kv__v" style={c.ok ? undefined : { color: "#b3261e" }}>{c.detail}</span>
              </div>
            ))}
          </div></div>
        </>
      )}

      {cand.score && dejaExtraits > 0 && (
        <p className="ds-hint" style={{ marginTop: 18 }}>
          « Ré-analyser » ne relit que les documents ajoutés ou en erreur puis recalcule le score.{" "}
          <button className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => analyser(true)} disabled={analysing}>
            Tout ré-extraire
          </button>
        </p>
      )}
    </div>
  );
}
