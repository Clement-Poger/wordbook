# Wordstep — guide d’installation

Ce guide explique comment relier l’application à Supabase, préparer les deux comptes et lancer le site en local.

## Les deux comptes

| Nom saisi sur le site | Adresse à créer dans Supabase Auth | Rôle Wordstep |
| --- | --- | --- |
| `elios` | `elios@word.book` | Admin : peut lire, ajouter, modifier et supprimer des leçons |
| `eva` | `eva@word.book` | Apprenante : peut lire les leçons et faire les quiz |

Les mots de passe se configurent directement dans Supabase Auth, jamais dans le code, le fichier `.env` ou ce dépôt. Saisis le mot de passe correspondant fourni pour chaque compte. Comme ils ont été partagés dans cette conversation, remplace-les par des mots de passe uniques et robustes avant toute mise en ligne.

## Étape 1 — Créer le projet Supabase

1. Va sur [supabase.com/dashboard](https://supabase.com/dashboard), connecte-toi et crée un projet.
2. Attends que le projet soit prêt.
3. Dans les réglages du projet, ouvre **API Keys** (ou **Settings → API**, selon l’interface).
4. Garde sous la main l’URL du projet et sa clé **publique** `anon` ou `publishable`. Elle ressemble à `https://abcdefgh.supabase.co`.

> **Important :** utilise uniquement la clé publique. Ne copie jamais la clé `service_role`, `secret` ou une clé secrète dans l’application.

## Étape 2 — Créer les utilisateurs et leurs mots de passe

Dans le tableau de bord du projet :

1. Ouvre **Authentication → Users**.
2. Clique sur **Add user** / **Create new user**.
3. Crée le premier compte avec l’adresse `elios@word.book` et le mot de passe fourni pour ce compte. Coche **Auto Confirm User** / **Confirm email** si cette option apparaît.
4. Répète l’opération pour `eva@word.book`, avec le mot de passe fourni pour ce compte, et confirme aussi son adresse.

Le site te demande le nom d’utilisateur (`elios` ou `eva`) et le mot de passe correspondant. N’active pas les inscriptions publiques : les comptes doivent être créés depuis le tableau de bord Supabase.

## Étape 3 — Créer les leçons et les permissions

Les fichiers de migration dans [`supabase/migrations/`](./supabase/migrations/) configurent la base :

- crée la table des profils et la table des leçons ;
- ajoute dix leçons de départ ;
- active les règles de sécurité **Row Level Security (RLS)** ;
- autorise les utilisateurs connectés à consulter les leçons ;
- réserve les changements de leçons au rôle admin ;
- ne garde que les niveaux B1, B2 et C1 (les leçons A1/A2 existantes passent automatiquement au niveau B1).

Pour l’exécuter :

1. Ouvre **SQL Editor** dans le tableau de bord Supabase.
2. Dans VS Code, ouvre `202610090001_wordstep.sql`, sélectionne et copie tout son contenu.
3. Colle le SQL dans une nouvelle requête de l’éditeur Supabase et clique sur **Run**.
4. Répète ces étapes avec `202610090002_intermediate_levels.sql`, puis `202610090004_update_accounts.sql`.
5. Attends le message indiquant que les requêtes se sont terminées sans erreur.

Si le premier fichier a déjà été exécuté pour configurer ton projet, ne le relance pas : exécute les nouvelles migrations `202610090002_intermediate_levels.sql` puis `202610090004_update_accounts.sql`. Cette dernière met à jour le profil `eva_villega` en `eva`.

Tu peux aussi copier son contenu avec le terminal, depuis la racine du projet :

```powershell
Get-Content .\supabase\migrations\202610090001_wordstep.sql -Raw | Set-Clipboard
```

Reviens ensuite dans **SQL Editor**, colle le contenu, puis clique sur **Run**. Répète avec `202610090002_intermediate_levels.sql` et `202610090004_update_accounts.sql` avant de continuer.

## Étape 4 — Attribuer les rôles

La migration crée les règles et les tables, mais elle ne peut pas attribuer les rôles avant l’existence des comptes Auth. Une fois les deux utilisateurs créés **et** la migration exécutée :

1. Dans **SQL Editor**, ouvre une nouvelle requête.
2. Copie-colle le SQL ci-dessous et clique sur **Run**.

```sql
insert into public.profiles (id, username, role)
select id, 'elios', 'admin'
from auth.users
where email = 'elios@word.book'
on conflict (id) do update
set username = excluded.username, role = excluded.role;

insert into public.profiles (id, username, role)
select id, 'eva', 'user'
from auth.users
where email = 'eva@word.book'
on conflict (id) do update
set username = excluded.username, role = excluded.role;
```

3. Vérifie les rôles en exécutant cette requête :

```sql
select username, role from public.profiles order by username;
```

Le résultat doit contenir exactement :

| username | role |
| --- | --- |
| `elios` | `admin` |
| `eva` | `user` |

Si une ligne manque, vérifie que l’adresse correspondante apparaît dans **Authentication → Users**, puis relance le SQL d’attribution des rôles.

Si tu as déjà créé les anciens comptes Auth, modifie leur adresse e-mail dans **Authentication → Users** pour utiliser celles indiquées ci-dessus et réinitialise leurs mots de passe. Garde les mêmes utilisateurs pour conserver leurs identifiants Supabase (UUID), puis exécute les migrations `202610090002_intermediate_levels.sql` et `202610090004_update_accounts.sql`, et relance le SQL d’attribution des rôles.

## Étape 5 — Configurer Wordstep sur ton ordinateur

Installe [Node.js 22.9 ou plus récent](https://nodejs.org/). Dans un terminal ouvert à la racine du projet, crée le fichier `.env` à partir du modèle **seulement s’il n’existe pas déjà** :

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Ouvre `.env` dans VS Code et ajoute ou remplace les valeurs de configuration Supabase suivantes par celles de **ton** projet :

```dotenv
SUPABASE_URL=https://ton-id-de-projet.supabase.co
SUPABASE_ANON_KEY=ta-cle-publique-anon-ou-publishable
```

Conserve les autres paramètres qui se trouvent déjà dans le fichier. `.env` est ignoré par Git : **ne le partage pas et ne le commit pas**. La clé `anon` / `publishable` est prévue pour l’application cliente et les règles RLS protègent les données ; la clé `service_role` ne doit jamais être utilisée ici.

## Étape 6 — Lancer et essayer le site

Cette étape est seulement pour un aperçu local : GitHub Pages hébergera le site directement et ne nécessite pas `npm start`.

Depuis la racine du projet, ouvre un terminal et lance :

```powershell
npm start
```

Ouvre ensuite [http://127.0.0.1:3000](http://127.0.0.1:3000) dans ton navigateur.

- Connecte-toi avec `elios` et le mot de passe défini pour `elios@word.book` : l’entrée **Manage lessons** te permet d’ajouter, modifier ou supprimer des mots.
- Déconnecte-toi, puis connecte-toi avec `eva` et son mot de passe : elle peut chercher les mots et faire un quiz, sans accès à l’administration.

## En cas de problème

- **« This account isn’t set up for Wordstep »** : le compte Supabase Auth n’a pas de profil Wordstep correspondant. Recommence l’étape 4 et vérifie l’adresse e-mail exacte.
- **« We couldn’t load the lesson shelf »** : vérifie que la migration a été exécutée sans erreur et que l’utilisateur est connecté.
- **Le site ne se connecte pas à Supabase** : vérifie `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `.env`, puis arrête et relance `npm start`.
- **Mot de passe oublié** : modifie ou réinitialise le mot de passe de l’utilisateur dans **Authentication → Users** du tableau de bord Supabase.

## Publier sur GitHub Pages

Le dépôt inclut un workflow GitHub Actions (`.github/workflows/deploy-pages.yml`) qui publie les fichiers statiques de `public/`. Il crée la configuration Supabase au moment du déploiement : aucun serveur Node ni commande `npm start` n’est utilisé par le site en ligne.

1. Sur GitHub, ouvre **Clement-Poger/gbook → Settings → Secrets and variables → Actions**.
2. Ajoute ces repository secrets avec les valeurs du projet Supabase : `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
3. Vérifie que `SUPABASE_ANON_KEY` est bien la clé publique `anon`/`publishable`. Le workflow l’injecte dans le JavaScript livré au navigateur, où cette clé est visible par conception. **N’utilise jamais une clé `service_role` ou une clé secrète.** La protection des données repose sur les règles RLS Supabase.
4. Dans **Settings → Pages**, choisis **GitHub Actions** comme source de publication.
5. Dans Supabase, ajoute l’URL GitHub Pages du site aux URLs autorisées de **Authentication → URL Configuration**. Pour ce dépôt, l’URL est généralement `https://clement-poger.github.io/gbook/`. Utilise l’URL réellement affichée dans **Settings → Pages** si elle diffère.
6. Pousse tes changements sur la branche `main`, ou lance **Actions → Deploy Wordstep to GitHub Pages → Run workflow**. L’URL publiée apparaîtra dans l’exécution du workflow et dans **Settings → Pages**.

Le workflow crée `public/supabase-config.js` uniquement dans l’environnement temporaire de publication. Ne crée pas et ne commit pas ce fichier dans le dépôt. Les chemins des fichiers sont relatifs à l’application, ce qui permet de la servir sous `/gbook/` sur GitHub Pages.

## Ce que contient l’application

- Bibliothèque de leçons filtrable, avec définitions, exemples, niveaux, thèmes et prononciation.
- Trois niveaux disponibles : B1, B2 et C1.
- Favoris mémorisés sur l’appareil.
- Quiz à choix multiples avec questions mélangées, explication après chaque réponse et points de pratique.
- Administration des leçons réservée à `elios`, protégée à la fois dans l’interface et par les règles RLS de Supabase.
- Icônes centralisées dans [`public/icons.svg`](./public/icons.svg) et styles inspirés de CodeBook et Codarium dans [`public/styles.css`](./public/styles.css).

Le serveur Node et `npm start` restent disponibles pour le développement local. La publication GitHub Pages décrite ci-dessus sert les fichiers statiques et conserve la connexion directe à Supabase. Ne publie jamais le fichier `.env` ni une clé `service_role`.
