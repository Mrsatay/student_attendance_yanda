import { readFile } from 'node:fs/promises';
import session from 'express-session';

export async function migrateLearning(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7310981)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const version of ['001-learning']) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
      if (!existing.rowCount) {
        await client.query(await readFile(new URL(`../migrations/${version}.sql`, import.meta.url), 'utf8'));
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export class PostgresSessionStore extends session.Store {
  constructor(pool) { super(); this.pool = pool; }
  get(sid, callback) {
    this.pool.query('SELECT data FROM web_sessions WHERE sid=$1 AND expires_at>now()', [sid]).then((r) => callback(null, r.rows[0]?.data || null), callback);
  }
  set(sid, data, callback = () => {}) {
    const expires = data.cookie.expires || new Date(Date.now() + 28800000);
    this.pool.query('INSERT INTO web_sessions VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET data=$2, expires_at=$3', [sid, data, expires]).then(() => callback(), callback);
  }
  destroy(sid, callback = () => {}) { this.pool.query('DELETE FROM web_sessions WHERE sid=$1', [sid]).then(() => callback(), callback); }
  touch(sid, data, callback = () => {}) { this.set(sid, data, callback); }
}
