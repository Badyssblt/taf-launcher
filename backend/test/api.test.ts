import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import EmbeddedPostgres from 'embedded-postgres';
import { jwtVerify } from 'jose';
import { buildApp } from '../src/app.js';
import { seedAdmin } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { loadKeys } from '../src/crypto.js';
import { createPool, migrate, type Db } from '../src/db.js';
import { GithubReleases } from '../src/github.js';

const PORT = 54000 + Math.floor(Math.random() * 900);
const dir = mkdtempSync(join(tmpdir(), 'taf-pg-'));
let pg: EmbeddedPostgres;
let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
let keys: ReturnType<typeof loadKeys>;
let config: ReturnType<typeof loadConfig>;

const fakeFetch = (async (url: string | URL | Request) => {
  assert.match(String(url), /api\.github\.com\/repos\/acme\/demo\/releases/);
  return new Response(
    JSON.stringify([
      { tag_name: 'v2.0.0-beta', draft: false, prerelease: true, body: 'beta', published_at: null, html_url: 'x', assets: [{ name: 'manifest.json', browser_download_url: 'https://gh/beta/manifest.json' }] },
      { tag_name: 'v1.4.0', draft: false, prerelease: false, body: 'stable', published_at: null, html_url: 'x', assets: [{ name: 'manifest.json', browser_download_url: 'https://gh/1.4.0/manifest.json' }] },
      { tag_name: 'v1.3.0', draft: false, prerelease: false, body: 'old', published_at: null, html_url: 'x', assets: [] },
    ]),
    { status: 200 },
  );
}) as typeof fetch;

