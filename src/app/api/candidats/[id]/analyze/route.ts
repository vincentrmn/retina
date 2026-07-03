import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { extractDocument, extractDocumentAuto, hasAnthropicKey } from "@/lib/extract";
import { assignPersonnes, buildCoherence, buildCompletude, buildSynthese } from "@/lib/synthese";
import { scoreCandidat } from "@/lib/scoring";
import type { DocType, DocumentMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

const DOC_COLUMNS = `id, candidat_id, personne, type, filename, mime, size_bytes,
              extraction, extraction_status, extraction_error, uploaded_at`;

/**
 * Analyse d'un dossier candidat :
 *  1. extraction Claude des documents pas encore extraits (ou tous si force),
 *     avec détection automatique du type pour les uploads en batch,
 *  2. rattachement automatique des documents aux personnes A/B (par le nom),
 *  3. synthèse + contrôles de cohérence + complétude (code),
 *  4. score (code).
 * L'appel est synchrone (quelques dizaines de secondes pour un dossier
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

    const cand = await pool.query(
      `SELECT c.id, b.loyer, b.charges, b.criteres
         FROM candidats c JOIN biens b ON b.id = c.bien_id
        WHERE c.id = $1`,
      [id]
    );
    if (!cand.rows.length) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    const bien = cand.rows[0];

    let force = false;
    try {
      force = !!(await req.json())?.force;
    } catch {
      /* corps vide accepté */
    }

    const pending = await pool.query(
      `SELECT id, type, mime, content FROM documents
        WHERE candidat_id = $1 ${force ? "" : "AND extraction_status <> 'done'"}
        ORDER BY id`,
      [id]
    );

    // Extraction séquentielle par paquets de 2 : garde la latence raisonnable
    // sans taper les rate limits.
    const docs = pending.rows as { id: number; type: DocType | "auto" | "autre"; mime: string; content: Buffer }[];
    for (let i = 0; i < docs.length; i += 2) {
      await Promise.all(
        docs.slice(i, i + 2).map(async (d) => {
          try {
            if (d.type === "auto" || d.type === "autre") {
              // Batch : le modèle détermine le type du document.
              const { type, extraction } = await extractDocumentAuto(d.mime, d.content);
              if (type === "autre" || !extraction) {
                await pool.query(
                  `UPDATE documents SET type = 'autre', extraction = NULL, extraction_status = 'done', extraction_error = NULL WHERE id = $1`,
                  [d.id]
                );
              } else {
                await pool.query(
                  `UPDATE documents SET type = $1, extraction = $2, extraction_status = 'done', extraction_error = NULL WHERE id = $3`,
                  [type, JSON.stringify(extraction), d.id]
                );
              }
            } else {
              const extraction = await extractDocument(d.type, d.mime, d.content);
              await pool.query(
                `UPDATE documents SET extraction = $1, extraction_status = 'done', extraction_error = NULL WHERE id = $2`,
                [JSON.stringify(extraction), d.id]
              );
            }
          } catch (e: any) {
            await pool.query(
              `UPDATE documents SET extraction_status = 'error', extraction_error = $1 WHERE id = $2`,
              [String(e.message ?? e).slice(0, 500), d.id]
            );
          }
        })
      );
    }

    // Rattachement automatique des documents `?` aux personnes A/B (par nom).
    const afterExtract = await pool.query(
      `SELECT ${DOC_COLUMNS} FROM documents WHERE candidat_id = $1`,
      [id]
    );
    for (const a of assignPersonnes(afterExtract.rows as DocumentMeta[])) {
      await pool.query(`UPDATE documents SET personne = $1 WHERE id = $2`, [a.personne, a.docId]);
    }

    const all = await pool.query(`SELECT ${DOC_COLUMNS} FROM documents WHERE candidat_id = $1`, [id]);
    const meta = all.rows as DocumentMeta[];
    const synthese = buildSynthese(meta);
    const coherence = buildCoherence(meta);
    const completude = buildCompletude(meta);
    const score = scoreCandidat(bien, synthese, coherence);
    const hasError = meta.some((d) => d.extraction_status === "error");
    const statut = hasError ? "erreur_document" : "analyse";

    await pool.query(
      `UPDATE candidats SET synthese=$1, coherence=$2, score=$3, statut=$4, analysed_at=now() WHERE id=$5`,
      [JSON.stringify(synthese), JSON.stringify(coherence), JSON.stringify(score), statut, id]
    );

    return NextResponse.json({ ok: true, statut, score, synthese, coherence, completude, documents: meta });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
