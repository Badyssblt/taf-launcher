// PostgreSQL local pour le developpement, sans Docker (binaires embarques).
// Lance : npm run dev:db  -> postgres://postgres:postgres@127.0.0.1:54329/taf
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const databaseDir = '.data/pg';
const fresh = !existsSync(databaseDir);
// UTF-8 force : sous Windows initdb choisit sinon WIN1252, ce qui rejette certains caracteres (la prod est en UTF-8).
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('taf');
console.log('PostgreSQL pret sur postgres://postgres:postgres@127.0.0.1:54329/taf (Ctrl+C pour arreter)');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
