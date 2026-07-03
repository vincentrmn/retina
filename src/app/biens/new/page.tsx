"use client";
import BienForm from "@/components/BienForm";

export default function NewBien() {
  return (
    <div className="wrap ds-scope">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <h1 className="page-title">Nouveau bien</h1>
        <div className="topbar-nav">
          <a className="ds-btn ds-btn--ghost" href="/">← Retour</a>
        </div>
      </div>
      <BienForm />
    </div>
  );
}
