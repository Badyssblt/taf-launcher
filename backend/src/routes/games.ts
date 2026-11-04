import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { HttpError, type Ctx } from '../context.js';
import { signToken, ticketAudience } from '../crypto.js';

export interface GameRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_url: string;
  banner_url: string;
  accent: string;
  executable: string;
  launch_args: string;
  github_repo: string;
  is_public: boolean;
  published: boolean;
  sort_order: number;
  created_at: Date;
}

export const gameDto = (g: GameRow) => ({
  id: g.id,
  slug: g.slug,
  name: g.name,
  description: g.description,
  iconUrl: g.icon_url,
  bannerUrl: g.banner_url,
  accent: g.accent,
  executable: g.executable,
  launchArgs: g.launch_args,
  githubRepo: g.github_repo,
  isPublic: g.is_public,
  published: g.published,
  sortOrder: g.sort_order,
});

/** Jeux visibles par un compte : publies et (publics ou accordes). Un admin voit tout. */
async function visibleGames(ctx: Ctx, accountId: string, isAdmin: boolean): Promise<GameRow[]> {
  const { rows } = await ctx.db.query<GameRow>(
    `select g.* from games g
     where $2::boolean
        or (g.published and (g.is_public or exists (select 1 from game_access a where a.game_id = g.id and a.account_id = $1)))
     order by g.sort_order, g.name`,
    [accountId, isAdmin],
  );
  return rows;
}

/** Remplace {accountId} {pseudo} {ticket} jeton par jeton, donc sans risque d'injection d'arguments. */
export function renderArgs(template: string, vars: Record<string, string>): string[] {
  return template
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => tok.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? ''));
}

export async function gameRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = authenticate(ctx);

  app.get('/api/games', { preHandler: auth }, async (req) => {
    const account = req.account!;
    const games = await visibleGames(ctx, account.id, account.role === 'admin');
    return Promise.all(
      games.map(async (g) => ({
        ...gameDto(g),
        latest: g.github_repo ? await ctx.github.latest(g.github_repo) : null,
      })),
    );
  });

  app.get('/api/news', { preHandler: auth }, async (req) => {
    const account = req.account!;
    const games = await visibleGames(ctx, account.id, account.role === 'admin');
    const ids = games.map((g) => g.id);
    const { rows } = await ctx.db.query<{
      id: string;
      title: string;
      body: string;
      created_at: Date;
      slug: string | null;
    }>(
      `select n.id, n.title, n.body, n.created_at, g.slug
       from news n left join games g on g.id = n.game_id
       where n.game_id is null or n.game_id = any($1::uuid[])
       order by n.created_at desc limit 50`,
      [ids],
    );
    return rows.map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at, gameSlug: r.slug }));
  });

  // Ticket signe que le launcher passe au jeu ; le jeu le verifie avec la cle publique (/api/public-key).
  app.post('/api/games/:slug/ticket', { preHandler: auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { slug } = req.params as { slug: string };
    const account = req.account!;
    const games = await visibleGames(ctx, account.id, account.role === 'admin');
    const game = games.find((g) => g.slug === slug);
    if (!game) throw new HttpError(404, 'not_found', 'Jeu introuvable');
    const ticket = await signToken(ctx.keys, ctx.config, {
      type: 'ticket',
      audience: ticketAudience(game.slug),
      subject: account.id,
      ttlSeconds: ctx.config.TICKET_TTL_SECONDS,
      claims: { name: account.pseudo },
    });
    const args = renderArgs(game.launch_args, { accountId: account.id, pseudo: account.pseudo, ticket });
    return { ticket, expiresIn: ctx.config.TICKET_TTL_SECONDS, accountId: account.id, pseudo: account.pseudo, args };
  });

  app.get('/api/public-key', async () => ({
    kid: ctx.keys.kid,
    algorithm: 'EdDSA',
    issuer: ctx.config.PUBLIC_URL,
    publicKeyPem: ctx.keys.publicPem,
  }));
}
