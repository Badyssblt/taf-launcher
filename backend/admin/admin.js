// Panneau d'administration : JavaScript sans dependance, DOM construit par h() (jamais d'innerHTML).
const $app = document.getElementById('app');
const store = {
  get access() { return sessionStorage.getItem('access'); },
  get refresh() { return sessionStorage.getItem('refresh'); },
  set(a, r) { sessionStorage.setItem('access', a); sessionStorage.setItem('refresh', r); },
  clear() { sessionStorage.removeItem('access'); sessionStorage.removeItem('refresh'); },
};
let me = null;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

class ApiError extends Error {}
let refreshing = null;
async function refreshSession() {
  refreshing ??= (async () => {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: store.refresh }),
    });
    if (!res.ok) throw new Error('refresh');
    const j = await res.json();
    store.set(j.accessToken, j.refreshToken);
  })().finally(() => { refreshing = null; });
  return refreshing;
}
async function api(method, path, body, retry = true) {
  const res = await fetch(path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(store.access ? { authorization: `Bearer ${store.access}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry && store.refresh) {
    try { await refreshSession(); } catch { store.clear(); location.reload(); throw new ApiError('Session expirée'); }
    return api(method, path, body, false);
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.message || `Erreur ${res.status}`);
  return json;
}

function toast(msg) {
  const t = h('div', { class: 'toast', text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function dialog(build) {
  const dlg = h('dialog');
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(h('div', { class: 'dlg' }, build(close)));
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

function secretDialog(title, pseudo, password) {
  dialog((close) => [
    h('h3', { text: title }),
    h('p', { class: 'muted', text: `Mot de passe temporaire de ${pseudo}. Il ne sera plus affiché ; l'utilisateur devra le changer à sa première connexion.` }),
    h('div', { class: 'secret' }, h('code', { class: 'mono', text: password }),
      h('button', { class: 'btn sm', onclick: async () => { await navigator.clipboard.writeText(password); toast('Copié'); } }, 'Copier')),
    h('div', { class: 'foot' }, h('button', { class: 'btn primary', onclick: close }, 'Fermer')),
  ]);
}

function formDialog({ title, fields, submitLabel = 'Enregistrer', extra, onSubmit }) {
  return dialog((close) => {
    const err = h('div', { class: 'err' });
    const inputs = {};
    const fieldEls = fields.map((f) => {
      let input;
      if (f.type === 'select') input = h('select', {}, f.options.map(([v, l]) => h('option', { value: v, text: l })));
      else if (f.type === 'textarea') input = h('textarea', { placeholder: f.placeholder });
      else if (f.type === 'checkbox') input = h('input', { type: 'checkbox' });
      else input = h('input', { type: f.type || 'text', placeholder: f.placeholder, autocomplete: 'off' });
      if (f.type === 'checkbox') input.checked = !!f.value; else if (f.value !== undefined) input.value = f.value;
      inputs[f.name] = input;
      if (f.type === 'checkbox') return h('label', { class: 'check' }, input, f.label);
      return h('label', { class: 'field' }, f.label, input);
    });
    const value = (f) => (f.type === 'checkbox' ? inputs[f.name].checked : f.type === 'number' ? Number(inputs[f.name].value) : inputs[f.name].value);
    const submit = h('button', { class: 'btn primary', type: 'submit' }, submitLabel);
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        submit.disabled = true;
        try {
          const data = Object.fromEntries(fields.map((f) => [f.name, value(f)]));
          const keep = await onSubmit(data, extra?.read?.());
          if (keep !== false) close();
        } catch (ex) { err.textContent = ex.message; } finally { submit.disabled = false; }
      },
    }, fieldEls, extra?.node, err,
      h('div', { class: 'foot' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Annuler'), submit));
    return [h('h3', { text: title }), form];
  });
}

/* ---------------- Comptes ---------------- */
async function viewAccounts(root) {
  const accounts = await api('GET', '/api/admin/accounts');
  const reload = () => render();
  const rows = accounts.map((a) => h('tr', {},
    h('td', {}, h('strong', { text: a.pseudo })),
    h('td', { class: 'muted', text: a.email }),
    h('td', {}, h('span', { class: `badge ${a.role === 'admin' ? 'warn' : ''}`, text: a.role === 'admin' ? 'Admin' : 'Joueur' })),
    h('td', {}, a.disabled ? h('span', { class: 'badge bad', text: 'Désactivé' }) : a.mustChangePassword ? h('span', { class: 'badge warn', text: 'Mot de passe temporaire' }) : h('span', { class: 'badge ok', text: 'Actif' })),
    h('td', { class: 'muted', text: fmtDate(a.lastLoginAt) }),
    h('td', {}, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => editAccount(a, reload) }, 'Modifier'),
      h('button', { class: 'btn sm', onclick: async () => {
        if (!confirm(`Générer un nouveau mot de passe pour ${a.pseudo} ?`)) return;
        const r = await api('PATCH', `/api/admin/accounts/${a.id}`, { generatePassword: true });
        secretDialog('Mot de passe réinitialisé', a.pseudo, r.temporaryPassword); reload();
      } }, 'Nouveau mdp'),
      h('button', { class: 'btn sm', onclick: async () => {
        try { await api('PATCH', `/api/admin/accounts/${a.id}`, { disabled: !a.disabled }); reload(); } catch (e) { toast(e.message); }
      } }, a.disabled ? 'Activer' : 'Désactiver'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        if (!confirm(`Supprimer définitivement ${a.pseudo} ?`)) return;
        try { await api('DELETE', `/api/admin/accounts/${a.id}`); reload(); } catch (e) { toast(e.message); }
      } }, 'Supprimer')))));
  root.append(
    h('div', { class: 'head' }, h('h2', { text: `Comptes (${accounts.length})` }),
      h('button', { class: 'btn primary', onclick: () => createAccount(reload) }, 'Nouveau compte')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Pseudo', 'E-mail', 'Rôle', 'État', 'Dernière connexion', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows))));
}
function createAccount(reload) {
  formDialog({
    title: 'Nouveau compte', submitLabel: 'Créer',
    fields: [
      { name: 'pseudo', label: 'Pseudo', placeholder: '3 à 24 caractères' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'role', label: 'Rôle', type: 'select', options: [['user', 'Joueur'], ['admin', 'Admin']] },
      { name: 'password', label: 'Mot de passe (vide = généré)', type: 'text' },
    ],
    onSubmit: async (d) => {
      const r = await api('POST', '/api/admin/accounts', { ...d, password: d.password || undefined });
      reload(); secretDialog('Compte créé', r.pseudo, r.temporaryPassword);
    },
  });
}
function editAccount(a, reload) {
  formDialog({
    title: `Modifier ${a.pseudo}`,
    fields: [
      { name: 'pseudo', label: 'Pseudo', value: a.pseudo },
      { name: 'email', label: 'E-mail', type: 'email', value: a.email },
      { name: 'role', label: 'Rôle', type: 'select', options: [['user', 'Joueur'], ['admin', 'Admin']], value: a.role },
    ],
    onSubmit: async (d) => { await api('PATCH', `/api/admin/accounts/${a.id}`, d); reload(); },
  });
}

/* ---------------- Jeux ---------------- */
async function viewGames(root) {
  const games = await api('GET', '/api/admin/games');
  const reload = () => render();
  const rows = games.map((g) => h('tr', {},
    h('td', {}, h('span', { class: 'swatch' }, ''), h('strong', { text: g.name }), h('div', { class: 'muted mono', text: g.slug })),
    h('td', {}, h('span', { class: `badge ${g.published ? 'ok' : ''}`, text: g.published ? 'Publié' : 'Brouillon' }), ' ',
      h('span', { class: 'badge', text: g.isPublic ? 'Public' : `Privé (${g.accessCount})` })),
    h('td', { class: 'muted mono', text: g.githubRepo || '—' }),
    h('td', {}, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => releasesDialog(g) }, 'Releases'),
      h('button', { class: 'btn sm', onclick: () => editGame(g, reload) }, 'Modifier'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        if (!confirm(`Supprimer ${g.name} ?`)) return;
        try { await api('DELETE', `/api/admin/games/${g.id}`); reload(); } catch (e) { toast(e.message); }
      } }, 'Supprimer')))));
  rows.forEach((tr, i) => tr.querySelector('.swatch').style.setProperty('background', games[i].accent));
  root.append(
    h('div', { class: 'head' }, h('h2', { text: `Jeux (${games.length})` }),
      h('button', { class: 'btn primary', onclick: () => editGame(null, reload) }, 'Nouveau jeu')),
    games.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Jeu', 'Visibilité', 'Dépôt GitHub', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows))) : h('div', { class: 'card empty', text: 'Aucun jeu. Crée le premier.' }));
}

