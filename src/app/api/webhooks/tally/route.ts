import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { ensureSchema, pool } from "@/lib/db";
import { hasAnthropicKey, isSupportedMime } from "@/lib/extract";
import { analyseCandidat } from "@/lib/analyse";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // même plafond que l'upload manuel

/** Un champ de la soumission Tally (payload webhook FORM_RESPONSE). */
type TallyField = {
  key: string;
  label: string;
  type: string;
  value: unknown;
};

type TallyFile = { id: string; name: string; url: string; mimeType: string; size: number };

/**
 * Signature Tally : en-tête `tally-signature` = HMAC-SHA256 du corps brut,
 * encodé en base64, avec le signing secret du webhook. Si le secret n'est pas
 * configuré côté serveur, on refuse tout (le webhook serait sinon un point
 * d'injection ouvert de faux candidats).
 */
function signatureValide(rawBody: string, header: string | null): boolean {
  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) return false;
  if (!header) return false;
  const attendu = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(attendu);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Concatène les noms saisis (personne 1 + éventuelle personne 2) en nom de dossier. */
function nomDossier(fields: TallyField[]): string {
  const noms = fields
    .filter((f) => f.type === "INPUT_TEXT" && /nom/i.test(f.label))
    .map((f) => texte(f.value))
    .filter(Boolean);
  return noms.join(" et ");
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const rawBody = await req.text();
    if (!signatureValide(rawBody, req.headers.get("tally-signature"))) {
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    if (payload?.eventType !== "FORM_RESPONSE") {
      return NextResponse.json({ ok: true, ignored: "eventType" });
    }
    const data = payload.data ?? {};
    const fields: TallyField[] = Array.isArray(data.fields) ? data.fields : [];
    const submissionId = String(data.submissionId ?? data.responseId ?? payload.eventId ?? "");
    if (!submissionId) return NextResponse.json({ error: "submissionId manquant" }, { status: 400 });

    // Idempotence : Tally rejoue les webhooks en cas d'échec, on ne crée
    // jamais deux dossiers pour la même soumission.
    const deja = await pool.query(`SELECT id FROM candidats WHERE tally_submission_id = $1`, [submissionId]);
    if (deja.rows.length) {
      return NextResponse.json({ ok: true, candidatId: deja.rows[0].id, dejaTraite: true });
    }

    // Champ caché `bien` = id du bien RETINA, porté par le lien de candidature
    // (tally.so/r/xxx?bien=12) envoyé aux candidats.
    const bienField = fields.find((f) => f.type === "HIDDEN_FIELDS" && /^bien$/i.test(f.label));
    const bienId = Number(texte(bienField?.value));
    const bien = bienId
      ? await pool.query(`SELECT id FROM biens WHERE id = $1`, [bienId])
      : { rows: [] as { id: number }[] };
    if (!bien.rows.length) {
      // 200 volontaire : un bien inconnu/supprimé ne se réparera pas en
      // rejouant le webhook, inutile que Tally réessaie.
      return NextResponse.json({ ok: false, error: `Bien introuvable (champ caché bien=${texte(bienField?.value) || "absent"})` });
    }

    const email = texte(fields.find((f) => f.type === "INPUT_EMAIL")?.value) || null;
    const telephone = texte(fields.find((f) => f.type === "INPUT_PHONE_NUMBER")?.value) || null;
    const nom = nomDossier(fields) || email || "Candidature en ligne";

    const insert = await pool.query(
      `INSERT INTO candidats (bien_id, nom, email, telephone, source, tally_submission_id)
       VALUES ($1,$2,$3,$4,'tally',$5)
       ON CONFLICT (tally_submission_id) WHERE tally_submission_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [bienId, nom, email, telephone, submissionId]
    );
    if (!insert.rows.length) {
      // Course entre deux livraisons du même webhook : l'autre a gagné.
      return NextResponse.json({ ok: true, dejaTraite: true });
    }
    const candidatId: number = insert.rows[0].id;

    // Téléchargement des fichiers uploadés depuis le stockage Tally (les URLs
    // du payload webhook portent un token d'accès). Type `auto` + personne `?` :
    // c'est le pipeline batch existant (classification puis extraction) qui
    // détermine le contenu et rattache A/B par le nom.
    const files = fields
      .filter((f) => f.type === "FILE_UPLOAD" && Array.isArray(f.value))
      .flatMap((f) => f.value as TallyFile[]);
    const ignores: string[] = [];
    let stockes = 0;
    for (const file of files) {
      try {
        const mime = file.mimeType || "application/octet-stream";
        if (!isSupportedMime(mime)) {
          ignores.push(`${file.name} : format non pris en charge (${mime})`);
          continue;
        }
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const content = Buffer.from(await res.arrayBuffer());
        if (content.length > MAX_BYTES) {
          ignores.push(`${file.name} : fichier trop lourd (max 15 Mo)`);
          continue;
        }
        await pool.query(
          `INSERT INTO documents (candidat_id, personne, type, filename, mime, size_bytes, content)
           VALUES ($1,'?','auto',$2,$3,$4,$5)`,
          [candidatId, file.name, mime, content.length, content]
        );
        stockes++;
      } catch (e: any) {
        ignores.push(`${file.name} : téléchargement impossible (${String(e?.message ?? e).slice(0, 120)})`);
      }
    }

    // Analyse automatique en arrière-plan : on répond tout de suite à Tally
    // (timeout webhook 10 s), l'extraction prend quelques dizaines de secondes.
    if (stockes > 0 && hasAnthropicKey()) {
      analyseCandidat(candidatId).catch(async (e) => {
        await pool
          .query(`UPDATE candidats SET statut = 'erreur_document' WHERE id = $1 AND score IS NULL`, [candidatId])
          .catch(() => {});
        console.error(`Webhook Tally : analyse du candidat ${candidatId} en échec :`, e);
      });
    }

    return NextResponse.json({ ok: true, candidatId, documents: stockes, ignores });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
