import { NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { fetchBiensLocation, hasApimoConfig } from "@/lib/apimo";
import { scoreCandidat } from "@/lib/scoring";
import { DEFAULT_CRITERES, normalizeCriteres, type CoherenceCheck, type SynthesePersonne } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Synchronisation Apimo → RETINA : importe les biens à la location exposés
 * par l'API Apimo (dédoublonnés par apimo_id).
 *  - bien inconnu → créé avec les critères d'éligibilité par défaut (Shawna
 *    ajuste ensuite dans RETINA, ses réglages sont conservés aux synchros
 *    suivantes) ;
 *  - bien connu → adresse/loyer/charges rafraîchis ; si le coût du logement a
 *    changé, les scores des candidats déjà analysés sont recalculés depuis
 *    leur synthèse stockée (zéro coût API) ;
 *  - un bien retiré d'Apimo n'est jamais supprimé de RETINA (les dossiers
 *    candidats restent consultables).
 */
export async function POST() {
  try {
    await ensureSchema();
    if (!hasApimoConfig()) {
      return NextResponse.json(
        { error: "Identifiants Apimo absents côté serveur (APIMO_PROVIDER / APIMO_TOKEN / APIMO_AGENCY)." },
        { status: 503 }
      );
    }

    const biens = await fetchBiensLocation();
    let crees = 0;
    let maj = 0;
    let rescored = 0;

    for (const b of biens) {
      const existant = await pool.query(`SELECT * FROM biens WHERE apimo_id = $1`, [b.apimoId]);
      if (!existant.rows.length) {
        await pool.query(
          `INSERT INTO biens (adresse, loyer, charges, criteres, apimo_id) VALUES ($1,$2,$3,$4,$5)`,
          [b.adresse, b.loyer, b.charges, JSON.stringify(DEFAULT_CRITERES), b.apimoId]
        );
        crees++;
        continue;
      }

      const cur = existant.rows[0];
      // Sur un bien existant, on ne rafraîchit que le loyer et les charges :
      // - l'adresse peut avoir été précisée à la main (l'API Apimo n'expose que
      //   le titre de l'annonce, pas l'adresse postale) — on n'y touche plus ;
      // - les charges Apimo (price.fees) sont souvent absentes alors que le
      //   bien en a (constaté sur APP025 : 0 côté Apimo, 225 € encodés par
      //   Shawna) → mises à jour seulement si Apimo en fournit, jamais
      //   d'écrasement d'une valeur manuelle par un zéro.
      const charges = b.charges > 0 ? b.charges : Number(cur.charges);
      const loyerChange = Number(cur.loyer) !== b.loyer;
      const chargesChange = Number(cur.charges) !== charges;
      if (!loyerChange && !chargesChange) continue;

      await pool.query(`UPDATE biens SET loyer=$1, charges=$2, updated_at=now() WHERE id=$3`, [
        b.loyer,
        charges,
        cur.id,
      ]);
      maj++;

      // Coût du logement changé : recalcul des scores depuis la synthèse déjà
      // stockée, comme à l'édition manuelle du bien (aucune ré-extraction).
      if (loyerChange || chargesChange) {
        const criteres = normalizeCriteres(cur.criteres);
        const cands = await pool.query(
          `SELECT id, synthese, coherence FROM candidats WHERE bien_id = $1 AND synthese IS NOT NULL`,
          [cur.id]
        );
        for (const c of cands.rows) {
          const score = scoreCandidat(
            { loyer: b.loyer, charges, criteres },
            (c.synthese ?? []) as SynthesePersonne[],
            (c.coherence ?? []) as CoherenceCheck[]
          );
          await pool.query(`UPDATE candidats SET score = $1 WHERE id = $2`, [JSON.stringify(score), c.id]);
          rescored++;
        }
      }
    }

    return NextResponse.json({ ok: true, total: biens.length, crees, maj, rescored });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
