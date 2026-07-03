"use client";
import BienForm from "@/components/BienForm";

export default function EditBien({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  return (
    <div className="wrap ds-scope">
      <div className="topbar">
        <a className="brand-home" href="/" title="Accueil">RETINA</a>
        <h1 className="page-title">Modifier le bien</h1>
        <div className="topbar-nav">
          <a className="ds-btn ds-btn--ghost" href={`/biens/${id}`}>← Retour</a>
        </div>
      </div>
      <BienForm bienId={id} />
    </div>
  );
}
