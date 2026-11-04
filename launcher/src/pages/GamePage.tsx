import { AnimatePresence, motion } from 'framer-motion';
import { Download, FolderOpen, MoreHorizontal, Play, RefreshCw, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, GameIcon, Notes } from '../components/ui';
import { formatDate } from '../lib/format';
import { native } from '../lib/native';
import { releaseFor, useStore, type Channel } from '../store';

export function GamePage({ slug }: { slug: string }) {
  const s = useStore();
  const game = s.games.find((g) => g.slug === slug);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!game) return null;
  const channel: Channel = s.channels[slug] ?? 'stable';
  const release = releaseFor(game, channel);
  const installedVersion = s.installed[slug];
  const isInstalled = installedVersion !== undefined;
  const hasUpdate = isInstalled && release !== null && release.version !== installedVersion;
  const busy = s.progress[slug] !== undefined;
  const running = s.running[slug] === true;
  const hasBeta = game.latest?.beta != null;
  const gameNews = s.news.filter((n) => n.gameSlug === slug);

  let action: React.ReactNode;
  if (busy) {
    action = (
      <Button size="lg" variant="secondary" onClick={() => s.cancel(slug)}>
        <Square className="size-4 fill-current" /> Annuler
      </Button>
    );
  } else if (running) {
    action = (
      <Button size="lg" variant="secondary" disabled>
        En cours…
      </Button>
    );
  } else if (!isInstalled) {
    action = (
      <Button size="lg" variant="primary" disabled={!release} onClick={() => s.install(slug)}>
        <Download className="size-5" /> {release ? 'Installer' : 'Bientôt disponible'}
      </Button>
    );
  } else if (hasUpdate) {
    action = (
      <Button size="lg" variant="primary" onClick={() => s.install(slug)}>
        <RefreshCw className="size-5" /> Mettre à jour
      </Button>
    );
  } else {
    action = (
      <Button size="lg" variant="primary" onClick={() => s.play(slug)}>
        <Play className="size-5 fill-current" /> Jouer
      </Button>
    );
  }

  return (
    <div className="min-h-full">
      <div className="relative overflow-hidden border-b border-line">
        {game.bannerUrl && <img src={game.bannerUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30 blur-[2px]" draggable={false} />}
        <div className="absolute inset-0 bg-[radial-gradient(900px_300px_at_20%_0%,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        <div className="relative flex items-end gap-6 px-8 pb-7 pt-14">
          <GameIcon game={game} size={88} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-bold tracking-tight">{game.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {isInstalled && <span>Version installée {installedVersion}</span>}
              {release && !isInstalled && <span>Version {release.version}</span>}
              {hasUpdate && release && <span className="text-accent">Mise à jour {release.version} disponible</span>}
              {channel === 'beta' && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent">BÊTA</span>}
              {!game.published && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs">Brouillon (admin)</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {action}
            <div className="relative" ref={menuRef}>
              <Button variant="secondary" className="size-14 !rounded-xl !px-0" onClick={() => setMenu((v) => !v)} aria-label="Options">
                <MoreHorizontal className="size-5" />
              </Button>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 top-16 z-20 w-64 space-y-0.5 rounded-xl border border-line bg-surface-2 p-1.5 shadow-2xl"
                  >
                    {hasBeta && (
                      <div className="flex gap-1 p-1">
                        {(['stable', 'beta'] as const).map((c) => (
                          <button
                            key={c}
                            onClick={() => s.setChannel(slug, c)}
                            className={`h-8 flex-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${channel === c ? 'bg-accent text-black/90' : 'bg-surface-3 text-muted hover:text-fg'}`}
                          >
                            {c === 'stable' ? 'Stable' : 'Bêta'}
                          </button>
                        ))}
                      </div>
                    )}
                    <MenuItem icon={<ShieldCheck className="size-4" />} disabled={!isInstalled || busy || !release} onClick={() => { setMenu(false); s.install(slug, true); }}>
                      Vérifier les fichiers
                    </MenuItem>
                    <MenuItem icon={<FolderOpen className="size-4" />} disabled={!isInstalled} onClick={() => { setMenu(false); native.openFolder(slug, s.libraryDir).catch((e) => s.notify(String(e), 'error')); }}>
                      Ouvrir le dossier
                    </MenuItem>
                    <MenuItem
                      icon={<Trash2 className="size-4" />}
                      danger
                      disabled={!isInstalled || busy || running}
                      onClick={() => {
                        if (!confirmDelete) return setConfirmDelete(true);
                        setMenu(false);
                        setConfirmDelete(false);
                        s.uninstall(slug);
                      }}
                    >
                      {confirmDelete ? 'Confirmer la désinstallation' : 'Désinstaller'}
                    </MenuItem>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {game.description && (
            <Card title="À propos">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{game.description}</p>
            </Card>
          )}
          {release?.notes && (
            <Card title={`Notes de version ${release.version}`}>
              <Notes text={release.notes} />
            </Card>
          )}
          {gameNews.length > 0 && (
            <Card title="Actualités">
              <div className="divide-y divide-line">
                {gameNews.map((n) => (
                  <article key={n.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h4 className="font-semibold">{n.title}</h4>
                      <time className="shrink-0 text-xs text-muted">{formatDate(n.createdAt)}</time>
                    </div>
                    {n.body && <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>}
                  </article>
                ))}
              </div>
            </Card>
          )}
        </div>
        <Card title="Informations" className="h-fit">
          <dl className="space-y-3 text-sm">
            <Row label="Installé" value={installedVersion ?? 'Non'} />
            <Row label="Dernière version" value={release?.version ?? '—'} />
            {release?.publishedAt && <Row label="Publiée le" value={formatDate(release.publishedAt)} />}
            <Row label="Canal" value={channel === 'beta' ? 'Bêta' : 'Stable'} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function MenuItem({ icon, children, onClick, disabled, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40 cursor-pointer ${danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-3'}`}
    >
      {icon}
      {children}
    </button>
  );
}
