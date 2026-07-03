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
    })();
  }
  return global._retinaSchema;
}
