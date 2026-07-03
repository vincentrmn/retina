import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT filename, mime, content FROM documents WHERE id = $1`,
      [Number(params.id)]
    );
    if (!rows.length) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    const { filename, mime, content } = rows[0];
    return new NextResponse(content, {
      headers: {
        "content-type": mime,
        "content-disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
