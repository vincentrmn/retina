import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Lien court de candidature : /c/12 redirige vers le formulaire Tally avec les
 * champs cachés du bien (id + adresse affichée dans le texte d'accueil). C'est
 * ce lien que Shawna copie et envoie aux candidats : court, lisible, et si le
 * formulaire change un jour, les liens déjà envoyés continuent de marcher.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    const formId = process.env.TALLY_FORM_ID;
    if (!formId) {
      return NextResponse.json({ error: "TALLY_FORM_ID absent côté serveur : candidature en ligne désactivée." }, { status: 503 });
    }
    const { rows } = await pool.query(`SELECT adresse FROM biens WHERE id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Bien introuvable" }, { status: 404 });
    return NextResponse.redirect(
      `https://tally.so/r/${formId}?bien=${id}&adresse=${encodeURIComponent(rows[0].adresse)}`,
      302
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