async function releasesDialog(g) {
  const info = await api('GET', `/api/admin/games/${g.id}/releases`).catch((e) => ({ error: e.message }));
  const line = (label, r) => h('p', {}, h('strong', { text: label + ' : ' }), r ? `${r.version} (${r.tag})` : 'aucune release avec manifest.json');
  dialog((close) => [
    h('h3', { text: `Releases de ${g.name}` }),
    g.githubRepo ? [line('Stable', info.stable), line('Bêta', info.beta),
      h('p', { class: 'muted', text: 'Cache de 5 minutes. Une release doit contenir un asset manifest.json (voir tools/make-release.mjs).' })]
      : h('p', { class: 'muted', text: 'Aucun dépôt GitHub renseigné pour ce jeu.' }),
    h('div', { class: 'foot' }, h('button', { class: 'btn primary', onclick: close }, 'Fermer')),
  ]);
}

async function editGame(g, reload) {
  const accounts = await api('GET', '/api/admin/accounts');
  const granted = g ? new Set((await api('GET', `/api/admin/games/${g.id}/access`)).accountIds) : new Set();
  const boxes = accounts.map((a) => {
    const cb = h('input', { type: 'checkbox', checked: granted.has(a.id) });
    return { id: a.id, cb, node: h('label', { class: 'check' }, cb, `${a.pseudo} `, h('span', { class: 'muted', text: a.email })) };
  });
  const accessNode = h('div', { class: 'field' }, h('span', { text: "Accès (si le jeu n'est pas public)" }),
    h('div', { class: 'accesslist' }, boxes.length ? boxes.map((b) => b.node) : h('span', { class: 'muted', text: 'Aucun compte' })));
  const v = g || { slug: '', name: '', description: '', iconUrl: '', bannerUrl: '', accent: '#f59e0b', executable: '', launchArgs: '-AccountID={accountId} -AccountName={pseudo} -Ticket={ticket}', githubRepo: '', isPublic: false, published: false, sortOrder: 0 };
  formDialog({
    title: g ? `Modifier ${g.name}` : 'Nouveau jeu',
    fields: [
      { name: 'name', label: 'Nom', value: v.name },
      { name: 'slug', label: 'Identifiant (minuscules, tirets)', value: v.slug },
      { name: 'description', label: 'Description', type: 'textarea', value: v.description },
      { name: 'githubRepo', label: 'Dépôt GitHub des releases (proprietaire/depot)', value: v.githubRepo, placeholder: 'Badyssblt/taf' },
      { name: 'executable', label: "Exécutable (chemin relatif dans le dossier d'installation)", value: v.executable, placeholder: 'Taf.exe' },
      { name: 'launchArgs', label: 'Arguments de lancement ({accountId} {pseudo} {ticket})', value: v.launchArgs },
      { name: 'iconUrl', label: "URL de l'icône", value: v.iconUrl },
      { name: 'bannerUrl', label: 'URL de la bannière', value: v.bannerUrl },
      { name: 'accent', label: "Couleur d'accent", type: 'color', value: v.accent },
      { name: 'sortOrder', label: 'Ordre', type: 'number', value: v.sortOrder },
      { name: 'published', label: 'Publié (visible dans le launcher)', type: 'checkbox', value: v.published },
      { name: 'isPublic', label: 'Public (tous les comptes y ont accès)', type: 'checkbox', value: v.isPublic },
    ],
    extra: { node: accessNode },
    onSubmit: async (d) => {
      const saved = g ? await api('PATCH', `/api/admin/games/${g.id}`, d) : await api('POST', '/api/admin/games', d);
      await api('PUT', `/api/admin/games/${saved.id}/access`, { accountIds: boxes.filter((b) => b.cb.checked).map((b) => b.id) });
      reload();
    },
  });
}

