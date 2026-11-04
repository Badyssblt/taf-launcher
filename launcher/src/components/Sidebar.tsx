import { Home, Search, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { releaseFor, useStore } from '../store';
import { GameIcon } from './ui';

export function Sidebar() {
  const { games, page, go, installed, progress, running, channels, account } = useStore();
  const [query, setQuery] = useState('');
  const list = useMemo(() => games.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase())), [games, query]);

  const row = (active: boolean) =>
    `flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] transition-colors ${
      active ? 'bg-raise-2 text-fg' : 'text-muted hover:bg-raise hover:text-fg'
    }`;

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-side">
      <div className="px-3 pb-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher"
            className="h-8 w-full rounded-md bg-raise pl-8 pr-3 text-[13px] text-fg placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          />
        </div>
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto px-3 pb-3">
        <button className={row(page === 'home')} onClick={() => go('home')}>
          <Home className="size-[18px] shrink-0" />
          Accueil
        </button>
        <div className="mx-2.5 my-2 h-px bg-line" />
        {list.map((g) => {
          const release = releaseFor(g, channels[g.slug] ?? 'stable');
          const hasUpdate = installed[g.slug] !== undefined && release !== null && installed[g.slug] !== release.version;
          const p = progress[g.slug];
          const notInstalled = installed[g.slug] === undefined;
          return (
            <button key={g.slug} className={row(page === g.slug)} onClick={() => go(g.slug)}>
              <GameIcon game={g} size={22} />
              <span className={`min-w-0 flex-1 truncate ${notInstalled && !p ? 'opacity-70' : ''}`}>{g.name}</span>
              {p ? (
                <span className="text-xs tabular-nums text-muted">{p.total ? Math.round((p.done / p.total) * 100) : 0} %</span>
              ) : running[g.slug] ? (
                <span title="En cours" className="size-2 rounded-full bg-ok" />
              ) : hasUpdate ? (
                <span title="Mise à jour disponible" className="size-2 rounded-full" style={{ background: g.accent }} />
              ) : null}
            </button>
          );
        })}
        {!list.length && <p className="px-2.5 py-6 text-[13px] text-faint">{games.length ? 'Aucun résultat' : 'Aucun jeu sur ton compte'}</p>}
      </nav>

      <div className="flex items-center gap-2.5 px-3 py-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-raise-2 font-[family-name:var(--font-display)] text-sm font-bold text-fg">
          {account?.pseudo.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 truncate text-[14px] font-medium">{account?.pseudo}</div>
        <button
          onClick={() => go('settings')}
          aria-label="Paramètres"
          className={`grid size-8 cursor-pointer place-items-center rounded-md transition-colors ${page === 'settings' ? 'bg-raise-2 text-fg' : 'text-muted hover:bg-raise hover:text-fg'}`}
        >
          <Settings className="size-[18px]" />
        </button>
      </div>
    </aside>
  );
}
