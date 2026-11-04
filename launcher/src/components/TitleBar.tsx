import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { inTauri } from '../lib/native';

const win = () => (inTauri ? getCurrentWindow() : null);

export function TitleBar() {
  const btn = 'grid h-9 w-11 place-items-center text-muted transition-colors hover:bg-white/5 hover:text-fg';
  return (
    <header data-tauri-drag-region className="flex h-9 shrink-0 items-center justify-between bg-side">
      <div data-tauri-drag-region className="flex items-center gap-2.5 pl-4">
        <span className="size-2.5 rounded-[3px] bg-accent" />
        <span data-tauri-drag-region className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-muted">
          Launcher
        </span>
      </div>
      <div className="flex">
        <button className={btn} onClick={() => win()?.minimize()} aria-label="Réduire">
          <Minus className="size-4" />
        </button>
        <button className={btn} onClick={() => win()?.toggleMaximize()} aria-label="Agrandir">
          <Square className="size-3" />
        </button>
        <button className={`${btn} hover:!bg-danger hover:!text-white`} onClick={() => win()?.close()} aria-label="Fermer">
          <X className="size-4" />
        </button>
      </div>
    </header>
  );
}
