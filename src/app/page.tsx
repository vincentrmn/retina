"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/format";

type Bien = {
  id: number;
  adresse: string;
  loyer: string;
  charges: string;
  criteres: any;
  apimo_id: number | null;
  nb_candidats: number;
  nb_analyses: number;
};

export default function Dashboard() {
  const [biens, setBiens] = useState<Bien[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const router = useRouter();

  async function load() {
    try {
      const b = await fetch("/api/biens").then((x) => x.json());
      setBiens(Array.isArray(b) ? b : []);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function supprimer(id: number) {
    if (!confirm("Supprimer ce bien et tous ses dossiers candidats ?")) return;
    await fetch(`/api/biens/${id}`, { method: "DELETE" });
    load();
  }

  async function synchroniserApimo() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const r = await fetch("/api/apimo/sync", { method: "POST" }).then((x) => x.json());
      if (r.error) setSyncMsg(r.error);
      else {
        const parts = [];
        if (r.crees) parts.push(`${r.crees} bien${r.crees > 1 ? "s" : ""} importé${r.crees > 1 ? "s" : ""}`);
        if (r.maj) parts.push(`${r.maj} mis à jour`);
        setSyncMsg(parts.length ? parts.join(", ") + "." : `À jour : les ${r.total} biens en location d'Apimo sont déjà dans RETINA.`);
      }
      load();
    } catch (e: any) {
      setSyncMsg("Synchronisation impossible : " + (e?.message ?? e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <span className="page-title" />
        <div className="topbar-nav" />
      </div>

      {/* Introduction : ce qu'est RETINA et comment ça marche */}
      <div className="ds-card intro-card" style={{ marginTop: 0 }}>
        <div className="ds-card__head">Bienvenue sur RETINA</div>
        <div className="ds-card__body">
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            RETINA analyse les dossiers des candidats à la location : extraction automatique des documents
            (fiches de paie, contrats, pièces d&apos;identité), contrôles de cohérence, puis score
            d&apos;éligibilité expliqué critère par critère. Du bien jusqu&apos;au score, tout peut se faire
            sans saisie manuelle.
          </p>
          <div className="intro-steps">
            <div className="intro-step">
              <span className="intro-step__n">1</span>
              <div className="intro-step__t">Le bien entre dans RETINA</div>
              <div className="intro-step__d">« Synchroniser Apimo » importe les biens à la location, ou encodez-en un à la main. Ajustez ensuite ses critères d&apos;éligibilité.</div>
            </div>
            <div className="intro-step">
              <span className="intro-step__n">2</span>
              <div className="intro-step__t">Les candidatures arrivent toutes seules</div>
              <div className="intro-step__d">Envoyez aux intéressés le lien de candidature du bien : le candidat remplit le questionnaire, dépose ses documents, et son dossier est analysé automatiquement. Le dépôt à la main reste possible.</div>
            </div>
            <div className="intro-step">
              <span className="intro-step__n">3</span>
              <div className="intro-step__t">Lisez le score</div>
              <div className="intro-step__d">Fiche signalétique par personne, contrôles de cohérence, score détaillé, et export PDF de l&apos;analyse du bien.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ds-section">
        <span className="ds-h2">Biens à la location</span>
        <span className="ds-rule" />
        <button className="ds-btn ds-btn--secondary" onClick={synchroniserApimo} disabled={syncing}>
          {syncing ? "Synchronisation…" : "Synchroniser Apimo"}
        </button>
        <button className="ds-btn ds-btn--primary" onClick={() => router.push("/biens/new")}>
          + Nouveau bien
        </button>
      </div>
      {syncMsg && <p className="ds-hint" style={{ marginTop: -4, marginBottom: 12 }}>{syncMsg}</p>}

      {loaded && biens.length === 0 && (
        <div className="ds-empty">
          <span className="ds-empty__title">Aucun bien</span>
          <span className="ds-empty__hint">Encode ton premier bien à la location pour commencer à analyser des candidats.</span>
          <button className="ds-btn ds-btn--ghost ds-btn--sm" style={{ marginTop: 4 }} onClick={() => router.push("/biens/new")}>+ Nouveau bien</button>
        </div>
      )}

      {biens.map((b) => (
        <a className="ds-row" key={b.id} href={`/biens/${b.id}`}>
          <div className="ds-row__main">
            <div className="ds-row__title">{b.adresse}</div>
            <div className="ds-row__sub">
              {eur(b.loyer)} + {eur(b.charges)} charges · revenus exigés ≥ {(b.criteres?.ratioMin ?? 3)}×
            </div>
          </div>
          <div className="ds-row__actions">
            {b.apimo_id != null && <span className="ds-pill">Apimo</span>}
            <span className="ds-pill">
              {b.nb_candidats} candidat{b.nb_candidats > 1 ? "s" : ""}
              {b.nb_candidats > 0 ? ` · ${b.nb_analyses} analysé${b.nb_analyses > 1 ? "s" : ""}` : ""}
            </span>
            <button
              className="ds-btn ds-btn--danger ds-btn--sm"
              title="Supprimer ce bien"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                supprimer(b.id);
              }}
            >✕</button>
          </div>
        </a>
      ))}
    </div>
  );
}
