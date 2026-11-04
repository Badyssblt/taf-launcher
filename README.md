# Launcher

Launcher de jeux (style Steam) : bibliothèque, installation et mises à jour des jeux, comptes créés par un administrateur.

| Dossier | Contenu |
|---|---|
| `backend/` | API Fastify + PostgreSQL : comptes, sessions, catalogue de jeux, tickets signés, **panneau d'admin** (`/admin/`) |
| `launcher/` | Application de bureau : **Tauri 2** (Rust) + React + Tailwind |
| `launcher/installer-core/` | Moteur d'installation/mise à jour des jeux (Rust, testé) |
| `tools/make-release.mjs` | Prépare la release d'un jeu (archives < 2 Go + manifeste) |
| `deploy/` | `docker-compose.prod.yml` pour le VPS (Traefik) |
| `docs/GAME_INTEGRATION.md` | Brancher un jeu : arguments de lancement, vérification du ticket, publication |

API en production : <https://launcher.badyssblilita.fr> · admin : <https://launcher.badyssblilita.fr/admin/>

## Fonctionnement

- **Comptes** : pas d'inscription publique. L'admin crée les comptes (pseudo, e-mail, mot de passe temporaire à changer à la première connexion).
- **Sessions** : jeton d'accès de 15 min + jeton de rafraîchissement rotatif (30 jours, réutilisation détectée), stocké dans le trousseau Windows.
- **Jeux** : déclarés dans le panneau d'admin (nom, dépôt GitHub, exécutable, arguments, accès). Les versions viennent des **releases GitHub** du dépôt du jeu.
- **Lancement** : le launcher obtient un **ticket Ed25519** propre au jeu (5 min) et le passe avec `-AccountID -AccountName -Ticket`. Le jeu le vérifie avec la clé publique (`/api/public-key`).
- **Mises à jour du jeu** : le build est découpé en archives < 2 Go ; seuls les fichiers modifiés sont retéléchargés (requêtes HTTP `Range`), chacun vérifié par SHA-256.
- **Mises à jour du launcher** : au démarrage, il cherche une nouvelle release signée (`latest.json` sur GitHub), l'installe et se relance.

## Développement

Prérequis : Node 22+, Rust (rustup), Visual Studio Build Tools (C++), WebView2.

```bash
# Backend (PostgreSQL embarqué, sans Docker)
cd backend && npm install
npm run dev:db            # terminal 1 : PostgreSQL sur le port 54329
ADMIN_PSEUDO=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=motdepasse-test npm run dev   # terminal 2 : API sur :3000
npm test                  # 15 tests d'intégration (vrai PostgreSQL)

# Launcher
cd launcher && npm install
VITE_API_URL=http://localhost:3000 npm run tauri dev     # application complète
cd installer-core && cargo test                          # moteur d'installation
cd ../.. && node --test tools/make-release.test.mjs      # outil de release
```

## Déploiement du backend (VPS)

Le dépôt est cloné dans `/home/debian/taf-launcher` ; le `.env` (secrets, jamais commité) y est déjà créé.

```bash
ssh vps
cd /home/debian/taf-launcher && git pull
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build
```

- Traefik expose `launcher.badyssblilita.fr` (réseau `traefik`, certificat Let's Encrypt). La base n'est pas exposée.
- Sauvegarde : `docker compose -f deploy/docker-compose.prod.yml --env-file .env exec db pg_dump -U taf taf > backup.sql`
- Outils : `docker compose … exec api node dist/cli.js create-admin <pseudo> <email>` · `reset-password <pseudo>`
- **Ne jamais perdre `SIGNING_KEY`** : elle signe les tickets. La changer invalide les sessions et oblige à mettre à jour la clé publique côté jeux.

**Déploiement automatique** (facultatif) : le workflow `deploy-backend.yml` se connecte au VPS en SSH. Pour l'activer :
créer une clé dédiée (`ssh-keygen -t ed25519 -f deploy_key`), ajouter la partie publique dans `~/.ssh/authorized_keys` du VPS, puis dans
GitHub → Settings → Secrets and variables → Actions : secrets `VPS_HOST`, `VPS_USER` (`debian`), `VPS_SSH_KEY` (clé privée) et variable `DEPLOY_ENABLED=true`.

## Publier le launcher

Une fois, dans GitHub → Settings → Secrets and variables → Actions → **Secrets** :

- `TAURI_SIGNING_PRIVATE_KEY` : contenu du fichier `C:\Users\badys\.taf-launcher\updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : contenu de `C:\Users\badys\.taf-launcher\updater.key.password`

Ces fichiers sont hors du dépôt : **à sauvegarder** (sans eux, plus de mises à jour signées possibles). La clé publique est dans `launcher/src-tauri/tauri.conf.json`.

Ensuite, pour chaque version :

```bash
git tag v0.2.0 && git push origin v0.2.0
```

Le workflow `launcher-release.yml` compile l'installeur, le signe et crée la release avec `latest.json`. Les launchers installés se mettent à jour au prochain démarrage.
Le premier installeur est à télécharger depuis cette release et à distribuer (il s'installe sans droits administrateur).

## Publier un jeu

Voir [docs/GAME_INTEGRATION.md](docs/GAME_INTEGRATION.md).
