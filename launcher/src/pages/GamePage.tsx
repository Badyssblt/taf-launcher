import { AnimatePresence, motion } from 'framer-motion';
import { Download, FolderOpen, MoreHorizontal, Play, RefreshCw, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, GameIcon, Notes, Section, Timeline } from '../components/ui';
import { formatDate, formatShortDate } from '../lib/format';
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

  let action: ReactNode;
  if (busy) {
    action = (
      <Button size="lg" onClick={() => s.cancel(slug)}>
        <Square className="size-3.5 fill-current" /> Annuler
      </Button>
    );
  } else if (running) {
    action = (
      <Button size="lg" disabled>
        En cours
      </Button>
    );
  } else if (!isInstalled) {
    action = (
      <Button size="lg" variant="primary" disabled={!release} onClick={() => s.install(slug)}>
        <Download className="size-[18px]" /> {release ? 'Installer' : 'Bientôt disponible'}
      </Button>
    );
  } else if (hasUpdate) {
    action = (
      <Button size="lg" variant="primary" onClick={() => s.install(slug)}>
        <RefreshCw className="size-[18px]" /> Mettre à jour
      </Button>
    );
  } else {
    action = (
      <Button size="lg" variant="primary" onClick={() => s.play(slug)}>
        <Play className="size-[18px] fill-current" /> Jouer
      </Button>
    );
  }

  const status = busy
    ? 'Installation en cours'
    : running
      ? 'Le jeu est lancé'
      : hasUpdate && release
        ? `Version ${release.version} disponible, installée : ${installedVersion}`
        : isInstalled
          ? `Version ${installedVersion} installée`
          : release
            ? `Version ${release.version}`
            : 'Aucune version publiée';

  return (
    <div className="min-h-full">
      <header className="relative border-b border-line bg-raise px-10 pb-7 pt-9">
        {game.bannerUrl && <img src={game.bannerUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.12]" draggable={false} />}
        <div className="relative flex items-center gap-5">
          <GameIcon game={game} size={72} />
          <div className="min-w-0">
            <h1 className="truncate text-[40px] font-bold leading-none tracking-tight">{game.name}</h1>
            {!game.published && <div className="mt-2 text-[13px] text-muted">Brouillon, visible par les administrateurs seulement</div>}
          </div>
        </div>

        <div className="relative mt-7 flex items-center gap-4">
          {action}
          <div className="relative" ref={menuRef}>
            <Button size="lg" className="!px-3" onClick={() => setMenu((v) => !v)} aria-label="Options" aria-expanded={menu}>
              <MoreHorizontal className="size-5" />
            </Button>
            <AnimatePresence>
              {menu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                  className="absolute left-0 top-full z-20 mt-2 w-60 origin-top-left rounded-[10px] border border-line bg-raise-2 p-1.5"
                >
                  {hasBeta && (
                    <div className="mb-1 flex gap-1 rounded-md bg-side p-1">
                      {(['stable', 'beta'] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => s.setChannel(slug, c)}
                          className={`h-7 flex-1 cursor-pointer rounded text-[13px] font-medium transition-colors ${channel === c ? 'bg-raise-2 text-fg' : 'text-muted hover:text-fg'}`}
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
          <span className="text-[13px] tabular-nums text-muted">
            {status}
            {channel === 'beta' && ' · bêta'}
          </span>
        </div>
      </header>

      <div className="grid gap-12 px-10 pb-12 pt-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          {game.description && (
            <Section title="À propos">
              <p className="max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-muted">{game.description}</p>
            </Section>
          )}
          {release?.notes && (
            <Section title={`Version ${release.version}`}>
              <Notes text={release.notes} />
            </Section>
          )}
          {gameNews.length > 0 && (
            <Section title="Actualités">
              <Timeline items={gameNews.map((n) => ({ id: n.id, date: formatShortDate(n.createdAt), title: n.title, body: n.body }))} />
            </Section>
          )}
        </div>

        <dl className="h-fit text-[13px]">
          <Row label="Installée" value={installedVersion ?? 'Non'} />
          <Row label="Dernière version" value={release?.version ?? '—'} />
          {release?.publishedAt && <Row label="Publiée le" value={formatDate(release.publishedAt)} />}
          <Row label="Canal" value={channel === 'beta' ? 'Bêta' : 'Stable'} />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 first:pt-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function MenuItem({ icon, children, onClick, disabled, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-white/5'}`}
    >
      {icon}
      {children}
    </button>
  );
}
