import { pool } from "@/lib/db";
import { extractDocument, extractDocumentAuto } from "@/lib/extract";
import { buildCoherence, buildCompletude, buildSynthese } from "@/lib/synthese";
import { scoreCandidat } from "@/lib/scoring";
import type { CompletudeItem, DocType, DocumentMeta, Score } from "@/lib/types";

const DOC_COLUMNS = `id, candidat_id, personne, type, filename, mime, size_bytes,
              extraction, extraction_status, extraction_error, uploaded_at`;

export type ResultatAnalyse = {
  statut: "analyse" | "erreur_document";
  score: Score;
  synthese: ReturnType<typeof buildSynthese>;
  coherence: ReturnType<typeof buildCoherence>;
  completude: CompletudeItem[];
  documents: DocumentMeta[];
};

/**
 * Analyse d'un dossier candidat :
 *  1. extraction Claude des documents pas encore extraits (ou tous si force),
 *     avec détection automatique du type pour les uploads en batch,
 *  2. rattachement automatique des documents aux personnes A/B (par le nom),
 *  3. synthèse + contrôles de cohérence + complétude (code),
 *  4. score (code).
 * Utilisée par la route /api/candidats/[id]/analyze (bouton Analyser) et par
 * le webhook Tally (analyse automatique à la réception d'une candidature).
 */
export async function analyseCandidat(id: number, force = false): Promise<ResultatAnalyse | null> {
  const cand = await pool.query(
    `SELECT c.id, b.loyer, b.charges, b.criteres
       FROM candidats c JOIN biens b ON b.id = c.bien_id
      WHERE c.id = $1`,
    [id]
  );
  if (!cand.rows.length) return null;
  const bien = cand.rows[0];

  const pending = await pool.query(
    `SELECT id, type, mime, content FROM documents
      WHERE candidat_id = $1 ${force ? "" : "AND extraction_status <> 'done'"}
      ORDER BY id`,
    [id]
  );

  // Extraction séquentielle par paquets de 2 : garde la latence raisonnable
  // sans taper les rate limits.
  const docs = pending.rows as {
    id: number;
    type: DocType | "auto" | "autre" | "dossier";
    mime: string;
    content: Buffer;
  }[];
  // Types « legacy » rattachés à la main (un fichier = un type) : passent par
  // l'extraction TYPÉE. Tout le reste — 'auto' (pas encore extrait), 'autre'
  // (rien d'exploitable) ET 'dossier' (fichier multi-documents déjà extrait en
  // batch) — passe par l'extraction batch. En particulier un 'dossier' réextrait
  // (force) doit repasser par le batch : `extractDocument('dossier')` chercherait
  // un schéma/prompt inexistant et enverrait un prompt vide (400 API).
  const TYPES_LEGACY: readonly string[] = ["fiche_paie", "contrat", "piece_identite"];
  for (let i = 0; i < docs.length; i += 2) {
    await Promise.all(
      docs.slice(i, i + 2).map(async (d) => {
        try {
          if (!TYPES_LEGACY.includes(d.type)) {
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
            const extraction = await extractDocument(d.type as DocType, d.mime, d.content);
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

  // Le rattachement A/B est calculé par la synthèse (au niveau de chaque
  // document extrait, par le nom) — plus besoin de le figer sur les lignes.
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

  return { statut, score, synthese, coherence, completude, documents: meta };
}
