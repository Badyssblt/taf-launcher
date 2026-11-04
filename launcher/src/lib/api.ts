import { native } from './native';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'https://launcher.badyssblilita.fr';

export interface Account {
  id: string;
  pseudo: string;
  email: string;
  role: 'user' | 'admin';
  mustChangePassword: boolean;
}
export interface Release {
  version: string;
  tag: string;
  notes: string;
  publishedAt: string | null;
  manifestUrl: string;
  htmlUrl: string;
}
export interface Game {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string;
  bannerUrl: string;
  accent: string;
  executable: string;
  launchArgs: string;
  published: boolean;
  latest: { stable: Release | null; beta: Release | null } | null;
}
export interface NewsItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  gameSlug: string | null;
}
export interface Ticket {
  ticket: string;
  args: string[];
}

interface Session {
  accessToken: string;
  refreshToken: string;
  account: Account;
}

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '') {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export const setOnSessionLost = (fn: () => void) => (onSessionLost = fn);

async function raw(method: string, path: string, body?: unknown, auth = true): Promise<Response> {
  try {
    return await fetch(API_URL + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifie ta connexion.', 0, 'network');
  }
}

async function storeSession(s: Session) {
  accessToken = s.accessToken;
  refreshToken = s.refreshToken;
  await native.tokenSave(s.refreshToken);
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    if (!refreshToken) return false;
    try {
      const res = await raw('POST', '/api/auth/refresh', { refreshToken }, false);
      if (!res.ok) return false;
      await storeSession((await res.json()) as Session);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'network') throw e;
      return false;
    }
  })().finally(() => (refreshing = null));
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  let res = await raw(method, path, body, auth);
  if (res.status === 401 && auth && refreshToken) {
    if (await refresh()) res = await raw(method, path, body, auth);
    else {
      onSessionLost?.();
      throw new ApiError('Session expirée', 401, 'session');
    }
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new ApiError(json.message ?? `Erreur ${res.status}`, res.status, json.error ?? '');
  return json as T;
}

export const api = {
  async login(login: string, password: string): Promise<Account> {
    const s = await request<Session>('POST', '/api/auth/login', { login, password }, false);
    await storeSession(s);
    return s.account;
  },
  /** Reprend la session enregistree dans le trousseau Windows. Renvoie null s'il n'y en a pas. */
  async resume(): Promise<Account | null> {
    refreshToken = await native.tokenLoad();
    if (!refreshToken) return null;
    if (!(await refresh())) {
      await native.tokenClear();
      refreshToken = null;
      return null;
    }
    return request<Account>('GET', '/api/me');
  },
  async logout() {
    if (refreshToken) await request('POST', '/api/auth/logout', { refreshToken }, false).catch(() => {});
    accessToken = refreshToken = null;
    await native.tokenClear();
  },
  async changePassword(currentPassword: string, newPassword: string): Promise<Account> {
    const s = await request<Session>('POST', '/api/me/password', { currentPassword, newPassword });
    await storeSession(s);
    return s.account;
  },
  games: () => request<Game[]>('GET', '/api/games'),
  news: () => request<NewsItem[]>('GET', '/api/news'),
  ticket: (slug: string) => request<Ticket>('POST', `/api/games/${encodeURIComponent(slug)}/ticket`),
};
