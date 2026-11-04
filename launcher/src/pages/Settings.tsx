import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { check } from '@tauri-apps/plugin-updater';
import { FolderOpen, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card } from '../components/ui';
import { inTauri } from '../lib/native';
import { useStore } from '../store';

export function Settings() {
  const { account, libraryDir, setLibraryDir, logout, notify, progress } = useStore();
  const [version, setVersion] = useState('dev');
  const [checking, setChecking] = useState(false);
  const installing = Object.keys(progress).length > 0;

  useEffect(() => {
    if (inTauri) getVersion().then(setVersion).catch(() => {});
  }, []);

  async function pickDir() {
    const dir = await open({ directory: true, multiple: false, defaultPath: libraryDir || undefined, title: 'Dossier des jeux' });
    if (typeof dir === 'string') {
      await setLibraryDir(dir);
      notify('Dossier mis à jour. Les jeux déjà installés restent à leur ancien emplacement.');
    }
  }

  async function checkUpdate() {
    setChecking(true);
    try {
      const update = await check();
      notify(update ? `Version ${update.version} disponible : elle s’installera au prochain démarrage.` : 'Le launcher est à jour');
    } catch {
      notify('Impossible de vérifier les mises à jour', 'error');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-8 py-9">
      <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>

      <Card title="Installation">
        <p className="mb-3 text-sm text-muted">Dossier où sont installés les jeux.</p>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-xs">{libraryDir || '—'}</div>
          <Button onClick={pickDir} disabled={!inTauri || installing}>
            <FolderOpen className="size-4" /> Changer
          </Button>
        </div>
      </Card>

      <Card title="Compte">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold">{account?.pseudo}</div>
            <div className="truncate text-sm text-muted">{account?.email}</div>
          </div>
          <Button variant="danger" onClick={logout}>
            <LogOut className="size-4" /> Déconnexion
          </Button>
        </div>
      </Card>

      <Card title="À propos">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm">
            Launcher <span className="font-mono text-muted">v{version}</span>
          </div>
          <Button onClick={checkUpdate} loading={checking} disabled={!inTauri}>
            Rechercher une mise à jour
          </Button>
        </div>
      </Card>
    </div>
  );
}
