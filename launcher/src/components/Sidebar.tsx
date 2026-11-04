import { ArrowDownToLine, Gamepad2, Home, Search, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { releaseFor, useStore } from '../store';
import { GameIcon } from './ui';

export function Sidebar() {
  const { games, page, go, installed, progress, running, channels, account } = useStore();
  const [query, setQuery] = useState('');
  const list = useMemo(() => games.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase())), [games, query]);

  const row = (active: boolean) =>
    `group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer ${
      active ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
    }`;

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="space-y-2 p-3">
        <button className={row(page === 'home')} onClick={() => go('home')}>
          <Home className="size-[18px]" />
          <span className="text-sm font-medium">Accueil</span>
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher"
            className="h-9 w-full rounded-lg border border-line bg-bg pl-8 pr-3 text-sm placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Bibliothèque ({games.length})</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {list.map((g) => {
          const release = releaseFor(g, channels[g.slug] ?? 'stable');
          const hasUpdate = installed[g.slug] !== undefined && release !== null && installed[g.slug] !== release.version;
          const p = progress[g.slug];
          return (
            <button key={g.slug} className={row(page === g.slug)} onClick={() => go(g.slug)}>
              <GameIcon game={g} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
              {p ? (
                <span className="text-[11px] tabular-nums text-accent">{p.total ? Math.round((p.done / p.total) * 100) : 0}%</span>
              ) : running[g.slug] ? (
                <span className="flex items-center gap-1 text-[11px] text-ok">
                  <Gamepad2 className="size-3.5" />
                </span>
              ) : hasUpdate ? (
                <ArrowDownToLine className="size-4 text-accent" />
              ) : installed[g.slug] === undefined ? (
                <span className="size-1.5 rounded-full bg-muted/40" />
              ) : null}
            </button>
          );
        })}
        {!list.length && <p className="px-2 py-6 text-center text-xs text-muted">{games.length ? 'Aucun résultat' : 'Aucun jeu disponible'}</p>}
      </nav>

      <div className="flex items-center gap-3 border-t border-line p-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-black/80">
          {account?.pseudo.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{account?.pseudo}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-ok" /> En ligne
          </div>
        </div>
        <button
          onClick={() => go('settings')}
          aria-label="Paramètres"
          className={`grid size-8 place-items-center rounded-lg transition-colors cursor-pointer ${page === 'settings' ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}
        >
          <Settings className="size-[18px]" />
        </button>
      </div>
    </aside>
  );
}
