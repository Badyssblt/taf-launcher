import { buildApp } from './app.js';
import { seedAdmin } from './bootstrap.js';
import { loadConfig } from './config.js';
import { loadKeys } from './crypto.js';
import { createPool, migrate } from './db.js';
import { GithubReleases } from './github.js';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
const keys = loadKeys(config);

await migrate(db, (m) => console.log(m));
await seedAdmin(db, config, (m) => console.log(m));

const app = await buildApp({ config, db, keys, github: new GithubReleases(config) }, { logger: true });
await app.listen({ port: config.PORT, host: config.HOST });

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
