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
  email: string | null;
  telephone: string | null;
  source: string | null;
  tally_answers: { label: string; value: string }[] | null;
  discretionnaire: {
    pct: number;
    details: { label: string; attendu: string; declare: string | null; ok: boolean }[];
  } | null;
  error?: string;
};

/** Ligne clé / valeur d'une fiche : valeur absente affichée « - » pour garder les mêmes lignes A et B. */
function Kv({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className="ds-kv">
      <span className="ds-kv__k">{k}</span>
      <span className="ds-kv__v" style={warn ? { color: "#b3261e", fontWeight: 600 } : undefined}>{v}</span>
    </div>
  );
}

function DocStatus({ d }: { d: DocumentMeta }) {
  if (d.extraction_status === "done") return <span className="ds-dot" title="Document analysé" />;
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
            <strong>Déposez ici tous les documents du dossier</strong>
            <span className="ds-muted">
              Salarié (fiches de paie, contrat, pièce d&apos;identité) ou indépendant (avis d&apos;imposition,
              bilan, extrait KBIS), en vrac, pour une personne comme pour un couple, y compris un seul gros scan
              qui regroupe tout. PDF ou photos, 15 Mo maximum par fichier. Vous n&apos;avez rien à trier : à
              l&apos;analyse, RETINA reconnaît chaque document et le rattache à la bonne personne.
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
  auto: "À analyser",
  autre: "Aucun document reconnu",
  dossier: "Dossier",
};

