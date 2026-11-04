import { ChevronRight, Newspaper } from 'lucide-react';
import { GameIcon } from '../components/ui';
import { formatDate } from '../lib/format';
import { releaseFor, useStore } from '../store';

export function Home() {
  const { account, games, news, installed, channels, go } = useStore();
  const hour = new Date().getHours();
  const greeting = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour';
  const mine = [...games].sort((a, b) => Number(installed[b.slug] !== undefined) - Number(installed[a.slug] !== undefined));

  return (
    <div className="mx-auto max-w-4xl space-y-9 px-8 py-9">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, <span className="text-accent">{account?.pseudo}</span>
        </h1>
        <p className="mt-1 text-sm text-muted">{games.length ? 'Que veux-tu lancer aujourd’hui ?' : 'Aucun jeu n’est encore disponible sur ton compte.'}</p>
      </div>

      {games.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Tes jeux</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((g) => {
              const release = releaseFor(g, channels[g.slug] ?? 'stable');
              const status =
                installed[g.slug] === undefined ? (release ? 'À installer' : 'Bientôt') : release && release.version !== installed[g.slug] ? 'Mise à jour' : 'Prêt à jouer';
              return (
                <button
                  key={g.slug}
                  onClick={() => go(g.slug)}
                  className="group relative overflow-hidden rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--color-line))] cursor-pointer"
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-20 blur-2xl" style={{ background: g.accent }} />
                  <div className="relative flex items-center gap-3">
                    <GameIcon game={g} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{g.name}</div>
                      <div className={`text-xs ${status === 'Prêt à jouer' ? 'text-ok' : status === 'Mise à jour' ? 'text-accent' : 'text-muted'}`}>{status}</div>
                    </div>
                    <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Actualités</h2>
        {news.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-12 text-sm text-muted">
            <Newspaper className="size-6" />
            Rien de neuf pour l’instant
          </div>
        ) : (
          <div className="space-y-3">
            {news.map((n) => {
              const game = games.find((g) => g.slug === n.gameSlug);
              return (
                <article key={n.id} className="rounded-xl border border-line bg-surface p-5">
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
                    {game ? (
                      <>
                        <GameIcon game={game} size={16} />
                        <span className="font-medium text-fg">{game.name}</span>
                      </>
                    ) : (
                      <span className="font-medium text-fg">Launcher</span>
                    )}
                    <span>·</span>
                    <time>{formatDate(n.createdAt)}</time>
                  </div>
                  <h3 className="text-base font-semibold">{n.title}</h3>
                  {n.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted">{n.body}</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
