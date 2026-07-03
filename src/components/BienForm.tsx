"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Toggle from "./Toggle";
import { DEFAULT_CRITERES, type Criteres } from "@/lib/types";

/** Formulaire bien + critères d'éligibilité — création et édition. */
export default function BienForm({ bienId }: { bienId?: number }) {
  const router = useRouter();
  const [adresse, setAdresse] = useState("");
  const [loyer, setLoyer] = useState("");
  const [charges, setCharges] = useState("");
  const [criteres, setCriteres] = useState<Criteres>({ ...DEFAULT_CRITERES });
  const [loaded, setLoaded] = useState(!bienId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!bienId) return;
    fetch(`/api/biens/${bienId}`)
      .then((r) => r.json())
      .then((b) => {
        if (b.error) throw new Error(b.error);
        setAdresse(b.adresse);
        setLoyer(String(Number(b.loyer)));
        setCharges(String(Number(b.charges)));
        setCriteres({ ...DEFAULT_CRITERES, ...b.criteres });
        setLoaded(true);
      })
      .catch((e) => setErr(e.message));
  }, [bienId]);

  function setC<K extends keyof Criteres>(k: K, v: Criteres[K]) {
    setCriteres((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    if (!adresse.trim()) return setErr("L'adresse du bien est obligatoire.");
    const l = Number(loyer);
    if (!isFinite(l) || l <= 0) return setErr("Indique un loyer mensuel valide.");
    setBusy(true);
    setErr("");
    const payload = {
      adresse: adresse.trim(),
      loyer: l,
      charges: Number(charges) || 0,
      criteres: { ...criteres, ratioMin: Number(criteres.ratioMin) || 3, ancienneteMinMois: Number(criteres.ancienneteMinMois) || 0 },
    };
    const res = await fetch(bienId ? `/api/biens/${bienId}` : "/api/biens", {
      method: bienId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(data.error || "Erreur");
    router.push(`/biens/${bienId ?? data.id}`);
  }

  if (!loaded) return <div className="ds-empty"><span className="ds-empty__hint">Chargement…</span></div>;

  return (
    <>
      <div className="ds-section"><span className="ds-h2">Le bien</span><span className="ds-rule" /></div>
      <div className="ds-card"><div className="ds-card__body">
        <div className="ds-field">
          <span className="ds-label">Adresse</span>
          <input className="ds-input" type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Ex : 12 rue de la Gare, Luxembourg" />
        </div>
        <div className="ds-grid" style={{ marginTop: 16 }}>
          <div className="ds-field"><span className="ds-label">Loyer (€/mois)</span><input className="ds-input" type="number" value={loyer} onChange={(e) => setLoyer(e.target.value)} /></div>
          <div className="ds-field"><span className="ds-label">Charges (€/mois)</span><input className="ds-input" type="number" value={charges} onChange={(e) => setCharges(e.target.value)} /></div>
        </div>
      </div></div>

      <div className="ds-section"><span className="ds-h2">Critères d&apos;éligibilité</span><span className="ds-rule" /></div>
      <div className="ds-card"><div className="ds-card__body">
        <div className="ds-grid">
          <div className="ds-field">
            <span className="ds-label">Revenus nets exigés (× loyer + charges)</span>
            <input className="ds-input" type="number" step="0.5" value={criteres.ratioMin} onChange={(e) => setC("ratioMin", Number(e.target.value))} />
          </div>
          <div className="ds-field">
            <span className="ds-label">Ancienneté minimale (mois, 0 = aucune)</span>
            <input className="ds-input" type="number" value={criteres.ancienneteMinMois} onChange={(e) => setC("ancienneteMinMois", Number(e.target.value))} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <div className="zone-picker__toggle-row" style={{ borderBottom: "none", padding: 0, margin: 0 }}>
            <Toggle checked={criteres.ratioEliminatoire} onChange={(v) => setC("ratioEliminatoire", v)} />
            <span className="zone-picker__toggle-label">Ratio insuffisant = éliminatoire</span>
          </div>
          <div className="zone-picker__toggle-row" style={{ borderBottom: "none", padding: 0, margin: 0 }}>
            <Toggle checked={criteres.cdiRequis} onChange={(v) => setC("cdiRequis", v)} />
            <span className="zone-picker__toggle-label">Au moins un CDI exigé dans le ménage</span>
          </div>
          <div className="zone-picker__toggle-row" style={{ borderBottom: "none", padding: 0, margin: 0 }}>
            <Toggle checked={criteres.cddAccepte} onChange={(v) => setC("cddAccepte", v)} />
            <span className="zone-picker__toggle-label">CDD acceptés (sinon fortement pénalisés)</span>
          </div>
          <div className="zone-picker__toggle-row" style={{ borderBottom: "none", padding: 0, margin: 0 }}>
            <Toggle checked={criteres.essaiEliminatoire} onChange={(v) => setC("essaiEliminatoire", v)} />
            <span className="zone-picker__toggle-label">Période d&apos;essai en cours = éliminatoire (si tout le ménage est en essai)</span>
          </div>
        </div>
        <p className="ds-hint">
          Un critère éliminatoire plafonne le score à 40 sur 100 et marque le dossier en rouge. Les autres critères
          pèsent dans le barème sans exclure automatiquement le candidat.
        </p>
      </div></div>

      {/* Explication de la méthode de calcul */}
      <div className="ds-section"><span className="ds-h2">Comment le score est calculé</span><span className="ds-rule" /></div>
      <div className="ds-card"><div className="ds-card__body">
        <p style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
          Le score va de 0 à 100 points et se répartit sur quatre critères. L&apos;intelligence artificielle se
          contente de lire les documents ; le score, lui, est calculé par un code déterministe, donc un même dossier
          donne toujours le même résultat.
        </p>
        <ul className="ds-bullets">
          <li>
            <strong>Revenus / coût du logement (40 points).</strong> On compare les revenus nets du ménage au montant
            du loyer et des charges. Le maximum est atteint dès que les revenus atteignent le ratio exigé ci-dessus
            (par exemple 3 fois le loyer). En dessous, les points diminuent proportionnellement.
          </li>
          <li>
            <strong>Stabilité des contrats (30 points).</strong> Un CDI hors période d&apos;essai vaut le maximum, un
            CDI en période d&apos;essai un peu moins, puis viennent le CDD et l&apos;intérim. Le résultat est pondéré
            par le poids salarial de chaque personne du ménage.
          </li>
          <li>
            <strong>Ancienneté dans l&apos;entreprise (15 points).</strong> Les points augmentent par paliers : moins
            de 6 mois, 6 mois, 1 an, 2 ans, puis 3 ans et plus pour le maximum.
          </li>
          <li>
            <strong>Cohérence du dossier (15 points).</strong> Quatre contrôles croisés vérifient que les documents
            concordent (nom sur la paie et sur la pièce d&apos;identité, employeur du contrat et des bulletins, salaire
            du contrat proche des bulletins, bulletins consécutifs et récents). Chaque incohérence retire 5 points.
          </li>
        </ul>
      </div></div>

      {err && <div className="ds-error">{err}</div>}

      <div className="ds-toolbar" style={{ marginTop: 22, background: "transparent", border: "none", padding: 0 }}>
        <button className="ds-btn ds-btn--primary" onClick={save} disabled={busy}>
          {busy ? "…" : bienId ? "Enregistrer les modifications" : "Créer le bien"}
        </button>
        <button className="ds-btn ds-btn--ghost" onClick={() => router.back()} disabled={busy}>Annuler</button>
      </div>
    </>
  );
}
