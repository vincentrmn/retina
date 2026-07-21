import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _retinaPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _retinaSchema: Promise<void> | undefined;
}

export const pool =
  global._retinaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") global._retinaPool = pool;

/**
 * Schéma RETINA. Migrations idempotentes (ADD COLUMN IF NOT EXISTS), même
 * pattern que SCOUT/VESPER.
 *
 * biens ── candidats (1 dossier = souvent un couple, personnes A/B)
 *              └── documents (fichiers uploadés, stockés en BYTEA + extraction JSON)
 *
 * RGPD : pièces d'identité et bulletins = données sensibles. Les documents
 * vivent en base (pas de fs Railway, éphémère) et la suppression d'un candidat
 * CASCADE sur ses documents — un dossier s'efface d'un DELETE.
 */
export function ensureSchema(): Promise<void> {
  if (!global._retinaSchema) {
    global._retinaSchema = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS biens (
          id          SERIAL PRIMARY KEY,
          adresse     TEXT NOT NULL,
          loyer       NUMERIC NOT NULL,
          charges     NUMERIC NOT NULL DEFAULT 0,
          criteres    JSONB NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS candidats (
          id          SERIAL PRIMARY KEY,
          bien_id     INTEGER NOT NULL REFERENCES biens(id) ON DELETE CASCADE,
          nom         TEXT NOT NULL,
          statut      TEXT NOT NULL DEFAULT 'en_attente',
          synthese    JSONB,
          coherence   JSONB,
          score       JSONB,
          analysed_at TIMESTAMPTZ,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS candidats_bien_idx ON candidats (bien_id);`);

      // content en BYTEA : les scans restent côté serveur, servis par
      // /api/documents/[id]/file. extraction = JSON brut retourné par le
      // modèle, stocké tel quel pour audit.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id                SERIAL PRIMARY KEY,
          candidat_id       INTEGER NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
          personne          TEXT NOT NULL,
          type              TEXT NOT NULL,
          filename          TEXT NOT NULL,
          mime              TEXT NOT NULL,
          size_bytes        INTEGER NOT NULL,
          content           BYTEA NOT NULL,
          extraction        JSONB,
          extraction_status TEXT NOT NULL DEFAULT 'pending',
          extraction_error  TEXT,
          uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS documents_candidat_idx ON documents (candidat_id);`);

      // Intégration Apimo : les biens à la location importés depuis l'API
      // Apimo portent leur id Apimo (dédoublonnage à la synchro).
      await pool.query(`ALTER TABLE biens ADD COLUMN IF NOT EXISTS apimo_id BIGINT;`);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS biens_apimo_idx ON biens (apimo_id) WHERE apimo_id IS NOT NULL;`
      );

      // Intégration Tally : les candidats arrivent aussi par le formulaire de
      // candidature en ligne (webhook). email/telephone pour recontacter (et
      // demain synchroniser vers Pipedrive), tally_submission_id pour
      // l'idempotence (Tally rejoue les webhooks en cas d'échec).
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS email TEXT;`);
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS telephone TEXT;`);
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manuel';`);
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS tally_submission_id TEXT;`);
      // Toutes les réponses du questionnaire (situation déclarée, projet
      // locatif...) : le Postgres RETINA remplace le Google Sheets.
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS tally_answers JSONB;`);
      // Suivi de Shawna : a-t-elle traité ce candidat (appel, mail...) ?
      // Ancien modèle binaire `traite` (conservé pour l'historique) remplacé par
      // un statut de suivi à plusieurs états (contacté / visite / dossier déposé /
      // KO ; NULL = pas encore traité).
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS traite BOOLEAN NOT NULL DEFAULT false;`);
      // Migration one-shot : à la création de la colonne `suivi`, on reprend les
      // candidats déjà marqués « traité » comme « contacté » (état le plus neutre
      // « quelque chose a été fait »). Gardée sous le garde `information_schema`
      // pour ne PAS écraser un suivi remis à NULL plus tard par Shawna.
      const avaitSuivi = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'candidats' AND column_name = 'suivi'`
      );
      await pool.query(`ALTER TABLE candidats ADD COLUMN IF NOT EXISTS suivi TEXT;`);
      if (!avaitSuivi.rows.length) {
        await pool.query(`UPDATE candidats SET suivi = 'contacte' WHERE traite = true`);
      }
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS candidats_tally_submission_idx ON candidats (tally_submission_id) WHERE tally_submission_id IS NOT NULL;`
      );
    })();
  }
  return global._retinaSchema;
}
