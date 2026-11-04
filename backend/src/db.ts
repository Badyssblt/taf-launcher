import pg from 'pg';
import { migrations } from './migrations.js';

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<void> {
  const client = await db.connect();
  try {
    // Verrou consultatif : un seul processus migre a la fois.
    await client.query('select pg_advisory_lock(727301)');
    await client.query(
      'create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())',
    );
    const done = new Set((await client.query<{ id: string }>('select id from schema_migrations')).rows.map((r) => r.id));
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      log(`migration ${m.id}`);
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query('insert into schema_migrations (id) values ($1)', [m.id]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
    }
    await client.query('select pg_advisory_unlock(727301)');
  } finally {
    client.release();
  }
}
