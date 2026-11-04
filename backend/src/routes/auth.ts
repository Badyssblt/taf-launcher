import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, issueSession, rotateRefreshToken } from '../auth.js';
import { HttpError, accountDto, type AccountRow, type Ctx } from '../context.js';
import { hashPassword, sha256, verifyPassword } from '../crypto.js';

const loginBody = z.object({ login: z.string().min(1).max(254), password: z.string().min(1).max(200) });
const refreshBody = z.object({ refreshToken: z.string().min(10).max(200) });
const passwordBody = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });

// Hash factice : on verifie toujours un mot de passe, meme pour un login inconnu (temps constant).
let dummyHash: Promise<string> | undefined;

export async function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = authenticate(ctx);

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = loginBody.parse(req.body);
    const { rows } = await ctx.db.query<AccountRow>(
      'select * from accounts where lower(pseudo) = lower($1) or lower(email) = lower($1) limit 1',
      [body.login.trim()],
    );
    const account = rows[0];
    const invalid = new HttpError(401, 'invalid_credentials', 'Identifiants invalides');

    if (!account) {
      dummyHash ??= hashPassword('dummy-password');
      await verifyPassword(await dummyHash, body.password);
      throw invalid;
    }
    if (account.locked_until && account.locked_until.getTime() > Date.now()) {
      throw new HttpError(429, 'locked', 'Trop de tentatives, réessaie plus tard');
    }
    const ok = await verifyPassword(account.password_hash, body.password);
    if (!ok) {
      const fails = account.failed_attempts + 1;
      if (fails >= ctx.config.LOGIN_MAX_FAILS) {
        await ctx.db.query(
          "update accounts set failed_attempts = 0, locked_until = now() + ($2 || ' minutes')::interval where id = $1",
          [account.id, String(ctx.config.LOGIN_LOCK_MINUTES)],
        );
      } else {
        await ctx.db.query('update accounts set failed_attempts = $2 where id = $1', [account.id, fails]);
      }
      throw invalid;
    }
    if (account.disabled) throw new HttpError(403, 'disabled', 'Compte désactivé');
    await ctx.db.query('update accounts set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1', [
      account.id,
    ]);
    return issueSession(ctx, account, req.headers['user-agent']);
  });

  app.post('/api/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = refreshBody.parse(req.body);
    return rotateRefreshToken(ctx, body.refreshToken, req.headers['user-agent']);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const body = refreshBody.safeParse(req.body);
    if (body.success) {
      await ctx.db.query('update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null', [
        sha256(body.data.refreshToken),
      ]);
    }
    return reply.code(204).send();
  });

  app.get('/api/me', { preHandler: auth }, async (req) => accountDto(req.account!));

  app.post('/api/me/password', { preHandler: auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = passwordBody.parse(req.body);
    const account = req.account!;
    if (!(await verifyPassword(account.password_hash, body.currentPassword))) {
      throw new HttpError(401, 'invalid_credentials', 'Mot de passe actuel incorrect');
    }
    await ctx.db.query('update accounts set password_hash = $2, must_change_password = false where id = $1', [
      account.id,
      await hashPassword(body.newPassword),
    ]);
    // Toutes les autres sessions sont coupees ; l'appelant en recoit une neuve.
    await ctx.db.query('update refresh_tokens set revoked_at = now() where account_id = $1 and revoked_at is null', [account.id]);
    const fresh = { ...account, must_change_password: false };
    return issueSession(ctx, fresh, req.headers['user-agent']);
  });
}
