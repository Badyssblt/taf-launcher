import { useEffect, useRef } from 'react';
import { DownloadsBar } from './components/DownloadsBar';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { UpdateGate } from './components/UpdateGate';
import { readableInk } from './lib/color';
import { onGameExited, onInstallProgress } from './lib/native';
import { ChangePassword, Login } from './pages/Auth';
import { GamePage } from './pages/GamePage';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { useStore } from './store';

const DEFAULT_ACCENT = '#8ab4ff';

export default function App() {
  const phase = useStore((s) => s.phase);
  const page = useStore((s) => s.page);
  const games = useStore((s) => s.games);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Un seul abonnement aux evenements du coeur Rust pour toute la vie de l'application.
    const unlisten = Promise.all([
      onInstallProgress((p) => useStore.getState().setProgress(p)),
      onGameExited((slug) => useStore.getState().setRunning(slug, false)),
    ]);
    return () => void unlisten.then((fns) => fns.forEach((f) => f()));
  }, []);

  // Toute l'interface prend la couleur du jeu affiche (fondu gere par le CSS).
  useEffect(() => {
    const accent = games.find((g) => g.slug === page)?.accent ?? DEFAULT_ACCENT;
    const root = document.documentElement.style;
    root.setProperty('--accent', accent);
    root.setProperty('--accent-ink', readableInk(accent));
  }, [page, games]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [page]);

  // Demarrage de session, puis actualisation periodique du catalogue (nouvelles versions, actualites).
  useEffect(() => {
    void useStore.getState().boot();
    const t = setInterval(() => {
      if (useStore.getState().phase === 'ready') void useStore.getState().refreshCatalog();
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <UpdateGate>
      <div className="flex h-full flex-col bg-side">
        <TitleBar />
        {phase === 'boot' && <div className="grid flex-1 place-items-center bg-bg text-[13px] text-muted">Chargement</div>}
        {phase === 'login' && (
          <div className="flex min-h-0 flex-1 bg-bg">
            <Login />
          </div>
        )}
        {phase === 'password' && (
          <div className="flex min-h-0 flex-1 bg-bg">
            <ChangePassword />
          </div>
        )}
        {phase === 'ready' && (
          <>
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto rounded-tl-[12px] bg-bg">
                {page === 'home' ? <Home /> : page === 'settings' ? <Settings /> : <GamePage slug={page} />}
              </main>
            </div>
            <DownloadsBar />
          </>
        )}
        <Toast />
      </div>
    </UpdateGate>
  );
}
