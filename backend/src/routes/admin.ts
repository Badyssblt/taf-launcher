import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { HttpError, accountDto, type AccountRow, type Ctx } from '../context.js';
import { generatePassword, hashPassword } from '../crypto.js';
import { gameDto, type GameRow } from './games.js';

const pseudo = z.string().regex(/^[A-Za-z0-9_-]{3,24}$/, '3 à 24 caractères : lettres, chiffres, _ ou -');
const email = z.email().max(254);
const password = z.string().min(8).max(200);
const uuid = z.uuid();

const createAccount = z.object({
  pseudo,
  email,
  password: password.optional(),
  role: z.enum(['user', 'admin']).default('user'),
});
const patchAccount = z.object({
  pseudo: pseudo.optional(),
  email: email.optional(),
  role: z.enum(['user', 'admin']).optional(),
  disabled: z.boolean().optional(),
  // Reinitialise le mot de passe (l'utilisateur devra le changer a la connexion).
  password: password.optional(),
  generatePassword: z.boolean().optional(),
});

const url = z.union([z.literal(''), z.url().max(500)]);
const gameFields = {
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'minuscules, chiffres et tirets'),
  name: z.string().min(1).max(80),
  description: z.string().max(4000),
  iconUrl: url,
  bannerUrl: url,
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  executable: z.string().max(260).refine((v) => !/(^|[\\/])\.\.([\\/]|$)/.test(v) && !/^([a-zA-Z]:|[\\/])/.test(v), 'chemin relatif sans ..'),
  launchArgs: z.string().max(500),
  githubRepo: z.union([z.literal(''), z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'format proprietaire/depot')]),
  isPublic: z.boolean(),
  published: z.boolean(),
  sortOrder: z.number().int().min(-1000).max(1000),
};
const createGame = z.object(gameFields).partial().required({ slug: true, name: true });
const patchGame = z.object(gameFields).partial();

const newsBody = z.object({
  gameId: uuid.nullable().default(null),
  title: z.string().min(1).max(160),
  body: z.string().max(10_000).default(''),
});

const colMap: Record<string, string> = {
  slug: 'slug',
  name: 'name',
  description: 'description',
  iconUrl: 'icon_url',
  bannerUrl: 'banner_url',
  accent: 'accent',
  executable: 'executable',
  launchArgs: 'launch_args',
  githubRepo: 'github_repo',
  isPublic: 'is_public',
  published: 'published',
  sortOrder: 'sort_order',
};

function buildSet(values: Record<string, unknown>, map: Record<string, string>, startAt = 2) {
  const cols: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || !map[k]) continue;
    params.push(v);
    cols.push(`${map[k]} = $${startAt + params.length - 1}`);
  }
  return { sets: cols.join(', '), params };
}

