import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { formatBytes, formatEta, formatSpeed } from '../lib/format';
import { useStore } from '../store';
import { GameIcon, ProgressBar } from './ui';

const phaseLabel: Record<string, string> = {
  checking: 'Préparation',
  verifying: 'Vérification des fichiers',
  downloading: 'Téléchargement',
  finalizing: 'Finalisation',
};

export function DownloadsBar() {
  const { progress, games, cancel } = useStore();
  const items = Object.values(progress);
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="shrink-0 overflow-hidden border-t border-line bg-surface"
        >
          <div className="space-y-3 px-5 py-3">
            {items.map((p) => {
              const game = games.find((g) => g.slug === p.slug);
              const frac = p.total ? p.done / p.total : 0;
              const eta = p.speed > 0 ? (p.total - p.done) / p.speed : 0;
              return (
                <div key={p.slug} className="flex items-center gap-4">
                  {game && <GameIcon game={game} size={32} />}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-fg">
                        {game?.name ?? p.slug} <span className="font-normal text-muted">· {phaseLabel[p.phase] ?? p.phase}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {p.total > 0 && `${formatBytes(p.done)} / ${formatBytes(p.total)}`}
                        {p.phase === 'downloading' && p.speed > 0 && ` · ${formatSpeed(p.speed)}`}
                        {eta > 0 && p.phase === 'downloading' && ` · ${formatEta(eta)}`}
                      </span>
                    </div>
                    <ProgressBar value={frac} indeterminate={p.total === 0} />
                  </div>
                  <button
                    onClick={() => cancel(p.slug)}
                    aria-label="Annuler"
                    className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