/* ---------------- Actualités ---------------- */
async function viewNews(root) {
  const [news, games] = await Promise.all([api('GET', '/api/admin/news'), api('GET', '/api/admin/games')]);
  const reload = () => render();
  const rows = news.map((n) => h('tr', {},
    h('td', {}, h('strong', { text: n.title }), h('div', { class: 'muted', text: (n.body || '').slice(0, 90) })),
    h('td', {}, h('span', { class: 'badge', text: n.gameName || 'Général' })),
    h('td', { class: 'muted', text: fmtDate(n.createdAt) }),
    h('td', {}, h('div', { class: 'actions' },
      h('button', { class: 'btn sm', onclick: () => editNews(n, games, reload) }, 'Modifier'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        if (!confirm('Supprimer cette actualité ?')) return;
        await api('DELETE', `/api/admin/news/${n.id}`); reload();
      } }, 'Supprimer')))));
  root.append(
    h('div', { class: 'head' }, h('h2', { text: `Actualités (${news.length})` }),
      h('button', { class: 'btn primary', onclick: () => editNews(null, games, reload) }, 'Nouvelle actualité')),
    news.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Titre', 'Jeu', 'Date', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows))) : h('div', { class: 'card empty', text: 'Aucune actualité.' }));
}
function editNews(n, games, reload) {
  formDialog({
    title: n ? "Modifier l'actualité" : 'Nouvelle actualité',
    fields: [
      { name: 'gameId', label: 'Jeu', type: 'select', options: [['', 'Général (tous les jeux)'], ...games.map((g) => [g.id, g.name])], value: n?.gameId || '' },
      { name: 'title', label: 'Titre', value: n?.title || '' },
      { name: 'body', label: 'Texte', type: 'textarea', value: n?.body || '' },
    ],
    onSubmit: async (d) => {
      const body = { ...d, gameId: d.gameId || null };
      if (n) await api('PATCH', `/api/admin/news/${n.id}`, body); else await api('POST', '/api/admin/news', body);
      reload();
    },
  });
}

