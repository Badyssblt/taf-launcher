import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Field, inputClass } from '../components/ui';
import { useStore } from '../store';

function AuthShell({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center overflow-y-auto px-6">
      <div className="w-full max-w-[320px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="size-3 rounded-[3px] bg-accent" />
          <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold">Launcher</span>
        </div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {hint && <p className="mt-2 text-[14px] text-muted">{hint}</p>}
        <div className="mt-7">{children}</div>
      </div>
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

const Error_ = ({ text }: { text: string }) => (text ? <p role="alert" className="text-[13px] text-danger">{text}</p> : null);

export function Login() {
  const login = useStore((s) => s.login);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const { error, loading, onSubmit } = useSubmit(() => login(id.trim(), pw));
  return (
    <AuthShell title="Connexion" hint="Les comptes sont créés par un administrateur.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Pseudo ou e-mail">
          <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} autoFocus autoComplete="username" required />
        </Field>
        <Field label="Mot de passe">
          <input className={inputClass} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Error_ text={error} />
        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-1 w-full">
          Se connecter
        </Button>
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
    <AuthShell title="Nouveau mot de passe" hint="Remplace le mot de passe temporaire par le tien.">
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
        <Error_ text={error} />
        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-1 w-full">
          Enregistrer
        </Button>
        <Button type="button" variant="ghost" onClick={logout} className="w-full">
          Se déconnecter
        </Button>
      </form>
    </AuthShell>
  );
}
