import type { Config } from './config.js';
import type { Db } from './db.js';
import { hashPassword } from './crypto.js';

/** Cree le premier admin depuis ADMIN_PSEUDO / ADMIN_EMAIL / ADMIN_PASSWORD s'il n'existe aucun admin. */
export async function seedAdmin(db: Db, config: Config, log: (msg: string) => void = () => {}) {
  if (!config.ADMIN_PSEUDO || !config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) return;
  const { rows } = await db.query("select 1 from accounts where role = 'admin' limit 1");
  if (rows.length) return;
  await db.query(
    "insert into accounts (pseudo, email, password_hash, role, must_change_password) values ($1, $2, $3, 'admin', true)",
    [config.ADMIN_PSEUDO, config.ADMIN_EMAIL, await hashPassword(config.ADMIN_PASSWORD)],
  );
  log(`admin "${config.ADMIN_PSEUDO}" cree (mot de passe a changer a la premiere connexion)`);
}
