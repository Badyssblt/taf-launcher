// Pont vers le coeur Rust (commandes Tauri). Hors de Tauri (navigateur de dev), tout est simule.
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface InstalledGame {
  slug: string;
  version: string;
}
export interface InstallProgress {
  slug: string;
  phase: 'checking' | 'verifying' | 'downloading' | 'finalizing' | 'done';
  done: number;
  total: number;
  speed: number;
  file: string;
}

const call = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(cmd, args);

export const native = {
  defaultLibraryDir: () => (inTauri ? call<string>('default_library_dir') : Promise.resolve('C:\\Games')),
  installedGames: (libraryDir: string) => (inTauri ? call<InstalledGame[]>('installed_games', { libraryDir }) : Promise.resolve([])),
  installGame: (slug: string, manifestUrl: string, libraryDir: string, verify = false) =>
    call<void>('install_game', { slug, manifestUrl, libraryDir, verify }),
  cancelInstall: (slug: string) => call<void>('cancel_install', { slug }),
  launchGame: (slug: string, libraryDir: string, executable: string, args: string[]) =>
    call<void>('launch_game', { slug, libraryDir, executable, args }),
  uninstallGame: (slug: string, libraryDir: string) => call<void>('uninstall_game', { slug, libraryDir }),
  openFolder: (slug: string, libraryDir: string) => call<void>('open_folder', { slug, libraryDir }),
  tokenSave: (token: string) => (inTauri ? call<void>('token_save', { token }) : Promise.resolve(void localStorage.setItem('dev-refresh', token))),
  tokenLoad: () => (inTauri ? call<string | null>('token_load') : Promise.resolve(localStorage.getItem('dev-refresh'))),
  tokenClear: () => (inTauri ? call<void>('token_clear') : Promise.resolve(void localStorage.removeItem('dev-refresh'))),
};

export function onInstallProgress(cb: (p: InstallProgress) => void): Promise<UnlistenFn> {
  return inTauri ? listen<InstallProgress>('install-progress', (e) => cb(e.payload)) : Promise.resolve(() => {});
}
export function onGameExited(cb: (slug: string) => void): Promise<UnlistenFn> {
  return inTauri ? listen<string>('game-exited', (e) => cb(e.payload)) : Promise.resolve(() => {});
}
