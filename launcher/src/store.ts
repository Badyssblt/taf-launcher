import { create } from 'zustand';
import { ApiError, api, setOnSessionLost, type Account, type Game, type NewsItem, type Release } from './lib/api';
import { native, type InstallProgress } from './lib/native';

export type Channel = 'stable' | 'beta';
export type Page = 'home' | 'settings' | string;

const ls = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : on garde la valeur en memoire seulement */
    }
  },
};

export function releaseFor(game: Game, channel: Channel): Release | null {
  const l = game.latest;
  if (!l) return null;
  return channel === 'beta' ? (l.beta ?? l.stable) : (l.stable ?? l.beta);
}

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface State {
  phase: 'boot' | 'login' | 'password' | 'ready';
  account: Account | null;
  games: Game[];
  news: NewsItem[];
  installed: Record<string, string>;
  progress: Record<string, InstallProgress>;
  running: Record<string, boolean>;
  libraryDir: string;
  channels: Record<string, Channel>;
  page: Page;
  toast: Toast | null;

  boot: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  refreshInstalled: () => Promise<void>;
  go: (page: Page) => void;
  setChannel: (slug: string, channel: Channel) => void;
  setLibraryDir: (dir: string) => Promise<void>;
  install: (slug: string, verify?: boolean) => Promise<void>;
  cancel: (slug: string) => Promise<void>;
  play: (slug: string) => Promise<void>;
  uninstall: (slug: string) => Promise<void>;
  setProgress: (p: InstallProgress) => void;
  setRunning: (slug: string, running: boolean) => void;
  notify: (text: string, kind?: Toast['kind']) => void;
}

let toastSeq = 0;
const msg = (e: unknown) => (e instanceof ApiError ? e.message : typeof e === 'string' ? e : e instanceof Error ? e.message : 'Erreur inconnue');

export const useStore = create<State>((set, get) => ({
  phase: 'boot',
  account: null,
  games: [],
  news: [],
  installed: {},
  progress: {},
  running: {},
  libraryDir: ls.get('libraryDir') ?? '',
  channels: JSON.parse(ls.get('channels') ?? '{}') as Record<string, Channel>,
  page: 'home',
  toast: null,

  notify(text, kind = 'info') {
    const id = ++toastSeq;
    set({ toast: { id, text, kind } });
    setTimeout(() => get().toast?.id === id && set({ toast: null }), kind === 'error' ? 6000 : 3500);
  },

  async boot() {
    setOnSessionLost(() => set({ phase: 'login', account: null }));
    try {
      if (!get().libraryDir) {
        const dir = await native.defaultLibraryDir();
        set({ libraryDir: dir });
      }
      const account = await api.resume();
      if (!account) return set({ phase: 'login' });
      set({ account, phase: account.mustChangePassword ? 'password' : 'ready' });
      if (!account.mustChangePassword) await Promise.all([get().refreshCatalog(), get().refreshInstalled()]);
    } catch (e) {
      set({ phase: 'login' });
      get().notify(msg(e), 'error');
    }
  },

  async login(login, password) {
    const account = await api.login(login, password);
    set({ account, phase: account.mustChangePassword ? 'password' : 'ready', page: 'home' });
    if (!account.mustChangePassword) await Promise.all([get().refreshCatalog(), get().refreshInstalled()]);
  },

  async changePassword(current, next) {
    const account = await api.changePassword(current, next);
    set({ account, phase: 'ready' });
    await Promise.all([get().refreshCatalog(), get().refreshInstalled()]);
  },

  async logout() {
    await api.logout();
    set({ account: null, phase: 'login', games: [], news: [], page: 'home' });
  },

  async refreshCatalog() {
    try {
      const [games, news] = await Promise.all([api.games(), api.news()]);
      set({ games, news });
      const { page } = get();
      if (page !== 'home' && page !== 'settings' && !games.some((g) => g.slug === page)) set({ page: 'home' });
    } catch (e) {
      get().notify(msg(e), 'error');
    }
  },

  async refreshInstalled() {
    const { libraryDir } = get();
    if (!libraryDir) return;
    const list = await native.installedGames(libraryDir).catch(() => []);
    set({ installed: Object.fromEntries(list.map((g) => [g.slug, g.version])) });
  },

  go: (page) => set({ page }),

  setChannel(slug, channel) {
    const channels = { ...get().channels, [slug]: channel };
    set({ channels });
    ls.set('channels', JSON.stringify(channels));
  },

  async setLibraryDir(dir) {
    set({ libraryDir: dir });
    ls.set('libraryDir', dir);
    await get().refreshInstalled();
  },

  async install(slug, verify = false) {
    const { games, channels, libraryDir, progress } = get();
    const game = games.find((g) => g.slug === slug);
    const release = game ? releaseFor(game, channels[slug] ?? 'stable') : null;
    if (!game || !release) return get().notify('Aucune version disponible', 'error');
    if (progress[slug]) return;
    set({ progress: { ...progress, [slug]: { slug, phase: 'checking', done: 0, total: 0, speed: 0, file: '' } } });
    try {
      await native.installGame(slug, release.manifestUrl, libraryDir, verify);
      get().notify(`${game.name} est à jour`);
    } catch (e) {
      const text = msg(e);
      if (text !== 'Annulé') get().notify(text, 'error');
    } finally {
      const { [slug]: _gone, ...rest } = get().progress;
      set({ progress: rest });
      await get().refreshInstalled();
    }
  },

  async cancel(slug) {
    await native.cancelInstall(slug).catch(() => {});
  },

  async play(slug) {
    const { games, libraryDir } = get();
    const game = games.find((g) => g.slug === slug);
    if (!game) return;
    try {
      const t = await api.ticket(slug);
      await native.launchGame(slug, libraryDir, game.executable, t.args);
      set({ running: { ...get().running, [slug]: true } });
    } catch (e) {
      get().notify(msg(e), 'error');
    }
  },

  async uninstall(slug) {
    try {
      await native.uninstallGame(slug, get().libraryDir);
      await get().refreshInstalled();
      get().notify('Jeu désinstallé');
    } catch (e) {
      get().notify(msg(e), 'error');
    }
  },

  setProgress: (p) => {
    if (p.phase === 'done') return;
    // On n'ajoute une entree que pour une installation que l'on connait (evite les evenements tardifs).
    if (get().progress[p.slug]) set({ progress: { ...get().progress, [p.slug]: p } });
  },

  setRunning: (slug, running) => set({ running: { ...get().running, [slug]: running } }),
}));