/** Résumé du contenu d'un fichier « dossier » (plusieurs documents en un scan). */
function dossierResume(d: DocumentMeta): string | null {
  if (d.type !== "dossier" || !d.extraction) return null;
  const e = d.extraction as any;
  const parts: string[] = [];
  const push = (n: number, sing: string, plur: string) => { if (n) parts.push(`${n} ${n > 1 ? plur : sing}`); };
  push((e.fiches_de_paie ?? []).length, "fiche de paie", "fiches de paie");
  push((e.contrats ?? []).length, "contrat", "contrats");
  push((e.pieces_identite ?? []).length, "pièce d'identité", "pièces d'identité");
  push((e.avis_imposition ?? []).length, "avis d'imposition", "avis d'imposition");
  push((e.bilans ?? []).length, "bilan", "bilans");
  push((e.kbis ?? []).length, "extrait KBIS", "extraits KBIS");
  return parts.length ? parts.join(", ") : null;
}

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
  const [cohBusy, setCohBusy] = useState<number | null>(null);
  const [relanceBusy, setRelanceBusy] = useState(false);
  const [relanceMsg, setRelanceMsg] = useState("");

  const load = useCallback(async () => {
    const c = await fetch(`/api/candidats/${id}`).then((x) => x.json());
    if (c.error) setErr(c.error);
    else setCand(c);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // L'analyse tourne côté serveur : on lance, puis on polle le statut. On peut
  // quitter la page (retour au bien, fermeture...) sans interrompre l'analyse.
  async function analyser(force: boolean) {
    setAnalysing(true);
    setErr("");
    const res = await fetch(`/api/candidats/${id}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Erreur pendant l'analyse");
      setAnalysing(false);
      return;
    }
    await load(); // le statut passe à analyse_en_cours, le polling prend le relais
  }

  async function relancer() {
    setRelanceBusy(true);
    setRelanceMsg("");
    try {
      const res = await fetch(`/api/candidats/${id}/relance`, { method: "POST" });
      const data = await res.json();
      setRelanceMsg(
        res.ok
          ? `E-mail de relance envoyé à ${data.email}.`
          : data.error || "Envoi impossible."
      );
    } catch (e: any) {
      setRelanceMsg("Envoi impossible : " + (e?.message ?? e));
    } finally {
      setRelanceBusy(false);
    }
  }

  // Polling tant qu'une analyse est en cours (lancée ici, depuis une autre page,
  // ou par une candidature en ligne qui vient d'arriver).
  useEffect(() => {
    if (cand?.statut !== "analyse_en_cours") {
      setAnalysing(false);
      return;
    }
    setAnalysing(true);
    const t = setInterval(async () => {
      const c = await fetch(`/api/candidats/${id}`).then((x) => x.json());
      if (c.statut !== "analyse_en_cours") {
        setCand(c);
        setAnalysing(false);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [cand?.statut, id]);

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

  /** Valider (ou ré-activer) une incohérence à la main : la note est recalculée. */
  async function toggleCoherence(i: number, ignored: boolean) {
    setCohBusy(i);
    try {
      const res = await fetch(`/api/candidats/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ignoreCoherence: i, ignored }),
      });
      const data = await res.json();
      if (res.ok && data.score) {
        setCand((prev) => (prev ? { ...prev, coherence: data.coherence, score: data.score } : prev));
      }
    } finally {
      setCohBusy(null);
    }
  }

  if (err && !cand) return <div className="wrap ds-scope"><div className="ds-error">{err}</div></div>;
  if (!cand) return <div className="wrap ds-scope"><div className="ds-empty"><span className="ds-empty__hint">Chargement…</span></div></div>;

  const personnes: Personne[] = ["A", "B"];
  const nbDocs = cand.documents.length;
  const dossierIncomplet = !!cand.completude && cand.completude.some((c) => c.statut !== "ok");
  const dejaExtraits = cand.documents.filter((d) => d.extraction_status === "done").length;
  const aAnalyser = cand.documents.some((d) => d.extraction_status !== "done");
  const analyseFaite = !!cand.score;
  const syntheseDe = (p: Personne) => cand.synthese?.find((s) => s.personne === p) ?? null;
  const nomDe = (p: Personne) => {
    const s = syntheseDe(p);
    return s?.identite && (s.identite.prenom || s.identite.nom)
      ? [s.identite.prenom, s.identite.nom].filter(Boolean).join(" ")
      : null;
  };
  const ratioCritere = cand.score?.criteres.find((c) => c.key === "ratio");
  const ratioBas = !!ratioCritere && ratioCritere.points < ratioCritere.max;

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
        {nbDocs > 0 && (
          <a
            className="ds-btn ds-btn--secondary"
            href={`/api/candidats/${id}/zip`}
            title="Récupérer tous les documents du dossier en une archive zip"
          >
            Télécharger tous les documents
          </a>
        )}
        <button className="ds-btn ds-btn--primary" onClick={() => analyser(false)} disabled={analysing || nbDocs === 0}>
          {analysing ? <>Analyse en cours… <span className="ds-spinner" /></> : aAnalyser || !dejaExtraits ? "Analyser le dossier" : "Recalculer le score"}
        </button>
      </div>
      {err && <div className="ds-error" style={{ marginBottom: 12 }}>{err}</div>}
      {analysing && (
        <p className="ds-hint" style={{ marginTop: -6, marginBottom: 12 }}>
          L&apos;analyse tourne en arrière-plan : vous pouvez quitter cette page, elle continuera et le score
          apparaîtra tout seul.
        </p>
      )}

      <div className="ds-card"><div className="ds-card__body">
        {cand.documents.length === 0 && <p className="ds-muted" style={{ margin: 0 }}>Aucun document déposé pour l&apos;instant.</p>}
        {cand.documents.length > 0 && (
          <p className="ds-hint" style={{ marginTop: 0 }}>
            À l&apos;analyse, RETINA reconnaît le contenu de chaque fichier, y compris un seul gros scan qui
            regroupe plusieurs documents (fiches de paie, contrat, pièce d&apos;identité), et rattache chaque
            document à la bonne personne (A ou B) d&apos;après le nom qui y figure.
          </p>
        )}
        {cand.documents.map((d) => {
          // Fichier « dossier » = un scan avec plusieurs documents (et parfois
          // plusieurs personnes) : on affiche son contenu, sans badge A/B (le
          // rattachement se fait par le nom, document par document). Les anciens
          // documents typés gardent leur badge A/B corrigeable.
          const resume = dossierResume(d);
          const attribuee = d.type !== "dossier" && (d.personne === "A" || d.personne === "B");
          const legacyTyped = d.type === "fiche_paie" || d.type === "contrat" || d.type === "piece_identite";
          return (
            <div className="ds-kv doc-row" key={d.id}>
              <span className="ds-kv__k" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <DocStatus d={d} />
                {legacyTyped &&
                  (attribuee ? (
                    <button
                      className="doc-person"
                      title="Cliquez pour attribuer ce document à l'autre personne"
                      onClick={() => changerPersonne(d)}
                    >{d.personne}</button>
                  ) : (
                    <span className="doc-person doc-person--auto" title="La personne sera déterminée à l'analyse">?</span>
                  ))}
                {resume ? `${TYPE_LABEL.dossier} · ${resume}` : TYPE_LABEL[d.type] ?? d.type}
              </span>
              <span className="ds-kv__v" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" title={d.filename}>
                  {d.filename.length > 30 ? d.filename.slice(0, 28) + "…" : d.filename}
                </a>
                <button className="ds-btn ds-btn--danger ds-btn--sm" title="Supprimer" onClick={() => supprimerDoc(d.id)}>✕</button>
              </span>
            </div>
          );
        })}
        {cand.documents.filter((d) => d.extraction_status === "error").map((d) => (
          <p className="ds-hint" key={`err-${d.id}`} style={{ color: "#b3261e" }}>{d.filename} : {d.extraction_error}</p>
        ))}
        {/* Les « remarques » libres du modèle (n° de passeport, fautes, matériel,
            mentions manuscrites…) sont du bruit pour Shawna : on ne les affiche plus.
            Elles restent dans l'extraction stockée pour l'audit. */}
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
                    <div className="score-list">
                      {items.map((c, i) => (
                        <div className="score-row" key={i}>
                          <span className="score-row__label" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                            <span className={COMPLETUDE_DOT[c.statut]} /> {c.label}
                          </span>
                          <span className="score-row__detail" style={{ marginTop: 0, ...(c.statut === "ok" ? {} : { color: c.statut === "manquant" ? "#b3261e" : "#9a6700" }) }}>
                            {c.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {cand.completude.filter((c) => c.personne === "?").map((c, i) => (
            <div className="ds-error" key={i} style={{ marginTop: 10 }}>{c.label} : {c.detail}</div>
          ))}
          {dossierIncomplet && cand.email && (
            <div style={{ marginTop: 12 }}>
              <button className="ds-btn ds-btn--secondary" onClick={relancer} disabled={relanceBusy}>
                {relanceBusy ? "Envoi…" : "Relancer par mail pour compléter le dossier"}
              </button>
              {relanceMsg && <p className="ds-hint" style={{ marginTop: 8, marginBottom: 0 }}>{relanceMsg}</p>}
            </div>
          )}
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
                <div className="ds-stat"><span className="ds-stat__k">Revenus nets ménage</span><span className="ds-stat__v ds-num">{cand.score.revenusMenage ? eur(cand.score.revenusMenage) : "-"}</span></div>
                <div className="ds-stat" style={ratioBas ? { background: "#fbeaea", borderColor: "#e7c3c3" } : undefined}>
                  <span className="ds-stat__k">Ratio revenus/coût</span>
                  <span className="ds-stat__v ds-num" style={ratioBas ? { color: "#b3261e" } : undefined}>{cand.score.ratio != null ? `${cand.score.ratio}×` : "-"}</span>
                </div>
                <div className="ds-stat"><span className="ds-stat__k">Coût mensuel</span><span className="ds-stat__v ds-num">{eur(Number(cand.loyer) + Number(cand.charges))}</span></div>
              </div>
              {cand.score.eliminatoire && (
                <div className="ds-error" style={{ marginBottom: 12 }}>
                  {(() => {
                    const raisons = cand.score.criteres.filter((c) => c.eliminatoire).map((c) => c.label.toLowerCase());
                    const pluriel = raisons.length > 1;
                    return `Ce candidat est éliminé sur le${pluriel ? "s" : ""} critère${pluriel ? "s" : ""} suivant${pluriel ? "s" : ""} : ${raisons.join(", ")}. Le score est donc plafonné à 40 sur 100, quel que soit le reste du dossier.`;
                  })()}
                </div>
              )}
              <div className="score-list">
                {cand.score.criteres.map((c) => (
                  <div className="score-row" key={c.key}>
                    <span className="score-row__label" style={c.eliminatoire ? { color: "#b3261e" } : undefined}>
                      {c.label}{c.eliminatoire ? " · éliminatoire" : ""}
                    </span>
                    <span className="score-row__note ds-num" style={c.eliminatoire ? { color: "#b3261e" } : undefined}>{c.points}/{c.max}</span>
                    <span className="score-row__detail">{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Recommandabilité (note discrétionnaire depuis les réponses Tally) ─ */}
      {cand.discretionnaire && (
        <>
          <div className="ds-section"><span className="ds-h2">Recommandabilité</span><span className="ds-rule" />
            <span className="ds-muted" style={{ fontSize: "var(--ds-fs-sm)" }}>d&apos;après le questionnaire</span>
          </div>
          <div className="ds-card"><div className="ds-card__body">
            <div className="ds-stats" style={{ marginBottom: 14 }}>
              <div className="ds-stat">
                <span className="ds-stat__k">Correspond à vos préférences</span>
                <span className="ds-stat__v ds-num" style={{ color: cand.discretionnaire.pct >= 67 ? "#07875f" : cand.discretionnaire.pct >= 34 ? "#9a6700" : "#b3261e" }}>
                  {cand.discretionnaire.pct}%
                </span>
              </div>
            </div>
            <div className="score-list">
              {cand.discretionnaire.details.map((d, i) => (
                <div className="score-row" key={i}>
                  <span className="score-row__label" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className={`ds-dot${d.ok ? "" : " ds-dot--warn"}`} /> {d.label}
                  </span>
                  <span className="score-row__detail">
                    {d.declare == null
                      ? "non renseigné dans le questionnaire"
                      : d.ok
                      ? `souhaité : ${d.attendu} — le candidat correspond (${d.declare}).`
                      : `souhaité : ${d.attendu} — le candidat déclare : ${d.declare}.`}
                  </span>
                </div>
              ))}
            </div>
            <p className="ds-hint" style={{ marginBottom: 0 }}>
              Note indicative, distincte du score financier : elle mesure à quel point les réponses déclarées collent
              à vos préférences pour ce bien. Elle n&apos;écarte aucun candidat.
            </p>
          </div></div>
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
                    <Kv k="Date de naissance" v={dateFr(s.identite?.date_naissance)} warn={!!s.identite?.aVerifier} />
                    {e?.independant ? (
                      <>
                        {/* Profil INDÉPENDANT : revenu tiré des avis d'imposition / bilans. */}
                        <Kv k="Statut" v="Indépendant" />
                        <Kv k="Forme juridique" v={e.independant.forme_juridique ?? "-"} />
                        <Kv
                          k="Revenu net mensuel"
                          v={e.salaire_net_mensuel != null
                            ? `${eur(e.salaire_net_mensuel)} (${eur(e.independant.revenu_annuel_moyen)}/an en moyenne, d'après ${e.independant.source === "avis_imposition" ? "les avis d'imposition" : "les bilans"})`
                            : "-"}
                        />
                        <Kv
                          k="Revenus annuels retenus"
                          v={e.independant.revenus_annuels.length
                            ? e.independant.revenus_annuels.map((r) => `${r.annee ?? "?"} : ${eur(r.montant)}`).join(" · ")
                            : "-"}
                        />
                        <Kv k="Chiffre d'affaires" v={e.independant.chiffre_affaires != null ? `${eur(e.independant.chiffre_affaires)} (dernier exercice)` : "-"} />
                        <Kv k="Entreprise" v={e.employeur ?? "-"} />
                        <Kv k="Activité depuis" v={e.date_entree ? `${dateFr(e.date_entree)}${e.ancienneteMois != null ? ` (${e.ancienneteMois} mois)` : ""}` : "-"} />
                      </>
                    ) : (
                      <>
                        {/* Profil SALARIÉ. Lignes constantes, « - » si l'information manque. */}
                        <Kv k="Salaire net mensuel" v={e?.salaire_net_mensuel != null ? `${eur(e.salaire_net_mensuel)} (moyenne de ${e.nbBulletins} bulletin${e.nbBulletins > 1 ? "s" : ""})` : "-"} />
                        <Kv k="Poste" v={e?.intitule_poste ?? "-"} />
                        <Kv k="Type de contrat" v={e?.type_contrat ? CONTRAT_LABELS[e.type_contrat] : "-"} />
                        <Kv
                          k="Période d'essai"
                          v={!e || e.periode_essai == null ? "-" : e.periode_essai ? `oui${e.fin_periode_essai ? `, jusqu'au ${dateFr(e.fin_periode_essai)}` : ""}` : "non"}
                        />
                        <Kv k="Employeur" v={e?.employeur ?? "-"} />
                        <Kv k="Dans l'entreprise depuis" v={e?.date_entree ? `${dateFr(e.date_entree)}${e.ancienneteMois != null ? ` (${e.ancienneteMois} mois)` : ""}` : "-"} />
                      </>
                    )}
                    {e && e.aVerifier.length > 0 && (
                      <p className="ds-hint" style={{ color: "#9a6700" }}>À vérifier : {e.aVerifier.join(" · ")}</p>
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
            <div className="score-list">
              {cand.coherence.map((c, i) => {
                const probleme = !c.ok && !c.ignored; // incohérence active (pénalise)
                const valide = !c.ok && c.ignored; // incohérence validée à la main
                return (
                  <div className="score-row" key={i}>
                    <span
                      className="score-row__label"
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, color: probleme ? "#b3261e" : undefined }}
                    >
                      <span className={`ds-dot${probleme ? " ds-dot--warn" : ""}`} /> Personne {c.personne} · {c.check}
                    </span>
                    <span className="score-row__note" style={{ fontWeight: 400 }}>
                      {probleme && (
                        <button
                          className="ds-btn ds-btn--ghost ds-btn--sm"
                          onClick={() => toggleCoherence(i, true)}
                          disabled={cohBusy === i}
                          title="Marquer cette incohérence comme vérifiée : elle n'affectera plus la note"
                        >
                          {cohBusy === i ? "…" : "Marquer OK"}
                        </button>
                      )}
                      {valide && (
                        <button
                          className="ds-btn ds-btn--ghost ds-btn--sm"
                          onClick={() => toggleCoherence(i, false)}
                          disabled={cohBusy === i}
                          title="Ré-activer cette incohérence (elle repénalisera la note)"
                        >
                          {cohBusy === i ? "…" : "Rétablir"}
                        </button>
                      )}
                    </span>
                    <span
                      className="score-row__detail"
                      style={probleme ? { color: "#b3261e" } : valide ? { color: "#07875f" } : undefined}
                    >
                      {c.detail}
                      {valide && " Validé à la main : cette incohérence n'affecte pas la note."}
                    </span>
                  </div>
                );
              })}
            </div>
          </div></div>
        </>
      )}

      {/* ── Réponses du questionnaire de candidature en ligne ─────────────── */}
      {cand.tally_answers && cand.tally_answers.length > 0 && (
        <>
          <div className="ds-section"><span className="ds-h2">Réponses du questionnaire</span><span className="ds-rule" /></div>
          <div className="ds-card"><div className="ds-card__body">
            <div className="score-list">
              {cand.tally_answers.map((r, i) => (
                <div className="score-row" key={i}>
                  <span className="score-row__label">{r.label}</span>
                  <span className="score-row__detail">{r.value}</span>
                </div>
              ))}
            </div>
            <p className="ds-hint" style={{ marginBottom: 0 }}>
              Réponses déclarées par le candidat dans le formulaire en ligne. Le score, lui, est calculé
              uniquement à partir des documents fournis.
            </p>
          </div></div>
        </>
      )}

      {analyseFaite && dejaExtraits > 0 && (
        <p className="ds-hint" style={{ marginTop: 18 }}>
          Le bouton « Analyser le dossier » ne relit que les documents ajoutés ou en erreur, puis recalcule le score.
          Pour forcer une nouvelle lecture de tous les documents,{" "}
          <button className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => analyser(true)} disabled={analysing}>
            tout ré-extraire
          </button>.
        </p>
      )}
    </div>
  );
}
