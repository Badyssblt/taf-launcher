import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { AUDIENCE_LAUNCHER, newOpaqueToken, sha256, signToken, verifyToken } from './crypto.js';
import { HttpError, accountDto, type AccountRow, type Ctx } from './context.js';

export async function issueSession(ctx: Ctx, account: AccountRow, userAgent: string | undefined, familyId?: string) {
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + ctx.config.REFRESH_TTL_DAYS * 86_400_000);
  await ctx.db.query(
    'insert into refresh_tokens (account_id, family_id, token_hash, expires_at, user_agent) values ($1, $2, $3, $4, $5)',
    [account.id, familyId ?? randomUUID(), sha256(refreshToken), expiresAt, userAgent?.slice(0, 200) ?? null],
  );
  const accessToken = await signToken(ctx.keys, ctx.config, {
    type: 'access',
    audience: AUDIENCE_LAUNCHER,
    subject: account.id,
    ttlSeconds: ctx.config.ACCESS_TTL_SECONDS,
    claims: { role: account.role },
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: ctx.config.ACCESS_TTL_SECONDS,
    account: accountDto(account),
  };
}

export async function rotateRefreshToken(ctx: Ctx, token: string, userAgent: string | undefined) {
  const { rows } = await ctx.db.query<{
    id: string;
    account_id: string;
    family_id: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>('select id, account_id, family_id, expires_at, revoked_at from refresh_tokens where token_hash = $1', [sha256(token)]);
  const row = rows[0];
  if (!row) throw new HttpError(401, 'invalid_refresh', 'Session invalide');
  if (row.revoked_at) {
    // Jeton deja utilise : possible vol, on coupe toute la famille.
    await ctx.db.query('update refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null', [row.family_id]);
    throw new HttpError(401, 'invalid_refresh', 'Session expirée');
  }
  if (row.expires_at.getTime() < Date.now()) throw new HttpError(401, 'invalid_refresh', 'Session expirée');
  const account = await getAccount(ctx, row.account_id);
  if (!account || account.disabled) throw new HttpError(401, 'invalid_refresh', 'Compte désactivé');
  await ctx.db.query('update refresh_tokens set revoked_at = now() where id = $1', [row.id]);
  return issueSession(ctx, account, userAgent, row.family_id);
}

export async function getAccount(ctx: Ctx, id: string): Promise<AccountRow | null> {
  const { rows } = await ctx.db.query<AccountRow>('select * from accounts where id = $1', [id]);
  return rows[0] ?? null;
}

export function authenticate(ctx: Ctx) {
  return async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'Connexion requise');
    let sub: string | undefined;
    try {
      const payload = await verifyToken(ctx.keys, ctx.config, header.slice(7), AUDIENCE_LAUNCHER, 'access');
      sub = payload.sub;
    } catch {
      throw new HttpError(401, 'unauthorized', 'Session expirée');
    }
    const account = sub ? await getAccount(ctx, sub) : null;
    if (!account || account.disabled) throw new HttpError(401, 'unauthorized', 'Compte désactivé');
    req.account = account;
  };
}

export function requireAdmin(ctx: Ctx) {
  const auth = authenticate(ctx);
  return async (req: FastifyRequest) => {
    await auth(req);
    if (req.account?.role !== 'admin') throw new HttpError(403, 'forbidden', 'Réservé aux administrateurs');
  };
}