export async function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const admin = requireAdmin(ctx);
  const opts = { preHandler: admin };

  // ---------- Comptes ----------
  app.get('/api/admin/accounts', opts, async () => {
    const { rows } = await ctx.db.query<AccountRow>('select * from accounts order by created_at desc');
    return rows.map(accountDto);
  });

  app.post('/api/admin/accounts', opts, async (req, reply) => {
    const body = createAccount.parse(req.body);
    const plain = body.password ?? generatePassword();
    const { rows } = await ctx.db.query<AccountRow>(
      'insert into accounts (pseudo, email, password_hash, role) values ($1, $2, $3, $4) returning *',
      [body.pseudo, body.email, await hashPassword(plain), body.role],
    );
    // Le mot de passe en clair n'est renvoye qu'ici, une seule fois.
    return reply.code(201).send({ ...accountDto(rows[0]!), temporaryPassword: plain });
  });

  app.patch('/api/admin/accounts/:id', opts, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = patchAccount.parse(req.body);
    if (id === req.account!.id && (body.disabled === true || body.role === 'user')) {
      throw new HttpError(400, 'self_lockout', 'Tu ne peux pas te retirer ton propre accès');
    }
    const { sets, params } = buildSet({ pseudo: body.pseudo, email: body.email, role: body.role, disabled: body.disabled }, {
      pseudo: 'pseudo',
      email: 'email',
      role: 'role',
      disabled: 'disabled',
    });
    const fields: string[] = sets ? [sets] : [];
    const values = [...params];
    let temporaryPassword: string | undefined;
    if (body.password || body.generatePassword) {
      temporaryPassword = body.password ?? generatePassword();
      values.push(await hashPassword(temporaryPassword));
      fields.push(`password_hash = $${values.length + 1}`, 'must_change_password = true', 'failed_attempts = 0', 'locked_until = null');
    }
    if (!fields.length) throw new HttpError(400, 'empty', 'Rien à modifier');
    const { rows } = await ctx.db.query<AccountRow>(`update accounts set ${fields.join(', ')} where id = $1 returning *`, [id, ...values]);
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Compte introuvable');
    if (body.disabled || temporaryPassword) {
      await ctx.db.query('update refresh_tokens set revoked_at = now() where account_id = $1 and revoked_at is null', [id]);
    }
    return { ...accountDto(rows[0]), ...(temporaryPassword ? { temporaryPassword } : {}) };
  });

  app.delete('/api/admin/accounts/:id', opts, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    if (id === req.account!.id) throw new HttpError(400, 'self_delete', 'Tu ne peux pas supprimer ton propre compte');
    const res = await ctx.db.query('delete from accounts where id = $1', [id]);
    if (!res.rowCount) throw new HttpError(404, 'not_found', 'Compte introuvable');
    return reply.code(204).send();
  });

  // ---------- Jeux ----------
  app.get('/api/admin/games', opts, async () => {
    const { rows } = await ctx.db.query<GameRow & { access_count: string }>(
      `select g.*, (select count(*) from game_access a where a.game_id = g.id) as access_count
       from games g order by g.sort_order, g.name`,
    );
    return rows.map((g) => ({ ...gameDto(g), accessCount: Number(g.access_count) }));
  });

  app.post('/api/admin/games', opts, async (req, reply) => {
    const body = createGame.parse(req.body);
    const { rows } = await ctx.db.query<GameRow>('insert into games (slug, name) values ($1, $2) returning *', [body.slug, body.name]);
    const created = rows[0]!;
    const { sets, params } = buildSet(body, colMap);
    if (!sets) return reply.code(201).send(gameDto(created));
    const upd = await ctx.db.query<GameRow>(`update games set ${sets} where id = $1 returning *`, [created.id, ...params]);
    return reply.code(201).send(gameDto(upd.rows[0]!));
  });

  app.patch('/api/admin/games/:id', opts, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { sets, params } = buildSet(patchGame.parse(req.body), colMap);
    if (!sets) throw new HttpError(400, 'empty', 'Rien à modifier');
    const { rows } = await ctx.db.query<GameRow>(`update games set ${sets} where id = $1 returning *`, [id, ...params]);
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Jeu introuvable');
    return gameDto(rows[0]);
  });

  app.delete('/api/admin/games/:id', opts, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const res = await ctx.db.query('delete from games where id = $1', [id]);
    if (!res.rowCount) throw new HttpError(404, 'not_found', 'Jeu introuvable');
    return reply.code(204).send();
  });

  app.get('/api/admin/games/:id/access', opts, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { rows } = await ctx.db.query<{ account_id: string }>('select account_id from game_access where game_id = $1', [id]);
    return { accountIds: rows.map((r) => r.account_id) };
  });

  app.put('/api/admin/games/:id/access', opts, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { accountIds } = z.object({ accountIds: z.array(uuid).max(5000) }).parse(req.body);
    const client = await ctx.db.connect();
    try {
      await client.query('begin');
      await client.query('delete from game_access where game_id = $1', [id]);
      if (accountIds.length) {
        await client.query(
          'insert into game_access (account_id, game_id) select a.id, $1 from accounts a where a.id = any($2::uuid[])',
          [id, accountIds],
        );
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    return { ok: true };
  });

  // Force le rafraichissement du cache GitHub d'un jeu (apres une release par exemple).
  app.get('/api/admin/games/:id/releases', opts, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { rows } = await ctx.db.query<GameRow>('select * from games where id = $1', [id]);
    const game = rows[0];
    if (!game) throw new HttpError(404, 'not_found', 'Jeu introuvable');
    return game.github_repo ? ((await ctx.github.latest(game.github_repo)) ?? { stable: null, beta: null }) : { stable: null, beta: null };
  });

  // ---------- Actualites ----------
  app.get('/api/admin/news', opts, async () => {
    const { rows } = await ctx.db.query(
      `select n.id, n.game_id as "gameId", n.title, n.body, n.created_at as "createdAt", g.name as "gameName"
       from news n left join games g on g.id = n.game_id order by n.created_at desc`,
    );
    return rows;
  });

  app.post('/api/admin/news', opts, async (req, reply) => {
    const b = newsBody.parse(req.body);
    const { rows } = await ctx.db.query('insert into news (game_id, title, body) values ($1, $2, $3) returning id', [b.gameId, b.title, b.body]);
    return reply.code(201).send(rows[0]);
  });

  app.patch('/api/admin/news/:id', opts, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const b = newsBody.parse(req.body);
    const res = await ctx.db.query('update news set game_id = $2, title = $3, body = $4 where id = $1', [id, b.gameId, b.title, b.body]);
    if (!res.rowCount) throw new HttpError(404, 'not_found', 'Actualité introuvable');
    return { ok: true };
  });

  app.delete('/api/admin/news/:id', opts, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    await ctx.db.query('delete from news where id = $1', [id]);
    return reply.code(204).send();
  });
}
