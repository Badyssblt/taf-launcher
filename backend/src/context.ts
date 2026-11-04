import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Keys } from './crypto.js';
import type { Db } from './db.js';
import type { GithubReleases } from './github.js';

export interface Ctx {
  config: Config;
  db: Db;
  keys: Keys;
  github: GithubReleases;
}

export interface AccountRow {
  id: string;
  pseudo: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  disabled: boolean;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  last_login_at: Date | null;
}

export const accountDto = (a: AccountRow) => ({
  id: a.id,
  pseudo: a.pseudo,
  email: a.email,
  role: a.role,
  disabled: a.disabled,
  mustChangePassword: a.must_change_password,
  createdAt: a.created_at,
  lastLoginAt: a.last_login_at,
});

declare module 'fastify' {
  interface FastifyRequest {
    account?: AccountRow;
  }
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
