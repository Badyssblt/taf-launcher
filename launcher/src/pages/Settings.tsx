import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../components/ui';
import { inTauri } from '../lib/native';
import { useStore } from '../store';

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 border-b border-line py-5">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {hint && <div className="mt-0.5 truncate text-[13px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

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
      notify('Dossier modifié. Les jeux déjà installés restent où ils sont.');
    }
  }

  async function checkUpdate() {
    setChecking(true);
    try {
      const update = await check();
      notify(update ? `Version ${update.version} disponible, elle s’installera au prochain démarrage.` : 'Le launcher est à jour');
    } catch {
      notify('Impossible de vérifier les mises à jour', 'error');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-[720px] px-10 py-10">
      <h1 className="text-[30px] font-bold leading-tight tracking-tight">Paramètres</h1>
      <div className="mt-6 border-t border-line">
        <Row title="Dossier des jeux" hint={<span className="font-mono text-xs">{libraryDir || '—'}</span>}>
          <Button onClick={pickDir} disabled={!inTauri || installing}>
            Changer
          </Button>
        </Row>
        <Row title={account?.pseudo ?? 'Compte'} hint={account?.email}>
          <Button variant="danger" onClick={logout}>
            Se déconnecter
          </Button>
        </Row>
        <Row title="Launcher" hint={<span className="tabular-nums">Version {version}</span>}>
          <Button onClick={checkUpdate} loading={checking} disabled={!inTauri}>
            Rechercher une mise à jour
          </Button>
        </Row>
      </div>
    </div>
  );
}
