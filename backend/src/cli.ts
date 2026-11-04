// Outils en ligne de commande :
//   node dist/cli.js create-admin <pseudo> <email> [motdepasse]
//   node dist/cli.js reset-password <pseudo> [motdepasse]
import { loadConfig } from './config.js';
import { generatePassword, hashPassword } from './crypto.js';
import { createPool, migrate } from './db.js';

const [cmd, ...args] = process.argv.slice(2);
const config = loadConfig();
const db = createPool(config.DATABASE_URL);

try {
  await migrate(db);
  if (cmd === 'create-admin') {
    const [pseudo, email, pwd] = args;
    if (!pseudo || !email) throw new Error('usage: create-admin <pseudo> <email> [motdepasse]');
    const password = pwd ?? generatePassword();
    await db.query("insert into accounts (pseudo, email, password_hash, role) values ($1, $2, $3, 'admin')", [
      pseudo,
      email,
      await hashPassword(password),
    ]);
    console.log(`Admin "${pseudo}" cree. Mot de passe temporaire : ${password}`);
  } else if (cmd === 'reset-password') {
    const [pseudo, pwd] = args;
    if (!pseudo) throw new Error('usage: reset-password <pseudo> [motdepasse]');
    const password = pwd ?? generatePassword();
    const res = await db.query(
      'update accounts set password_hash = $2, must_change_password = true, failed_attempts = 0, locked_until = null where lower(pseudo) = lower($1)',
      [pseudo, await hashPassword(password)],
    );
    if (!res.rowCount) throw new Error('compte introuvable');
    console.log(`Mot de passe temporaire de "${pseudo}" : ${password}`);
  } else {
    console.log('Commandes : create-admin <pseudo> <email> [mdp] | reset-password <pseudo> [mdp]');
    process.exitCode = 1;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