async function call(method: string, url: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.inject({
    method: method as 'GET',
    url,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
  let json: any = undefined;
  try {
    json = res.body ? JSON.parse(res.body) : undefined;
  } catch {}
  return { status: res.statusCode, json };
}

before(async () => {
  pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('taf');
  config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORT}/taf`,
    ADMIN_PSEUDO: 'root',
    ADMIN_EMAIL: 'root@example.com',
    ADMIN_PASSWORD: 'rootpassword1',
    LOGIN_MAX_FAILS: '3',
  });
  db = createPool(config.DATABASE_URL);
  await migrate(db);
  await seedAdmin(db, config);
  keys = loadKeys({ ...config, SIGNING_KEY: undefined });
  app = await buildApp({ config, db, keys, github: new GithubReleases(config, fakeFetch) });
}, { timeout: 120_000 });

after(async () => {
  await app?.close();
  await db?.end();
  await pg?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('backend', () => {
  let adminToken = '';
  let adminRefresh = '';
  let userId = '';
  let userToken = '';
  let gameId = '';

  it('refuse un mauvais mot de passe puis verrouille le compte', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await call('POST', '/api/auth/login', { body: { login: 'root', password: 'faux-faux' } });
      assert.equal(r.status, 401);
    }
    const locked = await call('POST', '/api/auth/login', { body: { login: 'root', password: 'rootpassword1' } });
    assert.equal(locked.status, 429);
    await db.query("update accounts set locked_until = null, failed_attempts = 0 where pseudo = 'root'");
  });

  it('connecte l admin (pseudo ou e-mail, insensible a la casse)', async () => {
    const byEmail = await call('POST', '/api/auth/login', { body: { login: 'ROOT@example.com', password: 'rootpassword1' } });
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.json.account.role, 'admin');
    assert.equal(byEmail.json.account.mustChangePassword, true);
    adminToken = byEmail.json.accessToken;
    adminRefresh = byEmail.json.refreshToken;
  });

  it('protege les routes', async () => {
    assert.equal((await call('GET', '/api/me')).status, 401);
    assert.equal((await call('GET', '/api/admin/accounts')).status, 401);
    assert.equal((await call('GET', '/api/me', { token: 'n-importe-quoi' })).status, 401);
  });

  it('cree un compte (mot de passe genere) et detecte les doublons', async () => {
    const r = await call('POST', '/api/admin/accounts', { token: adminToken, body: { pseudo: 'Alice', email: 'alice@example.com' } });
    assert.equal(r.status, 201);
    assert.ok(r.json.temporaryPassword.length >= 12);
    userId = r.json.id;
    const dup = await call('POST', '/api/admin/accounts', { token: adminToken, body: { pseudo: 'alice', email: 'autre@example.com' } });
    assert.equal(dup.status, 409);
    const bad = await call('POST', '/api/admin/accounts', { token: adminToken, body: { pseudo: 'a b', email: 'nope' } });
    assert.equal(bad.status, 400);
    const login = await call('POST', '/api/auth/login', { body: { login: 'alice', password: r.json.temporaryPassword } });
    assert.equal(login.status, 200);
    userToken = login.json.accessToken;
  });

  it('un utilisateur simple n a pas acces a l admin', async () => {
    assert.equal((await call('GET', '/api/admin/accounts', { token: userToken })).status, 403);
  });

  it('change le mot de passe et coupe les anciennes sessions', async () => {
    const patch = await app.inject({ method: 'PATCH', url: `/api/admin/accounts/${userId}`, headers: { authorization: `Bearer ${adminToken}` }, payload: { password: 'temporaire-123' } });
    assert.equal(patch.statusCode, 200);
    const l3 = await call('POST', '/api/auth/login', { body: { login: 'alice', password: 'temporaire-123' } });
    assert.equal(l3.status, 200);
    assert.equal(l3.json.account.mustChangePassword, true);
    const old = l3.json.refreshToken;
    const changed = await call('POST', '/api/me/password', { token: l3.json.accessToken, body: { currentPassword: 'temporaire-123', newPassword: 'nouveau-mdp-9' } });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.account.mustChangePassword, false);
    userToken = changed.json.accessToken;
    assert.equal((await call('POST', '/api/auth/refresh', { body: { refreshToken: old } })).status, 401);
  });

  it('fait tourner le jeton de rafraichissement et detecte sa reutilisation', async () => {
    const first = await call('POST', '/api/auth/refresh', { body: { refreshToken: adminRefresh } });
    assert.equal(first.status, 200);
    const reuse = await call('POST', '/api/auth/refresh', { body: { refreshToken: adminRefresh } });
    assert.equal(reuse.status, 401);
    // la famille est revoquee : le jeton tout neuf ne marche plus non plus
    const burned = await call('POST', '/api/auth/refresh', { body: { refreshToken: first.json.refreshToken } });
    assert.equal(burned.status, 401);
    const again = await call('POST', '/api/auth/login', { body: { login: 'root', password: 'rootpassword1' } });
    adminToken = again.json.accessToken;
  });

  it('cree un jeu et gere les acces', async () => {
    const created = await call('POST', '/api/admin/games', {
      token: adminToken,
      body: { slug: 'demo', name: 'Demo', githubRepo: 'acme/demo', launchArgs: '-AccountID={accountId} -AccountName={pseudo} -Ticket={ticket}', executable: 'Demo.exe', published: true },
    });
    assert.equal(created.status, 201);
    gameId = created.json.id;
    assert.equal(created.json.published, true);
    assert.equal((await call('POST', '/api/admin/games', { token: adminToken, body: { slug: 'demo', name: 'Doublon' } })).status, 409);
    assert.equal((await call('PATCH', `/api/admin/games/${gameId}`, { token: adminToken, body: { executable: '../evil.exe' } })).status, 400);

    const hidden = await call('GET', '/api/games', { token: userToken });
    assert.deepEqual(hidden.json, []);
    assert.equal((await call('POST', '/api/games/demo/ticket', { token: userToken })).status, 404);

    const put = await app.inject({ method: 'PUT', url: `/api/admin/games/${gameId}/access`, headers: { authorization: `Bearer ${adminToken}` }, payload: { accountIds: [userId] } });
    assert.equal(put.statusCode, 200);
    const visible = await call('GET', '/api/games', { token: userToken });
    assert.equal(visible.json.length, 1);
    assert.equal(visible.json[0].latest.stable.version, '1.4.0');
    assert.equal(visible.json[0].latest.stable.manifestUrl, 'https://gh/1.4.0/manifest.json');
    assert.equal(visible.json[0].latest.beta.version, '2.0.0-beta');
  });

  it('delivre un ticket verifiable avec la cle publique, propre a ce jeu', async () => {
    const t = await call('POST', '/api/games/demo/ticket', { token: userToken });
    assert.equal(t.status, 200);
    assert.equal(t.json.args.length, 3);
    assert.equal(t.json.args[1], '-AccountName=Alice');
    const pub = await call('GET', '/api/public-key');
    assert.equal(pub.status, 200);
    const { payload } = await jwtVerify(t.json.ticket, keys.publicKey, { audience: 'game:demo', issuer: config.PUBLIC_URL });
    assert.equal(payload.sub, userId);
    assert.equal(payload['name'], 'Alice');
    await assert.rejects(jwtVerify(t.json.ticket, keys.publicKey, { audience: 'game:autre' }));
    // un ticket ne sert pas de jeton d acces au launcher
    assert.equal((await call('GET', '/api/me', { token: t.json.ticket })).status, 401);
  });

  it('un jeu public est visible de tous, un jeu non publie de personne (sauf admin)', async () => {
    await call('POST', '/api/admin/games', { token: adminToken, body: { slug: 'ouvert', name: 'Ouvert', published: true, isPublic: true } });
    await call('POST', '/api/admin/games', { token: adminToken, body: { slug: 'brouillon', name: 'Brouillon', isPublic: true } });
    const slugs = (await call('GET', '/api/games', { token: userToken })).json.map((g: any) => g.slug).sort();
    assert.deepEqual(slugs, ['demo', 'ouvert']);
    const adminSlugs = (await call('GET', '/api/games', { token: adminToken })).json.map((g: any) => g.slug).sort();
    assert.deepEqual(adminSlugs, ['brouillon', 'demo', 'ouvert']);
  });

  it('gere les actualites', async () => {
    await call('POST', '/api/admin/news', { token: adminToken, body: { gameId: null, title: 'Bienvenue', body: 'Salut' } });
    await call('POST', '/api/admin/news', { token: adminToken, body: { gameId, title: 'Patch 1.4', body: 'Correctifs' } });
    const news = await call('GET', '/api/news', { token: userToken });
    assert.equal(news.json.length, 2);
    assert.equal(news.json[0].gameSlug, 'demo');
  });

  it('desactiver un compte coupe ses sessions ; on ne peut pas se desactiver soi-meme', async () => {
    const self = await call('PATCH', `/api/admin/accounts/${(await call('GET', '/api/me', { token: adminToken })).json.id}`, { token: adminToken, body: { disabled: true } });
    assert.equal(self.status, 400);
    const off = await call('PATCH', `/api/admin/accounts/${userId}`, { token: adminToken, body: { disabled: true } });
    assert.equal(off.status, 200);
    assert.equal((await call('GET', '/api/me', { token: userToken })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { body: { login: 'alice', password: 'nouveau-mdp-9' } })).status, 403);
  });

  it('expose la cle publique et le JWKS', async () => {
    const jwks = await call('GET', '/.well-known/jwks.json');
    assert.equal(jwks.json.keys[0].kty, 'OKP');
    assert.equal(jwks.json.keys[0].crv, 'Ed25519');
    assert.equal((await call('GET', '/health')).json.ok, true);
  });
});
