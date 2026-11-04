import { X } from 'lucide-react';
import { formatBytes, formatEta, formatSpeed } from '../lib/format';
import { useStore } from '../store';
import { GameIcon, ProgressBar } from './ui';

const phaseLabel: Record<string, string> = {
  checking: 'Préparation',
  verifying: 'Vérification',
  downloading: 'Téléchargement',
  finalizing: 'Finalisation',
};

export function DownloadsBar() {
  const { progress, games, cancel } = useStore();
  const items = Object.values(progress);
  if (!items.length) return null;
  return (
    <div className="shrink-0 space-y-3 bg-side px-5 py-3">
      {items.map((p) => {
        const game = games.find((g) => g.slug === p.slug);
        const eta = p.speed > 0 ? (p.total - p.done) / p.speed : 0;
        return (
          <div key={p.slug} className="flex items-center gap-4">
            {game && <GameIcon game={game} size={30} />}
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-4 text-[13px]">
                <span className="truncate">
                  <span className="font-medium">{game?.name ?? p.slug}</span>
                  <span className="text-muted"> — {phaseLabel[p.phase] ?? p.phase}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {p.total > 0 && `${formatBytes(p.done)} / ${formatBytes(p.total)}`}
                  {p.phase === 'downloading' && p.speed > 0 && `  ·  ${formatSpeed(p.speed)}`}
                  {p.phase === 'downloading' && eta > 0 && `  ·  ${formatEta(eta)}`}
                </span>
              </div>
              <ProgressBar value={p.total ? p.done / p.total : 0} indeterminate={p.total === 0} />
            </div>
            <button
              onClick={() => cancel(p.slug)}
              aria-label="Annuler"
              className="grid size-8 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-raise hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
