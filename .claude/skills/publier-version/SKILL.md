---
name: publier-version
description: Publie une nouvelle version d'un jeu (Taf) pour le launcher. Retrouve ce qui a changé depuis la dernière release, rédige les notes de version pour les joueurs, propose le numéro, puis publie sur GitHub après validation. À utiliser quand l'utilisateur demande de publier, sortir ou mettre en ligne une version de Taf, ou de préparer les notes de version.
---

# Publier une version d'un jeu

Jeu concerné par défaut : **Taf**. Projet git : `C:\Users\badys\Documents\Unreal Projects\Taf 5.8`. Dépôt des builds (public, builds seulement) : `Badyssblt/taf`.
Répondre en français. Ne **jamais publier sans l'accord explicite** de l'utilisateur sur la version, le canal et les notes.

## 1. Le build

Le build est le dossier empaqueté par Unreal : par défaut `<projet>\Saved\StagedBuilds\Windows` (contient `Taf.exe`). `Binaries\Win64` n'est pas un build.
Vérifier qu'il est **plus récent que le dernier commit** (date de `Taf\Binaries\Win64\Taf-Win64-Shipping.exe` contre `git log -1 --format=%aI`). S'il est plus ancien, dire à l'utilisateur
qu'il doit re-packager dans Unreal (Platforms > Windows > Package Project) : sinon les notes décriraient des changements absents du build. Ne pas packager soi-même si l'éditeur est ouvert.

## 2. Collecter les changements

```powershell
node tools/changes-since-release.mjs --source "C:\Users\badys\Documents\Unreal Projects\Taf 5.8" --release-repo Badyssblt/taf
```

Le point de départ est le repère `<!-- source-commit: HASH -->` des notes de la dernière release. S'il manque (cas de la v1.0.0), le script répond `error` : demander à l'utilisateur
le commit de départ, ou prendre le dernier commit avant l'heure du build de la release précédente (`git log --before=<heure> -1`) et le passer avec `--base`.
Si `uncommitted` > 0, le dire : les notes ne couvrent que ce qui est commité, et le build peut contenir autre chose.

## 3. Rédiger les notes (pour les joueurs, pas pour les développeurs)

- Français, phrases courtes, verbes simples, 3 à 8 lignes au total. Pas de noms de classes, de fichiers, de commits ni de jargon C++/Unreal.
- Regrouper en `## Nouveautés`, `## Corrections`, et `## Divers` seulement si utile. Format du launcher : titres `##`, listes `- `, paragraphes. Rien d'autre (pas de gras, de liens, de tableaux).
- Décrire l'effet pour le joueur (« Les joueurs se connectent avec leur compte du launcher »), pas la méthode. Ignorer les lignes `Co-Authored-By`.
- Ignorer ce qui est purement interne (config de packaging, tests, documentation, refactorisation) ; s'il ne reste rien : `- Améliorations et corrections diverses.`
- Ne rien inventer : chaque ligne doit venir d'un commit. En cas de doute sur ce qu'un commit change pour le joueur, le signaler à l'utilisateur plutôt que deviner.

## 4. Proposer la version

Lire la dernière version (`tag` du script). Proposer : **correctif** (x.y.z+1) si seulement des corrections, **nouveauté** (x.y+1.0) si de nouvelles fonctions, **majeur** (x+1.0.0) si les sauvegardes ou
la compatibilité changent. La nouvelle version doit être supérieure à la précédente. Canal : stable par défaut ; bêta (`--prerelease`) si l'utilisateur le demande.

## 5. Valider avec l'utilisateur

Présenter en un bloc : version, canal, notes finales, dossier du build et sa date, nombre de commits. Demander « je publie ? » et attendre. Corriger les notes selon ses remarques avant de continuer.

## 6. Publier

```powershell
$v = "<x.y.z>"; $out = "C:\Users\badys\Documents\taf-launcher\release-out\taf-$v"
node tools/make-release.mjs --dir "<dossier du build>" --game taf --version $v --repo Badyssblt/taf --out $out --exclude "\.pdb$" --exclude "^Manifest_"
# Notes : fichier UTF-8 (accents), repère du commit source en dernière ligne
[System.IO.File]::WriteAllText("$out\notes.md", "<notes>`n`n<!-- source-commit: <headFull du script> -->`n", (New-Object System.Text.UTF8Encoding($false)))
& "C:\Program Files\GitHub CLI\gh.exe" release create "v$v" "$out\manifest.json" (Get-ChildItem "$out\taf-$v.part*").FullName --repo Badyssblt/taf --title "Taf $v" --notes-file "$out\notes.md" [--prerelease]
```

Si `gh` demande de se reconnecter : `gh auth login --hostname github.com --git-protocol ssh --web --skip-ssh-key --scopes repo`, puis donner le code affiché à l'utilisateur.
Le repère `source-commit` est le `HEAD` du projet du jeu au moment de la publication : il doit correspondre au build packagé (d'où le contrôle du point 1).

## 7. Vérifier

- La release existe avec `manifest.json` et toutes les archives (`gh release view v$v --repo Badyssblt/taf`) ; le manifeste en ligne annonce la bonne version.
- Dire à l'utilisateur que les joueurs voient « Mettre à jour » sous 5 minutes (cache du backend) et ne téléchargent que les fichiers modifiés.
- Ne jamais supprimer ni réécrire une release publiée : en cas d'erreur, publier une version corrective.
