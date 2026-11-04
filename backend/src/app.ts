import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { HttpError, type Ctx } from './context.js';
import { publicJwk } from './crypto.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/games.js';

export async function buildApp(ctx: Ctx, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: ctx.config.TRUST_PROXY === 'true',
    bodyLimit: 256 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(cors, { origin: ctx.config.corsOrigins, credentials: false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const where = issue?.path.join('.') ?? '';
      return reply.code(400).send({ error: 'validation', message: `${where ? where + ' : ' : ''}${issue?.message ?? 'Requête invalide'}` });
    }
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    const e = err as { code?: string; constraint?: string; statusCode?: number; message?: string };
    if (e.code === '23505') {
      const what = e.constraint?.includes('pseudo') ? 'Ce pseudo' : e.constraint?.includes('email') ? 'Cet e-mail' : e.constraint?.includes('slug') ? 'Cet identifiant' : 'Cette valeur';
      return reply.code(409).send({ error: 'conflict', message: `${what} est déjà utilisé` });
    }
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'request', message: e.message ?? 'Requête invalide' });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Erreur interne' });
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/.well-known/jwks.json', async () => ({ keys: [await publicJwk(ctx.keys)] }));
  app.get('/', async (_req, reply) => reply.redirect('/admin/'));

  await authRoutes(app, ctx);
  await gameRoutes(app, ctx);
  await adminRoutes(app, ctx);

  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../admin/', import.meta.url)),
    prefix: '/admin/',
  });

  return app;
}
