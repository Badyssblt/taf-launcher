import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { DownloadsBar } from './components/DownloadsBar';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { UpdateGate } from './components/UpdateGate';
import { onGameExited, onInstallProgress } from './lib/native';
import { ChangePassword, Login } from './pages/Auth';
import { GamePage } from './pages/GamePage';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { useStore } from './store';

const DEFAULT_ACCENT = '#f59e0b';

export default function App() {
  const phase = useStore((s) => s.phase);
  const page = useStore((s) => s.page);
  const games = useStore((s) => s.games);

  useEffect(() => {
    // Un seul abonnement aux evenements du coeur Rust pour toute la vie de l'application.
    const unlisten = Promise.all([
      onInstallProgress((p) => useStore.getState().setProgress(p)),
      onGameExited((slug) => useStore.getState().setRunning(slug, false)),
    ]);
    return () => void unlisten.then((fns) => fns.forEach((f) => f()));
  }, []);

  // La couleur d'accent suit le jeu affiche.
  useEffect(() => {
    const accent = games.find((g) => g.slug === page)?.accent ?? DEFAULT_ACCENT;
    document.documentElement.style.setProperty('--accent', accent);
  }, [page, games]);

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
      <div className="flex h-full flex-col bg-bg">
        <TitleBar />
        {phase === 'boot' && <div className="grid flex-1 place-items-center text-sm text-muted">Chargement…</div>}
        {phase === 'login' && <Login />}
        {phase === 'password' && <ChangePassword />}
        {phase === 'ready' && (
          <>
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <main className="min-w-0 flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div key={page} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="min-h-full">
                    {page === 'home' ? <Home /> : page === 'settings' ? <Settings /> : <GamePage slug={page} />}
                  </motion.div>
                </AnimatePresence>
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
