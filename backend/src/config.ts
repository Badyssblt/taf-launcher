import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@127.0.0.1:54329/taf'),
  // Cle privee Ed25519 (PEM PKCS8, brut ou encode en base64). Obligatoire en production.
  SIGNING_KEY: z.string().optional(),
  PUBLIC_URL: z.string().default('https://launcher.badyssblilita.fr'),
  // Origines CORS autorisees, separees par des virgules (le launcher Tauri passe surtout par plugin-http).
  CORS_ORIGINS: z
    .string()
    .default('http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:1420'),
  TRUST_PROXY: z.string().default('true'),
  ACCESS_TTL_SECONDS: z.coerce.number().default(15 * 60),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  TICKET_TTL_SECONDS: z.coerce.number().default(5 * 60),
  LOGIN_MAX_FAILS: z.coerce.number().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().default(15),
  // Facultatif : releve la limite de l'API GitHub (60 requetes/h sans jeton).
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CACHE_SECONDS: z.coerce.number().default(300),
  // Creation automatique du premier admin si aucun compte admin n'existe.
  ADMIN_PSEUDO: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { isProd: boolean; corsOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(env);
  return {
    ...parsed,
    isProd: parsed.NODE_ENV === 'production',
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
