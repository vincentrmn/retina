import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { isSupportedMime } from "@/lib/extract";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // l'API Anthropic plafonne la requête à 32 MB
const TYPES = ["fiche_paie", "contrat", "piece_identite"];

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const form = await req.formData();
    const candidatId = Number(form.get("candidatId"));
    const personne = String(form.get("personne") ?? "");
    const type = String(form.get("type") ?? "");
    const file = form.get("file");

    if (!candidatId) return NextResponse.json({ error: "candidatId obligatoire" }, { status: 400 });
    if (!["A", "B"].includes(personne)) return NextResponse.json({ error: "Personne invalide (A ou B)" }, { status: 400 });
    if (!TYPES.includes(type)) return NextResponse.json({ error: "Type de document invalide" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop lourd (max 15 Mo)" }, { status: 400 });

    const mime = file.type || "application/octet-stream";
    if (!isSupportedMime(mime)) {
      return NextResponse.json({ error: `Format non pris en charge (${mime}). PDF ou image (JPEG/PNG/WebP).` }, { status: 400 });
    }

    const content = Buffer.from(await file.arrayBuffer());
    const { rows } = await pool.query(
      `INSERT INTO documents (candidat_id, personne, type, filename, mime, size_bytes, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [candidatId, personne, type, file.name, mime, file.size, content]
    );
    return NextResponse.json({ id: rows[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSchema();
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id obligatoire" }, { status: 400 });
    await pool.query(`DELETE FROM documents WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
