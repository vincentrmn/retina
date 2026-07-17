import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { buildCompletude } from "@/lib/synthese";
import { mailConfigured, sendMail } from "@/lib/mail";
import type { DocumentMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Relance le candidat par e-mail pour compléter son dossier : liste les
 * documents manquants (calculés par la complétude) et les envoie à l'adresse
 * fournie dans le formulaire de candidature, depuis la boîte Gmail de BBI.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    if (!mailConfigured()) {
      return NextResponse.json(
        { error: "L'envoi d'e-mail n'est pas encore configuré (identifiant Gmail BBI à renseigner)." },
        { status: 503 }
      );
    }
    const id = Number(params.id);
    const cand = await pool.query(
      `SELECT c.nom, c.email, b.adresse FROM candidats c JOIN biens b ON b.id = c.bien_id WHERE c.id = $1`,
      [id]
    );
    if (!cand.rows.length) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    const { nom, email, adresse } = cand.rows[0];
    if (!email) {
      return NextResponse.json(
        { error: "Ce candidat n'a pas d'adresse e-mail (dossier créé à la main, sans questionnaire)." },
        { status: 400 }
      );
    }

    const docs = await pool.query(
      `SELECT id, candidat_id, personne, type, filename, mime, size_bytes,
              extraction, extraction_status, extraction_error, uploaded_at
         FROM documents WHERE candidat_id = $1`,
      [id]
    );
    const completude = buildCompletude(docs.rows as DocumentMeta[]);
    const manquants = completude.filter((c) => c.statut !== "ok");
    if (!manquants.length) {
      return NextResponse.json({ error: "Le dossier est déjà complet : aucune relance nécessaire." }, { status: 400 });
    }

    // Regroupe les manques par personne pour un message lisible.
    const parPersonne = new Map<string, string[]>();
    for (const m of manquants) {
      const cle = m.personne === "A" ? "Candidat 1" : m.personne === "B" ? "Candidat 2" : "Dossier";
      if (!parPersonne.has(cle)) parPersonne.set(cle, []);
      parPersonne.get(cle)!.push(`- ${m.label} (${m.detail})`);
    }
    const blocs = [...parPersonne.entries()].map(([cle, lignes]) => `${cle} :\n${lignes.join("\n")}`).join("\n\n");

    const texte =
      `Bonjour,\n\n` +
      `Merci pour votre candidature à la location du bien situé à ${adresse}.\n\n` +
      `Pour finaliser l'étude de votre dossier, il nous manque les éléments suivants :\n\n` +
      `${blocs}\n\n` +
      `Vous pouvez nous les transmettre en réponse à cet e-mail. N'hésitez pas si vous avez la moindre question.\n\n` +
      `Bien à vous,\nL'équipe Brouwers Bureau Immobilier`;

    await sendMail({
      to: email,
      subject: `Votre dossier de location (${adresse}) : documents à compléter`,
      text: texte,
    });

    return NextResponse.json({ ok: true, email, manquants: manquants.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
