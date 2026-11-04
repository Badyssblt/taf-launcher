import { useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Button, Field, inputClass } from '../components/ui';
import { useStore } from '../store';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_50%_-10%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%)]" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-accent text-lg font-black text-black/85 shadow-[0_10px_40px_-10px_var(--accent)]">L</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-2xl">{children}</div>
      </motion.div>
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }
  return { error, loading, onSubmit };
}

export function Login() {
  const login = useStore((s) => s.login);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const { error, loading, onSubmit } = useSubmit(() => login(id.trim(), pw));
  return (
    <AuthShell title="Connexion" subtitle="Accède à ta bibliothèque">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Pseudo ou e-mail">
          <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} autoFocus autoComplete="username" required />
        </Field>
        <Field label="Mot de passe">
          <input className={inputClass} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" loading={loading} className="mt-1">
          Se connecter
        </Button>
        <p className="text-center text-xs text-muted">Les comptes sont créés par un administrateur.</p>
      </form>
    </AuthShell>
  );
}

export function ChangePassword() {
  const { changePassword, logout } = useStore();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const { error, loading, onSubmit } = useSubmit(async () => {
    if (next.length < 8) throw new Error('8 caractères minimum');
    if (next !== again) throw new Error('Les mots de passe ne correspondent pas');
    await changePassword(cur, next);
  });
  return (
    <AuthShell title="Nouveau mot de passe" subtitle="Choisis un mot de passe personnel">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Mot de passe actuel">
          <input className={inputClass} type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus autoComplete="current-password" required />
        </Field>
        <Field label="Nouveau mot de passe">
          <input className={inputClass} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Confirmation">
          <input className={inputClass} type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" loading={loading} className="mt-1">
          Enregistrer
        </Button>
        <button type="button" onClick={logout} className="text-xs text-muted hover:text-fg cursor-pointer">
          Se déconnecter
        </button>
      </form>
    </AuthShell>
  );
}