/* ---------------- Coquille ---------------- */
let tab = 'accounts';
const tabs = { accounts: ['Comptes', viewAccounts], games: ['Jeux', viewGames], news: ['Actualités', viewNews] };

async function render() {
  if (!me) return renderLogin();
  if (me.mustChangePassword) return renderChangePassword();
  const main = h('main', { class: 'main' });
  $app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('span', { class: 'dot' }), 'Launcher admin'),
      h('nav', { class: 'nav' }, Object.entries(tabs).map(([k, [label]]) =>
        h('button', { class: k === tab ? 'active' : '', onclick: () => { tab = k; render(); } }, label))),
      h('div', { class: 'who' }, h('span', { text: `Connecté : ${me.pseudo}` }),
        h('button', { class: 'btn sm', onclick: logout }, 'Déconnexion'))),
    main));
  try { await tabs[tab][1](main); } catch (e) { main.append(h('div', { class: 'card err', text: e.message })); }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: store.refresh }) }).catch(() => {});
  store.clear(); me = null; render();
}

function authCard(title, subtitle, fields, submitLabel, onSubmit) {
  const err = h('div', { class: 'err' });
  const inputs = fields.map((f) => h('input', { type: f.type || 'text', placeholder: f.label, autocomplete: f.auto || 'off', required: true }));
  const btn = h('button', { class: 'btn primary', type: 'submit' }, submitLabel);
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { await onSubmit(inputs.map((i) => i.value)); } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
  } }, h('div', { class: 'brand' }, h('span', { class: 'dot' }), title), h('p', { class: 'muted', text: subtitle }), inputs, err, btn);
  $app.replaceChildren(h('div', { class: 'login' }, form));
}

function renderLogin() {
  authCard('Launcher admin', 'Connexion administrateur', [{ label: 'Pseudo ou e-mail', auto: 'username' }, { label: 'Mot de passe', type: 'password', auto: 'current-password' }], 'Se connecter',
    async ([login, password]) => {
      const j = await api('POST', '/api/auth/login', { login, password }, false);
      if (j.account.role !== 'admin') throw new Error('Réservé aux administrateurs');
      store.set(j.accessToken, j.refreshToken); me = j.account; render();
    });
}
function renderChangePassword() {
  authCard('Nouveau mot de passe', 'Choisis un mot de passe personnel (8 caractères minimum).', [{ label: 'Mot de passe actuel', type: 'password', auto: 'current-password' }, { label: 'Nouveau mot de passe', type: 'password', auto: 'new-password' }], 'Enregistrer',
    async ([cur, next]) => {
      const j = await api('POST', '/api/me/password', { currentPassword: cur, newPassword: next });
      store.set(j.accessToken, j.refreshToken); me = j.account; render();
    });
}

(async () => {
  if (store.access) { try { me = await api('GET', '/api/me'); if (me.role !== 'admin') throw 0; } catch { store.clear(); me = null; } }
  render();
})();
