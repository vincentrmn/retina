import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { buildCompletude } from "@/lib/synthese";
import { scoreCandidat } from "@/lib/scoring";
import type { CoherenceCheck, DocumentMeta, SynthesePersonne } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUTS = ["en_attente", "analyse", "erreur_document"];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    const { rows } = await pool.query(
      `SELECT c.*, b.adresse, b.loyer, b.charges, b.criteres
         FROM candidats c JOIN biens b ON b.id = c.bien_id
        WHERE c.id = $1`,
      [id]
    );
    if (!rows.length) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    // Métadonnées seulement — jamais le BYTEA dans le JSON.
    const docs = await pool.query(
      `SELECT id, candidat_id, personne, type, filename, mime, size_bytes,
              extraction, extraction_status, extraction_error, uploaded_at
         FROM documents WHERE candidat_id = $1
        ORDER BY personne, type, uploaded_at`,
      [id]
    );
    const meta = docs.rows as DocumentMeta[];
    const analysed = meta.some((d) => d.extraction_status === "done");
    return NextResponse.json({
      ...rows[0],
      documents: meta,
      completude: analysed ? buildCompletude(meta) : null,
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
    if (body.nom != null) {
      await pool.query(`UPDATE candidats SET nom = $1 WHERE id = $2`, [String(body.nom).trim(), id]);
    }
    if (body.statut != null) {
      if (!STATUTS.includes(body.statut)) return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
      await pool.query(`UPDATE candidats SET statut = $1 WHERE id = $2`, [body.statut, id]);
    }

    // Validation manuelle d'une incohérence : on marque le contrôle comme ignoré
    // et on recalcule le score depuis la synthèse déjà stockée (zéro coût API).
    if (typeof body.ignoreCoherence === "number") {
      const { rows } = await pool.query(
        `SELECT c.synthese, c.coherence, b.loyer, b.charges, b.criteres
           FROM candidats c JOIN biens b ON b.id = c.bien_id
          WHERE c.id = $1`,
        [id]
      );
      if (!rows.length) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
      const synthese = (rows[0].synthese ?? []) as SynthesePersonne[];
      const coherence = (rows[0].coherence ?? []) as CoherenceCheck[];
      const i = body.ignoreCoherence;
      if (i < 0 || i >= coherence.length) return NextResponse.json({ error: "Contrôle introuvable" }, { status: 400 });
      coherence[i] = { ...coherence[i], ignored: body.ignored !== false };
      const score = scoreCandidat(rows[0], synthese, coherence);
      await pool.query(`UPDATE candidats SET coherence = $1, score = $2 WHERE id = $3`, [
        JSON.stringify(coherence),
        JSON.stringify(score),
        id,
      ]);
      return NextResponse.json({ ok: true, coherence, score });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    // CASCADE : supprime aussi tous les documents du dossier (RGPD).
    await pool.query(`DELETE FROM candidats WHERE id = $1`, [Number(params.id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
