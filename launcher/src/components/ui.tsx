import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Game } from '../lib/api';
import { readableInk } from '../lib/color';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink font-semibold hover:brightness-110',
  secondary: 'bg-raise-2 text-fg hover:bg-[#404045]',
  ghost: 'text-muted hover:text-fg hover:bg-raise',
  danger: 'text-danger hover:bg-danger/10',
};
const sizes = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-4 gap-2',
  lg: 'h-11 px-7 text-[15px] gap-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium transition-[background-color,filter,transform] duration-100 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[13px] text-muted">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-md border border-line bg-raise px-3 text-sm text-fg placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus-visible:outline-none';

/** Icone du jeu ; sans image, une tuile teintee a la couleur du jeu avec son initiale. */
export function GameIcon({ game, size = 36 }: { game: Pick<Game, 'name' | 'iconUrl' | 'accent'>; size?: number }) {
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.2) };
  if (game.iconUrl) return <img src={game.iconUrl} alt="" style={box} className="shrink-0 bg-raise object-cover" draggable={false} />;
  return (
    <div
      style={{ ...box, fontSize: size * 0.46, background: game.accent, color: readableInk(game.accent) }}
      className="grid shrink-0 place-items-center font-[family-name:var(--font-display)] font-bold"
    >
      {game.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ProgressBar({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  return (
    <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-raise-2">
      {indeterminate ? (
        <div className="absolute inset-y-0 left-0 w-2/5 animate-slide rounded-full bg-accent" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      )}
    </div>
  );
}

/** Rendu minimal de notes de version : titres (#), listes (- ou *) et paragraphes. */
export function Notes({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    out.push(
      <ul key={out.length} className="ml-4 list-disc space-y-1 marker:text-faint">
        {list.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^<!--.*-->$/.test(line)) continue; // reperes techniques (ex. commit source), jamais affiches
    if (/^[-*]\s+/.test(line)) list.push(line.replace(/^[-*]\s+/, ''));
    else {
      flush();
      if (/^#{1,6}\s+/.test(line)) out.push(<h4 key={out.length} className="pt-1 font-semibold text-fg">{line.replace(/^#{1,6}\s+/, '')}</h4>);
      else if (line) out.push(<p key={out.length}>{line}</p>);
    }
  }
  flush();
  return <div className="max-w-[68ch] space-y-2.5 text-sm leading-relaxed text-muted">{out}</div>;
}

/** Section a plat : un titre, son contenu, aucun cadre. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="[&+&]:mt-9 [&+&]:border-t [&+&]:border-line [&+&]:pt-7">
      <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Actualites en chronologie : la date a gauche, le contenu a droite. */
export function Timeline({ items }: { items: { id: string; date: string; title: string; body: string; tag?: ReactNode }[] }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-4 py-4 first:pt-1 last:pb-0">
          <time className="pt-0.5 text-[13px] tabular-nums text-faint">{n.date}</time>
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-sans)] text-[15px] font-medium tracking-normal">{n.title}</h3>
            {n.tag && <div className="mt-0.5 text-[13px]">{n.tag}</div>}
            {n.body && <p className="mt-1.5 max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-muted">{n.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
