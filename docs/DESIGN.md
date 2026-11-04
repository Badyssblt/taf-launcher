# Design du launcher

Demande : simple et moderne, style Steam multi-jeux, sobre sans être fade, sans grande illustration.

## Idée directrice

L'interface est neutre ; **la couleur vient du jeu affiché**. Passer d'un jeu à l'autre teinte toute l'interface
(bouton, en-tête, repères) à la couleur d'accent du jeu, en fondu de 350 ms. C'est le seul moment « marquant » ;
tout le reste est discret.

## Tokens (`src/styles.css`)

| Rôle | Valeur |
|---|---|
| Fenêtre / contenu (`bg`) | `#14181f` (ardoise bleutée, pas de noir pur) |
| Barre latérale et titre (`side`) | `#0f1217` |
| Survol / champs (`raise`, `raise-2`) | `#1a2029`, `#232b37` |
| Filets (`line`) | `#2a323e`, utilisés seulement quand ils structurent |
| Texte / secondaire / discret | `#e6eaf0` / `#8b95a5` / `#5f6978` |
| Accent | variable `--accent`, fixée par le jeu (admin : champ « Couleur d'accent ») ; `--accent-ink` (noir ou blanc) calculé pour rester lisible |

Accent sans jeu (accueil, paramètres) : `#8ab4ff`.

## Typographie

- Titres : **Bricolage Grotesque** (variable), serré (`-0.01em`), 30 à 40 px pour les titres de page.
- Texte : **Geist** (variable), 14 px ; chiffres tabulaires (`tabular-nums`) pour versions, tailles, vitesses, dates.
- Longueur de ligne ≤ 68 caractères. Casse de phrase, jamais de majuscules d'étiquette.

## Structure

- Pas de cartes : les sections sont à plat (titre + contenu), séparées par un filet. Seules les tuiles de jeu de l'accueil sont des blocs, teintés à la couleur du jeu.
- Actualités en chronologie : la date à gauche, le contenu à droite.
- Rayons différenciés : champs et boutons 6 px, tuiles et menus 10 px, icônes de jeu 20 % de leur taille.
- Page de jeu : en-tête teinté, titre, **Jouer** (ou Installer / Mettre à jour) + menu + état en une ligne, puis contenu à gauche et fiche d'informations à droite (empilés sous ~1000 px).

## Mouvement

Seulement ce qui répond à une action : appui sur un bouton (échelle 0,97, 100 ms), ouverture du menu (ressort),
notification, barre de progression, et le fondu de couleur au changement de jeu. Aucune entrée en fondu des pages.
`prefers-reduced-motion` est respecté.

## À éviter

Lueurs autour des boutons, dégradés décoratifs, un seul mot coloré dans un titre, étiquettes en majuscules, textes
d'introduction de remplissage (« Que veux-tu lancer aujourd'hui ? »), icône dans chaque bloc.

## Textes

Courts, verbes simples, même mot pour la même action (« Installer » → « Installation en cours »). Les erreurs disent
ce qui s'est passé et quoi faire, sans s'excuser.
