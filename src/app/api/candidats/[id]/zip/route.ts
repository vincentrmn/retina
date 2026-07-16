import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { ensureSchema, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nom de fichier sans caractères gênants pour un en-tête ou un système de fichiers. */
function sain(nom: string): string {
  return nom.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "document";
}

/**
 * Tous les documents d'un dossier candidat en une archive zip : permet à
 * Shawna de les récupérer d'un clic pour les stocker ou les transmettre
 * ailleurs (les originaux restent en base).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    const cand = await pool.query(`SELECT nom FROM candidats WHERE id = $1`, [id]);
    if (!cand.rows.length) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });

    const docs = await pool.query(
      `SELECT filename, content FROM documents WHERE candidat_id = $1 ORDER BY id`,
      [id]
    );
    if (!docs.rows.length) return NextResponse.json({ error: "Aucun document dans ce dossier" }, { status: 404 });

    const zip = new JSZip();
    const dejaVus = new Map<string, number>();
    for (const d of docs.rows) {
      // Deux uploads peuvent porter le même nom de fichier : on suffixe.
      let nom = sain(d.filename);
      const n = dejaVus.get(nom) ?? 0;
      dejaVus.set(nom, n + 1);
      if (n > 0) {
        const point = nom.lastIndexOf(".");
        nom = point > 0 ? `${nom.slice(0, point)} (${n + 1})${nom.slice(point)}` : `${nom} (${n + 1})`;
      }
      zip.file(nom, d.content as Buffer);
    }

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(archive as unknown as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="dossier-${sain(cand.rows[0].nom).replace(/"/g, "")}.zip"`,
        "content-length": String(archive.length),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
