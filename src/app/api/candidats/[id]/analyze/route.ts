import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { hasAnthropicKey } from "@/lib/extract";
import { analyseCandidat } from "@/lib/analyse";

export const dynamic = "force-dynamic";

/**
 * Analyse d'un dossier candidat (voir lib/analyse.ts, partagé avec le webhook
 * Tally). L'appel est synchrone (quelques dizaines de secondes pour un dossier
 * couple) : le front affiche un spinner.
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

    const resultat = await analyseCandidat(id, force);
    if (!resultat) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true, ...resultat });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
