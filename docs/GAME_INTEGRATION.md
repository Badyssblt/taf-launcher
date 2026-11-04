# Intégrer un jeu au launcher

Ce document décrit ce qu'un jeu doit faire pour fonctionner avec le launcher : être lancé avec l'identité du compte,
la vérifier, et être publié sous forme de releases.

## 1. Déclarer le jeu (panneau d'admin)

`https://launcher.badyssblilita.fr/admin/` → **Jeux** → **Nouveau jeu** :

| Champ | Exemple | Rôle |
|---|---|---|
| Identifiant | `taf` | Nom du dossier d'installation et audience des tickets (`game:taf`) |
| Dépôt GitHub | `Badyssblt/taf` | Dépôt public dont les releases contiennent le jeu |
| Exécutable | `Taf/Binaries/Win64/Taf.exe` | Chemin relatif au dossier d'installation |
| Arguments | `-AccountID={accountId} -AccountName={pseudo} -Ticket={ticket}` | Passés au jeu au lancement |
| Publié / Public | | `Publié` = visible dans le launcher ; `Public` = tous les comptes, sinon liste d'accès |

## 2. Ce que reçoit le jeu

Le launcher demande un **ticket** au backend juste avant de lancer le jeu, puis lance l'exécutable avec :

```
Taf.exe -AccountID=<uuid du compte> -AccountName=<pseudo> -Ticket=<jeton signé>
```

`AccountID` est l'identifiant **stable** du compte : c'est la clé à utiliser pour les sauvegardes
(`UTafSaveGame`, `GetSaveSlotName()`, `OwnerKey`...) à la place du pseudo, qui peut changer.

Dans Unreal : lire les arguments dans `UGameInstance::Init` avec `FParse::Value(FCommandLine::Get(), TEXT("AccountID="), Out)`.

## 3. Vérifier le ticket (obligatoire côté serveur)

Les arguments de ligne de commande sont modifiables par n'importe quel joueur : **ne jamais faire confiance à
`-AccountID` seul**. Le `-Ticket` est un JWT signé (EdDSA / Ed25519) par le backend :

- en-tête : `{"alg":"EdDSA","kid":"…","typ":"JWT"}`
- claims : `iss` = `https://launcher.badyssblilita.fr`, `aud` = `game:<identifiant>`, `sub` = AccountID,
  `name` = pseudo, `tt` = `ticket`, `exp` = émission + 5 minutes
- clé publique : `GET https://launcher.badyssblilita.fr/api/public-key` (PEM) ou `/.well-known/jwks.json`

Procédure pour l'hôte d'une partie (listen server) ou un serveur dédié, à la connexion d'un client :

1. Le client envoie son ticket à la connexion (option d'URL `?Ticket=…`, lue dans `AGameModeBase::PreLogin`).
2. Le serveur vérifie la signature avec la clé publique **embarquée dans le jeu** (ou récupérée une fois et mise en cache),
   puis `iss`, `aud == game:taf`, `tt == ticket`, `exp` non dépassé.
3. Il prend `sub` comme identité du joueur ; en cas d'échec, il refuse la connexion (`ErrorMessage` de `PreLogin`).

Le ticket n'est vérifié qu'**à la connexion** (il expire vite, c'est normal). La vérification Ed25519 est
possible avec OpenSSL (livré avec Unreal, `EVP_DigestVerify` avec `EVP_PKEY_ED25519`) ou libsodium
(`crypto_sign_verify_detached`). Ne pas écrire sa propre cryptographie.

## 4. Publier une version du jeu

1. Packager le jeu (Unreal : *Platforms → Windows → Package Project*).
2. Générer les archives et le manifeste :

   ```
   node tools/make-release.mjs --dir D:/Builds/Taf/Windows --game taf --version 1.4.0 ^
        --repo Badyssblt/taf --out D:/Releases/taf-1.4.0 --exclude "\.pdb$" --exclude "^Saved/"
   ```

   Le build est coupé en fichiers `taf-1.4.0.part001`, `part002`… de moins de 2 Go (limite GitHub) et
   `manifest.json` liste chaque fichier avec sa taille, son SHA-256 et sa position dans le flux.
3. Sur GitHub, créer une release **`v1.4.0`** dans le dépôt du jeu et y déposer **tous** les fichiers du dossier
   `--out`. Cocher *pre-release* pour la publier sur le canal **bêta** seulement.
4. Les launchers voient la nouvelle version au plus tard 5 minutes plus tard (cache du backend) et proposent
   « Mettre à jour ». Seuls les fichiers modifiés sont retéléchargés.

Une release sans `manifest.json` est ignorée.

## 5. Arguments de lancement supplémentaires

Les arguments sont un modèle découpé sur les espaces ; `{accountId}`, `{pseudo}` et `{ticket}` sont remplacés
jeton par jeton (pas d'injection possible). Pour passer d'autres options (ex. `-windowed`), les écrire telles quelles.
