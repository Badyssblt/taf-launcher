# Design du launcher

Demande : simple et moderne, style Steam multi-jeux, sobre sans être fade, sans grande illustration.
**Pas de dégradés, de glassmorphism, de lueurs ni d'ombres décoratives** (retiré à la demande de l'utilisateur).

## Idée directrice

Interface en graphite neutre, entièrement à plat. **La seule couleur vient du jeu affiché** : icône, bouton principal,
repères. Passer d'un jeu à l'autre change l'accent en fondu de 350 ms (variable `--accent`, réglée dans le panneau
d'admin, champ « Couleur d'accent »).

## Tokens (`src/styles.css`)

| Rôle | Valeur |
|---|---|
| Contenu (`bg`) | `#232325` |
| Barre latérale et titre (`side`) | `#19191b` |
| Blocs, champs, survol (`raise`, `raise-2`) | `#2c2c2f`, `#353539` |
| Filets (`line`) | `#3b3b40` |
| Texte / secondaire / discret | `#f1f1f3` / `#a3a3ab` / `#74747c` |
| Accent | `--accent` (jeu) ; `--accent-ink` (noir ou blanc) calculé pour rester lisible |

Accent sans jeu (accueil, paramètres) : `#8ab4ff`. Changer l'ambiance = modifier ces sept valeurs, rien d'autre.

## Typographie

- Titres : **Bricolage Grotesque** (variable), 30 à 40 px pour les titres de page.
- Texte : **Geist** (variable), 14 px ; chiffres tabulaires pour versions, tailles, vitesses, dates.
- Longueur de ligne ≤ 68 caractères. Casse de phrase, jamais de majuscules d'étiquette.

## Structure

- Pas de cartes : sections à plat (titre + contenu) séparées par un filet. Seules les tuiles de jeu de l'accueil sont des blocs.
- Actualités en chronologie : la date à gauche, le contenu à droite.
- Rayons différenciés : champs et boutons 6 px, tuiles et menus 10 px, icônes de jeu 20 % de leur taille.
- Séparation par les tons (`side` < `bg` < `raise`) et par des filets d'1 px, jamais par des ombres.
- Page de jeu : bandeau d'en-tête uni, titre, **Jouer** (ou Installer / Mettre à jour) + menu + état en une ligne, puis contenu à gauche et fiche d'informations à droite (empilés sous ~1000 px).

## Mouvement

Seulement ce qui répond à une action : appui sur un bouton (échelle 0,97, 100 ms), ouverture du menu (ressort),
notification, barre de progression, fondu de l'accent au changement de jeu. `prefers-reduced-motion` est respecté.

## À éviter

Dégradés, flou, translucidité, lueurs, ombres portées, un seul mot coloré dans un titre, étiquettes en majuscules,
textes d'introduction de remplissage, icône dans chaque bloc.

## Textes

Courts, verbes simples, même mot pour la même action (« Installer » → « Installation en cours »). Les erreurs disent
ce qui s'est passé et quoi faire, sans s'excuser.
