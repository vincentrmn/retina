import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { DEFAULT_CRITERES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    const { rows } = await pool.query(`SELECT * FROM biens WHERE id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Bien introuvable" }, { status: 404 });
    const candidats = await pool.query(
      `SELECT c.id, c.nom, c.statut, c.score, c.analysed_at, c.created_at,
              COUNT(d.id)::int AS nb_documents
         FROM candidats c
         LEFT JOIN documents d ON d.candidat_id = c.id
        WHERE c.bien_id = $1
        GROUP BY c.id
        ORDER BY COALESCE((c.score->>'total')::numeric, -1) DESC, c.created_at ASC`,
      [id]
    );
    return NextResponse.json({ ...rows[0], candidats: candidats.rows });
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
    const criteres = { ...DEFAULT_CRITERES, ...cur.criteres, ...(body.criteres ?? {}) };
    await pool.query(
      `UPDATE biens SET adresse=$1, loyer=$2, charges=$3, criteres=$4, updated_at=now() WHERE id=$5`,
      [adresse, loyer, charges, JSON.stringify(criteres), id]
    );
    return NextResponse.json({ ok: true });
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
