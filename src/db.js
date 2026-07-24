import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureSchema() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS feedback_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_uuid UUID NOT NULL,
      feedback TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      category TEXT,
      actionability SMALLINT,
      status TEXT NOT NULL DEFAULT 'pending',
      batch_id TEXT,
      custom_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      scored_at TIMESTAMPTZ
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS feedback_entries_status_idx
      ON feedback_entries (status);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS feedback_entries_created_at_idx
      ON feedback_entries (created_at DESC);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS feedback_entries_batch_id_idx
      ON feedback_entries (batch_id)
      WHERE batch_id IS NOT NULL;
  `);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
