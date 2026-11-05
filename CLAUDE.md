# Launcher multi-jeux

Launcher de bureau (style Steam) pour plusieurs jeux, dont **Taf** (UE 5.8, voir `C:\Users\badys\Documents\Unreal Projects\Taf 5.8\CLAUDE.md`).
Backend Fastify sur le VPS, application Tauri 2 + React. Voir `README.md` pour l'architecture et les commandes.

## Règles du projet

- **Répondre en français.** Textes d'interface courts, à l'essentiel, sans justification évidente (même règle que Taf).
- **Comptes créés par l'admin uniquement** : pas d'inscription publique, pas de service d'e-mail.
- **Valeurs de réglage hors du code** : variables d'environnement côté backend (`src/config.ts`), champs du panneau d'admin côté jeux.
- **Secrets jamais dans git** : `.env`, `SIGNING_KEY`, clé de signature des mises à jour (`C:\Users\badys\.taf-launcher\`).
- **Ne jamais modifier une migration SQL déjà déployée** (`backend/src/migrations.ts`) : ajouter une migration à la suite.
- **Le jeu ne doit jamais faire confiance à `-AccountID` seul** : il vérifie le ticket signé (voir `docs/GAME_INTEGRATION.md`).
- **Commits** : à chaque étape stable (tests verts). Fins de ligne LF (`.gitattributes`).

## Publier une version d'un jeu (Taf)

**Utiliser le skill `publier-version`** (`.claude/skills/publier-version/SKILL.md`) : il collecte les changements (`tools/changes-since-release.mjs`),
rédige les notes pour les joueurs, propose la version et publie après accord. Mémo de la procédure manuelle ci-dessous.

Le dépôt des builds de Taf est `Badyssblt/taf` (public, builds seulement, jamais le code source). Le build à publier est le dossier
empaqueté par Unreal : par défaut `C:\Users\badys\Documents\Unreal Projects\Taf 5.8\Saved\StagedBuilds\Windows` (contient `Taf.exe` ;
`Binaries\Win64` n'est PAS un build). Demander la version (`x.y.z`, doit dépasser la précédente), les notes de version, stable ou bêta.

```powershell
node tools/make-release.mjs --dir "<dossier du build>" --game taf --version <x.y.z> --repo Badyssblt/taf `
  --out "C:\Users\badys\Documents\taf-launcher\release-out\taf-<x.y.z>" --exclude "\.pdb$" --exclude "^Manifest_"
& "C:\Program Files\GitHub CLI\gh.exe" release create v<x.y.z> release-out\taf-<x.y.z>\* --repo Badyssblt/taf `
  --title "Taf <x.y.z>" --notes "<notes de version>" [--prerelease]   # --prerelease = canal bêta
```

Ensuite vérifier : `GET /api/games` (admin) voit la version, ou ouvrir le launcher. Le jeu est déclaré en base de production
(slug `taf`, exécutable `Taf.exe`) ; les autres champs se changent dans le panneau d'admin. Les notes de version s'affichent dans le launcher
(titres `#`, listes `-`). Ne jamais supprimer ni réécrire une release publiée : en publier une nouvelle.
Test réel d'installation sans toucher au vrai launcher : voir `LAUNCHER_KEYRING_SERVICE` et `WEBVIEW2_USER_DATA_FOLDER` (profil isolé).

## Design

Toute modification d'interface suit `docs/DESIGN.md` (tokens, typographie, structure, mouvement). Utiliser le skill `frontend-design`.
Vérifier le rendu au navigateur (taille 1180x740 puis 960x600) avant de conclure.

## Pièges appris

- Fastify refuse `content-type: application/json` avec un corps vide : un parseur tolérant est installé dans `app.ts` (les clients envoient l'en-tête sur les DELETE). Les tests via `inject` ne le détectent pas sans en-tête explicite.
- PostgreSQL embarqué sous Windows s'initialise en WIN1252 : toujours `--encoding=UTF8` (fait dans `dev-db.ts` et les tests).
- Les binaires de test d'un crate qui dépend de Tauri plantent sous Windows (`STATUS_ENTRYPOINT_NOT_FOUND`) : toute logique testable vit dans `launcher/installer-core` (sans Tauri).
- Les téléchargements de jeux ne sont acceptés que depuis `https://github.com/` (validé dans le manifeste) ; chemins du manifeste contrôlés contre `..` et chemins absolus.
- Un jeu en cours d'installation est marqué non installé (`version` vide dans `.launcher-install.json`) tant que la mise à jour n'est pas terminée.
- `bash` sous Windows déforme les accents passés à `curl -d` : utiliser Node pour envoyer du JSON non ASCII.

## Où est quoi

- Backend : `backend/src/{app,auth,crypto,github}.ts`, routes dans `routes/`, panneau d'admin statique dans `backend/admin/`.
- Launcher : état dans `launcher/src/store.ts`, appels API `lib/api.ts`, pont Rust `lib/native.ts`, commandes Tauri `src-tauri/src/lib.rs`.
- Format du manifeste de jeu (schema 1) : `tools/make-release.mjs` (en-tête) et `launcher/installer-core/src/lib.rs`.
