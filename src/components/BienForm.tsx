"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Toggle from "./Toggle";
import { DEFAULT_CRITERES, type Criteres } from "@/lib/types";

/**
 * Puce cliquable « Éliminatoire » : rouge quand le critère est éliminatoire,
 * contour gris sinon. C'est le toggle qui décide du caractère éliminatoire.
 */
function ElimToggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`elim-toggle${on && !disabled ? " elim-toggle--on" : ""}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={
        disabled
          ? "Activez d'abord le critère pour choisir s'il est éliminatoire"
          : on
          ? "Critère éliminatoire — cliquez pour le rendre seulement pénalisant"
          : "Cliquez pour rendre ce critère éliminatoire"
      }
    >
      <span className="elim-toggle__dot" />
      Éliminatoire
    </button>
  );
}

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
        <div className="crit-list">
          {/* Revenus / coût */}
          <div className="crit-row" data-inactive={!criteres.ratioActif || undefined}>
            <Toggle checked={criteres.ratioActif} onChange={(v) => setC("ratioActif", v)} />
            <div className="crit-main">
              <p className="crit-text">
                <span className="crit-name">Revenus/coût du logement</span> : les revenus nets du ménage doivent atteindre au moins
                <input className="crit-num" type="number" step="0.5" min="0" disabled={!criteres.ratioActif} value={criteres.ratioMin} onChange={(e) => setC("ratioMin", Number(e.target.value))} />
                fois le loyer et les charges.
              </p>
            </div>
            <div className="crit-ctrl"><ElimToggle on={criteres.ratioEliminatoire} disabled={!criteres.ratioActif} onChange={(v) => setC("ratioEliminatoire", v)} /></div>
          </div>

          {/* CDI */}
          <div className="crit-row" data-inactive={!criteres.cdiActif || undefined}>
            <Toggle checked={criteres.cdiActif} onChange={(v) => setC("cdiActif", v)} />
            <div className="crit-main">
              <p className="crit-text">
                <span className="crit-name">Présence d&apos;un CDI</span> : le ménage doit compter au moins un contrat à durée indéterminée.
              </p>
            </div>
            <div className="crit-ctrl"><ElimToggle on={criteres.cdiEliminatoire} disabled={!criteres.cdiActif} onChange={(v) => setC("cdiEliminatoire", v)} /></div>
          </div>

          {/* CDD */}
          <div className="crit-row" data-inactive={!criteres.cddAccepte || undefined}>
            <Toggle checked={criteres.cddAccepte} onChange={(v) => setC("cddAccepte", v)} />
            <div className="crit-main">
              <p className="crit-text">
                <span className="crit-name">CDD acceptés</span> : compter les CDD comme un revenu stable. Désactivé, un CDD est fortement pénalisé dans la note.
              </p>
            </div>
            <div className="crit-ctrl" />
          </div>

          {/* Période d'essai */}
          <div className="crit-row" data-inactive={!criteres.essaiActif || undefined}>
            <Toggle checked={criteres.essaiActif} onChange={(v) => setC("essaiActif", v)} />
            <div className="crit-main">
              <p className="crit-text">
                <span className="crit-name">Période d&apos;essai</span> : tenir compte des périodes d&apos;essai en cours dans le ménage.
              </p>
            </div>
            <div className="crit-ctrl"><ElimToggle on={criteres.essaiEliminatoire} disabled={!criteres.essaiActif} onChange={(v) => setC("essaiEliminatoire", v)} /></div>
          </div>

          {/* Ancienneté */}
          <div className="crit-row" data-inactive={!criteres.ancienneteActif || undefined}>
            <Toggle checked={criteres.ancienneteActif} onChange={(v) => setC("ancienneteActif", v)} />
            <div className="crit-main">
              <p className="crit-text">
                <span className="crit-name">Ancienneté dans l&apos;entreprise</span> : exiger au moins
                <input className="crit-num" type="number" min="0" disabled={!criteres.ancienneteActif} value={criteres.ancienneteMinMois} onChange={(e) => setC("ancienneteMinMois", Number(e.target.value))} />
                mois d&apos;ancienneté.
              </p>
            </div>
            <div className="crit-ctrl" />
          </div>
        </div>

        <p className="ds-hint">
          L&apos;interrupteur de gauche <strong>active</strong> le critère (grisé, il est ignoré dans le calcul). La puce
          <strong> Éliminatoire</strong> en rouge, elle, rend le critère bloquant : non respecté, il plafonne le score à
          40 sur 100 et affiche le dossier en rouge. Les critères actifs sans puce rouge pèsent dans la note sans écarter
          automatiquement le candidat.
        </p>
      </div></div>

      {/* Explication de la méthode de calcul */}
      <div className="ds-section"><span className="ds-h2">Comment le score est-il calculé ?</span><span className="ds-rule" /></div>
      <div className="ds-card"><div className="ds-card__body">
        <p style={{ margin: "0 0 14px", lineHeight: 1.55 }}>
          Le score va de 0 à 100 points et se répartit sur quatre critères. L&apos;intelligence artificielle se
          contente de lire les documents ; le score, lui, est calculé par un code déterministe, donc un même dossier
          donne toujours le même résultat.
        </p>
        <div className="score-tbl-wrap">
          <table className="score-tbl">
            <thead>
              <tr><th>Critère</th><th className="score-tbl__pts">Points</th><th>Comment il est calculé</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="score-tbl__crit">Revenus/coût du logement</td>
                <td className="score-tbl__pts">40</td>
                <td>Revenus nets du ménage comparés au loyer et aux charges. Maximum dès que le ratio exigé est atteint, proportionnel en dessous.</td>
              </tr>
              <tr>
                <td className="score-tbl__crit">Stabilité des contrats</td>
                <td className="score-tbl__pts">30</td>
                <td>CDI hors essai au maximum, puis CDI en essai, CDD et intérim. Pondéré par le salaire de chaque personne.</td>
              </tr>
              <tr>
                <td className="score-tbl__crit">Ancienneté dans l&apos;entreprise</td>
                <td className="score-tbl__pts">15</td>
                <td>Par paliers : moins de 6 mois, 6 mois, 1 an, 2 ans, puis 3 ans et plus pour le maximum.</td>
              </tr>
              <tr>
                <td className="score-tbl__crit">Cohérence du dossier</td>
                <td className="score-tbl__pts">15</td>
                <td>Quatre contrôles croisés (noms, employeurs, salaires, dates). Chaque incohérence retire 5 points.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="ds-hint" style={{ marginTop: 14 }}>
          <strong>Candidat indépendant.</strong> Faute de fiche de paie, le revenu est établi à partir des
          <strong> avis d&apos;imposition</strong> (en priorité) ou des <strong>bilans / comptes de résultat</strong> :
          on prend le revenu net annuel moyen des deux derniers exercices, divisé par douze. Par prudence (revenu moins
          régulier qu&apos;un salaire), seuls <strong>80 %</strong> de ce revenu sont retenus pour le ratio.
          L&apos;ancienneté correspond à l&apos;âge de l&apos;entreprise (extrait KBIS) ; une activité de moins de deux
          ans pèse moins en stabilité. Ces réglages sont des valeurs par défaut, à affiner avec vous.
        </p>
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
