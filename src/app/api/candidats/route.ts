import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const bienId = Number(body.bienId);
    const nom = String(body.nom ?? "").trim();
    if (!bienId) return NextResponse.json({ error: "bienId obligatoire" }, { status: 400 });
    if (!nom) return NextResponse.json({ error: "Nom du candidat obligatoire" }, { status: 400 });
    const { rows } = await pool.query(
      `INSERT INTO candidats (bien_id, nom) VALUES ($1, $2) RETURNING id`,
      [bienId, nom]
    );
    return NextResponse.json({ id: rows[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
