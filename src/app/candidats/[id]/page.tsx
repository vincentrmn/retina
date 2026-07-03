"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTRAT_LABELS, DOC_TYPE_LABELS, STATUT_LABELS, dateFr, eur } from "@/lib/format";
import type { CoherenceCheck, CompletudeItem, DocumentMeta, Personne, Score, SynthesePersonne } from "@/lib/types";

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
  completude: CompletudeItem[] | null;
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

/**
 * Dépôt en batch : tous les documents d'un coup, sans choisir le type ni la
 * personne. L'analyse détecte le type de chaque document et le rattache à la
 * bonne personne via le nom extrait.
 */
function DropZone({ candidatId, onDone }: { candidatId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setBusy(true);
    setErr("");
    for (const file of list) {
      const fd = new FormData();
      fd.set("candidatId", String(candidatId));
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
    <div style={{ marginTop: 14 }}>
      <div
        className="dropzone"
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? (
          <span className="ds-muted">Envoi en cours… <span className="ds-spinner" /></span>
        ) : (
          <>
            <strong>Dépose ici tous les documents du dossier</strong>
            <span className="ds-muted">
              Bulletins, contrats, pièces d&apos;identité en vrac. PDF ou photos, 15 Mo max par fichier.
              L&apos;analyse détecte le type de chaque document et la personne concernée.
            </span>
            <span className="ds-btn ds-btn--secondary ds-btn--sm">Choisir des fichiers</span>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple
        hidden
        disabled={busy}
        onChange={(e) => upload(e.target.files)}
      />
      {err && <div className="ds-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  ...DOC_TYPE_LABELS,
  auto: "Type à déterminer",
  autre: "Non reconnu",
};

const COMPLETUDE_DOT: Record<CompletudeItem["statut"], string> = {
  ok: "ds-dot",
  partiel: "ds-dot ds-dot--low",
  manquant: "ds-dot ds-dot--warn",
};

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

  async function changerPersonne(d: DocumentMeta) {
    const personne = d.personne === "A" ? "B" : "A";
    await fetch("/api/documents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: d.id, personne }),
    });
    load();
  }

  if (err && !cand) return <div className="wrap ds-scope"><div className="ds-error">{err}</div></div>;
  if (!cand) return <div className="wrap ds-scope"><div className="ds-empty"><span className="ds-empty__hint">Chargement…</span></div></div>;

  const personnes: Personne[] = ["A", "B"];
  const nbDocs = cand.documents.length;
  const dejaExtraits = cand.documents.filter((d) => d.extraction_status === "done").length;
  const aAnalyser = cand.documents.some((d) => d.extraction_status !== "done");
  const syntheseDe = (p: Personne) => cand.synthese?.find((s) => s.personne === p) ?? null;
  const nomDe = (p: Personne) => {
    const s = syntheseDe(p);
    return s?.identite && (s.identite.prenom || s.identite.nom)
      ? [s.identite.prenom, s.identite.nom].filter(Boolean).join(" ")
      : null;
  };

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <h1 className="page-title">{cand.nom}</h1>
        <div className="topbar-nav">
          <a className="ds-btn ds-btn--ghost" href={`/biens/${cand.bien_id}`}>← Retour au bien</a>
        </div>
      </div>

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      <div className="ds-section" style={{ marginTop: 0 }}>
        <span className="ds-h2">Documents du dossier</span>
        <span className="ds-rule" />
        <button className="ds-btn ds-btn--primary" onClick={() => analyser(false)} disabled={analysing || nbDocs === 0}>
          {analysing ? <>Analyse en cours… <span className="ds-spinner" /></> : aAnalyser || !dejaExtraits ? "Analyser le dossier" : "Recalculer le score"}
        </button>
      </div>
      {err && <div className="ds-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="ds-card"><div className="ds-card__body">
        {cand.documents.length === 0 && <p className="ds-muted" style={{ margin: 0 }}>Aucun document pour l&apos;instant.</p>}
        {cand.documents.map((d) => (
          <div className="ds-kv doc-row" key={d.id}>
            <span className="ds-kv__k" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <DocStatus d={d} />
              <button
                className="ds-btn ds-btn--ghost ds-btn--sm"
                title={d.personne === "?" ? "Personne à déterminer (l'analyse s'en charge) : cliquer pour forcer" : "Basculer entre personne A et B"}
                onClick={() => changerPersonne(d)}
              >{d.personne}</button>
              {TYPE_LABEL[d.type] ?? d.type}
            </span>
            <span className="ds-kv__v" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" title={d.filename}>
                {d.filename.length > 30 ? d.filename.slice(0, 28) + "…" : d.filename}
              </a>
              <button className="ds-btn ds-btn--danger ds-btn--sm" title="Supprimer" onClick={() => supprimerDoc(d.id)}>✕</button>
            </span>
          </div>
        ))}
        {cand.documents.filter((d) => d.extraction_status === "error").map((d) => (
          <p className="ds-hint" key={`err-${d.id}`} style={{ color: "#b3261e" }}>{d.filename} : {d.extraction_error}</p>
        ))}
        {cand.documents.filter((d) => (d.extraction as any)?.remarques).map((d) => (
          <p className="ds-hint" key={`rq-${d.id}`}>
            <strong>{TYPE_LABEL[d.type]} ({d.personne})</strong> : {(d.extraction as any).remarques}
          </p>
        ))}
        <DropZone candidatId={cand.id} onDone={load} />
      </div></div>

      {/* ── Complétude ────────────────────────────────────────────────────── */}
      {cand.completude && cand.completude.length > 0 && (
        <>
          <div className="ds-section"><span className="ds-h2">Le dossier est-il complet ?</span><span className="ds-rule" /></div>
          <div className="ds-grid ds-grid--cards">
            {personnes.map((p) => {
              const items = cand.completude!.filter((c) => c.personne === p);
              if (!items.length) return null;
              return (
                <div className="ds-card" key={p}>
                  <div className="ds-card__head">Personne {p}{nomDe(p) ? ` · ${nomDe(p)}` : ""}</div>
                  <div className="ds-card__body">
                    {items.map((c, i) => (
                      <div className="ds-kv" key={i}>
                        <span className="ds-kv__k" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span className={COMPLETUDE_DOT[c.statut]} /> {c.label}
                        </span>
                        <span className="ds-kv__v" style={c.statut === "ok" ? undefined : { color: c.statut === "manquant" ? "#b3261e" : "#9a6700" }}>
                          {c.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {cand.completude.filter((c) => c.personne === "?").map((c, i) => (
            <div className="ds-error" key={i} style={{ marginTop: 10 }}>{c.label} : {c.detail}</div>
          ))}
        </>
      )}

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
                    {c.label}{c.eliminatoire ? " · ÉLIMINATOIRE" : ""}
                  </span>
                  <span className="ds-kv__v">
                    <strong className="ds-num">{c.points}/{c.max}</strong>
                    <span className="ds-muted"> · {c.detail}</span>
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
                  <div className="ds-card__head">Personne {p}{nomDe(p) ? ` · ${nomDe(p)}` : ""}</div>
                  <div className="ds-card__body">
                    {s.identite && (
                      <Kv k="Date de naissance" v={dateFr(s.identite.date_naissance)} warn={s.identite.aVerifier} />
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
          « Analyser » ne relit que les documents ajoutés ou en erreur puis recalcule le score.{" "}
          <button className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => analyser(true)} disabled={analysing}>
            Tout ré-extraire
          </button>
        </p>
      )}
    </div>
  );
}
