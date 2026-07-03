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
  nb_candidats: number;
  nb_analyses: number;
};

export default function Dashboard() {
  const [biens, setBiens] = useState<Bien[]>([]);
  const [loaded, setLoaded] = useState(false);
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

  return (
    <div className="wrap ds-scope ds-scope--lg">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <span className="page-title" />
        <div className="topbar-nav" />
      </div>

      <div className="ds-section" style={{ marginTop: 0 }}>
        <span className="ds-h2">Biens à la location</span>
        <span className="ds-rule" />
        <button className="ds-btn ds-btn--primary" onClick={() => router.push("/biens/new")}>
          + Nouveau bien
        </button>
      </div>

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
