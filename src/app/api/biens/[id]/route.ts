import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { scoreCandidat } from "@/lib/scoring";
import { normalizeCriteres, type CoherenceCheck, type SynthesePersonne } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    const { rows } = await pool.query(`SELECT * FROM biens WHERE id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Bien introuvable" }, { status: 404 });
    const candidats = await pool.query(
      `SELECT c.id, c.nom, c.statut, c.score, c.analysed_at, c.created_at, c.source, c.email, c.telephone, c.traite,
              COUNT(d.id)::int AS nb_documents
         FROM candidats c
         LEFT JOIN documents d ON d.candidat_id = c.id
        WHERE c.bien_id = $1
        GROUP BY c.id
        ORDER BY COALESCE((c.score->>'total')::numeric, -1) DESC, c.created_at ASC`,
      [id]
    );
    // Un candidat est « analysé » dès qu'il a un score, même si un document a
    // échoué (statut erreur_document mais score calculé sur les docs restants).
    const nbAnalyses = candidats.rows.filter((c) => c.score != null).length;
    // Lien de candidature en ligne : lien court RETINA (/c/12) qui redirige
    // vers le formulaire Tally avec les champs cachés du bien. Plus agréable à
    // envoyer qu'une URL Tally chargée de l'adresse encodée.
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const tallyUrl = process.env.TALLY_FORM_ID && host ? `${proto}://${host}/c/${id}` : null;
    return NextResponse.json({
      ...rows[0],
      candidats: candidats.rows,
      nb_candidats: candidats.rows.length,
      nb_analyses: nbAnalyses,
      tally_url: tallyUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    const body = await req.json();
    const { rows } = await pool.query(`SELECT * FROM biens WHERE id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Bien introuvable" }, { status: 404 });
    const cur = rows[0];
    const adresse = body.adresse != null ? String(body.adresse).trim() : cur.adresse;
    const loyer = body.loyer != null ? Number(body.loyer) : Number(cur.loyer);
    const charges = body.charges != null ? Number(body.charges) : Number(cur.charges);
    const criteres = normalizeCriteres({ ...cur.criteres, ...(body.criteres ?? {}) });
    // Rattachement (ou détachement) manuel d'un bien à sa fiche Apimo : permet
    // de fusionner un bien encodé à la main avec son pendant importé, pour que
    // les synchros suivantes le tiennent à jour.
    const apimoId = body.apimoId !== undefined ? (body.apimoId == null ? null : Number(body.apimoId)) : cur.apimo_id;
    await pool.query(
      `UPDATE biens SET adresse=$1, loyer=$2, charges=$3, criteres=$4, apimo_id=$5, updated_at=now() WHERE id=$6`,
      [adresse, loyer, charges, JSON.stringify(criteres), apimoId, id]
    );

    // Loyer, charges ou critères changés : on recalcule le score de chaque
    // candidat déjà analysé à partir de sa synthèse et de sa cohérence déjà
    // extraites (aucune ré-extraction de document, donc aucun coût API).
    const loyerChange = Number(cur.loyer) !== loyer;
    const chargesChange = Number(cur.charges) !== charges;
    const criteresChange = JSON.stringify(cur.criteres) !== JSON.stringify(criteres);
    let rescored = 0;
    if (loyerChange || chargesChange || criteresChange) {
      const cands = await pool.query(
        `SELECT id, synthese, coherence FROM candidats WHERE bien_id = $1 AND synthese IS NOT NULL`,
        [id]
      );
      for (const c of cands.rows) {
        const synthese = (c.synthese ?? []) as SynthesePersonne[];
        const coherence = (c.coherence ?? []) as CoherenceCheck[];
        const score = scoreCandidat({ loyer, charges, criteres }, synthese, coherence);
        await pool.query(`UPDATE candidats SET score = $1 WHERE id = $2`, [JSON.stringify(score), c.id]);
        rescored++;
      }
    }
    return NextResponse.json({ ok: true, rescored });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    await pool.query(`DELETE FROM biens WHERE id = $1`, [Number(params.id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
