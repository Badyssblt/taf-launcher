import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { formatBytes } from '../lib/format';
import { inTauri } from '../lib/native';
import { ProgressBar } from './ui';

type Gate = { kind: 'checking' } | { kind: 'updating'; version: string; done: number; total: number } | { kind: 'ready' };

/** Au demarrage : cherche une nouvelle version du launcher, l'installe puis relance. Ne bloque jamais hors ligne. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const skip = !inTauri || import.meta.env.DEV;
  const [gate, setGate] = useState<Gate>(skip ? { kind: 'ready' } : { kind: 'checking' });

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    (async () => {
      try {
        const update = await Promise.race([check(), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
        if (update && !cancelled) {
          let total = 0;
          let done = 0;
          setGate({ kind: 'updating', version: update.version, done: 0, total: 0 });
          await update.downloadAndInstall((ev) => {
            if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
            else if (ev.event === 'Progress') {
              done += ev.data.chunkLength;
              setGate({ kind: 'updating', version: update.version, done, total });
            }
          });
          await relaunch();
          return;
        }
      } catch (e) {
        console.warn('mise a jour du launcher impossible', e);
      }
      if (!cancelled) setGate({ kind: 'ready' });
    })();
    return () => {
      cancelled = true;
    };
  }, [skip]);

  if (gate.kind === 'ready') return <>{children}</>;
  return (
    <div className="grid h-full place-items-center bg-bg">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-72 text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-accent text-2xl font-black text-black/85 shadow-[0_14px_50px_-12px_var(--accent)]">L</div>
        {gate.kind === 'checking' ? (
          <>
            <p className="mb-4 text-sm text-muted">Recherche de mises à jour…</p>
            <ProgressBar value={0} indeterminate />
          </>
        ) : (
          <>
            <p className="mb-1 text-sm font-medium">Mise à jour {gate.version}</p>
            <p className="mb-4 text-xs text-muted">
              {gate.total ? `${formatBytes(gate.done)} / ${formatBytes(gate.total)}` : 'Téléchargement…'}
            </p>
            <ProgressBar value={gate.total ? gate.done / gate.total : 0} indeterminate={!gate.total} />
          </>
        )}
      </motion.div>
    </div>
  );
}
