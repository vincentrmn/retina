import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { DEFAULT_CRITERES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await pool.query(`
      SELECT b.*,
             COUNT(c.id)::int AS nb_candidats,
             COUNT(c.id) FILTER (WHERE c.score IS NOT NULL)::int AS nb_analyses
        FROM biens b
        LEFT JOIN candidats c ON c.bien_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at DESC
    `);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const adresse = String(body.adresse ?? "").trim();
    const loyer = Number(body.loyer);
    const charges = Number(body.charges ?? 0);
    if (!adresse) return NextResponse.json({ error: "Adresse obligatoire" }, { status: 400 });
    if (!isFinite(loyer) || loyer <= 0) return NextResponse.json({ error: "Loyer invalide" }, { status: 400 });
    const criteres = { ...DEFAULT_CRITERES, ...(body.criteres ?? {}) };
    const { rows } = await pool.query(
      `INSERT INTO biens (adresse, loyer, charges, criteres) VALUES ($1,$2,$3,$4) RETURNING id`,
      [adresse, loyer, isFinite(charges) ? charges : 0, JSON.stringify(criteres)]
    );
    return NextResponse.json({ id: rows[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
