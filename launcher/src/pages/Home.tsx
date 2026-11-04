import { GameIcon, Section, Timeline } from '../components/ui';
import { formatShortDate } from '../lib/format';
import { releaseFor, useStore } from '../store';

export function Home() {
  const { account, games, news, installed, channels, go } = useStore();
  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';
  const ordered = [...games].sort((a, b) => Number(installed[b.slug] !== undefined) - Number(installed[a.slug] !== undefined));

  return (
    <div className="max-w-[820px] px-10 py-10">
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">
        {greeting}, {account?.pseudo}
      </h1>

      {games.length === 0 ? (
        <p className="mt-6 max-w-[52ch] text-muted">Aucun jeu n’est disponible sur ton compte. Demande un accès à l’administrateur.</p>
      ) : (
        <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {ordered.map((g) => {
            const release = releaseFor(g, channels[g.slug] ?? 'stable');
            const have = installed[g.slug];
            const status = have === undefined ? (release ? 'À installer' : 'Bientôt disponible') : release && release.version !== have ? `Mise à jour ${release.version}` : `Version ${have}`;
            return (
              <button
                key={g.slug}
                onClick={() => go(g.slug)}
                style={{ background: `color-mix(in srgb, ${g.accent} 9%, var(--color-raise))` }}
                className="flex cursor-pointer items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left transition-[filter,transform] duration-100 hover:brightness-125 active:scale-[0.985]"
              >
                <GameIcon game={g} size={44} />
                <div className="min-w-0">
                  <div className="truncate font-[family-name:var(--font-display)] text-[17px] font-semibold leading-tight">{g.name}</div>
                  <div className="mt-0.5 truncate text-[13px] text-muted">{status}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-12">
        <Section title="Actualités">
          {news.length === 0 ? (
            <p className="text-muted">Rien de neuf pour l’instant.</p>
          ) : (
            <Timeline
              items={news.map((n) => {
                const game = games.find((g) => g.slug === n.gameSlug);
                return {
                  id: n.id,
                  date: formatShortDate(n.createdAt),
                  title: n.title,
                  body: n.body,
                  tag: game ? <span style={{ color: game.accent }}>{game.name}</span> : undefined,
                };
              })}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
