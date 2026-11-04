import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Game } from '../lib/api';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-black/90 font-semibold hover:brightness-110 shadow-[0_8px_30px_-8px_var(--accent)]',
  secondary: 'bg-surface-3 text-fg hover:bg-[#262c3a] border border-line',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const sizes = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 gap-2', lg: 'h-14 px-9 text-base gap-2.5 rounded-xl' };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:saturate-50 disabled:pointer-events-none cursor-pointer ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg placeholder:text-muted/60 transition-colors focus:border-accent focus:outline-none';

export function GameIcon({ game, size = 36 }: { game: Pick<Game, 'name' | 'iconUrl' | 'accent'>; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (game.iconUrl) return <img src={game.iconUrl} alt="" style={style} className="shrink-0 rounded-[22%] object-cover bg-surface-3" draggable={false} />;
  return (
    <div style={{ ...style, background: game.accent }} className="grid shrink-0 place-items-center rounded-[22%] font-bold text-black/80">
      {game.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ProgressBar({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      {indeterminate ? (
        <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] bg-[length:200%_100%]" />
      ) : (
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
      )}
    </div>
  );
}

/** Rendu minimal de notes de version : titres (#), listes (- ou *) et paragraphes. */
export function Notes({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={out.length} className="ml-4 list-disc space-y-1 marker:text-accent">
          {list.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) list.push(line.replace(/^[-*]\s+/, ''));
    else {
      flush();
      if (/^#{1,6}\s+/.test(line)) out.push(<h4 key={out.length} className="pt-1 font-semibold text-fg">{line.replace(/^#{1,6}\s+/, '')}</h4>);
      else if (line) out.push(<p key={out.length}>{line}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-muted">{out}</div>;
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {title && <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>}
      {children}
    </section>
  );
}
