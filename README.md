# Wordstep — guide d’installation

Ce guide explique comment relier l’application à Supabase, préparer les deux comptes et lancer le site en local.

## Les deux comptes

| Nom saisi sur le site | Adresse à créer dans Supabase Auth | Rôle Wordstep |
| --- | --- | --- |
| `elios` | `elios@wordstep.invalid` | Admin : peut lire, ajouter, modifier et supprimer des leçons |
| `eva_villega` | `eva_villega@wordstep.invalid` | Apprenante : peut lire les leçons et faire les quiz |

Choisis un mot de passe pour chaque compte. Supabase Auth les conserve et les protège : ne mets aucun mot de passe dans le code, dans le fichier `.env` ou dans ce dépôt.

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
3. Crée le premier compte avec l’adresse `elios@wordstep.invalid` et un mot de passe de ton choix. Coche **Auto Confirm User** / **Confirm email** si cette option apparaît.
4. Répète l’opération pour `eva_villega@wordstep.invalid`, avec son propre mot de passe, et confirme aussi son adresse.

Ces adresses sont des identifiants techniques internes à Supabase. Le site te demande seulement le nom d’utilisateur (`elios` ou `eva_villega`) et le mot de passe correspondant. N’active pas les inscriptions publiques : les comptes doivent être créés depuis le tableau de bord Supabase.

## Étape 3 — Créer les leçons et les permissions

Le fichier [`supabase/migrations/202610090001_wordstep.sql`](./supabase/migrations/202610090001_wordstep.sql) configure la base :

- crée la table des profils et la table des leçons ;
- ajoute dix leçons de départ ;
- active les règles de sécurité **Row Level Security (RLS)** ;
- autorise les utilisateurs connectés à consulter les leçons ;
- réserve les changements de leçons au rôle admin.

Pour l’exécuter :

1. Ouvre **SQL Editor** dans le tableau de bord Supabase.
2. Dans VS Code, ouvre le fichier SQL indiqué ci-dessus, sélectionne et copie tout son contenu.
3. Colle le SQL dans une nouvelle requête de l’éditeur Supabase.
4. Clique sur **Run**. Attends le message indiquant que la requête s’est terminée sans erreur.

Tu peux aussi copier son contenu avec le terminal, depuis la racine du projet :

```powershell
Get-Content .\supabase\migrations\202610090001_wordstep.sql -Raw | Set-Clipboard
```

Reviens ensuite dans **SQL Editor**, colle le contenu, puis clique sur **Run**.

## Étape 4 — Attribuer les rôles

La migration crée les règles et les tables, mais elle ne peut pas attribuer les rôles avant l’existence des comptes Auth. Une fois les deux utilisateurs créés **et** la migration exécutée :

1. Dans **SQL Editor**, ouvre une nouvelle requête.
2. Copie-colle le SQL ci-dessous et clique sur **Run**.

```sql
insert into public.profiles (id, username, role)
select id, 'elios', 'admin'
from auth.users
where email = 'elios@wordstep.invalid'
on conflict (id) do update
set username = excluded.username, role = excluded.role;

insert into public.profiles (id, username, role)
select id, 'eva_villega', 'user'
from auth.users
where email = 'eva_villega@wordstep.invalid'
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
| `eva_villega` | `user` |

Si une ligne manque, vérifie que l’adresse correspondante apparaît dans **Authentication → Users**, puis relance le SQL d’attribution des rôles.

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

Depuis la racine du projet, ouvre un terminal et lance :

```powershell
npm start
```

Ouvre ensuite [http://127.0.0.1:3000](http://127.0.0.1:3000) dans ton navigateur.

- Connecte-toi avec `elios` et le mot de passe défini pour `elios@wordstep.invalid` : l’entrée **Manage lessons** te permet d’ajouter, modifier ou supprimer des mots.
- Déconnecte-toi, puis connecte-toi avec `eva_villega` et son mot de passe : elle peut chercher les mots et faire un quiz, sans accès à l’administration.

## En cas de problème

- **« This account isn’t set up for Wordstep »** : le compte Supabase Auth n’a pas de profil Wordstep correspondant. Recommence l’étape 4 et vérifie l’adresse e-mail exacte.
- **« We couldn’t load the lesson shelf »** : vérifie que la migration a été exécutée sans erreur et que l’utilisateur est connecté.
- **Le site ne se connecte pas à Supabase** : vérifie `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `.env`, puis arrête et relance `npm start`.
- **Mot de passe oublié** : modifie ou réinitialise le mot de passe de l’utilisateur dans **Authentication → Users** du tableau de bord Supabase.

## Ce que contient l’application

- Bibliothèque de leçons filtrable, avec définitions, exemples, niveaux, thèmes et prononciation.
- Favoris mémorisés sur l’appareil.
- Quiz à choix multiples avec questions mélangées, explication après chaque réponse et points de pratique.
- Administration des leçons réservée à `elios`, protégée à la fois dans l’interface et par les règles RLS de Supabase.
- Icônes centralisées dans [`public/icons.svg`](./public/icons.svg) et styles inspirés de CodeBook et Codarium dans [`public/styles.css`](./public/styles.css).

Pour mettre le site en ligne, héberge le serveur Node derrière HTTPS et configure `SUPABASE_URL` et `SUPABASE_ANON_KEY` comme variables d’environnement sur l’hébergeur. Ne publie jamais le fichier `.env` ni une clé `service_role`.
