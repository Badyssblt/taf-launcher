// Migrations SQL, appliquees dans l'ordre au demarrage. Ne jamais modifier une migration deja
// deployee : en ajouter une nouvelle a la suite.
export const migrations: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
      create table accounts (
        id uuid primary key default gen_random_uuid(),
        pseudo text not null,
        email text not null,
        password_hash text not null,
        role text not null default 'user' check (role in ('user', 'admin')),
        disabled boolean not null default false,
        must_change_password boolean not null default true,
        failed_attempts integer not null default 0,
        locked_until timestamptz,
        created_at timestamptz not null default now(),
        last_login_at timestamptz
      );
      create unique index accounts_pseudo_key on accounts (lower(pseudo));
      create unique index accounts_email_key on accounts (lower(email));

      create table refresh_tokens (
        id uuid primary key default gen_random_uuid(),
        account_id uuid not null references accounts(id) on delete cascade,
        family_id uuid not null,
        token_hash text not null unique,
        expires_at timestamptz not null,
        revoked_at timestamptz,
        created_at timestamptz not null default now(),
        user_agent text
      );
      create index refresh_tokens_account_idx on refresh_tokens (account_id);
      create index refresh_tokens_family_idx on refresh_tokens (family_id);

      create table games (
        id uuid primary key default gen_random_uuid(),
        slug text not null unique,
        name text not null,
        description text not null default '',
        icon_url text not null default '',
        banner_url text not null default '',
        accent text not null default '#f59e0b',
        executable text not null default '',
        launch_args text not null default '',
        github_repo text not null default '',
        is_public boolean not null default false,
        published boolean not null default false,
        sort_order integer not null default 0,
        created_at timestamptz not null default now()
      );

      create table game_access (
        account_id uuid not null references accounts(id) on delete cascade,
        game_id uuid not null references games(id) on delete cascade,
        primary key (account_id, game_id)
      );

      create table news (
        id uuid primary key default gen_random_uuid(),
        game_id uuid references games(id) on delete cascade,
        title text not null,
        body text not null default '',
        created_at timestamptz not null default now()
      );
      create index news_created_idx on news (created_at desc);
    `,
  },
];
