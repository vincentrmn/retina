import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { hasAnthropicKey } from "@/lib/extract";
import { analyseCandidat } from "@/lib/analyse";

export const dynamic = "force-dynamic";

/**
 * Lance l'analyse d'un dossier EN ARRIÈRE-PLAN (voir lib/analyse.ts, partagé
 * avec le webhook Tally) : la réponse est immédiate, le statut passe à
 * `analyse_en_cours`, et le front peut quitter la page sans interrompre
 * l'analyse. Les pages pollent le statut pour afficher la progression.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const id = Number(params.id);
    if (!hasAnthropicKey()) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY absente côté serveur : extraction désactivée." },
        { status: 503 }
      );
    }

    let force = false;
    try {
      force = !!(await req.json())?.force;
    } catch {
      /* corps vide accepté */
    }

    // Garde anti-double-lancement : une analyse déjà en cours reste seule.
    const cur = await pool.query(`SELECT statut FROM candidats WHERE id = $1`, [id]);
    if (!cur.rows.length) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    if (cur.rows[0].statut === "analyse_en_cours") {
      return NextResponse.json({ ok: true, enCours: true });
    }

    await pool.query(`UPDATE candidats SET statut = 'analyse_en_cours' WHERE id = $1`, [id]);
    analyseCandidat(id, force).catch(async (e) => {
      await pool
        .query(`UPDATE candidats SET statut = 'erreur_document' WHERE id = $1 AND statut = 'analyse_en_cours'`, [id])
        .catch(() => {});
      console.error(`Analyse du candidat ${id} en échec :`, e);
    });
    return NextResponse.json({ ok: true, started: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
